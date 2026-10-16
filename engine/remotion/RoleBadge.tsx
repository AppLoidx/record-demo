import { Easing } from "remotion";
import type { RoleEvent, Timeline } from "../lib/timeline";
import { clamp, textWidth } from "../lib/typography";
import { windowPlacement } from "./WindowInset";
import { demoTheme } from "./theme";

const tokens = demoTheme.role;
const ease = Easing.bezier(...tokens.easing);
export function roleWidth(label: string) {
  return Math.ceil(textWidth(label, tokens.fontSize)) + tokens.padding * 2 + tokens.dotSize + tokens.gap + 2;
}

export function roleBadgeState(timeline: Timeline, timeMs: number, outroProgress = 0) {
  const events = timeline.events.filter((event): event is RoleEvent => event.kind === "role" && event.t <= timeMs)
    .sort((a, b) => a.t - b.t);
  let width = 0;
  let previous: RoleEvent | undefined;
  let fromWidth = 0;
  for (const event of events) {
    if (previous) {
      const p = ease(clamp((event.t - previous.t) / tokens.fadeMs));
      width = fromWidth + (roleWidth(previous.label) - fromWidth) * p;
    } else width = roleWidth(event.label);
    fromWidth = width;
    previous = event;
  }
  const current = events.at(-1);
  if (!current) return { width: 0, opacity: 0, layers: [] };
  const old = events.at(-2);
  const age = timeMs - current.t;
  const out = ease(clamp(age / (tokens.fadeMs / 2)));
  const incoming = ease(clamp((age - (old ? tokens.fadeMs / 2 : 0)) / (tokens.fadeMs / 2)));
  const layers = [
    ...(old && out < 1 ? [{ label: old.label, opacity: 1 - out, y: -tokens.offset * out }] : []),
    { label: current.label, opacity: incoming, y: tokens.offset * (1 - incoming) },
  ];
  return {
    width: fromWidth + (roleWidth(current.label) - fromWidth) * ease(clamp(age / tokens.fadeMs)),
    opacity: 1 - outroProgress,
    layers,
  };
}

export function roleLayers(timeline: Timeline, timeMs: number, outroProgress: number) {
  const state = roleBadgeState(timeline, timeMs, outroProgress);
  return state.layers.map((layer) => ({ ...layer, opacity: layer.opacity * state.opacity }));
}

/** Reserve stable badge headroom above centered insets, so it never crosses a title bar. */
export function roleBadgeTop(timeline: Timeline, frameWidth: number, frameHeight: number, screenTop: number) {
  let top = screenTop - tokens.margin - tokens.height;
  if (frameWidth / frameHeight < demoTheme.layout.landscape.minAspect) {
    for (const event of timeline.events) {
      if (event.kind === "window") top = Math.min(top,
        windowPlacement(event, frameWidth, frameHeight).top - tokens.margin - tokens.height);
    }
  }
  return Math.max(tokens.margin, top);
}

export function RoleBadge({ timeline, timeMs, outroProgress, frameWidth, frameHeight, screenWidth, screenTop }: {
  timeline: Timeline; timeMs: number; outroProgress: number; frameWidth: number; frameHeight: number;
  screenWidth: number; screenTop: number;
}) {
  const state = roleBadgeState(timeline, timeMs, outroProgress);
  if (!state.layers.length) return null;
  const landscape = frameWidth / frameHeight >= demoTheme.layout.landscape.minAspect;
  return (
    <div style={{ position: "absolute", top: roleBadgeTop(timeline, frameWidth, frameHeight, screenTop),
      left: landscape ? (frameWidth - screenWidth) / 2 : "50%", transform: landscape ? undefined : "translateX(-50%)",
      width: state.width, maxWidth: "80%", height: tokens.height, overflow: "hidden", boxSizing: "border-box",
      borderRadius: 999, border: `1px solid ${demoTheme.colors.line}`, background: tokens.background,
      boxShadow: tokens.shadow, opacity: state.opacity, pointerEvents: "none", color: demoTheme.colors.contentPrimary,
      fontFamily: demoTheme.fontFamily, fontSize: tokens.fontSize, fontWeight: 500 }}>
      <span style={{ position: "absolute", left: tokens.padding, top: (tokens.height - tokens.dotSize) / 2,
        width: tokens.dotSize, height: tokens.dotSize, borderRadius: "50%", background: demoTheme.colors.accentPrimary }} />
      {state.layers.map((layer, index) => (
        <span key={index} style={{ position: "absolute", left: tokens.padding + tokens.dotSize + tokens.gap,
          height: "100%", display: "flex", alignItems: "center", whiteSpace: "nowrap", opacity: layer.opacity,
          transform: `translateY(${layer.y}px)` }}>{layer.label}</span>
      ))}
    </div>
  );
}
