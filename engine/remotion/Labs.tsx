import { AbsoluteFill, Easing, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraTransform } from "../lib/camera";
import { createSceneCameraPath } from "../lib/scene-camera";
import { carryFlights } from "../lib/carry";
import { railScreenOffset, railState } from "../lib/rail";
import { clamp } from "../lib/typography";
import { createTimeMap } from "../lib/time-map";
import { type Timeline, type Rect } from "../lib/timeline";
import { Background } from "./Background";
import { Rail } from "./Rail";
import { Carry } from "./Carry";
import { Callout } from "./Callout";
import { Transition, transitionMotion } from "./Transition";
import { layoutFor } from "./DemoVideo";
import { demoTheme } from "./theme";

export const labSteps = ["Bank asks", "Ops raises", "Customer answers", "Ops reviews", "Bank"];
const source: Rect = { x: 680, y: 430, width: 560, height: 72 };
const target: Rect = { x: 680, y: 650, width: 560, height: 72 };
export const railLabTimeline: Timeline = {
  version: 1, name: "rail-lab", viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
  capture: { fps: 30, syncFlashAt: 0 }, durationMs: 8000,
  events: [
    { t: 200, kind: "rail", steps: labSteps, active: 0 },
    { t: 1200, kind: "rail", steps: labSteps, active: 1 },
    { t: 2200, kind: "rail", steps: labSteps, active: 3 },
    { t: 2200, kind: "rail-back", from: 3, to: 2 },
    { t: 3250, kind: "transition", label: "Sent back to the customer", role: "Customer", outMs: 450, cardMs: 1500, inMs: 560 },
    { t: 6100, kind: "rail-off" },
    { t: 6800, kind: "rail", steps: ["Customer", "Ops", "Bank"], active: 2 },
  ],
};
export const carryLabTimeline: Timeline = {
  ...railLabTimeline, name: "carry-lab", durationMs: 11200,
  events: [
    { t: 0, kind: "zoom", rect: { x: 500, y: 280, width: 920, height: 520 } },
    { t: 2500, kind: "carry", rect: source, text: "Describe the source of funds" },
    { t: 2800, kind: "transition", label: "Sent back to the customer", role: "Customer", chapter: { index: 3, total: 5 },
      outMs: 450, cardMs: 4000, visibleCardMs: 1200, inMs: 560 },
    { t: 5000, kind: "zoom", rect: { x: 500, y: 480, width: 920, height: 520 } },
    { t: 7810, kind: "land", rect: target },
  ],
};
export const calloutLabTimeline: Timeline = {
  ...railLabTimeline, name: "callout-lab", durationMs: 9000,
  events: [
    { t: 0, kind: "zoom", rect: { x: 450, y: 260, width: 1020, height: 580 } },
    { t: 600, kind: "callout", rect: source, text: "The customer reads this", side: "bottom", holdMs: 3000 },
    { t: 5300, kind: "callout", rect: source,
      text: "The customer reads this explanation and can return with the additional information requested by the Bank",
      side: "bottom", holdMs: 1600 },
  ],
};

