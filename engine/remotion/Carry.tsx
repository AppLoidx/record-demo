import { carryMotion, carryConcealOpacity, carryTargetTimeMs, carryTiming, projectCarryRect, type CarryFlight } from "../lib/carry";
import { Easing } from "remotion";
import { clamp, textWidth } from "../lib/typography";
import type { createSceneCameraPath } from "../lib/scene-camera";
import type { Timeline } from "../lib/timeline";
import { demoTheme } from "./theme";

const t = demoTheme.carry;
const ease = Easing.bezier(...demoTheme.zoom.easing);
export function Carry({ flight, timeline, cameraPath, fps, timeMs, width, height, screenOrigin, screenOriginAt, outroProgress = 0 }: {
  flight: CarryFlight; timeline: Timeline; cameraPath: ReturnType<typeof createSceneCameraPath>;
  fps: number; timeMs: number; width: number; height: number; screenOrigin: { x: number; y: number }; outroProgress?: number;
  screenOriginAt?: (compositionTimeMs: number) => { x: number; y: number };
}) {
  const source = projectCarryRect(flight.carry.rect, timeline.viewport.deviceScaleFactor,
    cameraPath.atFrame(flight.sourceTimeMs * fps / 1000), screenOriginAt?.(flight.carry.t) ?? screenOrigin);
  const targetTimeMs = carryTargetTimeMs(flight, timeline, timeMs);
  const targetCamera = cameraPath.atFrame(targetTimeMs * fps / 1000);
  const target = projectCarryRect(flight.land.rect, timeline.viewport.deviceScaleFactor,
    targetCamera, screenOriginAt?.(Math.max(carryTiming(flight).sceneEndMs, timeMs)) ?? screenOrigin);
  const motion = carryMotion(flight, timeMs, source, target);
  if (motion.opacity <= 0) return null;
  const scale = Math.min(width, height) / 1440;
  const sourceScale = timeline.viewport.deviceScaleFactor * cameraPath.atFrame(flight.sourceTimeMs * fps / 1000).scale;
  const chipFontSize = flight.carry.textStyle ? flight.carry.textStyle.fontSize * sourceScale : Math.max(0, Math.min(t.fontSize * scale,
    source.height * 0.55, (source.width - t.padding * scale) / Math.max(1, textWidth(flight.carry.text, 1))));
  const native = flight.land.textStyle;
  const targetScale = timeline.viewport.deviceScaleFactor * targetCamera.scale;
  const fontSize = native ? chipFontSize + (native.fontSize * targetScale - chipFontSize) * motion.landing : chipFontSize;
  const timing = carryTiming(flight);
  const handedOff = flight.land.conceal !== false && timeMs >= timing.arrivalMs;
  const material = handedOff ? "transparent" : demoTheme.colors.accentTint;
  const padX = scale * (t.padding + (t.concealPadding - t.padding) * motion.landing);
  const padY = scale * (t.paddingY + (t.concealPadding - t.paddingY) * motion.landing);
  const shadow = (amount: number) => `0 ${6 + 6 * motion.lift}px ${18 + 18 * motion.lift}px rgba(60, 38, 110, ${(.10 + .08 * motion.lift) * amount})`;
  const landingShape = ease(clamp((motion.landing - .85) / .15));
  const radius = (height: number) => motion.landing === 0 ? t.radius * scale
    : (height / 2) * (1 - landingShape) + t.landingRadius * scale * landingShape;
  const lines = flight.land.lines;
  const multiLine = !!lines && lines.length > 1;
  const normalizedText = flight.land.text ?? flight.carry.text;
  // Separate rows vertically before changing their horizontal positions. All
  // materials live below all glyphs, so a later row can never paint over words.
  const wrapY = ease(clamp(motion.landing * 2));
  const wrapX = ease(clamp((motion.landing - .5) * 2));
  const split = multiLine ? landingShape : 0;
  const sourceGlyphHeight = Math.min(source.height, chipFontSize * 1.2);
  const spaceWidth = textWidth(" ", fontSize);
  // Range widths belong to native text, which can be lighter than the chip.
  // Reserve a small advance for the theme medium face during the unwrapped hold.
  const mediumAdvance = native && (Number.parseInt(native.fontWeight) || 400) < t.fontWeight ? 1.03 : 1;
  const sourceWidths = lines?.map((line) => native
    ? line.rect.width * fontSize / native.fontSize * mediumAdvance : textWidth(line.text, fontSize)) ?? [];
  const sourceTextWidth = sourceWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, sourceWidths.length - 1) * spaceWidth;
  let advance = (motion.rect.width - sourceTextWidth) / 2;
  const rows = multiLine ? lines.map((line, index) => {
    const sx = motion.rect.width / flight.land.rect.width;
    const sy = motion.rect.height / flight.land.rect.height;
    const left = advance;
    advance += sourceWidths[index]! + spaceWidth;
    const targetY = (line.rect.y - flight.land.rect.y) * sy;
    const safeGap = Math.max(0, index * fontSize * 1.2 - targetY) * (1 - wrapX);
    const x = left * (1 - wrapX) + (line.rect.x - flight.land.rect.x) * sx * wrapX;
    const y = (targetY + safeGap) * wrapY;
    const height = source.height * (1 - motion.landing) + line.rect.height * sy * motion.landing;
    const inkHeight = sourceGlyphHeight * (1 - motion.landing) + line.rect.height * sy * motion.landing;
    return { text: line.text, x, y, height,
      materialX: x, materialY: y + (height - inkHeight) / 2,
      materialWidth: sourceWidths[index]! * (1 - wrapX) + line.rect.width * sx * wrapX,
      materialHeight: inkHeight };
  }) : [];
  const singleWidth = (native ? flight.land.rect.width * fontSize / native.fontSize : textWidth(normalizedText, fontSize)) *
    (1 - motion.landing) + motion.rect.width * motion.landing;
  const singleHeight = sourceGlyphHeight * (1 - motion.landing) + motion.rect.height * motion.landing;
  const bounds = multiLine ? {
    left: Math.min(...rows.map((row) => row.materialX)), top: Math.min(...rows.map((row) => row.materialY)),
    right: Math.max(...rows.map((row) => row.materialX + row.materialWidth)),
    bottom: Math.max(...rows.map((row) => row.materialY + row.materialHeight)),
  } : { left: (motion.rect.width - singleWidth) / 2, top: (motion.rect.height - singleHeight) / 2,
    right: (motion.rect.width + singleWidth) / 2, bottom: (motion.rect.height + singleHeight) / 2 };
  const wholePadX = multiLine ? Math.max(padX, (bounds.bottom - bounds.top + 2 * padY) / 4) : padX;
  return <div data-carry-chip style={{ position: "absolute", left: motion.rect.x, top: motion.rect.y,
    width: motion.rect.width, height: motion.rect.height, transform: `scale(${motion.scale})`,
    opacity: motion.opacity * (1 - outroProgress),
    color: demoTheme.colors.contentPrimary, fontFamily: native?.fontFamily ?? flight.carry.textStyle?.fontFamily ?? demoTheme.fontFamily,
    fontSize, fontWeight: t.fontWeight, whiteSpace: "nowrap", pointerEvents: "none" }}>
    <div data-carry-material style={{ position: "absolute", left: bounds.left - wholePadX, top: bounds.top - padY,
      width: bounds.right - bounds.left + wholePadX * 2, height: bounds.bottom - bounds.top + padY * 2,
      background: material, borderRadius: multiLine ? t.radius * scale : radius(singleHeight + padY * 2),
      opacity: 1 - split, boxShadow: shadow(1) }} />
    {rows.map((row, index) => <div key={index} data-carry-line-material style={{ position: "absolute",
      left: row.materialX - padX, top: row.materialY - padY, width: row.materialWidth + padX * 2,
      height: row.materialHeight + padY * 2, background: material,
      borderRadius: radius(row.materialHeight + padY * 2), opacity: split, boxShadow: shadow(1) }} />)}
    <div data-carry-glyphs style={{ position: "absolute", inset: 0, zIndex: 1 }}>
      {multiLine ? rows.map((row, index) => <div key={index} data-carry-line style={{ position: "absolute",
        left: row.x, top: row.y, height: row.height, lineHeight: `${row.height}px`, whiteSpace: "pre" }}>
        <span>{row.text}{index < rows.length - 1 ? " " : ""}</span>
      </div>) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        lineHeight: `${motion.rect.height}px` }}>{normalizedText}</div>}
    </div>
  </div>;

}

/** Inside the incoming camera layer: inherits its transform, dissolve, crop and chrome. */
export function CarryConcealer({ flight, timeMs, deviceScaleFactor, cameraScale, frameScale }: {
  flight: CarryFlight; timeMs: number; deviceScaleFactor: number; cameraScale: number; frameScale: number;
}) {
  const opacity = carryConcealOpacity(flight, timeMs);
  const arrived = timeMs >= carryTiming(flight).arrivalMs;
  if (opacity <= 0) return null;
  const rects = flight.land.lines?.map((line) => line.rect) ?? [flight.land.rect];
  const padding = t.concealPadding * frameScale / cameraScale;
  return <>{rects.map((rect, index) => <div key={index} data-carry-concealer style={{ position: "absolute",
    left: rect.x * deviceScaleFactor - padding, top: rect.y * deviceScaleFactor - padding,
    width: rect.width * deviceScaleFactor + padding * 2, height: rect.height * deviceScaleFactor + padding * 2,
    background: arrived ? demoTheme.colors.accentTint : flight.land.concealColor ?? demoTheme.colors.surface, opacity,
    borderRadius: t.landingRadius * frameScale / cameraScale, pointerEvents: "none" }} />)}</>;
}
