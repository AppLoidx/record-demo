import { describe, expect, it } from "vitest";
import fixture from "../fixtures/timeline.json";
import {
  parseTimeline,
  serializeTimeline,
  type Timeline,
  type WindowEvent,
  type TransitionEvent,
} from "../lib/timeline";
import { demoVideoSchema } from "../remotion/schema";
import {
  windowMotion,
  windowPlacement,
  insetInteraction,
} from "../remotion/WindowInset";
import {
  transitionMotion,
  createSceneCameraPath,
} from "../remotion/Transition";
import { roleLayers } from "../remotion/RoleBadge";
import { buildStudioTracks } from "../remotion/DemoVideo";
import { computeFrameSheets } from "../scripts/frame-sheets.mjs";
import { detectDeadAirSpans, scoreTimeline } from "../scripts/score-motion.mjs";

const windowEvent: WindowEvent = {
  t: 1000,
  kind: "window",
  image: "story-window-1.png",
  imageWidth: 1140,
  imageHeight: 840,
  title: "Email",
  holdMs: 5000,
  enterMs: 520,
  exitMs: 320,
  highlight: { x: 150, y: 400, width: 600, height: 90 },
  click: true,
};
const transition: TransitionEvent = {
  t: 8000,
  kind: "transition",
  label: "Review request",
  role: "Ops",
  outMs: 380,
  cardMs: 5000,
  inMs: 460,
};
const timeline: Timeline = {
  ...(fixture as Timeline),
  durationMs: 20000,
  events: [
    { t: 0, kind: "role", label: "Customer" },
    windowEvent,
    transition,
    { t: 10880, kind: "role", label: "Ops" },
  ],
};

describe("multi-actor timeline", () => {
  it("round-trips new events and old timelines through both schemas", () => {
    for (const subject of [timeline, fixture as Timeline]) {
      expect(parseTimeline(serializeTimeline(subject))).toEqual(subject);
      expect(
        demoVideoSchema.parse({
          timeline: subject,
          videoSrc: "clip.mp4",
          windowChrome: "macos",
        }).timeline,
      ).toEqual(subject);
    }
  });
  it.each([
    { ...windowEvent, imageWidth: 0 },
    { ...windowEvent, holdMs: -1 },
    { ...windowEvent, click: "yes" },
    { ...transition, cardMs: -1 },
    { t: 0, kind: "role", label: 12 },
  ])("rejects invalid fields", (event) => {
    const subject = { ...timeline, events: [event] };
    expect(() => parseTimeline(JSON.stringify(subject))).toThrow();
    expect(
      demoVideoSchema.safeParse({
        timeline: subject,
        videoSrc: "clip.mp4",
        windowChrome: "macos",
      }).success,
    ).toBe(false);
  });
  it("names and spans Studio tracks", () => {
    const tracks = buildStudioTracks(timeline, 60, 1200);
    expect(tracks.windows[0]).toMatchObject({
      name: "Window: Email",
      from: 60,
      durationInFrames: 351,
    });
    expect(tracks.transitions[0]).toMatchObject({
      name: "Transition: Review request",
      from: 480,
    });
    expect(tracks.roles.map((track) => track.name)).toEqual([
      "Role: Customer",
      "Role: Ops",
    ]);
    expect(tracks.roles[0]!.durationInFrames).toBe(675);
  });
  it("sheets cover whole effects", () => {
    expect(computeFrameSheets(timeline, timeline.durationMs)).toMatchObject([
      { kind: "window", startMs: 750, endMs: 7340 },
      { kind: "transition", startMs: 7750, endMs: 14340 },
    ]);
  });
  it("exempts holds/cards but flags static time afterward", () => {
    expect(detectDeadAirSpans(timeline)).toEqual([
      { startMs: 13840, durationMs: 5160, verdict: "WARN" },
    ]);
  });
});

describe("window motion", () => {
  it("has exact resting, enter, hold and exit transforms", () => {
    expect(windowMotion(windowEvent, 0)).toMatchObject({
      active: false,
      mainScale: 1,
      dim: 0,
    });
    expect(windowMotion(windowEvent, 1000)).toMatchObject({
      opacity: 0,
      scale: 0.94,
      translateY: 48,
      mainScale: 1,
      dim: 0,
    });
    const mid = windowMotion(windowEvent, 1260);
    expect(mid.scale).toBeGreaterThan(0.94);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.mainScale).toBeLessThan(1);
    expect(mid.dim).toBeGreaterThan(0);
    expect(windowMotion(windowEvent, 2000)).toMatchObject({
      opacity: 1,
      scale: 1,
      translateY: 0,
      mainScale: 0.97,
      dim: 0.18,
    });
    const exit = windowMotion(windowEvent, 6680);
    expect(exit.opacity).toBeGreaterThan(0);
    expect(exit.opacity).toBeLessThan(1);
    expect(exit.mainScale).toBeGreaterThan(0.97);
    expect(exit.mainScale).toBeLessThan(1);
    expect(windowMotion(windowEvent, 6840)).toMatchObject({
      active: false,
      mainScale: 1,
      dim: 0,
    });
  });
  it("keeps a zero-exit inset visible through its hold", () => {
    expect(windowMotion({ ...windowEvent, exitMs: 0 }, 2000)).toMatchObject({
      active: true,
      opacity: 1,
      mainScale: 0.97,
    });
    expect(windowMotion({ ...windowEvent, exitMs: 0 }, 6520)).toMatchObject({
      active: false,
      mainScale: 1,
    });
  });

  it.each([
    [2560, 1440],
    [1440, 1440],
    [1080, 1920],
  ])("keeps inset inside %sx%s including entry offset", (width, height) => {
    for (const [imageWidth, imageHeight] of [
      [1140, 840],
      [200, 2000],
    ]) {
      const p = windowPlacement(
        { ...windowEvent, imageWidth: imageWidth!, imageHeight: imageHeight! },
        width,
        height,
      );
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width).toBeLessThanOrEqual(width);
      expect(p.top + p.height + 48).toBeLessThanOrEqual(height);
    }
  });
  it("lands the dedicated cursor at the image target and reveals its ring", () => {
    const p = windowPlacement(windowEvent, 2560, 1440);
    const final = insetInteraction(windowEvent, 4500, p);
    expect(final.x).toBeCloseTo(450 * p.imageScale);
    expect(final.y).toBeCloseTo(445 * p.imageScale);
    expect(final.clickAge).toBeGreaterThan(90);
    expect(final.ringOpacity).toBe(1);
    expect(insetInteraction(windowEvent, 1769, p).cursorOpacity).toBe(0);
    expect(
      insetInteraction({ ...windowEvent, click: false }, 4000, p),
    ).toMatchObject({ cursorOpacity: 0, ringOpacity: 1 });
  });
});

