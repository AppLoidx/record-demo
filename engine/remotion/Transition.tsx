import { Easing } from "remotion";
import { transitionTotalDuration, type TransitionEvent } from "../lib/timeline";
import { demoTheme } from "./theme";

const tokens = demoTheme.transition;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const outEase = Easing.bezier(...tokens.outEasing);
const inEase = Easing.bezier(...tokens.inEasing);

export function transitionMotion(
  event: TransitionEvent | undefined,
  timeMs: number,
) {
  const elapsed = event ? timeMs - event.t : -1;
  const rest = {
    active: false,
    scale: 1,
    opacity: 1,
    translateX: 0,
    cardOpacity: 0,
    cardY: tokens.cardOffset as number,
  };
  if (!event || elapsed < 0 || elapsed >= transitionTotalDuration(event))
    return rest;
  const active = true;
  if (elapsed < event.outMs) {
    const out = outEase(clamp(elapsed / event.outMs));
    return {
      ...rest,
      active,
      scale: 1 - (1 - tokens.outScale) * out,
      opacity: 1 - out,
      translateX: -tokens.translateRatio * out,
    };
  }
  const cardAge = elapsed - event.outMs;
  if (cardAge < event.cardMs) {
    const enter = inEase(clamp(cardAge / tokens.cardEnterMs));
    const exit = outEase(
      clamp((cardAge - event.cardMs + tokens.cardExitMs) / tokens.cardExitMs),
    );
    // Reposition the invisible screen continuously beneath the card.
    const hidden = clamp(cardAge / event.cardMs);
    return {
      active,
      scale: tokens.outScale + (tokens.inScale - tokens.outScale) * hidden,
      opacity: 0,
      translateX: tokens.translateRatio * (2 * hidden - 1),
      cardOpacity: enter * (1 - exit),
      cardY: tokens.cardOffset * (1 - enter),
    };
  }
  const incoming = inEase(clamp((cardAge - event.cardMs) / event.inMs));
  return {
    ...rest,
    active,
    scale: tokens.inScale - (tokens.inScale - 1) * incoming,
    opacity: incoming,
    translateX: tokens.translateRatio * (1 - incoming),
  };
}

export { createSceneCameraPath } from "../lib/scene-camera";

export function Transition({
  event,
  timeMs,
  frameWidth,
}: {
  event: TransitionEvent;
  timeMs: number;
  frameWidth: number;
}) {
  const motion = transitionMotion(event, timeMs);
  if (!motion.active || motion.cardOpacity === 0) return null;
  const fontSize =
    frameWidth * demoTheme.outro.titleSizeRatio * tokens.titleScale;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 8%",
        opacity: motion.cardOpacity,
        transform: `translateY(${motion.cardY}px)`,
        pointerEvents: "none",
        fontFamily: demoTheme.fontFamily,
        color: demoTheme.colors.contentPrimary,
      }}
    >
      {event.role ? (
        <div
          style={{
            fontSize: fontSize * tokens.roleSizeRatio,
            color: demoTheme.colors.contentSecondary,
            marginBottom: tokens.roleGap,
          }}
        >
          {event.role}
        </div>
      ) : null}
      <div style={{ fontSize, fontWeight: 600, letterSpacing: "-0.025em" }}>
        {event.label}
      </div>
    </div>
  );
}
