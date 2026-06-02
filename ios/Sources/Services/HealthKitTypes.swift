import HealthKit

/// Maps the Worker's string identifiers to concrete HealthKit types.
///
/// Mapping explicitly (rather than string-building HKQuantityTypeIdentifier raw
/// values) keeps us honest: every type we will ever write is enumerated here,
/// which is also exactly the set we request write authorization for. We never
/// request read access — this app only ever adds data.
enum HealthKitTypes {

    /// Quantity type-suffix -> HKQuantityType. The keys match the Worker's
    /// `QuantitySample.type` values (worker/src/convert/mapping.ts).
    static let quantityTypes: [String: HKQuantityType] = {
        let identifiers: [String: HKQuantityTypeIdentifier] = [
            "stepCount": .stepCount,
            "heartRate": .heartRate,
            "bodyMass": .bodyMass,
            "activeEnergyBurned": .activeEnergyBurned,
            "distanceWalkingRunning": .distanceWalkingRunning,
        ]
        var map: [String: HKQuantityType] = [:]
        for (key, id) in identifiers {
            if let type = HKQuantityType.quantityType(forIdentifier: id) {
                map[key] = type
            }
        }
        return map
    }()

    /// HKWorkoutActivityType case name -> HKWorkoutActivityType.
    static func activityType(named name: String) -> HKWorkoutActivityType {
        switch name {
        case "running": return .running
        case "walking": return .walking
        case "cycling": return .cycling
        case "hiking": return .hiking
        case "swimming": return .swimming
        case "rowing": return .rowing
        case "elliptical": return .elliptical
        case "traditionalStrengthTraining": return .traditionalStrengthTraining
        case "yoga": return .yoga
        case "pilates": return .pilates
        case "cardioDance": return .cardioDance
        case "mixedCardio": return .mixedCardio
        case "stairClimbing": return .stairClimbing
        default: return .other
        }
    }

    /// Every type the app may write — the authorization "share" set.
    static var shareTypes: Set<HKSampleType> {
        var types = Set<HKSampleType>(quantityTypes.values)
        types.insert(HKObjectType.workoutType())
        return types
    }
}
