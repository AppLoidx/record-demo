import type { Browser, Locator, Page } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storyboard } from "../lib/storyboard";
import { WindowCapture, imageRect } from "../lib/window-capture";
import type { TimelineEvent } from "../lib/timeline";

const viewport = { width: 1920, height: 1080, deviceScaleFactor: 1.5 };
function setup() {
  let time = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  const page = {
    waitForTimeout: vi.fn(async (ms: number) => {
      time += ms;
    }),
  } as unknown as Page;
  const capture = {
    render: vi.fn(async () => ({
      image: "story-window-1.png",
      imageWidth: 1140,
      imageHeight: 840,
    })),
    close: vi.fn(async () => {}),
  };
  const d = new Storyboard("story", page, viewport, capture);
  vi.spyOn(d, "ensureStarted").mockResolvedValue();
  d.start();
  const events = (d as unknown as { events: TimelineEvent[] }).events;
  return {
    d,
    page,
    capture,
    events,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("multi-actor storyboard", () => {
  it.each([true, false])("land pairs with the first transition after carry (cut first: %s)", async (cutFirst) => {
    const { d, events } = setup();
    const evaluate = vi.fn(async () => ({ rect: { x: 710, y: 420, width: 350, height: 32 },
      textStyle: { fontSize: 28, fontFamily: "Geist Sans", fontWeight: "400", color: "black" } }));
    const target = { waitFor: vi.fn(async () => {}), scrollIntoViewIfNeeded: vi.fn(async () => {}),
      boundingBox: vi.fn(async () => ({ x: 700, y: 400, width: 400, height: 60 })), evaluate } as unknown as Locator;
    await d.carry(target, "Message");
    if (cutFirst) { await d.cut(async () => {}); await d.transition("Next", async () => {}); }
    else { await d.transition("First", async () => {}); await d.cut(async () => {}); }
    await d.land(target);
    expect(evaluate).toHaveBeenCalledTimes(cutFirst ? 1 : 0);
    const landed = events.at(-1);
    expect(landed?.kind === "land" && !!landed.textStyle).toBe(cutFirst);
  });
  it("captures native text geometry only for cut landings, preserving chapter carries", async () => {
    const { d, events } = setup();
    const text = { rect: { x: 710, y: 420, width: 350, height: 32 },
      textStyle: { fontSize: 28, fontFamily: "Geist Sans", fontWeight: "400", color: "rgb(0, 0, 0)" } };
    const evaluate = vi.fn(async () => text);
    const target = { waitFor: vi.fn(async () => {}), scrollIntoViewIfNeeded: vi.fn(async () => {}),
      boundingBox: vi.fn(async () => ({ x: 700, y: 400, width: 400, height: 60 })), evaluate } as unknown as Locator;
    await d.carry(target, "Message");
    await d.transition("Chapter", async () => {});
    await d.land(target);
    expect(evaluate).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: "land", rect: { x: 700, y: 400, width: 400, height: 60 } });
    await d.carry(target, "Message");
    await d.cut(async () => {});
    await d.land(target);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ kind: "land", ...text });
  });
  it("records the rail sequence synchronously and copies author labels", () => {
    const { d, events, advance } = setup();
    const steps = ["Bank", "Ops", "Customer"];
    d.rail(steps, 0);
    steps[0] = "Changed later";
    advance(1000);
    d.rail(["Bank", "Ops", "Customer"], 2);
    d.railBack(2, 1);
    d.railOff();
    expect(events).toEqual([
      { t: 0, kind: "rail", steps: ["Bank", "Ops", "Customer"], active: 0 },
      { t: 1000, kind: "rail", steps: ["Bank", "Ops", "Customer"], active: 2 },
      { t: 1000, kind: "rail-back", from: 2, to: 1 },
      { t: 1000, kind: "rail-off" },
    ]);
    expect(() => d.rail([], 0)).toThrow(/rail/i);
    expect(() => d.rail(["Bank"], 1)).toThrow(/rail/i);
    expect(() => d.railBack(4, 0)).toThrow(/rail/i);
  });
  it("captures stable carry and land rects and waits for the lift and landing", async () => {
    const { d, events, page } = setup();
    const target = {
      waitFor: vi.fn(async () => {}), scrollIntoViewIfNeeded: vi.fn(async () => {}),
      boundingBox: vi.fn(async () => ({ x: 700, y: 400, width: 400, height: 60 })),
    } as unknown as Locator;
    await d.carry(target, "Describe the source of funds");
    expect(events[0]).toEqual({ t: 150, kind: "carry", text: "Describe the source of funds",
      rect: { x: 700, y: 400, width: 400, height: 60 } });
    expect(page.waitForTimeout).toHaveBeenLastCalledWith(300);
    await d.transition("Sent back", async () => {});
    await d.land(target);
    expect(events.at(-1)).toMatchObject({ t: 3110, kind: "land", rect: { x: 700, y: 400, width: 400, height: 60 } });
    expect(page.waitForTimeout).toHaveBeenLastCalledWith(600);
  });
  it("records window durations and keeps capture running for their full sum", async () => {
    const { d, page, capture, events } = setup();
    await d.window({ html: "<button>Open</button>" }, { title: "Email" });
    expect(events).toEqual([
      {
        t: 0,
        kind: "window",
        image: "story-window-1.png",
        imageWidth: 1140,
        imageHeight: 840,
        title: "Email",
        enterMs: 520,
        holdMs: 2600,
        exitMs: 320,
        click: false,
      },
    ]);
    expect(page.waitForTimeout).toHaveBeenCalledWith(3440);
    expect(capture.render).toHaveBeenCalledWith(
      { html: "<button>Open</button>" },
      expect.objectContaining({ width: 760, maxHeight: 1400 }),
      "story-window-1.png",
    );
    await d.close();
    expect(capture.close).toHaveBeenCalledOnce();
  });
  it.each([100, 1200, 2100])(
    "measures a %sms switch and pads only the card",
    async (actionMs) => {
      const { d, advance, events } = setup();
      await d.transition("Ops review", async () => advance(actionMs), {
        role: "Ops",
      });
      expect(events).toEqual([
        {
          t: 0,
          kind: "transition",
          label: "Ops review",
          role: "Ops",
          outMs: 450,
          cardMs: Math.max(1500, actionMs),
          inMs: 560,
        },
        { t: 450 + Math.max(1500, actionMs) / 2, kind: "role", label: "Ops" },
      ]);
      d.role("Customer");
      expect(events.at(-1)).toMatchObject({
        t: 450 + Math.max(1500, actionMs) + 560,
        kind: "role",
        label: "Customer",
      });
    },
  );
  it("records chapter info and honors minCardMs overrides", async () => {
    const { d, events } = setup();
    await d.transition("Ops review", async () => {}, { role: "Ops", chapter: { index: 2, total: 5 }, minCardMs: 1900 });
    expect(events[0]).toMatchObject({ chapter: { index: 2, total: 5 }, outMs: 450, cardMs: 1900, inMs: 560 });
    await expect(d.transition("Invalid", async () => {}, { chapter: { index: 6, total: 5 } })).rejects.toThrow(/chapter/);
  });
  it("persists a visible card override and rejects invalid values", async () => {
    const { d, events } = setup();
    await d.transition("Quick card", async () => {}, {
      minCardMs: 2_000,
      visibleCardMs: 725,
    });
    expect(events.find((event) => event.kind === "transition")).toMatchObject({
      cardMs: 2_000,
      visibleCardMs: 725,
    });
    await expect(
      d.transition("Invalid", async () => {}, { visibleCardMs: -1 }),
    ).rejects.toThrow(/visibleCardMs/);
  });
  it("records a measured callout without waiting for its animation lifetime", async () => {
    const { d, events, page } = setup();
    const target = {
      waitFor: vi.fn(async () => {}), scrollIntoViewIfNeeded: vi.fn(async () => {}),
      boundingBox: vi.fn(async () => ({ x: 100, y: 150, width: 240, height: 60 })),
    } as unknown as Locator;
    await d.callout(target, "Review here", { holdMs: 9000 });
    expect(events).toEqual([{ t: 150, kind: "callout", rect: { x: 100, y: 150, width: 240, height: 60 },
      text: "Review here", side: "right", holdMs: 9000 }]);
    expect(page.waitForTimeout).toHaveBeenCalledExactlyOnceWith(150);
    d.caption("Action continues");
    expect(events.at(-1)).toMatchObject({ t: 150, kind: "caption" });
    await d.callout(target, "Explicit", { side: "bottom" });
    expect(events.at(-1)).toMatchObject({ side: "bottom", holdMs: 1800 });
  });
  it("accepts height as a maxHeight alias, with maxHeight taking precedence", async () => {
    const { d, capture } = setup();
    await d.window({ html: "Tall" }, { height: 900 });
    expect(capture.render).toHaveBeenLastCalledWith({ html: "Tall" }, expect.objectContaining({ maxHeight: 900 }), expect.any(String));
    await d.window({ html: "Tall" }, { height: 900, maxHeight: 1200 });
    expect(capture.render).toHaveBeenLastCalledWith({ html: "Tall" }, expect.objectContaining({ maxHeight: 1200 }), expect.any(String));
  });
  it("records a zoom reset at transition start when zoomed", async () => {
    const { d, events } = setup();
    events.push({
      t: 0,
      kind: "zoom",
      rect: { x: 50, y: 50, width: 200, height: 100 },
    });
    await d.transition("Next app", async () => {}, { minCardMs: 950 });
    expect(events).toContainEqual({ t: 0, kind: "zoom", rect: null });
    expect(events.find((e) => e.kind === "transition")).toMatchObject({
      cardMs: 950,
    });
  });
  it("records a reset when an earlier zoom-out is still in flight", async () => {
    const { d, events, advance } = setup();
    events.push(
      { t: 0, kind: "zoom", rect: { x: 500, y: 300, width: 400, height: 200 } },
      { t: 2500, kind: "zoom", rect: null },
    );
    advance(3000);
    await d.transition("Next", async () => {});
    expect(events).toContainEqual({ t: 3000, kind: "zoom", rect: null });
  });

  it("rejects concurrent effects in both directions, including capture preparation", async () => {
    const { d, capture } = setup();
    let finish!: () => void;
    capture.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              image: "story-window-1.png",
              imageWidth: 1140,
              imageHeight: 840,
            });
        }),
    );
    const pending = d.window({ html: "hello" });
    await Promise.resolve();
    await Promise.resolve();
    await expect(d.transition("Next", async () => {})).rejects.toThrow(
      /overlap/,
    );
    finish();
    await pending;
    await d.transition("Next", async () => {
      await expect(d.window({ html: "hello" })).rejects.toThrow(/overlap/);
    });
  });
  it("releases overlap protection after an action fails", async () => {
    const { d, events } = setup();
    await expect(
      d.transition("Next", async () => {
        throw Error("Navigation failed");
      }),
    ).rejects.toThrow("Navigation failed");
    await expect(d.window({ html: "Retry" })).resolves.toBeUndefined();
    expect(events.some((event) => event.kind === "transition")).toBe(false);
  });
});

