import { afterEach, describe, expect, it, vi } from "vitest";
import { systemEnv } from "../lib/record-env.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("record child environment", () => {
  it("passes the Chromium executable override through to child processes", () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "/custom/chromium");
    expect(systemEnv().PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH).toBe("/custom/chromium");
    expect(systemEnv({ DISPLAY: ":99" })).toMatchObject({
      DISPLAY: ":99",
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/custom/chromium",
    });
  });

  it("omits an unset executable override", () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", undefined);
    expect(systemEnv()).not.toHaveProperty("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
  });
});
