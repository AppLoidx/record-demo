import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { Storyboard } from "../lib/storyboard";
import { assertTimeline, parseTimeline, serializeTimeline, type Timeline, type TimelineEvent } from "../lib/timeline";
import { createTimeMap } from "../lib/time-map";
import { carryFlights, carryMotion, carryTiming } from "../lib/carry";
import { railState } from "../lib/rail";
import { transitionMotion, Transition } from "../remotion/Transition";
import { demoVideoSchema } from "../remotion/schema";
import { carryCutLabTimeline, cutLabTimeline } from "../remotion/Labs";
import { createSceneCameraPath } from "../lib/scene-camera";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cursorVisibility } from "../remotion/Cursor";
import { Carry } from "../remotion/Carry";

afterEach(() => vi.restoreAllMocks());
describe("card-less cuts", () => {
  it("emits a cut, hides the action, resets camera, preserves rail and role", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const page = { waitForTimeout: vi.fn(async (ms: number) => { now += ms; }) } as unknown as Page;
    const d = new Storyboard("cut", page, cutLabTimeline.viewport);
    d.start();
    vi.spyOn(d, "ensureStarted").mockResolvedValue();
    const events = (d as unknown as { events: TimelineEvent[] }).events;
    events.push({ t: 0, kind: "zoom", rect: { x: 600, y: 400, width: 400, height: 200 } });
    d.rail(["Ops", "Customer"], 0); d.role("Ops");
    now += 2000;
    await d.cut(async (p) => { expect(p).toBe(page); now += 3000; });
    const event = events.find((e) => e.kind === "transition")!;
    expect(event).toMatchObject({ style: "cut", label: "", outMs: 0, cardMs: 3000, inMs: 540 });
    expect(events.filter((e) => e.kind === "rail" || e.kind === "role")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "zoom").at(-1)).toMatchObject({ rect: null, t: 2000 });
    const map = createTimeMap({ ...cutLabTimeline, events, durationMs: now - 1000 });
    expect(map.durationMs).toBe(2540);
    expect(map.toTimelineTime(2000)).toBe(5000);
    await expect(d.cut(async () => {}, { visibleMs: 0 })).rejects.toThrow(/visibleMs/);
    await d.cut(async () => {}, { visibleMs: 600 });
    expect(events.at(-1)).toMatchObject({ style: "cut", inMs: 600 });
  });
  it("cleans up failed cuts and allows recovery", async () => {
    const page = { waitForTimeout: vi.fn(async () => {}) } as unknown as Page;
    const d = new Storyboard("cut", page, cutLabTimeline.viewport);
    d.start(); vi.spyOn(d, "ensureStarted").mockResolvedValue();
    await expect(d.cut(async () => { throw new Error("load failed"); })).rejects.toThrow("load failed");
    expect((d as unknown as { events: TimelineEvent[] }).events).toEqual([]);
    await d.cut(async () => {});
  });
  it("round trips both schemas and removes precisely the slow work", () => {
    assertTimeline(carryCutLabTimeline);
    expect(parseTimeline(serializeTimeline(carryCutLabTimeline))).toEqual(carryCutLabTimeline);
    expect(demoVideoSchema.parse({ timeline: carryCutLabTimeline, videoSrc: "lab.mp4", windowChrome: "none" }).timeline).toEqual(carryCutLabTimeline);
    const map = createTimeMap(cutLabTimeline);
    expect(map.durationMs).toBe(4800);
    expect(map.cuts).toEqual([{ startMs: 2000, endMs: 5000, compositionAtMs: 2000 }]);
    for (const style of ["invalid", 1]) {
      const invalid = { ...cutLabTimeline, events: [{ ...cutLabTimeline.events.find((event) => event.kind === "transition"), style }] };
      expect(() => assertTimeline(invalid)).toThrow();
      expect(demoVideoSchema.safeParse({ timeline: invalid, videoSrc: "lab", windowChrome: "none" }).success).toBe(false);
    }
  });
  it("has continuous endpoints with no card markup, lateral motion or opaque veil", () => {
    const event = { ...cutLabTimeline.events.find((event) => event.kind === "transition"), cardMs: 0 } as Extract<TimelineEvent, { kind: "transition" }>;
    expect(renderToStaticMarkup(createElement(Transition, { event, timeMs: 2200, frameWidth: 2560 }))).toBe("");
    const first = transitionMotion(event, 2000), last = transitionMotion(event, 2540);
    expect(first.outgoing).toMatchObject({ scale: 1, opacity: 1, blur: 0 });
    expect(last.incoming).toMatchObject({ scale: 1, opacity: 1, translateX: 0 });
    expect(last.outgoing.opacity).toBe(1);
    for (let time = 2000; time <= 2540; time += 15) {
      const motion = transitionMotion(event, time);
      expect(motion.outgoing.opacity).toBe(1);
      expect(motion.incoming.opacity + motion.outgoing.opacity * (1 - motion.incoming.opacity)).toBe(1);
    }
    for (const threshold of [2000, 2540]) {
      const a = transitionMotion(event, threshold - 1000 / 60);
      const b = transitionMotion(event, threshold + 1000 / 60);
      expect(Math.abs(a.incoming.opacity - b.incoming.opacity)).toBeLessThan(0.01);
    }
  });
  it("pairs carry across cut and travels directly to the camera-projected destination", () => {
    const flight = carryFlights(carryCutLabTimeline)[0]!;
    expect(flight.transition.style).toBe("cut");
    expect(flight.land.t).toBe(2540);
    expect(carryTiming(flight)).toMatchObject({ incomingMs: 2000, flightStartMs: 2540, arrivalMs: 3240, revealEndMs: 3490 });
    expect(flight.targetTimeMs).toBe(5540);
    const source = { x: 100, y: 100, width: 400, height: 40 };
    const target = { x: 800, y: 600, width: 300, height: 30 };
    const dock = { x: -9999, y: -9999, width: 1, height: 1 };
    for (let time = 2000; time <= 2540; time += 100) {
      const state = carryMotion(flight, time, source, target, dock);
      expect(state.rect.x).toBeGreaterThanOrEqual(source.x);
      expect(state.rect.x).toBeLessThanOrEqual(target.x);
    }
    expect(carryMotion(flight, 3240, source, target, dock)).toMatchObject({ rect: target, scale: 1, opacity: 1 });
    const cameraPath = createSceneCameraPath(carryCutLabTimeline, 60, 2200, 1237.5);
    expect(cameraPath.atFrame(5540 * 60 / 1000).scale).toBeGreaterThan(cameraPath.atFrame(2000 * 60 / 1000).scale);
    const html = renderToStaticMarkup(createElement(Carry, { flight, timeline: carryCutLabTimeline, cameraPath, fps: 60,
      timeMs: 3240, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } }));
    expect(html).toContain(`font-size:${28 * 1.5 * cameraPath.atFrame(332.4).scale}px`);
  });
  it("lets both pointer snapshots dissolve with their screens", () => {
    for (const time of [1999, 2000, 4999, 5000, 5270, 5540]) {
      expect(cursorVisibility(cutLabTimeline, time)).toBe(1);
    }
    const chapter: Timeline = { ...cutLabTimeline, events: cutLabTimeline.events.map((event) => event.kind === "transition" ? { ...event, style: undefined } : event) };
    expect(cursorVisibility(chapter, 5270)).toBe(0);
  });
  it("keeps the rail in place and completes the return by the dissolve end", () => {
    const map = createTimeMap(cutLabTimeline);
    const end = map.toCompositionTime(5540);
    const before = railState(cutLabTimeline, 1999).layers[0]!;
    const after = railState(cutLabTimeline, 2000).layers[0]!;
    expect(after.steps).toEqual(before.steps);
    expect(after.opacity).toBe(before.opacity);
    expect(railState(cutLabTimeline, end).layers[0]!.arc!.draw).toBe(1);
  });
});
