import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { systemEnv } from "../lib/record-env.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("record child environment", () => {
  it("passes the Chromium executable override through to child processes", () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "/custom/chromium");
    expect(systemEnv().PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH).toBe("/custom/chromium");
    expect(systemEnv({ DEMO_NAME: "tour" })).toMatchObject({
      DEMO_NAME: "tour",
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/custom/chromium",
    });
  });

  it("passes the desktop display through for headed runs", () => {
    vi.stubEnv("DISPLAY", ":0");
    expect(systemEnv().DISPLAY).toBe(":0");
  });

  it("puts the running Node first on PATH", () => {
    expect(systemEnv().PATH.startsWith(path.dirname(process.execPath))).toBe(true);
  });

  it("omits an unset executable override", () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", undefined);
    expect(systemEnv()).not.toHaveProperty("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  });
});
