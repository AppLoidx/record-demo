import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { cursorPositionFromPoints } from "../lib/cursor-position.ts";
import {
  parseTimeline,
  spotlightTotalDuration,
} from "../lib/timeline.ts";

// Static stretches at or above this duration read as dead air.
const DEAD_AIR_THRESHOLD_MS = 3_500;
// Cursor travel below this CSS-pixel distance still reads as static.
const DEAD_AIR_CURSOR_TRAVEL_PX = 40;
// A quiet final beat this short is intentional rather than dead air.
const DEAD_AIR_END_EXEMPTION_MS = 1_000;
const FPS = 60;
const FRAME_WIDTH = 2560;
const FRAME_HEIGHT = 1440;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error?.code !== "ERR_MODULE_NOT_FOUND" ||
        !specifier.startsWith(".") ||
        extname(specifier)
      ) {
        throw error;
      }
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { createCameraPath } = await import("../lib/camera.ts");

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function rateVerdict(value, passMaximum, warnMaximum) {
  if (value <= passMaximum) return "PASS";
  if (value <= warnMaximum) return "WARN";
  return "FAIL";
}

function worstVerdict(verdicts) {
  if (verdicts.includes("FAIL")) return "FAIL";
  if (verdicts.includes("WARN")) return "WARN";
  return "PASS";
}

function vectorMagnitude(vector) {
  return Math.hypot(vector.zoom, vector.panX, vector.panY);
}

function vectorDistance(left, right) {
  return Math.hypot(
    left.zoom - right.zoom,
    left.panX - right.panX,
    left.panY - right.panY,
  );
}

const stationaryVelocity = { zoom: 0, panX: 0, panY: 0 };

export function scoreCameraSeries(
  samples,
  moves,
  fps,
  baseScale,
  frameWidth,
) {
  const velocities = samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    const zoom = ((sample.scale - previous.scale) * fps) / baseScale;
    const panX = ((sample.translateX - previous.translateX) * fps) / frameWidth;
    const panY = ((sample.translateY - previous.translateY) * fps) / frameWidth;

    return {
      frame: index + 1,
      zoom,
      panX,
      panY,
      relativeZoomRate: Math.abs(zoom),
      panFrameWidthsPerSecond: Math.hypot(panX, panY),
    };
  });
  const relativeZoomRates = velocities.map(
    (velocity) => velocity.relativeZoomRate,
  );
  const panFrameRates = velocities.map(
    (velocity) => velocity.panFrameWidthsPerSecond,
  );
  const relativeZoomRateMax = Math.max(0, ...relativeZoomRates);
  const panFrameRateMax = Math.max(0, ...panFrameRates);

  const perMove = moves.map((move) => {
    const endFrame = move.startFrame + move.durationFrames;
    const active = velocities.filter(
      (velocity) =>
        velocity.frame > move.startFrame && velocity.frame <= endFrame,
    );
    const magnitudes = active.map(vectorMagnitude);
    const peakVelocity = Math.max(0, ...magnitudes);
    const edgeFrames = Math.max(1, Math.ceil(active.length * 0.1));
    const startEdgeVelocity = Math.max(
      0,
      ...active.slice(0, edgeFrames).map(vectorMagnitude),
    );
    const endEdgeVelocity = Math.max(
      0,
      ...active.slice(-edgeFrames).map(vectorMagnitude),
    );
    const startEdgeRatio =
      peakVelocity === 0 ? 0 : startEdgeVelocity / peakVelocity;
    const endEdgeRatio =
      peakVelocity === 0 ? 0 : endEdgeVelocity / peakVelocity;
    const before =
      velocities.findLast((velocity) => velocity.frame <= move.startFrame) ??
      stationaryVelocity;
    const after =
      velocities.find((velocity) => velocity.frame > endFrame) ??
      stationaryVelocity;
    const velocityWindow = [before, ...active, after];
    const maxVelocityJump = Math.max(
      0,
      ...velocityWindow.slice(1).map((velocity, index) =>
        vectorDistance(velocityWindow[index], velocity),
      ),
    );
    const maxVelocityJumpRatio =
      peakVelocity === 0 ? 0 : maxVelocityJump / peakVelocity;
    const edgeVerdict =
      startEdgeRatio <= 0.15 && endEdgeRatio <= 0.15 ? "PASS" : "WARN";
    const discontinuityVerdict =
      maxVelocityJumpRatio > 0.5 ? "FAIL" : "PASS";

    return {
      eventIndex: move.eventIndex,
      startMs: move.startMs,
      durationMs: move.durationMs,
      peakVelocity,
      startEdgeVelocity,
      endEdgeVelocity,
      startEdgeRatio,
      endEdgeRatio,
      maxVelocityJump,
      maxVelocityJumpRatio,
      edgeVerdict,
      discontinuityVerdict,
      verdict: worstVerdict([edgeVerdict, discontinuityVerdict]),
    };
  });

  const relativeZoomRate = {
    max: relativeZoomRateMax,
    p95: percentile(relativeZoomRates, 0.95),
    verdict: rateVerdict(relativeZoomRateMax, 0.55, 0.8),
  };
  const panSpeed = {
    maxPxPerSecond: panFrameRateMax * frameWidth,
    p95PxPerSecond: percentile(panFrameRates, 0.95) * frameWidth,
    maxFrameWidthsPerSecond: panFrameRateMax,
    p95FrameWidthsPerSecond: percentile(panFrameRates, 0.95),
    verdict: rateVerdict(panFrameRateMax, 0.9, 1.4),
  };
  const smoothness = {
    maxVelocityJump: Math.max(
      0,
      ...perMove.map((move) => move.maxVelocityJump),
    ),
    maxVelocityJumpRatio: Math.max(
      0,
      ...perMove.map((move) => move.maxVelocityJumpRatio),
    ),
    verdict: perMove.some(
      (move) => move.discontinuityVerdict === "FAIL",
    )
      ? "FAIL"
      : "PASS",
  };
  const cameraMoves = {
    count: moves.length,
    durationsMs: moves.map((move) => move.durationMs),
  };
  const metrics = { relativeZoomRate, panSpeed, smoothness, cameraMoves };
  const verdict = worstVerdict([
    relativeZoomRate.verdict,
    panSpeed.verdict,
    smoothness.verdict,
    ...perMove.map((move) => move.edgeVerdict),
  ]);

  return { metrics, perMove, verdict };
}

