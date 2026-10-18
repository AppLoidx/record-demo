import { carryFlights, carryTiming } from "./carry";
import { createTimeMap } from "./time-map";
import type { Timeline } from "./timeline";
import { demoTheme } from "../remotion/theme";

export type SoundCue = {
  timeMs: number;
  durationMs?: number;
  kind: "whoosh" | "pop" | "click" | "typing";
  reason: string;
  major?: boolean;
};
export type TypingSpan = { startMs: number; endMs: number };

/** Inputs use capture time; all output times use the visible composition clock. */
export function buildSoundCues(timeline: Timeline, typingSpans: TypingSpan[] = []): {
  cues: SoundCue[]; durationMs: number; endCardMs: number | null;
} {
  const map = createTimeMap(timeline);
  const candidates: SoundCue[] = [];
  const visible = (timeMs: number) => timeMs >= 0 && timeMs < timeline.durationMs &&
    !map.cuts.some((cut) => timeMs >= cut.startMs && timeMs < cut.endMs);
  const add = (timeMs: number, kind: SoundCue["kind"], reason: string, major = false) => {
    if (visible(timeMs)) candidates.push({ timeMs: map.toCompositionTime(timeMs), kind, reason, ...(major ? { major } : {}) });
  };
  let railActive: number | undefined;
  let endCardMs: number | null = null;
  const typeEvents = timeline.events.filter((event) => event.kind === "type");
  for (const event of [...timeline.events].sort((a, b) => a.t - b.t)) {
    switch (event.kind) {
      case "transition":
        // A cut may begin precisely at a removed interval: its visible start
        // is the splice boundary, even though actions within that interval vanish.
        if (visible(event.t) || map.cuts.some((cut) => cut.startMs === event.t)) {
          candidates.push({ timeMs: map.toCompositionTime(event.t), kind: "whoosh", reason: "scene-change", major: true });
        }
        break;
      case "window": add(event.t, "whoosh", "window-open"); break;
      case "click": add(event.t, "click", "click"); break;
      case "rail":
        if (railActive !== undefined && event.active > railActive) add(event.t, "pop", "rail-advance");
        railActive = event.active;
        break;
      case "rail-back":
        if (event.from !== event.to) add(event.t, "pop", "rail-back");
        railActive = event.to;
        break;
      case "rail-off": railActive = undefined; break;
      case "outro": {
        if (visible(event.t)) endCardMs = map.toCompositionTime(event.t);
        const delay = Math.min(demoTheme.outro.titleDelayMs,
          Math.max(0, event.durationMs - demoTheme.outro.holdMs - demoTheme.transition.wordMs));
        add(event.t + delay, "pop", "outro-title", true);
        break;
      }
    }
  }
  // carryFlights already maps its choreography onto composition time, including
  // delayed landing measurements. Do not map these values a second time.
  for (const flight of carryFlights(timeline)) {
    const timing = carryTiming(flight);
    candidates.push({ timeMs: timing.flightStartMs, kind: "whoosh", reason: "carry-flight" },
      { timeMs: timing.arrivalMs, kind: "pop", reason: "carry-landing" });
  }
  const spans = typeEvents.length > 0
    ? typeEvents.filter((event) => event.chars > 0 && event.durationMs > 0).map((event) => ({ startMs: event.t, endMs: event.t + event.durationMs }))
    : typingSpans;
  const typing: SoundCue[] = [];
  for (const span of spans) {
    if (!Number.isFinite(span.startMs) || !Number.isFinite(span.endMs) || span.endMs <= span.startMs) {
      throw new TypeError("Typing spans require finite startMs < endMs");
    }
    for (const piece of map.pieces) {
      const start = Math.max(span.startMs, piece.timelineStartMs);
      const end = Math.min(span.endMs, piece.timelineEndMs);
      if (end > start) typing.push({ timeMs: map.toCompositionTime(start), durationMs: end - start, kind: "typing", reason: typeEvents.length ? "type-event" : "legacy-typing-span" });
    }
  }
  // Highest-priority cue wins each local conflict; equal priority keeps the
  // earlier cue. Typing spans intentionally coexist with their initiating click.
  const priority = { whoosh: 3, pop: 2, click: 1, typing: 0 };
  const retained: SoundCue[] = [];
  for (const cue of candidates.filter((cue) => cue.timeMs >= 0 && cue.timeMs < map.durationMs)
    .sort((a, b) => priority[b.kind] - priority[a.kind] || a.timeMs - b.timeMs)) {
    const conflict = retained.find((other) => Math.abs(other.timeMs - cue.timeMs) < 120);
    if (!conflict) retained.push(cue);
    else if (cue.major) conflict.major = true;
  }
  return { cues: [...retained, ...typing].sort((a, b) => a.timeMs - b.timeMs), durationMs: map.durationMs, endCardMs };
}
