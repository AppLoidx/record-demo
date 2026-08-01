import { describe, expect, it } from "vitest";
import { cursorPath } from "../lib/cursor";

describe("cursorPath", () => {
  it("creates a deterministic eased path that ends at the target", () => {
    const path = cursorPath({ x: 0, y: 20 }, { x: 120, y: 80 }, 30);

    expect(path).toHaveLength(30);
    expect(path[14]).toEqual({ x: 60, y: 50 });
    expect(path[29]).toEqual({ x: 120, y: 80 });
    expect(path[0]!.x).toBeLessThan(path[1]!.x - path[0]!.x);
    expect(path[28]!.x - path[27]!.x).toBeGreaterThan(
      path[29]!.x - path[28]!.x,
    );
  });
});