function eventEnd(event, zoomDurationMs) {
  if (event.kind === "spotlight") {
    return event.t + spotlightTotalDuration(event);
  }
  if (event.kind === "zoom") {
    return event.t + zoomDurationMs;
  }
  return "durationMs" in event ? event.t + event.durationMs : undefined;
}

function cursorTravel(cursorPoints, startMs, endMs) {
  const sampleTimes = cursorPoints
    .filter((point) => point.t > startMs && point.t < endMs)
    .map((point) => point.t);
  const times = [startMs, ...sampleTimes, endMs];
  const positions = times
    .map((timeMs) => cursorPositionFromPoints(cursorPoints, timeMs))
    .filter((position) => position !== null);

  return positions.slice(1).reduce((total, position, index) => {
    const previous = positions[index];
    return total + Math.hypot(
      position.x - previous.x,
      position.y - previous.y,
    );
  }, 0);
}

export function detectDeadAirSpans(
  timeline,
  cameraPath = createCameraPath(timeline, FPS, FRAME_WIDTH, FRAME_HEIGHT),
) {
  const zoomDurations = new Map(
    cameraPath.moves.map((move) => [move.event, move.durationMs]),
  );
  const scanEndMs = Math.max(
    0,
    timeline.durationMs - DEAD_AIR_END_EXEMPTION_MS,
  );
  const activityTimes = new Set([0, scanEndMs]);
  const addActivityTime = (timeMs) => {
    if (timeMs >= 0 && timeMs <= scanEndMs) {
      activityTimes.add(timeMs);
    }
  };
  const cursorPoints = timeline.events.filter(
    (event) => event.kind === "cursor",
  );

  for (const event of timeline.events) {
    if (event.kind === "cursor") continue;

    addActivityTime(event.t);
    if (event.kind === "spotlight") {
      addActivityTime(event.t + event.durationMs);
      addActivityTime(event.t + event.durationMs + event.holdMs);
    }
    const endMs = eventEnd(event, zoomDurations.get(event));
    if (endMs !== undefined) addActivityTime(endMs);
  }

  const outro = timeline.events.find((event) => event.kind === "outro");
  const outroEndMs = outro ? eventEnd(outro) : undefined;
  const boundaries = [...activityTimes].sort((left, right) => left - right);

  return boundaries.slice(1).flatMap((endMs, index) => {
    const startMs = boundaries[index];
    const durationMs = endMs - startMs;
    const overlapsOutro =
      outro !== undefined &&
      outroEndMs !== undefined &&
      startMs < outroEndMs &&
      endMs > outro.t;
    const travel = cursorTravel(cursorPoints, startMs, endMs);

    if (
      durationMs < DEAD_AIR_THRESHOLD_MS ||
      travel >= DEAD_AIR_CURSOR_TRAVEL_PX ||
      overlapsOutro
    ) {
      return [];
    }

    return [{ startMs, durationMs, verdict: "WARN" }];
  });
}

