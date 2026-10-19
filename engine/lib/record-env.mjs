import path from "node:path";

// Variables child processes need on macOS, Linux and Windows. DISPLAY and
// friends only matter for --headed runs on a Linux desktop.
const PASSTHROUGH = [
  "HOME",
  "LANG",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  // Windows
  "APPDATA",
  "ComSpec",
  "LOCALAPPDATA",
  "PATHEXT",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
];

/**
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function systemEnv(extra = {}) {
  const nodeBin = path.dirname(process.execPath);
  const inherited = Object.fromEntries(
    PASSTHROUGH.filter((name) => process.env[name] !== undefined).map(
      (name) => [name, process.env[name]],
    ),
  );
  return {
    ...inherited,
    LANG: process.env.LANG ?? "C.UTF-8",
    PATH: [nodeBin, process.env.PATH ?? process.env.Path ?? "/usr/bin:/bin"].join(
      path.delimiter,
    ),
    ...extra,
  };
}
