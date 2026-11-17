"""Keeps the clearest take of each re-recorded phrase (scored with Whisper), replaces the
source recording, and deletes the converted clips made from it so vc_render.py redoes them.

    python pick_takes.py JOBS_JSON AUDIT_JSON CACHE_DIR
"""
import glob
import json
import os
import shutil
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly
from transformers import pipeline

from voicekeys import key_for

STRIP = str.maketrans('', '', '।?!,.\'"- ')


def to_bengali(s):
    # Whisper often writes Bangla in Devanagari; the two blocks share their layout
    return ''.join(chr(ord(c) + 0x80) if 0x0900 <= ord(c) <= 0x097F else c for c in s)


def cer(a, b):
    a, b = a.translate(STRIP), b.translate(STRIP)
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return d[len(b)] / max(1, len(a))


def main():
    jobs = json.load(open(sys.argv[1], encoding='utf-8'))
    audit = json.load(open(sys.argv[2], encoding='utf-8'))
    cache = sys.argv[3]
    asr = pipeline('automatic-speech-recognition', model='openai/whisper-large-v3-turbo', device='cpu')

    def score(path, text):
        sr, w = wavfile.read(path)
        w = w.astype(np.float32) / 32768
        heard = asr(resample_poly(w, 16000, sr).astype(np.float32),
                    generate_kwargs={'language': 'bengali', 'task': 'transcribe'})['text']
        return cer(text, to_bengali(heard))

    replaced = 0
    for r in [x for x in audit if x['bad']]:
        base = os.path.join(cache, 'base', r['gender'], r['key'] + '.wav')
        best, best_score = None, r['cer']
        for take in sorted(glob.glob(os.path.join(cache, 'takes', r['gender'], r['key'] + '_*.wav'))):
            try:
                s = score(take, r['text'])
            except ValueError:  # an unreadable (e.g. empty) take
                continue
            if s < best_score:
                best, best_score = take, s
        if best:
            shutil.copyfile(best, base)
            replaced += 1
            # converted clips made from this phrase must be redone
            for sid, spec in jobs['speakers'].items():
                if spec['gender'] != r['gender']:
                    continue
                for c in spec['clips']:
                    if key_for(spec['gender'], c['text']) == r['key']:
                        vc = os.path.join(cache, 'vc', sid, c['key'] + '.wav')
                        if os.path.exists(vc):
                            os.remove(vc)
        print(f"{'replaced' if best else 'kept    '} {r['cer']:.2f} -> {best_score:.2f}  {r['text']}", flush=True)
    print(f'{replaced} phrases replaced')


if __name__ == '__main__':
    main()
