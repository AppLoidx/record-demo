import { chromium, test, type Locator, type Page } from "@playwright/test";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moveCursor, type CursorPoint } from "./cursor";
import {
  serializeTimeline,
  type Rect,
  type Timeline,
  type TimelineEvent,
} from "./timeline";

const CAPTURE_FPS = 30;
export const CLAPPERBOARD_COLOR = "#00ff00";
const EXPECTED_VIEWPORT = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1.5,
} as const;
const DEFAULT_CAPTION_DURATION_MS = 2_600;
const DEFAULT_ZOOM_DURATION_MS = 1_200;
const DEFAULT_SPOTLIGHT_DURATION_MS = 450;
const DEFAULT_SPOTLIGHT_HOLD_MS = 2_600;
const CENTER_TOLERANCE_PX = 8;
const ACTION_TIMEOUT_MS = 5_000;
// Bound stabilization so perpetually animated targets cannot deadlock a recording.
const TARGET_STABILITY_INTERVAL_MS = 150;
const TARGET_STABILITY_TIMEOUT_MS = 1_200;
const demosRoot = fileURLToPath(new URL("..", import.meta.url));
const outputPath = path.join(demosRoot, "out", "timeline.json");
const appUrl = process.env.DEMO_TARGET_URL ?? "https://example.org";
const baseUrl = new URL(appUrl).origin;

type Viewport = Timeline["viewport"];
type StoryboardAction = (page: Page) => Promise<void>;
type ClientError = { source: "console" | "pageerror"; message: string };

