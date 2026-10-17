import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/timeline.json";
import type { CalloutEvent, Timeline } from "../lib/timeline";
import { calloutPlacement } from "../lib/callout";
import { projectCarryRect } from "../lib/carry";
import { createSceneCameraPath } from "../lib/scene-camera";
import { DemoVideo, layoutFor } from "../remotion/DemoVideo";
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
  return { Screen: ({ children }: { children: import("react").ReactNode }) =>
    React.createElement("div", { style: { background: "#183A42" }, "data-native-screen": true }, children) };
});

const timeline: Timeline = { ...fixture as Timeline, durationMs: 16000, events: [
  { t: 6000, kind: "carry", rect: { x: 700, y: 400, width: 360, height: 60 }, text: "Please revise this answer" },
  { t: 6300, kind: "transition", label: "Customer", outMs: 450, cardMs: 4000, visibleCardMs: 1200, inMs: 560 },
  // Measured only after land() scrolls the new page.
  { t: 11310, kind: "land", rect: { x: 700, y: 600, width: 360, height: 60 } },
] };

describe("review regressions", () => {
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

  it.each([8300, 8700])("never paints a white destination patch on a non-white screen at %sms", (time) => {
    clock.frame = time * 60 / 1000;
    const html = renderToStaticMarkup(createElement(DemoVideo, { timeline, videoSrc: "test.mp4", windowChrome: "macos" }));
    const layout = layoutFor(2560, 1440, "macos");
    const camera = createSceneCameraPath(timeline, 60, layout.screenWidth, layout.screenHeight).atFrame(11310 * 60 / 1000);
    const land = timeline.events.find((event) => event.kind === "land")!;
    const projected = projectCarryRect(land.rect, 1.5, camera, { x: 0, y: 0 });
    expect(html).toContain("background:#183A42");
    expect(html).toContain("Please revise this answer");
    expect(html).not.toContain(`left:${projected.x}px;top:${projected.y}px;width:${projected.width}px;height:${projected.height}px`);
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