describe("isolated window capture", () => {
  it("converts CSS rectangles to image pixels", () => {
    expect(imageRect({ x: 10, y: 20, width: 100, height: 40 }, 1.5)).toEqual({
      x: 15,
      y: 30,
      width: 150,
      height: 60,
    });
  });
  it.each([
    { content: 1200, options: {}, expected: 1200 },
    { content: 2000, options: {}, expected: 1400 },
    { content: 2000, options: { maxHeight: 1000 }, expected: 1000 },
    { content: 1200, options: { height: 900 }, expected: 900 },
    { content: 300, options: {}, expected: 300 },
  ])("captures full content $content with $options", async ({ content, options, expected }) => {
    const page = { setContent: vi.fn(async () => {}), evaluate: vi.fn(async () => content),
      setViewportSize: vi.fn(async () => {}), screenshot: vi.fn(async () => {}) };
    const context = { newPage: vi.fn(async () => page), close: vi.fn(async () => {}) };
    const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => {}) };
    const capture = new WindowCapture({ deviceScaleFactor: 1.5, outputDirectory: "/tmp",
      launch: vi.fn(async () => browser as unknown as Browser) });
    const asset = await capture.render({ html: "content" }, { width: 760, ...options }, "height-test.png");
    expect(asset).toMatchObject({ imageWidth: 1140, imageHeight: expected * 1.5 });
    expect(page.setViewportSize).toHaveBeenLastCalledWith({ width: 760, height: expected });
    await capture.close();
  });
  it("launches headless once, uses separate contexts, and closes resources", async () => {
    const locator = {
      waitFor: vi.fn(async () => {}),
      scrollIntoViewIfNeeded: vi.fn(async () => {}),
      boundingBox: vi.fn(async () => ({
        x: 10,
        y: 20,
        width: 100,
        height: 40,
      })),
    };
    const insetPage = {
      setContent: vi.fn(async () => {}),
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => 1200),
      setViewportSize: vi.fn(async () => {}),
      locator: vi.fn(() => locator),
      screenshot: vi.fn(async () => {}),
    };
    const context = {
      newPage: vi.fn(async () => insetPage),
      close: vi.fn(async () => {}),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => {}),
    };
    const launch = vi.fn(async () => browser as unknown as Browser);
    const capture = new WindowCapture({
      deviceScaleFactor: 1.5,
      executablePath: "/chromium",
      outputDirectory: "/tmp",
      launch,
    });
    const result = await capture.render(
      { html: "hello" },
      { width: 760, height: 560, highlight: "button" },
      "story-window-1.png",
    );
    await capture.render(
      { url: "https://example.org" },
      { width: 400, height: 300 },
      "story-window-2.png",
    );
    expect(launch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ headless: true, executablePath: "/chromium" }),
    );
    expect(browser.newContext).toHaveBeenNthCalledWith(1, {
      viewport: { width: 760, height: 560 },
      deviceScaleFactor: 1.5,
    });
    expect(result).toEqual({
      image: "story-window-1.png",
      imageWidth: 1140,
      imageHeight: 840,
      highlight: { x: 15, y: 30, width: 150, height: 60 },
    });
    expect(insetPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/tmp/story-window-1.png",
        scale: "device",
      }),
    );
    expect(context.close).toHaveBeenCalledTimes(2);
    await capture.close();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
