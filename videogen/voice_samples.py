"""Render the same narration in each candidate Kokoro voice so one can be picked by ear.

    CUDA_VISIBLE_DEVICES=1 ~/.venvs/videogen/bin/python videogen/voice_samples.py
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

TEXT = (
    "Why is the sky blue? Sunlight looks white, but it is really a mix of every colour. "
    "When it hits the air, the short blue waves scatter the most, so blue reaches your eyes from every direction."
)
VOICES = {
    "a": ["af_heart", "af_bella", "am_michael", "am_fenrir"],  # American English
    "b": ["bf_emma", "bm_george"],  # British English
}
SR = 24000
out = Path(__file__).parent / "out" / "voices"
out.mkdir(parents=True, exist_ok=True)

for lang, voices in VOICES.items():
    pipe = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    for voice in voices:
        chunks, words = [], []
        offset = 0.0
        for r in pipe(TEXT, voice=voice, speed=1.0):
            chunks.append(r.audio.numpy())
            # Kokoro returns per-token timings: this is what the video will sync to.
            words += [(t.text, offset + t.start_ts) for t in r.tokens if t.start_ts is not None]
            offset += len(chunks[-1]) / SR
        sf.write(out / f"{voice}.wav", np.concatenate(chunks), SR)
        print(f"{voice}: {offset:.1f}s, {len(words)} timed words, first: {words[:3]}", file=sys.stderr)
