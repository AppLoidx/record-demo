import { constants as fsConstants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const usage =
  "Usage: node scripts/export-project.mjs <name> [--out <dir>]";

const defaultEngineRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceExtensions = ["", ".ts", ".tsx", ".mjs", ".js", ".json"];
const dependencyNames = [
  "remotion",
  "@remotion/cli",
  "@remotion/zod-types",
  "zod",
  "react",
  "react-dom",
];

function parseCliArgs(args, cwd = process.cwd()) {
  const name = args[0];
  if (!name || name.startsWith("--")) {
    throw new Error(`${usage}\nA demo name is required.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      `${usage}\n<name> must be a lowercase slug containing letters, numbers, and single hyphens.`,
    );
  }

  let outputDirectory;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] !== "--out") {
      throw new Error(`${usage}\nUnknown argument: ${args[index]}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${usage}\nMissing value for --out.`);
    }
    outputDirectory = path.resolve(cwd, value);
    index += 1;
  }

  return { name, outputDirectory };
}

async function requireRecordingArtifact(filePath, name) {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    throw new Error(`${filePath} is missing; record ${name} first.`);
  }
}

function assertInsideEngine(engineRoot, sourcePath) {
  const relativePath = path.relative(engineRoot, sourcePath);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Composition import escapes the engine: ${sourcePath}`);
  }
  return relativePath;
}

async function resolveLocalImport(engineRoot, fromPath, importPath) {
  const unresolved = path.resolve(path.dirname(fromPath), importPath);
  assertInsideEngine(engineRoot, unresolved);

  for (const extension of sourceExtensions) {
    const candidate = `${unresolved}${extension}`;
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }

  throw new Error(`Could not resolve composition import ${importPath}.`);
}

function relativeImports(source) {
  const imports = [];
  const pattern = /(?:from\s+|import\s*)["'](\.[^"']+)["']/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

async function copyCompositionGraph({
  engineRoot,
  outputDirectory,
  videoName,
}) {
  const pending = [path.join(engineRoot, "remotion", "Root.tsx")];
  const copied = new Set();

  while (pending.length > 0) {
    const sourcePath = pending.pop();
    const relativePath = assertInsideEngine(engineRoot, sourcePath);
    if (copied.has(relativePath)) continue;
    copied.add(relativePath);

    const source = await readFile(sourcePath, "utf8");
    const imports = relativeImports(source);
    for (const importPath of imports) {
      pending.push(
        await resolveLocalImport(engineRoot, sourcePath, importPath),
      );
    }

    const destinationPath = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    const output =
      relativePath === path.join("remotion", "Root.tsx")
        ? source.replace(
            'videoSrc: "composition-proof-source.mp4"',
            `videoSrc: "${videoName}"`,
          )
        : source;
    if (
      output === source &&
      relativePath === path.join("remotion", "Root.tsx")
    ) {
      throw new Error("Could not set the exported Root default videoSrc.");
    }
    await writeFile(destinationPath, output, "utf8");
  }
}

async function copyFonts(engineRoot, outputDirectory) {
  const sourceDirectory = path.join(engineRoot, "public", "fonts");
  const destinationDirectory = path.join(outputDirectory, "public", "fonts");
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  await mkdir(destinationDirectory, { recursive: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        copyFile(
          path.join(sourceDirectory, entry.name),
          path.join(destinationDirectory, entry.name),
        ),
      ),
  );
}

function readExactDependencies(enginePackage) {
  return Object.fromEntries(
    dependencyNames.map((dependencyName) => {
      const version = enginePackage.dependencies?.[dependencyName];
      if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
        throw new Error(
          `Engine dependency ${dependencyName} must have an exact installed version.`,
        );
      }
      return [dependencyName, version];
    }),
  );
}

function projectReadme(name) {
  return `# ${name} demo project

This folder is a self-contained Remotion project for editing the recorded demo.

\`\`\`bash
pnpm install
pnpm studio
\`\`\`

Use the Studio props panel to edit captions, zoom and spotlight timing, the outro title, window chrome, and other timeline fields. Zoom moves have a 1650ms minimum in the theme. For durable timeline edits, update \`fixtures/timeline.json\`; because the default timeline is imported from that fixture, Studio's save-defaults codemod may not rewrite the imported timeline value.

Edit colors, spacing, typography, and motion constants in \`remotion/theme.ts\`.

Render the 16:9 composition with:

\`\`\`bash
pnpm render
\`\`\`
`;
}

export async function exportProject({
  name,
  outputDirectory = path.join(defaultEngineRoot, "out", `${name}-project`),
  engineRoot = defaultEngineRoot,
  artifactsDirectory = path.join(engineRoot, "out"),
}) {
  const timelinePath = path.join(artifactsDirectory, `${name}-timeline.json`);
  const videoName = `${name}-trimmed-master.mp4`;
  const videoPath = path.join(artifactsDirectory, videoName);
  await requireRecordingArtifact(timelinePath, name);
  await requireRecordingArtifact(videoPath, name);

  const enginePackage = JSON.parse(
    await readFile(path.join(engineRoot, "package.json"), "utf8"),
  );
  const packageJson = {
    name: `${name}-demo-project`,
    private: true,
    type: "module",
    scripts: {
      studio: "remotion studio remotion/Root.tsx --port 3333",
      render: `remotion render remotion/Root.tsx 16x9 out/${name}-16x9.mp4 --fps=60 --codec=h264 --crf=18`,
    },
    dependencies: readExactDependencies(enginePackage),
  };

  await mkdir(outputDirectory, { recursive: true });
  await copyCompositionGraph({ engineRoot, outputDirectory, videoName });
  await mkdir(path.join(outputDirectory, "public"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(outputDirectory, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    ),
    copyFile(
      path.join(engineRoot, "tsconfig.json"),
      path.join(outputDirectory, "tsconfig.json"),
    ),
    copyFile(
      path.join(engineRoot, ".nvmrc"),
      path.join(outputDirectory, ".nvmrc"),
    ),
    writeFile(
      path.join(outputDirectory, "pnpm-workspace.yaml"),
      'packages:\n  - "."\n',
      "utf8",
    ),
    writeFile(
      path.join(outputDirectory, "README.md"),
      projectReadme(name),
      "utf8",
    ),
    copyFile(
      timelinePath,
      path.join(outputDirectory, "fixtures", "timeline.json"),
    ),
    copyFile(videoPath, path.join(outputDirectory, "public", videoName)),
    copyFonts(engineRoot, outputDirectory),
  ]);

  return outputDirectory;
}

async function main() {
  const { name, outputDirectory } = parseCliArgs(process.argv.slice(2));
  const projectDirectory = await exportProject({ name, outputDirectory });
  console.log(`Exported editable project to ${projectDirectory}`);
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPath === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
