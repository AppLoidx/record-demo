import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import fixtureTimeline from "../fixtures/timeline.json";
import { writeSynchronizedTimelines } from "../lib/timeline-output.mjs";
import { exportProject } from "../scripts/export-project.mjs";

const engineRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "record-demo-export-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(directory, prefix), {
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(prefix, entry.name);
      return entry.isDirectory()
        ? listFiles(directory, relativePath)
        : [relativePath];
    }),
  );
  return files.flat().sort();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      const { rm } = await import("node:fs/promises");
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("writeSynchronizedTimelines", () => {
  it("writes the shared and per-demo timeline with identical content", async () => {
    const outputDirectory = await temporaryDirectory();
    const content = `${JSON.stringify(fixtureTimeline, null, 2)}\n`;

    await writeSynchronizedTimelines({
      outputDirectory,
      demoName: "synthetic-demo",
      content,
    });

    await expect(
      readFile(path.join(outputDirectory, "timeline.json"), "utf8"),
    ).resolves.toBe(content);
    await expect(
      readFile(
        path.join(outputDirectory, "synthetic-demo-timeline.json"),
        "utf8",
      ),
    ).resolves.toBe(content);
  });
});

describe("exportProject", () => {
  it("exports an isolated editable project with pinned engine dependencies", async () => {
    const temporaryRoot = await temporaryDirectory();
    const artifactsDirectory = path.join(temporaryRoot, "out");
    const outputDirectory = path.join(temporaryRoot, "synthetic-project");
    const timelinePath = path.join(
      artifactsDirectory,
      "synthetic-demo-timeline.json",
    );
    const videoPath = path.join(
      artifactsDirectory,
      "synthetic-demo-trimmed-master.mp4",
    );
    const videoStub = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(artifactsDirectory, { recursive: true });
    await writeFile(timelinePath, `${JSON.stringify(fixtureTimeline)}\n`);
    await writeFile(videoPath, videoStub);

    await exportProject({
      name: "synthetic-demo",
      engineRoot,
      artifactsDirectory,
      outputDirectory,
    });

    expect(await listFiles(outputDirectory)).toEqual([
      ".nvmrc",
      "README.md",
      "fixtures/timeline.json",
      "lib/camera.ts",
      "lib/cursor-position.ts",
      "lib/timeline.ts",
      "package.json",
      "pnpm-workspace.yaml",
      "public/fonts/geist-sans-latin-400-v5.2.5.woff2",
      "public/fonts/geist-sans-latin-500-v5.2.5.woff2",
      "public/synthetic-demo-trimmed-master.mp4",
      "remotion/Background.tsx",
      "remotion/Captions.tsx",
      "remotion/Cursor.tsx",
      "remotion/DemoVideo.tsx",
      "remotion/Outro.tsx",
      "remotion/Root.tsx",
      "remotion/Screen.tsx",
      "remotion/Spotlight.tsx",
      "remotion/schema.ts",
      "remotion/theme.ts",
      "remotion/zoom.ts",
      "tsconfig.json",
    ]);

    const enginePackage = JSON.parse(
      await readFile(path.join(engineRoot, "package.json"), "utf8"),
    );
    const projectPackage = JSON.parse(
      await readFile(path.join(outputDirectory, "package.json"), "utf8"),
    );
    expect(projectPackage).toEqual({
      name: "synthetic-demo-demo-project",
      private: true,
      type: "module",
      scripts: {
        studio: "remotion studio remotion/Root.tsx --port 3333",
        render:
          "remotion render remotion/Root.tsx 16x9 out/synthetic-demo-16x9.mp4 --fps=60 --codec=h264 --crf=18",
      },
      dependencies: {
        remotion: enginePackage.dependencies.remotion,
        "@remotion/cli": enginePackage.dependencies["@remotion/cli"],
        "@remotion/zod-types":
          enginePackage.dependencies["@remotion/zod-types"],
        zod: enginePackage.dependencies.zod,
        react: enginePackage.dependencies.react,
        "react-dom": enginePackage.dependencies["react-dom"],
      },
    });

    await expect(
      readFile(path.join(outputDirectory, "fixtures/timeline.json"), "utf8"),
    ).resolves.toBe(`${JSON.stringify(fixtureTimeline)}\n`);
    await expect(
      readFile(
        path.join(outputDirectory, "public/synthetic-demo-trimmed-master.mp4"),
      ),
    ).resolves.toEqual(videoStub);
    await expect(
      readFile(path.join(outputDirectory, "remotion/Root.tsx"), "utf8"),
    ).resolves.toContain('videoSrc: "synthetic-demo-trimmed-master.mp4"');

    const textFiles = (await listFiles(outputDirectory)).filter(
      (file) => !file.endsWith(".mp4") && !file.endsWith(".woff2"),
    );
    for (const file of textFiles) {
      expect(
        await readFile(path.join(outputDirectory, file), "utf8"),
        file,
      ).not.toContain(engineRoot);
    }
  });

  it("names a missing timeline and tells the user to record first", async () => {
    const temporaryRoot = await temporaryDirectory();
    const missingPath = path.join(
      temporaryRoot,
      "out/synthetic-demo-timeline.json",
    );

    await expect(
      exportProject({
        name: "synthetic-demo",
        engineRoot,
        artifactsDirectory: path.dirname(missingPath),
        outputDirectory: path.join(temporaryRoot, "project"),
      }),
    ).rejects.toThrow(`${missingPath} is missing; record synthetic-demo first`);
  });

  it("names a missing video and tells the user to record first", async () => {
    const temporaryRoot = await temporaryDirectory();
    const artifactsDirectory = path.join(temporaryRoot, "out");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(artifactsDirectory, { recursive: true });
    await writeFile(
      path.join(artifactsDirectory, "synthetic-demo-timeline.json"),
      `${JSON.stringify(fixtureTimeline)}\n`,
    );
    const missingPath = path.join(
      artifactsDirectory,
      "synthetic-demo-trimmed-master.mp4",
    );

    await expect(
      exportProject({
        name: "synthetic-demo",
        engineRoot,
        artifactsDirectory,
        outputDirectory: path.join(temporaryRoot, "project"),
      }),
    ).rejects.toThrow(`${missingPath} is missing; record synthetic-demo first`);
  });
});