describe("transition and roles", () => {
  it("holds context and is continuous across adjacent 60fps boundary frames", () => {
    const event = { ...transition, outMs: 450, cardMs: 1500, inMs: 560 };
    expect(transitionMotion(event, 7999).outgoing).toMatchObject({ scale: 1, opacity: 1 });
    expect(transitionMotion(event, 8450).outgoing).toMatchObject({ scale: 0.84, opacity: 0.07, translateX: -0.10 });
    expect(transitionMotion(event, 9200).outgoing).toMatchObject({ scale: 0.84, opacity: 0.07, translateX: -0.10 });
    expect(transitionMotion(event, 9950).incoming).toMatchObject({ scale: 0.96, opacity: 0, translateX: 0.06 });
    expect(transitionMotion(event, 10510).incoming).toMatchObject({ scale: 1, opacity: 1, translateX: 0 });
    for (const boundary of [8000, 8450, 9950, 10510]) {
      const beforeFrame = Math.floor(boundary * 60 / 1000);
      for (const frame of [beforeFrame - 1, beforeFrame]) {
        const before = transitionMotion(event, frame * 1000 / 60);
        const after = transitionMotion(event, (frame + 1) * 1000 / 60);
        for (const layer of ["outgoing", "incoming"] as const) {
          for (const key of ["opacity", "scale", "translateX"] as const)
            expect(Math.abs(after[layer][key] - before[layer][key])).toBeLessThan(0.01);
        }
      }
    }
  });
  it("arrives wide while the original zoom-out would still be moving", () => {
    const subject: Timeline = {
      ...timeline,
      events: [
        {
          t: 0,
          kind: "zoom",
          rect: { x: 500, y: 200, width: 500, height: 300 },
        },
        { t: 3000, kind: "zoom", rect: null },
        { ...transition, t: 3000, cardMs: 700 },
      ],
    };
    const path = createSceneCameraPath(subject, 60, 2000, 1125);
    expect(path.atFrame(250).scale).toBeCloseTo(2000 / 2880);
    expect(path.atFrame(179).scale).toBeGreaterThan(2000 / 2880);
  });
  it("reports the same post-transition duration in camera moves and Studio", () => {
    const subject: Timeline = {
      ...timeline,
      durationMs: 12000,
      events: [
        { t: 0, kind: "zoom", rect: { x: 0, y: 0, width: 400, height: 200 } },
        { t: 3000, kind: "zoom", rect: null },
        { ...transition, t: 3000, cardMs: 700 },
        {
          t: 4550,
          kind: "zoom",
          rect: { x: 1200, y: 700, width: 200, height: 100 },
        },
      ],
    };
    const path = createSceneCameraPath(subject, 60, 2000, 1125);
    const isolated = createSceneCameraPath(
      { ...subject, events: subject.events.slice(-1) },
      60,
      2000,
      1125,
    );
    expect(path.moves.at(-1)!.durationMs).toBe(isolated.moves[0]!.durationMs);
    expect(
      buildStudioTracks(subject, 60, 720, path).zooms.at(-1)!.durationInFrames,
    ).toBe(
      Math.floor(((4550 + isolated.moves[0]!.durationMs) * 60) / 1000) -
        273 +
        1,
    );
    expect(scoreTimeline(subject).metrics.smoothness.verdict).toBe("PASS");
  });

  it("swaps roles without blending labels, and fades with outro", () => {
    for (let age = 0; age <= 360; age += 5) {
      expect(roleLayers(timeline, 10880 + age, 0).filter((layer) => layer.opacity > 0.15).length).toBeLessThanOrEqual(1);
    }
    expect(roleLayers(timeline, 12000, 0.5)).toMatchObject([{ label: "Ops", opacity: 0.5, y: 0 }]);
    expect(roleLayers(timeline, 12000, 1)).toMatchObject([{ label: "Ops", opacity: 0 }]);
  });
});