export function unionRects(rects: Rect[], padding = 0): Rect {
  if (rects.length === 0) {
    throw new Error("Cannot measure an empty locator array");
  }
  if (rects.length === 1) {
    const rect = rects[0]!;
    // Preserve the original arithmetic so single-locator timelines do not gain floating-point drift.
    return {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  };
}

export class Storyboard {
  private readonly events: TimelineEvent[] = [];
  private readonly pageHistory: Page[] = [];
  private cursor: CursorPoint;
  private startedAt = 0;
  private started = false;

  constructor(
    private readonly name: string,
    private page: Page,
    private readonly viewport: Viewport,
  ) {
    this.cursor = {
      x: viewport.width / 2,
      y: viewport.height / 2,
    };
  }

  start() {
    this.startedAt = performance.now();
  }

  /**
   * Flashes the clapperboard and establishes t=0 lazily, on the first step.
   * Seeding runs before this, so the video opens on real data, never on a
   * loading skeleton.
   */
  async ensureStarted() {
    if (this.started) return;
    this.started = true;
    await flashClapperboard(this.page, this);
    await this.placeCursor();
    // Opening beat: let the viewer read the screen before anything moves.
    await this.page.waitForTimeout(1_400);
  }

  async placeCursor() {
    await this.page.mouse.move(this.cursor.x, this.cursor.y);
    this.events.push({ t: this.now(), kind: "cursor", ...this.cursor });
  }

  async seed(action: StoryboardAction) {
    if (this.started) {
      throw new Error("seed() must run before the first step");
    }
    await action(this.page);
  }

  async step(
    text: string,
    action: StoryboardAction,
    captionDurationMs = DEFAULT_CAPTION_DURATION_MS,
  ) {
    await this.ensureStarted();
    this.caption(text, captionDurationMs);
    await action(this.page);
  }

  caption(text: string, durationMs = DEFAULT_CAPTION_DURATION_MS) {
    this.events.push({
      t: this.now(),
      kind: "caption",
      text,
      durationMs,
    });
  }

  async outro(title: string, durationMs = 2_400) {
    this.events.push({
      t: this.now(),
      kind: "outro",
      title,
      durationMs,
    });
    await this.page.waitForTimeout(durationMs);
  }

  async click(locator: Locator) {
    await locator.waitFor({ state: "visible", timeout: ACTION_TIMEOUT_MS });
    await locator.scrollIntoViewIfNeeded();
    const target = await locator.boundingBox();
    if (!target) {
      throw new Error("Cannot click an element without a bounding box");
    }

    const centre = {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    };
    await moveCursor(this.page, this.cursor, centre, (point) => {
      this.events.push({ t: this.now(), kind: "cursor", ...point });
    });
    this.cursor = centre;

    await locator.click({
      position: {
        x: target.width / 2,
        y: target.height / 2,
      },
    });
    this.events.push({ t: this.now(), kind: "click", ...centre });
  }

  async activatePage(page: Page) {
    if (page === this.page) return;
    this.pageHistory.push(this.page);
    this.page = page;
    await page.waitForLoadState("domcontentloaded");
    await page.bringToFront();
    await page.mouse.move(this.cursor.x, this.cursor.y);
  }

  async closeActivePage() {
    const previousPage = this.pageHistory.pop();
    if (!previousPage) {
      throw new Error("Cannot close the only page in a demo");
    }

    await this.page.close();
    this.page = previousPage;
    await previousPage.bringToFront();
    await previousPage.mouse.move(this.cursor.x, this.cursor.y);
    return previousPage;
  }

  async zoomTo(
    target: Locator | Locator[],
    options: {
      durationMs?: number;
      padding?: number;
      scroll?: "nearest" | "center";
    } = {},
  ) {
    const {
      durationMs = DEFAULT_ZOOM_DURATION_MS,
      padding = 0,
      scroll = "nearest",
    } = options;
    // Zoom rects may overflow the viewport: the camera pipeline expands them
    // to the frame's aspect ratio and clamps translation, so containment is
    // not required (the opening wide alert crop relies on this).
    const rect = await this.measureTarget(target, {
      padding,
      scroll,
      containment: "none",
      missingBoxMessage: "Cannot zoom to an element without a bounding box",
    });

    this.events.push({
      t: this.now(),
      kind: "zoom",
      rect,
      durationMs,
    });
  }

  async spotlight(
    target: Locator | Locator[],
    options: {
      padding?: number;
      holdMs?: number;
      durationMs?: number;
    } = {},
  ) {
    const {
      padding = 12,
      holdMs = DEFAULT_SPOTLIGHT_HOLD_MS,
      durationMs = DEFAULT_SPOTLIGHT_DURATION_MS,
    } = options;
    // A spotlight cutout drawn off-viewport is silently invisible, so
    // containment is enforced here (unlike zoom rects).
    const rect = await this.measureTarget(target, {
      padding,
      scroll: "nearest",
      containment: "viewport",
      missingBoxMessage: "Cannot spotlight an element without a bounding box",
    });

    this.events.push({
      t: this.now(),
      kind: "spotlight",
      rect,
      durationMs,
      holdMs,
    });
  }

  spotlightOff() {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]!;
      if (event.kind !== "spotlight") continue;

      event.holdMs = Math.max(0, this.now() - event.t - event.durationMs);
      return;
    }

    throw new Error("Cannot turn off a spotlight before one has started");
  }

  zoomOut(durationMs = DEFAULT_ZOOM_DURATION_MS) {
    this.events.push({
      t: this.now(),
      kind: "zoom",
      rect: null,
      durationMs,
    });
  }

  async hold(durationMs: number) {
    await this.page.waitForTimeout(durationMs);
  }

  /**
   * Type with a humanized cadence. Constant keyboard.type delays read robotic
   * on video; this jitters per-character delays deterministically (hash of the
   * character index, so reruns capture identical timings) and lingers slightly
   * after word boundaries.
   */
  async type(text: string, baseDelayMs = 55) {
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]!;
      await this.page.keyboard.type(character);
      const jitter = ((index * 2654435761) % 97) / 97;
      let delay = baseDelayMs * (0.55 + jitter * 1.1);
      if (" .@-_".includes(character)) delay += baseDelayMs * 0.8;
      await this.page.waitForTimeout(delay);
    }
  }

  /**
   * Wait until a locator stays visible across two consecutive checks. Views
   * that re-fetch after their first paint briefly blank; a plain waitFor
   * resolves on the first paint and lets an outcome caption fire over the
   * blank re-render.
   */
  async settle(locator: Locator, timeoutMs = 5_000) {
    const startedAt = Date.now();
    for (;;) {
      await locator.waitFor({ state: "visible", timeout: timeoutMs });
      await this.page.waitForTimeout(300);
      if (await locator.isVisible()) return;
      if (Date.now() - startedAt >= timeoutMs) return;
    }
  }

  async writeTimeline() {
    const timeline: Timeline = {
      version: 1,
      name: this.name,
      viewport: this.viewport,
      capture: { fps: CAPTURE_FPS, syncFlashAt: 0 },
      durationMs: this.now(),
      events: this.events,
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serializeTimeline(timeline), "utf8");
  }

  private async measureTarget(
    target: Locator | Locator[],
    options: {
      padding: number;
      scroll?: "nearest" | "center";
      containment: "viewport" | "none";
      missingBoxMessage: string;
    },
  ) {
    const locators = Array.isArray(target) ? target : [target];
    if (locators.length === 0) {
      throw new Error("Cannot measure an empty locator array");
    }

    for (const locator of locators) {
      await locator.waitFor({ state: "visible" });
    }

    if (options.scroll === "nearest") {
      await locators[0]!.scrollIntoViewIfNeeded();
    } else if (options.scroll === "center") {
      await scrollLocatorToCenter(locators[0]!);
    }

    if (options.scroll === "center") {
      const rect = unionRects(
        await measureLocatorBoxes(locators, options.missingBoxMessage),
        options.padding,
      );
      const offset = rect.y + rect.height / 2 - this.viewport.height / 2;
      if (
        Math.abs(offset) > CENTER_TOLERANCE_PX &&
        (await scrollPageByIfPossible(locators[0]!, offset))
      ) {
        await waitForLocatorToSettle(locators[0]!);
      }
    }

    const rect = await measureStableTargetRect(
      this.page,
      locators,
      options.padding,
      options.missingBoxMessage,
    );

    if (
      options.containment === "none" ||
      isRectInsideViewport(rect, this.viewport)
    ) {
      return rect;
    }

    const scrollCapacity = await readPageScrollCapacity(locators[0]!);
    const topOverflow = Math.max(0, -rect.y);
    const bottomOverflow = Math.max(
      0,
      rect.y + rect.height - this.viewport.height,
    );
    const verticalOverflowIsUnavoidable =
      (topOverflow === 0 || scrollCapacity.up < topOverflow) &&
      (bottomOverflow === 0 || scrollCapacity.down < bottomOverflow);
    const overflowsHorizontally =
      rect.x < 0 || rect.x + rect.width > this.viewport.width;

    if (verticalOverflowIsUnavoidable && !overflowsHorizontally) {
      return clampRectVertically(rect, this.viewport.height);
    }

    throw new Error("Cannot measure a padded target outside the demo viewport");
  }

  private now() {
    return Math.max(0, Math.round(performance.now() - this.startedAt));
  }
}

