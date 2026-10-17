import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/timeline.json";
import type { CalloutEvent, Timeline } from "../lib/timeline";
import { calloutPlacement } from "../lib/callout";
import { projectCarryRect } from "../lib/carry";
import { createSceneCameraPath } from "../lib/scene-camera";
import { DemoVideo, layoutFor, buildStudioTracks } from "../remotion/DemoVideo";
import { Callout } from "../remotion/Callout";
import { demoTheme } from "../remotion/theme";

const clock = vi.hoisted(() => ({ frame: 0 }));
vi.mock("remotion", async (original) => {
  const actual = await original<typeof import("remotion")>();
  const React = await import("react");
  const passthrough = ({ children }: { children: import("react").ReactNode }) => React.createElement(React.Fragment, null, children);
  return { ...actual,
    useCurrentFrame: () => clock.frame,
    useVideoConfig: () => ({ width: 2560, height: 1440, fps: 60, durationInFrames: 1000 }),
    AbsoluteFill: ({ children, style }: { children: import("react").ReactNode; style: import("react").CSSProperties }) =>
      React.createElement("div", { style }, children),
    Freeze: passthrough,
    Sequence: ({ children, from = 0, durationInFrames = Infinity }: { children: import("react").ReactNode; from?: number; durationInFrames?: number }) =>
      clock.frame >= from && clock.frame < from + durationInFrames ? passthrough({ children }) : null,
  };
});
// Replace video decoding only; exercise the real compositor and all carry overlay wiring.
vi.mock("../remotion/Screen", async () => {
  const React = await import("react");
  return { Screen: ({ children, timeMs, showCursor }: { children: import("react").ReactNode; timeMs: number; showCursor: boolean }) =>
    React.createElement("div", { style: { background: "#183A42" }, "data-native-screen": true,
      "data-screen-time": timeMs, "data-show-cursor": showCursor }, children) };
});

const timeline: Timeline = { ...fixture as Timeline, durationMs: 16000, events: [
  { t: 6000, kind: "carry", rect: { x: 700, y: 400, width: 360, height: 60 }, text: "Please revise this answer" },
  { t: 6300, kind: "transition", label: "Customer", outMs: 450, cardMs: 4000, visibleCardMs: 1200, inMs: 560 },
  // Measured only after land() scrolls the new page.
  { t: 11310, kind: "land", rect: { x: 700, y: 600, width: 360, height: 60 } },
] };

