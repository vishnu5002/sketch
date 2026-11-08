"""storyboard.json + words.json -> timeline.json: the second at which each visual starts drawing.

    ~/.venvs/videogen/bin/python videogen/timeline.py videogen/out/rat-race
"""
import json
import re
import sys
from pathlib import Path

LEAD = 0.25  # start drawing this long before the cue word: the stroke takes time, so it lands on the word
FALLBACK_GAP = 1.0  # seconds after the previous visual, for a cue that isn't in the narration
MIN_GAP = 0.6  # two visuals never start closer than this, so each one is seen arriving


def norm(word):
    return re.sub(r"[^a-z0-9]", "", word.lower().replace("’", "'"))


def cue_time(cue, words, scene_start, prev_time):
    """When should the visual cued by `cue` start drawing?

    cue         the phrase the LLM picked, e.g. "money and status" (may not match the narration exactly)
    words       this scene's spoken words: [[word, start_s, end_s], ...] in narration-wide seconds
    scene_start when this scene's audio begins
    prev_time   when the previous visual in this scene started (scene_start for the first one)
    """
    target = [w for w in map(norm, cue.split()) if w]
    spoken = [norm(w) for w, _, _ in words]
    best, best_i = 0, None
    for i in range(len(spoken)):
        # How many cue words appear in a window the cue's length (+1, for a word the LLM dropped);
        # the first word counts double so the drawing starts where the phrase starts.
        # A cue word may be cut short ("non" for "nonstop"), so it matches the start of a spoken word.
        window = spoken[i:i + len(target) + 1]
        score = sum(any(s.startswith(w) for s in window) for w in target) + spoken[i].startswith(target[0])
        # Strictly better only: ties keep the earliest occurrence that isn't before the previous visual.
        if score > best and words[i][1] >= prev_time - LEAD:
            best, best_i = score, i
    if best_i is None or best < (len(target) + 1) / 2:
        # Not spoken: appear shortly after the previous visual so drawings never pile up at one instant.
        last = words[-1][1] if words else scene_start
        print(f"  cue {cue!r} not found, placing after the previous visual", file=sys.stderr)
        return max(min(prev_time + FALLBACK_GAP, last), prev_time + MIN_GAP)
    # The scene's first visual may start with the scene; later ones keep MIN_GAP from the one before.
    floor = scene_start if prev_time == scene_start else prev_time + MIN_GAP
    return max(words[best_i][1] - LEAD, floor)


def spoken_at(label, words, after):
    """Start time of `label` where the narrator actually says it (first time at/after `after`), else None.

    The label's words must be spoken in order, at most one extra word apart ("memory cells" matches
    "memory B cells"); a label word may be a prefix of the spoken one ("vaccine" matches "vaccines").
    """
    target = [w for w in map(norm, label.split()) if w]
    spoken = [norm(w) for w, _, _ in words]
    if not target:
        return None
    for i, (_, start, _) in enumerate(words):
        if start < after - LEAD or not spoken[i].startswith(target[0]):
            continue
        j, ok = i, True
        for w in target[1:]:
            nxt = next((k for k in range(j + 1, min(j + 3, len(spoken))) if spoken[k].startswith(w)), None)
            if nxt is None:
                ok = False
                break
            j = nxt
        if ok:
            return start
    return None


def place(t, prev, scene_start):
    """Draw slightly ahead of the word, never before the previous visual (keeping MIN_GAP after it)."""
    floor = scene_start if prev == scene_start else prev + MIN_GAP
    return round(max(t - LEAD, floor), 3)


def time_visual(v, words, scene_start, prev):
    """The drawing appears when what it SHOWS is said; the LLM's cue is only the fallback.

    The LLM tends to cue the start of a sentence ("to recognize and attack") rather than the thing drawn
    ("immune system"), so a label that is actually spoken wins over its cue.
    """
    v = dict(v)
    if v["kind"] in ("list", "cycle", "steps"):
        # Each item is written when it is said; unspoken ones are staggered by the layout.
        v["item_t"], after = [], prev
        for item in v["items"]:
            at = spoken_at(item, words, after)
            v["item_t"].append(None if at is None else place(at, after, scene_start))
            after = at if at is not None else after
        first = v["item_t"][0]
        v["t"] = first if first is not None else cue_time(v["at"], words, scene_start, prev)
        return v
    if v["kind"] == "compare":
        lt, rt = spoken_at(v["left"], words, prev), None
        v["t"] = place(lt, prev, scene_start) if lt is not None else cue_time(v["at"], words, scene_start, prev)
        rt = spoken_at(v["right"], words, v["t"])
        v["right_t"] = None if rt is None else place(rt, v["t"], scene_start)
        return v
    if v["kind"] == "title":
        v["t"] = scene_start  # the title opens the scene
        return v
    labels = {"box": [v.get("text")], "arrow": [v.get("text")], "stat": [v.get("value")],
              "icon": [v.get("text"), v.get("name", "").replace("-", " ")]}.get(v["kind"], [])
    at = next((t for t in (spoken_at(l, words, prev) for l in labels if l) if t is not None), None)
    v["t"] = place(at, prev, scene_start) if at is not None else cue_time(v["at"], words, scene_start, prev)
    return v


def main(out_dir):
    out = Path(out_dir)
    board = json.loads((out / "storyboard.json").read_text())
    timing = json.loads((out / "words.json").read_text())
    scenes = []
    for scene, t in zip(board["scenes"], timing["scenes"]):
        prev, visuals = t["start"], []
        for v in scene["visuals"]:
            v = time_visual(v, t["words"], t["start"], prev)
            prev = v["t"]
            visuals.append(v)
        visuals.sort(key=lambda v: v["t"])
        scenes.append({"heading": scene["heading"], "start": t["start"], "end": t["end"], "visuals": visuals})
        print(f"{scene['heading']!r}: " + ", ".join(f"{v['kind']}@{v['t']}" for v in visuals), file=sys.stderr)
    (out / "timeline.json").write_text(json.dumps({"duration": timing["duration"], "scenes": scenes}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
