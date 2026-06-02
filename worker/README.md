# Worker — Google Fit → HealthKit conversion backend

Stateless Cloudflare Worker. Receives a Google Takeout `.zip`, parses the Fit
export, and returns a normalized, HealthKit-ready JSON payload. Stores nothing.

## Endpoints

- `GET /` — health/info
- `POST /api/convert` — body is the raw `.zip`; returns a `NormalizedPayload`
  (see `src/types.ts` and `../docs/ARCHITECTURE.md`)

## Develop

```sh
npm install
npm test         # vitest unit tests (parsers, mapping, dedup, end-to-end zip)
npm run typecheck
npm run dev      # wrangler dev on http://127.0.0.1:8787
```

## Deploy

```sh
npm run deploy   # wrangler deploy (requires `wrangler login`)
```

Config lives in `wrangler.toml`. `MAX_UPLOAD_BYTES` caps upload size (default
100 MB).

## Layout

```
src/
  index.ts              HTTP router
  parser/zip.ts         fflate unzip
  parser/allData.ts     All Data/*.json  → quantity samples
  parser/sessions.ts    All Sessions/*.json → workouts
  convert/mapping.ts    Google Fit → HealthKit type/unit mapping
  convert/id.ts         deterministic sync identifiers
  convert/normalize.ts  routing + dedup + payload assembly
test/                   vitest suites
```
