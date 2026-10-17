import { afterEach, describe, expect, it, vi } from "vitest";
import { landBackground } from "../lib/land-scene";

function chain(colors: string[]) {
  const elements = colors.map((backgroundColor) => ({ backgroundColor, parentElement: null as unknown }));
  elements.forEach((element, index) => { element.parentElement = elements[index + 1] ?? null; });
  vi.stubGlobal("getComputedStyle", (element: { backgroundColor: string }) => ({ backgroundColor: element.backgroundColor }));
  return elements[0] as unknown as Element;
}

describe("landBackground", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips translucent tints so the concealer is never see-through", () => {
    expect(landBackground(chain(["rgba(245, 158, 11, 0.1)", "oklab(0.9 0 0 / 10%)", "rgb(255, 255, 255)"])))
      .toBe("rgb(255, 255, 255)");
  });

  it("returns the first opaque colour and undefined when none exists", () => {
    expect(landBackground(chain(["transparent", "rgb(250, 250, 250)"]))).toBe("rgb(250, 250, 250)");
    expect(landBackground(chain(["rgba(0, 0, 0, 0)", "rgba(1, 2, 3, 0.5)"]))).toBeUndefined();
  });
});
