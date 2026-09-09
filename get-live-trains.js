/* ==================================================================
   api/get-live-trains.js
   ------------------------------------------------------------------
   VERCEL serverless function (same job as the Netlify version, just
   Vercel's handler signature: module.exports = (req, res) => {...}
   instead of exports.handler).

   SETUP ON VERCEL:
   1. This file must live at /api/get-live-trains.js in your project
      root (sibling to index.html, NOT inside netlify/functions).
   2. In Vercel dashboard -> your project -> Settings -> Environment
      Variables, add: RAILRADAR_API_KEY = rr_live_xxxxxxxxxxxx
      (apply it to Production, Preview, and Development).
   3. Redeploy after adding the env variable — Vercel only injects it
      into NEW deployments, not ones already running.
   4. Frontend calls: fetch('/api/get-live-trains')
      (Vercel auto-routes anything in /api/ — no extra config needed).
   ================================================================== */

let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

module.exports = async function handler(req, res) {
  const now = Date.now();

  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cache.data);
  }

  const apiKey = process.env.RAILRADAR_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "RAILRADAR_API_KEY is not set in Vercel environment variables.",
    });
  }

  try {
    const upstream = await fetch("https://api.railradar.in/v1/legacy/trains/live-map", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error: ${upstream.status}` });
    }

    const raw = await upstream.json();

    // Same normalization as the Netlify version: RailRadar's real feed
    // gives current -> next station hops, not a full route or delay.
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
        nextArrivalMinutes: t.next_arrival_minutes,
        distanceKm: t.curr_distance,
        dayOfJourney: t.current_day,
      })),
    };

    cache = { data: normalized, fetchedAt: now };

    res.setHeader("X-Cache", "MISS");
    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
