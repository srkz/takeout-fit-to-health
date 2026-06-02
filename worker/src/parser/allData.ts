/**
 * Parser for Google Takeout "Fit/All Data/*.json" files.
 *
 * These hold the rich time-series. A file looks roughly like:
 *
 *   {
 *     "Data Source": "raw:com.google.step_count.delta:...",
 *     "Data Points": [
 *       {
 *         "fitValue": [ { "value": { "intVal": 123 } } ],
 *         "startTimeNanos": "1619999940000000000",
 *         "endTimeNanos":   "1620000000000000000",
 *         "dataTypeName":   "com.google.step_count.delta"
 *       },
 *       ...
 *     ]
 *   }
 *
 * Numeric fields are sometimes strings, sometimes numbers, depending on the
 * export vintage, so we coerce defensively.
 */

import { QUANTITY_MAPPINGS, dataTypeFromSourceId } from "../convert/mapping.js";
import { makeQuantityId } from "../convert/id.js";
import type { QuantitySample, SkippedNote } from "../types.js";

interface RawDataPoint {
  fitValue?: Array<{ value?: { intVal?: unknown; fpVal?: unknown } }>;
  startTimeNanos?: unknown;
  endTimeNanos?: unknown;
  dataTypeName?: unknown;
}

interface RawAllDataFile {
  "Data Source"?: unknown;
  "Data Points"?: RawDataPoint[];
}

/** Nanoseconds-since-epoch (string or number) -> ISO-8601 UTC. */
function nanosToIso(nanos: unknown): string | undefined {
  const n = typeof nanos === "string" ? Number(nanos) : (nanos as number);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = Math.round(n / 1e6);
  return new Date(ms).toISOString();
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export interface AllDataResult {
  samples: QuantitySample[];
  skipped: SkippedNote[];
}

/**
 * Parses one "All Data" JSON file into quantity samples. `fileName` is used
 * only for skip reporting. Returns an empty result (never throws) on malformed
 * input so one bad file can't abort the whole import.
 */
export function parseAllDataFile(fileName: string, json: string): AllDataResult {
  const samples: QuantitySample[] = [];
  const skipped: SkippedNote[] = [];

  let parsed: RawAllDataFile;
  try {
    parsed = JSON.parse(json) as RawAllDataFile;
  } catch {
    return { samples, skipped: [{ file: fileName, reason: "invalid JSON" }] };
  }

  const points = parsed["Data Points"];
  if (!Array.isArray(points) || points.length === 0) {
    return { samples, skipped };
  }

  // Resolve the data type once from the Data Source, falling back per-point.
  const sourceId =
    typeof parsed["Data Source"] === "string"
      ? (parsed["Data Source"] as string)
      : "";
  const sourceType = dataTypeFromSourceId(sourceId);

  // If we recognize neither the source nor (later) any point type, note it.
  let mappedAny = false;

  for (const point of points) {
    const dataType =
      (typeof point.dataTypeName === "string" ? point.dataTypeName : undefined) ??
      sourceType;
    if (!dataType) continue;

    const mapping = QUANTITY_MAPPINGS[dataType];
    if (!mapping) continue;

    const start = nanosToIso(point.startTimeNanos);
    const end = nanosToIso(point.endTimeNanos) ?? start;
    if (!start || !end) continue;

    const rawValue = point.fitValue?.[0]?.value?.[mapping.valueKind];
    let value = coerceNumber(rawValue);
    if (value === undefined) continue;
    if (mapping.scale) value *= mapping.scale;

    // Drop zero-step / zero-distance noise: HealthKit treats a zero-valued
    // cumulative sample as meaningless and it only clutters the store.
    if (value === 0 && (mapping.hkType === "stepCount" || mapping.hkType === "distanceWalkingRunning")) {
      continue;
    }

    mappedAny = true;
    samples.push({
      kind: "quantity",
      type: mapping.hkType,
      unit: mapping.hkUnit,
      value,
      start,
      end,
      id: makeQuantityId(mapping.hkType, start, end, value),
    });
  }

  if (!mappedAny && sourceType && !QUANTITY_MAPPINGS[sourceType]) {
    skipped.push({ file: fileName, reason: `unmapped data type: ${sourceType}` });
  }

  return { samples, skipped };
}
