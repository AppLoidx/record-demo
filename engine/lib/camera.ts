import { Easing } from "remotion";
import type { Rect, Timeline, TimelineEvent } from "./timeline";
import { demoTheme } from "../remotion/theme";

export type CameraTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

// Visible source pixels. Height follows from the output frame's aspect ratio.
export type CameraWindow = { left: number; top: number; width: number };
type ZoomEvent = Extract<TimelineEvent, { kind: "zoom" }>;
export type CameraMove = {
  event: ZoomEvent;
  eventIndex: number;
  startMs: number;
  startFrame: number;
  durationMs: number;
  durationFrames: number;
  target: CameraWindow;
};

const ease = Easing.bezier(...demoTheme.zoom.easing);

export function cameraWindow(
  camera: CameraTransform,
  frameWidth: number,
): CameraWindow {
  return {
    left: -camera.translateX / camera.scale,
    top: -camera.translateY / camera.scale,
    width: frameWidth / camera.scale,
  };
}

export function windowTransform(
  window: CameraWindow,
  frameWidth: number,
): CameraTransform {
  const scale = frameWidth / window.width;
  return {
    scale,
    translateX: -window.left * scale,
    translateY: -window.top * scale,
  };
}

export function interpolateCameraWindow(
  start: CameraWindow,
  end: CameraWindow,
  progress: number,
): CameraWindow {
  if (start.width <= 0 || end.width <= 0) {
    throw new Error("Camera window width must be positive");
  }
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  const logRatio = Math.log(end.width / start.width);
  const width = start.width * (end.width / start.width) ** progress;
  const fraction =
    Math.abs(logRatio) > 1e-4
      ? (start.width - width) / (start.width - end.width)
      : progress;
  return {
    left: start.left + (end.left - start.left) * fraction,
    top: start.top + (end.top - start.top) * fraction,
    width,
  };
}

export function autoZoomDurationMs(
  start: CameraWindow,
  end: CameraWindow,
  aspectRatio: number,
) {
  const centerDistance = Math.hypot(
    end.left + end.width / 2 - start.left - start.width / 2,
    end.top +
      end.width / (2 * aspectRatio) -
      start.top -
      start.width / (2 * aspectRatio),
  );
  const travel = Math.hypot(
    Math.abs(Math.log2(end.width / start.width)),
    centerDistance / Math.min(start.width, end.width),
  );
  return (
    demoTheme.zoom.minimumDurationMs +
    demoTheme.zoom.autoDurationExtraMs *
      Math.min(1, travel / demoTheme.zoom.autoDurationTravel)
  );
}

function evaluateWindow(
  initial: CameraWindow,
  moves: readonly CameraMove[],
  frame: number,
) {
  let window = initial;
  for (const move of moves) {
    if (move.startFrame > frame) break;
    const progress = ease(
      clamp((frame - move.startFrame) / move.durationFrames, 0, 1),
    );
    // Keep the entire previous path evolving at this frame. A new move's
    // zero initial easing rate preserves its predecessor's velocity as well
    // as its position, even through multiple interrupted moves.
    window = interpolateCameraWindow(window, move.target, progress);
  }
  return window;
}

function fullViewportRect(viewport: Timeline["viewport"]): Rect {
  return { x: 0, y: 0, width: viewport.width, height: viewport.height };
}

