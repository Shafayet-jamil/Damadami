"""Stage 2 of the Parler voices: Bangla Parler changes speaker from one generation to the
next, so every recorded phrase is converted onto its character's reference voice with
Resemble AI's Chatterbox voice converter (MIT). One character then keeps one voice.

    python vc_render.py JOBS_JSON CACHE_DIR [speaker ...]

Reads CACHE_DIR/base/<gender>/<hash>.wav and CACHE_DIR/refs/<speaker>.wav, writes
CACHE_DIR/vc/<speaker>/<clip key>.wav. Existing files are skipped (resumable).
"""
import json
import os
import sys
import time

import numpy as np
import torch
from scipy.io import wavfile

from chatterbox.vc import ChatterboxVC
from voicekeys import key_for


def main():
    jobs_path, cache = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    with open(jobs_path, encoding='utf-8') as f:
        jobs = json.load(f)
    torch.set_num_threads(os.cpu_count())
    vc = ChatterboxVC.from_pretrained('cpu')
    for sid, spec in jobs['speakers'].items():
        if only and sid not in only:
            continue
        out_dir = os.path.join(cache, 'vc', sid)
        os.makedirs(out_dir, exist_ok=True)
        vc.set_target_voice(os.path.join(cache, 'refs', sid + '.wav'))
        t0, n = time.time(), 0
        for clip in spec['clips']:
            out = os.path.join(out_dir, clip['key'] + '.wav')
            if os.path.exists(out):
                continue
            src = os.path.join(cache, 'base', spec['gender'], key_for(spec['gender'], clip['text']) + '.wav')
            wav = vc.generate(src).squeeze().cpu().numpy().astype(np.float32)
            wav = wav / max(1e-6, float(np.max(np.abs(wav)))) * 0.9
            tmp = out + '.tmp.wav'
            wavfile.write(tmp, vc.sr, (wav * 32767).astype(np.int16))
            os.replace(tmp, out)
            n += 1
        print(f'{sid}: {n} clips converted in {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
