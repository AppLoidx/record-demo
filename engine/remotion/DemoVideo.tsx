import { useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  assertTimeline,
  type Timeline,
  type TimelineEvent,
} from "../lib/timeline";
import { Background } from "./Background";
import { Caption } from "./Captions";
import { Outro, resolveOutro } from "./Outro";
import { Screen, type WindowChrome } from "./Screen";
import {
  type SpotlightEvent,
  SpotlightTrack,
  spotlightTotalDuration,
} from "./Spotlight";
import { captureViewport, demoTheme, msToFrameWindow } from "./theme";
import { resolveCameraTransform } from "./zoom";

type CaptionEvent = Extract<TimelineEvent, { kind: "caption" }>;
type ZoomEvent = Extract<TimelineEvent, { kind: "zoom" }>;
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
  const spotlights = timeline.events
    .filter((event): event is SpotlightEvent => event.kind === "spotlight")
    .map((event) =>
      timedTrack(event, "Spotlight", spotlightTotalDuration(event)),
    );
  const zooms = timeline.events
    .filter((event): event is ZoomEvent => event.kind === "zoom")
    .map((event) =>
      timedTrack(
        event,
        `Zoom ${event.rect === null ? "out" : "in"}`,
        Math.max(demoTheme.zoom.minimumDurationMs, event.durationMs),
      ),
    );
  const outroEvent = timeline.events.find(
    (event): event is OutroEvent => event.kind === "outro",
  );

  return {
    screen: { name: "Screen", from: 0, durationInFrames },
    captions,
    spotlights,
    zooms,
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
  const camera = resolveCameraTransform(
    props.timeline,
    frame,
    fps,
    layout.screenWidth,
    layout.screenHeight,
  );
  const videoSrc = resolveVideoSrc(props.videoSrc);
  const radius = Math.max(
    demoTheme.layout.minimumWindowRadius,
    layout.screenWidth * demoTheme.layout.windowRadiusRatio,
  );
  const timeMs = (frame / fps) * 1_000;
  const outro = resolveOutro(props.timeline, timeMs);
  const outroScale =
    1 - outro.progress * (1 - demoTheme.outro.recedeScale);
  const screenOpacity =
    1 - outro.progress * (1 - demoTheme.outro.screenOpacity);
  const tracks = useMemo(
    () => buildStudioTracks(props.timeline, fps, durationInFrames),
    [props.timeline, fps, durationInFrames],
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
          <div
            style={{
              opacity: screenOpacity,
              transform: `scale(${outroScale})`,
              willChange: "transform, opacity",
            }}
          >
            <Screen
              width={layout.screenWidth}
              height={layout.screenHeight}
              radius={radius}
              chrome={props.windowChrome}
              chromeHeight={layout.chromeHeight}
              timeline={props.timeline}
              videoSrc={videoSrc}
              camera={camera}
              showCursor={!outro.started}
            >
              {tracks.spotlights.map((track) => (
                <Sequence
                  key={`spotlight-${track.event.t}`}
                  name={track.name}
                  from={track.from}
                  durationInFrames={track.durationInFrames}
                  layout="none"
                >
                  <SpotlightTrack
                    timeline={props.timeline}
                    spotlight={track.event}
                    timeMs={timeMs}
                  />
                </Sequence>
              ))}
            </Screen>
          </div>
        </div>
      </Sequence>
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
