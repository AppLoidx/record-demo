import { Easing } from "remotion";
import { wordTimings, exitWordTimings, progressAt } from "../lib/typography";
import { demoTheme } from "./theme";

const ease = Easing.bezier(...demoTheme.typography.easing);
export function KineticWords({ text, ageMs, durationMs = demoTheme.caption.wordMs, staggerMs = demoTheme.caption.wordStaggerMs,
  budgetMs = demoTheme.caption.wordBudgetMs, offset = demoTheme.caption.wordOffset, letterSpacing = 0,
  exitAgeMs, exitBudgetMs = demoTheme.transition.cardExitMs }: {
  text: string; ageMs: number; durationMs?: number; staggerMs?: number; budgetMs?: number; offset?: number;
  letterSpacing?: number; exitAgeMs?: number; exitBudgetMs?: number;
}) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const times = wordTimings(words.length, staggerMs, durationMs, budgetMs);
  const exits = exitWordTimings(words.length, demoTheme.transition.exitStaggerMs, exitBudgetMs);
  return <>{words.map((word, index) => {
    const time = times[index]!;
    const enter = ease(progressAt(ageMs, time.startMs, time.endMs));
    const exitTime = exits[words.length - 1 - index]!;
    const exit = exitAgeMs === undefined ? 0 : ease(progressAt(exitAgeMs, exitTime.startMs, exitTime.endMs));
    return <span key={index} style={{ display: "inline-block", whiteSpace: "pre", opacity: enter * (1 - exit),
      transform: `translateY(${offset * (1 - enter) - demoTheme.transition.exitOffset * exit}px)`,
      letterSpacing: `${letterSpacing * (1 - enter)}em` }}>{word}{index < words.length - 1 ? " " : ""}</span>;
  })}</>;
}
