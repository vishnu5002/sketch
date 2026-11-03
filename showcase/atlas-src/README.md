# LLM Paper Atlas: generator

Rebuilds `../llm-paper-atlas.sketchboard.json`. Each step's output is byte-for-byte reproducible.

```
source/data.py + source/verified.json
  → source/build.py   → source/llm-paper-atlas.html   (the Atlas web page)
  → extract.py        → atlas.json                    (4 tiers, 22 series, 200 papers)
  → gen-atlas.cjs     → ../llm-paper-atlas.sketchboard.json
```

## Regenerate the drawing (the usual case)

Run this after changing the layout in `gen-atlas.cjs` or the helpers in `lib.cjs`.

```bash
node gen-atlas.cjs ../llm-paper-atlas.sketchboard.json
```

Then import the file in sketchboard (Home → Open file…).

## Change the paper list

Edit `source/data.py`, then run from this folder:

```bash
python3 source/build.py source source/llm-paper-atlas.html
python3 extract.py source/llm-paper-atlas.html   # writes atlas.json in the current folder
node gen-atlas.cjs ../llm-paper-atlas.sketchboard.json
```

`source/verify.py` and `source/recent.py` query the arXiv API. They were used to check paper details and to find recent papers.

## Files

| File | Purpose |
| --- | --- |
| `gen-atlas.cjs` | Page layout: the Map page, one frame per series, paper cards in reading order. The Map rows' `→ page N` text is built on line 214. |
| `lib.cjs` | Element helpers: `rect`, `text`, `frame`, `connect`, `group`, colours and fonts. |
| `atlas.json` | Extracted paper data that `gen-atlas.cjs` reads. |
| `extract.py` | Parses the Atlas web page into `atlas.json`. |
| `source/` | The script that built the Atlas web page, its data, and the web page itself. |
