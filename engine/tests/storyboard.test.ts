import type { BrowserContext, Locator, Page } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyStorageState,
  launchStoryboardPage,
  Storyboard,
  unionRects,
} from "../lib/storyboard";
import type { Rect, TimelineEvent } from "../lib/timeline";

function storyboardEvents(storyboard: Storyboard) {
  return (
    storyboard as unknown as {
      events: TimelineEvent[];
    }
  ).events;
}

function locatorWithBoxes(boxes: Rect[]) {
  let measurement = 0;
  return {
    waitFor: vi.fn(async () => {}),
    scrollIntoViewIfNeeded: vi.fn(async () => {}),
    boundingBox: vi.fn(async () => {
      const box = boxes[Math.min(measurement, boxes.length - 1)]!;
      measurement += 1;
      return box;
    }),
    evaluate: vi.fn(async () => undefined),
  } as unknown as Locator;
}

function createStoryboard() {
  const page = {
    waitForTimeout: vi.fn(async () => {}),
  } as unknown as Page;
  const storyboard = new Storyboard("stable-target", page, {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1.5,
  });

  return { page, storyboard };
}

describe("applyStorageState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("adds only cookies whose domain matches the target hostname", async () => {
    const addCookies = vi.fn(async () => {});
    const context = {
      addCookies,
      addInitScript: vi.fn(async () => {}),
    } as unknown as Pick<BrowserContext, "addCookies" | "addInitScript">;
    const matchingCookies = [
      {
        name: "host-session",
        value: "host",
        domain: "app.example.org",
        path: "/",
      },
      {
        name: "parent-session",
        value: "parent",
        domain: ".example.org",
        path: "/",
      },
    ];

    await applyStorageState(
      context,
      {
        cookies: [
          ...matchingCookies,
          {
            name: "unrelated-session",
            value: "unrelated",
            domain: "other.org",
            path: "/",
          },
          {
            name: "lookalike-session",
            value: "lookalike",
            domain: "notexample.org",
            path: "/",
          },
        ],
      },
      "https://app.example.org/dashboard",
    );

    expect(addCookies).toHaveBeenCalledWith(matchingCookies);
  });

  it("restores matching localStorage once per tab", async () => {
    const setItem = vi.fn();
    const sessionValues = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { origin: "https://example.org" },
      localStorage: { setItem },
      sessionStorage: {
        getItem: vi.fn((name: string) => sessionValues.get(name) ?? null),
        setItem: vi.fn((name: string, value: string) => {
          sessionValues.set(name, value);
        }),
      },
    });
    let initScript:
      | ((origins: Array<{
          origin: string;
          localStorage?: Array<{ name: string; value: string }>;
        }>) => void)
      | undefined;
    let initScriptArg:
      | Array<{
          origin: string;
          localStorage?: Array<{ name: string; value: string }>;
        }>
      | undefined;
    const addCookies = vi.fn(async () => {});
    const addInitScript = vi.fn(async (script, arg) => {
      initScript = script;
      initScriptArg = arg;
    });
    const context = {
      addCookies,
      addInitScript,
    } as unknown as Pick<BrowserContext, "addCookies" | "addInitScript">;
    const origins = [
      {
        origin: "https://other.example.org",
        localStorage: [{ name: "ignored", value: "other" }],
      },
      {
        origin: "https://example.org",
        localStorage: [
          { name: "access-token", value: "test-token" },
          { name: "theme", value: "dark" },
        ],
      },
    ];

    await applyStorageState(
      context,
      { origins },
      "https://example.org/dashboard",
    );
    initScript?.(initScriptArg ?? []);
    initScript?.(initScriptArg ?? []);

    expect(addInitScript).toHaveBeenCalledOnce();
    expect(setItem.mock.calls).toEqual([
      ["access-token", "test-token"],
      ["theme", "dark"],
    ]);
    expect(window.sessionStorage.setItem).toHaveBeenCalledOnce();
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      "__demo_storage_restored",
      "true",
    );
  });

  it("suppresses storage access errors from the init script", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://example.org" },
      sessionStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      get localStorage() {
        throw new Error("Storage is unavailable");
      },
    });
    let initScript:
      | ((origins: Array<{
          origin: string;
          localStorage?: Array<{ name: string; value: string }>;
        }>) => void)
      | undefined;
    const context = {
      addCookies: vi.fn(async () => {}),
      addInitScript: vi.fn(async (script) => {
        initScript = script;
      }),
    } as unknown as Pick<BrowserContext, "addCookies" | "addInitScript">;

    await applyStorageState(
      context,
      {
        origins: [
          {
            origin: "https://example.org",
            localStorage: [{ name: "token", value: "secret" }],
          },
        ],
      },
      "https://example.org",
    );

    expect(() =>
      initScript?.([
        {
          origin: "https://example.org",
          localStorage: [{ name: "token", value: "secret" }],
        },
      ]),
    ).not.toThrow();
  });
});

