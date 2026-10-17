import { carryMotion, carryConcealOpacity, projectCarryRect, type CarryFlight } from "../lib/carry";
import { textWidth } from "../lib/typography";
import type { createSceneCameraPath } from "../lib/scene-camera";
import type { Rect, Timeline } from "../lib/timeline";
import { demoTheme } from "./theme";

const t = demoTheme.carry;
export function carryDock(text: string, title: string, width: number, height: number): Rect {
  const scale = Math.min(width, height) / 1440;
  const chipWidth = Math.min(width * 0.8, textWidth(text, t.fontSize * scale) + 2 * t.padding * scale);
  const titleSize = width * demoTheme.outro.titleSizeRatio;
  // Reserve enough space below even a wrapped title; the chapter layout remains unchanged.
  const lines = Math.max(1, Math.ceil(textWidth(title, titleSize) / (width * 0.84)));
  return { x: (width - chipWidth) / 2, y: height / 2 + titleSize * 1.15 * lines / 2 + t.titleGap * scale,
    width: chipWidth, height: t.height * scale };
}
export function Carry({ flight, timeline, cameraPath, fps, timeMs, width, height, screenOrigin, screenOriginAt, outroProgress = 0 }: {
  flight: CarryFlight; timeline: Timeline; cameraPath: ReturnType<typeof createSceneCameraPath>;
  fps: number; timeMs: number; width: number; height: number; screenOrigin: { x: number; y: number }; outroProgress?: number;
  screenOriginAt?: (compositionTimeMs: number) => { x: number; y: number };
}) {
  const source = projectCarryRect(flight.carry.rect, timeline.viewport.deviceScaleFactor,
    cameraPath.atFrame(flight.sourceTimeMs * fps / 1000), screenOriginAt?.(flight.carry.t) ?? screenOrigin);
  const target = projectCarryRect(flight.land.rect, timeline.viewport.deviceScaleFactor,
    cameraPath.atFrame(flight.targetTimeMs * fps / 1000), screenOriginAt?.(flight.land.t) ?? screenOrigin);
  const dock = carryDock(flight.carry.text, flight.transition.label, width, height);
  const motion = carryMotion(flight, timeMs, source, target, dock);
  if (motion.opacity <= 0) return null;
  const scale = Math.min(width, height) / 1440;
  const chipFontSize = Math.max(0, Math.min(t.fontSize * scale,
    motion.rect.height * 0.55, (motion.rect.width - t.padding * scale) / Math.max(1, textWidth(flight.carry.text, 1))));
  const native = flight.land.textStyle;
  const targetScale = timeline.viewport.deviceScaleFactor * cameraPath.atFrame(flight.targetTimeMs * fps / 1000).scale;
  const fontSize = native ? chipFontSize + (native.fontSize * targetScale - chipFontSize) * motion.landing : chipFontSize;
  const material = flight.land.conceal !== false && motion.landing === 1
    ? "transparent" : flight.land.concealColor ?? demoTheme.colors.surface;
  const shadow = native ? `0 8px 24px rgba(33, 27, 51, ${0.12 * (1 - motion.landing)})` : demoTheme.callout.shadow;
  const lines = flight.land.lines;
  const multiLine = !!lines && lines.length > 1;
  return <div style={{ position: "absolute", left: motion.rect.x, top: motion.rect.y,
    width: motion.rect.width, height: motion.rect.height, transform: `scale(${motion.scale})`,
    opacity: motion.opacity * (1 - outroProgress), borderRadius: t.radius * scale,
    // The per-line material avoids painting the prefix inside a wrapped union rect.
    background: multiLine ? undefined : material, boxShadow: multiLine ? undefined : shadow,
    color: native?.color ?? demoTheme.colors.contentPrimary, fontFamily: native?.fontFamily ?? demoTheme.fontFamily,
    fontSize, lineHeight: native ? `${motion.rect.height}px` : undefined, fontWeight: native?.fontWeight ?? 500,
    display: multiLine ? "block" : "flex", alignItems: "center", justifyContent: "center",
    whiteSpace: "nowrap", pointerEvents: "none" }}>
    {multiLine ? lines.map((line, index) => {
      const sx = motion.rect.width / flight.land.rect.width;
      const sy = motion.rect.height / flight.land.rect.height;
      return <div key={index} data-carry-line style={{ position: "absolute",
        left: (line.rect.x - flight.land.rect.x) * sx, top: (line.rect.y - flight.land.rect.y) * sy,
        width: line.rect.width * sx, height: line.rect.height * sy,
        lineHeight: `${line.rect.height * sy}px`, background: material, boxShadow: shadow,
        borderRadius: t.radius * scale, whiteSpace: "pre" }}>{line.text}</div>;
    }) : flight.land.text ?? flight.carry.text}
  </div>;
}

/** Inside the incoming camera layer: inherits its transform, dissolve, crop and chrome. */
export function CarryConcealer({ flight, timeMs, deviceScaleFactor, cameraScale, frameScale }: {
  flight: CarryFlight; timeMs: number; deviceScaleFactor: number; cameraScale: number; frameScale: number;
}) {
  const opacity = carryConcealOpacity(flight, timeMs);
  if (opacity <= 0) return null;
  const rects = flight.land.lines?.map((line) => line.rect) ?? [flight.land.rect];
  const padding = t.concealPadding * frameScale / cameraScale;
  return <>{rects.map((rect, index) => <div key={index} data-carry-concealer style={{ position: "absolute",
    left: rect.x * deviceScaleFactor - padding, top: rect.y * deviceScaleFactor - padding,
    width: rect.width * deviceScaleFactor + padding * 2, height: rect.height * deviceScaleFactor + padding * 2,
    background: flight.land.concealColor ?? demoTheme.colors.surface, opacity,
    borderRadius: t.radius * frameScale / cameraScale, pointerEvents: "none" }} />)}</>;
}
