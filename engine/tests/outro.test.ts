import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseTimeline } from "../lib/timeline";
import { parseOutroTitle, outroTitleMotion, outroScreenMotion, Outro, resolveOutro } from "../remotion/Outro";

import { demoTheme } from "../remotion/theme";

describe("resolveOutro", () => {
  it("resolves a validated hand-crafted outro through enter and hold", () => {
    const timeline = parseTimeline(
      JSON.stringify({
        version: 1,
        name: "outro-proof",
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
        capture: { fps: 30, syncFlashAt: 0 },
        durationMs: 3_400,
        events: [
          {
            t: 1_000,
            kind: "outro",
            title: "Any website. One storyboard.",
            durationMs: 2_400,
          },
        ],
      }),
    );

    expect(resolveOutro(timeline, 999)).toEqual({
      event: timeline.events[0],
      progress: 0,
      started: false,
    });
    expect(resolveOutro(timeline, 1_300).progress).toBeGreaterThan(0);
    expect(resolveOutro(timeline, 1_300).progress).toBeLessThan(1);
    expect(resolveOutro(timeline, 1_600)).toEqual({
      event: timeline.events[0],
      progress: 1,
      started: true,
    });
    expect(resolveOutro(timeline, 3_399).progress).toBe(1);
  });
});

// These checks catch title/list regressions, early segment fills, and abrupt screen fades.
describe("kinetic outro slate", () => {
  it("parses colon-led comma/colon steps, preserving plain titles", () => {
    expect(parseOutroTitle("Named account: requested, reviewed, approved, issued.")).toEqual({
      lead: "Named account", steps: ["requested", "reviewed", "approved", "issued."],
      text: "requested reviewed approved issued.",
    });
    expect(parseOutroTitle("Account: requested: reviewed: issued").steps).toEqual(["requested", "reviewed", "issued"]);
    for (const title of ["All done.", "Requested, reviewed, approved.", "Account: ready", "Account: , ,"]) {
      expect(parseOutroTitle(title)).toEqual({ lead: undefined, steps: [], text: title });
    }
  });

  it("uses chapter word timing and fills each segment only when its whole step lands", () => {
    const title = parseOutroTitle("Account: request received, reviewed, issued.");
    const motion = outroTitleMotion(title, 2400);
    expect(motion.timings).toEqual([
      { startMs: 0, endMs: 420 }, { startMs: 45, endMs: 465 },
      { startMs: 90, endMs: 510 }, { startMs: 135, endMs: 555 },
    ]);
    for (const [age, fills] of [[464, [0, 0, 0]], [465, [1, 0, 0]], [510, [1, 1, 0]], [555, [1, 1, 1]]] as const) {
      expect(outroTitleMotion(title, 2400, demoTheme.outro.titleDelayMs + age).fills).toEqual(fills);
    }
    expect(outroTitleMotion(parseOutroTitle("Done"), 2400, 2000).fills).toEqual([]);
  });

  it("recedes continuously to chapter context with no adjacent 60fps opacity jump above 1%", () => {
    expect(outroScreenMotion(0)).toEqual({ scale: 1, opacity: 1, translateX: 0 });
    expect(outroScreenMotion(demoTheme.outro.screenDurationMs / 2).opacity).toBeCloseTo(0.535);
    expect(outroScreenMotion(demoTheme.outro.screenDurationMs)).toEqual({ scale: 0.84, opacity: 0.07, translateX: 0 });
    let previous = 1;
    for (let frame = -1; frame <= 240; frame++) {
      const current = outroScreenMotion(frame * 1000 / 60).opacity;
      expect(Math.abs(current - previous)).toBeLessThanOrEqual(0.01);
      previous = current;
    }
  });
});

it("holds the composed slate after the event duration and omits the rail for plain titles", () => {
  const event = { t: 1000, kind: "outro" as const,
    title: "Named account: requested, reviewed, approved, issued.", durationMs: 2400 };
  const render = (title: string, age: number) => renderToStaticMarkup(createElement(Outro, {
    outro: { event: { ...event, title }, progress: 1, started: true }, frameWidth: 2560, timeMs: event.t + age,
  }));
  for (const age of [2399, 3400]) {
    const html = render(event.title, age);
    expect(html.match(/scaleX\(1\)/g)).toHaveLength(4);
    expect(html).toContain("Named account");
    expect(html).toContain("issued.");
    expect(html).toContain("radial-gradient");
  }
  expect(render("All done.", 2400)).not.toContain("scaleX");
  expect(render(event.title, 1490).match(/scaleX\(1\)/g)).toHaveLength(2);
});
