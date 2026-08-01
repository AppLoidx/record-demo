import { demo } from "/home/bbx/.claude/skills/record-demo/engine/lib/storyboard";

demo("example-site", async (d) => {
  await d.seed(async (page) => {
    await page
      .getByRole("heading", { name: "Example Domain" })
      .waitFor({ timeout: 10_000 });
  });

  await d.step(
    "Any website can be a recording target",
    async (page) => {
      const heading = page.getByRole("heading", { name: "Example Domain" });
      await d.zoomTo(heading, { padding: 48 });
      await d.hold(9_000);
      d.zoomOut();
      await d.hold(4_000);
      await heading.waitFor({ state: "visible" });
    },
    4_200,
  );

  await d.outro("Any website. One storyboard.");
});
