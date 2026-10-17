import { railLayout, type RailState } from "../lib/rail";
import { clamp } from "../lib/typography";
import { demoTheme } from "./theme";

const t = demoTheme.rail;
export function Rail({ state, width, height, outroProgress = 0, screenShift = 0 }: {
  state: RailState; width: number; height: number; outroProgress?: number; screenShift?: number;
}) {
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 1 - outroProgress,
    transform: `translateY(${-screenShift * (1 - state.opacity)}px)` }}>
    {state.layers.map((layer, index) => {
      const p = railLayout(layer.steps, width, height);
      const lo = Math.floor(layer.active), hi = Math.ceil(layer.active);
      const a = p.nodes[lo]!, b = p.nodes[hi]!;
      if (!a || !b) return null;
      const blend = layer.active - lo;
      const activeX = a.x + (b.x - a.x) * blend;
      const activeWidth = a.width + (b.width - a.width) * blend;
      const activeCenter = activeX + activeWidth / 2;
      const first = p.nodes[0]!.center, last = p.nodes.at(-1)!.center;
      const y = t.trackY * p.scale;
      return <div key={index} style={{ position: "absolute", left: p.left, top: p.top, width: p.width, height: p.height,
        borderRadius: 999, background: demoTheme.role.background, boxShadow: demoTheme.role.shadow,
        backdropFilter: "blur(16px)", opacity: layer.opacity, fontFamily: demoTheme.fontFamily }}>
        <div style={{ position: "absolute", left: activeX, top: (t.labelY - t.labelHeight / 2) * p.scale, width: activeWidth,
          height: t.labelHeight * p.scale, borderRadius: 999,
          background: `color-mix(in srgb, ${demoTheme.colors.accentPrimary} ${t.fillOpacity * 100}%, transparent)` }} />
        <svg width={p.width} height={p.height} style={{ position: "absolute", inset: 0 }}>
          <path d={`M ${first} ${y} H ${last}`} stroke={demoTheme.colors.line} fill="none" strokeWidth={p.scale} />
          <path d={`M ${first} ${y} H ${activeCenter}`} stroke={demoTheme.colors.accentPrimary} strokeOpacity={0.45}
            fill="none" strokeWidth={p.scale} />
          {[...(layer.trails ?? []), ...(layer.arc ? [layer.arc] : [])].map((arc, index) => {
            const from = p.nodes[arc.from]!.center, to = p.nodes[arc.to]!.center;
            return <path key={index} d={`M ${from} ${y} Q ${(from + to) / 2} ${y + t.arcDepth * p.scale} ${to} ${y}`}
            fill="none" stroke={demoTheme.colors.accentPrimary} strokeWidth={1.4 * p.scale} strokeLinecap="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arc.draw} opacity={arc.opacity * 0.6} />;
          })}
          {p.nodes.map((node, i) => <circle key={i} cx={node.center} cy={y} r={t.dotSize * p.scale / 2}
            fill={demoTheme.colors.accentPrimary} opacity={0.2 + 0.5 * clamp(layer.active - i + 1)} />)}
        </svg>
        {p.nodes.map((node, i) => <div key={i} style={{ position: "absolute", left: node.x, top: 0, width: node.width,
          height: t.labelY * 2 * p.scale, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: t.fontSize * p.scale, fontWeight: 500, color: demoTheme.colors.contentPrimary,
          opacity: 0.5 + 0.5 * clamp(1 - Math.abs(layer.active - i)), whiteSpace: "nowrap" }}>{layer.steps[i]}</div>)}
      </div>;
    })}
  </div>;
}
