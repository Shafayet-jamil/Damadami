#!/usr/bin/env bash
# Records every character voice and packs them into voices/. Safe to re-run: each stage
# skips work already in the cache.
#
#   PARLER_PY=... VC_PY=... PACK_PY=... tools/voices/record_all.sh CACHE_DIR
#
# PARLER_PY: python with parler_tts (+ torch, transformers==4.46)
# VC_PY:     python with chatterbox-tts
# PACK_PY:   python with numpy + scipy (ffmpeg with rubberband on PATH)
set -euo pipefail
cd "$(dirname "$0")"
CACHE="${1:?usage: record_all.sh CACHE_DIR}"
mkdir -p "$CACHE"
JOBS="$CACHE/jobs.json"
node clips.js > "$JOBS"
echo "== stage 1: Bangla Parler recordings"
"${PARLER_PY:-python}" parler_render.py "$JOBS" "$CACHE"
echo "== stage 2: one voice per character"
"${VC_PY:-python}" vc_render.py "$JOBS" "$CACHE"
echo "== stage 3: pack"
"${PACK_PY:-python}" build.py "$JOBS" "$CACHE" ../../voices
"${PACK_PY:-python}" check.py ../../voices
echo "== done"
