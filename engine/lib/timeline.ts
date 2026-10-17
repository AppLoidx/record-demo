import { demoTheme } from "../remotion/theme.ts";

export type Chapter = { index: number; total: number };
export type CalloutSide = "left" | "right" | "top" | "bottom";
export type LandText = { fontSize: number; fontFamily: string; fontWeight: string; color: string };
export type Rect = { x: number; y: number; width: number; height: number };

export type LandLine = { rect: Rect; text: string };

export type Timeline = {
  version: 1;
  name: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  capture: { fps: number; syncFlashAt: number };
  durationMs: number;
  events: Array<
    | { t: number; kind: "role"; label: string }
    | { t: number; kind: "rail"; steps: string[]; active: number }
    | { t: number; kind: "rail-back"; from: number; to: number }
    | { t: number; kind: "rail-off" }
    | { t: number; kind: "carry"; rect: Rect; text: string; textStyle?: LandText }
    | { t: number; kind: "land"; rect: Rect; textStyle?: LandText; text?: string; lines?: LandLine[]; lineCount?: number; conceal?: boolean; concealColor?: string }
    | {
        t: number;
        kind: "window";
        image: string;
        imageWidth: number;
        imageHeight: number;
        title?: string;
        holdMs: number;
        enterMs: number;
        exitMs: number;
        highlight?: Rect;
        click?: boolean;
      }
    | {
        t: number;
        kind: "transition";
        style?: "cut";
        label: string;
        role?: string;
        chapter?: Chapter;
        outMs: number;
        cardMs: number;
        visibleCardMs?: number;
        inMs: number;
      }
    | { t: number; kind: "callout"; rect: Rect; text: string; holdMs: number; side: CalloutSide }
    | { t: number; kind: "caption"; text: string; durationMs: number }
    | { t: number; kind: "cursor"; x: number; y: number }
    | { t: number; kind: "click"; x: number; y: number }
    | { t: number; kind: "zoom"; rect: Rect | null; durationMs?: number }
    | { t: number; kind: "outro"; title: string; durationMs: number }
    | {
        t: number;
        kind: "spotlight";
        rect: Rect;
        durationMs: number;
        holdMs: number;
      }
  >;
};

export type TimelineEvent = Timeline["events"][number];

export type WindowEvent = Extract<TimelineEvent, { kind: "window" }>;
export type TransitionEvent = Extract<TimelineEvent, { kind: "transition" }>;
export type RoleEvent = Extract<TimelineEvent, { kind: "role" }>;
export type RailEvent = Extract<TimelineEvent, { kind: "rail" | "rail-back" | "rail-off" }>;
export type CarryEvent = Extract<TimelineEvent, { kind: "carry" }>;
export type LandEvent = Extract<TimelineEvent, { kind: "land" }>;

export function windowTotalDuration(event: WindowEvent) {
  return event.enterMs + event.holdMs + event.exitMs;
}
export function transitionTotalDuration(event: TransitionEvent) {
  return event.outMs + event.cardMs + event.inMs;
}

export type CalloutEvent = Extract<TimelineEvent, { kind: "callout" }>;
export function calloutEnterDuration(text: string) {
  const { callout, caption } = demoTheme;
  return callout.ringMs + callout.connectorMs + callout.labelEnterMs + (text.trim() ? caption.wordBudgetMs : 0);
}
export function calloutTotalDuration(event: CalloutEvent) {
  return calloutEnterDuration(event.text) + event.holdMs + demoTheme.callout.exitMs;
}

export function isChapter(value: unknown): value is Chapter {
  return isRecord(value) && Number.isInteger(value.index) && Number.isInteger(value.total) &&
    (value.index as number) >= 1 && (value.total as number) >= (value.index as number);
}

export type SpotlightEvent = Extract<TimelineEvent, { kind: "spotlight" }>;

