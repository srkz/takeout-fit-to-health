import Foundation

/// Mirrors the JSON contract returned by the Cloudflare Worker's /api/convert
/// endpoint (see worker/src/types.ts). Decoding is permissive about the two
/// sample shapes via a custom `kind` discriminator.

struct NormalizedPayload: Decodable {
    let version: Int
    let source: String
    let summary: [String: Int]
    let skipped: [SkippedNote]
    let samples: [Sample]
}

struct SkippedNote: Decodable {
    let file: String
    let reason: String
}

enum Sample: Decodable {
    case quantity(QuantitySample)
    case workout(WorkoutSample)

    private enum Kind: String, Decodable {
        case quantity, workout
    }

    private enum CodingKeys: String, CodingKey {
        case kind
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .quantity:
            self = .quantity(try QuantitySample(from: decoder))
        case .workout:
            self = .workout(try WorkoutSample(from: decoder))
        }
    }
}

struct QuantitySample: Decodable {
    let type: String   // HKQuantityTypeIdentifier suffix, e.g. "stepCount"
    let unit: String   // HKUnit string, e.g. "count", "count/min", "kg"
    let value: Double
    let start: Date
    let end: Date
    let id: String     // stable HKMetadataKeySyncIdentifier
}

struct WorkoutSample: Decodable {
    let activityType: String // HKWorkoutActivityType case name, e.g. "running"
    let start: Date
    let end: Date
    let totalEnergyKcal: Double?
    let totalDistanceMeters: Double?
    let id: String
}
