import { Easing } from "remotion";
import { demoTheme } from "../remotion/theme";
import type { CameraTransform } from "./camera";
import type { CarryEvent, LandEvent, Rect, Timeline, TransitionEvent } from "./timeline";
import { clamp } from "./typography";
import { createTimeMap, transitionVisibleCardMs } from "./time-map";

const t = demoTheme.carry;
const ease = Easing.bezier(...demoTheme.zoom.easing);
const p = (age: number, duration: number) => ease(clamp(age / duration));
export type CarryFlight = {
  carry: CarryEvent; transition: TransitionEvent; land: LandEvent;
  sourceTimeMs: number; targetTimeMs: number;
};

/** Sequential matching needs no extra identity in the storyboard DSL. */
export function carryFlights(timeline: Timeline): CarryFlight[] {
  const map = createTimeMap(timeline);
  const events = [...timeline.events].sort((a, b) => a.t - b.t);
  const flights: CarryFlight[] = [];
  let carry: CarryEvent | undefined;
  let transition: TransitionEvent | undefined;
  for (const event of events) {
    if (event.kind === "carry") { carry = event; transition = undefined; }
    if (event.kind === "transition" && carry && !transition) transition = event;
    if (event.kind === "land" && carry && transition) {
      flights.push({ carry: { ...carry, t: map.toCompositionTime(carry.t) },
        transition: { ...transition, t: map.toCompositionTime(transition.t), cardMs: transitionVisibleCardMs(transition) },
        land: { ...event, t: map.toCompositionTime(event.t) }, sourceTimeMs: carry.t, targetTimeMs: event.t });
      carry = undefined; transition = undefined;
    }
  }
  return flights;
}

export function projectCarryRect(rect: Rect, dsf: number, camera: CameraTransform, origin: { x: number; y: number }): Rect {
  const scale = dsf * camera.scale;
  return { x: origin.x + camera.translateX + rect.x * scale, y: origin.y + camera.translateY + rect.y * scale,
    width: rect.width * scale, height: rect.height * scale };
}
function mixRect(a: Rect, b: Rect, amount: number): Rect {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount,
    width: a.width + (b.width - a.width) * amount, height: a.height + (b.height - a.height) * amount };
}
export function carryMotion(flight: CarryFlight, timeMs: number, source: Rect, target: Rect, dock: Rect) {
  const age = timeMs - flight.carry.t;
  const lift = p(age, t.liftMs);
  const glideStart = Math.max(flight.carry.t + t.liftMs, flight.transition.t);
  // Short/zero cards compress the travel rather than jumping at a boundary.
  const glideMs = Math.min(t.glideMs, Math.max(1, flight.land.t - glideStart));
  const glide = p(timeMs - glideStart, glideMs);
  // Settle before dissolving: moving text must never blend with stationary UI glyphs.
  const landing = p(timeMs - flight.land.t, t.landMs - t.dissolveMs);
  const rect = mixRect(mixRect(source, dock, glide), target, landing);
  return { rect,
    scale: 1 + (t.liftScale - 1) * lift * (1 - landing),
    opacity: p(age, t.enterMs) * (1 - p(timeMs - flight.land.t - t.landMs + t.dissolveMs, t.dissolveMs)),
  };
}