export function scoreTimeline(timeline) {
  const sourceWidth =
    timeline.viewport.width * timeline.viewport.deviceScaleFactor;
  const sourceHeight =
    timeline.viewport.height * timeline.viewport.deviceScaleFactor;
  const baseScale = Math.max(
    FRAME_WIDTH / sourceWidth,
    FRAME_HEIGHT / sourceHeight,
  );
  const frameCount = Math.max(1, Math.ceil((timeline.durationMs / 1_000) * FPS));
  const cameraPath = createCameraPath(timeline, FPS, FRAME_WIDTH, FRAME_HEIGHT);
  const samples = Array.from({ length: frameCount }, (_, frame) =>
    cameraPath.atFrame(frame),
  );

  return {
    ...scoreCameraSeries(samples, cameraPath.moves, FPS, baseScale, FRAME_WIDTH),
    deadAirSpans: detectDeadAirSpans(timeline, cameraPath),
  };
}

function formatNumber(value) {
  return value.toFixed(3);
}

function printHumanReadable(score) {
  const { metrics, perMove, verdict, deadAirSpans } = score;
  console.log(`Motion score: ${verdict}`);
  console.log("");
  console.log("Metric                         Max       P95       Verdict");
  console.log("----------------------------- --------- --------- -------");
  console.log(
    `Relative zoom rate (/s)       ${formatNumber(metrics.relativeZoomRate.max).padStart(7)}   ${formatNumber(metrics.relativeZoomRate.p95).padStart(7)}   ${metrics.relativeZoomRate.verdict}`,
  );
  console.log(
    `Pan speed (frame widths/s)    ${formatNumber(metrics.panSpeed.maxFrameWidthsPerSecond).padStart(7)}   ${formatNumber(metrics.panSpeed.p95FrameWidthsPerSecond).padStart(7)}   ${metrics.panSpeed.verdict}`,
  );
  console.log(
    `Pan speed (output px/s)       ${formatNumber(metrics.panSpeed.maxPxPerSecond).padStart(7)}   ${formatNumber(metrics.panSpeed.p95PxPerSecond).padStart(7)}   ${metrics.panSpeed.verdict}`,
  );
  console.log(
    `Velocity jump (peak ratio)    ${formatNumber(metrics.smoothness.maxVelocityJumpRatio).padStart(7)}       -   ${metrics.smoothness.verdict}`,
  );
  console.log("");
  console.log(
    `Camera moves: ${metrics.cameraMoves.count} (${metrics.cameraMoves.durationsMs.map((duration) => `${duration}ms`).join(", ") || "none"})`,
  );

  if (perMove.length > 0) {
    console.log("");
    console.log("Move  Duration  Start edge  End edge  Jump ratio  Verdict");
    console.log("----  --------  ----------  --------  ----------  -------");
    for (const move of perMove) {
      console.log(
        `${String(move.eventIndex).padStart(4)}  ${`${move.durationMs}ms`.padStart(8)}  ${formatNumber(move.startEdgeRatio).padStart(10)}  ${formatNumber(move.endEdgeRatio).padStart(8)}  ${formatNumber(move.maxVelocityJumpRatio).padStart(10)}  ${move.verdict}`,
      );
    }
  }

  console.log("");
  if (deadAirSpans.length === 0) {
    console.log("Dead air: none");
    return;
  }

  console.log("Span  Start     Duration  Verdict");
  console.log("----  --------  --------  -------");
  for (const [index, span] of deadAirSpans.entries()) {
    console.log(
      `${String(index + 1).padStart(4)}  ${`${span.startMs}ms`.padStart(8)}  ${`${span.durationMs}ms`.padStart(8)}  ${span.verdict}`,
    );
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((argument) => argument !== "--json");
  const invalidFlag = args.find(
    (argument) => argument.startsWith("--") && argument !== "--json",
  );

  if (invalidFlag || positional.length !== 1) {
    console.error(
      "Usage: node scripts/score-motion.mjs out/timeline.json [--json]",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const timeline = parseTimeline(
      await readFile(resolve(positional[0]), "utf8"),
    );
    const score = scoreTimeline(timeline);
    if (json) {
      console.log(JSON.stringify(score, null, 2));
    } else {
      printHumanReadable(score);
    }
    if (score.verdict === "FAIL") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await runCli();
}
