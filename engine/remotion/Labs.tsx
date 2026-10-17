import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraTransform } from "../lib/camera";
import { createSceneCameraPath } from "../lib/scene-camera";
import { carryFlights } from "../lib/carry";
import { railScreenOffset, railState } from "../lib/rail";
import { createTimeMap, transitionVisibleCardMs } from "../lib/time-map";
import { type Timeline, type Rect } from "../lib/timeline";
import { Caption } from "./Captions";
import { Background } from "./Background";
import { Rail } from "./Rail";
import { Cursor } from "./Cursor";
import { Carry, CarryConcealer } from "./Carry";
import { Callout } from "./Callout";
import { Transition, transitionMotion, annotationHandoffOpacity } from "./Transition";
import { SpotlightTrack } from "./Spotlight";
import { layoutFor, annotationEndMs } from "./DemoVideo";
import { demoTheme } from "./theme";
import landTextLab from "../fixtures/land-text-lab.json";

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

export const cutLabTimeline: Timeline = {
  ...railLabTimeline, name: "cut-lab", durationMs: 7800,
  events: [
    { t: 0, kind: "rail", steps: labSteps, active: 3 },
    { t: 0, kind: "cursor", x: 1100, y: 750 },
    { t: 4950, kind: "cursor", x: 1000, y: 600 },
    { t: 500, kind: "callout", rect: source, text: "Review this message", side: "bottom", holdMs: 10000 },
    { t: 900, kind: "spotlight", rect: source, durationMs: 450, holdMs: 10000 },
    { t: 1900, kind: "rail-back", from: 3, to: 2 },
    { t: 2000, kind: "transition", style: "cut", label: "", outMs: 0, cardMs: 3000, inMs: 540 },
  ],
};
export const carryCutLabTimeline: Timeline = {
  ...cutLabTimeline, name: "carry-cut-lab", durationMs: 6800,
  events: [
    { t: 0, kind: "rail", steps: labSteps, active: 2 },
    { t: 0, kind: "zoom", durationMs: 1650, rect: { x: 500, y: 280, width: 920, height: 520 } },
    { t: 1700, kind: "carry", rect: source, text: "Describe the source of funds" },
    { t: 2000, kind: "transition", style: "cut", label: "", outMs: 0, cardMs: 3000, inMs: 540 },
    { t: 3300, kind: "zoom", durationMs: 1650, rect: { x: 500, y: 480, width: 920, height: 520 } },
    { t: 5540, kind: "land", rect: landTextLab.rect, text: landTextLab.message, lines: landTextLab.lines, lineCount: landTextLab.lineCount, concealColor: demoTheme.colors.backdrop, textStyle: landTextLab.textStyle },
  ],
};

export const captionLabTimeline: Timeline = {
  ...railLabTimeline, name: "caption-lab", durationMs: 7400,
  events: [
    { t: 500, kind: "caption", text: "Send the request to the customer", durationMs: 2400 },
    { t: 1300, kind: "rail", steps: labSteps, active: 1 },
    { t: 3300, kind: "caption", text: "Review the supporting documents, add the missing details, and return the updated answer to the Bank", durationMs: 2600 },
    { t: 4800, kind: "rail-off" },
    { t: 6000, kind: "caption", text: "Done", durationMs: 1000 },
  ],
};

