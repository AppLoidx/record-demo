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
  const labelAge = age - t.ringMs - t.connectorMs;
  const label = ease(clamp(labelAge / t.labelEnterMs));
  const words = p.lines.flatMap((line) => line.split(" "));
  const times = wordTimings(words.length, demoTheme.caption.wordStaggerMs, demoTheme.caption.wordMs, demoTheme.caption.wordBudgetMs);
  let wordIndex = 0;
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: exit }}>
    <div style={{ position: "absolute", left: ringRect.x, top: ringRect.y, width: ringRect.width, height: ringRect.height,
      boxSizing: "border-box",
      backgroundColor: `color-mix(in srgb, ${demoTheme.colors.accentPrimary} ${t.fillOpacity * 100}%, transparent)`,
      borderRadius: t.ringRadius * frameScale, opacity: ring, transform: `scale(${highlightScale})` }} />
    <div style={{ position: "absolute", left: p.x, top: p.y, width: p.width, height: p.height, boxSizing: "border-box",
      padding: `${metrics.paddingY}px ${metrics.paddingX}px`, borderRadius: p.lines.length > 1 ? t.radius * frameScale : 999,
      backgroundColor: demoTheme.colors.accentPrimary, boxShadow: t.shadow, fontFamily: demoTheme.fontFamily, fontSize: metrics.fontSize,
      lineHeight: t.lineHeight, fontWeight: 500, color: demoTheme.colors.captionText, opacity: label,
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
