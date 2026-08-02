import { describe, expect, it } from "vitest";
import { rewriteStoryboardImports } from "../lib/stage-storyboard";

const storyboardPath = "/opt/skills/record-demo/engine/lib/storyboard.ts";

describe("rewriteStoryboardImports", () => {
  it("rewrites a double-quoted storyboard import", () => {
    const source = 'import { demo } from "./storyboard";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `import { demo } from "${storyboardPath}";\n`,
    );
  });

  it("rewrites a single-quoted storyboard import", () => {
    const source = "import { demo } from '../lib/storyboard';\n";

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `import { demo } from '${storyboardPath}';\n`,
    );
  });

  it("rewrites the portable record-demo specifier", () => {
    const source = 'import { demo } from "record-demo/storyboard";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `import { demo } from "${storyboardPath}";\n`,
    );
  });

  it("rewrites an already-absolute storyboard path", () => {
    const source =
      'import { demo } from "/another/install/engine/lib/storyboard";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `import { demo } from "${storyboardPath}";\n`,
    );
  });

  it("does not touch a non-storyboard import", () => {
    const source = 'import { helper } from "./helpers";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(source);
  });

  it("does not touch a scoped package named storyboard", () => {
    const source = 'import { demo } from "@scope/storyboard";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(source);
  });

  it("rewrites an export-from of the storyboard module", () => {
    const source = 'export { demo } from "record-demo/storyboard";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `export { demo } from "${storyboardPath}";\n`,
    );
  });

  it("rewrites a dynamic import of the storyboard module", () => {
    const source = 'const mod = await import("../lib/storyboard");\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `const mod = await import("${storyboardPath}");\n`,
    );
  });

  it("rewrites a specifier with an explicit .ts extension", () => {
    const source = 'import { demo } from "record-demo/storyboard.ts";\n';

    expect(rewriteStoryboardImports(source, storyboardPath)).toBe(
      `import { demo } from "${storyboardPath}";\n`,
    );
  });
});
