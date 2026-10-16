import path from "node:path";

export function systemEnv(extra = {}) {
  const nodeBin = path.dirname(process.execPath);
  return {
    HOME: process.env.HOME,
    LANG: process.env.LANG ?? "C.UTF-8",
    LOGNAME: process.env.LOGNAME,
    PATH: `${nodeBin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    TMPDIR: process.env.TMPDIR,
    USER: process.env.USER,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH !== undefined
      ? {
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:
            process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        }
      : {}),
    ...extra,
  };
}
