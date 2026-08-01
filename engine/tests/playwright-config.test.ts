import { afterEach, describe, expect, it, vi } from "vitest";

describe("Playwright demo target configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the external target origin as the browser base URL", async () => {
    vi.stubEnv("DEMO_TARGET_URL", "https://example.org/products?id=42");

    const { default: config } = await import("../playwright.config");

    expect(config.use?.baseURL).toBe("https://example.org");
  });

  it("runs an ad-hoc script from outside the engine", async () => {
    vi.stubEnv("DEMO_SCRIPT_PATH", "/tmp/example-adhoc.demo.ts");
    vi.stubEnv(
      "DEMO_PLAYWRIGHT_ENTRY_PATH",
      "/engine/out/.playwright-123/storyboard.demo.ts",
    );

    const { default: config } = await import("../playwright.config");

    expect(config.testDir).toBe("/engine/out/.playwright-123");
    expect(config.testMatch).toBe("storyboard.demo.ts");
  });
});