async function scrollLocatorToCenter(locator: Locator) {
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  await waitForLocatorToSettle(locator);
}

async function waitForLocatorToSettle(locator: Locator) {
  await locator.evaluate(async (element) => {
    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      let previousTop = element.getBoundingClientRect().top;
      let stablePolls = 0;

      const poll = () => {
        const top = element.getBoundingClientRect().top;
        stablePolls = top === previousTop ? stablePolls + 1 : 0;
        previousTop = top;

        if (stablePolls >= 2 || performance.now() - startedAt >= 1_500) {
          resolve();
          return;
        }

        window.setTimeout(poll, 100);
      };

      window.setTimeout(poll, 100);
    });
  });
}

async function measureLocatorBoxes(
  locators: Locator[],
  missingBoxMessage: string,
) {
  const boxes: Rect[] = [];
  for (const locator of locators) {
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(missingBoxMessage);
    }
    boxes.push(box);
  }
  return boxes;
}

async function measureStableTargetRect(
  page: Page,
  locators: Locator[],
  padding: number,
  missingBoxMessage: string,
) {
  let previous = unionRects(
    await measureLocatorBoxes(locators, missingBoxMessage),
    padding,
  );
  const attempts = Math.ceil(
    TARGET_STABILITY_TIMEOUT_MS / TARGET_STABILITY_INTERVAL_MS,
  );

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.waitForTimeout(TARGET_STABILITY_INTERVAL_MS);
    const current = unionRects(
      await measureLocatorBoxes(locators, missingBoxMessage),
      padding,
    );
    if (rectsAreIdentical(previous, current)) return current;
    previous = current;
  }

  return previous;
}

function rectsAreIdentical(left: Rect, right: Rect) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

async function scrollPageByIfPossible(locator: Locator, offset: number) {
  return await locator.evaluate((_element, scrollOffset) => {
    const maximumScrollY = Math.max(
      0,
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ) - window.innerHeight,
    );
    const nextScrollY = Math.min(
      maximumScrollY,
      Math.max(0, window.scrollY + scrollOffset),
    );
    if (nextScrollY === window.scrollY) return false;

    window.scrollBy({ top: scrollOffset, behavior: "smooth" });
    return true;
  }, offset);
}

async function readPageScrollCapacity(locator: Locator) {
  return await locator.evaluate(() => {
    const maximumScrollY = Math.max(
      0,
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ) - window.innerHeight,
    );
    return {
      up: window.scrollY,
      down: maximumScrollY - window.scrollY,
    };
  });
}

