# HealthKit notes & "do no harm" decisions

Writing into someone's Health store is high-trust. These are the rules the iOS
importer follows and why.

## No web/cloud access — it must be a native app

HealthKit is a local data store on the device. There is **no REST API, no web
SDK, and no OAuth**. You cannot read or write Health data from a server. The
app must run on the user's iPhone and request permission via the system sheet.
This is the single reason the product is a native app rather than a website.
(Apple HealthKit docs: https://developer.apple.com/documentation/healthkit)

## Least privilege

We request **write (share) authorization only**, for **only** the five quantity
types and the workout type we actually map (`HealthKitTypes.shareTypes`). We
pass `read: []`. The app has no reason to read the user's data and never asks
to.

One consequence: because we don't read, we can't query for pre-existing
duplicates. We rely on sync identifiers instead (below).

## Idempotent imports via sync identifiers

Every object is written with:

```swift
[
  HKMetadataKeySyncIdentifier: <stable id from the Worker>,
  HKMetadataKeySyncVersion: 1,
  HKMetadataKeyWasUserEntered: false,
]
```

`HKMetadataKeySyncIdentifier` + `HKMetadataKeySyncVersion` is Apple's mechanism
for apps that mirror an **external system of record**: saving an object with an
identifier that already exists (and an equal-or-higher version) **updates** the
existing sample instead of inserting a duplicate. So a user can safely re-run
the import — e.g. after a newer Takeout export — without piling up duplicates.

`HKMetadataKeyWasUserEntered: false` correctly marks the data as
device/import-sourced rather than hand-typed.

## Attribution and reversibility

All data is written under this app, so it shows up as a single **source** in the
Health app. The user can review or wipe everything via **Health ▸ Profile ▸ Apps
▸ TakeoutFitToHealth ▸ Delete All Data**, or per type under **Browse ▸ <type> ▸
Show All Data**. The importer itself is **non-destructive** — it only ever calls
`save`, never `delete`.

## Workouts

Historical workouts are created with **`HKWorkoutBuilder`** (the modern,
non-deprecated API) rather than the deprecated `HKWorkout` initializer:

1. `beginCollection(at: start)`
2. add the total energy / distance as associated `HKQuantitySample`s spanning the
   workout (so the totals aggregate correctly and the samples belong to the
   workout rather than floating free)
3. `addMetadata` with the sync identifier
4. `endCollection(at: end)` then `finishWorkout()`

## Units

The Worker emits `HKUnit`-compatible unit strings (`count`, `count/min`, `kcal`,
`m`, `kg`), which the app passes straight to `HKUnit(from:)`. Keeping unit choice
on the Worker side means it's covered by the Worker's unit tests.

## Batching

Quantity samples are saved in batches (default 2,000) to keep memory bounded and
avoid timeouts on multi-year histories.

## Simulator caveat

HealthKit authorization and writes can't be meaningfully exercised in the
simulator, and the entitlement needs a provisioning profile. Test on a real
device.
