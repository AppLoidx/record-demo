export type Rect = { x: number; y: number; width: number; height: number };

export type Timeline = {
  version: 1;
  name: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  capture: { fps: number; syncFlashAt: number };
  durationMs: number;
  events: Array<
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
    value.events.filter(
      (event) => isRecord(event) && event.kind === "outro",
    ).length <= 1
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
