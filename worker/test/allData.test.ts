import { describe, it, expect } from "vitest";
import { parseAllDataFile } from "../src/parser/allData.js";

// 2021-05-01T08:00:00.000Z in nanoseconds and +1 minute.
const START_NANOS = "1619856000000000000";
const END_NANOS = "1619856060000000000";

function stepFile(intVal: number, nanos = START_NANOS, end = END_NANOS) {
  return JSON.stringify({
    "Data Source": "raw:com.google.step_count.delta:com.google.android.gms:...",
    "Data Points": [
      {
        fitValue: [{ value: { intVal } }],
        startTimeNanos: nanos,
        endTimeNanos: end,
        dataTypeName: "com.google.step_count.delta",
      },
    ],
  });
}

describe("parseAllDataFile", () => {
  it("maps step counts to HealthKit stepCount/count", () => {
    const { samples } = parseAllDataFile("steps.json", stepFile(123));
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      kind: "quantity",
      type: "stepCount",
      unit: "count",
      value: 123,
      start: "2021-05-01T08:00:00.000Z",
      end: "2021-05-01T08:01:00.000Z",
    });
    expect(samples[0].id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("maps heart rate using fpVal and count/min", () => {
    const json = JSON.stringify({
      "Data Source": "derived:com.google.heart_rate.bpm:...",
      "Data Points": [
        {
          fitValue: [{ value: { fpVal: 72.5 } }],
          startTimeNanos: START_NANOS,
          endTimeNanos: START_NANOS,
          dataTypeName: "com.google.heart_rate.bpm",
        },
      ],
    });
    const { samples } = parseAllDataFile("hr.json", json);
    expect(samples[0]).toMatchObject({ type: "heartRate", unit: "count/min", value: 72.5 });
    // Instantaneous sample: end falls back to start.
    expect(samples[0].start).toEqual(samples[0].end);
  });

  it("derives the data type from the Data Source when point lacks dataTypeName", () => {
    const json = JSON.stringify({
      "Data Source": "raw:com.google.weight:com.google.android.apps.fitness:...",
      "Data Points": [
        { fitValue: [{ value: { fpVal: 80.2 } }], startTimeNanos: START_NANOS, endTimeNanos: START_NANOS },
      ],
    });
    const { samples } = parseAllDataFile("weight.json", json);
    expect(samples[0]).toMatchObject({ type: "bodyMass", unit: "kg", value: 80.2 });
  });

  it("drops zero-valued step samples as noise", () => {
    const { samples } = parseAllDataFile("steps.json", stepFile(0));
    expect(samples).toHaveLength(0);
  });

  it("reports an unmapped data type in skipped without throwing", () => {
    const json = JSON.stringify({
      "Data Source": "derived:com.google.cycling.pedaling.cadence:...",
      "Data Points": [
        { fitValue: [{ value: { fpVal: 90 } }], startTimeNanos: START_NANOS, endTimeNanos: END_NANOS },
      ],
    });
    const { samples, skipped } = parseAllDataFile("cadence.json", json);
    expect(samples).toHaveLength(0);
    expect(skipped[0].reason).toContain("unmapped data type");
  });

  it("returns a skip note for invalid JSON instead of throwing", () => {
    const { samples, skipped } = parseAllDataFile("bad.json", "{not json");
    expect(samples).toHaveLength(0);
    expect(skipped[0].reason).toBe("invalid JSON");
  });

  it("coerces numeric nanos given as numbers, not just strings", () => {
    const json = JSON.stringify({
      "Data Source": "raw:com.google.step_count.delta:...",
      "Data Points": [
        {
          fitValue: [{ value: { intVal: 50 } }],
          startTimeNanos: 1619856000000000000,
          endTimeNanos: 1619856060000000000,
          dataTypeName: "com.google.step_count.delta",
        },
      ],
    });
    const { samples } = parseAllDataFile("steps.json", json);
    expect(samples).toHaveLength(1);
    expect(samples[0].value).toBe(50);
  });
});
