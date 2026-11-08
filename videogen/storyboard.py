"""Topic -> storyboard.json: a narrated script split into scenes, each with visuals cued to spoken words.

    ~/.venvs/videogen/bin/python videogen/storyboard.py "rat race of the humans" videogen/out/rat-race
    ~/.venvs/videogen/bin/python videogen/storyboard.py --review videogen/out/rat-race   # re-check after editing
    ~/.venvs/videogen/bin/python videogen/storyboard.py --ideas "rat race" videogen/projects/rat-race

A project folder (third argument) may hold:
    idea.md     the creator's angle, tone, key points and trusted facts: the script is written from it
    script.md   the narration itself, used word for word ("# Title", then "## Heading" sections or paragraphs)

Also writes review.md: the script with every sentence worth fact-checking marked, and the drawing plan.
Set VIDEOGEN_MODEL to write with a different Ollama model (default qwen3:8b).

Two LLM passes: first the script alone (so the writing isn't squeezed by layout concerns), then the
visuals for each scene against its fixed narration, so every cue can be checked against real words.
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

MODEL = os.environ.get("VIDEOGEN_MODEL", "qwen3:8b")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434") + "/api/chat"

SCRIPT_SCHEMA = {
    "type": "object",
    "required": ["title", "scenes"],
    "properties": {
        "title": {"type": "string"},
        "scenes": {
            "type": "array", "minItems": 6, "maxItems": 6,
            "items": {"type": "object", "required": ["heading", "narration"],
                      "properties": {"heading": {"type": "string"},
                                     "narration": {"type": "string"}}},
        },
    },
}

COLORS = ["blue", "green", "red", "orange", "violet", "gray"]
# Lucide icons the model may pick from (all present in sketchboard's lucide-react). An enum in the schema
# means the model can't name an icon that doesn't exist.
ICONS = """syringe bug shield heart dollar-sign clock rat trophy users globe sun leaf zap book-open lightbulb brain
atom dna microscope flask-conical briefcase house car plane factory tree-pine droplet flame cloud-rain mountain
smartphone laptop wifi graduation-cap scale hourglass target trending-up trending-down chart-column pill stethoscope
apple utensils bed dumbbell footprints sprout recycle wind thermometer battery cpu rocket coins piggy-bank
shopping-cart building-2 landmark gavel handshake message-circle eye ear hand baby user skull bone activity
heart-pulse cookie fish bird dog cat bike bus train-front ship anchor map compass calendar alarm-clock timer music
camera tv gamepad-2 puzzle key lock unlock shield-check triangle-alert circle-check circle-x star crown gift
party-popper smile frown""".split()


def _kind(kind, **fields):
    """One strict shape per visual kind, so fields can't leak from one kind into another."""
    props = {"kind": {"const": kind}, "at": {"type": "string", "maxLength": 28}, **fields}
    return {"type": "object", "required": list(props), "properties": props, "additionalProperties": False}


LABEL = {"type": "string", "maxLength": 28}
VISUAL = {"anyOf": [
    _kind("title", text=LABEL),
    _kind("box", id={"type": "string"}, text=LABEL, color={"enum": COLORS}),
    _kind("arrow", **{"from": {"type": "string"}, "to": {"type": "string"}}, text=LABEL),
    _kind("list", items={"type": "array", "minItems": 2, "maxItems": 4, "items": LABEL}),
    _kind("stat", value={"type": "string", "maxLength": 10}, text=LABEL),
    _kind("compare", left=LABEL, right=LABEL),
    _kind("icon", name={"enum": ICONS}, text=LABEL),
    _kind("cycle", items={"type": "array", "minItems": 3, "maxItems": 4, "items": LABEL}),
    _kind("steps", items={"type": "array", "minItems": 2, "maxItems": 4, "items": LABEL}),
    _kind("highlight", target={"type": "string"}),
]}
VISUALS_SCHEMA = {"type": "object", "required": ["visuals"],
                  "properties": {"visuals": {"type": "array", "minItems": 3, "maxItems": 5, "items": VISUAL}}}