function Lab({ timeline, kind, concealProof = false, concealDisabled = false }: { concealProof?: boolean; concealDisabled?: boolean; timeline: Timeline; kind: "rail" | "carry" | "callout" | "cut" | "carry-cut" | "caption" }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const time = frame * 1000 / fps;
  const map = createTimeMap(timeline);
  const sourceTime = map.toTimelineTime(time);
  const rail = railState(timeline, time);
  const baseLayout = layoutFor(width, height, "macos", timeline);
  const screenShift = railScreenOffset(timeline, width, height, baseLayout.top, 1);
  const layout = { ...baseLayout, top: baseLayout.top + screenShift * rail.opacity };
  const screenOriginAt = (at: number) => ({ x: (width - baseLayout.screenWidth) / 2,
    y: baseLayout.top + baseLayout.chromeHeight + screenShift * railState(timeline, at).opacity });
  const cameraPath = createSceneCameraPath(timeline, fps, layout.screenWidth, layout.screenHeight);
  const camera = cameraPath.atFrame(sourceTime * fps / 1000);
  const transition = timeline.events.find((e) => e.kind === "transition");
  const projected = transition?.kind === "transition" ? { ...transition, t: map.toCompositionTime(transition.t),
    cardMs: transitionVisibleCardMs(transition) } : undefined;
  const movement = transitionMotion(projected, time);
  const origin = { x: (width - layout.screenWidth) / 2, y: layout.top + layout.chromeHeight };
  const incoming = !!transition && sourceTime >= transition.t + transition.outMs;
  const dsf = timeline.viewport.deviceScaleFactor;
  const screen = (incoming: boolean, camera: CameraTransform, opacity: number,
    motion = { translateX: 0, scale: 1, blur: 0 }) => {
    const annotationTime = movement.active && !incoming && transition ? transition.t - 1000 / fps : sourceTime;
    const annotationOpacity = movement.active && projected ? incoming ? 0 : annotationHandoffOpacity(projected, time) : 1;
    const rect = (kind === "carry" || kind === "carry-cut") && incoming ? target : source;
    return (
    <div style={{ position: "absolute", left: origin.x, top: layout.top, width: layout.screenWidth,
      height: layout.screenHeight + layout.chromeHeight, borderRadius: 24, overflow: "hidden",
      background: demoTheme.colors.surface, boxShadow: transition?.style === "cut" ? undefined : demoTheme.screen.shadow,
      filter: `blur(${motion.blur}px)`,
      opacity, transform: `translateX(${motion.translateX * width}px) scale(${motion.scale})` }}>
      <div style={{ height: layout.chromeHeight, background: demoTheme.colors.surfaceMuted }} />
      <div style={{ position: "relative", height: layout.screenHeight, overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 1920 * dsf, height: 1080 * dsf, transformOrigin: "0 0",
          transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})` }}>
          <div style={{ position: "absolute", left: 120 * dsf, top: 80 * dsf, fontSize: 28 * dsf, fontWeight: 500 }}>SwipeLux · {incoming ? "Customer form" : "Ops review"}</div>
          <div style={{ position: "absolute", left: rect.x * dsf, top: (rect.y - 100) * dsf, fontSize: 32 * dsf, fontWeight: 500 }}>{incoming ? kind === "carry-cut" ? "Request details" : "Needs changes" : "Reason shown to the customer"}</div>
          {kind === "carry-cut" && incoming ? <p style={{ position: "absolute", left: rect.x * dsf, top: rect.y * dsf,
            width: rect.width * dsf, margin: 0, fontSize: 28 * dsf, lineHeight: `${40 * dsf}px`, fontWeight: 400,
            color: concealProof ? "#B700D7" : demoTheme.colors.contentPrimary,
            background: demoTheme.colors.backdrop, borderRadius: 12 * dsf }}>
            <span style={{ fontWeight: 500, color: concealProof ? "#007A32" : demoTheme.colors.contentPrimary }}>Needs changes</span>
            {concealProof ? <><span style={{ color: demoTheme.colors.contentPrimary }}>{" · "}</span>{landTextLab.message}</> : ` · ${landTextLab.message}`}
          </p> : (
          <div style={{ position: "absolute", left: rect.x * dsf, top: rect.y * dsf, width: rect.width * dsf, height: rect.height * dsf,
            color: concealProof && incoming ? "#B700D7" : demoTheme.colors.contentPrimary,
            background: incoming ? demoTheme.colors.backdrop : demoTheme.colors.surfaceMuted, borderRadius: 12 * dsf, fontSize: 28 * dsf, lineHeight: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Describe the source of funds
          </div>
          )}
          {kind === "caption" ? <div style={{ position: "absolute", left: "50%", bottom: 12 * dsf,
            transform: "translateX(-50%)", padding: `${12 * dsf}px ${32 * dsf}px`, borderRadius: 8 * dsf,
            color: demoTheme.colors.surface, background: demoTheme.colors.accentPrimary, fontSize: 24 * dsf }}>Send request</div> : null}
          {incoming && !concealDisabled ? carryFlights(timeline).map((flight, index) => <CarryConcealer key={`conceal-${index}`}
            flight={flight} timeMs={time} deviceScaleFactor={dsf} cameraScale={camera.scale}
            frameScale={Math.min(width, height) / 1440} />) : null}
          {annotationOpacity > 0 ? <div style={{ opacity: annotationOpacity }}>
            {timeline.events.map((event, index) => event.kind === "spotlight" && annotationTime < annotationEndMs(timeline, event) ?
              <SpotlightTrack key={index} timeline={timeline} spotlight={event} timeMs={annotationTime} /> : null)}
          </div> : null}
        </div>
        {kind === "cut" ? <Cursor timeline={timeline} camera={camera}
          timeMs={movement.active && transition ? incoming ? transition.t + transition.cardMs : transition.t - 1000 / fps : sourceTime} /> : null}
        {annotationOpacity > 0 ? <div style={{ opacity: annotationOpacity }}>
          {timeline.events.map((event, index) => event.kind === "callout" && annotationTime < annotationEndMs(timeline, event) ?
            <Callout key={index} event={event} timeline={timeline} camera={camera} timeMs={annotationTime} width={layout.screenWidth} height={layout.screenHeight} /> : null)}
        </div> : null}
      </div>
    </div>
    );
  };
  const outgoingCamera = transition
    ? cameraPath.atFrame(Math.max(0, Math.ceil(transition.t * fps / 1000) - 1)) : camera;
  return <AbsoluteFill style={{ fontFamily: demoTheme.fontFamily, color: demoTheme.colors.contentPrimary }}>
    <style>{`@font-face { font-family: 'Geist Sans'; src: url('${staticFile("fonts/geist-sans-latin-400-v5.2.5.woff2")}'); font-weight: 400; }
      @font-face { font-family: 'Geist Sans'; src: url('${staticFile("fonts/geist-sans-latin-500-v5.2.5.woff2")}'); font-weight: 500; }`}</style>
    <Background />
    {transition?.style === "cut" ? <div style={{ position: "absolute", left: origin.x, top: layout.top,
      width: layout.screenWidth, height: layout.screenHeight + layout.chromeHeight,
      borderRadius: 24, boxShadow: demoTheme.screen.shadow }} /> : null}
    {movement.active ? <>
      {screen(false, outgoingCamera, movement.outgoing.opacity, movement.outgoing)}
      {screen(true, camera, movement.incoming.opacity, movement.incoming)}
    </> : screen(incoming, camera, 1)}
    {projected ? <Transition event={projected} timeMs={time} frameWidth={width} /> : null}
    {(kind === "rail" || kind === "cut" || kind === "carry-cut" || kind === "caption") ? <Rail state={rail} width={width} height={height} screenShift={screenShift} /> : null}
    {kind === "caption" ? timeline.events.map((event, index) => event.kind === "caption" ? <Caption key={index}
      timeline={timeline} caption={event} timeMs={sourceTime} bandTop={layout.captionTop} bandHeight={layout.captionHeight} /> : null) : null}
    {!concealProof && (kind === "carry" || kind === "carry-cut") ? carryFlights(timeline).map((flight, index) => <Carry key={index} flight={flight} timeline={timeline}
      cameraPath={cameraPath} fps={fps} timeMs={time} width={width} height={height} screenOrigin={origin} screenOriginAt={screenOriginAt} />) : null}
  </AbsoluteFill>;
}
export const RailLab = () => <Lab timeline={railLabTimeline} kind="rail" />;
export const CarryLab = () => <Lab timeline={carryLabTimeline} kind="carry" />;
export const CalloutLab = () => <Lab timeline={calloutLabTimeline} kind="callout" />;

export const CutLab = () => <Lab timeline={cutLabTimeline} kind="cut" />;
export const CarryCutLab = ({ concealProof = false, concealDisabled = false, postCutZoom = false }: {
  concealProof?: boolean; concealDisabled?: boolean; postCutZoom?: boolean;
}) =>
  <Lab timeline={postCutZoom ? { ...carryCutLabTimeline, durationMs: 9000,
    events: carryCutLabTimeline.events.map((event) => event.kind === "zoom" && event.t === 3300
      ? { ...event, t: 5540 } : event.kind === "land" ? { ...event, t: 7190 } : event) } : carryCutLabTimeline} kind="carry-cut" concealProof={concealProof} concealDisabled={concealDisabled} />;

export const CaptionLab = () => <Lab timeline={captionLabTimeline} kind="caption" />;
