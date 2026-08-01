import { Easing, interpolate } from "remotion";
import type { Timeline, TimelineEvent } from "../lib/timeline";
import { demoTheme } from "./theme";

type OutroEvent = Extract<TimelineEvent, { kind: "outro" }>;

export type ResolvedOutro = {
  event: OutroEvent | undefined;
  progress: number;
  started: boolean;
};

const [outroX1, outroY1, outroX2, outroY2] = demoTheme.zoom.easing;
const outroEasing = Easing.bezier(outroX1, outroY1, outroX2, outroY2);

export function resolveOutro(
  timeline: Timeline,
  timeMs: number,
): ResolvedOutro {
  const event = timeline.events.find(
    (candidate): candidate is OutroEvent => candidate.kind === "outro",
  );
  const started = event !== undefined && timeMs >= event.t;
  const progress = event
    ? interpolate(
        timeMs - event.t,
        [0, demoTheme.outro.enterDurationMs],
        [0, 1],
        {
          easing: outroEasing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0;

  return { event, progress, started };
}

export function Outro({
  outro,
  frameWidth,
}: {
  outro: ResolvedOutro;
  frameWidth: number;
}) {
  if (!outro.event) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `0 ${frameWidth * demoTheme.outro.titleSizeRatio}px`,
        boxSizing: "border-box",
        color: demoTheme.colors.contentPrimary,
        fontFamily: demoTheme.fontFamily,
        fontSize: frameWidth * demoTheme.outro.titleSizeRatio,
        fontWeight: 500,
        textAlign: "center",
        opacity: outro.progress,
        pointerEvents: "none",
        willChange: "opacity",
      }}
    >
      {outro.event.title}
    </div>
  );
}
