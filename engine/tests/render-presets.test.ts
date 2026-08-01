import { describe, expect, it } from "vitest";
import { renderPresetSequence } from "../lib/render-presets.mjs";

describe("renderPresetSequence", () => {
  it("renders requested presets sequentially and returns paths in request order", async () => {
    const started: string[] = [];
    let activeRenders = 0;
    let maximumActiveRenders = 0;

    const outputs = await renderPresetSequence(
      ["9x16", "16x9", "1x1"],
      async (preset: string) => {
        started.push(preset);
        activeRenders += 1;
        maximumActiveRenders = Math.max(maximumActiveRenders, activeRenders);
        await new Promise((resolve) => setImmediate(resolve));
        activeRenders -= 1;
        return `/engine/out/demo-${preset}.mp4`;
      },
    );

    expect(started).toEqual(["9x16", "16x9", "1x1"]);
    expect(maximumActiveRenders).toBe(1);
    expect(outputs).toEqual([
      "/engine/out/demo-9x16.mp4",
      "/engine/out/demo-16x9.mp4",
      "/engine/out/demo-1x1.mp4",
    ]);
  });
});
