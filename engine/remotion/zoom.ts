import { Easing, interpolate } from "remotion";
import type { Rect, Timeline } from "../lib/timeline";
import { demoTheme } from "./theme";

export type CameraTransform = {
  scale: number;
  translateX: number;
  translateY: number;
};

function fullViewportRect(viewport: Timeline["viewport"]): Rect {
  return {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  };
}

export function resolveCameraTransform(
  timeline: Timeline,
  frame: number,
  fps: number,
  frameWidth: number,
  frameHeight: number,
): CameraTransform {
  const wide = calculateCameraTransform(
    fullViewportRect(timeline.viewport),
    timeline.viewport,
    frameWidth,
    frameHeight,
  );
  const zoomEvents = timeline.events.filter((event) => event.kind === "zoom");

  // Fold moves in order. Each move starts from the camera's actual state at
  // its own start frame (the previous move evaluated AT that frame), so a
  // move that begins while the previous one is still easing departs
  // mid-flight instead of snapping to the previous move's target.
  // Known limitation: the handoff is position-continuous but not
  // velocity-continuous (the new move eases in from zero rate), so an
  // interrupted move reads as a brief stall. Storyboards should pace holds so
  // moves do not overlap; the motion scorer flags violations.
  let camera = wide;
  for (let index = 0; index < zoomEvents.length; index += 1) {
    const event = zoomEvents[index]!;
    const eventFrame = (event.t / 1_000) * fps;
    if (eventFrame > frame) break;
    const start = camera;
    const end = calculateCameraTransform(
      event.rect ?? fullViewportRect(timeline.viewport),
      timeline.viewport,
      frameWidth,
      frameHeight,
    );
    const nextEvent = zoomEvents[index + 1];
    const nextEventFrame = nextEvent
      ? (nextEvent.t / 1_000) * fps
      : Number.POSITIVE_INFINITY;
    // Evaluate this move at the frame where the next active move takes over,
    // or at the requested frame if this is the last move that has started.
    const evaluationFrame = Math.min(frame, nextEventFrame);
    const progress = easedZoomProgress(evaluationFrame - eventFrame, event, fps);
    if (start.scale <= 0 || end.scale <= 0) {
      throw new Error("Camera scale must be positive");
    }
    camera = {
      scale: start.scale * (end.scale / start.scale) ** progress,
      translateX:
        start.translateX + (end.translateX - start.translateX) * progress,
      translateY:
        start.translateY + (end.translateY - start.translateY) * progress,
    };
  }

  return clampCameraTranslation(
    camera,
    timeline.viewport,
    frameWidth,
    frameHeight,
  );
}

function easedZoomProgress(
  framesSinceStart: number,
  event: { durationMs: number },
  fps: number,
) {
  const durationMs = Math.max(
    demoTheme.zoom.minimumDurationMs,
    event.durationMs,
  );
  const durationInFrames = Math.max(1, Math.round((durationMs / 1_000) * fps));
  const [x1, y1, x2, y2] = demoTheme.zoom.easing;
  return interpolate(
    Math.max(0, framesSinceStart),
    [0, durationInFrames],
    [0, 1],
    {
      easing: Easing.bezier(x1, y1, x2, y2),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
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
  const focusRect = expandRectToAspectRatio(
    rect,
    frameWidth / frameHeight,
  );
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
    // Interpolated translation can cross an edge constraint mid-move. Re-clamp
    // continuously so the captured source always covers the output frame.
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
