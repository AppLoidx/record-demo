import { Easing, interpolate, useVideoConfig } from "remotion";
import type { Timeline, TimelineEvent } from "../lib/timeline";
import { textWidth } from "../lib/typography";
import { KineticWords } from "./KineticWords";
import { demoTheme } from "./theme";
type CaptionEvent = Extract<TimelineEvent, { kind: "caption" }>;

function activeCaptionAt(timeline: Timeline, timeMs: number) {
  return timeline.events.filter((event) => event.kind === "caption")
    .filter((event) => event.t <= timeMs && timeMs < event.t + event.durationMs).at(-1);
}

/** Conservative wrapping metrics keep even long captions within the reserved band. */
export function captionFontSize(text: string, width: number, height: number, bandHeight: number) {
  const scale = Math.min(width, height) / 1440;
  let fontSize = demoTheme.caption.fontSize * scale;
  const maxWidth = width * demoTheme.caption.widthRatio;
  for (;;) {
    let lineWidth = 0, lines = 1;
    for (const word of text.trim().split(/\s+/)) {
      const wordWidth = textWidth(word, fontSize);
      if (wordWidth > maxWidth) { fontSize *= .95; lineWidth = Infinity; break; }
      if (lineWidth && lineWidth + textWidth(" ", fontSize) + wordWidth > maxWidth) { lines++; lineWidth = wordWidth; }
      else lineWidth += (lineWidth ? textWidth(" ", fontSize) : 0) + wordWidth;
    }
    if (lineWidth !== Infinity && lines * fontSize * demoTheme.caption.lineHeight + demoTheme.caption.wordOffset * scale * 2 <= bandHeight) return fontSize;
    fontSize *= .95;
  }
}

export function CaptionVisual({ caption, bandTop, bandHeight, timeMs, width, height }: {
  caption: CaptionEvent; bandTop: number; bandHeight: number; timeMs: number; width: number; height: number;
}) {
  const elapsed = timeMs - caption.t;
  const exit = interpolate(caption.durationMs - elapsed, [0, demoTheme.caption.exitDurationMs], [0, 1], {
    easing: Easing.bezier(...demoTheme.caption.easing), extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return <div data-caption-band style={{ position: "absolute", left: 0, top: bandTop, width, height: bandHeight,
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none" }}>
    <div data-caption-text style={{ maxWidth: `${demoTheme.caption.widthRatio * 100}%`,
      color: demoTheme.colors.contentPrimary, fontFamily: demoTheme.fontFamily,
      fontSize: captionFontSize(caption.text, width, height, bandHeight), fontWeight: 500,
      lineHeight: demoTheme.caption.lineHeight, letterSpacing: "-0.02em", textAlign: "center", opacity: exit }}>
      <KineticWords text={caption.text} ageMs={elapsed} offset={demoTheme.caption.wordOffset * Math.min(width, height) / 1440}
        budgetMs={Math.min(demoTheme.caption.wordBudgetMs, caption.durationMs * .6)} />
    </div>
  </div>;
}

export function Caption({ timeline, caption, bandTop, bandHeight, timeMs }: {
  timeline: Timeline; caption: CaptionEvent; bandTop: number; bandHeight: number; timeMs: number;
}) {
  const { width, height } = useVideoConfig();
  if (activeCaptionAt(timeline, timeMs) !== caption) return null;
  return <CaptionVisual caption={caption} bandTop={bandTop} bandHeight={bandHeight} timeMs={timeMs} width={width} height={height} />;
}
