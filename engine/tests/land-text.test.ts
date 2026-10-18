import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { Storyboard } from "../lib/storyboard";
import { type LandEvent, type TimelineEvent, parseTimeline, serializeTimeline } from "../lib/timeline";
import { carryFlights, carryTiming } from "../lib/carry";
import { Carry, CarryConcealer } from "../remotion/Carry";
import { demoVideoSchema } from "../remotion/schema";
import { carryCutLabTimeline } from "../remotion/Labs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function record(html: string, message: string, width = 1000) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(`<style>p{font:20px/28px Arial;width:${width}px;margin:40px}span{font-weight:500}</style>${html}`);
  vi.spyOn(page, "waitForTimeout").mockResolvedValue();
  const d = new Storyboard("substring", page, carryCutLabTimeline.viewport);
  d.start();
  const events = (d as unknown as { events: TimelineEvent[] }).events;
  events.push({ t: 0, kind: "carry", rect: { x: 100, y: 100, width: 300, height: 30 }, text: message },
    { t: 0, kind: "transition", style: "cut", label: "", outMs: 0, cardMs: 0, inMs: 540 });
  return { page, d, events };
}

describe("land text-node ranges", () => {
  it("targets only the first bare-text occurrence after the status prefix", async () => {
    const message = "Describe the source of funds";
    const { page, d, events } = await record(`<p><span>Needs changes</span> · ${message} · ${message}</p>`, message);
    try {
      const expected = await page.locator("p").evaluate((element, text) => {
        const node = element.childNodes[1]!;
        const start = node.textContent!.indexOf(text);
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + text.length);
        const box = range.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height };
      }, message);
      await d.land(page.locator("p"), { text: message });
      const land = events.at(-1) as LandEvent;
      expect(land.rect).toEqual(expected);
      expect(land.text).toBe(message);
      expect(land.lineCount).toBe(1);
      expect(land.lines).toEqual([{ rect: expected, text: message }]);
      const prefix = await page.locator("span").boundingBox();
      expect(land.rect.x).toBeGreaterThan(prefix!.x + prefix!.width);
    } finally { await page.close(); }
  });
  it("matches a substring across nested and bare text nodes, including surrogate pairs", async () => {
    const message = "Describe 💸 the source of funds";
    const { page, d, events } = await record('<p><span>Needs changes</span> · Describe 💸 <b>the source</b> of funds</p>', message);
    try {
      await d.land(page.locator("p"), { text: message });
      const land = events.at(-1) as LandEvent;
      expect(land.lineCount).toBe(1);
      expect(land.lines?.map((line) => line.text).join(" ")).toBe(message);
      expect(land.rect.width).toBeLessThan((await page.locator("p").boundingBox())!.width);
    } finally { await page.close(); }
  });
  it("records wrapped line boxes and conceals each message line without covering the prefix", async () => {
    const message = "Describe the source of funds and provide the supporting bank records";
    const { page, d, events } = await record(`<p><span>Needs changes</span> · ${message}</p>`, message, 280);
    try {
      await d.land(page.locator("p"), { text: message });
      const land = events.at(-1) as LandEvent;
      expect(land.lineCount).toBeGreaterThan(1);
      expect(land.lines).toHaveLength(land.lineCount!);
      expect(land.lines!.map((line) => line.text).join(" ")).toBe(message);
      const boxes = land.lines!.map((line) => line.rect);
      expect(land.rect).toEqual({ x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)),
        width: Math.max(...boxes.map((box) => box.x + box.width)) - Math.min(...boxes.map((box) => box.x)),
        height: Math.max(...boxes.map((box) => box.y + box.height)) - Math.min(...boxes.map((box) => box.y)) });
      const prefix = (await page.locator("span").boundingBox())!;
      for (const box of boxes) expect(box.x >= prefix.x + prefix.width || box.y >= prefix.y + prefix.height).toBe(true);
      const timeline = { ...carryCutLabTimeline, events, durationMs: 5000 };
      const flight = carryFlights(timeline)[0]!;
      const html = renderToStaticMarkup(createElement(CarryConcealer, { flight, timeMs: 500,
        deviceScaleFactor: 1, cameraScale: 1, frameScale: 1 }));
      expect(html.match(/data-carry-concealer="true"/g)).toHaveLength(land.lineCount!);
      const chip = renderToStaticMarkup(createElement(Carry, { flight, timeline,
        cameraPath: { moves: [], atFrame: () => ({ scale: 1, translateX: 0, translateY: 0 }) },
        fps: 60, timeMs: carryTiming(flight).arrivalMs, width: 2560, height: 1440, screenOrigin: { x: 0, y: 0 } }));
      expect(chip.match(/data-carry-line="true"/g)).toHaveLength(land.lineCount!);
      expect(chip).not.toContain("Needs changes");
      expect(parseTimeline(serializeTimeline(timeline))).toEqual(timeline);
      expect(demoVideoSchema.parse({ timeline, videoSrc: "test.mp4", windowChrome: "none" }).timeline).toEqual(timeline);
    } finally { await page.close(); }
  });
  it.each(["missing message", ""])("rejects an unmatched/empty substring instead of landing on the whole paragraph: %s", async (text) => {
    const { page, d, events } = await record('<p><span>Needs changes</span> · Actual message</p>', text);
    try {
      await expect(d.land(page.locator("p"), { text })).rejects.toThrow(/land text/i);
      expect(events.some((event) => event.kind === "land")).toBe(false);
    } finally { await page.close(); }
  });
});
