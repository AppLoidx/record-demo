import { describe, expect, it } from "vitest";
import {
  detectClockSteps,
  correctCaptureTimeMs,
  buildClockStepSetpts,
  remotionSourceArgs,
} from "../lib/capture-timing.ts";

describe("capture clock correction", () => {
  it("preserves timestamps when there are no steps", () => {
    const steps = detectClockSteps([0, 0.1, 0.2], 10);
    expect(steps).toEqual([]);
    expect(correctCaptureTimeMs(200, steps)).toBe(200);
    expect(buildClockStepSetpts(steps)).toBe("setpts=PTS");
  });

  it("removes only the excess gap and accumulates two steps", () => {
    const steps = detectClockSteps([0, 0.1, 3.2, 3.3, 6.4, 6.5], 10);
    expect(steps.map((step) => step.atSeconds)).toEqual([3.2, 6.4]);
    expect(steps[0]!.correctionSeconds).toBeCloseTo(3);
    expect(steps[1]!.correctionSeconds).toBeCloseTo(3);
    expect(correctCaptureTimeMs(100, steps)).toBe(100);
    expect(correctCaptureTimeMs(3200, steps)).toBeCloseTo(200);
    expect(correctCaptureTimeMs(6500, steps)).toBeCloseTo(500);
    expect(buildClockStepSetpts([
      { atSeconds: 3.2, correctionSeconds: 3 },
      { atSeconds: 6.4, correctionSeconds: 3 },
    ])).toBe(
      "setpts=(PTS*TB-(gte(PTS*TB\\,3.2)*3+gte(PTS*TB\\,6.4)*3))/TB",
    );
  });

  it("corrects a flash after one step without subtracting later steps", () => {
    const steps = detectClockSteps([0, 0.1, 3.2, 3.3, 6.4], 10);
    expect(correctCaptureTimeMs(3300, steps)).toBeCloseTo(300);
  });

  it("preserves genuine drops of 1.0s and corrects 1.3s WSL steps", () => {
    expect(detectClockSteps([0, 1, 2.1], 30)).toEqual([]);
    expect(detectClockSteps([0, 1, 2.3], 30)).toHaveLength(1);
    expect(detectClockSteps([], 30)).toEqual([]);
  });

  it("retimes before trimming and resets before generating constant-rate output", () => {
    const args = remotionSourceArgs("master.mkv", "fixed.mp4", 200, [
      { atSeconds: 3.2, correctionSeconds: 3 },
    ], 30);
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "setpts=(PTS*TB-(gte(PTS*TB\\,3.2)*3))/TB,trim=start=0.200000000,setpts=PTS-STARTPTS,fps=30",
    );
    expect(args[args.indexOf("-vsync") + 1]).toBe("cfr");
    expect(args).not.toContain("-ss");
    expect(args).not.toContain("-fps_mode");
  });
});
