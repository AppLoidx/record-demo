import { Easing, Img, staticFile } from "remotion";
import { cursorDurationMs, cursorPath } from "../lib/cursor";
import { windowTotalDuration, type WindowEvent } from "../lib/timeline";
import { CursorVisual } from "./Cursor";
import { ChromeBar } from "./Screen";
import { demoTheme } from "./theme";

const tokens = demoTheme.window;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const enterEase = Easing.bezier(...tokens.enterEasing);
const exitEase = Easing.bezier(...tokens.exitEasing);

export function windowMotion(event: WindowEvent | undefined, timeMs: number) {
  const elapsed = event ? timeMs - event.t : -1;
  const active =
    event !== undefined && elapsed >= 0 && elapsed < windowTotalDuration(event);
  if (!active || !event)
    return {
      active: false,
      opacity: 0,
      scale: 1,
      translateY: 0,
      mainScale: 1,
      dim: 0,
    };
  const enter = enterEase(
    clamp(event.enterMs === 0 ? 1 : elapsed / event.enterMs),
  );
  const exitElapsed = elapsed - event.enterMs - event.holdMs;
  const exit = exitEase(
    clamp(
      event.exitMs === 0
        ? exitElapsed >= 0
          ? 1
          : 0
        : exitElapsed / event.exitMs,
    ),
  );
  const visibility = enter * (1 - exit);
  return {
    active,
    opacity: visibility,
    scale:
      tokens.enterScale +
      (1 - tokens.enterScale) * enter -
      (1 - tokens.exitScale) * exit,
    translateY: tokens.enterOffset * (1 - enter),
    mainScale: 1 - (1 - tokens.mainScale) * visibility,
    dim: tokens.dimOpacity * visibility,
  };
}

export function windowPlacement(
  event: WindowEvent,
  frameWidth: number,
  frameHeight: number,
) {
  const landscape =
    frameWidth / frameHeight >= demoTheme.layout.landscape.minAspect;
  const desiredWidth =
    frameWidth * (landscape ? tokens.landscapeWidth : tokens.compactWidth);
  const maxHeight = frameHeight * (1 - 2 * tokens.margin) - tokens.enterOffset;
  const width = Math.min(
    desiredWidth,
    ((maxHeight - tokens.chromeHeight) * event.imageWidth) / event.imageHeight,
  );
  const imageScale = width / event.imageWidth;
  const height = tokens.chromeHeight + event.imageHeight * imageScale;
  const centerX = frameWidth * (landscape ? tokens.landscapeCenterX : 0.5);
  return {
    left: Math.min(
      frameWidth * (1 - tokens.margin) - width,
      Math.max(frameWidth * tokens.margin, centerX - width / 2),
    ),
    top: (frameHeight - height) / 2,
    width,
    height,
    imageScale,
    chromeHeight: tokens.chromeHeight,
  };
}

export function insetInteraction(
  event: WindowEvent,
  timeMs: number,
  placement: ReturnType<typeof windowPlacement>,
) {
  const elapsed = timeMs - event.t - event.enterMs;
  const target = event.highlight;
  const from = {
    x: placement.width * 0.08,
    y: event.imageHeight * placement.imageScale * 0.92,
  };
  const to = target
    ? {
        x: (target.x + target.width / 2) * placement.imageScale,
        y: (target.y + target.height / 2) * placement.imageScale,
      }
    : from;
  const durationMs = cursorDurationMs(
    Math.hypot(to.x - from.x, to.y - from.y),
    target ? Math.min(target.width, target.height) * placement.imageScale : 24,
  );
  const moveAge = elapsed - tokens.cursorDelayMs;
  const points = [
    from,
    ...cursorPath(
      from,
      to,
      Math.max(1, Math.ceil(durationMs / (1000 / demoTheme.cursor.sampleFps))),
    ),
  ];
  const position =
    clamp(durationMs === 0 ? 1 : moveAge / durationMs) * (points.length - 1);
  const index = Math.floor(position),
    fraction = position - index;
  const a = points[index]!,
    b = points[Math.min(index + 1, points.length - 1)]!;
  const clickAt =
    tokens.cursorDelayMs + durationMs + demoTheme.cursor.settleDurationMs;
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    cursorOpacity:
      target && event.click
        ? clamp(moveAge / demoTheme.cursor.enterDurationMs)
        : 0,
    clickAge:
      target && event.click && elapsed >= clickAt
        ? elapsed - clickAt
        : Infinity,
    ringOpacity: target
      ? clamp(
          (elapsed - (event.click ? clickAt - tokens.ringFadeMs : 0)) /
            tokens.ringFadeMs,
        )
      : 0,
  };
}

export function WindowInset({
  event,
  timeMs,
  frameWidth,
  frameHeight,
}: {
  event: WindowEvent;
  timeMs: number;
  frameWidth: number;
  frameHeight: number;
}) {
  const motion = windowMotion(event, timeMs);
  if (!motion.active) return null;
  const p = windowPlacement(event, frameWidth, frameHeight);
  const interaction = insetInteraction(event, timeMs, p);
  const target = event.highlight;
  return (
    <div
      style={{
        position: "absolute",
        left: p.left,
        top: p.top,
        width: p.width,
        borderRadius: tokens.radius,
        overflow: "hidden",
        background: demoTheme.colors.surface,
        border: `1px solid ${demoTheme.colors.line}`,
        boxShadow: tokens.shadow,
        opacity: motion.opacity,
        transform: `translateY(${motion.translateY}px) scale(${motion.scale})`,
        transformOrigin: "center",
        pointerEvents: "none",
      }}
    >
      <ChromeBar
        variant="macos"
        height={p.chromeHeight}
        title={event.title ?? ""}
      />
      <div
        style={{
          position: "relative",
          width: p.width,
          height: event.imageHeight * p.imageScale,
        }}
      >
        <Img
          src={staticFile(event.image)}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
        {target ? (
          <div
            style={{
              position: "absolute",
              left: target.x * p.imageScale,
              top: target.y * p.imageScale,
              width: target.width * p.imageScale,
              height: target.height * p.imageScale,
              boxSizing: "border-box",
              border: `${tokens.ringWidth}px solid ${tokens.ringColor}`,
              borderRadius: tokens.ringRadius,
              opacity: interaction.ringOpacity,
            }}
          />
        ) : null}
        <CursorVisual
          x={interaction.x}
          y={interaction.y}
          opacity={interaction.cursorOpacity}
          clickAge={interaction.clickAge}
        />
      </div>
    </div>
  );
}
