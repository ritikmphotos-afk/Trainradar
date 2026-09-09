/* ==================================================================
   get-live-trains.js
   ------------------------------------------------------------------
   Netlify Function — proxies a real live-train data source so the
   API key never reaches the browser, and caches the response so
   you don't burn through a limited monthly request quota.

   SETUP:
   1. In Netlify dashboard -> Site settings -> Environment variables,
      add: RAILRADAR_API_KEY = rr_live_xxxxxxxxxxxx
   2. Deploy this file at netlify/functions/get-live-trains.js
      (Netlify auto-detects the /netlify/functions folder).
   3. Frontend calls: fetch('/.netlify/functions/get-live-trains')

   CACHING:
   Netlify Functions are stateless between cold starts, so this
   simple in-memory cache only helps within a warm instance
   (typically a few minutes to ~15 min of reused warmth). That's
   still useful: many browser tabs hitting the function inside that
   window share ONE upstream call instead of one each.
   For a stronger guarantee (e.g. hard cap of 1 upstream call every
   5 minutes no matter what), swap this for Netlify Blobs or a tiny
   external KV store (Upstash Redis has a free tier) — ask if you
   want that version.
   ================================================================== */

let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

exports.handler = async function (event, context) {
  const now = Date.now();

  // Serve from warm cache if still fresh
  if (cache.data && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
      body: JSON.stringify(cache.data),
    };
  }

  const apiKey = process.env.RAILRADAR_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "RAILRADAR_API_KEY is not set in Netlify environment variables." }),
    };
  }

  try {
    const upstream = await fetch("https://api.railradar.in/v1/legacy/trains/live-map", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!upstream.ok) {
      return {
        statusCode: upstream.status,
        body: JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      };
    }

    const raw = await upstream.json();

    // Bearing isn't provided directly by RailRadar's live-map feed,
    // so it's derived from the current -> next station coordinates.
    function bearingDeg(lat1, lng1, lat2, lng2) {
      const toRad = (d) => (d * Math.PI) / 180;
      const toDeg = (r) => (r * 180) / Math.PI;
      const dLng = toRad(lng2 - lng1);
      const y = Math.sin(dLng) * Math.cos(toRad(lat2));
      const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    // Real RailRadar live-map response gives current/next station
    // hops (with coordinates + schedule minutes), NOT a full
    // from -> to route or a ready-made delay figure. We normalize
    // to exactly that shape here rather than inventing fields the
    // upstream feed doesn't actually provide.
    const normalized = {
      trains: (raw.data || []).map((t) => ({
        number: t.train_number,
        name: t.train_name,
        type: t.type,
        currentCode: t.current_station,
        currentName: t.current_station_name,
        nextCode: t.next_station,
        nextName: t.next_station_name,
        lat: t.current_lat,
        lng: t.current_lng,
        nextLat: t.next_lat,
        nextLng: t.next_lng,
        bearing: bearingDeg(t.current_lat, t.current_lng, t.next_lat, t.next_lng),
        nextArrivalMinutes: t.next_arrival_minutes, // time-of-day, 0-1439
        distanceKm: t.curr_distance,
        dayOfJourney: t.current_day,
      })),
    };

    cache = { data: normalized, fetchedAt: now };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
      body: JSON.stringify(normalized),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
