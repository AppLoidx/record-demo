import { useMemo } from "react";
import {
  AbsoluteFill,
  Freeze,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  assertTimeline,
  type Timeline,
  type TimelineEvent,
  windowTotalDuration,
  calloutTotalDuration,
  transitionTotalDuration,
} from "../lib/timeline";
import { createSceneCameraPath } from "../lib/scene-camera";
import {
  compositionFrameAtOrAfterTime,
  createTimeMap,
  timelineFrameForCompositionFrame,
  transitionVisibleCardMs,
} from "../lib/time-map";
import { WindowInset, windowMotion } from "./WindowInset";
import { Transition, transitionMotion, annotationHandoffOpacity } from "./Transition";
import { Callout } from "./Callout";
import { RoleBadge } from "./RoleBadge";
import { railScreenOffset, railState } from "../lib/rail";
import { carryFlights } from "../lib/carry";
import { Rail } from "./Rail";
import { Carry } from "./Carry";
import { Background } from "./Background";
import { Caption } from "./Captions";
import { Outro, outroScreenMotion, resolveOutro } from "./Outro";
import { Screen, type WindowChrome } from "./Screen";
import {
  type SpotlightEvent,
  SpotlightTrack,
  spotlightTotalDuration,
} from "./Spotlight";
import { captureViewport, demoTheme, msToFrame, msToFrameWindow } from "./theme";

type CaptionEvent = Extract<TimelineEvent, { kind: "caption" }>;
type OutroEvent = Extract<TimelineEvent, { kind: "outro" }>;

type TimedTrack<T extends TimelineEvent> = {
  name: string;
  from: number;
  durationInFrames: number;
  event: T;
};

/** An annotation belongs to its source scene, including in hand-edited timelines. */
export function annotationEndMs(timeline: Timeline, event: Extract<TimelineEvent, { kind: "callout" | "spotlight" }>) {
  const naturalEnd = event.t + (event.kind === "callout" ? calloutTotalDuration(event) : spotlightTotalDuration(event));
  return timeline.events.reduce((end, candidate) => candidate.kind === "transition" && candidate.t >= event.t
    ? Math.min(end, candidate.t) : end, naturalEnd);
}

