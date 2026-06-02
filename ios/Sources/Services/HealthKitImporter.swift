import HealthKit

/// Writes a NormalizedPayload into HealthKit, taking deliberate care to avoid
/// harming the user's Health store:
///
///  * **Least privilege** — requests *share* (write) authorization only, for
///    exactly the core types we map. We never request read access.
///  * **Idempotent** — every sample carries HKMetadataKeySyncIdentifier (the
///    Worker's stable id) plus HKMetadataKeySyncVersion. Re-importing the same
///    export updates rather than duplicates, the mechanism Apple provides for
///    exactly this "external system of record" use case.
///  * **Attributable** — everything is written under this app as its source, so
///    the user can review and delete it in one place via Health ▸ Profile ▸
///    Apps ▸ this app, or Health ▸ Browse ▸ <type> ▸ Show All Data.
///  * **Non-destructive** — the importer only ever calls `save`. It never
///    deletes or mutates pre-existing data.
@MainActor
final class HealthKitImporter: ObservableObject {

    enum ImporterError: LocalizedError {
        case healthDataUnavailable
        case authorizationDenied

        var errorDescription: String? {
            switch self {
            case .healthDataUnavailable: return "Health data is not available on this device."
            case .authorizationDenied: return "Permission to write Health data was not granted."
            }
        }
    }

    private let store = HKHealthStore()

    /// HealthKit recommends batching saves; very large histories otherwise spike
    /// memory and time out.
    private let batchSize = 2_000

    /// Presents the system authorization sheet for the share types.
    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw ImporterError.healthDataUnavailable
        }
        try await store.requestAuthorization(toShare: HealthKitTypes.shareTypes, read: [])
    }

    /// Imports the payload, reporting progress (0...1) on the main actor.
    /// Returns the number of objects saved.
    func `import`(
        _ payload: NormalizedPayload,
        progress: @MainActor (Double) -> Void
    ) async throws -> Int {
        var quantitySamples: [HKQuantitySample] = []
        var workouts: [WorkoutSample] = []

        for sample in payload.samples {
            switch sample {
            case let .quantity(q):
                if let built = buildQuantitySample(q) { quantitySamples.append(built) }
            case let .workout(w):
                workouts.append(w)
            }
        }

        let total = max(quantitySamples.count + workouts.count, 1)
        var done = 0
        progress(0)

        // Save quantity samples in batches.
        for batch in quantitySamples.chunked(into: batchSize) {
            try await store.save(batch)
            done += batch.count
            progress(Double(done) / Double(total))
        }

        // Workouts are built one at a time via HKWorkoutBuilder (the modern,
        // non-deprecated path), associating energy/distance with each workout.
        for workout in workouts {
            try await saveWorkout(workout)
            done += 1
            progress(Double(done) / Double(total))
        }

        return done
    }

    // MARK: - Builders

    private func metadata(id: String) -> [String: Any] {
        [
            HKMetadataKeySyncIdentifier: id,
            HKMetadataKeySyncVersion: 1,
            HKMetadataKeyWasUserEntered: false,
        ]
    }

    private func buildQuantitySample(_ q: QuantitySample) -> HKQuantitySample? {
        guard let type = HealthKitTypes.quantityTypes[q.type] else { return nil }
        let quantity = HKQuantity(unit: HKUnit(from: q.unit), doubleValue: q.value)
        return HKQuantitySample(
            type: type,
            quantity: quantity,
            start: q.start,
            end: q.end,
            metadata: metadata(id: q.id)
        )
    }

    private func saveWorkout(_ w: WorkoutSample) async throws {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = HealthKitTypes.activityType(named: w.activityType)

        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: nil)
        try await builder.beginCollection(at: w.start)

        var associated: [HKSample] = []
        if let kcal = w.totalEnergyKcal, kcal > 0,
           let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            associated.append(HKQuantitySample(
                type: energyType,
                quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                start: w.start, end: w.end,
                metadata: metadata(id: w.id + ":energy")
            ))
        }
        if let meters = w.totalDistanceMeters, meters > 0,
           let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning) {
            associated.append(HKQuantitySample(
                type: distanceType,
                quantity: HKQuantity(unit: .meter(), doubleValue: meters),
                start: w.start, end: w.end,
                metadata: metadata(id: w.id + ":distance")
            ))
        }
        if !associated.isEmpty {
            try await builder.addSamples(associated)
        }

        try await builder.addMetadata(metadata(id: w.id))
        try await builder.endCollection(at: w.end)
        _ = try await builder.finishWorkout()
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0 else { return [self] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}
