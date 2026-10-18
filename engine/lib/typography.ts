/** Stable fallback metrics in ems: identical in Node tests and the renderer, with no font-loading race. */
export function textWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((sum, char) => {
    const em = /\s/.test(char) ? 0.28
      : /[ilI.,'!:;|]/.test(char) ? 0.28
      : /[mwMW@]/.test(char) ? 0.87
      : /[A-Z]/.test(char) ? 0.67
      : /[^\u0000-\u00ff]/.test(char) ? 1 : 0.56;
    return sum + em * fontSize;
  }, 0);
}

/** Cap the entire entrance (including the last word's animation) to the available budget. */
export function wordTimings(count: number, staggerMs: number, durationMs: number, budgetMs: number) {
  const duration = Math.min(durationMs, Math.max(0, budgetMs));
  const stagger = count <= 1 ? 0 : Math.min(staggerMs, Math.max(0, budgetMs - duration) / (count - 1));
  return Array.from({ length: count }, (_, index) => ({
    startMs: index * stagger,
    endMs: index * stagger + duration,
  }));
}

export const clamp = (n: number) => Math.min(1, Math.max(0, n));
export function progressAt(timeMs: number, startMs: number, endMs: number) {
  return endMs === startMs ? (timeMs >= endMs ? 1 : 0) : clamp((timeMs - startMs) / (endMs - startMs));
}

/** Reverse the returned array for exits; the last word's fade still ends exactly at the card boundary. */
export function exitWordTimings(count: number, staggerMs: number, budgetMs: number) {
  const stagger = Math.min(staggerMs, budgetMs / (count + 1));
  return wordTimings(count, stagger, Math.max(0, budgetMs - stagger * Math.max(0, count - 1)), budgetMs);
}
