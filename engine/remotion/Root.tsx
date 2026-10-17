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
import { CaptionLab, captionLabTimeline, CutLab, CarryCutLab, cutLabTimeline, carryCutLabTimeline, RailLab, CarryLab, CalloutLab, railLabTimeline, carryLabTimeline, calloutLabTimeline } from "./Labs";

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
      {[
        { id: "CaptionLab", component: CaptionLab, timeline: captionLabTimeline },
        { id: "CutLab", component: CutLab, timeline: cutLabTimeline },
        { id: "CarryCutLab", component: CarryCutLab, timeline: carryCutLabTimeline },
        { id: "RailLab", component: RailLab, timeline: railLabTimeline },
        { id: "CarryLab", component: CarryLab, timeline: carryLabTimeline },
        { id: "CalloutLab", component: CalloutLab, timeline: calloutLabTimeline },
      ].flatMap((lab) => compositionPresets.map((preset) => <Composition key={`${lab.id}-${preset.id}`}
        id={preset.id === "16x9" ? lab.id : `${lab.id}-${preset.id}`} component={lab.component}
        width={preset.width} height={preset.height} fps={compositionFps}
        durationInFrames={compositionDurationInFrames(lab.timeline, compositionFps)} />))}
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
