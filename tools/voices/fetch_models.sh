#!/usr/bin/env bash
# Downloads the two SYSPIN Bangla VITS voices (IISc Bangalore) into tools/voices/models.
# Female: https://huggingface.co/SYSPIN/tts_vits_coquiai_BengaliFemale (CC-BY 4.0)
# Male:   https://huggingface.co/SYSPIN/tts_vits_coquiai_BengaliMale
set -euo pipefail
cd "$(dirname "$0")"
HF=https://huggingface.co/SYSPIN
for voice in Male Female; do
  lower=$(echo "$voice" | tr '[:upper:]' '[:lower:]')
  mkdir -p "models/$voice"
  for f in "bn_${lower}_vits_30hrs.pt" chars.txt; do
    [ -s "models/$voice/$f" ] || curl -fL --retry 3 -o "models/$voice/$f" "$HF/tts_vits_coquiai_Bengali$voice/resolve/main/$f"
  done
done
[ -s models/Male/extra.py ] || curl -fL --retry 3 -o models/Male/extra.py "$HF/tts_vits_coquiai_BengaliMale/resolve/main/extra.py"
echo "models ready in $(pwd)/models"
