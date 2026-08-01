export async function renderPresetSequence(presets, renderPreset) {
  const outputPaths = [];
  for (const preset of presets) {
    outputPaths.push(await renderPreset(preset));
  }
  return outputPaths;
}
