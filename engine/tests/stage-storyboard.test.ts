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
});
