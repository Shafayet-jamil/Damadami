"""Stage 3 of the voices: packs each character's recorded clips into one MP3 + manifest.

    python tools/voices/build.py JOBS_JSON CACHE_DIR voices/ [speaker ...]

Reads CACHE_DIR/vc/<speaker>/<clip key>.wav (from parler_render.py + vc_render.py),
trims silence, levels the volume, lays the clips end to end with short gaps, applies
the character's pitch and speed with ffmpeg's rubberband filter and encodes one MP3.
voices/manifest.json maps each clip key to [start, duration] in seconds within it.
"""
import json
import os
import subprocess
import sys
import tempfile
import time

import numpy as np
from scipy.io import wavfile

from scipy.signal import resample_poly

RATE = 22050

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


def load_clip(cache, sid, key):
    sr, w = wavfile.read(os.path.join(cache, 'vc', sid, key + '.wav'))
    w = w.astype(np.float32) / 32768 if w.dtype == np.int16 else w.astype(np.float32)
    if w.ndim > 1:
        w = w.mean(axis=1)
    return resample_poly(w, RATE, sr).astype(np.float32) if sr != RATE else w


def build_speaker(sid, spec, cache, out_dir):
    pieces = [np.zeros(int(LEAD * RATE), np.float32)]
    pos = len(pieces[0])
    raw = {}
    gap = np.zeros(int(GAP * RATE), np.float32)
    t0 = time.time()
    for clip in spec['clips']:
        w = level(trim(load_clip(cache, sid, clip['key'])))
        if not len(w):
            print(f'  ! silent clip {sid} {clip["key"]}: {clip["text"]}', flush=True)
            continue
        raw[clip['key']] = (pos, len(w))
        pieces += [w, gap]
        pos += len(w) + len(gap)
    pcm = np.concatenate(pieces)

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
    print(f'{sid}: {len(clips)} clips, {seconds:.0f}s audio, {size / 1024:.0f} KB', flush=True)
    return {'file': sid + '.mp3', 'seconds': round(seconds, 2), 'bytes': size, 'clips': clips}


def main():
    jobs_path, cache, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    only = set(sys.argv[4:])
    os.makedirs(out_dir, exist_ok=True)
    with open(jobs_path, encoding='utf-8') as f:
        jobs = json.load(f)
    manifest_path = os.path.join(out_dir, 'manifest.json')
    manifest = {'version': 1, 'credit': 'Voices: Bangla Parler-TTS (Tanmoyshome/bn-parler-tts, Apache-2.0) with Chatterbox voice conversion (MIT)', 'speakers': {}}
    if only and os.path.exists(manifest_path):
        with open(manifest_path, encoding='utf-8') as f:
            manifest = json.load(f)
    for sid, spec in jobs['speakers'].items():
        if only and sid not in only:
            continue
        manifest['speakers'][sid] = build_speaker(sid, spec, cache, out_dir)
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
