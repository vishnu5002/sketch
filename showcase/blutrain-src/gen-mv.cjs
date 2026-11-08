// Builds the "Math verifier, explained" sketchboard showcase.
// Source of truth: /home/blubridge-029/RLVR-main/RL/BluTrain/RL/src/reward/verifiers/MathEquivalenceVerifier.cpp
// and its docs, tests and parity data. First read 2026-11-05 morning; updated for the fixes made at 12:20 the same
// day. Every example's method and score was checked by running math_verifier_cli built from the current source.
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame } = L;
const { K, box, card, code, h2, small, label, arrow, poly, table, plot, bars, pagesKit, files } = require("./kit.cjs");

// Stages: extract = blue, normalize = teal, structure = grape, relations = violet, parser = orange,
// compare = green, failure / bugs = red.
const PAGE_NAMES = [
  "0 · Overview",
  "1 · Extraction",
  "2 · Normalization",
  "3 · Structure",
  "4 · Relations & expressions",
  "5 · Lexer & parser",
  "6 · Comparison",
  "7 · Methods & examples",
  "8 · Parity with math-verify",
  "9 · Bugs, limits & files",
];
const ACCENT = [C.orange, C.blue, C.teal, C.grape, C.violet, C.orange, C.green, C.dim, C.blue, C.red];
const kit = pagesKit("mv", PAGE_NAMES, ACCENT);
const { LINK, write } = kit;
// usage: node gen-mv.cjs <out.json> [verifiersDrawingId] — links back into "BluTrain reward verifiers, explained"
// (ids differ per sketchboard instance; the default is that drawing in the dev instance).
const RV_DRAWING = process.argv[3] || "44f2f768-b5f3-4a20-8b92-5a1c09501931";
const RV = (page = 0) => `sketchboard:p/${RV_DRAWING}/rv-${page}`;
/** Every page's header, plus a chip into the all-verifiers drawing next to the navigation buttons. */
const header = (pi, title, sub) => [
  ...kit.header(pi, title, sub),
  rect(1560, -72, 400, 40, { text: "↗ All BluTrain verifiers (math = page 7)", link: RV(7), font: FONT.body, size: 15, bg: C.bOrange, stroke: C.orange, sw: 1, rough: 0, color: C.ink, locked: true }),
];
const ST = { extract: "rollout", normalize: "data", structure: "replay", relation: "driver", parser: "reward", compare: "trainer", fail: "sync" };
const SRC = "src/reward/verifiers/MathEquivalenceVerifier.cpp";

/** A vertical ladder of cards joined by arrows; returns the cards. */
function ladder(els, x, y, w, items, gap = 20) {
  const out = [];
  for (const [t, k, o] of items) {
    const r = card(x, y, w, t, k, o);
    out.push(r);
    y += r.height + gap;
  }
  els.push(...out);
  for (let i = 0; i < out.length - 1; i++) els.push(arrow(out[i], out[i + 1], "gray", { sw: 1.5 }));
  return out;
}
/** Example table: [input, output, ok?] rows → green/red last column. */
function exTable(x, y, cols, rows, size = 14) {
  return table(x, y, cols, [rows[0], ...rows.slice(1).map((r) => r.slice(0, cols.length))], {
    size,
    cellBg: (ri, ci) => (ci === cols.length - 1 && rows[ri][cols.length] !== undefined ? (rows[ri][cols.length] ? C.bGreen : C.bRed) : "#ffffff"),
  });
}

