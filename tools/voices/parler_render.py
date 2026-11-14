"""Stage 1 of the Parler voices: record every distinct phrase once per gender with
Bangla Parler-TTS (Tanmoyshome/bn-parler-tts, fine-tuned from AI4Bharat Indic Parler-TTS),
plus one ~10 s reference recording per character.

    python parler_render.py JOBS_JSON CACHE_DIR

Writes CACHE_DIR/base/<gender>/<hash>.wav and CACHE_DIR/refs/<speaker>.wav. Files that
already exist are skipped, so the run can be stopped and resumed.
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

from voicekeys import key_for

REPO = 'Tanmoyshome/bn-parler-tts'
DESC = {
    'male': 'A Bengali male speaker speaks at a moderate pace in a very clear recording.',
    'female': 'A Bengali female speaker speaks at a moderate pace in a very clear recording.',
}
REF_TEXT = 'আজকে বাজারে অনেক ভিড়। সবাই ঈদের কেনাকাটা করতেছে, দোকানে দোকানে দামাদামি চলতেছে। আপনিও আসেন, দেখেন, পছন্দ হলে নিয়ে যান।'
# Batching changes Parler's output (short phrases pick up extra audio), so default to 1.
BATCH = int(os.environ.get('PARLER_BATCH', '1'))
RETRIES = 4


def plausible(text, seconds):
    """How far a recording's length is from what the text should take (1.0 = spot on)."""
    expected = 0.3 + 0.085 * len(text.replace(' ', ''))
    return seconds / expected


def save(path, wav, sr):
    wav = wav / max(1e-6, float(np.max(np.abs(wav)))) * 0.9
    tmp = path + '.tmp.wav'
    wavfile.write(tmp, sr, (wav * 32767).astype(np.int16))
    os.replace(tmp, path)


def main():
    jobs_path, cache = sys.argv[1], sys.argv[2]
    with open(jobs_path, encoding='utf-8') as f:
        jobs = json.load(f)
    torch.set_num_threads(os.cpu_count())
    model = ParlerTTSForConditionalGeneration.from_pretrained(REPO).eval()
    tok = AutoTokenizer.from_pretrained(REPO)
    desc_tok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
    sr = model.config.sampling_rate

    def generate(gender, texts, seed):
        """Batched generation; returns one waveform per text."""
        d = desc_tok([DESC[gender]] * len(texts), return_tensors='pt', padding=True)
        p = tok(texts, return_tensors='pt', padding=True)
        torch.manual_seed(seed)
        with torch.no_grad():
            out = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                                 prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask,
                                 return_dict_in_generate=True)
        waves = []
        for i in range(len(texts)):
            n = int(out.audios_length[i]) if getattr(out, 'audios_length', None) is not None else out.sequences.shape[-1]
            waves.append(out.sequences[i, :n].cpu().numpy().astype(np.float32))
        return waves

    # one reference recording per character: a different seed gives each a different voice
    os.makedirs(os.path.join(cache, 'refs'), exist_ok=True)
    for sid, spec in jobs['speakers'].items():
        path = os.path.join(cache, 'refs', sid + '.wav')
        if not os.path.exists(path):
            t0 = time.time()
            save(path, generate(spec['gender'], [REF_TEXT], spec['refSeed'])[0], sr)
            print(f'ref {sid}: {time.time() - t0:.0f}s', flush=True)

    # every distinct (gender, phrase), shortest first so batches pad little
    todo = {}
    for spec in jobs['speakers'].values():
        for clip in spec['clips']:
            todo[(spec['gender'], clip['text'])] = key_for(spec['gender'], clip['text'])
    for g in DESC:
        os.makedirs(os.path.join(cache, 'base', g), exist_ok=True)
    pending = [(g, t, k) for (g, t), k in todo.items() if not os.path.exists(os.path.join(cache, 'base', g, k + '.wav'))]
    pending.sort(key=lambda x: (x[0], len(x[1])))
    print(f'{len(todo)} distinct phrases, {len(pending)} to record', flush=True)
    done, t_start = 0, time.time()
    i = 0
    while i < len(pending):
        g = pending[i][0]
        batch = [x for x in pending[i:i + BATCH] if x[0] == g]
        waves = generate(g, [t for _, t, _ in batch], 1000 + i)
        for (gg, t, k), w in zip(batch, waves):
            # a take far too short or too long for its text is usually garbled: try other seeds
            best, best_score = w, abs(np.log(max(1e-3, plausible(t, len(w) / sr))))
            attempt = 0
            while best_score > np.log(2.0) and attempt < RETRIES:
                attempt += 1
                alt = generate(gg, [t], 5000 + i * 10 + attempt)[0]
                score = abs(np.log(max(1e-3, plausible(t, len(alt) / sr))))
                if score < best_score:
                    best, best_score = alt, score
            if attempt:
                print(f'  retried "{t}" {attempt}x, length ratio now {np.exp(best_score):.2f}', flush=True)
            save(os.path.join(cache, 'base', gg, k + '.wav'), best, sr)
        i += len(batch)
        done += len(batch)
        rate = (time.time() - t_start) / done
        print(f'{done}/{len(pending)}  {rate:.1f}s per phrase, ~{rate * (len(pending) - done) / 60:.0f} min left', flush=True)


if __name__ == '__main__':
    main()
