/**
 * Google Fit -> HealthKit type/unit mapping.
 *
 * Scope (per product decision): "core metrics first" — steps, heart rate,
 * body weight, active energy, distance, plus workouts/sessions. Anything not
 * listed here is intentionally skipped (and reported in `skipped`) rather than
 * guessed at, because writing the wrong unit into someone's Health store is
 * exactly the kind of "harm" we were asked to avoid.
 */

/** How to pull the numeric value out of a Google Fit `value` object. */
export type ValueKind = "intVal" | "fpVal";

export interface QuantityMapping {
  /** HKQuantityTypeIdentifier suffix. */
  hkType: string;
  /** HKUnit string the iOS app feeds to HKUnit(from:). */
  hkUnit: string;
  /** Which field of the Google Fit value object holds the number. */
  valueKind: ValueKind;
  /** Optional scale applied to the raw value (e.g. unit conversion). */
  scale?: number;
}

/**
 * Keyed by Google Fit dataType name (the `dataTypeName` on a data point, or
 * the type embedded in a "Data Source" id). Only core metrics are mapped.
 */
export const QUANTITY_MAPPINGS: Record<string, QuantityMapping> = {
  "com.google.step_count.delta": {
    hkType: "stepCount",
    hkUnit: "count",
    valueKind: "intVal",
  },
  "com.google.heart_rate.bpm": {
    hkType: "heartRate",
    hkUnit: "count/min",
    valueKind: "fpVal",
  },
  "com.google.weight": {
    hkType: "bodyMass",
    hkUnit: "kg",
    valueKind: "fpVal",
  },
  // Google Fit reports calories in kcal.
  "com.google.calories.expended": {
    hkType: "activeEnergyBurned",
    hkUnit: "kcal",
    valueKind: "fpVal",
  },
  // Google Fit distance deltas are in meters.
  "com.google.distance.delta": {
    hkType: "distanceWalkingRunning",
    hkUnit: "m",
    valueKind: "fpVal",
  },
};

/**
 * Google Fit fitnessActivity string -> HKWorkoutActivityType case name.
 * Unknown activities fall back to "other", which HealthKit accepts.
 */
const ACTIVITY_MAPPINGS: Record<string, string> = {
  running: "running",
  jogging: "running",
  walking: "walking",
  hiking: "hiking",
  biking: "cycling",
  "biking.mountain": "cycling",
  "biking.road": "cycling",
  "biking.stationary": "cycling",
  cycling: "cycling",
  swimming: "swimming",
  "swimming.pool": "swimming",
  "swimming.open_water": "swimming",
  rowing: "rowing",
  "rowing.machine": "rowing",
  elliptical: "elliptical",
  strength_training: "traditionalStrengthTraining",
  weightlifting: "traditionalStrengthTraining",
  yoga: "yoga",
  pilates: "pilates",
  dancing: "cardioDance",
  aerobics: "mixedCardio",
  treadmill: "running",
  "running.treadmill": "running",
  stair_climbing: "stairClimbing",
  "stair_climbing.machine": "stairClimbing",
};

/** Maps a Google Fit activity string to an HKWorkoutActivityType case name. */
export function mapActivityType(fitActivity: string | undefined): string {
  if (!fitActivity) return "other";
  const key = fitActivity.toLowerCase().trim();
  return ACTIVITY_MAPPINGS[key] ?? "other";
}

/**
 * Best-effort extraction of a Google Fit data type name from a "Data Source"
 * id string such as "derived:com.google.step_count.delta:com.google...".
 */
export function dataTypeFromSourceId(sourceId: string): string | undefined {
  const match = sourceId.match(/com\.google\.[a-z_.]+/);
  return match?.[0];
}
