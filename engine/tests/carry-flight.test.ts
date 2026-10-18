import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { carryFlights, carryMotion, carryTiming } from "../lib/carry";
import { Carry, CarryConcealer } from "../remotion/Carry";
import { carryCutLabTimeline } from "../remotion/Labs";
import { parseTimeline, serializeTimeline, type Timeline } from "../lib/timeline";
import { chromium, type Browser } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { demoVideoSchema } from "../remotion/schema";
let browser: Browser;
let font: string;
beforeAll(async () => {
  browser = await chromium.launch();
  font = (await readFile(new URL("../public/fonts/geist-sans-latin-500-v5.2.5.woff2", import.meta.url))).toString("base64");
});
afterAll(async () => { await browser?.close(); });
const source = { x: 100, y: 500, width: 400, height: 50 };
const target = { x: 900, y: 800, width: 360, height: 32 };
const subject: Timeline = { ...carryCutLabTimeline, events: [
  { t: 1700, kind: "carry", rect: source, text: "Message" },
  { t: 2000, kind: "transition", style: "cut", label: "", outMs: 0, cardMs: 3000, inMs: 540 },
  { t: 5540, kind: "land", rect: target, concealColor: "#183A42" },
] };
describe("lift, hold, arc, reveal carry choreography", () => {
  it.each([true, false])("holds the exact lifted position throughout the outgoing scene and dissolve (cut: %s)", (cut) => {
    const timeline: Timeline = { ...subject, events: subject.events.map((e) => e.kind === "transition" && !cut
      ? { ...e, style: undefined, outMs: 450, visibleCardMs: 1200 } : e) };
    const flight = carryFlights(timeline)[0]!;
    const timing = carryTiming(flight);
    const at = (time: number) => carryMotion(flight, time, source, target, target);
    for (let time = 2000; time <= timing.sceneEndMs; time += 10)
      expect(at(time)).toMatchObject({ rect: source, scale: 1.04, opacity: 1 });
    expect(timing.arrivalMs).toBe(Math.max(timing.sceneEndMs, flight.land.t) + 700);
    expect(timing.revealEndMs - timing.arrivalMs).toBe(250);
  });
  it("waits for a late land event, then takes one uninterrupted upward-bowed arc", () => {
    const flight = carryFlights(subject)[0]!;
    flight.land.t = 5000;
    const at = (time: number) => carryMotion(flight, time, source, target, target);
    expect(at(4999)).toMatchObject({ rect: source, scale: 1.04 });
    expect(carryTiming(flight).arrivalMs).toBe(5700);
    const middle = at(5350).rect;
    expect(middle.x).toBeCloseTo((source.x + target.x) / 2);
    expect(middle.y).toBeLessThan((source.y + target.y) / 2 - 20);
    let lastX = source.x;
    for (let time = 5001; time < 5700; time += 5) {
      expect(at(time).rect.x).toBeGreaterThan(lastX);
      lastX = at(time).rect.x;
    }
    expect(at(5700)).toMatchObject({ rect: target, scale: 1, opacity: 1 });
    for (const boundary of [1700, 2000, 5000, 5700, 5950]) {
      const a = at(boundary - .001), b = at(boundary + .001);
      for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(a.rect[key] - b.rect[key])).toBeLessThan(.001);
      expect(Math.abs(a.opacity - b.opacity)).toBeLessThan(.001);
      expect(Math.abs(a.scale - b.scale)).toBeLessThan(.001);
    }
  });
  it("matches captured source/destination sizes and round trips source metrics in both schemas", () => {
    const textStyle = { fontSize: 24, fontFamily: "Arial", fontWeight: "400", color: "black" };
    const timeline: Timeline = { ...subject, events: subject.events.map((event) => event.kind === "carry"
      ? { ...event, textStyle } : event.kind === "land" ? { ...event, textStyle: { ...textStyle, fontSize: 14 } } : event) };
    expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
    expect(demoVideoSchema.parse({ timeline, videoSrc: "test.mp4", windowChrome: "none" }).timeline).toEqual(timeline);
    const flight = carryFlights(timeline)[0]!;
    const props = { flight, timeline, cameraPath: { moves: [], atFrame: () => ({ scale: 1, translateX: 0, translateY: 0 }) },
      fps: 60, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } };
    expect(renderToStaticMarkup(createElement(Carry, { ...props, timeMs: 2000 }))).toContain("font-size:36px");
    expect(renderToStaticMarkup(createElement(Carry, { ...props, timeMs: carryTiming(flight).arrivalMs }))).toContain("font-size:21px");
  });
  it("is identical when seeking phases in reverse order", () => {
    const flight = carryFlights(subject)[0]!;
    const snapshot = JSON.stringify(subject);
    const times = [1700, 1850, 2000, 2250, 2540, 2890, 3240, 3365, 3490];
    const at = (time: number) => carryMotion(flight, time, source, target, target);
    expect(times.map(at)).toEqual([...times].reverse().map(at).reverse());
    expect(JSON.stringify(subject)).toBe(snapshot);
  });
  it("keeps wrapped glyph pieces disjoint and above every fill on every flight frame", async () => {
    const flight = carryFlights(carryCutLabTimeline)[0]!;
    const timing = carryTiming(flight);
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
    try {
      for (let frame = 0; frame <= 42; frame++) {
        const html = renderToStaticMarkup(createElement(Carry, { flight, timeline: carryCutLabTimeline,
          cameraPath: { moves: [], atFrame: () => ({ scale: 1, translateX: 0, translateY: 0 }) },
          fps: 60, timeMs: timing.flightStartMs + frame * 1000 / 60, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } }));
        await page.setContent(`<style>@font-face{font-family:'Geist Sans';src:url(data:font/woff2;base64,${font});font-weight:500}body{margin:0}</style>${html}`);
        await page.evaluate(() => document.fonts.ready);
        const boxes = await page.locator("[data-carry-line] span").evaluateAll((spans) => spans.map((span) => {
          const range = document.createRange(); range.selectNodeContents(span);
          const b = range.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        }));
        expect(boxes).toHaveLength(2);
        const [a, b] = boxes;
        const overlapX = Math.min(a!.right, b!.right) - Math.max(a!.left, b!.left);
        const overlapY = Math.min(a!.bottom, b!.bottom) - Math.max(a!.top, b!.top);
        expect(overlapX > 1 && overlapY > 1, `glyph collision at frame ${frame}: ${JSON.stringify(boxes)}`).toBe(false);
        const layers = await page.locator("[data-carry-chip]").evaluate((chip) => Array.from(chip.children).map((child) => child.hasAttribute("data-carry-glyphs") ? "glyphs" : "material"));
        if (frame === 42) expect(layers.at(-1)).toBe("glyphs");
      }
    } finally { await page.close(); }
  });
  it("uses a filled padded brand pill, then hands identical material to the cover for a single reveal", () => {
    const flight = carryFlights(subject)[0]!;
    const timing = carryTiming(flight);
    const props = { flight, timeline: subject, cameraPath: { moves: [], atFrame: () => ({ scale: 1, translateX: 0, translateY: 0 }) },
      fps: 60, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } };
    const hold = renderToStaticMarkup(createElement(Carry, { ...props, timeMs: 2250 }));
    expect(hold).toContain("background:#EEE9FF");
    expect(hold).toContain("border-radius:999px");
    expect(hold).toContain("box-shadow:");
    expect(hold).toContain("font-weight:500");
    expect(hold).not.toContain("background:#183A42");
    const arrived = renderToStaticMarkup(createElement(Carry, { ...props, timeMs: timing.arrivalMs }));
    expect(arrived).not.toContain("background:#EEE9FF");
    const cover = (timeMs: number) => renderToStaticMarkup(createElement(CarryConcealer, { flight, timeMs,
      deviceScaleFactor: 1, cameraScale: 1, frameScale: 1 }));
    expect(cover(timing.arrivalMs - 1)).toContain("background:#183A42");
    expect(cover(timing.arrivalMs)).toContain("background:#EEE9FF");
    expect(cover(timing.arrivalMs + 125)).toMatch(/opacity:0\.5/);
    expect(cover(timing.revealEndMs)).toBe("");
  });
});
