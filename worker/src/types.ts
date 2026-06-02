/**
 * Shared types for the Google Fit -> HealthKit conversion pipeline.
 *
 * The Worker's job is to turn the messy, multi-format Google Takeout "Fit"
 * export into a single, clean, well-typed payload that the iOS companion app
 * can hand to HealthKit with minimal further interpretation. Keeping the
 * HealthKit-specific knowledge (identifiers, units) here means the iOS app
 * stays thin and the mapping is unit-testable in plain Node.
 */

/** Schema version of the normalized payload contract with the iOS app. */
export const PAYLOAD_VERSION = 1;

/**
 * A HealthKit quantity sample. `type` is the bare HKQuantityTypeIdentifier
 * suffix (e.g. "stepCount" -> HKQuantityTypeIdentifierStepCount). `unit` is a
 * string the iOS app passes straight to `HKUnit(from:)`.
 */
export interface QuantitySample {
  kind: "quantity";
  /** HKQuantityTypeIdentifier suffix, e.g. "stepCount", "heartRate". */
  type: string;
  /** HKUnit string, e.g. "count", "count/min", "kcal", "m", "kg". */
  unit: string;
  value: number;
  /** ISO-8601 UTC. */
  start: string;
  /** ISO-8601 UTC. For instantaneous samples, equals `start`. */
  end: string;
  /**
   * Stable identifier used as HKMetadataKeySyncIdentifier so re-imports
   * upsert rather than duplicate. Derived deterministically from the source
   * data point (see makeSampleId).
   */
  id: string;
}

/** A HealthKit workout, mapped from a Google Fit session or TCX activity. */
export interface WorkoutSample {
  kind: "workout";
  /** Bare HKWorkoutActivityType case name, e.g. "running", "walking". */
  activityType: string;
  start: string;
  end: string;
  /** Total active energy in kilocalories, if known. */
  totalEnergyKcal?: number;
  /** Total distance in meters, if known. */
  totalDistanceMeters?: number;
  id: string;
}

export type Sample = QuantitySample | WorkoutSample;

/** The payload returned to the iOS app. */
export interface NormalizedPayload {
  version: number;
  source: string;
  /** Per-type counts, handy for the UI summary screen. */
  summary: Record<string, number>;
  /** Anything we recognized the folder/file for but could not map. */
  skipped: SkippedNote[];
  samples: Sample[];
}

export interface SkippedNote {
  file: string;
  reason: string;
}

/** Source name stamped on every sample so the user can identify/delete later. */
export const SOURCE_NAME = "Google Fit (Takeout)";
