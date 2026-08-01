import { describe, expect, it } from "vitest";
import { layoutFor } from "../remotion/DemoVideo";
import { compositionPresets } from "../remotion/theme";
import { calculateCameraTransform } from "../remotion/zoom";

const captureViewport = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1.5,
};

describe("composition layouts", () => {
  it("selects the square layout for a 1440x1440 composition", () => {
    const layout = layoutFor(1440, 1440);

    expect(layout.screenWidth).toBeCloseTo(1267.2);
    expect(layout.screenHeight).toBeCloseTo(964.8);
  });

  it("selects the portrait layout for a 1080x1920 composition", () => {
    const layout = layoutFor(1080, 1920);

    expect(layout.screenWidth).toBeCloseTo(950.4);
    expect(layout.screenHeight).toBeCloseTo(1190.4);
  });

  it.each([
    [2560, 1440],
    [1440, 1440],
    [1080, 1920],
  ])("keeps chrome from biasing the %ix%i window center", (width, height) => {
    const withoutChrome = layoutFor(width, height);
    const withChrome = layoutFor(width, height, "macos");

    expect(withChrome.top).toBeCloseTo(
      withoutChrome.top - withChrome.chromeHeight / 2,
    );
  });

  it.each(compositionPresets)(
    "$id wide shot covers its video frame without letterboxing",
    (preset) => {
      const layout = layoutFor(preset.width, preset.height);
      const camera = calculateCameraTransform(
        {
          x: 0,
          y: 0,
          width: captureViewport.width,
          height: captureViewport.height,
        },
        captureViewport,
        layout.screenWidth,
        layout.screenHeight,
      );
      const sourceWidth =
        captureViewport.width * captureViewport.deviceScaleFactor;
      const sourceHeight =
        captureViewport.height * captureViewport.deviceScaleFactor;

      expect(camera.scale * sourceWidth).toBeGreaterThanOrEqual(
        layout.screenWidth,
      );
      expect(camera.scale * sourceHeight).toBeGreaterThanOrEqual(
        layout.screenHeight,
      );
    },
  );
});
