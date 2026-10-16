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
import { WindowInset, windowMotion } from "./WindowInset";
import { Transition, transitionMotion } from "./Transition";
import { Callout } from "./Callout";
import { RoleBadge } from "./RoleBadge";
import { Background } from "./Background";
import { Caption } from "./Captions";
import { Outro, resolveOutro } from "./Outro";
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
  const timedTrack = <T extends TimelineEvent>(
    event: T,
    name: string,
    durationMs: number,
  ): TimedTrack<T> => ({
    name,
    ...msToFrameWindow(event.t, durationMs, fps),
    event,
  });
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
    .map((event) => timedTrack(event, `Callout: ${event.text}`, calloutTotalDuration(event)));
  const spotlights = timeline.events
    .filter((event): event is SpotlightEvent => event.kind === "spotlight")
    .map((event) =>
      timedTrack(event, "Spotlight", spotlightTotalDuration(event)),
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
    .map((event) =>
      timedTrack(
        event,
        `Transition: ${event.label}`,
        transitionTotalDuration(event),
      ),
    );
  const roleEvents = timeline.events
    .filter((event) => event.kind === "role")
    .sort((a, b) => a.t - b.t);
  const roles = roleEvents.map((event, index) =>
    timedTrack(
      event,
      `Role: ${event.label}`,
      (roleEvents[index + 1]?.t ?? (durationInFrames * 1000) / fps) -
        event.t +
        (roleEvents[index + 1] ? demoTheme.role.fadeMs : 0),
    ),
  );
  const outroEvent = timeline.events.find(
    (event): event is OutroEvent => event.kind === "outro",
  );

  return {
    screen: { name: "Screen", from: 0, durationInFrames },
    captions,
    callouts,
    spotlights,
    zooms,
    windows,
    transitions,
    roles,
    outro: outroEvent
      ? (() => {
          // The slate must persist to the video's final frame even when the
          // composition runs past t + durationMs (trailing capture time).
          const window = msToFrameWindow(
            outroEvent.t,
            outroEvent.durationMs,
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
  const layout = layoutFor(width, height, props.windowChrome);
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
  const camera = cameraPath.atFrame(frame);
  const videoSrc = resolveVideoSrc(props.videoSrc);
  const radius = Math.max(
    demoTheme.layout.minimumWindowRadius,
    layout.screenWidth * demoTheme.layout.windowRadiusRatio,
  );
  const timeMs = (frame / fps) * 1_000;
  const outro = resolveOutro(props.timeline, timeMs);
  const windowEvent = props.timeline.events.find(
    (event) =>
      event.kind === "window" &&
      event.t <= timeMs &&
      timeMs < event.t + windowTotalDuration(event),
  );
  const inset = windowMotion(
    windowEvent?.kind === "window" ? windowEvent : undefined,
    timeMs,
  );
  const transitionEvent = props.timeline.events.find(
    (event) =>
      event.kind === "transition" &&
      event.t <= timeMs &&
      timeMs < event.t + transitionTotalDuration(event),
  );
  const activeTransition = transitionEvent?.kind === "transition" ? transitionEvent : undefined;
  const transition = transitionMotion(activeTransition, timeMs);
  const outgoingFrame = activeTransition ? Math.max(0, msToFrame(activeTransition.t, fps) - 1) : 0;
  const outgoingCamera = cameraPath.atFrame(outgoingFrame);
  const outroScale = 1 - outro.progress * (1 - demoTheme.outro.recedeScale);
  const screenOpacity =
    1 - outro.progress * (1 - demoTheme.outro.screenOpacity);
  const tracks = useMemo(
    () => buildStudioTracks(props.timeline, fps, durationInFrames, cameraPath),
    [props.timeline, fps, durationInFrames, cameraPath],
  );

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
          {activeTransition ? (
            <div style={{ position: "absolute", left: 0, top: 0, opacity: screenOpacity * transition.outgoing.opacity,
              transform: `translateX(${transition.outgoing.translateX * width}px) scale(${transition.outgoing.scale})` }}>
              <Freeze frame={outgoingFrame}>
                <Screen width={layout.screenWidth} height={layout.screenHeight} radius={radius}
                  chrome={props.windowChrome} chromeHeight={layout.chromeHeight} timeline={props.timeline}
                  videoSrc={videoSrc} camera={outgoingCamera} showCursor={false} />
              </Freeze>
            </div>
          ) : null}
          <div style={{ position: "relative", opacity: screenOpacity * (activeTransition ? transition.incoming.opacity : 1),
            transform: `translateX(${activeTransition ? transition.incoming.translateX * width : 0}px) scale(${outroScale * inset.mainScale * (activeTransition ? transition.incoming.scale : 1)})` }}>
            <Screen width={layout.screenWidth} height={layout.screenHeight} radius={radius} chrome={props.windowChrome}
              chromeHeight={layout.chromeHeight} timeline={props.timeline} videoSrc={videoSrc} camera={camera}
              showCursor={!outro.started && !activeTransition}>
              {tracks.spotlights.map((track) => (
                <Sequence key={`spotlight-${track.event.t}`} name={track.name} from={track.from}
                  durationInFrames={track.durationInFrames} layout="none">
                  <SpotlightTrack timeline={props.timeline} spotlight={track.event} timeMs={timeMs} />
                </Sequence>
              ))}
            </Screen>
            <div style={{ position: "absolute", top: layout.chromeHeight, left: 0,
                width: layout.screenWidth, height: layout.screenHeight, overflow: "hidden" }}>
                {tracks.callouts.map((track) => (
                  <Sequence key={`callout-${track.event.t}`} name={track.name} from={track.from}
                    durationInFrames={track.durationInFrames} layout="none">
                    {outro.started || activeTransition ? null : (
                      <Callout event={track.event} timeMs={timeMs} timeline={props.timeline} camera={camera}
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
            timeMs={timeMs}
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
          <Transition event={track.event} timeMs={timeMs} frameWidth={width} />
        </Sequence>
      ))}
      <RoleBadge
        timeline={props.timeline}
        timeMs={timeMs}
        outroProgress={outro.progress}
        frameWidth={width}
        frameHeight={height}
        screenWidth={layout.screenWidth}
        screenTop={layout.top}
      />
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
          {outro.started ? null : (
            <Caption
              timeline={props.timeline}
              caption={track.event}
              bottom={layout.captionBottom}
              timeMs={timeMs}
            />
          )}
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
          <Outro outro={outro} frameWidth={width} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
}