function isRectInsideViewport(rect: Rect, viewport: Viewport) {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= viewport.width &&
    rect.y + rect.height <= viewport.height
  );
}

function clampRectVertically(rect: Rect, viewportHeight: number): Rect {
  const top = Math.max(0, rect.y);
  const bottom = Math.min(viewportHeight, rect.y + rect.height);
  return {
    ...rect,
    y: top,
    height: Math.max(0, bottom - top),
  };
}

async function readAndAssertViewport(page: Page): Promise<Viewport> {
  return await page.evaluate((expected) => {
    const actual = {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio,
    };

    if (
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      actual.deviceScaleFactor !== expected.deviceScaleFactor
    ) {
      throw new Error(
        "Invalid demo viewport: expected " +
          `${expected.width}x${expected.height} at DSF ${expected.deviceScaleFactor}; ` +
          `received innerWidth=${actual.width}, innerHeight=${actual.height}, devicePixelRatio=${actual.deviceScaleFactor}`,
      );
    }

    return actual;
  }, EXPECTED_VIEWPORT);
}

async function flashClapperboard(page: Page, storyboard: Storyboard) {
  storyboard.start();
  await page.evaluate((color) => {
    const sentinel = document.createElement("div");
    sentinel.dataset.demoClapperboard = "true";
    Object.assign(sentinel.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: color,
      pointerEvents: "none",
    });
    document.documentElement.append(sentinel);
  }, CLAPPERBOARD_COLOR);
  // 4 frames: cold-compile CPU load can drop capture frames, and the detector
  // needs at least 2 consecutive sentinel frames to survive.
  await page.waitForTimeout(Math.ceil((4 * 1_000) / CAPTURE_FPS));
  await page.evaluate(() => {
    document.querySelector("[data-demo-clapperboard]")?.remove();
  });
}

async function runStoryboard(
  name: string,
  action: (storyboard: Storyboard) => Promise<void>,
) {
  const executablePath = await resolveChromiumExecutable();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "record-demo-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    baseURL: baseUrl,
    viewport: null,
    args: [
      `--app=${appUrl}`,
      "--window-position=0,0",
      "--window-size=1920,1080",
      "--force-device-scale-factor=1.5",
      "--test-type",
      "--disable-infobars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const clientErrors: ClientError[] = [];

  // The app's router progress bar (a 4px black strip pinned to the top) reads
  // as a capture glitch on video. Hide it in every document this context loads,
  // including full-page navigations mid-demo.
  await context.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent =
        "div.fixed.top-0.z-50.h-1 { display: none !important; }";
      document.head.append(style);
    };
    if (document.readyState === "loading") {
      addEventListener("DOMContentLoaded", hide);
    } else {
      hide();
    }
  });

  try {
    const page = context.pages()[0];
    if (!page) throw new Error("Chromium app mode did not create a page");
    captureClientErrors(page, clientErrors);
    await page.waitForLoadState("domcontentloaded");

    const viewport = await readAndAssertViewport(page);
    await page.waitForLoadState("load");
    await page.waitForTimeout(250);
    const storyboard = new Storyboard(name, page, viewport);

    try {
      await action(storyboard);
    } finally {
      await storyboard.writeTimeline();
    }
  } catch (error) {
    throw storyboardFailure(error, clientErrors);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

function captureClientErrors(page: Page, errors: ClientError[]) {
  page.on("pageerror", (error) => {
    errors.push({
      source: "pageerror",
      message: error.stack ?? error.message,
    });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.push({ source: "console", message: message.text() });
  });
}

function storyboardFailure(error: unknown, clientErrors: ClientError[]) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostics =
    clientErrors.length > 0
      ? clientErrors
          .map(({ source, message }) => `[${source}] ${message}`)
          .join("\n")
      : "(none captured)";

  return new Error(
    `${message}\n\nCaptured browser client errors:\n${diagnostics}`,
    { cause: error },
  );
}

async function resolveChromiumExecutable() {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    path.join(
      homedir(),
      ".cache",
      "ms-playwright",
      "chromium-1217",
      "chrome-linux64",
      "chrome",
    );

  try {
    await access(executablePath, constants.X_OK);
  } catch {
    throw new Error(
      `Chromium executable is unavailable at "${executablePath}". ` +
        "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an executable Chromium binary.",
    );
  }

  return executablePath;
}

export function demo(
  name: string,
  action: (storyboard: Storyboard) => Promise<void>,
) {
  test(name, async () => {
    await runStoryboard(process.env.DEMO_NAME ?? name, action);
  });
}
