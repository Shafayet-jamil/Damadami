"""Records every clip in a job file and packs each character into one MP3 + manifest.

    node tools/voices/clips.js > /tmp/jobs.json
    python tools/voices/build.py /tmp/jobs.json voices/ [speaker ...]

For each speaker: synthesize every clip with its base voice, trim silence, level the
volume, lay the clips end to end with short gaps, then apply the character's pitch and
speed with ffmpeg's rubberband filter and encode one MP3. voices/manifest.json maps
each clip key to [start, duration] in seconds within that MP3.
"""
import json
import os
import subprocess
import sys
import tempfile
import time

import numpy as np
from scipy.io import wavfile

from synth import RATE, Synth

GAP = 0.10      # silence between clips (s); also absorbs MP3 encoder delay
LEAD = 0.10     # silence at the start of each file (s)
MARGIN = 0.035  # silence kept around each trimmed clip (s)
BITRATE = os.environ.get('VOICE_BITRATE', '32k')


def trim(w):
    peak = float(np.max(np.abs(w))) if len(w) else 0.0
    if peak < 1e-4:
        return w[:0]
    idx = np.where(np.abs(w) > peak * 0.02)[0]
    m = int(MARGIN * RATE)
    return w[max(0, idx[0] - m): min(len(w), idx[-1] + m)]


def level(w, target_rms=0.085, max_peak=0.95):
    rms = float(np.sqrt(np.mean(w ** 2))) if len(w) else 0.0
    if rms < 1e-5:
        return w
    w = w * (target_rms / rms)
    peak = float(np.max(np.abs(w)))
    return w * (max_peak / peak) if peak > max_peak else w


def build_speaker(sid, spec, synths, out_dir):
    synth = synths.setdefault(spec['model'], Synth(spec['model']))
    pieces = [np.zeros(int(LEAD * RATE), np.float32)]
    pos = len(pieces[0])
    raw = {}
    gap = np.zeros(int(GAP * RATE), np.float32)
    t0 = time.time()
    for clip in spec['clips']:
        w = level(trim(synth.wav(clip['text'])))
        if not len(w):
            print(f'  ! silent clip {sid} {clip["key"]}: {clip["text"]}', flush=True)
            continue
        raw[clip['key']] = (pos, len(w))
        pieces += [w, gap]
        pos += len(w) + len(gap)
    pcm = np.concatenate(pieces)
    synth_s = time.time() - t0

    pitch = 2 ** (spec['pitch'] / 12.0)
    tempo = spec['tempo']
    mp3 = os.path.join(out_dir, sid + '.mp3')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wavfile.write(tmp.name, RATE, (np.clip(pcm, -1, 1) * 32767).astype(np.int16))
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp.name,
           '-af', f'rubberband=pitch={pitch:.5f}:tempo={tempo:.5f}:formant=preserved',
           '-ac', '1', '-ar', str(RATE), '-c:a', 'libmp3lame', '-b:a', BITRATE, mp3]
    subprocess.run(cmd, check=True)
    os.unlink(tmp.name)

    # rubberband changes length by 1/tempo, so every offset scales the same way
    clips = {k: [round(s / RATE / tempo, 3), round(n / RATE / tempo, 3)] for k, (s, n) in raw.items()}
    seconds = len(pcm) / RATE / tempo
    size = os.path.getsize(mp3)
    print(f'{sid}: {len(clips)} clips, {seconds:.0f}s audio, {size / 1024:.0f} KB, synth {synth_s:.0f}s', flush=True)
    return {'file': sid + '.mp3', 'seconds': round(seconds, 2), 'bytes': size, 'clips': clips}


def main():
    jobs_path, out_dir = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(out_dir, exist_ok=True)
    with open(jobs_path, encoding='utf-8') as f:
        jobs = json.load(f)
    manifest_path = os.path.join(out_dir, 'manifest.json')
    manifest = {'version': 1, 'credit': 'Voices: SYSPIN (IISc Bangalore), CC-BY 4.0', 'speakers': {}}
    if only and os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    synths = {}
    for sid, spec in jobs['speakers'].items():
        if only and sid not in only:
            continue
        manifest['speakers'][sid] = build_speaker(sid, spec, synths, out_dir)
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
    for name, s in synths.items():
        if s.unknown:
            print(f'note: {name} model skipped unknown characters: {"".join(sorted(s.unknown))}')


if __name__ == '__main__':
    main()
