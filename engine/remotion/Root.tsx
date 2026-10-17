import {
  Composition,
  registerRoot,
  type CalculateMetadataFunction,
} from "remotion";
import fixtureTimeline from "../fixtures/timeline.json";
import { assertTimeline } from "../lib/timeline";
import { compositionDurationInFrames } from "../lib/time-map";
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

export const calculateMetadata: CalculateMetadataFunction<DemoVideoProps> = ({
  props,
}) => {
  assertDemoVideoProps(props);

  return {
    durationInFrames: compositionDurationInFrames(
      props.timeline,
      compositionFps,
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
          durationInFrames={compositionDurationInFrames(
            defaultProps.timeline,
            compositionFps,
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
