import { describe, expect, it } from "vitest";
import { computeFrameSheets } from "../scripts/frame-sheets.mjs";
import { createCameraPath } from "../lib/camera";
import { compositionFps } from "../remotion/theme";
import type { Timeline } from "../lib/timeline";
import fixture from "../fixtures/timeline.json";

describe("frame sheet windows", () => {
  it("orders motion events, resolves auto zooms and samples 12 inclusive times", () => {
    const timeline: Timeline = {
      ...(fixture as Timeline),
      events: [
        { t: 4000, kind: "outro", title: "Done", durationMs: 2400 },
        { t: 100, kind: "zoom", rect: { x: 400, y: 300, width: 500, height: 200 } },
        { t: 2500, kind: "spotlight", rect: { x: 10, y: 10, width: 200, height: 100 }, durationMs: 300, holdMs: 700 },
        { t: 500, kind: "click", x: 100, y: 100 },
      ],
    };
    const sheets = computeFrameSheets(timeline, 5000);
    const camera = createCameraPath(timeline, compositionFps, 2560, 1440);
    expect(sheets.map((sheet) => sheet.kind)).toEqual(["zoom", "spotlight", "outro"]);
    expect(sheets[0].startMs).toBe(0);
    expect(sheets[0].endMs).toBe(100 + camera.moves[0].durationMs + 500);
    expect(sheets[1]).toMatchObject({ startMs: 2250, endMs: 4300 });
    expect(sheets[2]).toMatchObject({ startMs: 3750, endMs: 5000 });
    for (const sheet of sheets) {
      expect(sheet.frameTimesMs).toHaveLength(12);
      expect(sheet.frameTimesMs[0]).toBe(sheet.startMs);
      expect(sheet.frameTimesMs[11]).toBe(sheet.endMs);
      for (let index = 1; index < 12; index++) {
        expect(sheet.frameTimesMs[index] - sheet.frameTimesMs[index - 1]).toBeCloseTo((sheet.endMs - sheet.startMs) / 11);
      }
    }
  });
});