function Lab({ timeline, kind }: { timeline: Timeline; kind: "rail" | "carry" | "callout" }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const time = frame * 1000 / fps;
  const map = createTimeMap(timeline);
  const sourceTime = map.toTimelineTime(time);
  const rail = railState(timeline, time);
  const baseLayout = layoutFor(width, height, "macos");
  const screenShift = railScreenOffset(timeline, width, height, baseLayout.top, 1);
  const layout = { ...baseLayout, top: baseLayout.top + screenShift * rail.opacity };
  const screenOriginAt = (at: number) => ({ x: (width - baseLayout.screenWidth) / 2,
    y: baseLayout.top + baseLayout.chromeHeight + screenShift * railState(timeline, at).opacity });
  const cameraPath = createSceneCameraPath(timeline, fps, layout.screenWidth, layout.screenHeight);
  const camera = cameraPath.atFrame(sourceTime * fps / 1000);
  const transition = timeline.events.find((e) => e.kind === "transition");
  const projected = transition?.kind === "transition" ? { ...transition, t: map.toCompositionTime(transition.t),
    cardMs: Math.min(transition.cardMs, transition.visibleCardMs ?? demoTheme.transition.visibleCardMs) } : undefined;
  const movement = transitionMotion(projected, time);
  const origin = { x: (width - layout.screenWidth) / 2, y: layout.top + layout.chromeHeight };
  const incoming = !!transition && sourceTime >= transition.t + transition.outMs;
  const dsf = timeline.viewport.deviceScaleFactor;
  const screen = (incoming: boolean, camera: CameraTransform, opacity: number,
    motion = { translateX: 0, scale: 1 }) => {
    // The target is measured after a smooth scroll in land(); its earlier position differs.
    const scroll = Easing.bezier(...demoTheme.zoom.easing)(clamp((sourceTime - 7510) / 300));
    const rect = kind === "carry" && incoming ? { ...target, y: target.y + 180 * (1 - scroll) } : source;
    return (
    <div style={{ position: "absolute", left: origin.x, top: layout.top, width: layout.screenWidth,
      height: layout.screenHeight + layout.chromeHeight, borderRadius: 24, overflow: "hidden",
      background: demoTheme.colors.surface, boxShadow: demoTheme.screen.shadow,
      opacity, transform: `translateX(${motion.translateX * width}px) scale(${motion.scale})` }}>
      <div style={{ height: layout.chromeHeight, background: demoTheme.colors.surfaceMuted }} />
      <div style={{ position: "relative", height: layout.screenHeight, overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 1920 * dsf, height: 1080 * dsf, transformOrigin: "0 0",
          transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})` }}>
          <div style={{ position: "absolute", left: 120 * dsf, top: 80 * dsf, fontSize: 28 * dsf, fontWeight: 500 }}>SwipeLux · {incoming ? "Customer form" : "Ops review"}</div>
          <div style={{ position: "absolute", left: rect.x * dsf, top: (rect.y - 100) * dsf, fontSize: 32 * dsf, fontWeight: 500 }}>{incoming ? "Needs changes" : "Reason shown to the customer"}</div>
          <div style={{ position: "absolute", left: rect.x * dsf, top: rect.y * dsf, width: rect.width * dsf, height: rect.height * dsf,
            background: incoming ? demoTheme.colors.backdrop : demoTheme.colors.surfaceMuted, borderRadius: 12 * dsf, fontSize: 28 * dsf, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Describe the source of funds
          </div>
        </div>
        {kind === "callout" && timeline.events.map((event, index) => event.kind === "callout" ?
          <Callout key={index} event={event} timeline={timeline} camera={camera} timeMs={sourceTime} width={layout.screenWidth} height={layout.screenHeight} /> : null)}
      </div>
    </div>
    );
  };
  const outgoingCamera = transition
    ? cameraPath.atFrame(Math.max(0, Math.ceil(transition.t * fps / 1000) - 1)) : camera;
  return <AbsoluteFill style={{ fontFamily: demoTheme.fontFamily, color: demoTheme.colors.contentPrimary }}>
    <style>{`@font-face { font-family: 'Geist Sans'; src: url('${staticFile("fonts/geist-sans-latin-500-v5.2.5.woff2")}'); font-weight: 500; }`}</style>
    <Background />
    {movement.active ? <>
      {screen(false, outgoingCamera, movement.outgoing.opacity, movement.outgoing)}
      {screen(true, camera, movement.incoming.opacity, movement.incoming)}
    </> : screen(incoming, camera, 1)}
    {projected ? <Transition event={projected} timeMs={time} frameWidth={width} /> : null}
    {kind === "rail" ? <Rail state={rail} width={width} height={height} screenShift={screenShift} /> : null}
    {kind === "carry" ? carryFlights(timeline).map((flight, index) => <Carry key={index} flight={flight} timeline={timeline}
      cameraPath={cameraPath} fps={fps} timeMs={time} width={width} height={height} screenOrigin={origin} screenOriginAt={screenOriginAt} />) : null}
  </AbsoluteFill>;
}
export const RailLab = () => <Lab timeline={railLabTimeline} kind="rail" />;
export const CarryLab = () => <Lab timeline={carryLabTimeline} kind="carry" />;
export const CalloutLab = () => <Lab timeline={calloutLabTimeline} kind="callout" />;
