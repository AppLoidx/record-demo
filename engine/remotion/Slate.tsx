import { demoTheme } from "./theme";

const tokens = demoTheme.transition;

/** Shared chapter/outro backdrop and segmented progress rail. */
export function SlateVeil({ frameWidth, opacity }: { frameWidth: number; opacity: number }) {
  const veil = demoTheme.slate;
  return <div style={{ position: "absolute", inset: 0, opacity,
    background: `radial-gradient(ellipse ${frameWidth * veil.widthRatio}px ${frameWidth * veil.heightRatio}px at center, color-mix(in srgb, ${demoTheme.colors.backdrop} ${veil.strengthPercent}%, transparent) ${veil.innerStopPercent}%, transparent 100%)` }} />;
}

export function SlateStepper({ fills, frameWidth, opacity = 1 }: {
  fills: readonly number[]; frameWidth: number; opacity?: number;
}) {
  const scale = frameWidth / demoTheme.slate.referenceWidth;
  return <div style={{ display: "flex", gap: tokens.segmentGap * scale,
    marginTop: tokens.stepperGap * scale, opacity }}>
    {fills.map((fill, i) => <div key={i} style={{ position: "relative",
      width: tokens.segmentWidth * scale, height: tokens.segmentHeight * scale,
      borderRadius: tokens.segmentRadius * scale, overflow: "hidden", background: demoTheme.colors.line }}>
      <div style={{ position: "absolute", inset: 0, background: demoTheme.colors.accentPrimary,
        transform: `scaleX(${fill})`, transformOrigin: "left" }} />
    </div>)}
  </div>;
}
