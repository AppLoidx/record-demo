import type { CSSProperties, ReactNode } from "react";
import { OffthreadVideo, Sequence, useVideoConfig } from "remotion";
import {
  timeMapFramePieces,
  type TimeMap,
} from "../lib/time-map";
import type { Timeline } from "../lib/timeline";
import { Cursor } from "./Cursor";
import { demoTheme } from "./theme";
import type { CameraTransform } from "./zoom";

export type WindowChrome = "none" | "macos" | "browser";

type ScreenProps = {
  width: number;
  height: number;
  radius: number;
  chrome: WindowChrome;
  chromeHeight: number;
  timeline: Timeline;
  videoSrc: string;
  camera: CameraTransform;
  showCursor: boolean;
  timeMap: TimeMap;
  timeMs: number;
  children?: ReactNode;
};

function TimelineVideo({
  videoSrc,
  timeMap,
  style,
}: {
  videoSrc: string;
  timeMap: TimeMap;
  style: CSSProperties;
}) {
  const { fps, durationInFrames } = useVideoConfig();
  if (timeMap.cuts.length === 0) {
    return <OffthreadVideo src={videoSrc} muted style={style} />;
  }

  return timeMapFramePieces(timeMap, fps, durationInFrames).map((piece) => {
    return (
      <Sequence
        key={`${piece.from}-${piece.startFrom}`}
        from={piece.from}
        durationInFrames={piece.durationInFrames}
        layout="none"
      >
        <OffthreadVideo
          src={videoSrc}
          muted
          startFrom={piece.startFrom}
          style={style}
        />
      </Sequence>
    );
  });
}

function UrlPill() {
  return (
    <div
      style={{
        width: demoTheme.screen.urlPillWidth,
        minWidth: demoTheme.screen.urlPillMinimumWidth,
        height: demoTheme.screen.urlPillHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `0 ${demoTheme.screen.chromeHorizontalPadding}px`,
        border: `1px solid ${demoTheme.colors.line}`,
        borderRadius: 999,
        backgroundColor: demoTheme.colors.surface,
        color: demoTheme.colors.contentSecondary,
        fontFamily: demoTheme.fontFamily,
        fontSize: 14,
        fontWeight: 400,
        letterSpacing: "-0.01em",
      }}
    >
      {demoTheme.screen.urlPillText}
    </div>
  );
}

export function ChromeBar({
  variant,
  height,
  title,
}: {
  title?: string;
  variant: Exclude<WindowChrome, "none">;
  height: number;
}) {
  const common: CSSProperties = {
    position: "relative",
    height,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderBottom: `1px solid ${demoTheme.colors.line}`,
    backgroundColor: demoTheme.colors.surfaceMuted,
  };

  return (
    <div style={common}>
      {variant === "macos" ? (
        <div
          style={{
            position: "absolute",
            left: demoTheme.screen.chromeHorizontalPadding,
            display: "flex",
            gap: demoTheme.screen.chromeControlGap,
          }}
        >
          {demoTheme.colors.chromeControls.map((color) => (
            <span
              key={color}
              style={{
                width: demoTheme.screen.chromeControlSize,
                height: demoTheme.screen.chromeControlSize,
                borderRadius: "50%",
                backgroundColor: color,
                boxShadow: "inset 0 0 0 0.5px rgba(0, 0, 0, 0.12)",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            left: demoTheme.screen.chromeHorizontalPadding,
            display: "flex",
            alignItems: "center",
            gap: 15,
            color: demoTheme.colors.contentSecondary,
            fontFamily: demoTheme.fontFamily,
            fontSize: 22,
          }}
        >
          <span>‹</span>
          <span>›</span>
        </div>
      )}
      {title === undefined ? (
        <UrlPill />
      ) : (
        <div
          style={{
            maxWidth: "65%",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            fontFamily: demoTheme.fontFamily,
            fontSize: 16,
            fontWeight: 500,
            color: demoTheme.colors.contentSecondary,
          }}
        >
          {title}
        </div>
      )}
    </div>
  );
}

function VideoViewport({
  width,
  height,
  timeline,
  videoSrc,
  camera,
  radius,
  showCursor,
  timeMap,
  timeMs,
  children,
}: {
  width: number;
  height: number;
  timeline: Timeline;
  videoSrc: string;
  camera: CameraTransform;
  radius: CSSProperties["borderRadius"];
  showCursor: boolean;
  timeMap: TimeMap;
  timeMs: number;
  children?: ReactNode;
}) {
  const sourceWidth =
    timeline.viewport.width * timeline.viewport.deviceScaleFactor;
  const sourceHeight =
    timeline.viewport.height * timeline.viewport.deviceScaleFactor;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        borderRadius: radius,
        backgroundColor: demoTheme.colors.surface,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: sourceWidth,
          height: sourceHeight,
          transform: `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.translateX}, ${camera.translateY})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <TimelineVideo
          videoSrc={videoSrc}
          timeMap={timeMap}
          style={{
            width: sourceWidth,
            height: sourceHeight,
            objectFit: "fill",
          }}
        />
        {children}
      </div>
      {showCursor ? (
        <Cursor timeline={timeline} camera={camera} timeMs={timeMs} />
      ) : null}
    </div>
  );
}

export function Screen({
  width,
  height,
  radius,
  chrome,
  chromeHeight,
  timeline,
  videoSrc,
  camera,
  showCursor,
  timeMap,
  timeMs,
  children,
}: ScreenProps) {
  const viewportRadius =
    chrome === "none" ? radius : `0 0 ${radius}px ${radius}px`;

  return (
    <div
      style={{
        width,
        overflow: "hidden",
        border: `1px solid ${demoTheme.colors.line}`,
        borderRadius: radius,
        backgroundColor: demoTheme.colors.surface,
        boxShadow: demoTheme.screen.shadow,
      }}
    >
      {chrome === "none" ? null : (
        <ChromeBar variant={chrome} height={chromeHeight} />
      )}
      <VideoViewport
        width={width}
        height={height}
        timeline={timeline}
        videoSrc={videoSrc}
        camera={camera}
        radius={viewportRadius}
        showCursor={showCursor}
        timeMap={timeMap}
        timeMs={timeMs}
      >
        {children}
      </VideoViewport>
    </div>
  );
}
