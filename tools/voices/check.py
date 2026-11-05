"""Checks the built voice files: every clip in voices/manifest.json must contain sound,
and the moments just before and after it must be quiet (so clips never bleed into
each other when stitched).

    python tools/voices/check.py voices/
"""
import json
import os
import subprocess
import sys

import numpy as np

RATE = 22050


def decode(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0


def main():
    folder = sys.argv[1]
    with open(os.path.join(folder, 'manifest.json'), encoding='utf-8') as f:
        manifest = json.load(f)
    bad = 0
    total_bytes = 0
    for sid, sp in manifest['speakers'].items():
        audio = decode(os.path.join(folder, sp['file']))
        total_bytes += os.path.getsize(os.path.join(folder, sp['file']))
        edge = int(0.03 * RATE)
        problems = []
        for key, (start, dur) in sp['clips'].items():
            a, b = int(start * RATE), int((start + dur) * RATE)
            inside = rms(audio[a:b])
            before = rms(audio[max(0, a - edge):a])
            after = rms(audio[b:b + edge])
            if inside < 0.01 or before > inside * 0.35 or after > inside * 0.35:
                problems.append((key, round(inside, 3), round(before, 3), round(after, 3)))
        bad += len(problems)
        status = 'ok' if not problems else f'{len(problems)} suspicious: {problems[:4]}'
        print(f'{sid:9s} {len(sp["clips"]):4d} clips  {len(audio) / RATE:6.1f}s  {sp["bytes"] / 1024:5.0f} KB  {status}')
    print(f'total {total_bytes / 1024 / 1024:.1f} MB, {bad} suspicious clips')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
