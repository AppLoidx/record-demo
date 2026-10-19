import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "../lib/record-options.mjs";

const requiredArgs = [
  "--script",
  "scripts/example-site.demo.ts",
  "--url",
  "https://example.org",
];
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "record-demo-options-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("parseCliArgs", () => {
  it("defaults to the 16x9 preset with no window chrome", () => {
    const options = parseCliArgs(requiredArgs, "/engine");

    expect(options.formats).toEqual(["16x9"]);
    expect(options.windowChrome).toBe("none");
    expect(options).not.toHaveProperty("storageStatePath");
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

  it("defaults to a headless run on the bundled browser", () => {
    const options = parseCliArgs(requiredArgs, "/engine");

    expect(options.headed).toBe(false);
    expect(options).not.toHaveProperty("profileDir");
    expect(options).not.toHaveProperty("browserChannel");
  });

  it("accepts a profile directory, a browser channel and --headed", async () => {
    const cwd = await temporaryDirectory();

    const options = parseCliArgs(
      [...requiredArgs, "--profile", ".", "--channel", "chrome", "--headed"],
      cwd,
    );

    expect(options).toMatchObject({
      profileDir: cwd,
      browserChannel: "chrome",
      headed: true,
    });
  });

  it("rejects a missing profile directory", async () => {
    const cwd = await temporaryDirectory();

    expect(() =>
      parseCliArgs([...requiredArgs, "--profile", "missing"], cwd),
    ).toThrow(/Browser profile directory does not exist/);
  });

  it("lists valid channels when the channel is unknown", () => {
    expect(() =>
      parseCliArgs([...requiredArgs, "--channel", "firefox"], "/engine"),
    ).toThrow(/Valid values: chrome, msedge/);
  });

  it("resolves a valid storage state path relative to cwd", async () => {
    const cwd = await temporaryDirectory();
    const storageStatePath = path.join(cwd, "test.storage-state.json");
    await writeFile(
      storageStatePath,
      JSON.stringify({ cookies: [], origins: [] }),
    );

    const options = parseCliArgs(
      [...requiredArgs, "--storage-state", "test.storage-state.json"],
      cwd,
    );

    expect(options.storageStatePath).toBe(storageStatePath);
  });

  it("rejects a missing storage state file", async () => {
    const cwd = await temporaryDirectory();
    const storageStatePath = path.join(cwd, "missing.storage-state.json");

    expect(() =>
      parseCliArgs(
        [...requiredArgs, "--storage-state", "missing.storage-state.json"],
        cwd,
      ),
    ).toThrowError(
      `Storage state file does not exist or is not readable: ${storageStatePath}`,
    );
  });

  it("rejects invalid JSON in a storage state file", async () => {
    const cwd = await temporaryDirectory();
    const storageStatePath = path.join(cwd, "invalid.storage-state.json");
    await writeFile(storageStatePath, "not json");

    expect(() =>
      parseCliArgs(
        [...requiredArgs, "--storage-state", "invalid.storage-state.json"],
        cwd,
      ),
    ).toThrowError(`Storage state file is not valid JSON: ${storageStatePath}`);
  });

  it.each([
    ["null", null],
    ["a number", 42],
    ["a string", "storage state"],
    ["an array", []],
    ["non-array cookies", { cookies: {} }],
    ["non-array origins", { origins: {} }],
  ])("rejects storage state containing %s", async (_label, state) => {
    const cwd = await temporaryDirectory();
    const storageStatePath = path.join(cwd, "invalid-shape.json");
    await writeFile(storageStatePath, JSON.stringify(state));

    expect(() =>
      parseCliArgs(
        [...requiredArgs, "--storage-state", storageStatePath],
        cwd,
      ),
    ).toThrowError(
      `Storage state file must contain an object with optional cookies and origins arrays: ${storageStatePath}`,
    );
  });

  it("rejects an unignored storage state file inside a Git work tree", async () => {
    const cwd = await temporaryDirectory();
    execFileSync("git", ["init", "--quiet", cwd]);
    const storageStatePath = path.join(cwd, "account.storage-state.json");
    await writeFile(
      storageStatePath,
      JSON.stringify({ cookies: [], origins: [] }),
    );

    expect(() =>
      parseCliArgs(
        [...requiredArgs, "--storage-state", storageStatePath],
        cwd,
      ),
    ).toThrowError(
      `Storage state file is inside a Git work tree and is not ignored: ${storageStatePath}. Move it to a temporary path created with mktemp -d.`,
    );
  });

  it("accepts an ignored storage state file inside a Git work tree", async () => {
    const cwd = await temporaryDirectory();
    execFileSync("git", ["init", "--quiet", cwd]);
    await writeFile(path.join(cwd, ".gitignore"), "*.storage-state.json\n");
    const storageStatePath = path.join(cwd, "account.storage-state.json");
    await writeFile(
      storageStatePath,
      JSON.stringify({ cookies: [], origins: [] }),
    );

    const options = parseCliArgs(
      [...requiredArgs, "--storage-state", storageStatePath],
      cwd,
    );

    expect(options.storageStatePath).toBe(storageStatePath);
  });

  it("skips the work-tree safety check when Git is unavailable", async () => {
    const cwd = await temporaryDirectory();
    const storageStatePath = path.join(cwd, "account.storage-state.json");
    await writeFile(
      storageStatePath,
      JSON.stringify({ cookies: [], origins: [] }),
    );
    vi.stubEnv("PATH", "");

    const options = parseCliArgs(
      [...requiredArgs, "--storage-state", storageStatePath],
      cwd,
    );

    expect(options.storageStatePath).toBe(storageStatePath);
  });
});
