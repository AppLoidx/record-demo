import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const engineRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("record storage-state cleanup", () => {
  it("deletes an unconsumed state file when the run aborts after argument parsing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "record-demo-run-"));
    temporaryDirectories.push(cwd);
    const storageStatePath = path.join(cwd, "account.storage-state.json");
    await writeFile(
      storageStatePath,
      JSON.stringify({ cookies: [], origins: [] }),
    );

    await expect(
      execFileAsync(
        process.execPath,
        [
          path.join(engineRoot, "record.mjs"),
          "--script",
          path.join(cwd, "missing.demo.ts"),
          "--url",
          "https://example.org",
          "--storage-state",
          storageStatePath,
        ],
        { cwd: engineRoot },
      ),
    ).rejects.toMatchObject({ code: 1 });
    await expect(access(storageStatePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
