import { describe, expect, it } from 'vitest';
import { chooseMusicOffset, parseEbur128, parseTypingSpans, exportGainCorrection } from '../scripts/add-sound.mjs';

describe('sound pass controls', () => {
  it('selects an offset that aligns major composition cues without exhausting music', () => {
    const result = chooseMusicOffset([1, 2, 3, 4, 5, 6, 7, 8, 9], [0.25, 2.25], 5, 10);
    expect(result.offsetSeconds).toBeCloseTo(0.75, 2);
    expect(result.meanBeatErrorMs).toBeLessThan(1);
    expect(() => chooseMusicOffset([1], [0], 11, 10)).toThrow(/shorter/);
  });
  it('keeps the track final hit inside the end card when selecting the offset', () => {
    const result = chooseMusicOffset([1, 2, 3, 4, 5, 6, 7, 8, 9], [0.25, 2.25], 5, 10, { finalHitSeconds: 8, endCardSeconds: 4 });
    expect(result.offsetSeconds).toBeCloseTo(3.75, 2);
    expect(8 - result.offsetSeconds).toBeGreaterThanOrEqual(4);
    expect(8 - result.offsetSeconds).toBeLessThan(5);
  });
  it('parses the final exported loudness summary rather than frame readings', () => {
    expect(parseEbur128('I: -70 LUFS\nSummary:\n I: -16.1 LUFS\n True peak:\n Peak: -4.5 dBFS')).toEqual({ integratedLufs: -16.1, truePeakDbfs: -4.5 });
    expect(() => parseEbur128('Summary: I: nan LUFS')).toThrow();
  });
  it('corrects AAC overshoot only when integrated loudness retains headroom', () => {
    expect(exportGainCorrection({ integratedLufs: -16.3, truePeakDbfs: -3.9 })).toBeCloseTo(-0.5);
    expect(exportGainCorrection({ integratedLufs: -18, truePeakDbfs: -8 })).toBe(2);
    expect(exportGainCorrection({ integratedLufs: -17, truePeakDbfs: -3 })).toBeNull();
  });
  it('accepts only finite ordered legacy timeline seconds', () => {
    expect(parseTypingSpans('1.5-2,4-6')).toEqual([{ startMs: 1500, endMs: 2000 }, { startMs: 4000, endMs: 6000 }]);
    for (const invalid of ['2-1', 'NaN-2', '1-1', '1-2,']) expect(() => parseTypingSpans(invalid)).toThrow();
  });
});
