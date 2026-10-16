import type { RoleEvent, Timeline } from "../lib/timeline";
import { demoTheme } from "./theme";

export function roleLayers(
  timeline: Timeline,
  timeMs: number,
  outroProgress: number,
) {
  const layers: Array<{ label: string; opacity: number }> = [];
  for (const event of timeline.events
    .filter((event): event is RoleEvent => event.kind === "role")
    .sort((a, b) => a.t - b.t)) {
    if (event.t > timeMs) break;
    const progress = Math.min(
      1,
      Math.max(0, (timeMs - event.t) / demoTheme.role.fadeMs),
    );
    for (const layer of layers) layer.opacity *= 1 - progress;
    layers.push({ label: event.label, opacity: progress });
  }
  return layers
    .filter((layer) => layer.opacity > 0)
    .map((layer) => ({
      ...layer,
      opacity: layer.opacity * (1 - outroProgress),
    }));
}

export function RoleBadge({
  timeline,
  timeMs,
  outroProgress,
  frameWidth,
  frameHeight,
  screenWidth,
  screenTop,
}: {
  timeline: Timeline;
  timeMs: number;
  outroProgress: number;
  frameWidth: number;
  frameHeight: number;
  screenWidth: number;
  screenTop: number;
}) {
  const tokens = demoTheme.role;
  const landscape =
    frameWidth / frameHeight >= demoTheme.layout.landscape.minAspect;
  const top = Math.max(
    tokens.margin,
    screenTop - tokens.margin - tokens.height,
  );
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: landscape ? (frameWidth - screenWidth) / 2 : "50%",
        transform: landscape ? undefined : "translateX(-50%)",
        display: "grid",
        pointerEvents: "none",
        maxWidth: "80%",
      }}
    >
      {roleLayers(timeline, timeMs, outroProgress).map((layer, index) => (
        <div
          key={`${layer.label}-${index}`}
          style={{
            gridArea: "1 / 1",
            justifySelf: landscape ? "start" : "center",
            display: "flex",
            alignItems: "center",
            gap: tokens.gap,
            height: tokens.height,
            padding: `0 ${tokens.padding}px`,
            boxSizing: "border-box",
            borderRadius: 999,
            border: `1px solid ${demoTheme.colors.line}`,
            background: tokens.background,
            boxShadow: tokens.shadow,
            color: demoTheme.colors.contentPrimary,
            fontFamily: demoTheme.fontFamily,
            fontSize: tokens.fontSize,
            fontWeight: 500,
            opacity: layer.opacity,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: tokens.dotSize,
              height: tokens.dotSize,
              borderRadius: "50%",
              background: demoTheme.colors.accentPrimary,
              flexShrink: 0,
            }}
          />
          {layer.label}
        </div>
      ))}
    </div>
  );
}
