import type { CDPSession, Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { frameTimeMs, type CapturedFrame } from "./frames";

// 2880x1620 = the 1920x1080 viewport at device scale factor 1.5. Chrome only
// emits frames at this size when launched with --force-device-scale-factor.
const SCREENCAST_OPTIONS = {
  format: "jpeg",
  quality: 92,
  maxWidth: 2880,
  maxHeight: 1620,
  everyNthFrame: 1,
} as const;

type ScreencastFrameEvent = {
  data: string;
  sessionId: number;
  metadata: { timestamp?: number };
};

/**
 * Records the active page through the Chrome DevTools Protocol screencast:
 * Chrome hands over its own composited frames with paint timestamps, so no
 * display server or screen grabber is involved and the timestamps line up
 * with the storyboard clock directly.
 */
export class Screencast {
  private session: CDPSession | undefined;
  private readonly frames: CapturedFrame[] = [];
  private readonly writes = new Set<Promise<void>>();
  private nextIndex = 0;
  private originEpochMs = 0;

  constructor(private readonly framesDir: string) {}

  async start(page: Page, originEpochMs: number) {
    this.originEpochMs = originEpochMs;
    await rm(this.framesDir, { recursive: true, force: true });
    await mkdir(this.framesDir, { recursive: true });
    await this.attach(page);
  }

  /** Moves the capture to another page, e.g. a popup the demo switched to. */
  async attach(page: Page) {
    await this.detach();
    const session = await page.context().newCDPSession(page);
    this.session = session;
    session.on("Page.screencastFrame", (frame: ScreencastFrameEvent) =>
      this.onFrame(session, frame),
    );
    await session.send("Page.startScreencast", SCREENCAST_OPTIONS);
    await forceRepaint(page);
  }

  async stop(): Promise<CapturedFrame[]> {
    await this.detach();
    await Promise.all(this.writes);
    return [...this.frames].sort((a, b) => a.t - b.t);
  }

  private onFrame(session: CDPSession, frame: ScreencastFrameEvent) {
    const receivedAtEpochMs = Date.now();
    // Ack first: Chrome withholds the next frame until this one is acked.
    void session
      .send("Page.screencastFrameAck", { sessionId: frame.sessionId })
      .catch(() => {});
    const file = `${String(this.nextIndex++).padStart(6, "0")}.jpg`;
    const t = frameTimeMs(
      frame.metadata.timestamp,
      this.originEpochMs,
      receivedAtEpochMs,
    );
    const write = writeFile(
      path.join(this.framesDir, file),
      Buffer.from(frame.data, "base64"),
    ).then(() => {
      this.frames.push({ file, t });
    });
    this.writes.add(write);
    void write.finally(() => this.writes.delete(write));
  }

  private async detach() {
    const session = this.session;
    if (!session) return;
    this.session = undefined;
    await session.send("Page.stopScreencast").catch(() => {});
    await session.detach().catch(() => {});
  }
}

/**
 * Chrome only sends a screencast frame when the page repaints. Toggle an
 * invisible pixel for two animation frames so a static page still yields a
 * first frame right after the capture starts.
 */
export async function forceRepaint(page: Page) {
  await page
    .evaluate(async () => {
      const pixel = document.createElement("div");
      Object.assign(pixel.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: "1px",
        height: "1px",
        background: "rgba(0, 0, 0, 0.004)",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.documentElement.append(pixel);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      pixel.remove();
    })
    .catch(() => {});
}
