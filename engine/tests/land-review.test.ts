import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { Storyboard } from "../lib/storyboard";
import type { TimelineEvent, LandEvent } from "../lib/timeline";
import { carryCutLabTimeline } from "../remotion/Labs";
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });
async function setup(html: string) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(html);
  vi.spyOn(page, "waitForTimeout").mockResolvedValue();
  const d = new Storyboard("land-review", page, carryCutLabTimeline.viewport);
  d.start(); vi.spyOn(d, "ensureStarted").mockResolvedValue();
  const events = (d as unknown as { events: TimelineEvent[] }).events;
  events.push({ t: 0, kind: "carry", rect: { x: 10, y: 10, width: 100, height: 25 }, text: "Message" });
  await d.cut(async () => {});
  return { page, d, events };
}
const movedError = "land target moved after the scene change; scroll inside the cut action";
describe("land preserves the incoming scene", () => {
  it.each(["p", "input"])("records the actual %s source font size at lift", async (tag) => {
    const { page, d, events } = await setup(tag === "input" ? '<input value="Message" style="font:24px Arial">' : '<p style="font:24px Arial">Message</p>');
    try {
      await d.carry(page.locator(tag), "Message");
      expect(events.at(-1)).toMatchObject({ kind: "carry", textStyle: { fontSize: 24, fontFamily: "Arial" } });
    } finally { await page.close(); }
  });
  it.each([false, true])("rejects an offscreen target without scrolling (nested: %s)", async (nested) => {
    const { page, d, events } = await setup(nested
      ? '<div id="scroll" style="height:100px;overflow:auto"><div style="height:1200px"></div><p>Message</p></div>'
      : '<div style="height:1500px"></div><p>Message</p>');
    try {
      const before = await page.evaluate(() => ({ y: scrollY, nested: document.querySelector("#scroll")?.scrollTop }));
      await expect(d.land(page.locator("p"), { text: "Message" })).rejects.toThrow(movedError);
      expect(await page.evaluate(() => ({ y: scrollY, nested: document.querySelector("#scroll")?.scrollTop }))).toEqual(before);
      expect(events.some((e) => e.kind === "land")).toBe(false);
    } finally { await page.close(); }
  });
  it("rejects geometry changed after the incoming freeze, before land is called", async () => {
    const { page, d } = await setup('<p>Message</p>');
    try {
      await page.locator("p").evaluate((p) => { p.style.marginTop = "200px"; });
      await expect(d.land(page.locator("p"), { text: "Message" })).rejects.toThrow(movedError);
    } finally { await page.close(); }
  });
  it("accepts a framework remount with unchanged text and geometry", async () => {
    const { page, d, events } = await setup('<p>Message</p>');
    try {
      await page.locator("p").evaluate((p) => { p.outerHTML = p.outerHTML; });
      await d.land(page.locator("p"), { text: "Message" });
      expect(events.at(-1)?.kind).toBe("land");
    } finally { await page.close(); }
  });
  it("rejects text moving within an unchanged target box", async () => {
    const { page, d } = await setup('<p style="height:200px"><span>Message</span></p>');
    try {
      await page.locator("span").evaluate((span) => { span.style.paddingLeft = "100px"; });
      await expect(d.land(page.locator("p"), { text: "Message" })).rejects.toThrow(movedError);
    } finally { await page.close(); }
  });
  it.each([undefined, "#123456"])("inherits the nearest painted ancestor unless overridden (%s)", async (concealColor) => {
    const { page, d, events } = await setup('<body style="background:#abcdef"><section style="background:rgb(40, 50, 60)"><div><p>Message</p></div></section></body>');
    try {
      await d.land(page.locator("p"), { text: "Message", concealColor });
      expect((events.at(-1) as LandEvent).concealColor).toBe(concealColor ?? "rgb(40, 50, 60)");
    } finally { await page.close(); }
  });
  it("keeps black backgrounds opaque", async () => {
    const { page, d, events } = await setup('<section style="background:black"><p>Message</p></section>');
    try {
      await d.land(page.locator("p"), { text: "Message" });
      expect((events.at(-1) as LandEvent).concealColor).toBe("rgb(0, 0, 0)");
    } finally { await page.close(); }
  });
  it("allows scrolling inside the cut action before the incoming snapshot", async () => {
    const { page, d, events } = await setup('<div style="height:1500px"></div><p>Message</p>');
    try {
      // A new carry pairs with the new cut, whose action settles the real page first.
      events.push({ t: 1, kind: "carry", rect: { x: 10, y: 10, width: 100, height: 25 }, text: "Message" });
      await d.cut(async () => { await page.locator("p").scrollIntoViewIfNeeded(); });
      await d.land(page.locator("p"), { text: "Message" });
      expect(events.at(-1)?.kind).toBe("land");
    } finally { await page.close(); }
  });
  it("falls back to the theme surface when ancestors are transparent", async () => {
    const { page, d, events } = await setup('<p>Message</p>');
    try {
      await d.land(page.locator("p"), { text: "Message" });
      expect((events.at(-1) as LandEvent).concealColor).toBe("#FFFFFF");
    } finally { await page.close(); }
  });
});
