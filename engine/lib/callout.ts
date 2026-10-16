import type { CalloutSide, Rect } from "./timeline";
import { textWidth } from "./typography";
import { demoTheme } from "../remotion/theme";

export function calloutSide(rect: Rect, width: number, height: number): CalloutSide {
  const space = { left: rect.x, right: width - rect.x - rect.width, top: rect.y, bottom: height - rect.y - rect.height };
  return (Object.keys(space) as CalloutSide[]).sort((a, b) => space[b] - space[a])[0]!;
}

/** Rect is already projected through the camera. Re-evaluate fit at every frame. */
export function calloutPlacement(rect: Rect, text: string, preferred: CalloutSide, width: number, height: number) {
  const base = demoTheme.callout;
  const frameScale = width / 2560;
  const t = { ...base, fontSize: base.fontSize * frameScale, paddingX: base.paddingX * frameScale,
    paddingY: base.paddingY * frameScale, maxWidth: base.maxWidth * frameScale, margin: base.margin * frameScale,
    connectorLength: base.connectorLength * frameScale };
  const padding = base.ringPadding * frameScale;
  rect = { x: rect.x - padding, y: rect.y - padding, width: rect.width + 2 * padding, height: rect.height + 2 * padding };
  const chipWidth = Math.min(t.maxWidth, width - 2 * t.margin, textWidth(text, t.fontSize) * 1.1 + 2 * t.paddingX);
  // Wrap explicitly so the measured chip and rendered label always have the same height.
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && textWidth(`${line} ${word}`, t.fontSize) * 1.1 > chipWidth - 2 * t.paddingX) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const chipHeight = Math.min(height - 2 * t.margin, Math.max(1, lines.length) * t.fontSize * t.lineHeight + 2 * t.paddingY);
  const at = (side: CalloutSide) => {
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    switch (side) {
      case "left": return { x: rect.x - t.connectorLength - chipWidth, y: cy - chipHeight / 2, edgeX: rect.x, edgeY: cy };
      case "right": return { x: rect.x + rect.width + t.connectorLength, y: cy - chipHeight / 2, edgeX: rect.x + rect.width, edgeY: cy };
      case "top": return { x: cx - chipWidth / 2, y: rect.y - t.connectorLength - chipHeight, edgeX: cx, edgeY: rect.y };
      case "bottom": return { x: cx - chipWidth / 2, y: rect.y + rect.height + t.connectorLength, edgeX: cx, edgeY: rect.y + rect.height };
    }
  };
  const overflow = (p: ReturnType<typeof at>) => Math.max(0, t.margin - p.x) + Math.max(0, p.x + chipWidth + t.margin - width) +
    Math.max(0, t.margin - p.y) + Math.max(0, p.y + chipHeight + t.margin - height);
  const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" } as const;
  const sides = [preferred, opposite[preferred], ...(["left", "right", "top", "bottom"] as const)];
  const side = sides.reduce((best, next) => overflow(at(next)) < overflow(at(best)) ? next : best, preferred);
  const p = at(side);
  const x = Math.max(t.margin, Math.min(width - t.margin - chipWidth, p.x));
  const y = Math.max(t.margin, Math.min(height - t.margin - chipHeight, p.y));
  const end = side === "left" ? { x: x + chipWidth, y: y + chipHeight / 2 }
    : side === "right" ? { x, y: y + chipHeight / 2 }
    : side === "top" ? { x: x + chipWidth / 2, y: y + chipHeight }
    : { x: x + chipWidth / 2, y };
  return { side, x, y, ringRect: rect, metrics: t, frameScale, width: chipWidth, height: chipHeight, lines,
    start: { x: p.edgeX, y: p.edgeY }, end };
}
