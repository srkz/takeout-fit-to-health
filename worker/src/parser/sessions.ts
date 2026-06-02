/**
 * Parser for Google Takeout "Fit/All Sessions/*.json" files.
 *
 * Each file is a single workout session, e.g.:
 *
 *   {
 *     "fitnessActivity": "running",
 *     "startTime": "2021-05-01T08:00:00.000+02:00",
 *     "endTime":   "2021-05-01T08:30:00.000+02:00",
 *     "aggregate": [
 *       { "metricName": "com.google.calories.expended", "floatValue": 200.5 },
 *       { "metricName": "com.google.distance.delta",     "floatValue": 3000 }
 *     ]
 *   }
 */

import { mapActivityType } from "../convert/mapping.js";
import { makeWorkoutId } from "../convert/id.js";
import type { WorkoutSample, SkippedNote } from "../types.js";

interface RawAggregate {
  metricName?: unknown;
  floatValue?: unknown;
  intValue?: unknown;
}

interface RawSession {
  fitnessActivity?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  aggregate?: RawAggregate[];
}

function isoOrUndefined(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function aggregateValue(aggregate: RawAggregate[] | undefined, metric: string): number | undefined {
  if (!Array.isArray(aggregate)) return undefined;
  const entry = aggregate.find((a) => a.metricName === metric);
  if (!entry) return undefined;
  const raw = entry.floatValue ?? entry.intValue;
  const n = typeof raw === "string" ? Number(raw) : (raw as number);
  return Number.isFinite(n) ? n : undefined;
}

export interface SessionResult {
  workout?: WorkoutSample;
  skipped: SkippedNote[];
}

/** Parses one session file into a workout sample. Never throws. */
export function parseSessionFile(fileName: string, json: string): SessionResult {
  let parsed: RawSession;
  try {
    parsed = JSON.parse(json) as RawSession;
  } catch {
    return { skipped: [{ file: fileName, reason: "invalid JSON" }] };
  }

  const start = isoOrUndefined(parsed.startTime);
  const end = isoOrUndefined(parsed.endTime);
  if (!start || !end) {
    return { skipped: [{ file: fileName, reason: "missing or invalid start/end time" }] };
  }
  if (Date.parse(end) <= Date.parse(start)) {
    return { skipped: [{ file: fileName, reason: "non-positive duration" }] };
  }

  const activityType = mapActivityType(
    typeof parsed.fitnessActivity === "string" ? parsed.fitnessActivity : undefined,
  );

  const totalEnergyKcal = aggregateValue(parsed.aggregate, "com.google.calories.expended");
  const totalDistanceMeters = aggregateValue(parsed.aggregate, "com.google.distance.delta");

  const workout: WorkoutSample = {
    kind: "workout",
    activityType,
    start,
    end,
    id: makeWorkoutId(activityType, start, end),
  };
  if (totalEnergyKcal !== undefined && totalEnergyKcal > 0) {
    workout.totalEnergyKcal = totalEnergyKcal;
  }
  if (totalDistanceMeters !== undefined && totalDistanceMeters > 0) {
    workout.totalDistanceMeters = totalDistanceMeters;
  }

  return { workout, skipped: [] };
}
