import { Easing } from "remotion";
import { calloutPlacement } from "../lib/callout";
import { calloutTotalDuration, type CalloutEvent, type Timeline } from "../lib/timeline";
import { clamp, wordTimings, progressAt } from "../lib/typography";
import { demoTheme } from "./theme";
import type { CameraTransform } from "./zoom";

const t = demoTheme.callout;
const ease = Easing.bezier(...t.easing);
export function Callout({ event, timeMs, timeline, camera, width, height }: {
  event: CalloutEvent; timeMs: number; timeline: Timeline; camera: CameraTransform; width: number; height: number;
}) {
  const age = timeMs - event.t;
  const total = calloutTotalDuration(event);
  if (age < 0 || age >= total) return null;
  const scale = timeline.viewport.deviceScaleFactor * camera.scale;
  const rect = { x: camera.translateX + event.rect.x * scale, y: camera.translateY + event.rect.y * scale,
    width: event.rect.width * scale, height: event.rect.height * scale };
  const p = calloutPlacement(rect, event.text, event.side, width, height);
  const { ringRect, metrics, frameScale } = p;
  const exit = ease(clamp((total - age) / t.exitMs));
  const ring = ease(clamp(age / t.ringMs));
  const highlightScale = t.highlightEnterScale + (1 - t.highlightEnterScale) * ease(clamp(age / t.highlightEnterMs));
  const connector = ease(clamp((age - t.ringMs) / t.connectorMs));
  const labelAge = age - t.ringMs - t.connectorMs;
  const label = ease(clamp(labelAge / t.labelEnterMs));
  const words = p.lines.flatMap((line) => line.split(" "));
  const times = wordTimings(words.length, demoTheme.caption.wordStaggerMs, demoTheme.caption.wordMs, demoTheme.caption.wordBudgetMs);
  let wordIndex = 0;
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: exit }}>
    <div style={{ position: "absolute", left: ringRect.x, top: ringRect.y, width: ringRect.width, height: ringRect.height,
      boxSizing: "border-box", border: `${t.ringWidth * frameScale}px solid color-mix(in srgb, ${demoTheme.colors.accentPrimary} ${t.ringOpacity * 100}%, transparent)`,
      backgroundColor: `color-mix(in srgb, ${demoTheme.colors.accentPrimary} ${t.fillOpacity * 100}%, transparent)`,
      boxShadow: `0 0 0 ${t.ringGlow * frameScale}px color-mix(in srgb, ${demoTheme.colors.accentPrimary} ${t.ringGlowOpacity * 100}%, transparent), 0 ${t.ringShadowY * frameScale}px ${t.ringShadowBlur * frameScale}px color-mix(in srgb, ${demoTheme.colors.accentPrimary} ${t.ringShadowOpacity * 100}%, transparent)`,
      borderRadius: t.ringRadius * frameScale, opacity: ring, transform: `scale(${highlightScale})` }} />
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <path d={`M ${p.start.x} ${p.start.y} L ${p.end.x} ${p.end.y}`} fill="none" stroke={demoTheme.colors.contentSecondary}
        strokeWidth={1} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - connector} />
    </svg>
    <div style={{ position: "absolute", left: p.x, top: p.y, width: p.width, height: p.height, boxSizing: "border-box",
      padding: `${metrics.paddingY}px ${metrics.paddingX}px`, borderRadius: t.radius * frameScale, border: `1px solid ${demoTheme.colors.line}`,
      backgroundColor: demoTheme.colors.surface, boxShadow: t.shadow, fontFamily: demoTheme.fontFamily, fontSize: metrics.fontSize,
      lineHeight: t.lineHeight, fontWeight: 500, color: demoTheme.colors.contentPrimary, opacity: label,
      transform: `scale(${t.labelEnterScale + (1 - t.labelEnterScale) * label})`, overflow: "hidden" }}>
      {p.lines.map((line, lineIndex) => <div key={lineIndex} style={{ whiteSpace: "nowrap" }}>{line.split(" ").map((word, i) => {
        const timing = times[wordIndex++]!;
        const progress = ease(progressAt(labelAge - t.labelEnterMs, timing.startMs, timing.endMs));
        return <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: progress,
          transform: `translateY(${demoTheme.caption.wordOffset * (1 - progress)}px)` }}>{word}{i < line.split(" ").length - 1 ? " " : ""}</span>;
      })}</div>)}
    </div>
  </div>;
}
