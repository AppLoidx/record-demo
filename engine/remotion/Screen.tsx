import type { CSSProperties } from "react";
import { OffthreadVideo } from "remotion";
import type { Timeline } from "../lib/timeline";
import { Cursor } from "./Cursor";
import { Spotlight } from "./Spotlight";
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
};

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

function ChromeBar({
  variant,
  height,
}: {
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
      <UrlPill />
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
}: {
  width: number;
  height: number;
  timeline: Timeline;
  videoSrc: string;
  camera: CameraTransform;
  radius: CSSProperties["borderRadius"];
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
        <OffthreadVideo
          src={videoSrc}
          muted
          style={{
            width: sourceWidth,
            height: sourceHeight,
            objectFit: "fill",
          }}
        />
        <Spotlight timeline={timeline} />
      </div>
      <Cursor timeline={timeline} camera={camera} />
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
      />
    </div>
  );
}