SCRIPT_PROMPT = """You write narration for a 60-90 second vertical educational video (YouTube Shorts).
Topic: {topic}

Structure, one scene each (6 scenes):
1. Hook: a surprising question or fact that makes the viewer stay.
2. What it is: define the idea plainly (and where the term comes from, if known).
3. Why it happens: the mechanism or cause behind it.
4. A concrete example or a real number that makes it tangible.
5. What to do about it: a practical insight the viewer can use.
6. Takeaway: one memorable closing line that ties back to the hook.

Rules:
- Every scene is 3-4 sentences, 35-45 words. The whole script is 210-260 words.
- Spoken English: short sentences, concrete examples, no lists read aloud, no emojis, no stage directions.
- Explain clearly to a curious 16-year-old.
- NEVER invent statistics, percentages, survey results, years, studies or origin stories. If you are not
  certain a fact is true, explain the idea instead. Everyday numbers are fine ("8 hours a day", "5 days a week").
- heading: 2-4 words naming the scene's idea (no "Hook:" or "Scene 1" labels).{brief}"""

BRIEF = """

The creator's brief. Follow its angle, tone, structure and key points over the generic structure above.
Facts it states are verified: use them as given. Do not add facts it doesn't give unless you are certain.
---
{idea}
---"""

HEADINGS_PROMPT = """Give each scene of this narrated video a 2-4 word heading that names its idea.
No "Hook:" or "Scene 1" labels. Return exactly {n} headings, in order.

{scenes}"""

IDEAS_PROMPT = """You are a creative director for a channel of 60-90 second whiteboard explainer videos (YouTube Shorts).
Topic: {topic}

Pitch 5 genuinely different angles on this topic. Make them distinct: e.g. a myth to bust, a surprising
everyday example, a "what if", a story of one person, a visual metaphor that explains the whole idea.
For each:
- title: the video's title, under 8 words
- hook: the first spoken line, a question or surprise that makes the viewer stay
- picture: the one central drawing/metaphor that carries the explanation (an iceberg, a ladder, a loop...)
- outline: 6 beats, one short line each, from the hook to a memorable takeaway
- why: one line on why this angle will hold attention
Never invent statistics, years or studies."""

IDEAS_SCHEMA = {"type": "object", "required": ["ideas"], "properties": {"ideas": {
    "type": "array", "minItems": 5, "maxItems": 5, "items": {
        "type": "object", "required": ["title", "hook", "picture", "outline", "why"],
        "properties": {"title": {"type": "string"}, "hook": {"type": "string"}, "picture": {"type": "string"},
                       "outline": {"type": "array", "minItems": 6, "maxItems": 6, "items": {"type": "string"}},
                       "why": {"type": "string"}}}}}}

VISUALS_PROMPT = """You plan the whiteboard drawings for one scene of a narrated educational short.
The drawing builds up while the narrator speaks; each visual appears when its cue is spoken.

Scene heading: {heading}
Narration: "{narration}"

Visual kinds (portrait phone screen, so keep text very short, max 4 words per label):
- title: {{text}} a 2-4 word headline that names the idea (your own words, not copied from the narration)
- box: {{id, text, color}} a labelled shape; label it with the word(s) the narrator uses for it
- arrow: {{from, to, text?}} connects two box ids defined earlier in this scene
- list: {{items}} 2-4 very short bullet points, each using words the narrator says
- stat: {{value, text}} a big number with a caption, e.g. value "8 hrs", text "at work daily"
- compare: {{left, right}} two contrasting ideas side by side
- icon: {{name, text}} one big picture of a concrete thing (a syringe, a brain, coins) with a short caption.
  name is one of: {icons}
- cycle: {{items}} 3-4 stages that loop back to the start (a habit loop, the water cycle)
- steps: {{items}} 2-4 stages in order, one leading to the next (a process, a timeline)
- highlight: {{target}} circles a box id defined earlier, to stress the key idea when the narrator stresses it

Rules:
- At most {max_visuals} visuals, in the order they are spoken. Start with a title. Every visual has a different cue.
- "at" is the cue: 2 to 5 consecutive words copied exactly from the narration, at the moment the visual
  should appear. Never a whole sentence.
- An arrow's from/to must be ids of boxes listed BEFORE the arrow. Arrow text may be "".
- Draw what the narration explains, not decoration: a loop -> cycle, a process -> steps, cause and effect ->
  boxes + arrow, a contrast -> compare, a concrete object -> icon, a number -> stat.
- Use at most one of list / cycle / steps per scene.
- colors: {colors}.{notes}"""


