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
/** Presentation-clock phases: lift, hold through the scene, one arc, then reveal. */
export function carryTiming(flight: CarryFlight) {
  const liftEndMs = flight.carry.t + t.liftMs;
  const incomingMs = flight.transition.t + flight.transition.outMs + flight.transition.cardMs;
  const sceneEndMs = incomingMs + flight.transition.inMs;
  const flightStartMs = Math.max(liftEndMs, sceneEndMs, flight.land.t);
  const arrivalMs = flightStartMs + t.glideMs;
  return { liftEndMs, flightStartMs, incomingMs, sceneEndMs, arrivalMs, revealEndMs: arrivalMs + t.dissolveMs };
}

/** Cut incoming camera is frozen at scene end; afterward use the live source clock. */
export function carryTargetTimeMs(flight: CarryFlight, timeline: Timeline, timeMs: number) {
  return createTimeMap(timeline).toTimelineTime(Math.max(carryTiming(flight).sceneEndMs, timeMs));
}

export function carryConcealOpacity(flight: CarryFlight, timeMs: number) {
  const timing = carryTiming(flight);
  if (flight.land.conceal === false || timeMs < timing.incomingMs) return 0;
  return 1 - p(timeMs - timing.arrivalMs, t.dissolveMs);
}

export function carryMotion(flight: CarryFlight, timeMs: number, source: Rect, target: Rect, _dock?: Rect) {
  const age = timeMs - flight.carry.t;
  const lift = p(age, t.liftMs);
  const timing = carryTiming(flight);
  const travel = p(timeMs - timing.flightStartMs, t.glideMs);
  const rect = mixRect(source, target, travel);
  // A quadratic Bezier with a control point above the straight-line midpoint.
  const bow = Math.min(t.arcMaxHeight, Math.hypot(target.x - source.x, target.y - source.y) * t.arcHeightRatio);
  rect.y -= 2 * (1 - travel) * travel * bow;
  return { rect, landing: travel, lift,
    scale: 1 + (t.liftScale - 1) * lift * (1 - travel),
    opacity: p(age, t.enterMs) * (1 - p(timeMs - timing.arrivalMs, t.dissolveMs)),
  };
}
