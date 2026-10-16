import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChromiumExecutable } from "../lib/storyboard";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Chromium executable resolution", () => {
  it("defaults to the installed Playwright executable path", async () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", undefined);
    const executablePath = vi.spyOn(chromium, "executablePath").mockReturnValue(process.execPath);
    await expect(resolveChromiumExecutable()).resolves.toBe(process.execPath);
    expect(executablePath).toHaveBeenCalledOnce();
  });

  it("prefers the environment override", async () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", process.execPath);
    const executablePath = vi.spyOn(chromium, "executablePath");
    await expect(resolveChromiumExecutable()).resolves.toBe(process.execPath);
    expect(executablePath).not.toHaveBeenCalled();
  });

  it("checks executable access and retains actionable errors", async () => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "/missing/demo-chromium");
    await expect(resolveChromiumExecutable()).rejects.toThrow(
      'Chromium executable is unavailable at "/missing/demo-chromium". Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an executable Chromium binary.',
    );
  });
});
