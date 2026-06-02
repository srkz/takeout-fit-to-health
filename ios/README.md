# iOS app — TakeoutFitToHealth

A SwiftUI + HealthKit app that imports a Google Fit (Takeout) export into Apple
Health. This is the product; the Cloudflare Worker in `../worker` is just its
backend.

## Requirements

- macOS with **Xcode 15+**
- An **Apple Developer account** (HealthKit entitlements require a provisioning
  profile; free personal teams work for on-device testing)
- A **real iPhone** — HealthKit authorization and writes can't be meaningfully
  exercised in the simulator
- [`xcodegen`](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

## Generate the Xcode project

The `.xcodeproj` is generated from `project.yml` (and is git-ignored) so the
repo stays clean:

```sh
cd ios
xcodegen generate
open TakeoutFitToHealth.xcodeproj
```

If you'd rather not use XcodeGen, create a new iOS App target manually and:

- add everything under `Sources/` to the target,
- set the Info.plist to `Resources/Info.plist`,
- set **Code Signing Entitlements** to `Resources/TakeoutFitToHealth.entitlements`,
- enable the **HealthKit** capability,
- link `HealthKit.framework`.

## Configure the backend URL

Set `BACKEND_URL` to your deployed Worker, e.g.
`https://takeout-fit-to-health.<account>.workers.dev`:

- in `project.yml` under `settings.base.BACKEND_URL`, **or**
- in the target's Build Settings (it flows into Info.plist via `$(BACKEND_URL)`).

If left blank, the app falls back to `http://127.0.0.1:8787` for use with
`wrangler dev` (allowed by the local-networking ATS exception in Info.plist).

## Run

1. Select your iPhone, set your signing team, build & run.
2. Tap **Allow Health Access** and approve the write permissions.
3. Tap **Choose Takeout .zip** and select the Fit export from Files/iCloud.
4. Review the summary, then **Import**.

To remove everything later: **Health ▸ Profile ▸ Apps ▸ TakeoutFitToHealth ▸
Delete All Data**, or per-type via **Browse ▸ <type> ▸ Show All Data**.

## Source layout

```
Sources/
  TakeoutFitToHealthApp.swift     @main entry; resolves BACKEND_URL
  Models/NormalizedPayload.swift  Codable mirror of the Worker payload
  Services/
    BackendClient.swift           uploads the .zip, decodes the payload
    HealthKitTypes.swift          string identifiers → HealthKit types/units
    HealthKitImporter.swift       authorization + batched, idempotent writes
  Views/
    ImportFlowViewModel.swift     authorize → pick → convert → review → import
    ContentView.swift             SwiftUI UI for the flow
Resources/
  Info.plist                      usage strings, BACKEND_URL, ATS
  TakeoutFitToHealth.entitlements HealthKit capability
```
