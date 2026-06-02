import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { convertArchive } from "../src/convert/normalize.js";
import { makeQuantityId } from "../src/convert/id.js";

const START_NANOS = "1619856000000000000"; // 2021-05-01T08:00:00Z
const END_NANOS = "1619856060000000000";

function buildTakeoutZip(): Uint8Array {
  const stepsJson = JSON.stringify({
    "Data Source": "raw:com.google.step_count.delta:...",
    "Data Points": [
      {
        fitValue: [{ value: { intVal: 100 } }],
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
        dataTypeName: "com.google.step_count.delta",
      },
      {
        // Duplicate of the first point — must be deduped to one sample.
        fitValue: [{ value: { intVal: 100 } }],
        startTimeNanos: START_NANOS,
        endTimeNanos: END_NANOS,
        dataTypeName: "com.google.step_count.delta",
      },
    ],
  });

  const sessionJson = JSON.stringify({
    fitnessActivity: "running",
    startTime: "2021-05-01T08:00:00.000Z",
    endTime: "2021-05-01T08:30:00.000Z",
    aggregate: [{ metricName: "com.google.calories.expended", floatValue: 250 }],
  });

  return zipSync({
    "Takeout/Fit/All Data/derived_steps.json": strToU8(stepsJson),
    "Takeout/Fit/All Sessions/2021-05-01T08_00_00Z_run.json": strToU8(sessionJson),
    "Takeout/Fit/Daily activity metrics/2021-05-01.csv": strToU8("Date,Steps\n2021-05-01,100\n"),
    "Takeout/Fit/Activities/2021-05-01.tcx": strToU8("<TrainingCenterDatabase/>"),
    "Takeout/archive_browser.html": strToU8("<html></html>"),
  });
}

describe("convertArchive (end-to-end)", () => {
  it("parses a realistic Takeout zip into a normalized payload", () => {
    const payload = convertArchive(buildTakeoutZip());

    expect(payload.version).toBe(1);
    expect(payload.source).toBe("Google Fit (Takeout)");

    const steps = payload.samples.filter((s) => s.kind === "quantity" && s.type === "stepCount");
    const workouts = payload.samples.filter((s) => s.kind === "workout");

    // The duplicate step point collapses to a single sample.
    expect(steps).toHaveLength(1);
    expect(workouts).toHaveLength(1);
    expect(payload.summary.stepCount).toBe(1);
    expect(payload.summary["workout:running"]).toBe(1);
  });

  it("skips CSV and TCX with explanatory notes (avoids double counting)", () => {
    const payload = convertArchive(buildTakeoutZip());
    const reasons = payload.skipped.map((s) => s.reason).join(" ");
    expect(reasons).toContain("duplicates All Data");
    expect(reasons).toContain("TCX");
  });

  it("ignores non-Fit archive files entirely", () => {
    const payload = convertArchive(buildTakeoutZip());
    expect(payload.skipped.some((s) => s.file.includes("archive_browser.html"))).toBe(false);
  });

  it("produces ids stable across two independent conversions", () => {
    const a = convertArchive(buildTakeoutZip());
    const b = convertArchive(buildTakeoutZip());
    const idsA = a.samples.map((s) => s.id).sort();
    const idsB = b.samples.map((s) => s.id).sort();
    expect(idsA).toEqual(idsB);
    // And the id matches the documented derivation.
    expect(idsA).toContain(makeQuantityId("stepCount", "2021-05-01T08:00:00.000Z", "2021-05-01T08:01:00.000Z", 100));
  });
});