// Resolve durations once, from the LIVE previous path at each move's start.
// The renderer, Studio tracks, and motion scorer all use this same path.
export function createCameraPath(
  timeline: Timeline,
  fps: number,
  frameWidth: number,
  frameHeight: number,
) {
  const wide = fullViewportRect(timeline.viewport);
  const initial = cameraWindow(
    calculateCameraTransform(
      wide,
      timeline.viewport,
      frameWidth,
      frameHeight,
    ),
    frameWidth,
  );
  const moves: CameraMove[] = [];
  for (const [eventIndex, event] of timeline.events.entries()) {
    if (event.kind !== "zoom") continue;
    const startFrame = (event.t / 1_000) * fps;
    const start = evaluateWindow(initial, moves, startFrame);
    const target = cameraWindow(
      calculateCameraTransform(
        event.rect ?? wide,
        timeline.viewport,
        frameWidth,
        frameHeight,
      ),
      frameWidth,
    );
    const durationMs =
      event.durationMs === undefined
        ? autoZoomDurationMs(start, target, frameWidth / frameHeight)
        : Math.max(demoTheme.zoom.minimumDurationMs, event.durationMs);
    moves.push({
      event,
      eventIndex,
      startMs: event.t,
      startFrame,
      durationMs,
      durationFrames: Math.max(1, Math.round((durationMs / 1_000) * fps)),
      target,
    });
  }

  return {
    moves,
    atFrame(frame: number): CameraTransform {
      return clampCameraTranslation(
        windowTransform(evaluateWindow(initial, moves, frame), frameWidth),
        timeline.viewport,
        frameWidth,
        frameHeight,
      );
    },
  };
}

export function resolveCameraTransform(
  timeline: Timeline,
  frame: number,
  fps: number,
  frameWidth: number,
  frameHeight: number,
): CameraTransform {
  return createCameraPath(timeline, fps, frameWidth, frameHeight).atFrame(
    frame,
  );
}

export function calculateCameraTransform(
  rect: Rect,
  viewport: Timeline["viewport"],
  frameWidth: number,
  frameHeight: number,
): CameraTransform {
  const sourceWidth = viewport.width * viewport.deviceScaleFactor;
  const sourceHeight = viewport.height * viewport.deviceScaleFactor;
  const baseScale = Math.max(
    frameWidth / sourceWidth,
    frameHeight / sourceHeight,
  );
  const padding = demoTheme.zoom.padding;
  const focusRect = expandRectToAspectRatio(rect, frameWidth / frameHeight);
  const focusWidth =
    (focusRect.width + padding * 2) * viewport.deviceScaleFactor;
  const focusHeight =
    (focusRect.height + padding * 2) * viewport.deviceScaleFactor;
  const focusScale = Math.min(
    frameWidth / focusWidth,
    frameHeight / focusHeight,
  );
  const scale = Math.min(
    baseScale * demoTheme.zoom.maximumScale,
    Math.max(baseScale, focusScale),
  );
  const focusX = (rect.x + rect.width / 2) * viewport.deviceScaleFactor;
  const focusY = (rect.y + rect.height / 2) * viewport.deviceScaleFactor;

  return clampCameraTranslation(
    {
      scale,
      translateX: frameWidth / 2 - focusX * scale,
      translateY: frameHeight / 2 - focusY * scale,
    },
    viewport,
    frameWidth,
    frameHeight,
  );
}

function clampCameraTranslation(
  camera: CameraTransform,
  viewport: Timeline["viewport"],
  frameWidth: number,
  frameHeight: number,
): CameraTransform {
  const sourceWidth = viewport.width * viewport.deviceScaleFactor;
  const sourceHeight = viewport.height * viewport.deviceScaleFactor;
  const minTranslateX = frameWidth - sourceWidth * camera.scale;
  const minTranslateY = frameHeight - sourceHeight * camera.scale;

  return {
    ...camera,
    // Window interpolation stays in bounds; retain this clamp as a safety net
    // for rounding at source edges.
    translateX: clamp(camera.translateX, minTranslateX, 0),
    translateY: clamp(camera.translateY, minTranslateY, 0),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function expandRectToAspectRatio(rect: Rect, aspectRatio: number): Rect {
  const currentAspectRatio = rect.width / rect.height;
  if (currentAspectRatio < aspectRatio) {
    const width = rect.height * aspectRatio;
    return {
      x: rect.x - (width - rect.width) / 2,
      y: rect.y,
      width,
      height: rect.height,
    };
  }

  const height = rect.width / aspectRatio;
  return {
    x: rect.x,
    y: rect.y - (height - rect.height) / 2,
    width: rect.width,
    height,
  };
}
