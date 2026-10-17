import { interpolate } from "remotion";
import { cursorPosition } from "../lib/cursor-position";
import { windowTotalDuration, transitionTotalDuration, type Timeline } from "../lib/timeline";
import { demoTheme } from "./theme";
import type { CameraTransform } from "./zoom";

type CursorProps = {
  timeline: Timeline;
  camera: CameraTransform;
  timeMs: number;
};

function latestClick(timeline: Timeline, timeMs: number) {
  const clicks = timeline.events.filter(
    (event) => event.kind === "click" && event.t <= timeMs,
  );
  return clicks.at(-1);
}

/** Main pointer stays hidden through every effect phase, then returns without a pop. */
export function cursorVisibility(timeline: Timeline, timeMs: number) {
  let opacity = 1;
  for (const event of timeline.events) {
    if (event.kind !== "window" && event.kind !== "transition") continue;
    const duration = event.kind === "window" ? windowTotalDuration(event) : transitionTotalDuration(event);
    const end = event.t + duration;
    if (timeMs >= event.t && timeMs < end) return 0;
    if (timeMs >= end) opacity = Math.min(opacity, Math.min(1, (timeMs - end) / demoTheme.cursor.resumeMs));
  }
  return opacity;
}

export function Cursor({ timeline, camera, timeMs }: CursorProps) {
  const position = cursorPosition(timeline, timeMs);

  if (!position) return null;

  const click = latestClick(timeline, timeMs);
  const clickAge = click ? timeMs - click.t : Number.POSITIVE_INFINITY;
  const opacity = interpolate(
    timeMs,
    [position.firstAt, position.firstAt + demoTheme.cursor.enterDurationMs],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const deviceScaleFactor = timeline.viewport.deviceScaleFactor;
  const x = camera.translateX + position.x * deviceScaleFactor * camera.scale;
  const y = camera.translateY + position.y * deviceScaleFactor * camera.scale;

  return <CursorVisual x={x} y={y} opacity={opacity * cursorVisibility(timeline, timeMs)} clickAge={clickAge} />;
}

export function CursorVisual({
  x,
  y,
  opacity,
  clickAge,
}: {
  x: number;
  y: number;
  opacity: number;
  clickAge: number;
}) {
  const clickScale =
    clickAge <= demoTheme.cursor.releaseDurationMs
      ? interpolate(
          clickAge,
          [
            0,
            demoTheme.cursor.pressDurationMs,
            demoTheme.cursor.releaseDurationMs,
          ],
          [1, demoTheme.cursor.pressedScale, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )
      : 1;
  const rippleProgress = interpolate(
    clickAge,
    [0, demoTheme.cursor.rippleDurationMs],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: demoTheme.cursor.containerSize,
        height: demoTheme.cursor.containerSize,
        opacity,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${clickScale})`,
        transformOrigin: "3px 3px",
        willChange: "transform, opacity",
      }}
    >
      {clickAge <= demoTheme.cursor.rippleDurationMs ? (
        <div
          style={{
            position: "absolute",
            left: -15,
            top: -15,
            width: demoTheme.cursor.rippleSize,
            height: demoTheme.cursor.rippleSize,
            borderRadius: "999px",
            border: `3px solid ${demoTheme.colors.clickRipple}`,
            opacity: 1 - rippleProgress,
            transform: `scale(${demoTheme.cursor.rippleStartScale + rippleProgress * demoTheme.cursor.rippleGrowth})`,
            transformOrigin: "center",
          }}
        />
      ) : null}
      <svg
        width={demoTheme.cursor.pointerWidth}
        height={demoTheme.cursor.pointerHeight}
        viewBox="0 0 34 38"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          filter: "drop-shadow(0 3px 4px rgba(0, 0, 0, 0.22))",
        }}
      >
        <path
          d="M3.2 2.5L29.1 22.2L16.7 23.7L10.2 34.7L3.2 2.5Z"
          fill={demoTheme.colors.accentPrimary}
          stroke={demoTheme.colors.cursorOutline}
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