def chat(prompt, schema):
    body = {"model": MODEL, "messages": [{"role": "user", "content": prompt}], "format": schema,
            "think": False, "stream": False, "options": {"temperature": 0.7}}
    req = urllib.request.Request(OLLAMA, json.dumps(body).encode(), {"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.loads(json.loads(r.read())["message"]["content"])


def cue_pos(cue, narration):
    """Character position of the cue in the narration (ignoring case and punctuation), or -1."""
    norm = lambda s: " ".join(re.sub(r"[^a-z0-9 ]", " ", s.lower().replace("’", "").replace("'", "")).split())
    return f" {norm(narration)} ".find(f" {norm(cue)} ")


def check_visuals(visuals, narration):
    # The model rarely lists cues in spoken order, so sort them here instead of retrying for it.
    visuals.sort(key=lambda v: cue_pos(v["at"], narration))
    problems, last = [], -1
    # Arrows and highlights only need their boxes somewhere in the scene: the layout waits for them.
    boxes = {v["id"] for v in visuals if v["kind"] == "box"}
    for v in visuals:
        if v["kind"] == "title":
            continue  # a title always opens its scene, so its cue doesn't matter
        pos = cue_pos(v["at"], narration)
        if len(v["at"].split()) > 6:
            problems.append(f"cue {v['at']!r} longer than 6 words")
        elif pos < 0:
            problems.append(f"cue {v['at']!r} not spoken")
        elif pos <= last:
            problems.append(f"cue {v['at']!r} reused")
        last = max(last, pos)
        if v["kind"] == "compare":
            # Small models sometimes abbreviate a box label ("comp" for "Comparison") instead of writing one.
            labels = [x["text"].lower() for x in visuals if x["kind"] == "box"]
            for side in (v["left"], v["right"]):
                if len(side) < 3 or any(l != side.lower() and l.startswith(side.lower()) for l in labels):
                    problems.append(f"compare label {side!r} is truncated")
        # A number on screen is a claim too: it must be one the narrator says (so it gets reviewed with them).
        shown = " ".join(str(x) for k, x in v.items() if k not in ("kind", "at", "id", "from", "to", "target", "color", "name"))
        for num in re.findall(r"\d[\d,.]*", shown):
            if num.rstrip(".,").replace(",", "") not in narration.replace(",", ""):
                problems.append(f"{v['kind']} shows {num!r}, which the narrator never says")
        if v["kind"] == "arrow" and not {v["from"], v["to"]} <= boxes:
            problems.append(f"arrow {v['from']}->{v['to']} to a missing box")
        if v["kind"] == "highlight" and v["target"] not in boxes:
            problems.append(f"highlight of missing box {v['target']!r}")
    return problems


def drop_dangling(visuals):
    """Last resort after the retries: arrows and highlights need their boxes, so drop the ones that can't be drawn."""
    drawn = {v["id"] for v in visuals if v["kind"] == "box"}
    return [v for v in visuals
            if (v["kind"] != "arrow" or {v["from"], v["to"]} <= drawn) and (v["kind"] != "highlight" or v["target"] in drawn)]


# Sentences a small model is likely to get wrong: numbers, dates, research claims, origins, superlatives.
RISKY = re.compile(r"\d|percent|million|billion|thousand|hundred|stud(y|ies)|research|scientist|survey|according"
                   r"|invent|discover|found(ed|er)|named after|comes? from|origin|first|oldest|largest|biggest"
                   r"|most |every year|history|ancient|century", re.I)


def write_review(board, out):
    """review.md: what a human should read before the video is made."""
    lines = [f"# {board['title']}", "",
             *([f"Script: {board['source']}.", ""] if board.get("source") else []),
             "Read the script. Every ⚠ sentence makes a factual claim the model may have invented:",
             "check it, then fix or soften it in storyboard.json (the `narration` of that scene).",
             "Every ❗ is a drawing that won't line up with the voice: fix it or delete that drawing.",
             "Drawings can be edited there too. Then run: videogen/make_video.sh --render " + out.name, ""]
    flagged = 0
    for i, s in enumerate(board["scenes"], 1):
        lines += [f"## {i}. {s['heading']}", ""]
        for sentence in re.split(r"(?<=[.!?])\s+", s["narration"].strip()):
            risky = bool(RISKY.search(sentence))
            flagged += risky
            lines.append(f"- {'⚠ ' if risky else ''}{sentence}")
        lines += ["", "Drawings:"]
        for v in s.get("visuals", []):
            what = {k: x for k, x in v.items() if k not in ("kind", "at")}
            lines.append(f"- `{v['kind']}` on \"{v['at']}\": {json.dumps(what, ensure_ascii=False)}")
        problems = check_visuals(list(s.get("visuals", [])), s["narration"])
        lines += [f"- ❗ {p}" for p in problems] + [""]
    (out / "review.md").write_text("\n".join(lines))
    print(f"{flagged} sentence(s) to fact-check -> {out / 'review.md'}", file=sys.stderr)


def review(out_dir):
    """Re-check a storyboard after it was edited by hand."""
    out = Path(out_dir)
    board = json.loads((out / "storyboard.json").read_text())
    for s in board["scenes"]:
        s["visuals"] = drop_dangling(s.get("visuals", []))
    write_review(board, out)


def parse_script(text):
    """script.md -> (title, scenes) without changing a single spoken word.

    "# Title" on the first line is optional. Scenes are "## Heading" sections, else paragraphs; one long
    paragraph is split at sentence ends into scenes of about 35 words. Markdown emphasis marks are dropped
    (they are formatting, not words) and line breaks inside a scene become spaces.
    """
    lines = text.strip().splitlines()
    title = lines.pop(0)[2:].strip() if lines and lines[0].startswith("# ") else None
    body = "\n".join(lines)
    clean = lambda t: " ".join(re.sub(r"[*_`>]", "", t).split())
    if re.search(r"^## ", body, re.M):
        parts = re.split(r"^## +(.+)$", body, flags=re.M)
        scenes = [{"heading": h.strip(), "narration": clean(t)} for h, t in zip(parts[1::2], parts[2::2]) if t.strip()]
        if parts[0].strip():
            scenes.insert(0, {"heading": "", "narration": clean(parts[0])})
    else:
        paras = [clean(p) for p in re.split(r"\n\s*\n", body) if p.strip()]
        if len(paras) == 1:
            sentences = re.split(r"(?<=[.!?])\s+", paras[0])
            k = max(3, min(8, round(len(paras[0].split()) / 35)))
            per = len(paras[0].split()) / k
            paras, cur = [], []
            for sentence in sentences:
                cur.append(sentence)
                if sum(len(x.split()) for x in cur) >= per and len(paras) < k - 1:
                    paras.append(" ".join(cur))
                    cur = []
            paras += [" ".join(cur)] if cur else []
        scenes = [{"heading": "", "narration": p} for p in paras]
    return title, scenes


def read_project(project):
    """(idea text, script text) from a project folder; either may be None."""
    if not project:
        return None, None
    d = Path(project)
    read = lambda name: (d / name).read_text().strip() if (d / name).is_file() and (d / name).read_text().strip() else None
    return read("idea.md"), read("script.md")


def topic_of(topic, idea, script):
    """The topic, falling back to the first line of script.md or idea.md."""
    for text in (topic, script, idea):
        if text:
            return text.strip().splitlines()[0].lstrip("# ").strip()
    raise SystemExit("give a topic, or a project folder with idea.md or script.md")


def write_script(topic, idea):
    count = lambda b: sum(len(s["narration"].split()) for s in b["scenes"])
    prompt = SCRIPT_PROMPT.format(topic=topic, brief=BRIEF.format(idea=idea[:3000]) if idea else "")
    board = None
    for _ in range(4):  # small models undershoot word counts; keep the longest of a few tries
        b = chat(prompt, SCRIPT_SCHEMA)
        if board is None or count(b) > count(board):
            board = b
        if count(board) >= 190:
            break
    return board


def use_script(script, topic):
    """The creator's own narration, word for word; the model only names scenes that have no heading."""
    title, scenes = parse_script(script)
    missing = [i for i, s in enumerate(scenes) if not s["heading"]]
    if missing:
        listing = "\n".join(f"{n + 1}. {scenes[i]['narration']}" for n, i in enumerate(missing))
        schema = {"type": "object", "required": ["headings"], "properties": {"headings": {
            "type": "array", "minItems": len(missing), "maxItems": len(missing), "items": {"type": "string"}}}}
        for i, h in zip(missing, chat(HEADINGS_PROMPT.format(n=len(missing), scenes=listing), schema)["headings"]):
            scenes[i]["heading"] = h
    words = sum(len(s["narration"].split()) for s in scenes)
    if not 150 <= words <= 300:
        print(f"  NOTE: script.md has {words} words: about {words / 2.6:.0f}s of speech (60-90s is 160-240 words)", file=sys.stderr)
    return {"title": title or topic, "source": "script.md (used word for word)", "scenes": scenes}


def main(topic, out_dir, project=None):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    idea, script = read_project(project)
    topic = topic_of(topic, idea, script)
    board = use_script(script, topic) if script else write_script(topic, idea)
    if idea and not script:
        board["source"] = "written from idea.md"
    words = sum(len(s["narration"].split()) for s in board["scenes"])
    print(f"{board['title']!r}: {len(board['scenes'])} scenes, {words} words"
          + (f" ({board['source']})" if board.get("source") else ""), file=sys.stderr)

    notes = f"\n- The creator's notes for this video (honour its visual ideas):\n{idea[:1500]}" if idea else ""
    for i, scene in enumerate(board["scenes"]):
        # About one drawing per 7 spoken words, so a short scene isn't crammed (title included).
        n = max(3, min(5, len(scene["narration"].split()) // 7))
        schema = json.loads(json.dumps(VISUALS_SCHEMA))
        schema["properties"]["visuals"].update(minItems=min(3, n), maxItems=n)
        for attempt in range(3):
            prompt = VISUALS_PROMPT.format(colors=", ".join(COLORS), icons=", ".join(ICONS), max_visuals=n, notes=notes, **scene)
            visuals = chat(prompt, schema)["visuals"]
            problems = check_visuals(visuals, scene["narration"])
            if not problems:
                break
        scene["visuals"] = drop_dangling(visuals)
        print(f"  scene {i + 1} {scene['heading']!r}: {len(visuals)} visuals, {attempt + 1} tries"
              + (f"  STILL: {problems}" if problems else ""), file=sys.stderr)

    (out / "storyboard.json").write_text(json.dumps(board, indent=2, ensure_ascii=False))
    write_review(board, out)


def ideas(topic, project):
    """Pitch 5 angles on a topic into <project>/ideas.md, for the creator to pick one as idea.md."""
    d = Path(project)
    d.mkdir(parents=True, exist_ok=True)
    pitches = chat(IDEAS_PROMPT.format(topic=topic), IDEAS_SCHEMA)["ideas"]
    lines = [f"# Ideas: {topic}", "",
             "Pick one: copy its block (from its ## line to the next) into idea.md in this folder, edit it",
             "as you like, then run: videogen/make_video.sh --project " + d.name, ""]
    for n, idea in enumerate(pitches, 1):
        lines += [f"## {n}. {idea['title']}", "", f"**Hook:** {idea['hook']}", "",
                  f"**Central picture:** {idea['picture']}", "", "**Outline:**"]
        lines += [f"{k}. {beat}" for k, beat in enumerate(idea["outline"], 1)]
        lines += ["", f"_Why it works: {idea['why']}_", ""]
    (d / "ideas.md").write_text("\n".join(lines))
    print(f"5 ideas -> {d / 'ideas.md'}", file=sys.stderr)


if __name__ == "__main__":
    if sys.argv[1] == "--review":
        review(sys.argv[2])
    elif sys.argv[1] == "--ideas":
        ideas(sys.argv[2], sys.argv[3])
    else:  # TOPIC OUT [PROJECT]; TOPIC may be "" when the project has idea.md or script.md
        main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
