import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engineRoot = fileURLToPath(new URL(".", import.meta.url));
const scriptPath = path.resolve(
  process.env.DEMO_SCRIPT_PATH ??
    path.join(engineRoot, "scripts", "example-site.demo.ts"),
);
const playwrightEntryPath = path.resolve(
  process.env.DEMO_PLAYWRIGHT_ENTRY_PATH ?? scriptPath,
);
const targetUrl = process.env.DEMO_TARGET_URL ?? "https://example.org";

export default defineConfig({
  testDir: path.dirname(playwrightEntryPath),
  testMatch: path.basename(playwrightEntryPath),
  // Multi-scene storyboards against local dev apps (route warm-up + ~90s of
  // capture) exceed 3 minutes.
  timeout: 300_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: new URL(targetUrl).origin,
    headless: false,
    video: "off",
    trace: "off",
    screenshot: "off",
  },
});
