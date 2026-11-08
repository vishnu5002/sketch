// Builds the "verl reward verifiers, explained" sketchboard showcase — a beginner-friendly tour.
// Source of truth: /home/blubridge-029/RLVR-main/RL/verl-main (read 2026-11-05): verl/utils/reward_score/,
// verl/experimental/reward_loop/, verl/workers/reward_manager/, verl/trainer/ppo/{reward,ray_trainer}.py,
// verl/trainer/config/reward/reward.yaml. Examples marked "ran" were executed against the scorer files.
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame } = L;
const { K, box, card, code, h2, small, label, arrow, poly, harrow, table, plot, bars, pagesKit, files } = require("./kit.cjs");

const PAGE_NAMES = [
  "0 · Overview",
  "1 · Rewards 101",
  "2 · The dispatcher",
  "3 · GSM8K",
  "4 · MATH (lm-eval)",
  "5 · DAPO math",
  "6 · PRIME math",
  "7 · Code execution",
  "8 · Geometry3K & Search-R1",
  "9 · math-verify & tool calls",
  "10 · Reward managers",
  "11 · One batch, end to end",
  "12 · Config & custom rewards",
  "13 · Cheat sheet & gotchas",
];
const ACCENT = [C.violet, C.yellow, C.violet, C.blue, C.teal, C.orange, C.grape, C.red, C.green, C.blue, C.violet, C.dim, C.dim, C.red];
const { LINK, header, write } = pagesKit("vr", PAGE_NAMES, ACCENT);
// Roles: data/dataset = teal, manager/loop = violet, scorer = blue, number/reward = green, model RM = orange,
// code execution = red, failure/quirk = red, config = gray.
const R = "verl/utils/reward_score/";

/** "In plain words" — the beginner box every page opens with. */
const plain = (x, y, w, str, o = {}) => sticky(x, y, w, `In plain words\n${str}`, { size: 17, font: FONT.body, bg: C.bYellow, ...o });
/** Examples: rows [response, gt, result, ok?] — last column green when ok, red when not. */
function exTable(x, y, cols, rows, size = 14) {
  return table(x, y, cols, [rows[0], ...rows.slice(1).map((r) => r.slice(0, cols.length))], {
    size,
    cellBg: (ri, ci) => (ci === cols.length - 1 && rows[ri][cols.length] !== undefined ? (rows[ri][cols.length] ? C.bGreen : C.bRed) : "#ffffff"),
  });
}
/** A row of boxes joined by arrows. items: [text, kind, opts?] */
function flow(els, x, y, w, h, gap, items, k = "rollout") {
  const out = items.map(([t, kk, o], i) => box(x + i * (w + gap), y, w, h, t, kk ?? k, { size: 16, ...o }));
  els.push(...out);
  for (let i = 0; i < out.length - 1; i++) els.push(arrow(out[i], out[i + 1], out[i + 1] ? (items[i + 1][1] ?? k) : k));
  return out;
}
/** Vertical ladder of cards. */
function ladder(els, x, y, w, items, gap = 18) {
  const out = [];
  for (const [t, kk, o] of items) {
    const r = card(x, y, w, t, kk, { size: 15, ...o });
    out.push(r);
    y += r.height + gap;
  }
  els.push(...out);
  for (let i = 0; i < out.length - 1; i++) els.push(arrow(out[i], out[i + 1], "gray", { sw: 1.5 }));
  return out;
}

// ======================================================================
// 0 · Overview
// ======================================================================
function overview() {
  const els = header(0, "verl reward verifiers — how they work", "Every way verl turns a model's answer into a number it can learn from: rule-based scorers, code sandboxes, reward models, and the machinery around them");
  els.push(small(0, 156, "Read from RL/verl-main. New to RL? Start with page 1. Every box with a page number jumps there (click in view mode, Ctrl+click while editing; Alt+← comes back)."));
  els.push(plain(0, 210, 760, "The model writes an answer. A verifier checks it against the known right answer and gives back a score — usually 1 for right and 0 for wrong. Training then nudges the model toward answers that scored higher. This drawing explains every verifier verl ships and how the score travels from the checker to the trainer."));

  // three layers
  els.push(frame(0, 470, 1240, 900, "Three layers: manager → dispatcher → scorer"));
  const row = box(30, 530, 340, 120, "dataset row (parquet)\ndata_source · prompt\nreward_model.ground_truth\nextra_info", "data", { size: 16, link: LINK.page(1) });
  const resp = box(30, 700, 340, 90, "model response\n(token ids from the rollout)", "gray", { size: 16 });
  const mgr = box(450, 590, 360, 140, "reward manager  →  page 10\nnaive · dapo · gdpo · remote · rate_limited\ndecode tokens, call the scorer, add penalties", "driver", { size: 16, link: LINK.page(10) });
  const disp = box(450, 800, 360, 110, "default_compute_score  →  page 2\npicks a scorer by data_source", "driver", { size: 16, link: LINK.page(2) });
  els.push(row, resp, mgr, disp, arrow(row, mgr, "data"), arrow(resp, mgr, "gray"), arrow(mgr, disp, "driver"));
  const sc = [
    ["gsm8k", 3], ["math_reward", 4], ["math_dapo", 5], ["prime_math", 6], ["prime_code / sandbox_fusion", 7], ["geo3k · search_r1", 8], ["math_verify · rlla (custom)", 9],
  ];
  const scb = sc.map(([n, pg], i) => box(880 + (i % 2) * 175, 760 + Math.floor(i / 2) * 82, 165, 66, `${n}\n→ page ${pg}`, i === 4 ? "sync" : "rollout", { size: 13, font: FONT.body, link: LINK.page(pg) }));
  els.push(...scb);
  els.push(text(880, 725, "scorers (verl/utils/reward_score/)", { size: 15, bold: true, color: K.rollout.s }));
  els.push(arrow(disp, scb[0], "rollout"));
  const num = box(450, 1000, 360, 100, "one number per response\nfloat, or {score, acc, pred, …}", "trainer", { size: 16 });
  els.push(num, connect(scb[2], num, { stroke: K.trainer.s, sw: 2, end: "triangle", rough: 0.5 }));
  const rm = box(30, 1000, 340, 100, "OR a reward model (an LLM)\nscores the answer  →  page 10", "reward", { size: 16, link: LINK.page(10) });
  els.push(rm, arrow(rm, num, "reward", { dash: "dashed" }));
  const tok = box(450, 1170, 360, 100, "rm_scores [batch, response_len]\nscore on the LAST response token  →  page 11", "trainer", { size: 16, link: LINK.page(11) });
  const adv = box(880, 1170, 330, 100, "advantages (GRPO / PPO)\n→ policy update  →  page 1", "trainer", { size: 16, link: LINK.page(1) });
  els.push(tok, adv, arrow(num, tok, "trainer"), arrow(tok, adv, "trainer"));

  // right column: index
  const RX = 1340;
  els.push(h2(RX, 210, "Pages"));
  const idx = [
    [1, "gray", "What a reward is; GRPO in one picture; the data row"],
    [2, "driver", "data_source → scorer routing table"],
    [3, "rollout", "#### answers, exact string match"],
    [4, "rollout", "\\boxed{} + Hendrycks string cleanup"],
    [5, "rollout", "\"Answer:\" lines, +1 / −1 scores"],
    [6, "rollout", "heuristic extraction, sympy, tolerance"],
    [7, "sync", "run the code against test cases"],
    [8, "rollout", "format bonus; <answer> exact match"],
    [9, "rollout", "HF math-verify; tool-call grading"],
    [10, "driver", "managers, overlong penalty, reward models"],
    [11, "gray", "a batch from rollout to advantage"],
    [12, "gray", "config keys; writing your own reward"],
    [13, "sync", "score scales side by side; known bugs"],
  ];
  idx.forEach(([pg, k, d], i) => els.push(card(RX + (i % 2) * 320, 270 + Math.floor(i / 2) * 92, 310, `${PAGE_NAMES[pg]}\n${d}`, k, { size: 14, link: LINK.page(pg) })));
  els.push(card(RX, 940, 630, "Two families of reward managers\nCurrent: verl/experimental/reward_loop/ — async, run by RewardLoopWorker Ray actors while rollouts are still generating. This is what the PPO trainer uses today.\nLegacy: verl/workers/reward_manager/ — synchronous, still exported and tested, but the trainer no longer wires them.", "driver", { size: 15 }));
  els.push(card(RX, 1140, 630, "Not here: there is no IFEval scorer in verl's reward_score package. math_verify, rlla and subEM exist but are only reachable through a custom reward function.", "gray", { size: 15 }));

  // glossary
  els.push(h2(0, 1430, "Words you'll see"));
  const gl = [
    ["data_source", "a tag on every dataset row (e.g. \"openai/gsm8k\") that decides which scorer runs"],
    ["ground_truth", "the known right answer, stored at reward_model.ground_truth"],
    ["solution_str", "the model's decoded response — what gets checked"],
    ["scorer / verifier", "a plain function (solution_str, ground_truth) → score"],
    ["reward manager", "the wrapper that decodes tokens, calls the scorer, adds penalties"],
    ["rule-based vs model-based", "a Python check vs another LLM (a reward model) judging the answer"],
    ["reward_extra_info", "extra columns a scorer returns (acc, pred, …) — logged as metrics"],
    ["rm_scores", "the reward tensor: zeros, with the score on each response's last token"],
  ];
  gl.forEach(([t, d], i) => els.push(card((i % 4) * 495, 1490 + Math.floor(i / 4) * 120, 480, `${t}\n${d}`, "gray", { size: 15 })));
  return els;
}

