import { chromium, type Browser } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoTheme } from "../remotion/theme.ts";
import type { Rect, WindowEvent } from "./timeline";

export type WindowSource = { html: string } | { url: string };
export type WindowCaptureOptions = {
  width: number;
  maxHeight?: number;
  /** @deprecated Alias for maxHeight. */
  height?: number;
  highlight?: string;
};
export type WindowAsset = Pick<
  WindowEvent,
  "image" | "imageWidth" | "imageHeight" | "highlight"
>;
export type WindowRenderer = {
  render(
    source: WindowSource,
    options: WindowCaptureOptions,
    image: string,
  ): Promise<WindowAsset>;
  close(): Promise<void>;
};

export function imageRect(rect: Rect, deviceScaleFactor: number): Rect {
  return {
    x: rect.x * deviceScaleFactor,
    y: rect.y * deviceScaleFactor,
    width: rect.width * deviceScaleFactor,
    height: rect.height * deviceScaleFactor,
  };
}

/** This browser never shares the captured app's page, context, or visible window. */
export class WindowCapture implements WindowRenderer {
  private browser?: Promise<Browser>;

  private readonly options: {
    deviceScaleFactor: number;
    executablePath?: string;
    outputDirectory?: string;
    launch?: typeof chromium.launch;
  };
  constructor(options: WindowCapture["options"]) {
    this.options = options;
  }

  async render(
    source: WindowSource,
    options: WindowCaptureOptions,
    image: string,
  ): Promise<WindowAsset> {
    this.browser ??= (this.options.launch ?? chromium.launch.bind(chromium))({
      headless: true,
      executablePath:
        this.options.executablePath ??
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        chromium.executablePath(),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const browser = await this.browser;
    const { width, highlight } = options;
    const maxHeight = options.maxHeight ?? options.height ?? demoTheme.window.maxCaptureHeight;
    const { deviceScaleFactor } = this.options;
    const context = await browser.newContext({
      viewport: { width, height: Math.min(maxHeight, demoTheme.window.measureHeight) },
      deviceScaleFactor,
    });
    try {
      const page = await context.newPage();
      if ("html" in source)
        await page.setContent(source.html, { waitUntil: "load" });
      else await page.goto(source.url, { waitUntil: "load" });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      // Settle finite CSS/Web Animations before measuring; screenshot's own
      // animations:"disabled" would otherwise move the target after its bbox.
      await page.evaluate(async () => {
        for (const animation of document.getAnimations()) {
          try {
            animation.finish();
          } catch {
            // Infinite animations have no finish; freeze their current pose.
            animation.pause();
          }
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      });
      let height = Math.min(maxHeight, demoTheme.window.measureHeight);
      const fitContent = async () => {
        // Full-height app shells often scroll inside a container instead of the
        // document. Expand those containers only in this isolated capture page.
        for (let pass = 0; pass < 8; pass += 1) {
          const contentHeight = await page.evaluate(() => {
            for (const element of document.querySelectorAll<HTMLElement>("*")) {
              if (/^(auto|scroll)$/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
                element.style.height = `${element.scrollHeight}px`;
                element.style.minHeight = `${element.scrollHeight}px`;
                element.style.maxHeight = "none";
                element.style.overflowY = "visible";
                element.scrollTop = 0;
              }
            }
            return Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
          });
          const nextHeight = Math.max(1, Math.min(maxHeight, Math.ceil(contentHeight)));
          if (nextHeight === height) return;
          height = nextHeight;
          await page.setViewportSize({ width, height });
          if (height === maxHeight) return;
        }
        // Layouts with 100vh plus a header keep growing as the viewport grows.
        // They hit the requested capture cap rather than silently clipping early.
        height = maxHeight;
        await page.setViewportSize({ width, height });
      };
      await fitContent();
      const target = highlight ? page.locator(highlight) : undefined;
      if (target) {
        await target.waitFor({ state: "visible" });
        await target.scrollIntoViewIfNeeded();
      }
      await page.evaluate(async () => {
        // Scrolling may activate lazy content. Only decode visible images;
        // offscreen lazy images have not started loading and decode can hang.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        await document.fonts.ready;
        const visible = Array.from(document.images).filter((image) => {
          const rect = image.getBoundingClientRect();
          return (
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth
          );
        });
        await Promise.all(
          visible.map((image) => image.decode().catch(() => {})),
        );
      });
      // Decoding visible images may grow the document after the first layout.
      await fitContent();
      if (target) await target.scrollIntoViewIfNeeded();
      let rect: Rect | undefined;
      if (target) {
        const box = await target.boundingBox();
        if (!box)
          throw new Error(
            "Cannot highlight a window element without a bounding box",
          );
        rect = imageRect(box, deviceScaleFactor);
      }
      const directory =
        this.options.outputDirectory ??
        fileURLToPath(new URL("../out/", import.meta.url));
      await mkdir(directory, { recursive: true });
      await page.screenshot({
        path: path.join(directory, image),
        type: "png",
        scale: "device",
        animations: "allow",
      });
      return {
        image,
        imageWidth: Math.round(width * deviceScaleFactor),
        imageHeight: Math.round(height * deviceScaleFactor),
        ...(rect ? { highlight: rect } : {}),
      };
    } finally {
      await context.close();
    }
  }

  async close() {
    if (this.browser) await (await this.browser).close();
  }
}
