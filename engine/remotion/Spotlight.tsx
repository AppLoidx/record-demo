import { useId } from "react";
import { Easing } from "remotion";
import type { Timeline, TimelineEvent } from "../lib/timeline";
import { demoTheme } from "./theme";

export type SpotlightEvent = Extract<TimelineEvent, { kind: "spotlight" }>;
const [spotlightX1, spotlightY1, spotlightX2, spotlightY2] =
  demoTheme.zoom.easing;
const spotlightEasing = Easing.bezier(
  spotlightX1,
  spotlightY1,
  spotlightX2,
  spotlightY2,
);

export function spotlightTotalDuration(spotlight: SpotlightEvent) {
  return spotlight.durationMs * 2 + spotlight.holdMs;
}

export function resolveSpotlightOpacity(
  spotlight: SpotlightEvent,
  timeMs: number,
) {
  const elapsed = timeMs - spotlight.t;
  const durationMs = spotlight.durationMs;
  const holdMs = spotlight.holdMs;
  const totalDurationMs = spotlightTotalDuration(spotlight);

  if (elapsed < 0 || elapsed > totalDurationMs) return 0;
  if (durationMs === 0) return elapsed <= holdMs ? 1 : 0;

  if (elapsed < durationMs) {
    return spotlightEasing(elapsed / durationMs);
  }
  if (elapsed <= durationMs + holdMs) {
    return 1;
  }

  return spotlightEasing((totalDurationMs - elapsed) / durationMs);
}

function activeSpotlightAt(timeline: Timeline, timeMs: number) {
  return timeline.events
    .filter((event) => event.kind === "spotlight")
    .filter(
      (event) =>
        event.t <= timeMs && event.t + spotlightTotalDuration(event) >= timeMs,
    )
    .at(-1);
}

function SpotlightVisual({
  timeline,
  spotlight,
  timeMs,
}: {
  timeline: Timeline;
  spotlight: SpotlightEvent;
  timeMs: number;
}) {
  const maskId = useId();
  const opacity = resolveSpotlightOpacity(spotlight, timeMs);
  const deviceScaleFactor = timeline.viewport.deviceScaleFactor;
  const sourceWidth = timeline.viewport.width * deviceScaleFactor;
  const sourceHeight = timeline.viewport.height * deviceScaleFactor;
  const rect = {
    x: spotlight.rect.x * deviceScaleFactor,
    y: spotlight.rect.y * deviceScaleFactor,
    width: spotlight.rect.width * deviceScaleFactor,
    height: spotlight.rect.height * deviceScaleFactor,
  };
  const radius = demoTheme.spotlight.radius * deviceScaleFactor;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        pointerEvents: "none",
        willChange: "opacity",
      }}
    >
      <svg
        width={sourceWidth}
        height={sourceHeight}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect width={sourceWidth} height={sourceHeight} fill="white" />
            <rect {...rect} rx={radius} fill="black" />
          </mask>
        </defs>
        <rect
          width={sourceWidth}
          height={sourceHeight}
          fill={demoTheme.spotlight.dim}
          mask={`url(#${maskId})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          boxSizing: "border-box",
          border: `${demoTheme.spotlight.ringWidth * deviceScaleFactor}px solid ${demoTheme.spotlight.ring}`,
          borderRadius: radius,
          boxShadow: `0 0 ${demoTheme.spotlight.shadowBlur * deviceScaleFactor}px ${demoTheme.spotlight.shadowColor}`,
        }}
      />
    </div>
  );
}

export function SpotlightTrack({
  timeline,
  spotlight,
  timeMs,
}: {
  timeline: Timeline;
  spotlight: SpotlightEvent;
  timeMs: number;
}) {
  if (activeSpotlightAt(timeline, timeMs) !== spotlight) return null;

  return (
    <SpotlightVisual
      timeline={timeline}
      spotlight={spotlight}
      timeMs={timeMs}
    />
  );
}
