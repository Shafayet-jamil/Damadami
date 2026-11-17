"""Records fresh takes of the phrases an audit flagged as garbled.

    python rerecord.py AUDIT_JSON CACHE_DIR [TAKES]

AUDIT_JSON is a list of {gender, text, key, bad}. For each bad phrase, writes TAKES new
recordings (different seeds) to CACHE_DIR/takes/<gender>/<key>_<n>.wav. pick_takes.py
then keeps the clearest one.
"""
import json
import os
import sys
import time

import numpy as np
import torch
from parler_tts import ParlerTTSForConditionalGeneration
from scipy.io import wavfile
from transformers import AutoTokenizer

from parler_render import DESC, REPO


def main():
    audit = json.load(open(sys.argv[1], encoding='utf-8'))
    cache = sys.argv[2]
    takes = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    torch.set_num_threads(os.cpu_count())
    model = ParlerTTSForConditionalGeneration.from_pretrained(REPO).eval()
    tok = AutoTokenizer.from_pretrained(REPO)
    desc_tok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
    sr = model.config.sampling_rate
    bad = [r for r in audit if r['bad']]
    t0 = time.time()
    for n, r in enumerate(bad, 1):
        out_dir = os.path.join(cache, 'takes', r['gender'])
        os.makedirs(out_dir, exist_ok=True)
        d = desc_tok(DESC[r['gender']], return_tensors='pt')
        p = tok(r['text'], return_tensors='pt')
        for i in range(takes):
            path = os.path.join(out_dir, f"{r['key']}_{i}.wav")
            if os.path.exists(path):
                continue
            torch.manual_seed(20000 + 97 * n + i)
            with torch.no_grad():
                wav = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                                     prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
            wav = np.atleast_1d(wav.cpu().numpy().squeeze()).astype(np.float32)
            if len(wav) < sr // 10:  # an empty take: skip it, the other takes remain
                continue
            wav = wav / max(1e-6, float(np.max(np.abs(wav)))) * 0.9
            wavfile.write(path, sr, (wav * 32767).astype(np.int16))
        print(f'{n}/{len(bad)} phrases, {(time.time() - t0) / n:.0f}s each', flush=True)


if __name__ == '__main__':
    main()
