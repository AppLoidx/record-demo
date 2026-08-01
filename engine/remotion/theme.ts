export const captureViewport = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1.5,
  fps: 30,
} as const;

export const compositionFps = 60;

export function msToFrame(timeMs: number, fps: number) {
  return Math.ceil((timeMs / 1_000) * fps);
}

export function msToFrameWindow(tMs: number, durationMs: number, fps: number) {
  const from = msToFrame(tMs, fps);
  return {
    from,
    durationInFrames: Math.max(
      1,
      Math.floor(((tMs + durationMs) / 1_000) * fps) - from + 1,
    ),
  };
}

export const demoTheme = {
  fontFamily:
    '"Geist Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  colors: {
    contentPrimary: "#424242",
    contentSecondary: "#777777",
    surface: "#FFFFFF",
    surfaceMuted: "#FAFAFA",
    line: "#EAEAEB",
    accentPrimary: "#252525",
    captionText: "#FFFFFF",
    backdrop: "#F3F1F8",
    cursorOutline: "#FFFFFF",
    clickRipple: "rgba(37, 37, 37, 0.42)",
    chromeControls: ["#FF5F57", "#FEBC2E", "#28C840"],
  },
  backgroundImage: [
    "radial-gradient(circle at 13% 10%, rgba(176, 156, 255, 0.42) 0, transparent 42%)",
    "radial-gradient(circle at 88% 18%, rgba(150, 205, 255, 0.38) 0, transparent 40%)",
    "radial-gradient(circle at 55% 100%, rgba(153, 232, 205, 0.30) 0, transparent 44%)",
    "linear-gradient(145deg, #FFFFFF 0%, #F3F1F8 55%, #FAFAFA 100%)",
  ].join(", "),
  layout: {
    landscape: {
      minAspect: 1.5,
      screenWidth: 0.86,
      captionBottom: 0.088,
    },
    square: {
      minAspect: 0.9,
      screenWidth: 0.88,
      screenHeight: 0.67,
      screenTop: 0.13,
      captionBottom: 0.08,
    },
    portrait: {
      screenWidth: 0.88,
      screenHeight: 0.62,
      screenTop: 0.15,
      captionBottom: 0.08,
    },
    minimumWindowRadius: 20,
    windowRadiusRatio: 0.014,
  },
  screen: {
    chromeMinimumHeight: 44,
    chromeHeightRatio: 0.023,
    chromeControlSize: 13,
    chromeControlGap: 9,
    chromeHorizontalPadding: 20,
    urlPillText: "demo.example.com",
    urlPillHeight: 30,
    urlPillMinimumWidth: 250,
    urlPillWidth: "34%",
    shadow:
      "0 38px 90px rgba(33, 27, 51, 0.22), 0 8px 22px rgba(33, 27, 51, 0.12)",
  },
  zoom: {
    padding: 96,
    maximumScale: 1.45,
    minimumDurationMs: 1_650,
    // easeInOutCubic: symmetric gentle start/stop, the screen-recording norm.
    // Springs start at peak acceleration, which reads as an edgy camera cut.
    easing: [0.65, 0, 0.35, 1],
  },
  spotlight: {
    dim: "rgba(10, 12, 18, 0.42)",
    ring: "rgba(255, 255, 255, 0.35)",
    shadowBlur: 24,
    shadowColor: "rgba(0, 0, 0, 0.35)",
    radius: 12,
    ringWidth: 1.5,
  },
  cursor: {
    containerSize: 38,
    pointerWidth: 34,
    pointerHeight: 38,
    enterDurationMs: 100,
    pressDurationMs: 75,
    releaseDurationMs: 180,
    pressedScale: 0.92,
    rippleDurationMs: 420,
    rippleSize: 34,
    rippleStartScale: 0.65,
    rippleGrowth: 1.45,
  },
  caption: {
    enterDurationMs: 220,
    exitDurationMs: 140,
    wideFrameThreshold: 2_000,
    mediumFrameThreshold: 1_100,
    wideFontSize: 34,
    mediumFontSize: 30,
    compactFontSize: 28,
    enterOffset: 14,
    enterScale: 0.98,
  },
  outro: {
    enterDurationMs: 600,
    recedeScale: 0.94,
    screenOpacity: 0.35,
    titleSizeRatio: 64 / 2_560,
  },
} as const;

export const compositionPresets = [
  { id: "16x9", width: 2560, height: 1440 },
  { id: "1x1", width: 1440, height: 1440 },
  { id: "9x16", width: 1080, height: 1920 },
] as const;