describe("review regressions", () => {
  it.each([["cut", 0], ["cut", 1950], ["chapter", 0], ["chapter", 1950]] as const)("expires annotations at %s (emitted at %sms) and fades only their outgoing snapshot", (style, at) => {
    const annotated: Timeline = { ...timeline, events: [
      { t: at, kind: "callout", rect: { x: 700, y: 400, width: 400, height: 60 }, text: "OldAnnotation", side: "bottom", holdMs: 10000 },
      { t: at, kind: "spotlight", rect: { x: 700, y: 400, width: 400, height: 60 }, durationMs: 450, holdMs: 10000 },
      { t: 2000, kind: "transition", ...(style === "cut" ? { style: "cut" as const } : {}), label: "New page",
        outMs: style === "cut" ? 0 : 450, cardMs: 3000, inMs: 540 },
    ] };
    const tracks = buildStudioTracks(annotated, 60, 1000);
    expect(tracks.callouts[0]!.durationInFrames).toBeLessThanOrEqual(121);
    expect(tracks.spotlights[0]!.durationInFrames).toBeLessThanOrEqual(121);
    const sample = (frame: number) => {
      clock.frame = frame;
      return renderToStaticMarkup(createElement(DemoVideo, { timeline: annotated, videoSrc: "test.mp4", windowChrome: "macos" }));
    };
    expect(sample(119)).toContain("OldAnnotation");
    const start = sample(120);
    expect(start).toContain("OldAnnotation");
    expect(start).toContain('data-scene-annotations="true" style="opacity:1"');
    const oneFrame = sample(121);
    const alpha = Number(oneFrame.match(/data-scene-annotations="true" style="opacity:([^"]+)"/)?.[1]);
    expect(alpha).toBeGreaterThan(0.95);
    expect(alpha).toBeLessThan(1);
    expect(oneFrame).toContain("OldAnnotation");
    expect(oneFrame).toContain("<mask");
    for (const frame of [132, 153, 400]) {
      expect(sample(frame)).not.toContain("OldAnnotation");
      expect(sample(frame)).not.toContain("<mask");
    }
  });
  it("pins cut snapshot props to the old and first settled frames, including the pointers", () => {
    const cut: Timeline = { ...timeline, durationMs: 8000, events: [
      { t: 0, kind: "cursor", x: 500, y: 500 },
      { t: 2000, kind: "transition", style: "cut", label: "Hidden label", outMs: 0, cardMs: 3000, inMs: 540 },
      { t: 4500, kind: "cursor", x: 1200, y: 800 },
    ] };
    for (const frame of [120, 136, 152]) {
      clock.frame = frame;
      const html = renderToStaticMarkup(createElement(DemoVideo, { timeline: cut, videoSrc: "test.mp4", windowChrome: "macos" }));
      const times = [...html.matchAll(/data-screen-time="([^"]+)"/g)].map((match) => Number(match[1]));
      expect(times).toEqual([119 * 1000 / 60, 5000]);
      expect(html.match(/data-show-cursor="true"/g)).toHaveLength(2);
      expect(html).not.toContain("Hidden label");
    }
  });
  it("rounds multi-line callouts without clipping their outer glyphs", () => {
    const event: CalloutEvent = { t: 0, kind: "callout", rect: { x: 800, y: 400, width: 300, height: 60 },
      text: "The customer reads this explanation and can return with the additional information requested by the Bank", holdMs: 3000, side: "bottom" };
    const p = calloutPlacement(event.rect, event.text, event.side, 2560, 1440);
    expect(p.lines.length).toBeGreaterThan(2);
    const html = renderToStaticMarkup(createElement(Callout, { event, timeMs: 1800, timeline,
      camera: { scale: 1 / 1.5, translateX: 0, translateY: 0 }, width: 2560, height: 1440 }));
    expect(html).toContain(`padding:14px 22px;border-radius:${demoTheme.callout.radius}px`);
    expect(html).not.toContain("border-radius:999px");
    const single = renderToStaticMarkup(createElement(Callout, { event: { ...event, text: "The customer reads this" }, timeMs: 1800,
      timeline, camera: { scale: 1 / 1.5, translateX: 0, translateY: 0 }, width: 2560, height: 1440 }));
    expect(single).toContain("border-radius:999px");
  });

  it.each([8300, 9470])("conceals only the incoming destination before arrival and removes the cover after reveal at %sms", (time) => {
    clock.frame = time * 60 / 1000;
    const html = renderToStaticMarkup(createElement(DemoVideo, { timeline, videoSrc: "test.mp4", windowChrome: "macos" }));
    expect(html).toContain("background:#183A42");
    expect(html.match(/data-carry-concealer="true"/g)?.length ?? 0).toBe(time === 8300 ? 1 : 0);
    if (time === 8300) {
      const incomingScreen = html.lastIndexOf('data-native-screen="true"');
      expect(html.indexOf('data-carry-concealer="true"')).toBeGreaterThan(incomingScreen);
      expect(html).toContain("Please revise this answer");
    } else expect(html).not.toContain("Please revise this answer");
  });

  it("applies the larger rail's headroom in the real compositor", () => {
    clock.frame = 30;
    const subject: Timeline = { ...timeline, events: [
      { t: 0, kind: "rail", steps: ["Bank asks", "Ops raises", "Customer answers", "Ops reviews", "Bank"], active: 3 },
    ] };
    const html = renderToStaticMarkup(createElement(DemoVideo, { timeline: subject, videoSrc: "test.mp4", windowChrome: "macos" }));
    expect(html).toContain("top:128px;transform:translateX(-50%)");
    expect(html).toContain("font-size:26px");
    expect(html).toContain("height:80px;border-radius:999px");
  });

});