export function buildStudioTracks(
  timeline: Timeline,
  fps: number,
  durationInFrames: number,
  cameraPath = createSceneCameraPath(
    timeline,
    fps,
    timeline.viewport.width * timeline.viewport.deviceScaleFactor,
    timeline.viewport.height * timeline.viewport.deviceScaleFactor,
  ),
) {
  const timeMap = createTimeMap(timeline);
  const timedTrack = <T extends TimelineEvent>(
    event: T,
    name: string,
    durationMs: number,
  ): TimedTrack<T> => {
    const startMs = timeMap.cuts.length === 0
      ? event.t
      : timeMap.toCompositionTime(event.t);
    const endMs = timeMap.cuts.length === 0
      ? event.t + durationMs
      : timeMap.toCompositionTime(event.t + durationMs);
    return {
      name,
      ...msToFrameWindow(startMs, Math.max(0, endMs - startMs), fps),
      event,
    };
  };
  const captions = timeline.events
    .filter((event): event is CaptionEvent => event.kind === "caption")
    .map((event) =>
      timedTrack(
        event,
        `Caption: "${event.text.slice(0, 28)}"`,
        event.durationMs,
      ),
    );
  const callouts = timeline.events.filter((event) => event.kind === "callout")
    .map((event) => timedTrack(event, `Callout: ${event.text}`, annotationEndMs(timeline, event) - event.t));
  const spotlights = timeline.events
    .filter((event): event is SpotlightEvent => event.kind === "spotlight")
    .map((event) =>
      timedTrack(event, "Spotlight", annotationEndMs(timeline, event) - event.t),
    );
  const zooms = cameraPath.moves.map(({ event, durationMs }) =>
    timedTrack(event, `Zoom ${event.rect === null ? "out" : "in"}`, durationMs),
  );
  const windows = timeline.events
    .filter((event) => event.kind === "window")
    .map((event) =>
      timedTrack(
        event,
        `Window: ${event.title ?? ""}`,
        windowTotalDuration(event),
      ),
    );
  const transitions = timeline.events
    .filter((event) => event.kind === "transition")
    .map((event) => {
      const projected = timeMap.cuts.length === 0
        ? event
        : {
            ...event,
            t: timeMap.toCompositionTime(event.t),
            cardMs: transitionVisibleCardMs(event),
          };
      return {
        name: event.style === "cut" ? "Cut" : `Transition: ${event.label}`,
        ...msToFrameWindow(
          projected.t,
          transitionTotalDuration(projected),
          fps,
        ),
        event: projected,
      };
    });
  const roleEvents = timeline.events
    .filter((event) => event.kind === "role")
    .sort((a, b) => a.t - b.t);
  const roles = roleEvents.map((event, index) => {
    const next = roleEvents[index + 1];
    if (timeMap.cuts.length === 0) {
      return timedTrack(
        event,
        `Role: ${event.label}`,
        (next?.t ?? (durationInFrames * 1000) / fps) - event.t +
          (next ? demoTheme.role.fadeMs : 0),
      );
    }
    const startMs = timeMap.toCompositionTime(event.t);
    const endMs = next
      ? timeMap.toCompositionTime(next.t + demoTheme.role.fadeMs)
      : (durationInFrames * 1_000) / fps;
    return {
      name: `Role: ${event.label}`,
      ...msToFrameWindow(startMs, Math.max(0, endMs - startMs), fps),
      event,
    };
  });
  const outroEvent = timeline.events.find(
    (event): event is OutroEvent => event.kind === "outro",
  );
  const railEvents = timeline.events.filter((event) =>
    event.kind === "rail" || event.kind === "rail-back" || event.kind === "rail-off").sort((a, b) => a.t - b.t);
  const rails = railEvents.map((event, index) => {
    const start = timeMap.toCompositionTime(event.t);
    const next = railEvents[index + 1];
    const end = event.kind === "rail-off" ? start + demoTheme.rail.fadeMs
      : next ? timeMap.toCompositionTime(next.t) + demoTheme.rail.fadeMs : durationInFrames * 1000 / fps;
    const name = event.kind === "rail" ? `Rail: ${event.steps[event.active]}`
      : event.kind === "rail-back" ? `Rail return: ${event.from} → ${event.to}` : "Rail off";
    return { name, ...msToFrameWindow(start, Math.max(0, end - start), fps), event };
  });
  const carries = carryFlights(timeline).map((flight) => ({
    name: `Carry: ${flight.carry.text}`,
    ...msToFrameWindow(flight.carry.t, flight.land.t + demoTheme.carry.landMs - flight.carry.t, fps),
    flight,
  }));

  return {
    screen: { name: "Screen", from: 0, durationInFrames },
    captions,
    callouts,
    spotlights,
    zooms,
    windows,
    transitions,
    roles,
    rails,
    carries,
    outro: outroEvent
      ? (() => {
          // The slate must persist to the video's final frame even when the
          // composition runs past t + durationMs (trailing capture time).
          const startMs = timeMap.cuts.length === 0
            ? outroEvent.t
            : timeMap.toCompositionTime(outroEvent.t);
          const endMs = timeMap.cuts.length === 0
            ? outroEvent.t + outroEvent.durationMs
            : timeMap.toCompositionTime(
                outroEvent.t + outroEvent.durationMs,
              );
          const window = msToFrameWindow(
            startMs,
            Math.max(0, endMs - startMs),
            fps,
          );
          return {
            name: `Outro: "${outroEvent.title}"`,
            from: window.from,
            durationInFrames: Math.max(
              window.durationInFrames,
              durationInFrames - window.from,
            ),
            event: outroEvent,
          };
        })()
      : undefined,
  };
}

