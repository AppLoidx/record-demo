import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledTool, packageCli } from "../lib/ffmpeg.mjs";

describe("bundledTool", () => {
  it("runs Remotion's bundled ffmpeg through the current Node binary", () => {
    const [command, args] = bundledTool("ffmpeg", ["-version"]);

    expect(command).toBe(process.execPath);
    expect(existsSync(args[0]!)).toBe(true);
    expect(args.slice(1)).toEqual(["ffmpeg", "-version"]);
  });

  it("resolves a package CLI without a shell shim", () => {
    const [command, args] = packageCli("@playwright/test", "playwright", ["test"]);

    expect(command).toBe(process.execPath);
    expect(existsSync(args[0]!)).toBe(true);
    expect(args[1]).toBe("test");
  });

  it("rejects other tools", () => {
    expect(() => bundledTool("ffplay", [])).toThrow(/Unsupported/);
  });
});
