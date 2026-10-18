import { createCameraPath } from "./camera";
import type { Timeline, TransitionEvent } from "./timeline";

/** Keep camera interpolation intact; the hidden card establishes a fresh wide scene. */
export function createSceneCameraPath(
  timeline: Timeline,
  fps: number,
  width: number,
  height: number,
) {
  const original = createCameraPath(timeline, fps, width, height);
  const scenes = timeline.events
    .filter((event): event is TransitionEvent => event.kind === "transition")
    .map((event) => ({
      startMs: event.t + event.outMs,
      path: createCameraPath(
        {
          ...timeline,
          events: timeline.events.filter((candidate) => candidate.t > event.t),
        },
        fps,
        width,
        height,
      ),
    }));
  const moves = original.moves.map((move) => {
    const scene = scenes
      .filter((scene) => move.startMs >= scene.startMs)
      .at(-1);
    const resolved = scene?.path.moves.find(
      (candidate) => candidate.event === move.event,
    );
    return resolved ? { ...resolved, eventIndex: move.eventIndex } : move;
  });
  return {
    moves,
    atFrame(frame: number) {
      const scene = scenes
        .filter((scene) => (frame * 1000) / fps >= scene.startMs)
        .at(-1);
      return (scene?.path ?? original).atFrame(frame);
    },
  };
}
