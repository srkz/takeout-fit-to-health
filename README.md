# Takeout Fit → Apple Health

Import your **Google Fit** history (exported via **Google Takeout**) into
**Apple Health**.

## Why it's built this way

Apple Health (HealthKit) is a **device-local data store**. It has **no cloud
API and no web authorization flow** — nothing running on a server can write into
a user's Health data. The only way to add data is from a **native iOS app** that
the user grants HealthKit permission to on-device.

That hard constraint shapes the architecture:

| Part | Where it runs | Job |
| --- | --- | --- |
| **iOS app** (`ios/`) | iPhone | The whole product the user touches. Authorizes HealthKit, lets the user pick the Takeout `.zip`, shows a summary, and writes the data into Apple Health. |
| **Cloudflare Worker** (`worker/`) | Cloudflare edge | Stateless backend. Receives the `.zip`, parses Google Fit's mixed JSON/CSV/TCX export, and returns a clean, normalized, HealthKit-ready payload. Stores nothing. |

The Worker exists so the gnarly, format-specific parsing lives in one place that
is easy to unit-test in plain Node, keeping the iOS app thin and focused on the
one thing only it can do: talk to HealthKit.

```
┌────────────┐   POST .zip    ┌──────────────────┐   normalized JSON   ┌────────────┐
│  iOS app   │ ─────────────► │ Cloudflare Worker│ ──────────────────► │  iOS app   │
│ (file pick)│                │  (parse+convert) │                     │ → HealthKit│
└────────────┘                └──────────────────┘                     └────────────┘
```

## Scope (v1)

Core metrics, mapped conservatively:

| Google Fit | Apple Health | Unit |
| --- | --- | --- |
| `com.google.step_count.delta` | Step Count | count |
| `com.google.heart_rate.bpm` | Heart Rate | count/min |
| `com.google.weight` | Body Mass | kg |
| `com.google.calories.expended` | Active Energy | kcal |
| `com.google.distance.delta` | Walking + Running Distance | m |
| Sessions (`All Sessions/*.json`) | Workouts | — |

Sleep, SpO₂, cycling cadence, etc. are intentionally deferred — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Safety / "do no harm"

- The app requests **write-only** authorization for **only** the types above.
  It never requests read access.
- Every sample carries a stable `HKMetadataKeySyncIdentifier`, so re-importing
  the same export **updates** rather than **duplicates**.
- Daily-summary CSVs and TCX tracks are **skipped** to avoid double-counting
  data that's already present at full resolution in `All Data`.
- The Worker is stateless and persists nothing; your health data never lives on
  our servers.
- Everything is attributed to this app as its source, so you can review or
  delete all of it in one place via **Health ▸ Profile ▸ Apps**.

## Getting started

1. **Export** your data: [Google Takeout](https://takeout.google.com) → select
   **Fit** → JSON → download the `.zip`.
2. **Deploy the Worker** — see [`worker/README`](worker/) /
   [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): `cd worker && npm install && npm run deploy`.
3. **Build the iOS app** — see [`ios/README.md`](ios/README.md). Point it at
   your Worker URL, run on a real iPhone, grant Health access, pick the `.zip`,
   and import.

## Repository layout

```
worker/   Cloudflare Worker: zip parsing + Google Fit → HealthKit conversion (tested)
ios/      Native SwiftUI + HealthKit app (the product)
docs/     Architecture, Google Fit format notes, HealthKit notes
```

## Status

- **Worker**: implemented and unit-tested (`cd worker && npm test`).
- **iOS app**: implemented; requires Xcode + an Apple Developer account to build
  and run on device (HealthKit does not work in a way you can fully exercise in
  the simulator, and entitlements require a provisioning profile).
