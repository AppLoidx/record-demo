import type { Browser, Page } from "@playwright/test";
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
      expect.objectContaining({ width: 760, height: 560 }),
      "story-window-1.png",
    );
    await d.close();
    expect(capture.close).toHaveBeenCalledOnce();
  });
  it.each([100, 1200])(
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
          outMs: 380,
          cardMs: Math.max(700, actionMs),
          inMs: 460,
        },
        { t: 380 + Math.max(700, actionMs) / 2, kind: "role", label: "Ops" },
      ]);
      d.role("Customer");
      expect(events.at(-1)).toMatchObject({
        t: 380 + Math.max(700, actionMs) + 460,
        kind: "role",
        label: "Customer",
      });
    },
  );
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
      evaluate: vi.fn(async () => {}),
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
