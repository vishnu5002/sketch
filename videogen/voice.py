"""The channel voice: 70% bm_george + 30% am_michael, spoken with British pronunciation."""
import numpy as np
from kokoro import KPipeline

SR = 24000
SPEED = 1.0
_pipe = None
_voice = None


def _load():
    global _pipe, _voice
    if _pipe is None:
        # George leads the blend, so use the British G2P (lang "b").
        _pipe = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M")
        _voice = 0.7 * _pipe.load_voice("bm_george") + 0.3 * _pipe.load_voice("am_michael")
    return _pipe, _voice


def speak(text):
    """Return (audio float32 @ SR, [(word, start_s, end_s)]) with times from the start of `text`."""
    pipe, voice = _load()
    chunks, words, offset = [], [], 0.0
    for r in pipe(text, voice=voice, speed=SPEED):
        audio = r.audio.numpy()
        for t in r.tokens:
            if t.start_ts is not None and any(c.isalnum() for c in t.text):
                words.append((t.text, round(offset + t.start_ts, 3), round(offset + t.end_ts, 3)))
        chunks.append(audio)
        offset += len(audio) / SR
    return np.concatenate(chunks), words
