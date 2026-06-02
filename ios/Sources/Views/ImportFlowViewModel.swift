import Foundation
import SwiftUI

/// Drives the end-to-end flow: authorize HealthKit → pick the Takeout zip →
/// upload to the Worker for conversion → review summary → write to HealthKit.
@MainActor
final class ImportFlowViewModel: ObservableObject {

    enum Step: Equatable {
        case needsAuthorization
        case readyToPickFile
        case converting
        case review(NormalizedPayloadSummary)
        case importing(progress: Double)
        case done(saved: Int)
        case failed(message: String)
    }

    /// A lightweight, Equatable view of the payload for the review screen.
    struct NormalizedPayloadSummary: Equatable {
        let totalSamples: Int
        let counts: [(label: String, count: Int)]
        let skippedCount: Int

        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.totalSamples == rhs.totalSamples &&
            lhs.skippedCount == rhs.skippedCount &&
            lhs.counts.map(\.label) == rhs.counts.map(\.label) &&
            lhs.counts.map(\.count) == rhs.counts.map(\.count)
        }
    }

    @Published private(set) var step: Step = .needsAuthorization

    private let importer = HealthKitImporter()
    private let client: BackendClient
    private var payload: NormalizedPayload?

    init(backendURL: URL) {
        self.client = BackendClient(baseURL: backendURL)
    }

    func authorize() async {
        do {
            try await importer.requestAuthorization()
            step = .readyToPickFile
        } catch {
            step = .failed(message: error.localizedDescription)
        }
    }

    /// Called with the security-scoped URL of the picked .zip.
    func convert(zipURL: URL) async {
        step = .converting
        do {
            let data = try readSecurityScoped(zipURL)
            let payload = try await client.convert(zipData: data)
            self.payload = payload
            step = .review(Self.summarize(payload))
        } catch {
            step = .failed(message: error.localizedDescription)
        }
    }

    func startImport() async {
        guard let payload else { return }
        step = .importing(progress: 0)
        do {
            let saved = try await importer.import(payload) { [weak self] progress in
                self?.step = .importing(progress: progress)
            }
            step = .done(saved: saved)
        } catch {
            step = .failed(message: error.localizedDescription)
        }
    }

    func reset() {
        payload = nil
        step = .readyToPickFile
    }

    // MARK: - Helpers

    private func readSecurityScoped(_ url: URL) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        return try Data(contentsOf: url)
    }

    private static func summarize(_ payload: NormalizedPayload) -> NormalizedPayloadSummary {
        let counts = payload.summary
            .sorted { $0.value > $1.value }
            .map { (label: prettyLabel($0.key), count: $0.value) }
        return NormalizedPayloadSummary(
            totalSamples: payload.samples.count,
            counts: counts,
            skippedCount: payload.skipped.count
        )
    }

    private static func prettyLabel(_ key: String) -> String {
        switch key {
        case "stepCount": return "Steps"
        case "heartRate": return "Heart rate"
        case "bodyMass": return "Body weight"
        case "activeEnergyBurned": return "Active energy"
        case "distanceWalkingRunning": return "Walking + running distance"
        default:
            if key.hasPrefix("workout:") {
                return "Workouts: " + key.dropFirst("workout:".count)
            }
            return key
        }
    }
}
