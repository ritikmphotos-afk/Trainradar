# India Train Radar — Demo

A working front-end skeleton of a RailRadar-style live train map: India map,
rotated arrow markers per train, click a marker OR its route line to open a
bottom sheet with train number, name, from → to, current station, and delay.

## What's real vs mock right now
- **Real & working today:** the map, marker rendering + rotation, click
  handling on markers and route lines, the bottom sheet UI, search-by-number/name,
  and the exact data shape (matches RailRadar's real `/v1/legacy/trains/live-map`
  response field names — confirmed from their docs).
- **Mock:** `MOCK_RAW_TRAINS` array inside `index.html` — 14 sample trains with
  made-up (but geographically plausible) positions, in the same raw shape the
  real API returns. No live data source is wired in yet.

## Important: what the real feed does NOT give you
RailRadar's bulk live-map endpoint returns, per train: current station,
next station (both with coordinates), distance covered, and the next
station's scheduled arrival time-of-day. It does **not** include:
- The train's full origin/destination (only the current hop)
- A ready-made delay-in-minutes figure
- Full route geometry (just a straight line to the next station)

The UI here reflects that honestly — it shows "current → next station",
distance covered, and next-station ETA, not a fabricated full journey bar
or delay badge. If you want delay and full origin/destination per train,
you'd call the separate `/v1/trains/{number}/live` endpoint per train —
which costs one request per train, so only do it for a train the user has
selected, not for all trains at once.

## Files
- `index.html` — the whole app. Inline CSS + JS, no external stylesheet,
  no build step. Drop it on Netlify as-is and it works with mock data.
- `netlify/functions/get-live-trains.js` — server-side proxy template.
  Keeps your API key off the browser and caches responses so you don't burn
  through a limited request quota. Currently points at RailRadar's
  `legacy/trains/live-map` endpoint as a placeholder — adjust the URL and
  the field-mapping inside `normalized` once you pick your real data source
  and see its actual response shape.

## Going live with real data
1. Sign up for a live-train data source (e.g. railradar.in/developers) and
   get an API key.
2. In Netlify: Site settings → Environment variables → add
   `RAILRADAR_API_KEY`.
3. In `index.html`, uncomment the `loadTrains()` block at the bottom of the
   script and remove/replace the `renderTrains(MOCK_TRAINS)` call.
4. Test on `netlify dev` locally before deploying, since Netlify Functions
   don't run on a plain static file server.

## Known limitations of this MVP
- Routes are drawn as a straight line (from → midpoint → to), not real
  track geometry. Swap in GeoJSON from your data source's route endpoint
  for accurate curved lines.
- No auto-refresh loop is active yet (commented out) — enable it once a
  real backend is wired up, and keep the interval long (5+ minutes) to
  protect a limited free-tier quota.
- Only ~14 trains are shown. Once wired to a real bulk endpoint, all
  markers will render from that response with no code changes needed to
  the rendering logic itself.