export function spotlightTotalDuration(spotlight: SpotlightEvent) {
  return spotlight.durationMs * 2 + spotlight.holdMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRect(value: unknown): value is Rect {
  return (
    isRecord(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  );
}

function isSpotlightRect(value: unknown): value is Rect {
  return isRect(value) && value.width >= 0 && value.height >= 0;
}

function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (!isRecord(value) || !isNumber(value.t)) {
    return false;
  }

  switch (value.kind) {
    case "rail":
      return Array.isArray(value.steps) && value.steps.length > 0 &&
        value.steps.every((step) => typeof step === "string") &&
        Number.isInteger(value.active) && (value.active as number) >= 0 && (value.active as number) < value.steps.length;
    case "rail-back":
      return [value.from, value.to].every((n) => Number.isInteger(n) && (n as number) >= 0);
    case "rail-off":
      return true;
    case "carry":
      return isSpotlightRect(value.rect) && typeof value.text === "string" && (value.textStyle === undefined ||
        (isRecord(value.textStyle) && isNumber(value.textStyle.fontSize) && value.textStyle.fontSize > 0 &&
        [value.textStyle.fontFamily, value.textStyle.fontWeight, value.textStyle.color].every((v) => typeof v === "string")));
    case "land":
      return isSpotlightRect(value.rect) &&
        (value.text === undefined || typeof value.text === "string") &&
        (value.lineCount === undefined || (Number.isInteger(value.lineCount) && (value.lineCount as number) > 0)) &&
        (value.lines === undefined || (Array.isArray(value.lines) && value.lines.length > 0 && value.lines.every((line) =>
          isRecord(line) && isSpotlightRect(line.rect) && typeof line.text === "string"))) &&
        (value.conceal === undefined || typeof value.conceal === "boolean") &&
        (value.concealColor === undefined || typeof value.concealColor === "string") && (value.textStyle === undefined ||
        (isRecord(value.textStyle) && isNumber(value.textStyle.fontSize) && value.textStyle.fontSize > 0 &&
        [value.textStyle.fontFamily, value.textStyle.fontWeight, value.textStyle.color].every((v) => typeof v === "string")));
    case "role":
      return typeof value.label === "string";
    case "window":
      return (
        typeof value.image === "string" &&
        value.image.length > 0 &&
        isNumber(value.imageWidth) &&
        value.imageWidth > 0 &&
        isNumber(value.imageHeight) &&
        value.imageHeight > 0 &&
        (value.title === undefined || typeof value.title === "string") &&
        [value.holdMs, value.enterMs, value.exitMs].every(
          (n) => isNumber(n) && n >= 0,
        ) &&
        (value.highlight === undefined || isSpotlightRect(value.highlight)) &&
        (value.click === undefined || typeof value.click === "boolean")
      );
    case "callout":
      return isSpotlightRect(value.rect) && typeof value.text === "string" &&
        isNumber(value.holdMs) && value.holdMs >= 0 &&
        ["left", "right", "top", "bottom"].includes(value.side as string);
    case "transition":
      return (
        typeof value.label === "string" &&
        (value.style === undefined || value.style === "cut") &&
        (value.role === undefined || typeof value.role === "string") &&
        (value.chapter === undefined || isChapter(value.chapter)) &&
        [value.outMs, value.cardMs, value.inMs].every(
          (n) => isNumber(n) && n >= 0,
        ) &&
        (value.visibleCardMs === undefined ||
          (isNumber(value.visibleCardMs) && value.visibleCardMs >= 0))
      );
    case "caption":
      return (
        typeof value.text === "string" &&
        isNumber(value.durationMs) &&
        value.durationMs >= 0
      );
    case "cursor":
    case "click":
      return isNumber(value.x) && isNumber(value.y);
    case "zoom":
      return (
        (value.rect === null || isRect(value.rect)) &&
        (value.durationMs === undefined || isNumber(value.durationMs))
      );
    case "outro":
      return (
        typeof value.title === "string" &&
        isNumber(value.durationMs) &&
        value.durationMs >= 0
      );
    case "spotlight":
      return (
        isSpotlightRect(value.rect) &&
        isNumber(value.durationMs) &&
        value.durationMs >= 0 &&
        isNumber(value.holdMs) &&
        value.holdMs >= 0
      );
    default:
      return false;
  }
}

export function isTimeline(value: unknown): value is Timeline {
  if (!isRecord(value)) {
    return false;
  }

  const { viewport, capture } = value;

  return (
    value.version === 1 &&
    typeof value.name === "string" &&
    isRecord(viewport) &&
    isNumber(viewport.width) &&
    isNumber(viewport.height) &&
    isNumber(viewport.deviceScaleFactor) &&
    isRecord(capture) &&
    isNumber(capture.fps) &&
    isNumber(capture.syncFlashAt) &&
    isNumber(value.durationMs) &&
    Array.isArray(value.events) &&
    value.events.every(isTimelineEvent) &&
    value.events.filter((event) => isRecord(event) && event.kind === "outro")
      .length <= 1
  );
}

export function assertTimeline(value: unknown): asserts value is Timeline {
  if (!isTimeline(value)) {
    throw new TypeError("Invalid demo timeline");
  }
}

export function parseTimeline(json: string): Timeline {
  const value: unknown = JSON.parse(json);
  assertTimeline(value);
  return value;
}

export function serializeTimeline(timeline: Timeline): string {
  assertTimeline(timeline);
  return `${JSON.stringify(timeline, null, 2)}\n`;
}
