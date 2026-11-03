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
| `gen-atlas.cjs` | Page layout: the Map page, one frame per series, paper cards in reading order, and the links within the drawing (see below). |
| `lib.cjs` | Element helpers: `rect`, `text`, `frame`, `connect`, `group`, colours and fonts. |
| `atlas.json` | Extracted paper data that `gen-atlas.cjs` reads. |
| `extract.py` | Parses the Atlas web page into `atlas.json`. |
| `source/` | The script that built the Atlas web page, its data, and the web page itself. |

## Links within the drawing

The drawing uses sketchboard's internal links (`sketchboard:page/<pageId>`, `sketchboard:el/<pageId>/<elementId>`). Page ids are `atlas-0` … `atlas-7`, and element ids come from a seeded generator, so they stay the same between runs.

| From | To |
| --- | --- |
| Map: each series row | that series' frame |
| Map: each tier box | the tier's first page |
| Map: each suggested-order step | the paper's card (the card links on to arXiv); "verl code" goes to the verl resource |
| Every page: ⌂ Map · ← previous · next → buttons | those pages |
| Each series' name (inside its frame) | its row on the Map |
| Page intros, series descriptions and notes | the cards of papers they mention (the `MENTIONS` table) |

Pages register their linkable elements in `reg`, and `fixups` set the links once every page exists. The script then checks that every internal link lands on an element of the page it names, and stops with an error if one doesn't.
