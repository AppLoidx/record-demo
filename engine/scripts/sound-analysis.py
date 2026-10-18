#!/usr/bin/env python3
"""Measure and mix supplied recordings. No music or effects are synthesized."""
import json
import subprocess
import sys
from pathlib import Path

import librosa
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

SAMPLE_RATE = 48000


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def decode(path, rate=SAMPLE_RATE):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path),
                             '-vn', '-f', 'f32le', '-ac', '2', '-ar', str(rate), '-'],
                            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    audio = np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2).copy()
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError(f'Empty or nonfinite audio: {path}')
    return audio


def beats(music, directory):
    directory = Path(directory)
    y, sr = librosa.load(music, sr=22050, mono=True)
    hop = 128  # 5.8 ms resolution for the requested ~30 ms correction.
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, trim=False)
    grid = librosa.frames_to_time(frames, sr=sr, hop_length=hop)
    if len(grid) < 2:
        raise ValueError('Could not detect a beat grid in supplied music')
    low = sosfiltfilt(butter(4, 120, btype='lowpass', fs=sr, output='sos'), y)
    # Backtracking locates the attack before the low-band energy maximum.
    kicks = librosa.onset.onset_detect(y=low, sr=sr, hop_length=hop,
                                       backtrack=True, units='time')
    differences = np.array([t - grid[np.argmin(abs(grid - t))] for t in kicks])
    median = float(np.median(differences)) if len(differences) else 0.0
    shift = median if abs(median) > 0.030 else 0.0
    shifted = grid + shift
    shifted = shifted[(shifted >= 0) & (shifted < len(y) / sr)]
    # Reject quiet release-tail detections before selecting the final strong attack.
    energies = np.array([np.sqrt(np.mean(low[int(t * sr):min(len(low), int((t + .12) * sr))] ** 2)) for t in kicks])
    strong = kicks[energies >= np.percentile(energies, 75) * .35] if len(kicks) else []
    final_hit = float(strong[-1]) if len(strong) else float(grid[-1])
    result = dict(finalHitSeconds=final_hit, finalHitMethod='Last low-band attack with following 120ms RMS >=35% of upper-quartile attack energy', durationSeconds=len(y) / sr, tempoBpm=float(np.asarray(tempo).item()),
                  beatsSeconds=shifted.tolist(), rawBeatsSeconds=grid.tolist(),
                  lowBandKickOnsetsSeconds=kicks.tolist(), medianKickOffsetMs=median * 1000,
                  gridShiftMs=shift * 1000,
                  method='librosa beat_track; <120 Hz onsets backtracked to attack; signed median nearest-grid correction above 30ms')
    write_json(directory / 'beats.json', result)
    # A few bars in a section with detected kicks, including raw and corrected grids.
    start = max(0, float(kicks[len(kicks) // 3]) - 0.5) if len(kicks) else float(grid[0])
    end = min(len(y) / sr, start + 16 * 60 / result['tempoBpm'])
    fig, ax = plt.subplots(figsize=(15, 4))
    first, last = int(start * sr), int(end * sr)
    ax.plot(np.arange(first, last) / sr, low[first:last], linewidth=0.55, label='Waveform low-pass <120 Hz')
    for i, t in enumerate(grid[(grid >= start) & (grid <= end)]):
        ax.axvline(t, color='grey', alpha=.5, linestyle=':', label='Raw beat grid' if i == 0 else None)
    for i, t in enumerate(shifted[(shifted >= start) & (shifted <= end)]):
        ax.axvline(t, color='#c94238', alpha=.8, label='Used beat grid' if i == 0 else None)
    visible_kicks = kicks[(kicks >= start) & (kicks <= end)]
    ax.scatter(visible_kicks, np.zeros(len(visible_kicks)), color='#137d3f', marker='x', label='Low-band attack candidates', zorder=4)
    ax.set(xlim=(start, end), xlabel='Music time (s)', ylabel='Amplitude',
           title=f"{result['tempoBpm']:.1f} BPM · median kick offset {median * 1000:.1f} ms · applied shift {shift * 1000:.1f} ms")
    ax.legend(loc='upper right', fontsize=8)
    fig.tight_layout()
    fig.savefig(directory / 'beat-grid.png', dpi=150)
    plt.close(fig)


def set_rms(audio, target):
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
    if rms < 1e-8:
        raise ValueError('Supplied audio is silent')
    # Normalize each supplied recording for a reproducible bed/effect relationship.
    gain = min(target / rms, .9 / max(float(np.max(abs(audio))), 1e-8))
    return audio * gain, gain


def edge_fades(audio, fade_seconds):
    n = min(int(fade_seconds * SAMPLE_RATE), len(audio) // 2)
    if n:
        ramp = np.linspace(0, 1, n, dtype=np.float32)[:, None]
        audio[:n] *= ramp
        audio[-n:] *= ramp[::-1]
    return audio


def mix(music, sfx_dir, sheet_path, output, directory):
    sheet = json.loads(Path(sheet_path).read_text())
    duration = sheet['videoDurationSeconds']
    size = round(duration * SAMPLE_RATE)
    offset = round(sheet['music']['offsetSeconds'] * SAMPLE_RATE)
    track = decode(music)
    if offset + size > len(track):
        raise ValueError('Music slice exceeds decoded track duration')
    bed, music_gain = set_rms(track[offset:offset + size].copy(), .035)
    fade_in = min(round(.5 * SAMPLE_RATE), size)
    bed[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    end_card = sheet['endCardMs']
    fade_start = max(0, min(size - 1, round((end_card / 1000 if end_card is not None else max(0, duration - 2)) * SAMPLE_RATE)))
    bed[fade_start:] *= np.linspace(1, 0, size - fade_start)[:, None]
    sources, gains = {}, {}
    for kind in ['whoosh', 'pop', 'click', 'typing']:
        sources[kind], gains[kind] = set_rms(decode(Path(sfx_dir) / f'{kind}.mp3'), .08 if kind == 'typing' else .13)
    mixed = bed
    effects = []
    for cue in sheet['cues']:
        start = round(cue['timeMs'] / 1000 * SAMPLE_RATE)
        if start < 0 or start >= size:
            raise ValueError(f'Cue outside video: {cue}')
        recording = sources[cue['kind']]
        if cue['kind'] == 'typing':
            length = round(cue['durationMs'] / 1000 * SAMPLE_RATE)
            if length <= 0:
                raise ValueError(f'Invalid typing cue: {cue}')
            # Repetition of the supplied loop is allowed; no generated keyboard sounds.
            recording = np.tile(recording, (int(np.ceil(length / len(recording))), 1))[:length].copy()
        else:
            recording = recording.copy()
        recording = edge_fades(recording, .035 if cue['kind'] == 'typing' else .005)
        length = min(len(recording), size - start)
        mixed[start:start + length] += recording[:length]
        effects.append(dict(kind=cue['kind'], timeMs=cue['timeMs'], mixedDurationMs=length / SAMPLE_RATE * 1000))
    sf.write(output, mixed, SAMPLE_RATE, subtype='FLOAT')
    write_json(Path(directory) / 'mix-settings.json', dict(musicGain=music_gain, sfxGains=gains,
               musicRmsTarget=.035, effectRmsTarget=.13, typingRmsTarget=.08,
               musicFadeInSeconds=.5, musicFadeOutStartSeconds=fade_start / SAMPLE_RATE,
               effects=effects, note='Targets apply before final global loudness normalization; source peak caps may reduce gains.'))


def proof(video, sheet_path, directory):
    sheet = json.loads(Path(sheet_path).read_text())
    output = Path(directory) / 'proof'
    output.mkdir(exist_ok=True)
    audio = decode(video)
    mono = audio.mean(axis=1)
    duration = sheet['videoDurationSeconds']
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                            'stream=avg_frame_rate', '-of', 'json', video], check=True, capture_output=True, text=True)
    num, den = json.loads(probe.stdout)['streams'][0]['avg_frame_rate'].split('/')
    fps = float(num) / float(den)
    index = []
    for number, cue in enumerate(sheet['cues']):
        time = cue['timeMs'] / 1000
        stem = f'{number + 1:03d}-{cue["kind"]}-{time:.3f}s'
        frames = []
        for name, delta in [('before', -.150), ('after', .150)]:
            seek = min(max(0, time + delta), max(0, duration - 1 / fps))
            path = output / f'{stem}-{name}.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-y', '-ss', f'{seek:.6f}', '-i', video,
                            '-frames:v', '1', '-vf', 'scale=640:-2', str(path)], check=True, capture_output=True)
            if not path.exists():
                raise ValueError(f'No proof frame extracted at {seek}')
            frames.append(dict(file=path.name, timeSeconds=seek))
        start, end = max(0, time - .65), min(duration, time + max(.65, min(cue.get('durationMs', 0) / 1000, 2)))
        a, b = int(start * SAMPLE_RATE), min(len(mono), int(end * SAMPLE_RATE))
        fig, ax = plt.subplots(figsize=(6.4, 2.5))
        ax.plot(np.arange(a, b) / SAMPLE_RATE, mono[a:b], linewidth=.4)
        ax.axvline(time, color='#c94238', label='Cue')
        ax.set(xlabel='Exported MP4 time (s)', ylabel='Mixed amplitude', xlim=(start, end), ylim=(-.65, .65))
        ax.set_title(f'{cue["kind"]} · {time:.3f}s · {cue["reason"]}', fontsize=9)
        fig.tight_layout()
        wave = output / f'{stem}-waveform.png'
        fig.savefig(wave, dpi=100)
        plt.close(fig)
        index.append(dict(cue=cue, frames=frames, waveform=wave.name))
    # Each row contains the before/after frames and exported-audio waveform for one cue.
    for first in range(0, len(index), 6):
        group = index[first:first + 6]
        fig, axes = plt.subplots(len(group), 3, figsize=(18, 3.5 * len(group)), squeeze=False)
        for row, entry in enumerate(group):
            files = [f['file'] for f in entry['frames']] + [entry['waveform']]
            for col, filename in enumerate(files):
                axes[row, col].imshow(plt.imread(output / filename))
                axes[row, col].axis('off')
                if col < 2:
                    frame = entry['frames'][col]
                    axes[row, col].set_title(f'{first + row + 1}: {entry["cue"]["kind"]} · {frame["timeSeconds"]:.3f}s', fontsize=9)
        fig.tight_layout()
        fig.savefig(output / f'contact-{first // 6 + 1:02d}.png', dpi=100)
        plt.close(fig)
    write_json(output / 'index.json', index)


if __name__ == '__main__':
    commands = dict(beats=beats, mix=mix, proof=proof)
    commands[sys.argv[1]](*sys.argv[2:])
