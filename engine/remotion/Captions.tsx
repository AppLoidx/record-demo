import { Easing, interpolate, useVideoConfig } from "remotion";
import type { Timeline, TimelineEvent } from "../lib/timeline";
import { demoTheme } from "./theme";

type CaptionEvent = Extract<TimelineEvent, { kind: "caption" }>;

function activeCaptionAt(timeline: Timeline, timeMs: number) {
  return timeline.events
    .filter((event) => event.kind === "caption")
    .filter(
      (event) => event.t <= timeMs && event.t + event.durationMs >= timeMs,
    )
    .at(-1);
}

function CaptionVisual({
  caption,
  bottom,
  timeMs,
}: {
  caption: CaptionEvent;
  bottom: number;
  timeMs: number;
}) {
  const { width } = useVideoConfig();

  const elapsed = timeMs - caption.t;
  const remaining = caption.durationMs - elapsed;
  const enter = interpolate(
    elapsed,
    [0, demoTheme.caption.enterDurationMs],
    [0, 1],
    {
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const exit = interpolate(
    remaining,
    [0, demoTheme.caption.exitDurationMs],
    [0, 1],
    {
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const visibility = Math.min(enter, exit);
  const fontSize =
    width >= demoTheme.caption.wideFrameThreshold
      ? demoTheme.caption.wideFontSize
      : width >= demoTheme.caption.mediumFrameThreshold
        ? demoTheme.caption.mediumFontSize
        : demoTheme.caption.compactFontSize;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        display: "flex",
        justifyContent: "center",
        padding: "0 64px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "86%",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: 999,
          padding: `${fontSize * 0.5}px ${fontSize * 0.9}px`,
          color: demoTheme.colors.captionText,
          backgroundColor: demoTheme.colors.accentPrimary,
          boxShadow: "0 14px 36px rgba(23, 20, 31, 0.22)",
          fontFamily: demoTheme.fontFamily,
          fontSize,
          fontWeight: 500,
          lineHeight: 1.24,
          letterSpacing: "-0.02em",
          textAlign: "center",
          opacity: visibility,
          transform: `translateY(${(1 - enter) * demoTheme.caption.enterOffset}px) scale(${demoTheme.caption.enterScale + enter * (1 - demoTheme.caption.enterScale)})`,
          willChange: "transform, opacity",
        }}
      >
        {caption.text}
      </div>
    </div>
  );
}

export function Caption({
  timeline,
  caption,
  bottom,
  timeMs,
}: {
  timeline: Timeline;
  caption: CaptionEvent;
  bottom: number;
  timeMs: number;
}) {
  if (activeCaptionAt(timeline, timeMs) !== caption) return null;

  return <CaptionVisual caption={caption} bottom={bottom} timeMs={timeMs} />;
}
