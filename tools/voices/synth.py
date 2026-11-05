"""Bangla speech synthesis with the SYSPIN VITS voices (IISc Bangalore, CC-BY 4.0).

Synth('male' | 'female').wav(text) -> float32 numpy array at 22050 Hz.
Models are downloaded by fetch_models.sh into tools/voices/models (not committed).
"""
import os
import sys
import unicodedata

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get('VOICE_MODELS', os.path.join(HERE, 'models'))
sys.path.insert(0, os.path.join(MODEL_DIR, 'Male'))  # extra.py (the model's tokenizer) lives here
from extra import TTSTokenizer, VitsConfig, CharactersConfig, VitsCharacters  # noqa: E402

RATE = 22050
PUNCT = "!¡'(),-.:;¿? "
MODELS = {
    'male': ('Male', 'bn_male_vits_30hrs.pt'),
    'female': ('Female', 'bn_female_vits_30hrs.pt'),
}
torch.set_num_threads(max(1, os.cpu_count() or 1))


class Synth:
    def __init__(self, gender):
        folder, weights = MODELS[gender]
        path = os.path.join(MODEL_DIR, folder)
        with open(os.path.join(path, 'chars.txt'), encoding='utf-8') as f:
            letters = f.read().strip('\n')
        self.known = set(letters) | set(PUNCT)
        self.unknown = set()
        config = VitsConfig(
            text_cleaner='multilingual_cleaners',
            characters=CharactersConfig(
                characters_class=VitsCharacters,
                pad='<PAD>', eos='<EOS>', bos='<BOS>', blank='<BLNK>',
                characters=letters, punctuations=PUNCT, phonemes=None,
            ),
        )
        self.tokenizer, _ = TTSTokenizer.init_from_config(config)
        self.net = torch.jit.load(os.path.join(path, weights))
        self.net.eval()

    def prepare(self, text):
        """Keep only characters the model knows; split composed letters (য় → য + ়) if needed."""
        out = []
        for ch in unicodedata.normalize('NFC', text):
            if ch in self.known:
                out.append(ch)
                continue
            parts = unicodedata.normalize('NFD', ch)
            if all(p in self.known for p in parts):
                out.append(parts)
            else:
                self.unknown.add(ch)
        return ''.join(out).strip()

    def wav(self, text):
        ids = self.tokenizer.text_to_ids(self.prepare(text))
        x = torch.from_numpy(np.array(ids)).unsqueeze(0)
        with torch.no_grad():
            out = self.net(x)
        return out.squeeze().cpu().numpy().astype(np.float32)
