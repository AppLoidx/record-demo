import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../lib/record-options.mjs";

const requiredArgs = [
  "--script",
  "scripts/example-site.demo.ts",
  "--url",
  "https://example.org",
];

describe("parseCliArgs", () => {
  it("defaults to the 16x9 preset with no window chrome", () => {
    const options = parseCliArgs(requiredArgs, "/engine");

    expect(options.formats).toEqual(["16x9"]);
    expect(options.windowChrome).toBe("none");
  });

  it("normalizes and deduplicates presets in first-seen order", () => {
    const options = parseCliArgs(
      [
        ...requiredArgs,
        "--formats",
        " 9x16, 1x1 ,,9x16,16x9, 1x1 ",
        "--chrome",
        "browser",
      ],
      "/engine",
    );

    expect(options.formats).toEqual(["9x16", "1x1", "16x9"]);
    expect(options.windowChrome).toBe("browser");
  });

  it("lists valid preset ids when a requested format is unknown", () => {
    expect(() =>
      parseCliArgs([...requiredArgs, "--formats", "16x9,bogus"], "/engine"),
    ).toThrowError(/Unknown format: bogus\. Valid formats: 16x9, 1x1, 9x16\./);
  });

  it("rejects a CSV containing no preset ids", () => {
    expect(() =>
      parseCliArgs([...requiredArgs, "--formats", " , , "], "/engine"),
    ).toThrowError(/--formats must include at least one format\./);
  });

  it("lists valid chrome values when chrome is unknown", () => {
    expect(() =>
      parseCliArgs([...requiredArgs, "--chrome", "windows"], "/engine"),
    ).toThrowError(
      /Invalid --chrome value: windows\. Valid values: none, macos, browser\./,
    );
  });
});
