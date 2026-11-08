#!/usr/bin/env bash
# Topic -> finished short, with a human review of the script in between.
#
#   videogen/make_video.sh "how vaccines work" vaccines    # 1. write script + drawings, stop for review
#   (read out/vaccines/review.md, fix storyboard.json)
#   videogen/make_video.sh --render vaccines               # 2. voice, timing, layout, video
#   videogen/make_video.sh --auto "how vaccines work" vaccines   # both, no stop (drafts only)
set -euo pipefail
cd "$(dirname "$0")"
PY=~/.venvs/videogen/bin/python

write() {
  $PY storyboard.py "$1" "out/$2"
  # Free the GPU the LLM was using before the voice model loads.
  curl -s localhost:11434/api/generate -d "{\"model\": \"${VIDEOGEN_MODEL:-qwen3:8b}\", \"keep_alive\": 0}" >/dev/null || true
}

render() {
  local out="out/$1"
  $PY storyboard.py --review "$out" # re-check hand edits; the review file is refreshed
  CUDA_VISIBLE_DEVICES=1 $PY narrate.py "$out" 2> >(grep -v -i "warn\|LSTM\|WeightNorm" >&2)
  $PY timeline.py "$out"
  node layout.cjs "$out"
  node render.mjs "$out"
}

case "${1:-}" in
  --render) render "$2" ;;
  --auto) write "$2" "$3" && render "$3" ;;
  "" | -*) sed -n '2,7p' "$0"; exit 1 ;;
  *)
    write "$1" "$2"
    echo
    echo "Review videogen/out/$2/review.md (⚠ = check this fact), edit videogen/out/$2/storyboard.json, then:"
    echo "  videogen/make_video.sh --render $2"
    ;;
esac
