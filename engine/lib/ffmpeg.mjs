import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// Remotion ships ffmpeg/ffprobe builds (plus their shared libraries) for every
// platform it renders on. Going through its CLI sets the library path for us,
// so the engine needs no system ffmpeg.
function remotionCliPath() {
  const packagePath = require.resolve("@remotion/cli/package.json");
  const { bin } = JSON.parse(readFileSync(packagePath, "utf8"));
  return path.join(path.dirname(packagePath), bin.remotion);
}

/** Returns [command, args] that run Remotion's bundled ffmpeg or ffprobe. */
export function bundledTool(tool, args) {
  if (tool !== "ffmpeg" && tool !== "ffprobe") {
    throw new Error(`Unsupported bundled tool: ${tool}`);
  }
  return [process.execPath, [remotionCliPath(), tool, ...args]];
}
