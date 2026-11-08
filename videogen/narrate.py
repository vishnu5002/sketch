"""storyboard.json -> narration.wav + words.json (every spoken word with its time, per scene).

    CUDA_VISIBLE_DEVICES=1 ~/.venvs/videogen/bin/python videogen/narrate.py videogen/out/rat-race
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from voice import SR, speak

PAUSE = 0.45  # seconds of silence between scenes, so each drawing has a beat to land


def main(out_dir):
    out = Path(out_dir)
    board = json.loads((out / "storyboard.json").read_text())
    audio, scenes, t = [], [], 0.0
    gap = np.zeros(int(PAUSE * SR), dtype=np.float32)
    for scene in board["scenes"]:
        clip, words = speak(scene["narration"])
        scenes.append({"start": round(t, 3), "end": round(t + len(clip) / SR, 3),
                       "words": [[w, round(t + a, 3), round(t + b, 3)] for w, a, b in words]})
        audio += [clip, gap]
        t += len(clip) / SR + PAUSE
    sf.write(out / "narration.wav", np.concatenate(audio), SR)
    (out / "words.json").write_text(json.dumps({"duration": round(t, 3), "scenes": scenes}, indent=1))
    print(f"{t:.1f}s narration, {sum(len(s['words']) for s in scenes)} timed words", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
