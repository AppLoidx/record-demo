import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { layoutFor } from "../remotion/DemoVideo";
import { CaptionVisual } from "../remotion/Captions";
import { compositionPresets } from "../remotion/theme";
import { chromium, type Browser } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { railScreenOffset } from "../lib/rail";
import type { Timeline } from "../lib/timeline";
let browser: Browser;
let font: string;
beforeAll(async () => {
  browser = await chromium.launch();
  font = (await readFile(new URL("../public/fonts/geist-sans-latin-500-v5.2.5.woff2", import.meta.url))).toString("base64");
});
afterAll(async () => { await browser?.close(); });
const timeline: Timeline = { version: 1, name: "caption", viewport: { width: 1920, height: 1080, deviceScaleFactor: 1.5 },
  capture: { fps: 30, syncFlashAt: 0 }, durationMs: 5000, events: [
    { t: 1000, kind: "caption", text: "Send the request to the customer", durationMs: 2400 },
    { t: 2000, kind: "rail", steps: ["Bank", "Ops", "Customer"], active: 1 },
  ] };
describe("caption band", () => {
  it.each(compositionPresets)("$id reserves the same band before, during and after captions, clear of screen/chrome and rail", ({ width, height }) => {
    for (const chrome of ["none", "macos", "browser"] as const) {
      const layout = layoutFor(width, height, chrome, timeline);
      expect(layout.captionTop).toBeGreaterThanOrEqual(layout.top + layout.screenHeight + layout.chromeHeight);
      expect(layout.captionTop + layout.captionHeight).toBeLessThanOrEqual(height);
      expect(layout.captionHeight).toBeCloseTo(height * .06);
      expect(railScreenOffset(timeline, width, height, layout.top, 1)).toBe(0);
      expect(layoutFor(width, height, chrome, { ...timeline, events: timeline.events.map((e) => e.kind === "caption" ? { ...e, t: 4000 } : e) })).toEqual(layout);
    }
  });
  it.each(compositionPresets)("$id keeps actual wrapped glyph boxes inside the band and below the screen at every entrance/exit frame", async ({ width, height }) => {
    const layout = layoutFor(width, height, "macos", timeline);
    const page = await browser.newPage({ viewport: { width, height } });
    const text = "Review the supporting documents, add the missing details, and return the updated answer to the Bank";
    const caption = { t: 1000, kind: "caption" as const, text, durationMs: 2400 };
    try {
      for (const age of [0, 1000 / 60, 100, 250, 450, 1000, 2260, 2383, 2400]) {
        const html = renderToStaticMarkup(createElement(CaptionVisual, { caption, timeMs: caption.t + age,
          width, height, bandTop: layout.captionTop, bandHeight: layout.captionHeight }));
        await page.setContent(`<style>@font-face{font-family:'Geist Sans';src:url(data:font/woff2;base64,${font});font-weight:500}body{margin:0}</style>${html}`);
        await page.evaluate(() => document.fonts.ready);
        const measured = await page.locator("[data-caption-band]").evaluate((band) => {
          const text = band.firstElementChild!;
          const rect = text.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            background: getComputedStyle(text).backgroundColor,
            words: Array.from(text.children).map((word) => { const b = word.getBoundingClientRect();
              return { top: b.top, bottom: b.bottom, opacity: Number(getComputedStyle(word).opacity) }; }) };
        });
        expect(measured.top).toBeGreaterThanOrEqual(layout.captionTop);
        expect(measured.bottom).toBeLessThanOrEqual(layout.captionTop + layout.captionHeight);
        expect(measured.left).toBeGreaterThanOrEqual(0);
        expect(measured.right).toBeLessThanOrEqual(width);
        expect(measured.background).toBe("rgba(0, 0, 0, 0)");
        const screenBottom = layout.top + layout.chromeHeight + layout.screenHeight;
        // Include the cut's largest incoming frame scale, with its centre origin.
        const maxScreenBottom = screenBottom + (layout.screenHeight + layout.chromeHeight) * .015 / 2;
        for (const word of measured.words) {
          expect(word.top).toBeGreaterThan(maxScreenBottom);
          expect(word.bottom).toBeLessThanOrEqual(layout.captionTop + layout.captionHeight);
        }
        if (age > 0) expect(measured.words[0]!.opacity).toBeGreaterThan(0);
      }
    } finally { await page.close(); }
  });
  it("has no backing at any entrance frame and starts words without the old 220ms delay", () => {
    const caption = { t: 1000, kind: "caption" as const, text: "Send the request", durationMs: 2400 };
    for (let age = 0; age <= 500; age += 1000 / 60) {
      const html = renderToStaticMarkup(createElement(CaptionVisual, { caption, timeMs: caption.t + age,
        width: 2560, height: 1440, bandTop: 1320, bandHeight: 86.4 }));
      expect(html).not.toMatch(/background|box-shadow|border-radius/);
      const firstOpacity = Number(html.match(/<span[^>]*opacity:([\d.e+-]+)/)?.[1]);
      if (age > 0) expect(firstOpacity).toBeGreaterThan(0);
      else expect(firstOpacity).toBe(0);
    }
  });
});
