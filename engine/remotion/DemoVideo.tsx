import {
  AbsoluteFill,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { assertTimeline, type Timeline } from "../lib/timeline";
import { Background } from "./Background";
import { Captions } from "./Captions";
import { Screen, type WindowChrome } from "./Screen";
import { captureViewport, demoTheme } from "./theme";
import { resolveCameraTransform } from "./zoom";

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
  const { fps, width, height } = useVideoConfig();
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

  return (
    <AbsoluteFill
      style={{
        backgroundColor: demoTheme.colors.backdrop,
        fontFamily: demoTheme.fontFamily,
      }}
    >
      <FontFaces />
      <Background />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: layout.top,
          transform: "translateX(-50%)",
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
        />
      </div>
      <Captions timeline={props.timeline} bottom={layout.captionBottom} />
    </AbsoluteFill>
  );
}
