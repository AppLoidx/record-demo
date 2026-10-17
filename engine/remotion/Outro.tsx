import { Easing, interpolate } from "remotion";
import type { Timeline, TimelineEvent } from "../lib/timeline";
import { clamp, wordTimings } from "../lib/typography";
import { KineticWords } from "./KineticWords";
import { SlateStepper, SlateVeil } from "./Slate";
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

export function parseOutroTitle(title: string) {
  const colon = title.indexOf(":");
  const lead = title.slice(0, colon).trim();
  const steps = colon < 0 ? [] : title.slice(colon + 1).split(/[:,]/).map((step) => step.trim()).filter(Boolean);
  return colon > 0 && lead && steps.length > 1
    ? { lead, steps, text: steps.join(" ") }
    : { lead: undefined, steps: [], text: title };
}

export function outroTitleMotion(title: ReturnType<typeof parseOutroTitle>, durationMs: number, ageMs = 0) {
  const tokens = demoTheme.transition;
  const delayMs = Math.min(demoTheme.outro.titleDelayMs, Math.max(0, durationMs - demoTheme.outro.holdMs - tokens.wordMs));
  const budgetMs = Math.max(0, durationMs - delayMs - demoTheme.outro.holdMs);
  const timings = wordTimings(title.text.trim().split(/\s+/).filter(Boolean).length,
    tokens.wordStaggerMs, tokens.wordMs, budgetMs);
  let wordCount = 0;
  const fills = title.steps.map((step) => {
    wordCount += step.split(/\s+/).length;
    return ageMs - delayMs >= timings[wordCount - 1]!.endMs ? 1 : 0;
  });
  return { delayMs, budgetMs, timings, fills };
}

export function outroScreenMotion(ageMs: number) {
  const t = clamp(ageMs / demoTheme.outro.screenDurationMs);
  // Smooth endpoints; at 60fps the 2400ms fade changes opacity by at most 0.97% per frame.
  const progress = t * t * (3 - 2 * t);
  return {
    scale: 1 + (demoTheme.outro.recedeScale - 1) * progress,
    opacity: progress === 1 ? demoTheme.outro.screenOpacity : 1 - (1 - demoTheme.outro.screenOpacity) * progress,
    translateX: 0,
  };
}

export function Outro({ outro, frameWidth, timeMs }: {
  outro: ResolvedOutro; frameWidth: number; timeMs: number;
}) {
  if (!outro.event) return null;
  const title = parseOutroTitle(outro.event.title);
  const age = timeMs - outro.event.t;
  const motion = outroTitleMotion(title, outro.event.durationMs, age);
  const tokens = demoTheme.transition;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "0 8%", boxSizing: "border-box",
      color: demoTheme.colors.contentPrimary, fontFamily: demoTheme.fontFamily,
      textAlign: "center", pointerEvents: "none" }}>
      <SlateVeil frameWidth={frameWidth} opacity={outro.progress} />
      <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {title.lead ? <div style={{ fontSize: tokens.eyebrowSize, fontWeight: 500,
          letterSpacing: tokens.eyebrowSpacing, color: demoTheme.colors.contentSecondary,
          marginBottom: tokens.eyebrowGap, opacity: outro.progress,
          transform: `translateY(${tokens.eyebrowOffset * (1 - outro.progress)}px)` }}>{title.lead}</div> : null}
        <div style={{ fontSize: frameWidth * demoTheme.outro.titleSizeRatio, fontWeight: 500, lineHeight: 1.15 }}>
          <KineticWords text={title.text} ageMs={age - motion.delayMs} durationMs={tokens.wordMs}
            staggerMs={tokens.wordStaggerMs} budgetMs={motion.budgetMs}
            offset={tokens.wordOffset} letterSpacing={tokens.wordLetterSpacing} />
        </div>
        {title.steps.length ? <SlateStepper frameWidth={frameWidth} fills={motion.fills} opacity={outro.progress} /> : null}
      </div>
    </div>
  );
}
