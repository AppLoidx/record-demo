import { Easing } from "remotion";
import { demoTheme } from "../remotion/theme";
import { clamp, textWidth } from "./typography";
import type { RailEvent, Timeline } from "./timeline";
import { createTimeMap } from "./time-map";

const t = demoTheme.rail;
const ease = Easing.bezier(...demoTheme.zoom.easing);
const progress = (age: number, duration: number) => ease(clamp(age / duration));
export type RailArc = { from: number; to: number; draw: number; opacity: number };
export type RailLayer = {
  steps: string[];
  active: number;
  opacity: number;
  arc?: RailArc;
  trails?: RailArc[];
};
export type RailState = { layers: RailLayer[]; opacity: number };

/** Replay from presentation values so even interrupted advances and fades stay continuous. */
export function railState(timeline: Timeline, timeMs: number): RailState {
  const map = createTimeMap(timeline);
  const events = timeline.events.filter((e): e is RailEvent =>
    e.kind === "rail" || e.kind === "rail-back" || e.kind === "rail-off")
    .map((event) => ({ ...event, t: map.toCompositionTime(event.t) }))
    .filter((event) => event.t <= timeMs).sort((a, b) => a.t - b.t);
  let sample: (time: number) => RailLayer[] = () => [];
  for (const event of events) {
    const before = sample(event.t);
    if (event.kind === "rail-off") {
      sample = (time) => before.map((layer) => ({ ...layer,
        opacity: layer.opacity * (1 - progress(time - event.t, t.fadeMs)) }));
    } else if (event.kind === "rail") {
      const same = before.length === 1 && before[0]!.steps.length === event.steps.length &&
        before[0]!.steps.every((step, index) => step === event.steps[index]);
      sample = (time) => {
        const age = time - event.t;
        const fade = progress(age, t.fadeMs);
        if (same) {
          const old = before[0]!;
          return [{ ...old, active: old.active + (event.active - old.active) * progress(age, t.advanceMs),
            opacity: old.opacity + (1 - old.opacity) * fade,
            trails: old.trails?.map((arc) => ({ ...arc, opacity: arc.opacity * (1 - fade) })),
            arc: old.arc ? { ...old.arc, opacity: old.arc.opacity * (1 - fade) } : undefined }];
        }
        return [...before.map((layer) => ({ ...layer, opacity: layer.opacity * (1 - fade) })),
          { steps: event.steps, active: event.active, opacity: fade }].filter((layer) => layer.opacity > 0);
      };
    } else {
      // A hand-edited event without a matching rail is simply invisible.
      const previousSample = sample;
      sample = (time) => previousSample(time).map((layer) => {
        if (event.from >= layer.steps.length || event.to >= layer.steps.length) return layer;
        const age = time - event.t;
        const initial = before.find((candidate) => candidate.steps === layer.steps) ?? layer;
        return { ...layer,
          active: layer.active + (event.to - layer.active) * progress(age - t.returnMs, t.advanceMs),
          trails: [...(initial.trails ?? []), ...(initial.arc ? [initial.arc] : [])]
            .map((arc) => ({ ...arc, opacity: arc.opacity * (1 - progress(age, t.fadeMs)) })),
          arc: { from: event.from, to: event.to, draw: progress(age, t.returnMs),
            opacity: progress(age, t.arcEnterMs) *
              (1 - progress(age - t.returnMs - t.advanceMs, t.arcFadeMs)) } };
      });
    }
  }
  const layers = sample(timeMs).filter((layer) => layer.opacity > 0);
  return { layers, opacity: clamp(layers.reduce((sum, layer) => sum + layer.opacity, 0)) };
}

/** Natural text widths, uniformly scaled to keep the entire rail in its top band. */
export function railLayout(steps: string[], width: number, height: number) {
  const widths = steps.map((step) => textWidth(step, t.fontSize) + t.labelPadding * 2);
  const naturalWidth = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, steps.length - 1) * t.gap + t.padding * 2;
  const scale = Math.min(1, Math.min(width, height) / 1440, width * 0.9 / naturalWidth);
  let x = t.padding;
  const nodes = widths.map((labelWidth) => {
    const node = { x: x * scale, width: labelWidth * scale, center: (x + labelWidth / 2) * scale };
    x += labelWidth + t.gap;
    return node;
  });
  return { left: (width - naturalWidth * scale) / 2, top: t.top * scale, width: naturalWidth * scale,
    height: t.height * scale, scale, nodes };
}

/** Reserve the largest authored rail band, so replacing labels cannot jump the screen. */
export function railScreenOffset(timeline: Timeline, width: number, height: number, screenTop: number, opacity: number) {
  const bottom = timeline.events.reduce((max, event) => {
    if (event.kind !== "rail") return max;
    const layout = railLayout(event.steps, width, height);
    return Math.max(max, layout.top + layout.height);
  }, 0);
  if (bottom === 0) return 0;
  const gap = t.screenGap * Math.min(1, Math.min(width, height) / 1440);
  return Math.max(0, bottom + gap - screenTop) * clamp(opacity);
}
