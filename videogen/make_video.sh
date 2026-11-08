#!/usr/bin/env bash
# Topic -> finished short, with a human review of the script in between.
#
#   videogen/make_video.sh "how vaccines work" vaccines    # 1. write script + drawings, stop for review
#   (read out/vaccines/review.md, fix storyboard.json)
#   videogen/make_video.sh --render vaccines               # 2. voice, timing, layout, video
#   videogen/make_video.sh --auto "how vaccines work" vaccines   # both, no stop (drafts only)
#
# Project folders: videogen/projects/<name>/ with idea.md (your angle and facts) and/or script.md (your
# narration, used word for word). A folder with the video's name is used automatically.
#   videogen/make_video.sh --ideas "how vaccines work" vaccines   # 5 angles -> projects/vaccines/ideas.md
#   videogen/make_video.sh --project vaccines                    # from projects/vaccines (no topic needed)
set -euo pipefail
cd "$(dirname "$0")"
PY=${VIDEOGEN_PY:-$HOME/.venvs/videogen/bin/python}
OLLAMA_URL=${OLLAMA_URL:-http://localhost:11434}

unload() {
  # Free the GPU the LLM was using before the voice model loads.
  curl -s "$OLLAMA_URL/api/generate" -d "{\"model\": \"${VIDEOGEN_MODEL:-qwen3:8b}\", \"keep_alive\": 0}" >/dev/null || true
}

write() { # TOPIC NAME
  local project=()
  [ -d "projects/$2" ] && project=("projects/$2") && echo "using project folder videogen/projects/$2" >&2
  $PY storyboard.py "$1" "out/$2" "${project[@]}"
  unload
}

render() {
  local out="out/$1"
  $PY storyboard.py --review "$out" # re-check hand edits; the review file is refreshed
  CUDA_VISIBLE_DEVICES=${VOICE_GPU-1} $PY narrate.py "$out" 2> >(grep -v -i "warn\|LSTM\|WeightNorm" >&2)
  $PY timeline.py "$out"
  node layout.cjs "$out"
  node render.mjs "$out"
}

review_hint() {
  echo
  echo "Review videogen/out/$1/review.md (⚠ = check this fact), edit videogen/out/$1/storyboard.json, then:"
  echo "  videogen/make_video.sh --render $1"
}

case "${1:-}" in
  --render) render "$2" ;;
  --auto) write "$2" "$3" && render "$3" ;;
  --ideas) $PY storyboard.py --ideas "$2" "projects/$3" && unload ;;
  --project)
    [ -d "projects/$2" ] || { echo "no folder videogen/projects/$2" >&2; exit 1; }
    write "" "$2" && review_hint "$2"
    ;;
  "" | -*) sed -n '2,12p' "$0"; exit 1 ;;
  *) write "$1" "$2" && review_hint "$2" ;;
esac
