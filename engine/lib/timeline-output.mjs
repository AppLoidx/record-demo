import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeSynchronizedTimelines({
  outputDirectory,
  demoName,
  content,
}) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "timeline.json"), content, "utf8"),
    writeFile(
      path.join(outputDirectory, `${demoName}-timeline.json`),
      content,
      "utf8",
    ),
  ]);
}
