import { Easing } from "remotion";
import { transitionTotalDuration, type TransitionEvent } from "../lib/timeline";
import { clamp } from "../lib/typography";
import { SlateStepper, SlateVeil } from "./Slate";
import { KineticWords } from "./KineticWords";
import { demoTheme } from "./theme";

const tokens = demoTheme.transition;
const outEase = Easing.bezier(...tokens.outEasing);
const inEase = Easing.bezier(...tokens.inEasing);
const typeEase = Easing.bezier(...demoTheme.typography.easing);
const phase = (age: number, duration: number) => duration === 0 ? (age >= 0 ? 1 : 0) : clamp(age / duration);

export function transitionMotion(event: TransitionEvent | undefined, timeMs: number) {
  const elapsed = event ? timeMs - event.t : -1;
  const out = event ? outEase(phase(elapsed, event.outMs)) : 0;
  const incoming = event ? inEase(phase(elapsed - event.outMs - event.cardMs, event.inMs)) : 0;
  return {
    active: !!event && elapsed >= 0 && elapsed < transitionTotalDuration(event),
    outgoing: {
      scale: 1 - (1 - tokens.outScale) * out,
      opacity: (tokens.contextOpacity + (1 - tokens.contextOpacity) * (1 - out)) * (1 - incoming),
      translateX: -tokens.outTranslateRatio * out,
    },
    incoming: {
      scale: tokens.inScale + (1 - tokens.inScale) * incoming,
      opacity: incoming,
      translateX: tokens.translateRatio * (1 - incoming),
    },
  };
}

export { createSceneCameraPath } from "../lib/scene-camera";

export function chapterProgress(event: TransitionEvent, cardAge: number) {
  const exitMs = Math.min(tokens.cardExitMs, event.cardMs);
  const exitStart = event.cardMs - exitMs;
  const drawStart = Math.min(tokens.stepperDelayMs, exitStart / 2);
  const drawEnd = Math.min(drawStart + tokens.stepperDrawMs, exitStart);
  return {
    line: typeEase(phase(cardAge - drawStart, drawEnd - drawStart)),
    current: phase(cardAge - drawEnd, exitStart - drawEnd),
    opacity: 1 - typeEase(phase(cardAge - exitStart, exitMs)),
  };
}

export function Transition({ event, timeMs, frameWidth }: {
  event: TransitionEvent; timeMs: number; frameWidth: number;
}) {
  const age = timeMs - event.t - event.outMs;
  if (age < 0 || age >= event.cardMs) return null;
  const exitMs = Math.min(tokens.cardExitMs, event.cardMs);
  const exitAge = age - event.cardMs + exitMs;
  const eyebrow = typeEase(phase(age, tokens.eyebrowMs));
  const progress = chapterProgress(event, age);
  const fontSize = frameWidth * demoTheme.outro.titleSizeRatio;
  const eyebrowText = [event.chapter ? `STEP ${event.chapter.index} OF ${event.chapter.total}` : undefined,
    event.role?.toUpperCase()].filter(Boolean).join(" · ");
  const titleDelay = Math.min(tokens.titleDelayMs, (event.cardMs - exitMs) / 4);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", textAlign: "center", padding: "0 8%", pointerEvents: "none",
      fontFamily: demoTheme.fontFamily, color: demoTheme.colors.contentPrimary }}>
      <SlateVeil frameWidth={frameWidth} opacity={eyebrow * progress.opacity} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      {eyebrowText ? <div style={{ fontSize: tokens.eyebrowSize, fontWeight: 500, letterSpacing: tokens.eyebrowSpacing,
        color: demoTheme.colors.contentSecondary, marginBottom: tokens.eyebrowGap, opacity: eyebrow * progress.opacity,
        transform: `translateY(${tokens.eyebrowOffset * (1 - eyebrow)}px)` }}>{eyebrowText}</div> : null}
      <div style={{ fontSize, fontWeight: 500, lineHeight: 1.15 }}>
        <KineticWords text={event.label} ageMs={age - titleDelay} durationMs={tokens.wordMs}
          staggerMs={tokens.wordStaggerMs} budgetMs={Math.max(0, event.cardMs - exitMs - titleDelay)}
          offset={tokens.wordOffset} letterSpacing={tokens.wordLetterSpacing} exitAgeMs={exitAge} exitBudgetMs={exitMs} />
      </div>
      {event.chapter ? <SlateStepper frameWidth={frameWidth} opacity={progress.opacity}
        fills={Array.from({ length: event.chapter.total }, (_, i) =>
          i + 1 < event.chapter!.index ? 1 : i + 1 === event.chapter!.index ? progress.current : 0)} /> : null}
      </div>
    </div>
  );
}
