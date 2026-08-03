import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compositionPresets } from "../remotion/theme.ts";

export const formatIds = compositionPresets.map(({ id }) => id);
export const windowChromeValues = ["none", "macos", "browser"];
const defaultFormat = "16x9";

if (!formatIds.includes(defaultFormat)) {
  throw new Error(`Default format is not configured: ${defaultFormat}`);
}

export const usage =
  "Usage: node record.mjs --script <path> --url <absolute http(s) url> [--name <slug>] [--formats <csv>] [--chrome <none|macos|browser>] [--storage-state <path>] [--raw]";

function assertStorageStateShape(storageState, storageStatePath) {
  if (
    storageState === null ||
    typeof storageState !== "object" ||
    Array.isArray(storageState) ||
    ("cookies" in storageState && !Array.isArray(storageState.cookies)) ||
    ("origins" in storageState && !Array.isArray(storageState.origins))
  ) {
    throw new Error(
      `Storage state file must contain an object with optional cookies and origins arrays: ${storageStatePath}`,
    );
  }
}

function assertStorageStatePathIsSafe(storageStatePath) {
  let workTreePath;
  try {
    workTreePath = execFileSync(
      "git",
      ["-C", path.dirname(storageStatePath), "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return;
  }

  try {
    execFileSync(
      "git",
      ["-C", workTreePath, "check-ignore", "-q", "--", storageStatePath],
      { stdio: "ignore" },
    );
  } catch (error) {
    if (error?.code === "ENOENT") return;
    if (error?.status === 1) {
      throw new Error(
        `Storage state file is inside a Git work tree and is not ignored: ${storageStatePath}. Move it to \${XDG_STATE_HOME:-~/.local/state}/record-demo/.`,
      );
    }
  }
}

export function parseCliArgs(cliArgs, cwd = process.cwd()) {
  const values = new Map();
  let rawOnly = false;

  for (let index = 0; index < cliArgs.length; index += 1) {
    const arg = cliArgs[index];
    if (arg === "--raw") {
      rawOnly = true;
      continue;
    }
    if (
      ![
        "--script",
        "--url",
        "--name",
        "--formats",
        "--chrome",
        "--storage-state",
      ].includes(arg)
    ) {
      throw new Error(`${usage}\nUnknown argument: ${arg}`);
    }
    const value = cliArgs[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${usage}\nMissing value for ${arg}.`);
    }
    values.set(arg, value);
    index += 1;
  }

  const scriptArg = values.get("--script");
  const urlArg = values.get("--url");
  if (!scriptArg || !urlArg) {
    throw new Error(`${usage}\nBoth --script and --url are required.`);
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlArg);
  } catch {
    throw new Error(`${usage}\n--url must be an absolute HTTP(S) URL.`);
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    throw new Error(`${usage}\n--url must be an absolute HTTP(S) URL.`);
  }

  const scriptPath = path.resolve(cwd, scriptArg);
  const defaultName = path.basename(scriptPath).replace(/\.demo\.ts$/, "");
  const demoName = values.get("--name") ?? defaultName;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(demoName)) {
    throw new Error(
      `${usage}\n--name must be a lowercase slug containing letters, numbers, and single hyphens.`,
    );
  }

  const formats = [
    ...new Set(
      (values.get("--formats") ?? defaultFormat)
        .split(",")
        .map((format) => format.trim())
        .filter(Boolean),
    ),
  ];
  if (formats.length === 0) {
    throw new Error(`${usage}\n--formats must include at least one format.`);
  }
  const unknownFormat = formats.find((format) => !formatIds.includes(format));
  if (unknownFormat !== undefined) {
    throw new Error(
      `${usage}\nUnknown format: ${unknownFormat}. Valid formats: ${formatIds.join(", ")}.`,
    );
  }

  const windowChrome = values.get("--chrome") ?? windowChromeValues[0];
  if (!windowChromeValues.includes(windowChrome)) {
    throw new Error(
      `${usage}\nInvalid --chrome value: ${windowChrome}. Valid values: ${windowChromeValues.join(", ")}.`,
    );
  }

  const storageStateArg = values.get("--storage-state");
  const storageStatePath = storageStateArg
    ? path.resolve(cwd, storageStateArg)
    : undefined;
  if (storageStatePath) {
    let contents;
    try {
      contents = readFileSync(storageStatePath, "utf8");
    } catch {
      throw new Error(
        `Storage state file does not exist or is not readable: ${storageStatePath}`,
      );
    }
    let storageState;
    try {
      storageState = JSON.parse(contents);
    } catch {
      throw new Error(
        `Storage state file is not valid JSON: ${storageStatePath}`,
      );
    }
    assertStorageStateShape(storageState, storageStatePath);
    assertStorageStatePathIsSafe(storageStatePath);
  }

  return {
    demoName,
    formats,
    rawOnly,
    scriptPath,
    ...(storageStatePath ? { storageStatePath } : {}),
    targetUrl: targetUrl.toString(),
    windowChrome,
  };
}