export type DemoVideoProps = {
  timeline: Timeline;
  videoSrc: string;
  windowChrome: WindowChrome;
};

export function assertCaptureViewport(timeline: Timeline) {
  const actual = timeline.viewport;
  if (
    actual.width !== captureViewport.width ||
    actual.height !== captureViewport.height ||
    actual.deviceScaleFactor !== captureViewport.deviceScaleFactor
  ) {
    throw new Error(
      "Timeline viewport mismatch: expected " +
        `${captureViewport.width}x${captureViewport.height} at DSF ${captureViewport.deviceScaleFactor}; ` +
        `received ${actual.width}x${actual.height} at DSF ${actual.deviceScaleFactor}`,
    );
  }

  if (timeline.capture.fps !== captureViewport.fps) {
    throw new Error(
      `Timeline capture fps mismatch: expected ${captureViewport.fps}; received ${timeline.capture.fps}`,
    );
  }
}

export function assertDemoVideoProps(props: DemoVideoProps) {
  assertTimeline(props.timeline);
  assertCaptureViewport(props.timeline);

  if (!props.videoSrc) {
    throw new Error("Demo video requires a videoSrc");
  }

  if (!["none", "macos", "browser"].includes(props.windowChrome)) {
    throw new Error(`Unknown window chrome: ${props.windowChrome}`);
  }
}

function chromeHeightFor(screenWidth: number, chrome: WindowChrome) {
  return chrome === "none"
    ? 0
    : Math.max(
        demoTheme.screen.chromeMinimumHeight,
        screenWidth * demoTheme.screen.chromeHeightRatio,
      );
}

export function layoutFor(
  width: number,
  height: number,
  chrome: WindowChrome = "none",
) {
  const aspect = width / height;
  if (aspect >= demoTheme.layout.landscape.minAspect) {
    const screenWidth = width * demoTheme.layout.landscape.screenWidth;
    const chromeHeight = chromeHeightFor(screenWidth, chrome);
    return {
      screenWidth,
      screenHeight: screenWidth * (9 / 16),
      chromeHeight,
      top: (height - screenWidth * (9 / 16) - chromeHeight) / 2,
      captionBottom: height * demoTheme.layout.landscape.captionBottom,
    };
  }

  if (aspect >= demoTheme.layout.square.minAspect) {
    const screenWidth = width * demoTheme.layout.square.screenWidth;
    const chromeHeight = chromeHeightFor(screenWidth, chrome);
    return {
      screenWidth,
      screenHeight: height * demoTheme.layout.square.screenHeight,
      chromeHeight,
      top: height * demoTheme.layout.square.screenTop - chromeHeight / 2,
      captionBottom: height * demoTheme.layout.square.captionBottom,
    };
  }

  const screenWidth = width * demoTheme.layout.portrait.screenWidth;
  const chromeHeight = chromeHeightFor(screenWidth, chrome);
  return {
    screenWidth,
    screenHeight: height * demoTheme.layout.portrait.screenHeight,
    chromeHeight,
    top: height * demoTheme.layout.portrait.screenTop - chromeHeight / 2,
    captionBottom: height * demoTheme.layout.portrait.captionBottom,
  };
}

function resolveVideoSrc(videoSrc: string) {
  return /^(?:file|https?):\/\//.test(videoSrc)
    ? videoSrc
    : staticFile(videoSrc);
}

function FontFaces() {
  const regular = staticFile("fonts/geist-sans-latin-400-v5.2.5.woff2");
  const medium = staticFile("fonts/geist-sans-latin-500-v5.2.5.woff2");

  return (
    <style>
      {`
        @font-face {
          font-family: "Geist Sans";
          src: url("${regular}") format("woff2");
          font-style: normal;
          font-weight: 400;
          font-display: block;
        }
        @font-face {
          font-family: "Geist Sans";
          src: url("${medium}") format("woff2");
          font-style: normal;
          font-weight: 500;
          font-display: block;
        }
      `}
    </style>
  );
}

