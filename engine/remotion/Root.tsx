import {
  Composition,
  registerRoot,
  type CalculateMetadataFunction,
} from "remotion";
import fixtureTimeline from "../fixtures/timeline.json";
import { assertTimeline } from "../lib/timeline";
import {
  assertDemoVideoProps,
  DemoVideo,
  type DemoVideoProps,
} from "./DemoVideo";
import { demoVideoSchema } from "./schema";
import { compositionFps, compositionPresets } from "./theme";

const timelineValue: unknown = fixtureTimeline;
assertTimeline(timelineValue);

const defaultProps: DemoVideoProps = {
  timeline: timelineValue,
  videoSrc: "composition-proof-source.mp4",
  windowChrome: "macos",
};

const calculateMetadata: CalculateMetadataFunction<DemoVideoProps> = ({
  props,
}) => {
  assertDemoVideoProps(props);

  return {
    durationInFrames: Math.max(
      1,
      Math.ceil((props.timeline.durationMs / 1_000) * compositionFps),
    ),
    fps: compositionFps,
  };
};

export function RemotionRoot() {
  return (
    <>
      {compositionPresets.map((composition) => (
        <Composition
          key={composition.id}
          id={composition.id}
          component={DemoVideo}
          width={composition.width}
          height={composition.height}
          fps={compositionFps}
          durationInFrames={Math.ceil(
            (defaultProps.timeline.durationMs / 1_000) * compositionFps,
          )}
          defaultProps={defaultProps}
          calculateMetadata={calculateMetadata}
          schema={demoVideoSchema}
        />
      ))}
    </>
  );
}

registerRoot(RemotionRoot);