// ======================================================================
// 0 · Overview
// ======================================================================
function overview() {
  const els = header(0, "The math verifier — how it works", "MathEquivalenceVerifier: a pure-C++ port of HF math-verify that turns a model's answer into a 0/1 reward for GRPO");
  els.push(small(0, 156, "Read from RL/src/reward/verifiers/MathEquivalenceVerifier.cpp (1671 lines, source as of 11-05 16:57), its tests, docs and parity data. Boxes with a page number jump there (click in view mode, Ctrl+click while editing)."));

  els.push(frame(0, 230, 1180, 1340, "score(response, ground_truth) — the pipeline"));
  const resp = box(40, 290, 320, 90, "model response\n(detokenized rollout)", "gray");
  const gt = box(820, 290, 320, 90, "ground truth\n(last \\boxed{} or as is)", "gray");
  const ex = box(40, 430, 320, 110, "1 · extract()\nlast \\boxed{} → \"final answer is\" → \"answer:\" → $…$ → short answer-like tail → last number", ST.extract, { size: 15, link: LINK.page(1) });
  const nm = box(400, 600, 380, 100, "2 · normalize()  (both sides)\n\\left, \\dfrac, units, \\text{}, unicode, and/or, %", ST.normalize, { size: 15, link: LINK.page(2) });
  const sc = rect(430, 750, 320, 120, { text: "compact strings\nequal?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  sc.type = "diamond";
  const ch = rect(430, 920, 320, 120, { text: "ground truth is\na choice (A–E)?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  ch.type = "diamond";
  const chb = box(820, 940, 320, 90, "multiple-choice rules\nletter, then value", ST.structure, { size: 16, link: LINK.page(4) });
  const shp = box(400, 1090, 380, 100, "3 · answers_equal()\nsets · tuples · intervals · matrices · ±", ST.structure, { size: 15, link: LINK.page(3) });
  const rel = box(400, 1230, 380, 90, "4 · relations & expressions\n=, <, ≤, ≈ · ratios · % retry", ST.relation, { size: 15, link: LINK.page(4) });
  const prs = box(40, 1230, 300, 90, "5 · lexer + parser\nLaTeX → SymEngine", ST.parser, { size: 15, link: LINK.page(5) });
  const cmp = box(400, 1370, 380, 100, "6 · sym_equal()\nexact · expand · decimals exact · 7 probes", ST.compare, { size: 15, link: LINK.page(6) });
  els.push(resp, gt, ex, nm, sc, ch, chb, shp, rel, prs, cmp);
  els.push(arrow(resp, ex, ST.extract), arrow(ex, nm, ST.normalize), arrow(gt, nm, ST.normalize), arrow(nm, sc), arrow(sc, ch), arrow(ch, chb, ST.structure), arrow(ch, shp, ST.structure), arrow(shp, rel, ST.relation), arrow(rel, cmp, ST.compare), connect(rel, prs, { stroke: K.reward.s, sw: 2, end: "triangle", start: "triangle", rough: 0.5 }));
  // outcome chips
  const out = (x, y, t, k) => {
    const r = box(x, y, 170, 60, t, k, { font: FONT.code, size: 16 });
    els.push(r);
    return r;
  };
  const oNo = out(40, 600, "no_answer · 0", ST.fail);
  const oStr = out(820, 780, "string · 1", ST.compare);
  const oCh = out(970, 1060, "choice · 1/0", ST.structure);
  const oSym = out(860, 1300, "sym · 1", ST.compare);
  const oMis = out(860, 1390, "mismatch · 0", ST.fail);
  const oUnp = out(40, 1390, "unparsed · 0", ST.fail);
  const oLong = out(40, 820, "too_long · 0", ST.fail);
  const oErr = out(40, 1480, "error · 0", ST.fail);
  els.push(arrow(ex, oNo, ST.fail, { dash: "dashed" }), arrow(sc, oStr, ST.compare), arrow(chb, oCh, ST.structure), arrow(cmp, oSym, ST.compare), arrow(cmp, oMis, ST.fail), arrow(prs, oUnp, ST.fail, { dash: "dashed" }), arrow(sc, oLong, ST.fail, { dash: "dashed" }));
  els.push(label(372, 560, "nothing found /\nempty after normalize"), label(770, 760, "yes"), label(600, 1055, "no"), label(780, 940, "yes"), label(150, 1335, "parser refused"), label(225, 780, "no, and a side\n> 1024 chars"), label(225, 1490, "any exception inside score()\n(caught since 11-05)"));

  // right column
  const RX = 1280;
  els.push(h2(RX, 230, "Where it runs"));
  els.push(card(RX, 290, 680, "On a RewardLoopWorker thread, once per rollout\nVerifierRegistry maps type \"math\" → one shared MathEquivalenceVerifier; reward.verifiers maps each data_source to a type. RolloutWorker::agent_loop_postprocess decodes the response and queues it; the reward thread scores it. The 0/1 score is written to rm_scores[R−1] (the last response token); extra_info carries acc, pred (raw extracted answer) and method; since 11-05 the method is also written to each line of rollouts_<pid>.jsonl.", ST.extract));
  els.push(card(RX, 470, 680, "Built with SymEngine + GMP only\nSymEngine has no LaTeX parser, so the file has its own recursive-descent parser that builds SymEngine objects; SymEngine supplies canonical form, expand, substitution and numeric evaluation. Static libsymengine (WITH_SYMENGINE_THREAD_SAFE=ON). make math_verifier_cli builds a JSONL CLI with no CUDA or Ray.", ST.compare));
  els.push(h2(RX, 680, "Pages"));
  const idx = [
    [1, ST.extract, "Six extraction strategies, in priority order"],
    [2, ST.normalize, "Every normalization rule, with before → after"],
    [3, ST.structure, "shape_of: sets, tuples, intervals, matrices, ±"],
    [4, ST.relation, "Equations, inequalities, ratios, %, choices"],
    [5, ST.parser, "Tokens, grammar, a parse tree, guards"],
    [6, ST.compare, "sym_equal ladder and the 7 probe points"],
    [7, "gray", "Method labels + 26 verified examples"],
    [8, ST.extract, "Parity harness, numbers, divergences"],
    [9, ST.fail, "False rewards, limits, performance, files"],
  ];
  idx.forEach(([pg, k, d], i) => els.push(card(RX + (i % 2) * 345, 740 + Math.floor(i / 2) * 92, 335, `${PAGE_NAMES[pg]}\n${d}`, k, { size: 14, link: LINK.page(pg) })));
  els.push(sticky(RX, 1220, 680, "Still open (verified on the 11-05 build)\n• Letters are commutative symbols: \"dog\" scores 1 against \"god\".\n• % strip-and-retry: \\boxed{1\\%} scores 1 against 1.\n• Same option letter + an unparsable value still scores 1.\n• No YAML in the repo uses type: math yet (grpo_rlvr.yaml still says math_equivalence).  →  page 9", { size: 16, font: FONT.body, bg: C.bYellow, link: LINK.page(9) }));

  // what changed
  els.push(h2(0, 1640, "What changed on 11-05  (morning build → 12:20 and 16:57 builds, same inputs)"));
  const T = table(0, 1700, [{ w: 330 }, { w: 520, code: true }, { w: 200 }, { w: 200 }, { w: 690 }], [
    ["area", "example", "before", "now", "how"],
    ["exact numbers", "\\boxed{20001} vs 20000", "sym · 1", "mismatch · 0", "two terminating decimals (integers included) must be identical — no tolerance"],
    ["exact numbers", "\\boxed{6172.5} vs 6172.6", "sym · 1", "mismatch · 0", "same rule; rtol 1e-4 is kept only for a rounded form of a non-terminating value (0.3333 vs 1/3)"],
    ["short answers", "The answer is 5  vs 5", "unparsed · 0", "string · 1", "a ≤ 64-char tail is taken whole only if it reads like an answer; a sentence goes to the last-number rule"],
    ["escaped dollars", "It costs \\$5 and then \\$6  vs 6", "mismatch · 0", "string · 1", "\\$ is no longer a math delimiter"],
    ["huge powers", "\\boxed{(9^{10000})^{10000}} vs 1", "mismatch · 0", "unparsed · 0", "kMaxPowBits = 1e6 refuses it; kMaxExpandTerms = 5000 skips expand() for (a+…+h)^50"],
    ["robustness", "any exception in score()", "rollout fails", "error · 0", "score() catches everything; answers over 1024 chars → too_long (exact string match only)"],
    ["wiring / logs", "rollouts_<pid>.jsonl", "—", "\"method\": …", "scored on RewardLoopWorker threads via VerifierRegistry; the log records how each reward was decided"],
    ["long decimals (16:57)", "\\boxed{1.139535} vs 1.13953488372093", "mismatch · 0", "sym · 1", "exact decimals may differ when one has > 6 places and they agree to ~1e-6"],
    ["long answers (16:57)", "a 400-term sum vs 400x", "unparsed · 0", "sym · 1", "kMaxAnswerLen 256 → 1024 characters"],
    ["probing (16:57)", "free-symbol expressions", "5 points, rtol 1e-4", "7 points, rtol 1e-9", "1e-4 only when a side contains a written decimal; equations use 9 points"],
  ], { size: 14, cellBg: (ri, ci) => (ri > 0 && ci === 3 ? C.bGreen : ri > 0 && ci === 2 ? C.lGray : "#ffffff") });
  els.push(...T.els);
  els.push(note(0, 1700 + T.h + 10, 1960, "Also new: tests/unit/test_verifiers.cpp has 147 score assertions (was 114) and passes; scripts/math_verifier_metamorphic.py checks the verifier without labels (page 8); data/math_parity was regenerated with the new CLI.", { size: 15, color: C.dim }));
  els.push(rect(RX, 1450, 680, 100, { text: "↗ Part of \"BluTrain reward verifiers, explained\" — open its overview", link: RV(0), font: FONT.body, size: 18, bold: true, bg: C.bOrange, stroke: C.orange, sw: 2, rough: 0.6, color: C.ink }));
  return els;
}

// ======================================================================
// 1 · Extraction
// ======================================================================
function extractPage() {
  const els = header(1, "Extraction", "extract(): find the one string in a long chain-of-thought that is the model's answer");
  els.push(h2(0, 200, "Before any search"));
  const pre = [
    box(0, 270, 320, 90, "drop <|…|> spans\n(tokenizer special tokens)", ST.extract, { size: 16 }),
    box(380, 270, 320, 90, "keep text after the\nLAST </think>", ST.extract, { size: 16 }),
    box(760, 270, 320, 90, "keep the last 4000 chars\n(kTailChars)", ST.extract, { size: 16 }),
    box(1140, 270, 320, 90, "lowercase copy for\nmarker searches", ST.extract, { size: 16 }),
  ];
  els.push(...pre);
  for (let i = 0; i < 3; i++) els.push(arrow(pre[i], pre[i + 1], ST.extract));
  els.push(note(1500, 270, 460, "An unterminated <think> is left as is. Everything before the last </think> — including any \\boxed{} in the reasoning — is ignored.", { size: 15, color: C.dim }));

  els.push(h2(0, 440, "Six strategies — the first hit wins"));
  const strat = [
    ["1. last \\boxed{…} or \\fbox{…}", "the later of the two; brace-matched; \"\\boxed 5\" (space form) reads to the next $ or newline. Unbalanced braces → no box.", "…so \\boxed{\\frac{3}{4}}.", "\\frac{3}{4}"],
    ["2. after the last \"final answer is\"", "to end of line or \"i hope\"; strips leading : and *, trailing . and *", "The final answer is: 280.", "280"],
    ["3. after the last \"answer:\"", "same rules; also catches \"Final Answer:\"", "**Final Answer:** 19", "19"],
    ["4. last $…$ pair", "content between the last two unescaped $ (\\$5 is money, not math) — only if non-empty", "so we get $x=4$", "x=4"],
    ["5. the whole tail, if ≤ 64 chars and it reads like an answer", "reads_like_answer: at most one word of 3+ letters that isn't a command or math word (sqrt, sin, log, and, …)", "7/2", "7/2"],
    ["6. last number", "scan back to the last digit, extend over [0-9.,] and a leading −", "…which leaves 1,250 apples", "1,250"],
  ];
  strat.forEach(([t, d, inp, out], i) => {
    const y = 510 + i * 120;
    const c = card(0, y, 820, `${t}\n${d}`, ST.extract, { size: 15 });
    els.push(c);
    els.push(rect(870, y + 8, 520, 60, { text: inp, font: FONT.code, size: 14, bg: "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false, align: "left" }));
    els.push(rect(1460, y + 8, 260, 60, { text: out, font: FONT.code, size: 16, bg: C.bGreen, stroke: C.green, sw: 1.5, rough: 0.4 }));
    els.push(poly([{ x: 1395, y: y + 38 }, { x: 1455, y: y + 38 }], { type: "arrow", end: "triangle", stroke: C.dim, sw: 1.5 }));
    if (i < strat.length - 1) els.push(text(380, y + 92, "no hit ↓", { size: 13, color: C.gray }));
  });
  els.push(text(870, 480, "example tail", { size: 15, bold: true, color: C.dim }), text(1460, 480, "pred", { size: 15, bold: true, color: C.dim }));
  els.push(card(1760, 510, 200, "Nothing found → no_answer, score 0.", ST.fail, { size: 15 }));

  els.push(h2(0, 1260, "The ground truth"));
  els.push(card(0, 1320, 900, "gt_answer(): if the ground truth contains \\boxed / \\fbox, take the last boxed content; otherwise the trimmed string as is. It then goes through the same normalize() as the prediction. ground_truth_parses(gt) is exposed so data can be filtered for ground truths the parser can't read.", "gray"));

  els.push(h2(1000, 1260, "Edge cases (verified)"));
  const T = exTable(1000, 1320, [{ w: 470, code: true }, { w: 260, code: true }, { w: 230 }], [
    ["response", "extracted", "why"],
    ["The answer is 5", "5", "a sentence (\"answer\" is a 3+ letter word) → last-number rule (fixed 11-05)", true],
    ["It costs \\$5 and then \\$6", "6", "escaped \\$ skipped → last number (fixed 11-05)", true],
    ["<think>\\boxed{1}</think> so \\boxed{2}", "2", "only text after </think>", true],
    ["…ended up at 7  (> 64 chars, mentions 5 earlier)", "7", "last number", true],
    ["so we get $$\\frac12$$", "(whole tail)", "$$ leaves nothing between the last two $; the tail reads like an answer → mismatch", false],
  ], 14);
  els.push(...T.els);
  els.push(files(0, 1320 + Math.max(T.h, 140) + 30, 1400, `${SRC} — extract() line 183, reads_like_answer 155, last_boxed 106, after_marker 125, last_number 140`));
  return els;
}

// ======================================================================
// 2 · Normalization
// ======================================================================
function normPage() {
  const els = header(2, "Normalization", "normalize(): the same rewrite for prediction and ground truth, so \"\\dfrac{1}{2}\\text{ cm}\" and \"\\frac12\" can meet");
  els.push(h2(0, 200, "Seven steps, in order"));
  const steps = [
    ["1. protect \\\\", "matrix row breaks → \\x01 so the \"\\ \" and \"\\,\" rules can't eat them"],
    ["2. literal replacements", "the kReplace table — delimiters, spacing, degrees, $, \\dfrac, \\%, unicode math and Greek"],
    ["3. word regexes", "\\text{and}/\\text{or} → \",\" · \"and\"/\"or\" → \",\" · percent/pct → % · infinity → \\infty"],
    ["4. strip_text_blocks", "unwrap a whole-answer \\text{}/\\textbf{}/\\mathrm{}…; \\mathrm{ → {; delete every remaining \\text{…}"],
    ["5. trim, strip trailing dots", "repeatedly"],
    ["6. strip_unit_words", "drop a trailing unit word after a space, digit or } — 26 words"],
    ["7. restore \\\\", ""],
  ];
  const lad = ladder(els, 0, 270, 760, steps.map(([t, d]) => [d ? `${t}\n${d}` : t, ST.normalize, { size: 15 }]), 22);
  void lad;

  els.push(h2(860, 200, "Before → after"));
  const T = table(860, 270, [{ w: 420, code: true }, { w: 300, code: true }, { w: 380 }], [
    ["input", "normalized", "rule"],
    ["\\left( 1, 2 \\right]", "( 1, 2 ]", "\\left / \\right removed"],
    ["\\dfrac{3}{4}", "\\frac{3}{4}", "\\dfrac \\tfrac \\cfrac → \\frac"],
    ["45^{\\circ}", "45", "degrees removed"],
    ["\\$1{,}250", "1250", "$ removed, {,} removed"],
    ["10\\text{ cm}", "10", "remaining \\text{…} deleted"],
    ["\\text{(B)}", "(B)", "whole-answer \\text unwrapped"],
    ["2 and 3", "2 ,3", "and/or → comma"],
    ["30 percent", "30%", "percent/pct → %"],
    ["30 dollars", "30", "unit word stripped"],
    ["x ≤ 3 · π", "x \\le 3 \\cdot \\pi", "unicode → commands"],
    ["1, 2, \\ldots", "1, 2", "list tails removed"],
    ["3.", "3", "trailing dot"],
  ], { size: 14 });
  els.push(...T.els);

  els.push(h2(0, 1000, "The replacement table, by group"));
  const groups = [
    ["delimiters", "\\left.  \\right.  \\mleft  \\mright  \\left  \\right  \\displaystyle  \\(  \\)  → removed"],
    ["spacing", "\\negthinspace … \\thickspace → space (before \\! and \\ne on purpose) · \\! removed · \\, \\; \\: \\quad \\qquad \"\\ \" → space"],
    ["degrees & money", "^{\\circ}  ^\\circ  °  \\$  $  → removed"],
    ["fractions", "\\dfrac \\tfrac \\cfrac → \\frac · \\dbinom \\tbinom → \\binom · \\% → % · {,} removed"],
    ["unicode math", "∞ π × ÷ ≤ ≥ ≠ − ∪ ∩ ∈ ≈ · → commands;  √ → \" sqrt\""],
    ["unicode Greek", "α β γ δ θ λ μ σ φ ω Δ → \\alpha … \\Delta"],
  ];
  groups.forEach(([t, d], i) => els.push(card((i % 2) * 990, 1060 + Math.floor(i / 2) * 110, 970, `${t}\n${d}`, ST.normalize, { size: 15 })));

  els.push(h2(0, 1420, "Unit words (26)  vs  math-verify's ~140"));
  const words = "dollars dollar cents cent units unit degrees degree meters meter cm km inches inch feet foot hours hour minutes minute seconds second mph points ways square".split(" ");
  words.forEach((w, i) => els.push(rect((i % 13) * 150, 1480 + Math.floor(i / 13) * 56, 140, 46, { text: w, font: FONT.code, size: 14, bg: C.bCyan, stroke: C.teal, sw: 1, rough: 0.3 })));
  els.push(card(0, 1620, 1960, "Not done here: thousands separators (shape_of strips \"1,000,000\" later), \\frac12 → \\frac{1}{2} (the parser's single-token arg), 0.5 → \\frac12 (unneeded: decimals parse exactly), lowercasing (the parser does it).", "gray"));
  els.push(files(0, 1720, 1400, `${SRC} — normalize() line 263, strip_text_blocks 214, strip_unit_words 240`));
  return els;
}

// ======================================================================
// 3 · Structure
// ======================================================================
function structPage() {
  const els = header(3, "Structure", "answers_equal(): decide what kind of answer this is before comparing its parts");
  els.push(h2(0, 200, "First: drop a naming left-hand side"));
  els.push(card(0, 260, 960, "strip_named_lhs — if one side is lhs = rhs with one top-level \"=\" and the lhs just names something (x, x_1, YP, \\tan Q, f(x), x'), and the other side has no relation, keep only the rhs. \\in maps to \"=\", so x \\in [1,2] becomes [1,2].", ST.structure));
  const T0 = exTable(1000, 260, [{ w: 320, code: true }, { w: 300, code: true }, { w: 340 }], [
    ["pred", "gt", "result"],
    ["x = 5", "5", "5 vs 5", true],
    ["f(x) = 2x+1", "2x+1", "rhs kept", true],
    ["x \\in [1,2]", "[1,2]", "interval vs interval", true],
  ], 14);
  els.push(...T0.els);

  els.push(h2(0, 520, "shape_of — checks in this order"));
  const chk = [
    ["thousands number", "-?\\d{1,3}(,\\d{3})+(\\.\\d+)?  →  one item, commas removed", "1,000,000"],
    ["matrix", "\\begin{[pbBvV]matrix|array} … rows on \\\\, columns on &  → tag M (V for vmatrix)", "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}"],
    ["; groups (≥ 2)", "unordered", "1; 2; 3"],
    ["\\setminus", "tag S, ordered", "A \\setminus B"],
    ["\\cup", "tag U, unordered", "[0,1] \\cup (2,3)"],
    ["\\cap", "tag N, unordered (split order gives \\setminus < \\cup < \\cap)", "A \\cap B"],
    ["\\{ … \\}", "unordered set, comma-split, ± expanded", "\\{1, 2\\}"],
    ["( … ) or [ … ] wrapping the whole answer", "≥ 2 items → tuple / interval; open and close brackets recorded", "(1, 2]"],
    ["bare comma list", "≥ 2 items unordered, ± expanded; 1 item → element_equal", "2, 1"],
  ];
  const T = table(0, 580, [{ w: 60 }, { w: 420 }, { w: 820 }, { w: 400, code: true }], [["#", "shape", "rule", "example"], ...chk.map((c, i) => [String(i + 1), ...c])], { size: 14, firstCol: C.lGray });
  els.push(...T.els);

  const by = 580 + T.h + 60;
  els.push(h2(0, by, "Comparing two shapes"));
  els.push(card(0, by + 60, 640, "Must match first: ordered/unordered, open bracket, close bracket, item count (≤ 20, kMaxItems). Otherwise → NotEqual.\nOrdered → pairwise answers_equal, first non-Equal wins.\nUnordered → greedy O(n²) matching; leftovers → Unparsed if any comparison was Unparsed, else NotEqual.", ST.structure, { size: 15 }));
  els.push(card(0, by + 280, 640, "expand_pm — an element with exactly one \\pm or \\mp (not \\pmod) becomes two: a+b and a−b. More than one is left alone and the parser refuses it.", ST.structure, { size: 15 }));
  const T2 = exTable(700, by + 60, [{ w: 300, code: true }, { w: 280, code: true }, { w: 380 }, { w: 100 }], [
    ["pred", "gt", "why", "score"],
    ["\\{1,2\\}", "2, 1", "both unordered", "1", true],
    ["(1,2)", "(2,1)", "ordered tuple", "0", false],
    ["[1,2)", "[1,2]", "close bracket differs", "0", false],
    ["\\pm 1", "1, -1", "expand_pm → {1, −1}", "1", true],
    ["1,000,000", "10^6", "thousands → 1000000", "1", true],
    ["pmatrix 1 2 / 3 4", "bmatrix 1 2 / 3 \\frac82", "rows (1,2) (3,4)", "1", true],
  ], 14);
  els.push(...T2.els);
  els.push(files(0, by + 470, 1400, `${SRC} — answers_equal line 1474, shape_of 1402, matrix_shape, expand_pm, strip_named_lhs`));
  return els;
}

// ======================================================================
// 4 · Relations & expressions
// ======================================================================
function relPage() {
  const els = header(4, "Relations & expressions", "element_equal() and expr_equal(): equations, inequalities, ratios, percentages and multiple choice");
  els.push(h2(0, 200, "split_relation (bracket depth 0)"));
  const T = table(0, 260, [{ w: 520, code: true }, { w: 160, code: true }], [
    ["source", "canonical"],
    ["\\leqslant  \\leq  \\le  <=", "<="],
    ["\\geqslant  \\geq  \\ge  >=", ">="],
    ["\\neq  \\ne  !=", "!="],
    ["\\lt  <   ·   \\gt  >", "<  ·  >"],
    ["\\approx", "~"],
    ["\\equiv  \\in  :=  =", "="],
    ["\\notin · \\subseteq · \\supseteq", "notin · sub · sup"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(card(0, 260 + T.h + 20, 680, "take_approx: a \\approx b → b if a is a name, else a.  x ≈ 3.14 → 3.14;  \\pi \\approx 3.14 → \\pi.", ST.relation, { size: 15 }));

  els.push(h2(780, 200, "Dispatch"));
  const q = rect(780, 260, 340, 130, { text: "relations on\neither side?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange });
  q.type = "diamond";
  const e1 = box(1200, 270, 320, 100, "expr_equal(a, b)", ST.relation);
  const q2 = rect(780, 450, 340, 130, { text: "one \"=\" on\neach side?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange });
  q2.type = "diamond";
  const e2 = box(1200, 460, 320, 100, "equation_equal", ST.relation);
  const e3 = box(780, 650, 340, 110, "same parts + operators,\nin order or mirrored (flip)", ST.relation, { size: 16 });
  els.push(q, e1, q2, e2, e3, arrow(q, e1), arrow(q, q2), arrow(q2, e2), arrow(q2, e3));
  els.push(label(1130, 300, "no"), label(960, 400, "yes"), label(1130, 490, "yes"), label(960, 590, "no — inequalities, chains"));
  els.push(note(1560, 260, 400, "Different numbers of operators → NotEqual. flip mirrors < ↔ >, <= ↔ >=, sub ↔ sup; notin has no mirror. Relation sides go back through answers_equal, so intervals and sets work there too.", { size: 15, color: C.dim }));

  els.push(h2(0, 860, "equation_equal — the same line written differently"));
  els.push(code(0, 920, 960, "d1 = l1 − r1        d2 = l2 − r2\n\nEqual  if  expand(d1 − d2) == 0          // same equation\n       or  expand(d1 + d2) == 0          // sides swapped\n       or  proportional(d1, d2)          // scaled\n\nproportional: at all 9 probe points d1/d2 is one constant\nnonzero ratio (rtol 1e-4), with ≥ 3 valid points;\npoints with |d2| < 1e-12 are skipped", { size: 15 }));
  els.push(text(1040, 920, "10x − 2y − 55 = 0   vs   20x − 4y = 110", { size: 17, bold: true, font: FONT.code }));
  const pts = [0, 1, 2, 3, 4].map((k) => ({ k }));
  pts.forEach(({ k }) => els.push(rect(1040 + k * 180, 980, 160, 70, { text: `probe ${k + 1}\nd1/d2 = 0.5`, font: FONT.code, size: 13, bg: C.bGreen, stroke: C.green, sw: 1, rough: 0.4 })));
  els.push(note(1040, 1070, 920, "d1 = 10x − 2y − 55, d2 = 20x − 4y − 110 = 2·d1 → the ratio is ½ at every point → proportional → sym, score 1 (verified). Likewise x > 3 vs 3 < x matches by mirroring.", { size: 15, color: C.dim }));

  els.push(h2(0, 1200, "expr_equal — and two special rules"));
  const lad = [
    ["compact strings equal → Equal", "gray"],
    ["parse_answer each side → SymEngine (page 5); a lone \":\" that isn't a clock time is a ratio a/b", ST.parser],
    ["either side unparsed → Unparsed", ST.fail],
    ["sym_equal → Equal (page 6)", ST.compare],
    ["either side has % → remove every %, retry sym_equal", ST.relation],
  ];
  ladder(els, 0, 1260, 760, lad.map(([t, k]) => [t, k, { size: 15 }]), 18);
  const T2 = exTable(840, 1260, [{ w: 260, code: true }, { w: 220, code: true }, { w: 400 }, { w: 100 }], [
    ["pred", "gt", "why", "score"],
    ["2:1", "2", "ratio 2/1", "1", true],
    ["3:30", "1:10", "clock-time guard refuses \"3:30\"", "0", false],
    ["50\\%", "50", "½ ≠ 50, then 50 = 50 after the % retry", "1", true],
    ["1\\%", "1", "same retry — lenient (page 9)", "1", false],
  ], 14);
  els.push(...T2.els);

  els.push(h2(0, 1680, "Multiple choice — only when the ground truth is a choice"));
  els.push(code(0, 1740, 960, "choice_of:  \\s*\\{?\\s*(?:\\(([A-E])\\)|([A-E])(?:[.:)]|$))\\s*\\}?\\s*([\\s\\S]*)\n            → {letter, rest}      (upper-case A–E only)\n\nsame letter    → Equal if either value is empty, or values not NotEqual\npred no letter → compare pred with the option's value  (\"24\" vs \"B) 24\")\notherwise      → NotEqual", { size: 14 }));
  const T3 = exTable(1000, 1740, [{ w: 280, code: true }, { w: 340, code: true }, { w: 160 }, { w: 100 }], [
    ["pred", "gt", "method", "score"],
    ["B", "\\textbf{(B)}\\ 24", "choice", "1", true],
    ["24", "B) 24", "choice", "1", true],
    ["(B)\\ \\frac{2}{3}", "\\textbf{(B)}\\ \\frac{9}{20}", "mismatch", "0", false],
  ], 14);
  els.push(...T3.els);
  els.push(note(1000, 1740 + T3.h + 10, 960, "Note: an unparsed value with the right letter still counts as Equal (\"not NotEqual\").", { size: 14, color: C.red }));
  els.push(files(0, 1960, 1400, `${SRC} — element_equal line 1279, split_relation 1211, equation_equal, expr_equal 1191 / parse_answer 1181, score() 1556`));
  return els;
}

// ======================================================================
// 5 · Lexer & parser
// ======================================================================
function parserPage() {
  const els = header(5, "Lexer & parser", "A hand-written recursive-descent parser for math-verify's LaTeX grammar, building SymEngine expressions directly");
  els.push(h2(0, 200, "Tokens"));
  const toks = [["Num", "2  0.25  .5  1.2E3"], ["Letter", "x  a_1  acc{bar}"], ["Const", "\\pi  \\infty"], ["Func", "\\sin  \\log  \\gcd  ln"], ["Frac", "\\frac  \\nicefrac"], ["Sqrt", "\\sqrt"], ["Binom", "\\binom"], ["Op", "+ − * / ^ _ ! % = ,"], ["Open / Close", "( { [  \\{  \\langle …"], ["Bar", "|  \\vert  \\|"]];
  toks.forEach(([k, e], i) => els.push(rect((i % 5) * 392, 260 + Math.floor(i / 5) * 90, 380, 76, { text: `${k}\n${e}`, font: FONT.code, size: 14, bg: C.bOrange, stroke: C.orange, sw: 1.5, rough: 0.4 })));
  els.push(note(0, 450, 1960, "\\cdot \\times → *, \\div \\over → /, ** → ^. \\boxed, \\fbox and \\phantom are skipped (their braces become a plain group). Accents (\\overline → bar, \\vec, \\hat, …) make one Letter \"acc{arg}\". \\operatorname{f} must be a known function. Any other command — \\pm, \\le, \\begin, \\int, \\lim — throws Refuse (those are handled above the parser, or not at all).", { size: 15, color: C.dim }));

  els.push(h2(0, 560, "Grammar — lowest to highest precedence"));
  const g = [
    ["expr", "term (('+' | '−') term)*"],
    ["term", "unary (('*' | '/' | \\mod) unary | implicit power)*"],
    ["unary", "('−' | '+') unary | power          −x^2 = −(x²)"],
    ["power", "postfix ('^' exponent)?          right-associative"],
    ["postfix", "primary ('!' | '%')*"],
    ["primary", "NUM | LETTER ('_' sub)? | \\pi | (expr) | |expr| | \\frac arg arg | \\sqrt[n] arg | func …"],
  ];
  g.forEach(([n, r], i) => {
    els.push(rect(i * 34, 620 + i * 66, 180, 54, { text: n, font: FONT.code, size: 16, bold: true, bg: C.bOrange, stroke: C.orange, sw: 1.5, rough: 0.4 }));
    els.push(text(200 + i * 34, 620 + i * 66 + 16, r, { font: FONT.code, size: 14 }));
  });

  // parse tree for -3\frac12 + 2x^2
  els.push(h2(1180, 560, "Parse tree:  2x^2 + 3\\frac12"));
  const node = (x, y, t, k = "reward") => {
    const e = ellipse(x, y, 130, 64, { text: t, font: FONT.code, size: 16, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.5 });
    els.push(e);
    return e;
  };
  const plus = node(1500, 620, "+");
  const mul = node(1320, 720, "×");
  const mix = node(1680, 720, "3 + ½", "trainer");
  const two = node(1220, 820, "2");
  const pw = node(1420, 820, "^");
  const xx = node(1340, 920, "x");
  const ex2 = node(1500, 920, "2");
  const n3 = node(1620, 820, "3");
  const fr = node(1760, 820, "\\frac 1 2");
  for (const [a, b] of [[plus, mul], [plus, mix], [mul, two], [mul, pw], [pw, xx], [pw, ex2], [mix, n3], [mix, fr]]) els.push(connect(a, b, { stroke: C.dim, sw: 1.5, rough: 0.4 }));
  els.push(note(1180, 1000, 780, "2x: implicit multiplication (next token is a Letter). 3\\frac12: a lone integer followed by a \\frac in (0,1) is a mixed number, ADDED (= 7/2), not multiplied. 2\\frac{\\pi}{3} stays a product. Numbers become exact GMP rationals: 0.25 is 1/4, never a float.", { size: 15, color: C.dim }));

  els.push(h2(0, 1060, "Semantics that match math-verify"));
  const sem = [
    ["lowercased", "A = a, \\Delta = \\delta"],
    ["e and i", "lone e = Euler's number, lone i/I = √−1 (not when subscripted)"],
    ["\\log", "base 10 (like \\lg); \\ln natural; \\log_b x"],
    ["functions", "\\sin 2x = sin(2x); \\sin^2 x = (sin x)²; \\sin^{-1} = arcsin"],
    ["\\binom", "exact for integers, else Γ form (so probing works)"],
    ["\\sum, \\prod", "integer bounds, range ≤ 1000, evaluated by substitution"],
  ];
  sem.forEach(([t, d], i) => els.push(card((i % 3) * 660, 1120 + Math.floor(i / 3) * 110, 640, `${t}\n${d}`, ST.parser, { size: 15 })));

  els.push(h2(0, 1370, "Guards — cost is bounded by structure, not by a timer"));
  const T = table(0, 1430, [{ w: 300, code: true }, { w: 160, code: true }, { w: 640 }], [
    ["constant", "value", "limits"],
    ["kMaxAnswerLen", "1024", "characters per piece handed to the parser (was 256 until 11-05 16:57)"],
    ["kMaxDepth", "50", "nesting of expr()"],
    ["kMaxNumericExp", "10000", "|n| in a^n for numeric a (and 1.2E… exponents)"],
    ["kMaxSymbolicExp", "50", "|n| in x^n for symbolic x — re-checked after canonicalization"],
    ["kMaxFactorial · kMaxBinomK", "5000 · 5000", "n! and min(k, n−k) for exact binomials"],
    ["number length · kMaxItems", "60 · 20", "digits in one literal · elements in a set or tuple"],
    ["kMaxPowBits  (new)", "1e6", "size of an exact numeric power: (9^{10000})^{10000} is refused"],
    ["kMaxExpandTerms  (new)", "5000", "expand() skipped above this many terms — (a+…+h)^50 has 2.6e8; probing decides instead"],
    ["kMaxCompareLen  (new)", "1024", "longer normalized answers: exact string match only (method too_long)"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(card(1160, 1430, 800, "Refused → nullopt → \"unparsed\". Every refusal path (Refuse, and any SymEngine std::exception inside parse_expr) becomes nullopt, so an unreadable piece can only score through string equality. Examples: \\foo{1}, x^{99999}, (9^{10000})^{10000}, 2|x| (Bar is not implicit), \"2 3\" (no implicit multiplication between numbers).", ST.fail, { size: 15 }));
  els.push(files(0, 1430 + T.h + 30, 1400, `${SRC} — lex() line 399, class Parser 643, parse_expr`));
  return els;
}

// ======================================================================
// 6 · Comparison
// ======================================================================
function cmpPage() {
  const els = header(6, "Comparison", "sym_equal(a, b): four ways two SymEngine expressions can be equal");
  const lad = [
    ["1. se::eq(a, b)", "structural equality after canonicalization — \\sqrt{8} is already 2√2", ST.compare],
    ["2. expand(a − b) == 0", "(x+1)^2 vs x^2+2x+1 — skipped if it would exceed kMaxExpandTerms = 5000 terms (probing decides)", ST.compare],
    ["3a. no free symbols, both exact rationals", "both terminate (integers, 0.25, 6172.5) → must be identical. Otherwise exact_close: |a − b| ≤ 1e-4 · max(|a|, |b|) in exact arithmetic, never true at scale 0 (0 ≠ 4^-2016)", ST.compare],
    ["3b. no free symbols, an irrational side (π, √2, log)", "complex doubles, both finite, no absolute tolerance: rtol 1e-4 if one side is a rounded decimal (3.1416 vs π), else 1e-9", ST.compare],
    ["4. free symbols → probe_equal", "evaluate both at 7 fixed points; rtol 1e-9, or 1e-4 if a side contains a written decimal (2.58x); any disagreement → false; need ≥ 3 valid points", ST.compare],
  ];
  ladder(els, 0, 210, 960, lad.map(([t, d, k]) => [`${t}\n${d}`, k, { size: 15 }]), 24);
  els.push(note(0, 780, 960, "Any exception → false. Everything is deterministic: no RNG, no seed, no timer.", { size: 15, color: C.dim }));

  els.push(h2(1060, 200, "Numbers without symbols, in practice"));
  const T = exTable(1060, 260, [{ w: 230, code: true }, { w: 230, code: true }, { w: 340 }, { w: 100 }], [
    ["pred", "gt", "rule", "score"],
    ["20001", "20000", "both terminate → identical? no", "0", false],
    ["6172.5", "6172.6", "both terminate → identical? no", "0", false],
    ["0.33333", "\\frac{1}{3}", "1/3 doesn't terminate → rtol 1e-4", "1", true],
    ["0.3", "\\frac13", "rtol: 10% off", "0", false],
    ["2^{-2016}", "\\frac{1}{2^{2016}}", "identical", "1", true],
    ["0", "\\frac{1}{4^{2016}}", "scale ≠ 0 → never close", "0", false],
    ["3.1416", "\\pi", "rounded decimal → rtol 1e-4", "1", true],
    ["3.14", "\\pi", "5e-4 > 1e-4", "0", false],
  ], 14);
  els.push(...T.els);
  els.push(note(1060, 260 + T.h + 10, 900, "Fixed 11-05: before, rtol 1e-4 applied to exact integers too, so 20001 scored 1 against 20000 and 6172.5 against 6172.6. Now a tolerance is only used where an answer can legitimately be rounded.", { size: 15, color: C.green }));

  // probe points
  els.push(h2(0, 900, "The 7 probe points"));
  const P = [0.5772, 1.3247, -0.7071, 2.2361, -1.618, 0.0613, -0.0419];
  const X = (v) => 60 + ((v + 2) / 4.5) * 900;
  els.push(poly([{ x: 40, y: 1020 }, { x: 980, y: 1020 }], { type: "arrow", end: "triangle", stroke: C.dim, sw: 1.5 }));
  for (let t = -2; t <= 2; t++) els.push(poly([{ x: X(t), y: 1012 }, { x: X(t), y: 1028 }], { stroke: C.dim, sw: 1.5 }), label(X(t) - 5, 1034, String(t)));
  P.forEach((v, i) => {
    els.push(ellipse(X(v) - 12, 1008, 24, 24, { bg: C.bGreen, stroke: C.green, sw: 2, rough: 0 }));
    els.push(text(X(v), 960 - (i % 2) * 26, String(v), { size: 14, font: FONT.code, align: "center", color: C.green }));
  });
  els.push(note(0, 1080, 960, "γ ≈ 0.5772, the plastic number ≈ 1.3247, −1/√2, √5, −φ, plus two small values 0.0613 and −0.0419: awkward numbers unlikely to hit special values. Probe k gives symbol j the value kPoints[(k+j) % 7] + 0.1·j (equation proportionality also uses 17.31 and −29.7), so several symbols never get the same value. A point is skipped if either side is non-finite, both are 0, or evaluation throws; log of a negative goes complex instead of failing.", { size: 15, color: C.dim }));

  // plot sqrt(x^2) vs x
  els.push(
    ...plot(1120, 1000, 760, 380, { x0: -2, x1: 2.5, y0: -2, y1: 2.5 }, [
      { f: (x) => x, stroke: C.blue },
      { f: (x) => Math.abs(x), stroke: C.orange, dash: "dashed" },
    ], { title: "\\sqrt{x^2} (orange) vs x (blue): equal at 3 probes, not at 2", xlabel: "x", guides: P.map((v) => ({ x: v, label: v < 0 ? "✗" : "✓" })) }),
  );
  els.push(note(1120, 1420, 840, "At x = −0.7071 and −1.618 the sides give 0.7071 vs −0.7071 → any disagreement → mismatch, score 0 (verified). By contrast (x²−1)/(x−1) vs x+1 and sin²x + cos²x vs 1 agree at all 5 points → sym, 1.", { size: 15, color: C.dim }));
  els.push(files(0, 1500, 1400, `${SRC} — sym_equal line 1187, terminating, equal_at_six_places, has_decimal_constant, expands_to_zero, exact_close, probe_equal`));
  return els;
}

// ======================================================================
// 7 · Methods & examples
// ======================================================================
function examplesPage() {
  const els = header(7, "Methods & examples", "Every outcome label, and 26 cases traced end to end — each one checked by running the verifier built from the 11-05 source");
  const M = table(0, 200, [{ w: 180, code: true }, { w: 1120 }, { w: 100 }], [
    ["method", "produced when", "score"],
    ["no_answer", "extract found nothing, or either side is empty after normalize + compaction (\\boxed{}, empty response or ground truth)", "0"],
    ["string", "compact(normalize(pred)) == compact(normalize(gt)) — checked first", "1"],
    ["choice", "ground truth is a multiple-choice answer and the choice rules give Equal", "1"],
    ["sym", "answers_equal == Equal: per-element strings, exact/expand, rtol, probing, sets, intervals, equations, ratios, matrices, % retry", "1"],
    ["mismatch", "the comparison said NotEqual (including shape or item-count differences)", "0"],
    ["unparsed", "the parser refused a piece and no string equality rescued it", "0"],
    ["too_long", "new 11-05: not string-equal and a normalized side is over 1024 chars (kMaxCompareLen)", "0"],
    ["error", "new 11-05: any exception inside score() — caught, so the rollout keeps going", "0"],
    ["cli_error", "math_verifier_cli only: exception while reading the JSON line", "0"],
  ], { size: 14, cellBg: (ri, ci) => (ci === 0 && ri > 0 ? ([2, 3, 4].includes(ri) ? C.bGreen : C.bRed) : "#ffffff") });
  els.push(...M.els);
  els.push(note(1440, 200, 520, "Binary reward: no format reward and no partial credit. extra_info: acc (= score), pred (raw extracted answer, before normalize), method — which RolloutWorker now also writes to rollouts_<pid>.jsonl.", { size: 15, color: C.dim }));

  const ex = [
    ["The answer is \\boxed{\\frac{1}{2}}.", "0.5", "sym", "exact rational ½ = ½"],
    ["\\boxed{2\\sqrt{2}}", "\\sqrt{8}", "sym", "canonical form"],
    ["\\boxed{x^2+2x+1}", "(x+1)^2", "sym", "expand(a − b) = 0"],
    ["\\boxed{\\frac{x^2-1}{x-1}}", "x+1", "sym", "probing: 5/5 agree"],
    ["\\boxed{\\sqrt{x^2}}", "x", "mismatch", "probes at negative x disagree"],
    ["\\boxed{\\{1,2\\}}", "2, 1", "sym", "unordered sets"],
    ["\\boxed{(1,2)}", "(2,1)", "mismatch", "ordered tuple"],
    ["\\boxed{[1,2)}", "[1,2]", "mismatch", "bracket differs"],
    ["\\boxed{0.33333}", "\\frac{1}{3}", "sym", "rtol 1e-4"],
    ["\\boxed{0.3}", "\\frac13", "mismatch", "10% off"],
    ["\\boxed{10x - 2y - 55 = 0}", "20x-4y=110", "sym", "proportional equations"],
    ["\\boxed{x > 3}", "3 < x", "sym", "mirrored inequality"],
    ["\\boxed{3:30}", "1:10", "unparsed", "clock-time guard"],
    ["\\boxed{\\pm 1}", "1, -1", "sym", "± expanded"],
    ["\\boxed{B}", "\\textbf{(B)}\\ 24", "choice", "same letter"],
    ["\\boxed{(B)\\ \\frac{2}{3}}", "\\textbf{(B)}\\ \\frac{9}{20}", "mismatch", "same letter, values differ"],
    ["The final answer is: 280.<|endoftext|>", "280", "string", "marker, : and . stripped"],
    ["money = \\boxed{30 dollars}.", "30", "string", "unit word stripped"],
    ["\\boxed{50\\%}", "50", "sym", "% retry"],
    ["\\boxed{e^{i\\pi}}", "-1", "sym", "Euler's identity"],
    ["\\boxed{1,000,000}", "10^6", "sym", "thousands separator"],
    ["\\boxed{x^{99999}}", "x^{99998}", "unparsed", "symbolic exponent guard"],
    ["The answer is 5", "5", "string", "sentence → last number (fixed 11-05)"],
    ["\\boxed{20001}", "20000", "mismatch", "exact integers must be identical (fixed 11-05)"],
    ["It costs \\$5 and then \\$6", "6", "string", "escaped $ skipped (fixed 11-05)"],
    ["(empty)", "5", "no_answer", "nothing to extract"],
  ];
  const good = (m) => ["sym", "string", "choice"].includes(m);
  const T = table(0, 240 + M.h, [{ w: 560, code: true }, { w: 420, code: true }, { w: 160, code: true }, { w: 520 }, { w: 90 }], [["response (tail)", "ground truth", "method", "why", "score"], ...ex.map(([r, g, m, w]) => [r, g, m, w, good(m) ? "1" : "0"])], {
    size: 14,
    cellBg: (ri, ci) => (ci >= 2 ? (good(ex[ri - 1][2]) ? C.bGreen : C.bRed) : "#ffffff"),
  });
  els.push(...T.els);
  els.push(files(0, 240 + M.h + T.h + 20, 1400, "tests/unit/test_verifiers.cpp (147 score + 76 parse assertions, passing) · scripts/math_verifier_cli.cpp"));
  return els;
}

// ======================================================================
// 8 · Parity
// ======================================================================
function parityPage() {
  const els = header(8, "Parity with math-verify", "scripts/math_verifier_parity.py runs the C++ CLI and HF math-verify on the same rows and counts disagreements");
  const f = [
    box(0, 270, 320, 120, "3 sets, ≤ 3000 rows each\nseed 1234", "gray", { size: 16 }),
    box(400, 220, 340, 100, "C++: lib/math_verifier_cli\nJSONL → {score, method, gt_parses}", ST.compare, { size: 15 }),
    box(400, 350, 340, 100, "math-verify (verl recipe)\nparse + verify, Pool(16)", ST.extract, { size: 15 }),
    box(820, 270, 360, 120, "agreement matrix\nboth1 · both0 · cpp1_mv0 · cpp0_mv1", "gray", { size: 16 }),
    box(1260, 270, 320, 120, "disagree_<set>.jsonl\ngt_unparsed_<set>.txt", "gray", { size: 16 }),
  ];
  els.push(...f, arrow(f[0], f[1]), arrow(f[0], f[2]), arrow(f[1], f[3]), arrow(f[2], f[3]), arrow(f[3], f[4]));
  els.push(note(1620, 260, 340, "cpp1_mv0 is labelled \"MUST BE 0\": C++ rewards what math-verify rejects — a possible false reward.", { size: 15, color: C.red }));
  const T = table(0, 500, [{ w: 160 }, { w: 640 }, { w: 640 }], [
    ["set", "positives", "negatives"],
    ["numina", "full reference solution vs its own \\boxed{} answer (AI-MO/NuminaMath-CoT)", "same solution vs a different row's (different) answer"],
    ["dolci", "\\boxed{gt} vs gt — trivial; measures ground-truth parse coverage (Dolci-Think-RL math rows)", "\\boxed{other gt} vs gt"],
    ["rollouts", "real GRPO rollout JSONL rows (response, gt)", "—"],
  ], { size: 14 });
  els.push(...T.els);

  els.push(h2(0, 760, "Reported in the docs"));
  els.push(...bars(30, 860, 520, 240, 80, 100, [
    { v: 98.3, top: "98.3%", label: "Dolci gt parses", color: C.bGreen },
    { v: 88.5, top: "88.5%", label: "Numina gt parses", color: C.bYellow },
    { v: 99.98, top: "99.98%", label: "rollout agreement", color: C.bBlue },
  ]));
  els.push(label(30, 1140, "Axis starts at 80%. docs/MATH_VERIFIER_DESIGN_OPTIONS.md, \"last measured run,\nbefore the grammar port\" — no run log is saved."));

  els.push(h2(660, 760, "On disk, regenerated 11-05 12:28"));
  els.push(...bars(690, 860, 560, 240, 0, 40, [
    { v: 38, top: "38", label: "numina pos", color: C.bBlue },
    { v: 16, top: "16", label: "numina neg", color: C.bRed },
    { v: 2, top: "2", label: "numina neg", color: C.bGray },
    { v: 1, top: "1", label: "rollouts", color: C.bBlue },
  ]));
  els.push(note(1300, 860, 660, "Bars: disagreements by cause.\n• 38: C++ 1, mv 0 — prediction is string-identical to the ground truth by construction (-1, A, \\pi, (0,2)…) — math-verify failures.\n• 16: C++ 1 (choice), mv 0 — two problems whose answers share an option letter (pred \\text{C} vs gt \\textbf{(C)}\\ 36) — a deliberate C++ rule, but it trips \"MUST BE 0\".\n• 2: mv 1, C++ 0 — math-verify false positives (2:1 vs an identity; 2 vs \"2 rubles, 50 kopecks\").\n• 1 rollout: \"30 dollars\" vs 30 (C++ strips the unit). Dolci: 0 disagreements. Unparsed ground truths: 212 numina (was 217), 18 dolci, 0 rollouts.", { size: 15, color: C.dim }));
  els.push(card(1300, 1160, 660, "Current: lib/math_verifier_cli and data/math_parity/ were both rebuilt at 11-05 12:28, after the 12:20 source change. The headline percentages on the left are still the docs' older run.", ST.compare, { size: 15 }));

  els.push(h2(0, 1220, "Where the two deliberately differ"));
  const D = table(0, 1280, [{ w: 300 }, { w: 400 }, { w: 500 }], [
    ["area", "math-verify", "this verifier"],
    ["several \\boxed{}", "joins all with \",\"", "last box only"],
    ["unit words", "~140", "26"],
    ["multiple choice", "no letter semantics", "letter rules (page 4)"],
    ["%", "—", "strip-and-retry: 5% equals 0.05 and 5"],
    ["f(x) undefined function", "function application", "product f·x"],
    [":", "general division", "ratio only, clock-time guard"],
    ["a^b^c", "left-associative", "right-associative"],
  ], { size: 14 });
  els.push(...D.els);
  els.push(card(1260, 1460, 700, "Not supported at all: \\det, base-n numerals (1011_2), \\int / \\lim / d/dx, transpose, symbolic-bound \\sum, (x,y) \\in S, \";\" inside tuples, million/billion, \"7 3/4\". docs/MATH_VERIFIER_PARSER_STATUS.md: 81 grammar rules — 59 ✅, 9 🟡, 2 ❌, 11 ⛔.", "gray", { size: 15 }));
  // metamorphic
  const my = 1280 + D.h + 80;
  els.push(h2(0, my, "New: metamorphic tests — no labels needed  (scripts/math_verifier_metamorphic.py)"));
  els.push(small(0, my + 50, "For each ground truth (Dolci, Numina or a file), generate responses whose right score is known by construction, score them with math_verifier_cli, report the pass rate per transform."));
  const mt = [
    ["positives — must score 1", "wrap_*: the answer inside 7 response endings (boxed, \"final answer is\", Answer:, **Final Answer:**, after </think>, before <|endoftext|>, a long preamble)\nstring rewrites: spaces, dfrac, left_right, named_lhs, reorder_set, eq_swap, eq_scale, ineq_mirror\nSymPy rewrites: sympy_latex, sympy_expand, sympy_str · decimal: 7 significant digits of a non-terminating value", ST.compare, "target ≥ 99%"],
    ["negatives — must score 0", "through SymPy: plus_one, negate, double, times_ten, rename_var\nstring: coarse_decimal (2 significant digits), swap_tuple, flip_bracket, drop_element, flip_inequality", ST.fail, "target 100%"],
    ["properties", "reflexive: the ground truth against itself (= wrap_boxed)\nsymmetric: score(\\boxed{a}, b) == score(\\boxed{b}, a) for every bare-answer pair", ST.relation, "0 violations"],
  ];
  mt.forEach(([t, d, k, goal], i) => {
    els.push(card(i * 660, my + 100, 640, `${t}  (${goal})\n${d}`, k, { size: 14 }));
  });
  els.push(note(0, my + 330, 1960, "SymPy-made pairs are kept only when SymPy and math-verify both agree with the intended label, so a failure points at this verifier rather than at the generator. Failures go to a file for reading. No results are saved in the repo yet.", { size: 15, color: C.dim }));
  els.push(files(0, my + 410, 1400, "scripts/math_verifier_parity.py · scripts/math_verifier_metamorphic.py · data/math_parity/ · docs/MATH_VERIFIER_{GRAMMAR,PARSER_STATUS,DESIGN_OPTIONS}.md"));
  return els;
}

// ======================================================================
// 9 · Bugs, limits & files
// ======================================================================
function bugsPage() {
  const els = header(9, "Bugs, limits & files", "What the 11-05 fixes closed, what is still open, performance, and where everything lives");
  els.push(h2(0, 200, "False rewards  (re-run on the 11-05 build)"));
  const T = table(0, 260, [{ w: 300, code: true }, { w: 200, code: true }, { w: 640 }, { w: 120 }, { w: 120 }], [
    ["pred", "gt", "cause", "before", "now"],
    ["\\boxed{20001}", "20000", "rtol 1e-4 applied to exact integers — fixed: terminating decimals must be identical", "1", "0 ✓"],
    ["\\boxed{6172.5}", "6172.6", "same — fixed", "1", "0 ✓"],
    ["\\boxed{dog}", "god", "letters are commuting symbols: d·o·g = g·o·d — still open", "1", "1"],
    ["\\boxed{1\\%}", "1", "% strip-and-retry — still open", "1", "1"],
    ["(B) \\foo{1}", "\\textbf{(B)}\\ 24", "same letter + unparsable value counts as Equal — still open", "1", "1"],
  ], { size: 14, cellBg: (ri, ci) => (ri > 0 && ci === 4 ? (ri <= 2 ? C.bGreen : C.bRed) : ri > 0 && ci === 3 ? C.bRed : "#ffffff") });
  els.push(...T.els);
  els.push(note(1420, 260, 540, "Also: plain words like pi, sin, cos, exp, ln are matched inside longer words (spin, cost, expect). A ground truth that is literally \"B\" or \"E\" (a point name) is read as a multiple-choice letter.", { size: 15, color: C.dim }));

  els.push(h2(0, 560, "Operational gaps"));
  const gaps = [
    ["Wiring — in code; no run config yet", "VerifierRegistry registers type: math; RewardLoopWorker threads score it; RolloutWorker::write_trajectory logs each reward's method to rollouts_<pid>.jsonl. Still: no YAML in the repo uses type: math, and grpo_rlvr.yaml says math_equivalence, which RolloutWorker rejects; RLConfig.h / VerifierRegistry document that old name.", "reward"],
    ["Short answers — fixed", "\"The answer is 5\" now scores 1: a short tail is taken whole only if it reads like an answer, so a sentence reaches the last-number rule.", "trainer"],
    ["Escaping exceptions — fixed", "score() now catches everything → method error, reward 0, instead of failing the session and evicting the prompt group.", "trainer"],
    ["Stale docs", "The MATH_VERIFIER_*.md docs weren't updated on 11-05: PARSER_STATUS / DESIGN_OPTIONS still say items 1-4 are \"not yet built\", and the parity percentages predate the grammar port. Comments: \"random-point probing\" (points are fixed); x^23 \"refused\" (it parses).", "gray"],
  ];
  gaps.forEach(([t, d, k], i) => els.push(card((i % 2) * 990, 620 + Math.floor(i / 2) * 170, 970, `${t}\n${d}`, k, { size: 15 })));

  els.push(h2(0, 980, "Performance and threading"));
  els.push(card(0, 1040, 960, "Fast: about 68 µs per scoring on the 16:57 build (12,200 calls of a 61-case mix in 0.83 s, including JSON I/O and the heavy guard cases). Huge inputs are cut early: 4000-char tail, 1024-char pieces, 1024-char comparisons, kMaxExpandTerms before expand().", ST.compare));
  els.push(card(1000, 1040, 960, "One instance per dataset is shared by all session threads. score() keeps no state; tables and regexes are function-local statics; a Parser is built per call. Relies on SymEngine built with WITH_SYMENGINE_THREAD_SAFE=ON (set by the Makefile's build step, not checkable from the repo). No timeouts: the guards on page 5 bound the work.", ST.compare));

  els.push(h2(0, 1260, "Files"));
  const F = table(0, 1320, [{ w: 640, code: true }, { w: 1100 }], [
    ["file", "purpose"],
    ["src/reward/verifiers/MathEquivalenceVerifier.cpp", "the whole verifier (1671 lines): extraction, normalization, lexer, parser, comparison, structure, choice, score()"],
    ["include/reward/verifiers/MathEquivalenceVerifier.h", "class + math_verifier_detail test hooks (parse_to_string, extract_answer, ground_truth_parses)"],
    ["include/reward/verifiers/Verifier.h", "Verifier::score interface and ScoreResult"],
    ["src/reward/verifiers/VerifierRegistry.cpp · src/reward/RewardLoopWorker.cpp", "registers type \"math\" · scores every rollout on a reward thread (RolloutWorker logs method)"],
    ["scripts/math_verifier_cli.cpp · _parity.py · _metamorphic.py", "JSONL CLI · parity harness vs HF math-verify · label-free metamorphic tests"],
    ["tests/unit/test_verifiers.cpp", "147 score-level + 76 parse-level assertions (passes on the 16:57 build)"],
    ["data/math_parity/", "regenerated 11-05: disagreements 56 / 0 / 1, unparsed ground truths 212 / 18 / 0"],
    ["docs/MATH_VERIFIER_{GRAMMAR, PARSER_STATUS, DESIGN_OPTIONS}.md", "grammar port, coverage table, options survey (recommends keeping this design + filtering unparsable ground truths)"],
    ["Makefile (76-85, 264, 460-468, 480)", "SymEngine/GMP build, worker .so sources, math_verifier_cli, test_verifiers"],
  ], { size: 14 });
  els.push(...F.els);
  return els;
}

write([overview, extractPage, normPage, structPage, relPage, parserPage, cmpPage, examplesPage, parityPage, bugsPage], process.argv[2]);