export function DemoVideo(props: DemoVideoProps) {
  assertDemoVideoProps(props);
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const compositionTimeMs = (frame / fps) * 1_000;
  const rail = railState(props.timeline, compositionTimeMs);
  const baseLayout = layoutFor(width, height, props.windowChrome);
  const screenShift = railScreenOffset(props.timeline, width, height, baseLayout.top, 1);
  const layout = { ...baseLayout, top: baseLayout.top + screenShift * rail.opacity };
  const screenOriginAt = (time: number) => ({
    x: (width - baseLayout.screenWidth) / 2,
    y: baseLayout.top + baseLayout.chromeHeight + screenShift * railState(props.timeline, time).opacity,
  });
  const timeMap = useMemo(() => createTimeMap(props.timeline), [props.timeline]);
  const cameraPath = useMemo(
    () =>
      createSceneCameraPath(
        props.timeline,
        fps,
        layout.screenWidth,
        layout.screenHeight,
      ),
    [props.timeline, fps, layout.screenWidth, layout.screenHeight],
  );
  const sourceFrame = timelineFrameForCompositionFrame(frame, fps, timeMap);
  const camera = cameraPath.atFrame(sourceFrame);
  const videoSrc = resolveVideoSrc(props.videoSrc);
  const radius = Math.max(
    demoTheme.layout.minimumWindowRadius,
    layout.screenWidth * demoTheme.layout.windowRadiusRatio,
  );
  const sourceTimeMs = timeMap.cuts.length === 0
    ? compositionTimeMs
    : timeMap.toTimelineTime(compositionTimeMs);
  const outro = resolveOutro(props.timeline, sourceTimeMs);
  const windowEvent = props.timeline.events.find(
    (event) =>
      event.kind === "window" &&
      event.t <= sourceTimeMs &&
      sourceTimeMs < event.t + windowTotalDuration(event),
  );
  const inset = windowMotion(
    windowEvent?.kind === "window" ? windowEvent : undefined,
    sourceTimeMs,
  );
  const tracks = useMemo(
    () => buildStudioTracks(props.timeline, fps, durationInFrames, cameraPath),
    [props.timeline, fps, durationInFrames, cameraPath],
  );
  const activeTransition = tracks.transitions.find(
    ({ event }) =>
      event.t <= compositionTimeMs &&
      compositionTimeMs < event.t + transitionTotalDuration(event),
  )?.event;
  const isCut = activeTransition?.style === "cut";
  const transition = transitionMotion(activeTransition, compositionTimeMs);
  const outgoingFrame = activeTransition
    ? Math.max(
        0,
        (timeMap.cuts.length === 0
          ? msToFrame(activeTransition.t, fps)
          : compositionFrameAtOrAfterTime(activeTransition.t, fps)) - 1,
      )
    : 0;
  const outgoingSourceFrame = timelineFrameForCompositionFrame(
    outgoingFrame,
    fps,
    timeMap,
  );
  const outgoingCamera = cameraPath.atFrame(outgoingSourceFrame);
  const outgoingTimeMs = outgoingSourceFrame * 1000 / fps;
  const annotationOpacity = activeTransition ? annotationHandoffOpacity(activeTransition, compositionTimeMs) : 0;
  const incomingFrame = activeTransition ? compositionFrameAtOrAfterTime(activeTransition.t, fps) : frame;
  const incomingTimeMs = isCut ? timeMap.toTimelineTime(incomingFrame * 1000 / fps) : sourceTimeMs;
  const incomingCamera = isCut ? cameraPath.atFrame(incomingTimeMs * fps / 1000) : camera;
  const outroScreen = outroScreenMotion(
    outro.event ? sourceTimeMs - outro.event.t : -1,
  );
  const outroScale = outroScreen.scale;
  const screenOpacity = outroScreen.opacity;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: demoTheme.colors.backdrop,
        fontFamily: demoTheme.fontFamily,
      }}
    >
      <FontFaces />
      <Background />
      <Sequence
        name={tracks.screen.name}
        from={tracks.screen.from}
        durationInFrames={tracks.screen.durationInFrames}
        layout="none"
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: layout.top,
            transform: "translateX(-50%)",
          }}
        >
          {isCut ? <div style={{ position: "absolute", inset: 0, width: layout.screenWidth + 2,
            height: layout.screenHeight + layout.chromeHeight + 2, borderRadius: radius,
            boxShadow: demoTheme.screen.shadow, opacity: screenOpacity }} /> : null}
          {activeTransition ? (
            <div style={{ position: "absolute", left: 0, top: 0, opacity: screenOpacity * transition.outgoing.opacity,
              filter: `blur(${transition.outgoing.blur}px)`,
              transform: `translateX(${transition.outgoing.translateX * width}px) scale(${transition.outgoing.scale})` }}>
              <Freeze frame={outgoingFrame}>
                <Screen shadow={!isCut} width={layout.screenWidth} height={layout.screenHeight} radius={radius}
                  chrome={props.windowChrome} chromeHeight={layout.chromeHeight} timeline={props.timeline}
                  videoSrc={videoSrc} camera={outgoingCamera} showCursor={activeTransition.style === "cut"}
                  timeMap={timeMap} timeMs={isCut ? outgoingTimeMs : sourceTimeMs}>
                  {annotationOpacity > 0 ? <div data-scene-annotations style={{ opacity: annotationOpacity }}>
                    {tracks.spotlights.filter(({ event }) => event.t <= outgoingTimeMs && outgoingTimeMs < annotationEndMs(props.timeline, event))
                      .map(({ event }) => <SpotlightTrack key={event.t} timeline={props.timeline} spotlight={event} timeMs={outgoingTimeMs} />)}
                  </div> : null}
                </Screen>
              </Freeze>
              {annotationOpacity > 0 ? <div data-scene-annotations style={{ opacity: annotationOpacity }}>
                <div style={{ position: "absolute", top: layout.chromeHeight, left: 0,
                  width: layout.screenWidth, height: layout.screenHeight, overflow: "hidden" }}>
                  {tracks.callouts.filter(({ event }) => event.t <= outgoingTimeMs && outgoingTimeMs < annotationEndMs(props.timeline, event))
                    .map(({ event }) => <Callout key={event.t} event={event} timeMs={outgoingTimeMs} timeline={props.timeline}
                      camera={outgoingCamera} width={layout.screenWidth} height={layout.screenHeight} />)}
                </div>
              </div> : null}
            </div>
          ) : null}
          <div style={{ position: "relative", opacity: screenOpacity * (activeTransition ? transition.incoming.opacity : 1),
            transform: `translateX(${activeTransition ? transition.incoming.translateX * width : 0}px) scale(${outroScale * inset.mainScale * (activeTransition ? transition.incoming.scale : 1)})` }}>
            <Freeze active={activeTransition?.style === "cut"}
              frame={incomingFrame}>
            <Screen shadow={!isCut} width={layout.screenWidth} height={layout.screenHeight} radius={radius} chrome={props.windowChrome}
              chromeHeight={layout.chromeHeight} timeline={props.timeline} videoSrc={videoSrc} camera={incomingCamera}
              showCursor={!outro.started && (!activeTransition || activeTransition.style === "cut")} timeMap={timeMap} timeMs={incomingTimeMs}>
              {tracks.spotlights.filter(({ event }) => sourceTimeMs < annotationEndMs(props.timeline, event)).map((track) => (
                <Sequence key={`spotlight-${track.event.t}`} name={track.name} from={track.from}
                  durationInFrames={track.durationInFrames} layout="none">
                  <SpotlightTrack timeline={props.timeline} spotlight={track.event} timeMs={sourceTimeMs} />
                </Sequence>
              ))}
            </Screen>
            </Freeze>
            <div style={{ position: "absolute", top: layout.chromeHeight, left: 0,
                width: layout.screenWidth, height: layout.screenHeight, overflow: "hidden" }}>
                {tracks.callouts.filter(({ event }) => sourceTimeMs < annotationEndMs(props.timeline, event)).map((track) => (
                  <Sequence key={`callout-${track.event.t}`} name={track.name} from={track.from}
                    durationInFrames={track.durationInFrames} layout="none">
                    {outro.started || activeTransition ? null : (
                      <Callout event={track.event} timeMs={sourceTimeMs} timeline={props.timeline} camera={camera}
                        width={layout.screenWidth} height={layout.screenHeight} />
                    )}
                  </Sequence>
                ))}
              </div>
            <div style={{ position: "absolute", inset: 0, borderRadius: radius, background: "black",
              opacity: inset.dim, pointerEvents: "none" }} />
          </div>
        </div>
      </Sequence>
      {tracks.windows.map((track) => (
        <Sequence
          key={`window-${track.event.t}`}
          name={track.name}
          from={track.from}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          <WindowInset
            event={track.event}
            timeMs={sourceTimeMs}
            frameWidth={width}
            frameHeight={height}
          />
        </Sequence>
      ))}
      {tracks.transitions.map((track) => (
        <Sequence
          key={`transition-${track.event.t}`}
          name={track.name}
          from={track.from}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          <Transition event={track.event} timeMs={compositionTimeMs} frameWidth={width} />
        </Sequence>
      ))}
      <div style={{ opacity: 1 - rail.opacity }}><RoleBadge
        timeline={props.timeline}
        timeMs={sourceTimeMs}
        outroProgress={outro.progress}
        frameWidth={width}
        frameHeight={height}
        screenWidth={layout.screenWidth}
        screenTop={layout.top}
      /></div>
      <Rail state={rail} width={width} height={height} outroProgress={outro.progress} screenShift={screenShift} />
      {tracks.rails.map((track, index) => (
        <Sequence key={`rail-${index}`} name={track.name} from={track.from}
          durationInFrames={track.durationInFrames} layout="none">{null}</Sequence>
      ))}
      {tracks.carries.map((track, index) => (
        <Sequence key={`carry-${index}`} name={track.name} from={track.from}
          durationInFrames={track.durationInFrames} layout="none">
          <Carry flight={track.flight} timeline={props.timeline} cameraPath={cameraPath} fps={fps}
            timeMs={compositionTimeMs} width={width} height={height} outroProgress={outro.progress}
            screenOriginAt={screenOriginAt}
            screenOrigin={{ x: (width - layout.screenWidth) / 2, y: layout.top + layout.chromeHeight }} />
        </Sequence>
      ))}
      {tracks.roles.map((track) => (
        <Sequence
          key={`role-${track.event.t}`}
          name={track.name}
          from={track.from}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          {null}
        </Sequence>
      ))}
      {tracks.captions.map((track) => (
        <Sequence
          key={`caption-${track.event.t}`}
          name={track.name}
          from={track.from}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          <div style={{ opacity: 1 - outro.progress }}>
            <Caption
              timeline={props.timeline}
              caption={track.event}
              bottom={layout.captionBottom}
              timeMs={sourceTimeMs}
            />
          </div>
        </Sequence>
      ))}
      {tracks.zooms.map((track) => (
        <Sequence
          key={`zoom-${track.event.t}`}
          name={track.name}
          from={track.from}
          durationInFrames={track.durationInFrames}
          layout="none"
        >
          {null}
        </Sequence>
      ))}
      {/* Outro ignores its Sequence offset by design; progress is resolved at the top level. */}
      {tracks.outro ? (
        <Sequence
          name={tracks.outro.name}
          from={tracks.outro.from}
          durationInFrames={tracks.outro.durationInFrames}
          layout="none"
        >
          <Outro outro={outro} frameWidth={width} timeMs={sourceTimeMs} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
}
