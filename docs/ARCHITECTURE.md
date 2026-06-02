# Architecture

## The constraint that drives everything

Apple HealthKit is a **device-local** framework. There is **no server-side or
web API** to read or write a user's Health data, and **no OAuth/web
authorization** flow. Data can only be written by a **native iOS app** after the
user grants permission on-device. Any design that imagines "authorizing Apple
Health from a website" is impossible.

Consequently this project is split in two:

1. **iOS app** — the only component that can touch HealthKit. It owns
   authorization, file selection, the review UI, and the actual writes.
2. **Cloudflare Worker** — a stateless conversion service. It turns the messy
   Takeout export into a clean payload so the iOS app stays simple.

Putting the parsing on Cloudflare (rather than in Swift) means the format-heavy,
fiddly logic is unit-testable in plain Node and iterable without an Xcode build.

## Data flow

```
Google Takeout .zip
        │  (user picks it in the iOS app)
        ▼
iOS app ──POST raw bytes──► Worker /api/convert
        ◄──── NormalizedPayload (JSON) ────
        │
        ▼
HKHealthStore (batched HKQuantitySample saves + HKWorkoutBuilder)
```

### The contract

The Worker → app contract is `NormalizedPayload` (defined in
`worker/src/types.ts` and mirrored in `ios/Sources/Models/NormalizedPayload.swift`):

```jsonc
{
  "version": 1,
  "source": "Google Fit (Takeout)",
  "summary": { "stepCount": 12345, "workout:running": 42 },
  "skipped": [{ "file": "...", "reason": "..." }],
  "samples": [
    { "kind": "quantity", "type": "stepCount", "unit": "count",
      "value": 100, "start": "…Z", "end": "…Z", "id": "<stable hash>" },
    { "kind": "workout", "activityType": "running",
      "start": "…Z", "end": "…Z", "totalEnergyKcal": 250, "id": "<stable hash>" }
  ]
}
```

`id` is a deterministic FNV-1a hash of the sample's identifying fields. The app
writes it as `HKMetadataKeySyncIdentifier`, which is HealthKit's mechanism for
"this app is a mirror of an external system of record": re-importing upserts
instead of duplicating.

## Worker internals (`worker/src`)

```
index.ts              HTTP router; POST /api/convert reads the zip, returns JSON
parser/zip.ts         fflate unzip (pure JS, runs in the Workers runtime)
parser/allData.ts     "All Data/*.json" → quantity samples
parser/sessions.ts    "All Sessions/*.json" → workouts
convert/mapping.ts    Google Fit data-type/activity → HealthKit type/unit
convert/id.ts         deterministic sync identifiers
convert/normalize.ts  routes entries by folder, dedups by id, builds payload
```

### Why we skip CSV and TCX

A Fit export also contains `Daily activity metrics/*.csv` (day-level rollups) and
`Activities/*.tcx` (GPS tracks). We **deliberately skip both** in v1:

- The daily CSVs are aggregates of numbers already present at full resolution in
  `All Data`. Importing both would **double-count** steps/distance/energy.
- TCX adds GPS route detail to a workout that the session JSON already captures.

They're reported in `skipped[]` so the behavior is visible, not silent.

## Limits & future work

- **Upload size / memory.** The Worker unzips into memory and is capped at
  100 MB (`MAX_UPLOAD_BYTES`). Very large multi-year histories could exceed
  Worker memory/CPU limits. Future path: upload to **R2**, stream-extract, and
  return the payload in **paginated chunks** the app imports incrementally.
- **More data types.** Sleep (`com.google.sleep.segment`), SpO₂, cycling
  cadence/speed, resting/min/max HR, flights climbed, etc. Each needs a verified
  unit mapping before being added to `QUANTITY_MAPPINGS`.
- **TCX route import.** Parse TCX and attach `HKWorkoutRoute` to workouts.
- **Resumable imports.** Persist progress so an interrupted large import can
  continue without rescanning.
```
