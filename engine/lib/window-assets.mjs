import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** Copy the run's referenced inset images into a Remotion public directory. */
export async function stageWindowAssets(
  timeline,
  artifactsDirectory,
  publicDirectory,
) {
  const images = [
    ...new Set(
      timeline.events
        .filter((event) => event.kind === "window")
        .map((event) => event.image),
    ),
  ];
  const destinations = [];
  for (const image of images) {
    const destination = path.join(publicDirectory, image);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(artifactsDirectory, image), destination);
    destinations.push(destination);
  }
  return destinations;
}