describe("launchStoryboardPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("launches the app window on the target, applies env state, then re-navigates", async () => {
    vi.stubEnv("DEMO_TARGET_URL", "https://app.example.org/dashboard");
    vi.stubEnv("DEMO_STORAGE_STATE_PATH", "/state/account.json");
    const calls: string[] = [];
    const page = {
      goto: vi.fn(async (url: string) => {
        calls.push(`goto:${url}`);
      }),
      on: vi.fn(),
    } as unknown as Page;
    const context = {
      addCookies: vi.fn(async () => {
        calls.push("addCookies");
      }),
      addInitScript: vi.fn(async () => {
        calls.push("addInitScript");
      }),
      pages: vi.fn(() => {
        calls.push("pages");
        return [page];
      }),
    } as unknown as BrowserContext;

    const result = await launchStoryboardPage(
      "/chromium",
      "/profile",
      {
        launchPersistentContext: vi.fn(async (_userDataDir, options) => {
          const appArgument = options.args?.find((arg: string) =>
            arg.startsWith("--app="),
          );
          calls.push(`launch:${appArgument}`);
          return context;
        }),
        readStorageState: vi.fn(async () =>
          JSON.stringify({
            cookies: [
              {
                name: "session",
                value: "test-session",
                domain: ".example.org",
                path: "/",
              },
            ],
            origins: [],
          }),
        ),
      },
    );

    expect(result).toEqual({ clientErrors: [], context, page });
    expect(calls).toEqual([
      "launch:--app=https://app.example.org/dashboard",
      "addCookies",
      "addInitScript",
      "addInitScript",
      "pages",
      "goto:https://app.example.org/dashboard",
    ]);
  });
});

describe("unionRects", () => {
  it("preserves single-box dimensions without union arithmetic", () => {
    expect(
      unionRects([{ x: 100.1, y: 200.2, width: 33.3, height: 44.4 }], 0),
    ).toEqual({ x: 100.1, y: 200.2, width: 33.3, height: 44.4 });
  });

  it("unions multiple boxes before applying padding", () => {
    expect(
      unionRects(
        [
          { x: 100, y: 200, width: 80, height: 40 },
          { x: 240, y: 280, width: 120, height: 60 },
        ],
        16,
      ),
    ).toEqual({ x: 84, y: 184, width: 292, height: 172 });
  });
});

describe("Storyboard.spotlightOff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rewrites the last spotlight hold so its fade-out starts now", () => {
    vi.spyOn(performance, "now").mockReturnValue(2_000);
    const storyboard = new Storyboard("spotlight-off", {} as Page, {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1.5,
    });
    const events = storyboardEvents(storyboard);
    events.push(
      {
        t: 100,
        kind: "spotlight",
        rect: { x: 100, y: 100, width: 200, height: 100 },
        durationMs: 300,
        holdMs: 20_000,
      },
      { t: 400, kind: "caption", text: "Keep going", durationMs: 500 },
      {
        t: 500,
        kind: "spotlight",
        rect: { x: 300, y: 300, width: 200, height: 100 },
        durationMs: 450,
        holdMs: 20_000,
      },
    );

    storyboard.spotlightOff();

    expect(events[0]).toMatchObject({ holdMs: 20_000 });
    expect(events[2]).toMatchObject({ holdMs: 1_050 });
  });

  it("throws when no spotlight has started", () => {
    const storyboard = new Storyboard("spotlight-off", {} as Page, {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1.5,
    });

    expect(() => storyboard.spotlightOff()).toThrow(
      "Cannot turn off a spotlight before one has started",
    );
  });
});

describe("Storyboard.outro", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds the closing event before waiting for its wall time", async () => {
    vi.spyOn(performance, "now").mockReturnValue(1_250);
    const { page, storyboard } = createStoryboard();

    await storyboard.outro("Any website. One storyboard.");

    expect(storyboardEvents(storyboard)).toEqual([
      {
        t: 1_250,
        kind: "outro",
        title: "Any website. One storyboard.",
        durationMs: 2_400,
      },
    ]);
    expect(page.waitForTimeout).toHaveBeenCalledOnce();
    expect(page.waitForTimeout).toHaveBeenCalledWith(2_400);
  });
});

describe("Storyboard target measurement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["x", "y", "width", "height"] as const)(
    "waits for the %s coordinate to repeat after nearest scrolling",
    async (field) => {
      const { page, storyboard } = createStoryboard();
      const initial = { x: 100, y: 200, width: 300, height: 120 };
      const settled = { ...initial, [field]: initial[field] + 20 };
      const target = locatorWithBoxes([initial, settled, settled]);

      await storyboard.zoomTo(target);

      expect(storyboardEvents(storyboard).at(-1)).toMatchObject({
        kind: "zoom",
        rect: settled,
      });
      expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
      expect(page.waitForTimeout).toHaveBeenCalledWith(150);
    },
  );

  it("stabilizes every locator after centered scrolling", async () => {
    const { page, storyboard } = createStoryboard();
    const first = locatorWithBoxes([
      { x: 100, y: 490, width: 200, height: 100 },
      { x: 100, y: 490, width: 200, height: 100 },
      { x: 100, y: 490, width: 200, height: 100 },
    ]);
    const second = locatorWithBoxes([
      { x: 320, y: 490, width: 160, height: 100 },
      { x: 320, y: 490, width: 160, height: 100 },
      { x: 360, y: 490, width: 160, height: 100 },
      { x: 360, y: 490, width: 160, height: 100 },
    ]);

    await storyboard.zoomTo([first, second], { scroll: "center" });

    expect(storyboardEvents(storyboard).at(-1)).toMatchObject({
      kind: "zoom",
      rect: { x: 100, y: 490, width: 420, height: 100 },
    });
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
  });

  it("uses the last measurement when a spotlight target never settles", async () => {
    const { page, storyboard } = createStoryboard();
    const boxes = Array.from({ length: 9 }, (_, index) => ({
      x: 100,
      y: 200 + index,
      width: 300,
      height: 120,
    }));
    const target = locatorWithBoxes(boxes);

    await storyboard.spotlight(target, { padding: 0 });

    expect(storyboardEvents(storyboard).at(-1)).toMatchObject({
      kind: "spotlight",
      rect: boxes.at(-1),
    });
    expect(page.waitForTimeout).toHaveBeenCalledTimes(8);
  });
});
