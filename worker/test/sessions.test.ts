import { describe, it, expect } from "vitest";
import { parseSessionFile } from "../src/parser/sessions.js";

describe("parseSessionFile", () => {
  it("maps a running session to an HKWorkout with energy and distance", () => {
    const json = JSON.stringify({
      fitnessActivity: "running",
      startTime: "2021-05-01T08:00:00.000Z",
      endTime: "2021-05-01T08:30:00.000Z",
      aggregate: [
        { metricName: "com.google.calories.expended", floatValue: 200.5 },
        { metricName: "com.google.distance.delta", floatValue: 3000 },
      ],
    });
    const { workout } = parseSessionFile("s.json", json);
    expect(workout).toMatchObject({
      kind: "workout",
      activityType: "running",
      totalEnergyKcal: 200.5,
      totalDistanceMeters: 3000,
      start: "2021-05-01T08:00:00.000Z",
      end: "2021-05-01T08:30:00.000Z",
    });
  });

  it("maps Google 'biking' to HealthKit 'cycling'", () => {
    const json = JSON.stringify({
      fitnessActivity: "biking",
      startTime: "2021-05-01T08:00:00.000Z",
      endTime: "2021-05-01T09:00:00.000Z",
    });
    const { workout } = parseSessionFile("s.json", json);
    expect(workout?.activityType).toBe("cycling");
  });

  it("falls back to 'other' for unknown activities", () => {
    const json = JSON.stringify({
      fitnessActivity: "underwater_basket_weaving",
      startTime: "2021-05-01T08:00:00.000Z",
      endTime: "2021-05-01T08:30:00.000Z",
    });
    const { workout } = parseSessionFile("s.json", json);
    expect(workout?.activityType).toBe("other");
  });

  it("normalizes a non-UTC timestamp to UTC", () => {
    const json = JSON.stringify({
      fitnessActivity: "walking",
      startTime: "2021-05-01T10:00:00.000+02:00",
      endTime: "2021-05-01T10:30:00.000+02:00",
    });
    const { workout } = parseSessionFile("s.json", json);
    expect(workout?.start).toBe("2021-05-01T08:00:00.000Z");
  });

  it("skips sessions with non-positive duration", () => {
    const json = JSON.stringify({
      fitnessActivity: "running",
      startTime: "2021-05-01T08:00:00.000Z",
      endTime: "2021-05-01T08:00:00.000Z",
    });
    const { workout, skipped } = parseSessionFile("s.json", json);
    expect(workout).toBeUndefined();
    expect(skipped[0].reason).toContain("non-positive duration");
  });

  it("omits energy/distance when absent rather than emitting zeros", () => {
    const json = JSON.stringify({
      fitnessActivity: "yoga",
      startTime: "2021-05-01T08:00:00.000Z",
      endTime: "2021-05-01T08:45:00.000Z",
    });
    const { workout } = parseSessionFile("s.json", json);
    expect(workout?.totalEnergyKcal).toBeUndefined();
    expect(workout?.totalDistanceMeters).toBeUndefined();
  });
});
