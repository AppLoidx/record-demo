import { AbsoluteFill } from "remotion";
import { demoTheme } from "./theme";

export function Background() {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: demoTheme.colors.backdrop,
        backgroundImage: demoTheme.backgroundImage,
      }}
    />
  );
}