// ======================================================================
// 1 · Rewards 101
// ======================================================================
function primerPage() {
  const els = header(1, "Rewards 101", "What a reward is, what the trainer does with it, and what a dataset row must contain");
  els.push(plain(0, 200, 900, "Reinforcement learning with verifiable rewards (RLVR) works like a teacher grading homework with an answer key. The model tries a question several times, each try gets a grade, and the model is pushed toward the tries that did better than its own average."));

  els.push(h2(0, 420, "GRPO in one picture — one question, 4 tries"));
  const tries = [
    ["try 1", "… so the answer is #### 72", 1],
    ["try 2", "… #### 70", 0],
    ["try 3", "… I think 68", 0],
    ["try 4", "… #### 74", 0],
  ];
  tries.forEach(([n, t, r], i) => {
    const y = 490 + i * 80;
    els.push(rect(0, y, 110, 62, { text: n, font: FONT.body, size: 16, bold: true, bg: C.lBlue, stroke: C.blue, sw: 1.5, rough: 0.4 }));
    els.push(rect(130, y, 420, 62, { text: t, font: FONT.code, size: 15, bg: "#ffffff", stroke: C.gray, sw: 1, rough: 0, align: "left" }));
    els.push(rect(580, y, 120, 62, { text: `reward ${r}`, font: FONT.code, size: 15, bg: r ? C.bGreen : C.bRed, stroke: C.dim, sw: 1, rough: 0.4 }));
  });
  els.push(text(130, 460, "model response (ground truth: 72)", { size: 14, color: C.dim }), text(580, 460, "verifier", { size: 14, color: C.dim }));
  els.push(...bars(760, 520, 440, 230, -1, 2, [
    { v: 1.5, top: "+1.5", label: "try 1", color: C.bGreen },
    { v: -0.5, top: "−0.5", label: "try 2", color: C.bRed },
    { v: -0.5, top: "−0.5", label: "try 3", color: C.bRed },
    { v: -0.5, top: "−0.5", label: "try 4", color: C.bRed },
  ], { labelY: 750 }));
  els.push(text(760, 470, "advantage = (reward − group mean) / (group std + 1e-6)", { size: 15, bold: true }));
  els.push(note(1260, 480, 700, "mean = 0.25, std = 0.5 (torch.std, unbiased) → the right try gets +1.5, the wrong ones −0.5. Every token of a try is pushed up or down by its advantage. If all 4 tries got the same reward, every advantage is 0 and nothing is learned from that question — which is why a verifier that is too strict or too lenient both hurt.", { size: 16, color: C.dim }));
  els.push(small(1260, 700, "verl/trainer/ppo/core_algos.py · compute_grpo_outcome_advantage"));

  els.push(h2(0, 860, "Where the reward sits: on the last token"));
  const toks = ["The", "answer", "is", "####", "72", "<eos>", "pad", "pad"];
  toks.forEach((t, i) => {
    els.push(rect(i * 120, 930, 110, 50, { text: t, font: FONT.code, size: 15, bg: i < 6 ? C.lBlue : C.lGray, stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(rect(i * 120, 990, 110, 50, { text: i === 5 ? "1.0" : "0", font: FONT.code, size: 15, bg: i === 5 ? C.bGreen : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false }));
  });
  els.push(text(980, 945, "response tokens", { size: 15, color: C.dim }), text(980, 1005, "rm_scores row", { size: 15, color: C.dim }));
  els.push(note(0, 1060, 1200, "The verifier returns one number per response. verl writes it at the position of the last valid (non-padding) response token and puts 0 everywhere else — an \"outcome reward\". GRPO sums over tokens, so the sum is just the score.", { size: 16, color: C.dim }));

  els.push(h2(0, 1180, "Rule-based or model-based?"));
  els.push(card(0, 1240, 940, "Rule-based (the default)\nA Python function compares the answer with ground_truth: regexes, string cleanup, sympy, or running code. Cheap, deterministic, but only works when there is a checkable answer.", "rollout", { size: 16 }));
  els.push(card(1000, 1240, 960, "Model-based\nAnother LLM (a reward model) reads the prompt and answer and outputs a score. A discriminative RM returns a number directly; a generative RM (GenRM) writes a judgement your custom function parses. Turned on with reward.reward_model.enable.", "reward", { size: 16, link: LINK.page(10) }));

  els.push(h2(0, 1450, "Anatomy of a dataset row (made by examples/data_preprocess/*.py)"));
  els.push(code(0, 1510, 1000, "{\n  \"data_source\": \"openai/gsm8k\",            # routing key → page 2\n  \"prompt\": [{\"role\": \"user\", \"content\": \"Natalia sold clips ... Let's think step by\n             step and output the final answer after \\\"####\\\".\"}],\n  \"ability\": \"math\",\n  \"reward_model\": {\"style\": \"rule\",           # metadata only — nothing branches on it\n                   \"ground_truth\": \"72\"},     # the answer key\n  \"extra_info\": {\"split\": \"train\", \"index\": 0, \"question\": ..., \"answer\": ...}\n}", { size: 15 }));
  els.push(card(1060, 1510, 900, "Three things matter for rewards\n• data_source picks the scorer (exact string match).\n• reward_model.ground_truth is the answer key — its format depends on the scorer: a number string, a \\boxed{} content, a dict {\"target\": [...]}, or JSON test cases.\n• The prompt must ask for the answer in the format the scorer extracts (\"####\", \\boxed{}, <answer>…).", "data", { size: 16 }));
  return els;
}

// ======================================================================
// 2 · The dispatcher
// ======================================================================
function dispatchPage() {
  const els = header(2, "The dispatcher", "default_compute_score(data_source, solution_str, ground_truth, …) — one if/elif chain that picks the scorer");
  els.push(plain(0, 200, 900, "Like a mail sorter: it reads the label on each row (data_source) and hands the answer to the right checker. An unknown label is an error, not a zero."));
  const rows = [
    ["\"openai/gsm8k\"", "gsm8k", 3],
    ["\"lighteval/MATH\", \"DigitalLearningGmbH/MATH-lighteval\", \"HuggingFaceH4/MATH-500\"", "math_reward", 4],
    ["\"math_dapo\", \"math\", \"math_dapo_reasoning\", or startswith(\"aime\")", "math_dapo", 5],
    ["\"numina_aops_forum\", \"numina_synthetic_math\", \"numina_amc_aime\", \"numina_synthetic_amc\", \"numina_cn_k12\", \"numina_olympiads\"", "prime_math", 6],
    ["\"codecontests\", \"apps\", \"codeforces\", \"taco\"", "sandbox_fusion if a URL is set, else prime_code", 7],
    ["\"hiyouga/geometry3k\"", "geo3k", 8],
    ["\"searchR1_nq\", _triviaqa, _popqa, _hotpotqa, _2wikimultihopqa, _musique, _bamboogle", "search_r1_like_qa_em (EM)", 8],
    ["anything else", "raise NotImplementedError", 13],
  ];
  const src = box(0, 460, 260, 100, "data_source", "data", { font: FONT.code, size: 18 });
  els.push(src);
  const firsts = [];
  rows.forEach(([ds, sc, pg], i) => {
    const y = 420 + i * 92;
    const d = rect(340, y, 900, 76, { text: ds, font: FONT.code, size: 14, bg: "#ffffff", stroke: C.gray, sw: 1, rough: 0.3, align: "left" });
    const s = box(1320, y, 400, 76, `${sc}  →  page ${pg}`, i === 7 ? "sync" : i === 4 ? "sync" : "rollout", { size: 15, font: FONT.body, link: LINK.page(pg) });
    els.push(d, s, arrow(d, s, "gray", { sw: 1.5 }));
    firsts.push(d);
    if (i < 7) els.push(text(1250, y + 26, i === 0 ? "if" : "elif", { size: 14, color: C.gray, font: FONT.code }));
  });
  // a spine from data_source down to every rule, checked top to bottom
  const cy = (e) => e.y + e.height / 2;
  els.push(poly([{ x: 260, y: 510 }, { x: 305, y: 510 }], { stroke: K.data.s, sw: 2 }));
  els.push(poly([{ x: 305, y: cy(firsts[0]) }, { x: 305, y: cy(firsts.at(-1)) }], { stroke: K.data.s, sw: 2 }));
  for (const d of firsts) els.push(harrow(305, 336, cy(d), { stroke: K.data.s, sw: 2 }));
  els.push(text(0, 590, "checked top to bottom;\nexact strings, except\nthe aime prefix", { size: 15, color: C.dim }));

  els.push(h2(0, 1200, "What comes back is normalized"));
  const T = table(0, 1260, [{ w: 360, code: true }, { w: 420 }, { w: 500 }], [
    ["scorer returns", "dispatcher returns", "example"],
    ["dict", "unchanged — must have \"score\"; other keys → reward_extra_info", "math_dapo → {score, acc, pred}"],
    ["int / float / bool", "float(res)", "gsm8k 0 → 0.0"],
    ["tuple / list", "float(res[0])", "prime_math (is_correct, format, extracted) → 1.0"],
  ], { size: 15 });
  els.push(...T.els);
  els.push(sticky(1340, 1260, 620, "Gotchas\n• extra_info and **kwargs are accepted but never passed to any scorer.\n• \"AIME2024\" or \"math/aime\" don't match startswith(\"aime\") — examples/rewards/custome_reward_fn/aime_reward.py remaps the tag for exactly this reason.\n• math_verify, rlla and search_r1's subEM are never routed: use a custom reward function (page 12).", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 1260 + T.h + 30, 1200, `${R}__init__.py — default_compute_score`));
  return els;
}

// ======================================================================
// 3 · GSM8K
// ======================================================================
function gsm8kPage() {
  const els = header(3, "GSM8K", "gsm8k.compute_score(solution_str, ground_truth, method=\"strict\", format_score=0.0, score=1.0)");
  els.push(plain(0, 200, 900, "Grade-school word problems. The prompt tells the model to finish with \"#### <number>\". The checker finds the last such number and compares it with the answer key letter by letter."));
  els.push(h2(0, 420, "Step by step"));
  flow(els, 0, 490, 300, 120, 50, [
    ["keep the last 300 chars\n(_SOLUTION_CLIP_CHARS)", "rollout"],
    ["strict: #### (\\-?[0-9\\.\\,]+)\nflexible: last number", "rollout"],
    ["take the LAST match\nremove , and $", "rollout"],
    ["equal to ground_truth\nas strings?", "rollout"],
    ["1.0 if equal\n0.0 (format_score) if not\n0 if nothing found", "trainer"],
  ]);
  els.push(card(0, 660, 960, "Ground truth: examples/data_preprocess/gsm8k.py takes the text after \"#### \" in the reference answer and removes commas → \"72\", \"1234\". Prompt suffix: Let's think step by step and output the final answer after \"####\".", "data", { size: 15 }));
  els.push(card(1000, 660, 960, "strict vs flexible: the dispatcher always uses strict. flexible takes the last number anywhere (that isn't \"\" or \".\"), so \"the answer is 1234\" passes — only if you call gsm8k yourself.", "rollout", { size: 15 }));

  els.push(h2(0, 860, "Examples (ran)"));
  const T = exTable(0, 920, [{ w: 520, code: true }, { w: 160, code: true }, { w: 560 }, { w: 120 }], [
    ["response", "ground truth", "why", "score"],
    ["so the answer is #### 1,234", "1234", "comma removed, then equal", "1.0", true],
    ["the answer is 1234", "1234", "strict: no \"####\" → nothing extracted", "0", false],
    ["#### 12", "1234", "extracted but different → format_score", "0.0", false],
    ["#### 72.", "72", "regex keeps the trailing \".\" → \"72.\" ≠ \"72\"", "0.0", false],
    ["#### $72", "72", "the regex needs a digit right after \"#### \" → nothing", "0", false],
  ], 15);
  els.push(...T.els);
  els.push(sticky(1420, 920, 540, "Gotchas\n• No numeric comparison: \"72.0\" ≠ \"72\".\n• docs/preparation/reward_function.rst promises 0.1 for correct format, but format_score defaults to 0.0 and the dispatcher never passes it.\n• The 300-char clip means a \"####\" earlier in a long answer is never seen.", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 920 + T.h + 30, 1200, `${R}gsm8k.py · examples/data_preprocess/gsm8k.py`));
  return els;
}

// ======================================================================
// 4 · MATH (lm-eval)
// ======================================================================
function mathPage() {
  const els = header(4, "MATH (lm-eval)", "math_reward.compute_score(solution_str, ground_truth) — the lm-eval-harness Hendrycks MATH check");
  els.push(plain(0, 200, 900, "Competition math. The model puts its final answer in \\boxed{…}. The checker pulls out the last box, tidies up the LaTeX on both sides with a fixed list of rules, and compares the two strings."));
  els.push(h2(0, 420, "Step by step"));
  flow(els, 0, 490, 330, 110, 60, [
    ["last_boxed_only_string\nrfind \\boxed, brace-match\n(\\fbox fallback)", "rollout"],
    ["remove_boxed\n\\boxed{x} → x", "rollout"],
    ["strip_string on both\n(the rules below)", "data"],
    ["equal strings?\n1.0 : 0.0", "trainer"],
  ]);
  els.push(h2(0, 680, "strip_string — the cleanup rules, in order"));
  const T = table(0, 740, [{ w: 520 }, { w: 330, code: true }, { w: 330, code: true }], [
    ["rule", "before", "after"],
    ["remove newlines and \\!", "1\\!000", "1000"],
    ["tfrac / dfrac → frac", "\\dfrac{1}{2}", "\\frac{1}{2}"],
    ["remove \\left, \\right", "\\left(1,2\\right)", "(1,2)"],
    ["remove degrees ^{\\circ}", "30^{\\circ}", "30"],
    ["remove \\$ and units after \"\\text{ \"", "5\\text{ cm}", "5"],
    ["remove \\%", "10\\%", "10"],
    ["leading 0 for \" .\", \"{.\" and a starting \".\"", ".5", "0.5"],
    ["drop a short \"k = \" prefix (≤ 2 chars)", "x=5", "5"],
    ["fix_sqrt", "\\sqrt3", "\\sqrt{3}"],
    ["remove spaces", "1 + 2", "1+2"],
    ["fix_fracs", "\\frac12", "\\frac{1}{2}"],
    ["the one special case: 0.5", "0.5", "\\frac{1}{2}"],
    ["fix_a_slash_b (integers only)", "3/4", "\\frac{3}{4}"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(h2(1260, 680, "Examples (ran)"));
  const E = exTable(1260, 740, [{ w: 260, code: true }, { w: 150, code: true }, { w: 180 }, { w: 110 }], [
    ["response", "gt", "why", "score"],
    ["thus \\boxed{\\dfrac{1}{2}}", "\\frac12", "both → \\frac{1}{2}", "1.0", true],
    ["thus \\boxed{0.5}", "\\frac{1}{2}", "0.5 special case", "1.0", true],
    ["\\boxed{x=5}", "5", "short x= dropped", "1.0", true],
    ["\\boxed{10\\%}", "10", "\\% removed", "1.0", true],
    ["x = 5  (no box)", "5", "no \\boxed{}", "0.0", false],
    ["\\boxed{0.25}", "\\frac14", "no numeric check", "0.0", false],
  ], 14);
  els.push(...E.els);
  els.push(sticky(1260, 740 + E.h + 30, 700, "Gotchas\n• Pure string comparison after cleanup — 0.25 vs \\frac14 fails; only 0.5 is special-cased.\n• Two \"\\text{ \" pieces make remove_right_units assert; is_equiv catches it and compares the raw strings.\n• No dependencies at all — fast and predictable.", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(card(0, 740 + T.h + 30, 1180, "Ground truth: examples/data_preprocess/math_dataset.py stores remove_boxed(last_boxed_only_string(solution)) — the content of the reference solution's last box. Prompt suffix: Let's think step by step and output the final answer within \\boxed{}.", "data", { size: 15 }));
  return els;
}

// ======================================================================
// 5 · DAPO math
// ======================================================================
function dapoPage() {
  const els = header(5, "DAPO math", "math_dapo.compute_score(solution_str, ground_truth, strict_box_verify=False) → {score, acc, pred}");
  els.push(plain(0, 200, 900, "Used for DAPO-Math-17k and AIME. It looks for a line starting \"Answer:\", cleans it up, and compares. Note the scale: a right answer is +1 and a wrong one is −1, not 0."));
  els.push(h2(0, 420, "Step by step"));
  const a = box(0, 490, 300, 100, "keep the last 300 chars", "rollout");
  const b = box(360, 490, 380, 100, "(?i)Answer\\s*:\\s*([^\\n]+)\nlast match, else \"[INVALID]\"", "rollout", { font: FONT.code, size: 15 });
  const c = box(800, 490, 330, 100, "normalize_final_answer\non pred AND gt", "data");
  const d = box(1190, 490, 300, 100, "equal?\n→ +1 / −1", "trainer");
  const q = rect(360, 650, 380, 130, { text: "pred is\n\"[INVALID]\"?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  q.type = "diamond";
  const e = box(800, 660, 690, 110, "fallback: is_correct_strict_box\nlast 100 chars → last \\boxed{} → RAW == gt (no normalization)", "rollout", { size: 15 });
  els.push(a, b, c, d, q, e, arrow(a, b), arrow(b, c, "data"), arrow(c, d, "trainer"), arrow(b, q), arrow(q, e));
  els.push(label(750, 690, "yes"), card(1540, 490, 420, "strict_box_verify=True skips the \"Answer:\" step and uses only the box check.", "gray", { size: 15 }));

  els.push(h2(0, 840, "normalize_final_answer, in order"));
  const steps = [
    ["1. keep what follows the last \"=\"", "x = 5  →  5"],
    ["2. SUBSTITUTIONS", "\"an \" \"a \" → \"\" · \"\\$\" → \"\" · spaces removed · mbox → text · \\text{and} → \",\""],
    ["3. REMOVED_EXPRESSIONS", "units and words: square, ways, dollars, mph, inches, hours, km, points, feet, degrees, cm, … \\ldots, ^\\circ, {,}"],
    ["4. unwrap", "$…$, \\text{}, \\textbf{}, \\overline{}, \\boxed{}"],
    ["5. shorthand fixes", "\\frac12 → \\frac{1}{2},  \\sqrt3 → \\sqrt{3}"],
    ["6. strip $; drop commas from pure numbers; strip()", "1,000 → 1000"],
  ];
  steps.forEach(([t, d], i) => els.push(card(0, 900 + i * 82, 1000, `${t}\n${d}`, "data", { size: 15 })));

  els.push(h2(1060, 840, "Examples (ran)"));
  const E = exTable(1060, 900, [{ w: 300, code: true }, { w: 140, code: true }, { w: 300, code: true }, { w: 160 }], [
    ["response", "gt", "returns", "score"],
    ["blah\\nAnswer: 42", "42", "acc True, pred \"42\"", "+1", true],
    ["so \\boxed{42}", "42", "box fallback", "+1", true],
    ["Answer: $10$ dollars", "10", "$ and \"dollars\" removed", "+1", true],
    ["Answer: 1,000", "1000", "commas dropped", "+1", true],
    ["Answer: 41", "42", "pred \"41\"", "−1", false],
    ["nothing here", "42", "pred \"[INVALID]\"", "−1", false],
    ["Answer: 0.5", "\\frac{1}{2}", "no numeric equivalence", "−1", false],
  ], 14);
  els.push(...E.els);
  els.push(sticky(1060, 900 + E.h + 30, 900, "Gotchas\n• Scores are +1 / −1. Mixing math_dapo rows with 0/1 scorers in one run mixes reward scales (page 13).\n• The \"a \" / \"an \" substitutions also hit inside words (\"banana \" loses an \"a \").\n• In the box fallback the ground truth is not normalized — a raw == compare.\n• verify() is annotated -> bool but returns a tuple.", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 1420, 1000, `${R}math_dapo.py`));
  return els;
}

// ======================================================================
// 6 · PRIME math
// ======================================================================
function primePage() {
  const els = header(6, "PRIME math", "prime_math.compute_score(model_output, ground_truth) → (is_correct, format_correctness, extracted) — for the numina_* sources");
  els.push(plain(0, 200, 900, "The most forgiving rule-based math checker in verl. It guesses where the answer is from phrases like \"the answer is\", then tries string cleanup, then sympy, then numeric closeness — any one of them saying \"equal\" is enough."));
  els.push(h2(0, 420, "1 · match_answer — find the answer"));
  const ma = [
    ["after the last \"answer:\" / \"answer is\" / \"answers are\"", "The answer is 12. → 12."],
    ["before the last \"is answer\" / \"is the answer\" / \"are the answers\"", "12 is the answer → 12"],
    ["inside \\boxed{} or \\fbox{} (brace-matched)", "\\boxed{\\frac{1}{2}} → \\frac{1}{2}"],
    ["cut at the last \". \"", ""],
    ["after the last \"be \", \"is \", \"are \", \"=\", \": \", \"get \"", "so x = 7 → 7"],
  ];
  ma.forEach(([t, ex], i) => {
    els.push(card(0, 480 + i * 78, 760, t, "rollout", { size: 15 }));
    if (ex) els.push(text(790, 480 + i * 78 + 18, ex, { size: 15, font: FONT.code, color: C.dim }));
  });

  els.push(h2(0, 900, "2 · grade_answer, then 3 · math_equal — first \"yes\" wins"));
  ladder(els, 0, 960, 1000, [
    ["normalize_answer on both (Hendrycks _strip_string) — equal?", "data"],
    ["_normalize: unwrap \\text{}, drop % and $, \" or \"/\" and \" → \",\", million → *10^6, units (degree, cm, meter, mile, hour, …), \\circ, LaTeX → text (√ → sqrt, π → pi), \"7 3/4\" → \"7+3/4\", lowercase — equal?", "data"],
    ["split tuples / intervals: bracket types and counts must match, then per element: both fractions → exact string only; integer-ness differs → no; else sympy simplify(gt − pred) == 0 (10 s timeout, ≤ 2 unknown letters)", "rollout"],
    ["math_equal fallback: numbers isclose(rel_tol 1e-4) against ref/100, ref, ref·100 (percent forms), intervals, tuples, Point(…), matrices; \\pi tried as math.pi and 3.14", "rollout"],
    ["symbolic_equal — always False because of a bug (below)", "sync"],
  ]);
  els.push(h2(1080, 900, "Examples"));
  const E = exTable(1080, 960, [{ w: 340, code: true }, { w: 260, code: true }, { w: 160 }, { w: 100 }], [
    ["prediction", "ground truth", "path", "score"],
    ["bmatrix -7 6 -8 / 11 -9 12 / …", "same matrix as pmatrix", "matrix compare", "1.0", true],
    ["\\frac{\\sqrt{505}}{7}", "\\frac{\\sqrt{505}}{7}", "string", "1.0", true],
    ["x^2+y^2+4x-6y+13", "(x+2)^2+(y-3)^2", "sympy simplify", "1.0", true],
    ["The answer is 50%", "0.5", "numeric ×100", "1.0", true],
  ], 14);
  els.push(...E.els);
  els.push(small(1080, 960 + E.h + 10, "First three asserted in tests/utils/reward_score/test_sandbox_on_cpu.py; the 50% case traced by hand."));
  els.push(sticky(1080, 960 + E.h + 60, 880, "Bug: grader.py uses timeout_limit as a context manager (with timeout_limit(seconds=…):), but verl/utils/py_functional.py defines it as a decorator. The with-statement raises TypeError, the broad except swallows it, and symbolic_equal always returns False — the last fallback is dead code. (grade_answer's sympy step uses the decorator correctly and still works.)\nAlso: eval() on strings derived from model output (handle_pi, the matrix branch).", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(card(0, 1560, 1000, "format_correctness = \"Step 2:\" in output and \"\\box\" in output — returned, but the dispatcher keeps only res[0], so it never affects the reward. Dependencies: sympy, pylatexenc; sympy calls run in a fresh process (timeout_limit) for 10 s.", "gray", { size: 15 }));
  els.push(files(0, 1700, 1400, `${R}prime_math/{__init__,grader,math_normalize}.py`));
  return els;
}

// ======================================================================
// 7 · Code execution
// ======================================================================
function codePage() {
  const els = header(7, "Code execution", "For codecontests / apps / codeforces / taco: run the model's program on test cases and score the pass rate");
  els.push(plain(0, 200, 900, "For coding problems the verifier actually runs the program. Each test case gives an input and the expected output; the score is the fraction of tests passed (looking at the first 10). Two engines exist: run it locally (prime_code) or send it to a SandboxFusion server."));
  els.push(h2(0, 420, "Which engine runs?"));
  const q = rect(0, 480, 380, 140, { text: "reward.sandbox_fusion.url\nset?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  q.type = "diamond";
  const sf = box(480, 470, 440, 90, "sandbox_fusion.compute_score\nHTTP to a remote sandbox", "sync");
  const pc = box(480, 590, 440, 90, "prime_code.compute_score\nruns locally in a child process", "sync");
  els.push(q, sf, pc, arrow(q, sf, "sync"), arrow(q, pc, "sync"));
  els.push(label(400, 480, "yes"), label(400, 640, "no"));
  els.push(card(980, 470, 980, "Ground truth = test cases (JSON string or dict):\n{\"inputs\": [\"1 2\\n\", …], \"outputs\": [\"3\\n\", …], \"fn_name\": optional}\nWith fn_name the problem is call-based (LeetCode-style function); without it the program reads stdin and prints to stdout. SandboxFusion also accepts \"assert_case\": [...].", "data", { size: 15 }));

  els.push(h2(0, 740, "Side by side"));
  const T = table(0, 800, [{ w: 300 }, { w: 820 }, { w: 820 }], [
    ["", "prime_code (local)", "sandbox_fusion (remote)"],
    ["code extraction", "split on ```python … ```; pure code without a fence is accepted", "needs a code fence — no fence → 0.0 \"missing code block\""],
    ["how it runs", "multiprocessing.Process + signal.alarm per case; reliability_guard() disables exit/os/shutil — \"NOT a security sandbox\"", "POST {code, stdin, compile_timeout, run_timeout, memory_limit_MB, language} to the URL; 29 languages; retries only on HTTP 504 (×3)"],
    ["timeouts", "5 s for the all-cases pass, 10 s per case", "compile/run 10 s; request timeout = compile + run + 10"],
    ["parallelism", "one process per call", "ThreadPool(max(32, 5·cpu)) per call, shared semaphore (max_concurrent 64)"],
    ["score", "all pass → 1.0; else first 10 cases one by one → passed / run", "continuous: passed in the first min(n, 10) / that count"],
  ], { size: 14, firstCol: C.lGray });
  els.push(...T.els);

  const by = 800 + T.h + 60;
  els.push(h2(0, by, "Continuous scoring — only the first 10 cases count"));
  const res = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
  res.forEach((r, i) => els.push(rect(i * 92, by + 60, 82, 60, { text: i < 10 ? (r ? "✓" : "✗") : "not run", font: FONT.code, size: i < 10 ? 20 : 12, bg: i >= 10 ? C.lGray : r ? C.bGreen : C.bRed, stroke: C.gray, sw: 1, rough: 0, round: false })));
  els.push(text(0, by + 135, "11 test cases, first 9 pass → 9 / 10 = 0.9  (asserted in tests/utils/reward_score/test_sandbox_on_cpu.py: prime_code_scores = [1.0, 0.9])", { size: 15, color: C.dim }));

  els.push(h2(1060, by, "SandboxFusion result codes"));
  const S = table(1060, by + 60, [{ w: 120, code: true }, { w: 270, code: true }, { w: 510 }], [
    ["result", "status", "meaning"],
    ["True", "success", "ran, stdout matches (trailing newlines ignored)"],
    ["False", "wrong_answer", "ran, output differs"],
    ["-2", "runtime_error", "crashed or non-zero exit"],
    ["-3", "timeout", "run time limit exceeded"],
    ["-4", "compile_error", "didn't compile; later cases marked -4 too"],
    ["-1", "sandbox / api error", "the service failed, not the code"],
  ], { size: 14 });
  els.push(...S.els);
  els.push(sticky(0, by + 200, 1000, "Gotchas\n• The same completion can score differently depending on whether a sandbox URL is set (code fence rule).\n• prime_code.compute_score(continuous=False) raises UnboundLocalError when not every test passes (the dispatcher always passes continuous=True).\n• A custom reward function turns off the automatic sandbox wiring (page 12).\n• prime_code runs model code on the reward worker host.", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(files(0, by + 470, 1400, `${R}prime_code/{__init__,utils,testing_util}.py · ${R}sandbox_fusion/{__init__,utils}.py`));
  return els;
}

// ======================================================================
// 8 · Geometry3K & Search-R1
// ======================================================================
function geoSearchPage() {
  const els = header(8, "Geometry3K & Search-R1", "Two scorers with small twists: a format bonus, and exact-match QA with a spam guard");
  els.push(plain(0, 200, 900, "Geometry3K gives most of the credit for the right answer and a little (0.1) for using the requested layout. Search-R1 checks a short text answer inside <answer> tags after light cleanup (lowercase, no punctuation, no \"a/an/the\")."));

  els.push(h2(0, 420, "geo3k.compute_score  (\"hiyouga/geometry3k\")"));
  els.push(code(0, 480, 940, "format = 1.0 if re.fullmatch(r\"<think>.*</think>.*\\\\boxed\\{.*\\}.*\", s, DOTALL) else 0.0\nacc    = 1.0 if mathruler.grade_answer(extract_boxed_content(s), gt) else 0.0\nscore  = 0.9 * acc + 0.1 * format", { size: 15 }));
  const grid = [
    ["", "right answer", "wrong answer"],
    ["<think>…</think> + \\boxed{}", "1.0", "0.1"],
    ["no <think> tags", "0.9", "0.0"],
  ];
  grid.forEach((r, ri) => r.forEach((c, ci) => els.push(rect(ci * 260, 640 + ri * 66, 250, 58, { text: c, font: ri && ci ? FONT.code : FONT.body, size: ri && ci ? 20 : 15, bold: !ri || !ci, bg: ri && ci ? (c === "1.0" ? C.bGreen : c === "0.0" ? C.bRed : C.bYellow) : C.lGray, stroke: C.gray, sw: 1, rough: 0, round: false }))));
  els.push(note(0, 860, 940, "Possible values: 0.0, 0.1, 0.9, 1.0 (traced from the code; mathruler not installed here). Gotcha: if the chat template treats <think> as a special token, decoding with skip_special_tokens=True drops the tags and silently loses the 0.1.", { size: 15, color: C.dim }));

  els.push(h2(1020, 420, "search_r1_like_qa_em  (searchR1_* sources)"));
  flow(els, 1020, 480, 210, 110, 30, [
    ["last <answer>…</answer>\n(none → 0)", "rollout"],
    ["normalize: lowercase, drop punctuation, drop a/an/the, squash spaces", "data", { size: 13 }],
    ["EM: equal to any target\n(subEM: contains one)", "rollout"],
    ["1.0 / 0.0\n(0.25 if > 10 answer tags)", "trainer"],
  ]);
  els.push(card(1020, 640, 940, "Ground truth is a dict: {\"target\": [\"golden answer\", \"another\"]}. preprocess_search_r1_dataset.py sets data_source = \"searchR1_\" + the original source. If the answer matches but <answer> or </answer> appears more than 10 times, the score is cut to 0.25 (anti tag-spam). Prints debug output with probability 1/64.", "data", { size: 15 }));
  const E = exTable(1020, 830, [{ w: 360, code: true }, { w: 180, code: true }, { w: 260 }, { w: 120 }], [
    ["response", "target", "why", "score"],
    ["<answer>The Eiffel Tower</answer>", "eiffel tower", "\"the\" dropped, case folded", "1.0", true],
    ["<answer>Paris, France</answer>", "Paris", "EM: not equal", "0.0", false],
    ["<answer>Paris, France</answer>", "Paris", "subEM (custom only): contains", "1.0", true],
    ["Paris  (no tags)", "Paris", "nothing extracted", "0", false],
  ], 14);
  els.push(...E.els);
  els.push(small(1020, 830 + E.h + 10, "All four ran against search_r1_like_qa_em.py."));
  els.push(files(0, 1180, 1400, `${R}geo3k.py · ${R}search_r1_like_qa_em.py · examples/data_preprocess/{geo3k,preprocess_search_r1_dataset}.py`));
  return els;
}

// ======================================================================
// 9 · math-verify & tool calls
// ======================================================================
function customScorersPage() {
  const els = header(9, "math-verify & tool calls", "Two scorers you can only reach through a custom reward function: HF math-verify, and the RLLA tool-call reward");
  els.push(plain(0, 200, 900, "math-verify is a library that understands math answers properly (fractions, decimals, expressions). The tool-call reward grades whether the model called the right tools with the right arguments, plus a bonus for the expected layout."));

  els.push(h2(0, 420, "math_verify.compute_score(model_output, ground_truth, timeout_score=0, timeout=30.0)"));
  flow(els, 0, 490, 280, 110, 40, [
    ["gold = \"\\boxed{\" + gt + \"}\"", "data"],
    ["send to a spawned ProcessPool(4) — signal.alarm works there", "driver", { size: 14 }],
    ["parse(gold, Latex) · parse(pred, Expr + Latex)", "rollout", { size: 14 }],
    ["any verify(g, p) → 1.0\nelse 0.0; 30 s timeout → 0", "trainer"],
  ]);
  els.push(card(0, 650, 1270, "Use it via a custom function (tests/experimental/reward_loop/reward_fn.py::compute_score_math_verify) with reward.reward_manager.name=remote, so it runs in separate Ray processes — the remote manager exists because math-verify misbehaves in thread pools (verl issue #3407). Example: \"x = \\frac{1}{2}\" vs gt \"0.5\" should score 1.0 (symbolic/numeric equivalence; not run here). Gotcha: a timed-out future isn't cancelled, so slow jobs can occupy all 4 workers.", "rollout", { size: 15 }));

  els.push(h2(0, 860, "rlla.compute_score — tool-call reward (used by the GDPO example)"));
  els.push(code(0, 920, 960, "ground truth:  <tool_call>\\n{\"name\": \"get_weather\", \"parameters\": {\"city\": \"Paris\"}}\\n</tool_call>\nexpected form: <think>…</think>\\n<tool_call>\\n…\\n</tool_call>   (+ <response>…</response>)\n\nformat   ∈ {0, 1}    one regex per case; each tag exactly once\naccuracy ∈ [−3, 3]   no gt tool → 0 · unparsable → −3 · exact list → 3\n                     else 6 · score / local_max − 3\nreturns  {score: format + accuracy, format_reward, accuracy_reward}", { size: 14 }));
  const E = table(1020, 920, [{ w: 440 }, { w: 120 }, { w: 120 }, { w: 120 }], [
    ["prediction (format correct)", "format", "accuracy", "score"],
    ["identical get_weather(city=Paris)", "1", "3", "4.0"],
    ["get_weather(city=Lyon)", "1", "1.0", "2.0"],
  ], { size: 15 });
  els.push(...E.els);
  els.push(note(1020, 920 + E.h + 10, 940, "Lyon case, by hand: names match (1) + keys match (1) + values 0 = 2; local_max = 1 + (1 + 1 param) = 3; accuracy = 6·2/3 − 3 = 1.0. Partial credit is graded, unlike every math scorer. Needs extra_info[\"experiment_name\"] containing \"qwen\" or \"llama\" — the gdpo manager injects it.", { size: 15, color: C.dim }));
  els.push(card(0, 1180, 1960, "How the GDPO example wires it: reward.custom_reward_function.path=…/rlla.py, reward.reward_manager.name=gdpo, +algorithm.gdpo_reward_keys='[\"accuracy_reward\",\"format_reward\"]' (examples/gdpo_trainer/run_qwen3_8b_fsdp.sh) — GDPO normalizes each reward component separately using those extra-info keys.", "driver", { size: 15 }));
  els.push(files(0, 1300, 1400, `${R}math_verify.py · ${R}rlla.py · tests/experimental/reward_loop/reward_fn.py`));
  return els;
}

// ======================================================================
// 10 · Reward managers
// ======================================================================
function managersPage() {
  const els = header(10, "Reward managers", "The wrappers around the scorers — and the RewardLoopWorker that runs them, rule-based or with a reward model");
  els.push(plain(0, 200, 900, "A reward manager is the clerk: it turns token ids back into text, looks up the answer key, calls the scorer, adds any penalty, and hands back the score plus extra info. Several of them run in parallel as Ray workers while the model is still generating."));

  els.push(h2(0, 420, "run_single(one sample) — what every current manager does"));
  ladder(els, 0, 480, 900, [
    ["1. valid_response_length = attention_mask[-response_length:].sum()  (responses are right-padded)", "driver"],
    ["2. decode responses[:valid_len] with skip_special_tokens=True", "driver"],
    ["3. data_source = non_tensor_batch[\"data_source\"] · ground_truth = [\"reward_model\"][\"ground_truth\"] · extra_info (+ num_turns, tool_extra_fields, rollout_reward_scores)", "data"],
    ["4. await compute_score(...) if async, else run it in the default thread pool", "rollout"],
    ["5. dict result → score = result[\"score\"], every key → reward_extra_info; scalar → reward_extra_info[\"acc\"] = score", "trainer"],
  ]);
  const T = table(1000, 480, [{ w: 170, code: true }, { w: 790 }], [
    ["name", "what's different"],
    ["naive", "the default — exactly the five steps"],
    ["dapo", "+ DAPO overlong penalty (below)"],
    ["gdpo", "+ extra_info[\"experiment_name\"] (needed by rlla.py)"],
    ["remote", "runs compute_score in separate Ray CPU actors, round-robin; no async functions — for heavy or thread-unsafe scorers"],
    ["rate_limited", "semaphore + requests/tokens-per-minute buckets + timeout (default 300 s) — for paid APIs; timeout/error → 0.0"],
  ], { size: 15 });
  els.push(...T.els);
  els.push(small(1000, 480 + T.h + 10, "Pick with reward.reward_manager.name. Legacy batch / prime exist in verl/workers/reward_manager/ but can't be selected by name anymore."));

  // overlong
  els.push(h2(0, 1060, "DAPO overlong penalty — too-long answers lose reward"));
  els.push(code(0, 1120, 900, "expected_len    = max_resp_len − overlong_buffer.len\nexceed_len      = valid_response_length − expected_len\noverlong_reward = min(−exceed_len / overlong_buffer.len · penalty_factor, 0)\nreward         += overlong_reward", { size: 15 }));
  els.push(note(0, 1290, 900, "Enable with +reward.reward_kwargs.overlong_buffer_cfg.{enable, len, penalty_factor, log} and +reward.reward_kwargs.max_resp_len. Test (test_dapo_on_cpu.py): max 4, buffer 2, length 4 → penalty −1.0, so 0.5 becomes −0.5.", { size: 15, color: C.dim }));
  els.push(...plot(1020, 1160, 820, 300, { x0: 0, x1: 20480, y0: -1.1, y1: 0.15 }, [
    { f: (n) => Math.min(-(n - (20480 - 4096)) / 4096, 0), stroke: C.red },
  ], { title: "penalty vs response length (max 20480, buffer 4096, factor 1)", xlabel: "valid response tokens", guides: [{ x: 16384, label: "16384" }, { y: -0.5, label: "−0.5" }, { y: -1, label: "−1" }] }));

  // RewardLoopWorker
  els.push(h2(0, 1560, "RewardLoopWorker.compute_score — three paths"));
  const q1 = rect(0, 1630, 360, 140, { text: "custom reward\nfunction set?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  q1.type = "diamond";
  const p1 = box(460, 1630, 520, 110, "manager.run_single → your function\n(may call the RM router itself = GenRM)", "rollout", { size: 15 });
  const q2 = rect(0, 1830, 360, 140, { text: "reward model\nenabled?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  q2.type = "diamond";
  const p2 = box(460, 1820, 520, 130, "compute_score_disrm — discriminative RM\nchat-template prompt + response → POST vLLM /classify (or SGLang /v1/embeddings) → last value; 16 retries", "reward", { size: 14 });
  const p3 = box(460, 2000, 520, 90, "manager.run_single → default_compute_score (rule-based)", "rollout", { size: 15 });
  els.push(q1, p1, q2, p2, p3, arrow(q1, p1), arrow(q1, q2), arrow(q2, p2, "reward"), arrow(q2, p3));
  els.push(label(370, 1650, "yes"), label(190, 1785, "no"), label(370, 1850, "yes"), label(190, 1985, "no"));
  els.push(card(1060, 1630, 900, "Reward models\nRewardModelManager launches vLLM / SGLang servers for reward.reward_model.model_path behind an HTTP router, colocated with the actor (woken and slept around scoring) or in their own pool (reward.reward_model.enable_resource_pool), which lets scores stream during rollout.\nGenRM: write an async custom function that POSTs to http://{reward_router_address}/v1/chat/completions and parses the judge's reply — tests/experimental/reward_loop/reward_fn.py::compute_score_gsm8k asks for a 1–10 grade and returns {score, acc: score == 10, genrm_response}.", "reward", { size: 15 }));
  els.push(files(0, 2140, 1400, "verl/experimental/reward_loop/{reward_loop,reward_model}.py · reward_loop/reward_manager/{base,naive,dapo,gdpo,remote,limited}.py"));
  return els;
}

// ======================================================================
// 11 · One batch, end to end
// ======================================================================
function e2ePage() {
  const els = header(11, "One batch, end to end", "From a finished rollout to the advantages — who calls what, and what shape the data has at each step");
  els.push(plain(0, 200, 900, "Scoring happens while other answers are still being generated: as soon as one trajectory finishes, it is sent to a reward worker. When the whole batch is assembled, the scores become a tensor that the trainer turns into advantages."));
  const lanes = [
    ["AgentLoopWorker", "driver"],
    ["RewardLoopWorker", "driver"],
    ["reward manager", "rollout"],
    ["scorer", "rollout"],
    ["RayPPOTrainer", "trainer"],
  ];
  const LX = 230;
  const LH = 120;
  const T0 = 440;
  lanes.forEach(([n, k], i) => {
    els.push(rect(0, T0 + i * LH, LX - 20, LH - 14, { text: n, font: FONT.body, size: 16, bold: true, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4 }));
    els.push(rect(LX, T0 + i * LH, 1730, LH - 14, { bg: K[k].l, stroke: K[k].s, sw: 1, rough: 0, round: false, opacity: 60 }));
  });
  const ev = (lane, x, w, str) => {
    const k = lanes[lane][1];
    const r = rect(LX + x, T0 + lane * LH + 12, w, LH - 38, { text: str, font: FONT.body, size: 13, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4 });
    els.push(r);
    return r;
  };
  const e1 = ev(0, 10, 280, "trajectory done → _compute_score: 1-sample DataProto (prompts, responses, mask, data_source, reward_model, extra_info)");
  const e2 = ev(1, 320, 250, "compute_score: pick a path (custom / RM / rules)");
  const e3 = ev(2, 600, 260, "run_single: decode, read ground_truth, call scorer");
  const e4 = ev(3, 890, 240, "compute_score(data_source, solution_str, ground_truth, extra_info)");
  const e5 = ev(2, 1160, 220, "{reward_score, reward_extra_info}");
  const e6 = ev(0, 1160, 260, "batch assembled: rm_scores[i, last token] = score; extra keys → non_tensor_batch");
  const e7 = ev(4, 1440, 280, "extract_reward → token_level_scores → (−KL if use_kl_in_reward) → token_level_rewards → advantages");
  els.push(arrow(e1, e2, "driver"), arrow(e2, e3, "rollout"), arrow(e3, e4, "rollout"), arrow(e4, e5, "trainer"), arrow(e5, e6, "driver"), arrow(e6, e7, "trainer"));
  els.push(small(LX, T0 + 5 * LH, "One task per finished trajectory, sent to a randomly chosen worker (reward.num_workers, default 8). Colocated reward models instead score the whole batch later via RewardLoopManager.compute_rm_score."));

  els.push(h2(0, 1140, "The shapes, with 2 responses (math_dapo)"));
  const grid = [[0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, -1]];
  const valid = [5, 8];
  grid.forEach((row, ri) => {
    els.push(text(0, 1220 + ri * 64 + 14, `response ${ri + 1} (${valid[ri]} valid)`, { size: 15, bold: true }));
    row.forEach((v, ci) => els.push(rect(240 + ci * 90, 1220 + ri * 64, 82, 54, { text: String(v === 0 ? "0" : v > 0 ? "+1.0" : "−1.0"), font: FONT.code, size: 16, bg: v > 0 ? C.bGreen : v < 0 ? C.bRed : ci < valid[ri] ? C.lBlue : C.lGray, stroke: C.gray, sw: 1, rough: 0, round: false })));
  });
  els.push(text(240, 1190, "rm_scores  [batch = 2, response_len = 8]   (blue = real tokens, grey = padding)", { size: 15, color: C.dim }));
  els.push(code(1040, 1190, 920, "reward_extra_info = {\n  \"score\": [1.0, -1.0],\n  \"acc\":   [True, False],\n  \"pred\":  [\"42\", \"41\"]\n}\nmeta_info[\"reward_extra_keys\"] = [\"score\", \"acc\", \"pred\"]", { size: 15 }));
  els.push(sticky(0, 1400, 960, "Gotcha: the extra-info keys are taken from the first sample only, then read for every sample. If samples return different dict keys (rate_limited adds \"timeout\" only on timeouts), assembling the batch raises KeyError. Keep your dict keys identical for every sample.", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 1580, 1400, "verl/experimental/agent_loop/agent_loop.py (_compute_score, rm_scores) · verl/trainer/ppo/ray_trainer.py · verl/trainer/ppo/reward.py (extract_reward)"));
  return els;
}

// ======================================================================
// 12 · Config & custom rewards
// ======================================================================
function configPage() {
  const els = header(12, "Config & custom rewards", "The reward.* config tree, and how to plug in your own reward function");
  els.push(plain(0, 200, 900, "You rarely edit verl's scorers. Either your dataset uses a data_source the dispatcher knows, or you point reward.custom_reward_function.path at a small Python file of your own."));
  const T = table(0, 430, [{ w: 520, code: true }, { w: 200, code: true }, { w: 560 }], [
    ["key (verl/trainer/config/reward/reward.yaml)", "default", "meaning"],
    ["reward.num_workers", "8", "RewardLoopWorker actors (and remote-manager actors)"],
    ["reward.reward_manager.name", "naive", "naive · dapo · gdpo · remote · rate_limited"],
    ["reward.reward_manager.source", "register", "register, or importlib with module.path / name"],
    ["reward.custom_reward_function.path · .name", "null · compute_score", "your file and function"],
    ["+reward.custom_reward_function.reward_kwargs.*", "{}", "extra kwargs on every call (override call kwargs)"],
    ["reward.reward_model.enable · .model_path", "false · null", "use an LLM reward model"],
    ["reward.reward_model.enable_resource_pool", "false", "own GPUs for the RM → streaming scores"],
    ["reward.sandbox_fusion.url · max_concurrent · memory_limit_mb", "null · 64 · 1024", "remote code execution"],
    ["+reward.reward_kwargs.overlong_buffer_cfg.* · max_resp_len", "—", "dapo manager penalty"],
    ["+reward.max_concurrent · max_rpm · max_tpm · timeout", "1 · — · — · 300", "rate_limited manager"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(small(0, 430 + T.h + 10, "Old top-level keys (custom_reward_function.*, reward_model.*, sandbox_fusion.*) live in legacy_reward_impl.yaml;\nmigrate_legacy_reward_impl copies them over — it is only called from the fully-async entrypoint as far as the reading found."));

  els.push(h2(1340, 430, "Your own reward, in 3 steps"));
  els.push(code(1340, 490, 620, "# my_reward.py\ndef compute_score(data_source, solution_str,\n                  ground_truth, extra_info=None,\n                  **kwargs):\n    ok = solution_str.strip().endswith(ground_truth)\n    return {\"score\": float(ok), \"acc\": ok}", { size: 15 }));
  els.push(code(1340, 720, 620, "reward.custom_reward_function.path=/abs/my_reward.py\nreward.custom_reward_function.name=compute_score", { size: 14 }));
  els.push(card(1340, 840, 620, "Rules of thumb\n• Called with keyword arguments; keep **kwargs (an RM router adds reward_router_address, reward_model_tokenizer).\n• Return a float, or a dict with \"score\" — same keys for every sample.\n• async def is allowed (not with the remote manager).\n• To reuse the built-ins, call default_compute_score yourself (see examples/rewards/custome_reward_fn/aime_reward.py).\n• Setting a custom function disables the automatic sandbox_fusion wiring.", "gray", { size: 14 }));
  els.push(card(0, 1060, 1280, "Other ways to customize\n• Heavy or thread-unsafe scorer → reward.reward_manager.name=remote.\n• Paid API judge → rate_limited with +reward.max_rpm / max_tpm / timeout.\n• Your own manager class → source=importlib, module.path=/file.py, name=MyManager (subclass RewardManagerBase, implement async run_single), or @register(\"myname\").\n• The dataset must provide data_source and reward_model.ground_truth; a discriminative RM also needs raw_prompt (data.return_raw_chat=True).", "driver", { size: 15 }));
  els.push(files(0, 1300, 1400, "verl/trainer/config/reward/reward.yaml · verl/workers/config/reward.py · verl/trainer/ppo/reward.py (get_custom_reward_fn, load_reward_manager)"));
  return els;
}

// ======================================================================
// 13 · Cheat sheet & gotchas
// ======================================================================
function cheatPage() {
  const els = header(13, "Cheat sheet & gotchas", "Every scorer's possible scores on one number line, timeouts, and the bugs worth knowing");
  els.push(plain(0, 200, 900, "Scorers don't agree on a scale. Most give 0 or 1, DAPO math gives −1 or +1, code gives a fraction, and the tool-call reward goes from −3 to 4. If one training run mixes datasets, these scales mix too."));
  const X = (v) => 360 + ((v + 3.5) / 8) * 1500;
  els.push(poly([{ x: X(-3.5), y: 440 }, { x: X(4.3), y: 440 }], { type: "arrow", end: "triangle", stroke: C.dim, sw: 1.5 }));
  for (let t = -3; t <= 4; t++) els.push(poly([{ x: X(t), y: 432 }, { x: X(t), y: 448 }], { stroke: C.dim, sw: 1.5 }), label(X(t) - 6, 454, String(t)));
  const sc = [
    ["gsm8k", [0, 1], null],
    ["math_reward", [0, 1], null],
    ["math_dapo", [-1, 1], null],
    ["prime_math", [0, 1], null],
    ["code (pass rate)", null, [0, 1]],
    ["geo3k", [0, 0.1, 0.9, 1], null],
    ["search_r1", [0, 0.25, 1], null],
    ["math_verify", [0, 1], null],
    ["rlla tool calls", null, [-3, 4]],
    ["+ DAPO overlong", null, [-1, 0]],
  ];
  sc.forEach(([n, pts, range], i) => {
    const y = 500 + i * 56;
    els.push(text(0, y + 6, n, { size: 16, bold: true }));
    els.push(poly([{ x: X(-3.5), y: y + 18 }, { x: X(4.3), y: y + 18 }], { stroke: C.bGray, sw: 1 }));
    if (range) els.push(rect(X(range[0]), y + 6, X(range[1]) - X(range[0]), 24, { bg: i === 9 ? C.bRed : C.bBlue, stroke: i === 9 ? C.red : C.blue, sw: 1.5, rough: 0.3 }));
    if (pts) for (const p of pts) els.push(ellipse(X(p) - 11, y + 7, 22, 22, { bg: p < 0 ? C.bRed : p === 1 ? C.bGreen : C.bYellow, stroke: C.dim, sw: 1.5, rough: 0 }));
  });

  els.push(h2(0, 1100, "Timeouts and parallelism"));
  const T = table(0, 1160, [{ w: 300 }, { w: 520 }, { w: 220 }], [
    ["where", "mechanism", "value"],
    ["reward loop", "RewardLoopWorker actors + an asyncio task per sample", "8 workers"],
    ["rate_limited", "semaphore, token buckets, asyncio.wait_for", "300 s"],
    ["discriminative RM HTTP", "aiohttp, 16 retries, backoff up to 30 s", "no total timeout"],
    ["math_verify", "spawned ProcessPool(4)", "30 s"],
    ["prime_math sympy", "timeout_limit (a new process per call)", "10 s"],
    ["prime_code", "Process join + signal.alarm per case", "5 s / 10 s"],
    ["sandbox_fusion", "HTTP; 504 retried ×3; ThreadPool; semaphore 64", "10 s run/compile"],
  ], { size: 14 });
  els.push(...T.els);

  els.push(h2(1100, 1100, "Bugs and surprises"));
  const bugs = [
    "prime_math symbolic_equal always False (decorator used as a context manager)",
    "prime_code continuous=False → UnboundLocalError on any failure",
    "extra-info keys from the first sample only → KeyError if dicts differ",
    "math_dapo is ±1 while most scorers are 0/1",
    "gsm8k: docs promise a 0.1 format score; code gives 0.0; \"72.\" ≠ \"72\"",
    "sandbox_fusion needs a code fence; prime_code doesn't",
    "a custom reward function disables the sandbox_fusion wiring",
    "reward-loop managers hard-code \"data_source\" and don't print num_examine samples",
    "default_compute_score ignores extra_info; \"aime\" is a case-sensitive prefix",
    "legacy prime manager zeroes the whole batch on a dict-returning scorer",
    "no IFEval scorer in this repo",
  ];
  bugs.forEach((b, i) => els.push(rect(1100, 1160 + i * 54, 860, 46, { text: `${i + 1}. ${b}`, font: FONT.body, size: 14, align: "left", bg: i < 3 ? C.bRed : C.lRed, stroke: C.red, sw: 1, rough: 0.3 })));
  els.push(files(0, 1160 + T.h + 30, 1000, "Section-by-section sources: pages 2–12. Example runs: gsm8k, math_reward, math_dapo, search_r1 executed directly."));
  return els;
}

write([overview, primerPage, dispatchPage, gsm8kPage, mathPage, dapoPage, primePage, codePage, geoSearchPage, customScorersPage, managersPage, e2ePage, configPage, cheatPage], process.argv[2]);
