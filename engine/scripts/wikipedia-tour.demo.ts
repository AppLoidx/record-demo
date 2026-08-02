import { demo } from "record-demo/storyboard";

demo("wikipedia-tour", async (d) => {
  await d.seed(async (page) => {
    await page.locator("#searchInput").waitFor({ timeout: 15_000 });
    await page
      .getByText("The Free Encyclopedia")
      .waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
  });

  await d.step(
    "Search Wikipedia",
    async (page) => {
      const searchInput = page.locator("#searchInput");
      await d.zoomTo(searchInput, { padding: 140 });
      await d.click(searchInput);
      await d.type("Ada Lovelace", 55);
      await page.locator(".suggestion-link").first().waitFor({ timeout: 10_000 });
      await d.hold(1_600);
    },
    3_400,
  );

  await d.step(
    "Open the top suggestion",
    async (page) => {
      const suggestion = page.locator(".suggestion-link").first();
      d.zoomOut();
      await d.hold(700);
      await d.click(suggestion);
      await page.locator("#firstHeading").waitFor({ timeout: 20_000 });
      await d.hold(1_400);
    },
    3_000,
  );

  await d.step(
    "Read the article lead",
    async (page) => {
      const heading = page.locator("#firstHeading");
      const lead = page.locator("#mw-content-text p").filter({ hasText: "Lovelace" }).first();
      await d.zoomTo([heading, lead], { padding: 64 });
      await d.hold(2_600);
      d.zoomOut();
      await d.hold(800);
    },
    3_200,
  );

  await d.step(
    "Focus the infobox",
    async (page) => {
      const portrait = page.locator(".infobox-image img").first();
      await portrait.waitFor({ state: "visible", timeout: 10_000 });
      await portrait.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await d.hold(500);
      await d.spotlight([portrait], { holdMs: 2_600 });
      d.spotlightOff();
      await d.hold(700);
    },
    3_400,
  );

  await d.step(
    "Jump to a section from the contents",
    async (page) => {
      const tocLink = page
        .locator('nav a[href="#Commemoration"]:visible')
        .first();
      await tocLink.scrollIntoViewIfNeeded({ timeout: 5_000 });
      await d.click(tocLink);
      const sectionHeading = page
        .getByRole("heading", { name: "Commemoration" })
        .first();
      await sectionHeading.waitFor({ timeout: 10_000 });
      await d.zoomTo(sectionHeading, { padding: 160, scroll: "center" });
      await d.hold(2_400);
      d.zoomOut();
      await d.hold(1_000);
      await sectionHeading.waitFor({ state: "visible" });
    },
    3_600,
  );

  await d.outro("Any live site. One storyboard.");
});
