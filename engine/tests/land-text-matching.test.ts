import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { measureLandText } from "../lib/land-text";

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function measure(html: string, search: string) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<p style="font:20px/28px Arial">${html}</p>`);
    return await page.locator("p").evaluate(measureLandText, search);
  } finally { await page.close(); }
}

describe("land text matching", () => {
  it("collapses DOM and searched whitespace across nodes while preserving Range offsets", async () => {
    const result = await measure('Needs changes · Describe\n <b>the\t source</b>\u00a0 of   funds', '  Describe the source\n of funds  ');
    expect(result?.lines.map((line) => line.text).join(" ")).toBe("Describe the source of funds");
    expect(result?.rect.x).toBeGreaterThan(100);
  });
  it("skips an occurrence without a visible rect and selects the visible duplicate", async () => {
    const result = await measure('<span style="display:none">Describe funds</span><span style="margin-left:100px">Describe funds</span>', "Describe funds");
    expect(result?.rect.x).toBeGreaterThanOrEqual(108);
    expect(result?.lines[0]?.text).toBe("Describe funds");
  });
  it.each([
    '<span style="display:none">Describe funds</span>',
    'Another message',
  ])("names the searched text when no visible occurrence exists", async (html) => {
    await expect(measure(html, "Describe funds")).rejects.toThrow(/land text.*Describe funds.*not found/);
  });
  it("rejects whitespace-only searched text", async () => {
    await expect(measure("Actual message", " \n\t ")).rejects.toThrow("land text must not be empty");
  });
});
