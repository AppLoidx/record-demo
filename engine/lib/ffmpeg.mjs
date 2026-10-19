import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/**
 * Returns [command, args] that run a package's CLI with the current Node.
 * Spawning Node directly (not a pnpm or .cmd shim) needs no shell, so paths
 * with spaces stay intact on Windows.
 */
export function packageCli(packageName, binName, args) {
  const packagePath = require.resolve(`${packageName}/package.json`);
  const { bin } = JSON.parse(readFileSync(packagePath, "utf8"));
  const relative = typeof bin === "string" ? bin : bin[binName];
  if (!relative) throw new Error(`${packageName} has no "${binName}" bin`);
  return [process.execPath, [path.join(path.dirname(packagePath), relative), ...args]];
}

// Remotion ships ffmpeg/ffprobe builds (plus their shared libraries) for every
// platform it renders on. Going through its CLI sets the library path for us,
// so the engine needs no system ffmpeg. The build is stripped: no fps, tile,
// drawtext or lavfi sources.
/** Returns [command, args] that run Remotion's bundled ffmpeg or ffprobe. */
export function bundledTool(tool, args) {
  if (tool !== "ffmpeg" && tool !== "ffprobe") {
    throw new Error(`Unsupported bundled tool: ${tool}`);
  }
  return packageCli("@remotion/cli", "remotion", [tool, ...args]);
}
