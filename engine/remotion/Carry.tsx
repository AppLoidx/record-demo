import { carryMotion, projectCarryRect, type CarryFlight } from "../lib/carry";
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
  const native = flight.transition.style === "cut" ? flight.land.textStyle : undefined;
  const targetScale = timeline.viewport.deviceScaleFactor * cameraPath.atFrame(flight.targetTimeMs * fps / 1000).scale;
  const fontSize = native ? chipFontSize + (native.fontSize * targetScale - chipFontSize) * motion.landing : chipFontSize;
  return <div style={{ position: "absolute", left: motion.rect.x, top: motion.rect.y,
    width: motion.rect.width, height: motion.rect.height, transform: `scale(${motion.scale})`,
    opacity: motion.opacity * (1 - outroProgress), borderRadius: t.radius * scale, background: demoTheme.colors.surface,
    boxShadow: native ? `0 8px 24px rgba(33, 27, 51, ${0.12 * (1 - motion.landing)})` : demoTheme.callout.shadow, color: native?.color ?? demoTheme.colors.contentPrimary, fontFamily: native?.fontFamily ?? demoTheme.fontFamily,
    fontSize, lineHeight: native ? `${motion.rect.height}px` : undefined, fontWeight: native?.fontWeight ?? 500, display: "flex", alignItems: "center", justifyContent: "center",
    whiteSpace: "nowrap", pointerEvents: "none" }}>{flight.carry.text}</div>;
}
