// Builds the "BluTrain reward verifiers, explained" sketchboard showcase: every verifier in
// /home/blubridge-029/RLVR-main/RL/BluTrain/RL (src/reward, include/reward), the async reward loop, the
// scaffolding, and each verifier's dependencies. Read 2026-11-05 (working tree as of 23:15).
// Examples: [RAN] = run against the current sources, [TEST] = asserted in a passing unit test.
//
// usage: node gen-rv.cjs <out.json> [mathDrawingId]
// The math page links into the "Math verifier, explained" drawing. Drawing ids differ per sketchboard
// instance; the default is that drawing's id in the dev instance this was built in.
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame } = L;
const { K, box, card, code, h2, small, label, arrow, poly, harrow, table, bars, pagesKit, files } = require("./kit.cjs");

const MATH_DRAWING = process.argv[3] || "20d128a7-4fca-4474-98e3-441a6c9677e1";
const MATH = (page = 0) => `sketchboard:p/${MATH_DRAWING}/mv-${page}`;

const PAGE_NAMES = [
  "0 · Overview",
  "1 · Architecture",
  "2 · One rollout, end to end",
  "3 · Reward loop & registry",
  "4 · Config & wiring",
  "5 · gsm8k",
  "6 · exact_match & short_response",
  "7 · math",
  "8 · IFEval: how it scores",
  "9 · IFEval: the 54 rules",
  "10 · IFEval: NLTK, langdetect, PyStr",
  "11 · Scaffolding",
  "12 · Dependencies & build",
  "13 · Bugs & gotchas",
];
const ACCENT = [C.violet, C.violet, C.dim, C.violet, C.dim, C.blue, C.teal, C.orange, C.green, C.green, C.green, C.gray, C.dim, C.red];
const { LINK, header, write } = pagesKit("rv", PAGE_NAMES, ACCENT);
// Roles: loop/registry = violet, verifier = blue, data/config = teal, IFEval = green, math = orange,
// stubs = gray, failure = red.
const V = "src/reward/verifiers/";

const plain = (x, y, w, str, o = {}) => sticky(x, y, w, `In plain words\n${str}`, { size: 17, font: FONT.body, bg: C.bYellow, ...o });
function exTable(x, y, cols, rows, size = 14) {
  return table(x, y, cols, [rows[0], ...rows.slice(1).map((r) => r.slice(0, cols.length))], {
    size,
    cellBg: (ri, ci) => (ci === cols.length - 1 && rows[ri][cols.length] !== undefined ? (rows[ri][cols.length] ? C.bGreen : C.bRed) : "#ffffff"),
  });
}
function flow(els, x, y, w, h, gap, items) {
  const out = items.map(([t, k, o]) => box(x, y, w, h, t, k, { size: 15, ...o }));
  out.forEach((b, i) => (b.x = x + i * (w + gap)));
  els.push(...out);
  for (let i = 0; i < out.length - 1; i++) els.push(arrow(out[i], out[i + 1], items[i + 1][1]));
  return out;
}
function ladder(els, x, y, w, items, gap = 18) {
  const out = [];
  for (const [t, k, o] of items) {
    const r = card(x, y, w, t, k, { size: 15, ...o });
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
  const els = header(0, "BluTrain reward verifiers — the complete picture", "Every verifier in BluTrain/RL, the async loop that runs them, the scaffolding around them, and what each one depends on");
  els.push(small(0, 156, "Read from RL/src/reward and RL/include/reward (working tree, 2026-11-05 23:15). Every box with a page number jumps there; the math box jumps into the separate \"Math verifier, explained\" drawing."));
  els.push(plain(0, 210, 820, "After the model answers a prompt, a verifier compares the answer with the dataset's answer key and returns a score (usually 0 or 1). BluTrain has 7 verifier types behind one interface; a pool of reward threads runs them while generation continues, and the score lands on the last token of the trajectory for GRPO."));

  // architecture
  els.push(frame(0, 450, 1260, 940, "Architecture at a glance"));
  const cfg = box(30, 510, 330, 110, "reward: in the YAML\nverifiers: [{dataset, type}]\nnum_workers · timeout_s", "data", { size: 15, link: LINK.page(4) });
  const rw = box(30, 680, 330, 110, "RolloutWorker\ndecode tokens → TrajectoryData\nagent_loop_postprocess", "gray", { size: 15, link: LINK.page(2) });
  const loop = box(450, 640, 380, 150, "RewardLoopWorker  →  page 3\nthread pool (8) + timeout watchdog\nerror / timeout → score 0", "driver", { size: 15, link: LINK.page(3) });
  const reg = box(450, 510, 380, 90, "VerifierRegistry\ntype name → verifier instance", "driver", { size: 15, link: LINK.page(3) });
  els.push(cfg, rw, loop, reg, arrow(cfg, reg, "data"), arrow(rw, loop, "driver"), arrow(reg, loop, "driver"));
  const vs = [
    ["gsm8k · gsm8k_flexible", "rollout", 5],
    ["exact_match", "rollout", 6],
    ["short_response", "rollout", 6],
    ["math  ↗ own drawing", "reward", 7],
    ["ifeval · ifeval_all", "trainer", 8],
    ["code_exec · sandbox (stubs)", "gray", 11],
  ];
  const vb = vs.map(([n, k, pg], i) => box(920, 470 + i * 88 + 30, 310, 70, `${n}\n→ page ${pg}`, k, { size: 14, font: FONT.body, link: LINK.page(pg) }));
  els.push(...vb, text(920, 470, "Verifier::score(response, ground_truth)", { size: 14, bold: true, color: K.rollout.s }));
  for (const b of vb.slice(0, 5)) els.push(connect(loop, b, { stroke: K.driver.s, sw: 1.2, end: "triangle", rough: 0.5 }));
  const out = box(450, 860, 380, 120, "ScoreResult\nreward_score + extra_info\n{acc, pred, method, n_passed, error, …}", "trainer", { size: 15 });
  const tq = box(30, 1040, 330, 120, "TransferQueue row\nrm_scores[last token] = score\nextra_fields.reward_extra_info", "data", { size: 15, link: LINK.page(2) });
  const log = box(450, 1040, 380, 120, "rollouts_<pid>.jsonl\nreward · pred · method · timings", "gray", { size: 15, link: LINK.page(2) });
  const down = box(920, 1040, 310, 120, "ReplayBuffer DAPO filter\n+ GRPO advantage", "replay", { size: 15, link: LINK.page(4) });
  els.push(out, tq, log, down, arrow(loop, out, "trainer"), arrow(out, tq, "data"), arrow(out, log), arrow(tq, down, "replay"));
  els.push(note(30, 1200, 1200, "Real today: the loop, the registry, 7 verifier types, the TQ/log/DAPO wiring. Scaffolding: RewardLoopManager, RewardDispatchPolicy, CodeExecVerifier, SandboxFusionClient, reward models (page 11).", { size: 15, color: C.dim }));

  // page guide
  const RX = 1360;
  els.push(h2(RX, 450, "Page guide"));
  const guide = [
    [1, "driver", "Layers, the Verifier interface, data types, class map"],
    [2, "gray", "Swimlane of one rollout's reward; the TQ row and log line"],
    [3, "driver", "Thread pool, watchdog, error handling, the registry"],
    [4, "data", "reward: YAML keys, which configs use which type, downstream use"],
    [5, "rollout", "#### / \\boxed{} number match, strict and flexible"],
    [6, "rollout", "Whole-string match; the 800-char pipeline test"],
    [7, "reward", "Summary + links into the full math drawing"],
    [8, "trainer", "Answer cleanup, ground-truth JSON, fraction vs all-or-nothing"],
    [9, "trainer", "Every instruction id by category, with what it checks"],
    [10, "trainer", "The Python ports: punkt, word_tokenize, langdetect, str tables"],
    [11, "gray", "What throws, what's unused, what the docs plan"],
    [12, "data", "Per-verifier libraries, data, Makefile placement, tests"],
    [13, "sync", "16 known issues, most severe first"],
  ];
  guide.forEach(([pg, k, d], i) => els.push(card(RX, 510 + i * 70, 600, `${PAGE_NAMES[pg]} — ${d}`, k, { size: 14, link: pg === 7 ? LINK.page(7) : LINK.page(pg) })));

  // verifier summary table
  els.push(h2(0, 1450, "The 7 verifier types in one table"));
  const T = table(0, 1510, [{ w: 250, code: true }, { w: 300, code: true }, { w: 470 }, { w: 300 }, { w: 300 }, { w: 330 }], [
    ["type", "class", "checks", "score", "ground truth", "depends on"],
    ["gsm8k", "Gsm8kVerifier(false)", "last \"#### N\" or \"\\boxed{N}\" in the last 300 bytes", "1 / 0", "\"72\"", "<regex>"],
    ["gsm8k_flexible", "Gsm8kVerifier(true)", "last number in the last 300 bytes", "1 / 0", "\"72\"", "<regex>"],
    ["exact_match", "ExactMatchVerifier", "whole response == gt (spaces collapsed, lowercased)", "1 / 0", "any string", "<sstream>, <cctype>"],
    ["short_response", "ShortResponseVerifier", "response < 800 bytes (gt ignored)", "1 / 0", "ignored", "nothing"],
    ["math", "MathEquivalenceVerifier", "LaTeX → SymEngine equivalence", "1 / 0", "LaTeX answer", "SymEngine + GMP, <regex>"],
    ["ifeval", "IfEvalVerifier(false)", "fraction of instructions followed", "0 … 1", "JSON {instruction_id, kwargs}", "MiniJson, NLTK + langdetect ports, PyStr"],
    ["ifeval_all", "IfEvalVerifier(true)", "all instructions followed", "1 / 0", "same", "same"],
  ], { size: 14, firstCol: C.lGray });
  els.push(...T.els);
  return els;
}

// ======================================================================
// 1 · Architecture
// ======================================================================
function archPage() {
  const els = header(1, "Architecture", "Four layers, one interface, a handful of plain data types");
  els.push(plain(0, 200, 900, "Think of it as a factory line: the rollout worker packs each answer into a TrajectoryData, the reward loop picks the right checker for its dataset, the checker returns a ScoreResult, and the result is written where the trainer can find it."));
  els.push(h2(0, 420, "Layers"));
  const layers = [
    ["Wiring", "RolloutWorker (Ray actor) · RLConfig reward: · RolloutWorkerActor plumbing", "gray"],
    ["Loop", "RewardLoopWorker — async thread pool, timeout watchdog, error → 0, \"acc\" guaranteed", "driver"],
    ["Registry", "VerifierRegistry — type name → factory → cached instance; 7 built-ins", "driver"],
    ["Verifiers", "Gsm8k · ExactMatch · ShortResponse · MathEquivalence · IfEval  (+ CodeExec / SandboxFusion stubs)", "rollout"],
    ["Support libraries", "SymEngine/GMP (math) · NltkTokenize, Langdetect, PyStr + generated tables, MiniJson (IFEval)", "data"],
  ];
  layers.forEach(([n, d, k], i) => {
    els.push(rect(0, 480 + i * 100, 260, 84, { text: n, font: FONT.hand, size: 20, bg: K[k].b, stroke: K[k].s, sw: 2, rough: 0.6 }));
    els.push(card(280, 480 + i * 100, 900, d, k, { size: 16 }));
    if (i < layers.length - 1) els.push(text(120, 480 + i * 100 + 84, "▼", { size: 14, color: C.gray }));
  });

  els.push(h2(1260, 420, "The Verifier interface"));
  els.push(code(1260, 480, 700, "// include/reward/verifiers/Verifier.h\nclass Verifier {\n public:\n  virtual ScoreResult score(const std::string& response,\n                            const std::string& ground_truth) = 0;\n  virtual ScoreResult score_trajectory(const TrajectoryData& t) {\n    return score(t.response_text, t.ground_truth);\n  }\n};\n// shared by every reward thread: score() must be\n// safe to call concurrently (no mutable state)", { size: 14 }));
  els.push(note(1260, 780, 700, "score_trajectory is the extension point for checks that need the prompt, stop_reason or lengths (overlong penalties, LLM judges). No built-in verifier overrides it yet — only a test verifier does.", { size: 15, color: C.dim }));

  els.push(h2(0, 1010, "Data types  (include/reward/RewardTypes.h)"));
  const types = [
    ["ScoreResult", "float reward_score = 0\nunordered_map<string, TagValue> extra_info\nTagValue = variant<string, int64_t, double, bool>", "trainer"],
    ["TrajectoryData", "uid · session_id · data_source (routing key)\nprompt_text · response_text · ground_truth\nprompt_len · response_len · stop_reason (eos | length | stop_string)\ntruncated() = stop_reason == \"length\" · extra_info (never filled)", "data"],
    ["RewardResult", "ScoreResult score\ndouble wait_s · compute_s\n(the loop guarantees extra_info[\"acc\"], plus \"error\" or \"timeout\" on failure)", "driver"],
    ["DataBatch / RewardBatchResult", "vector<TrajectoryData> rows · vector<float> scores\n(only used by the stubbed RewardLoopManager)", "gray"],
  ];
  types.forEach(([n, d, k], i) => els.push(code((i % 2) * 990, 1070 + Math.floor(i / 2) * 200, 960, `${n}\n${d}`, { size: 14, bg: K[k].l, stroke: K[k].s })));

  els.push(h2(0, 1510, "Class map"));
  const base = box(760, 1570, 440, 90, "Verifier  (abstract)", "rollout", { size: 18 });
  const impls = [
    ["Gsm8kVerifier", "rollout", 5], ["ExactMatchVerifier", "rollout", 6], ["ShortResponseVerifier", "rollout", 6], ["MathEquivalenceVerifier", "reward", 7], ["IfEvalVerifier", "trainer", 8], ["CodeExecVerifier (stub)", "gray", 11],
  ];
  els.push(base);
  impls.forEach(([n, k, pg], i) => {
    const b = box(i * 330, 1740, 310, 70, n, k, { size: 15, font: FONT.body, link: LINK.page(pg) });
    els.push(b, connect(b, base, { stroke: C.gray, sw: 1.5, end: "triangle", rough: 0.4 }));
  });
  els.push(small(0, 1830, "SandboxFusionClient (stub) is not a Verifier: it would be the HTTP client CodeExecVerifier uses."));
  return els;
}

// ======================================================================
// 2 · One rollout, end to end
// ======================================================================
function e2ePage() {
  const els = header(2, "One rollout, end to end", "From generated tokens to the score the trainer reads — with the exact functions and fields");
  els.push(plain(0, 200, 900, "The session thread never waits for the grade: it hands the answer to the reward loop and moves on. When the grade is ready, a reward thread writes it into the TransferQueue row and the log, and the prompt's group is marked done."));
  const lanes = [["offline data", "data"], ["RolloutWorker session", "gray"], ["RewardLoopWorker thread", "driver"], ["Verifier", "rollout"], ["TQ / log / trainer", "trainer"]];
  const LX = 240, LH = 120, T0 = 440;
  lanes.forEach(([n, k], i) => {
    els.push(rect(0, T0 + i * LH, LX - 20, LH - 14, { text: n, font: FONT.body, size: 15, bold: true, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4 }));
    els.push(rect(LX, T0 + i * LH, 1720, LH - 14, { bg: K[k].l, stroke: K[k].s, sw: 1, rough: 0, round: false, opacity: 60 }));
  });
  const ev = (lane, x, w, str, link) => {
    const k = lanes[lane][1];
    const r = rect(LX + x, T0 + lane * LH + 12, w, LH - 38, { text: str, font: FONT.body, size: 13, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4, link });
    els.push(r);
    return r;
  };
  const a = ev(0, 10, 230, "gsm8k.py / dolci_think_rl.py → JSONL {prompt, input_ids, answer, data_source}");
  const b = ev(1, 260, 240, "PromptRow: ground_truth, data_source → generate → token_ids (EOS included)");
  const c = ev(1, 520, 250, "agent_loop_postprocess: drop ids ≥ 50257, Gpt2Detokenizer, TrajectoryData");
  const d = ev(2, 790, 220, "compute_score_async → verifier_for(data_source) → thread pool", LINK.page(3));
  const e = ev(3, 1030, 200, "score_trajectory → score(response, gt)");
  const f = ev(2, 1250, 200, "error → 0 · timeout → 0 · try_emplace(acc)");
  const g = ev(4, 1470, 240, "on_done → write_trajectory: log line + TQ row → settle");
  els.push(arrow(a, b, "data"), arrow(b, c), arrow(c, d, "driver"), arrow(d, e, "rollout"), arrow(e, f, "driver"), arrow(f, g, "trainer"));
  els.push(small(LX, T0 + 5 * LH, "The session thread returns right after compute_score_async. Later: ReplayBufferAsync DAPO filter → RLDriver sums rm_scores per row → GRPO advantage."));

  els.push(h2(0, 1140, "What the reward thread writes"));
  const toks = ["r0", "r1", "r2", "…", "r(R−2)", "r(R−1)"];
  toks.forEach((t, i) => els.push(rect(i * 120, 1210, 110, 50, { text: i === 5 ? "score" : "0", font: FONT.code, size: 15, bg: i === 5 ? C.bGreen : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false })));
  els.push(text(740, 1222, "rm_scores [R] f32 — verl-style outcome reward on the last token", { size: 15, color: C.dim }));
  els.push(code(0, 1290, 960, "TQ row  <uid>_<session>_0  (partition \"train\")\n  prompts [P] · responses [R] · response_mask [R] · input_ids [P+R]\n  rollout_log_probs [R] · rm_scores [R]\n  extra_fields = {\"reward_extra_info\": {acc, pred, method, …}}\n    (keys sorted, doubles %.17g, non-finite → null)\n  tags: status=success · prompt_len · response_len · seq_len\n        global_steps · reward_wait_ms · reward_compute_ms", { size: 14 }));
  els.push(code(1000, 1290, 960, "rollouts_<pid>.jsonl, one line per trajectory\n  time · uid · session · birth_step\n  reward · gt · pred · method          (pred/method from extra_info)\n  stop · response_len · undecodable_ids · mean_logprob\n  reward_wait_ms · reward_compute_ms\n  [reward_error] · [reward_timeout]\n  prompt (session 0 only) · response", { size: 14 }));
  els.push(sticky(0, 1520, 1960, "The decoded response keeps its end-of-text token. Id 50256 is inside the 50,257-entry GPT-2 vocab (its last entry decodes to <|endoftext|>) and the engines append the EOS token before stopping — so every eos-terminated response_text ends with the literal text \"<|endoftext|>\". gsm8k and math don't mind; exact_match and several IFEval rules do (page 13, B2).", { size: 16, font: FONT.body, bg: C.bRed, link: LINK.page(13) }));
  els.push(files(0, 1680, 1400, "src/rollout_client/RolloutWorker.cpp — agent_loop_postprocess 218-257, write_trajectory 259-338 · include/reward/README.md"));
  return els;
}

// ======================================================================
// 3 · Reward loop & registry
// ======================================================================
function loopPage() {
  const els = header(3, "Reward loop & registry", "RewardLoopWorker runs verifiers asynchronously; VerifierRegistry turns type names into verifier instances");
  els.push(plain(0, 200, 900, "A small pool of reward threads grades answers in the background. If a checker crashes or takes too long, the answer simply scores 0 and training goes on. The registry is a phone book: \"gsm8k\" → the gsm8k checker."));
  els.push(h2(0, 420, "RewardLoopWorker (206 lines)"));
  ladder(els, 0, 480, 960, [
    ["constructor — optional register_extra(registry) hook (tests; verl's custom reward function), then registry.get(type) for every reward.verifiers entry → by_dataset_[dataset]. Unknown type → invalid_argument listing the known types. Duplicate dataset: last one wins silently.", "driver"],
    ["num_workers > 0 → ThreadPool(num_workers) (+ Watchdog thread if timeout_s > 0). num_workers = 0 → score inline on the caller (timeout_s ignored, with a warning).", "driver"],
    ["compute_score_async(traj, on_done) — verifier_for(data_source) throws before queuing if there's no entry; else enqueue run_job; the deadline is queued_at + timeout_s (queue wait counts).", "driver"],
    ["run_job — skip if a timeout already finished it; score_trajectory(); std::exception → ScoreResult{} with error = e.what(); then try_emplace(\"acc\", reward_score) — a verifier's own acc survives.", "rollout"],
    ["finish — atomic exchange: the first of {result, timeout} wins; an exception thrown by on_done is caught and logged so the pool thread survives.", "trainer"],
  ]);
  // watchdog timeline
  els.push(h2(1060, 420, "Watchdog, on a timeline"));
  els.push(harrow(1080, 1940, 640, { stroke: C.dim, sw: 1.5 }), label(1900, 648, "time"));
  els.push(rect(1080, 520, 220, 50, { text: "queued", font: FONT.body, size: 14, bg: C.lGray, stroke: C.gray, sw: 1, rough: 0.3 }));
  els.push(rect(1300, 520, 500, 50, { text: "verifier running (too slow)", font: FONT.body, size: 14, bg: C.bBlue, stroke: C.blue, sw: 1, rough: 0.3 }));
  els.push(poly([{ x: 1600, y: 500 }, { x: 1600, y: 660 }], { stroke: C.red, sw: 2.5, dash: "dashed" }), text(1610, 660, "queued_at + timeout_s", { size: 14, color: C.red }));
  els.push(rect(1600, 580, 200, 46, { text: "→ 0, timeout: true", font: FONT.code, size: 13, bg: C.bRed, stroke: C.red, sw: 1, rough: 0.3 }));
  els.push(note(1060, 700, 900, "One watchdog thread with a min-heap of (deadline, weak_ptr<Job>). On expiry: reward 0, extra_info {timeout: true, acc: 0.0}, a stderr line; the late real result is dropped. Timeout callbacks run one at a time on that thread. Default timeout_s = 0 → no deadline.", { size: 15, color: C.dim }));
  els.push(card(1060, 880, 900, "Destructor: pool_.reset() drains every queued job (their on_done still runs), then the watchdog joins. Blocking helpers compute_score / compute_score_batch wrap the async call with promise/future — never call them from on_done.", "driver", { size: 15 }));

  els.push(h2(0, 1260, "VerifierRegistry (src/reward/verifiers/VerifierRegistry.cpp, 77 lines)"));
  const T = table(0, 1320, [{ w: 240, code: true }, { w: 520, code: true }, { w: 300 }], [
    ["type", "registered as", "page"],
    ["gsm8k", "make<Gsm8kVerifier>(false)", "5"],
    ["gsm8k_flexible", "make<Gsm8kVerifier>(true)", "5"],
    ["exact_match", "make<ExactMatchVerifier>()", "6"],
    ["math", "make<MathEquivalenceVerifier>()", "7"],
    ["ifeval", "make<IfEvalVerifier>()", "8"],
    ["ifeval_all", "make<IfEvalVerifier>(true)", "8"],
    ["short_response", "make<ShortResponseVerifier>()  (defined in this file)", "6"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(card(1120, 1320, 840, "How it works\n• Registered explicitly in the constructor — no static self-registration, because objects nothing references are dropped when linking from librl.a.\n• get(type) builds lazily, caches, returns nullptr if unknown; register_verifier replaces and drops the cached instance; types() is sorted.\n• Factories receive the RewardConfig, but make<V>() ignores it — no verifier reads config yet.\n• Not thread-safe: everything is resolved in the constructor, before scoring starts.\n• Not registered: code_exec, sandbox_fusion, math_equivalence.", "driver", { size: 15 }));
  els.push(h2(0, 1700, "Tests  (test_reward_loop.cpp, all passing)"));
  const tests = ["200 async jobs: each callback once, off the caller thread", "inline mode runs on the caller", "unknown data_source throws, no callback", "verifier throws → error \"boom\", score 0", "0.05 s timeout vs a 300 ms verifier → one callback, timeout: true", "stop_reason length scores 0 (score_trajectory); batch order kept", "destructor drains the queue (6/6)", "a throwing callback is contained", "registry: 7 types, caching, unknown → nullptr, replacement"];
  tests.forEach((t, i) => els.push(card((i % 3) * 660, 1760 + Math.floor(i / 3) * 84, 640, t, "trainer", { size: 14 })));
  return els;
}

// ======================================================================
// 4 · Config & wiring
// ======================================================================
function configPage() {
  const els = header(4, "Config & wiring", "The reward: section, which run configs use which verifier, and who reads the scores afterwards");
  els.push(plain(0, 200, 900, "A run's YAML lists which checker to use for each dataset name. Pick the wrong name and the rollout worker won't start; forget a dataset and its prompts silently fail."));
  els.push(code(0, 420, 960, "reward:                                  # RLConfig.h 263-291, parser 372-401\n  mode: rule_based            # rule_based | model — \"model\" only triggers validation\n  num_workers: 8              # reward threads per RolloutWorker; 0 = inline\n  timeout_s: 0.0              # 0 = no deadline\n  verifiers:                  # replaces the default list entirely\n    - {dataset: gsm8k, type: gsm8k}   # dataset = the row's data_source value\n  detokenizer_vocab: lib/gpt2_vocab.b64   # required to decode responses\n  sandbox_fusion: {url, max_concurrent: 64, memory_limit_mb: 1024}   # parsed, unused\n  model: {path, enable_resource_pool: true}                          # parsed, unused\nfilter_groups: {enable: false, metric: reward}   # DAPO filter (replay buffer)\ndata: {reward_fn_key: data_source}              # JSONL column → PromptRow.data_source", { size: 14 }));
  els.push(card(1000, 420, 960, "Plumbing\nRLDriver.cpp:168-175 creates each RolloutWorkerActor with reward.verifiers, detokenizer_vocab, rollout_data_dir, num_workers, timeout_s. RolloutWorkerActor.cpp:49-54 rebuilds RewardConfig from flat vectors — so mode, sandbox_fusion and model are not forwarded. RewardLoopManager is passed as an invalid handle (id 0).", "data", { size: 15 }));

  els.push(h2(0, 820, "Run configs, by verifier type"));
  const T = table(0, 880, [{ w: 520, code: true }, { w: 360, code: true }, { w: 520 }], [
    ["config", "dataset → type", "notes"],
    ["grpo_135m_gsm8k.yaml", "gsm8k → gsm8k_flexible", "filter_groups off"],
    ["grpo_135m_sft_gsm8k.yaml · grpo_135m_oneshot_104.yaml", "gsm8k → gsm8k", ""],
    ["grpo_1p5b_gsm8k.yaml · _1000 · _cont100", "gsm8k → gsm8k", "\"strict: last #### N or \\boxed{N}\"; filter_groups on"],
    ["grpo_1p5b_sanity_short.yaml", "gsm8k → short_response", "framework test"],
    ["grpo_135m_ifeval.yaml", "ifeval → ifeval", "data from dolci_think_rl.py --data_sources ifeval"],
    ["gpt2_single_validate.yaml", "gsm8k → exact_match", "num_workers 1; no detokenizer_vocab (B4)"],
    ["grpo_rlvr.yaml", "math_rlvr → math_equivalence, code_rlvr → code_exec", "neither type is registered (B1)"],
    ["(none)", "→ math", "no YAML uses the math type yet"],
  ], { size: 14 });
  els.push(...T.els);

  els.push(h2(1460, 820, "Who reads the score"));
  els.push(card(1460, 880, 500, "ReplayBufferAsync::dapo_filtered\nWith filter_groups.enable (not on val): metric \"reward\" = sum of rm_scores; any other metric = extra_fields.reward_extra_info[metric] (number or bool). Groups with >1 row and all-identical values are evicted. With IFEval, acc and n_passed work as metrics.", "replay", { size: 14 }));
  els.push(card(1460, 1120, 500, "RLDriver::compute_advantage\nSums rm_scores per row → GRPO outcome score, groups by uid prefix, logs reward/mean and reward/groups. Timing: timing/reward_wait_ms and reward_compute_ms (mean, max).", "trainer", { size: 14 }));
  els.push(files(0, 880 + T.h + 30, 1400, "include/config/RLConfig.h · src/config/RLConfigParser.cpp · src/replay_buffer/ReplayBufferAsync.cpp · src/driver/RLDriver.cpp · scripts/config/*.yaml"));
  return els;
}

// ======================================================================
// 5 · gsm8k
// ======================================================================
function gsm8kPage() {
  const els = header(5, "gsm8k", "Gsm8kVerifier(bool flexible) — a port of verl's gsm8k.py with one BluTrain addition");
  els.push(plain(0, 200, 900, "Finds the model's final number and compares it with the answer key as text. Strict mode wants \"#### 72\" or \\boxed{72}; flexible mode takes the last number anywhere. \"72\" and \"72.0\" are different strings, so the second fails."));
  els.push(h2(0, 420, "Algorithm  (src/reward/verifiers/Gsm8kVerifier.cpp, 58 lines)"));
  flow(els, 0, 490, 300, 120, 40, [
    ["tail = last 300 BYTES of the response", "rollout"],
    ["strict: (?:#### |\\\\boxed\\{)(\\-?[0-9\\.\\,]+)\nflexible: (\\-?[0-9\\.\\,]+)", "rollout", { font: FONT.code, size: 13 }],
    ["strict: last match\nflexible: last that isn't \"\" or \".\"", "rollout"],
    ["clean_number on pred AND gt: drop , $ space tab", "data"],
    ["equal strings → 1.0\nelse 0.0\nextra_info: acc, pred", "trainer"],
  ]);
  els.push(card(0, 660, 960, "Ground truth: data_preprocess/gsm8k.py::extract_final_answer splits the reference on \"####\\s*\", keeps the last part, strips it and removes commas → \"72\". gsm8k_chat.py re-templates the prompt (chat template + \\boxed{} instruction) and keeps the answer.", "data", { size: 15 }));
  els.push(card(1000, 660, 960, "Differences from verl's gsm8k.py\n• strict also accepts \\boxed{N} — added when the 1.5B model ignored \"####\" (GRPO_1P5B_REPORT.md bug 4)\n• flexible also drops , and $; the ground truth is cleaned too (verl compares it raw)\n• no format_score — always 0 when wrong · the window is bytes, not characters", "rollout", { size: 15 }));
  els.push(h2(0, 880, "Examples"));
  const E = exTable(0, 940, [{ w: 520, code: true }, { w: 120, code: true }, { w: 160 }, { w: 120, code: true }, { w: 400 }, { w: 100 }], [
    ["response (tail)", "gt", "mode", "pred", "why", "score"],
    ["48/2 = 24 in May, 48+24 = 72.\\n#### 72", "72", "strict [TEST]", "72", "", "1", true],
    ["#### 10\\nlater #### 72", "72", "strict [TEST]", "72", "last match wins", "1", true],
    ["so the answer is \\(\\boxed{72}\\).", "72", "strict [TEST]", "72", "\\boxed form", "1", true],
    ["…\\n#### 72<|endoftext|>", "72", "strict [RAN]", "72", "EOS text is harmless here", "1", true],
    ["the answer is 72", "72", "strict [TEST]", "", "no #### or \\boxed", "0", false],
    ["#### 72.", "72", "strict [RAN]", "72.", "trailing . captured", "0", false],
    ["\\boxed{ 72 }", "72", "strict [RAN]", "", "digit must follow {", "0", false],
    ["#### 1.50", "1.5", "strict [RAN]", "1.50", "string compare", "0", false],
    ["#### 72 + 400 × 'x'", "72", "strict [TEST]", "", "outside the 300-byte tail", "0", false],
    ["so she sold 72 clips.", "72", "flexible [TEST]", "72", "", "1", true],
    ["The answer is 72.", "72", "flexible [RAN]", "72.", "the period sticks", "0", false],
    ["The answer is 72 apples, I think", "72", "flexible [RAN]", "", "a lone \",\" is the last \"number\"", "0", false],
  ], 14);
  els.push(...E.els);
  els.push(files(0, 940 + E.h + 20, 1400, `${V}Gsm8kVerifier.cpp · include/reward/verifiers/Gsm8kVerifier.h · data_preprocess/{gsm8k,gsm8k_chat}.py`));
  return els;
}

// ======================================================================
// 6 · exact_match & short_response
// ======================================================================
function smallPage() {
  const els = header(6, "exact_match & short_response", "The two simplest verifiers: a whole-string comparison, and a pipeline sanity test");
  els.push(plain(0, 200, 900, "exact_match says yes only if the entire response, ignoring case and extra spaces, equals the answer. short_response ignores the answer and rewards replies under 800 bytes — useful to prove the training loop works, not to teach anything."));
  els.push(h2(0, 420, "ExactMatchVerifier  (exact_match, 38 lines)"));
  flow(els, 0, 490, 320, 100, 40, [
    ["split on whitespace (istringstream)", "rollout"],
    ["tolower each word (ASCII / locale)", "rollout"],
    ["join with single spaces", "rollout"],
    ["equal → 1.0, else 0.0\nno extra_info at all", "trainer"],
  ]);
  const E = exTable(0, 650, [{ w: 400, code: true }, { w: 220, code: true }, { w: 380 }, { w: 100 }], [
    ["response", "gt", "why", "score"],
    ["  The Answer  ", "the answer", "[TEST] spaces and case ignored", "1", true],
    ["  The   ANSWER\\n", "the answer", "[RAN]", "1", true],
    ["wrong", "the answer", "[TEST]", "0", false],
    ["Paris.", "paris", "[RAN] punctuation kept", "0", false],
    ["72<|endoftext|>", "72", "[RAN] decoded EOS (B2)", "0", false],
  ], 15);
  els.push(...E.els);
  els.push(card(1160, 650, 800, "Notes\n• No pred, so the rollout log's pred column is empty (B7); acc is added by the loop.\n• Used as the stand-in reward in test_rl_tq_end_to_end.cpp and by gpt2_single_validate.yaml on GSM8K — where whole-completion exact match is almost always 0.\n• Every eos-terminated completion fails it until <|endoftext|> is stripped.", "rollout", { size: 15 }));

  els.push(h2(0, 1000, "ShortResponseVerifier  (short_response, in VerifierRegistry.cpp)"));
  els.push(code(0, 1060, 960, "static constexpr size_t kShortChars = 800;\nreward_score = response.size() < kShortChars ? 1.0f : 0.0f;\nextra_info[\"acc\"]  = reward_score;\nextra_info[\"pred\"] = std::to_string(response.size()) + \" chars\";", { size: 15 }));
  const E2 = exTable(0, 1230, [{ w: 300, code: true }, { w: 260, code: true }, { w: 100 }], [
    ["response", "pred", "score"],
    ["799 × 'a'  [RAN]", "799 chars", "1", true],
    ["800 × 'a'  [RAN]", "800 chars", "0", false],
  ], 15);
  els.push(...E2.els);
  els.push(...bars(1060, 1080, 600, 240, 0, 0.8, [
    { v: 0.35, top: "0.35", label: "reward, step 0", color: C.bGray },
    { v: 0.63, top: "0.63", label: "reward, step 40", color: C.bGreen },
  ]));
  els.push(note(1060, 1370, 900, "Why it exists: a trivially learnable reward independent of math ability. Per GRPO_1P5B_REPORT.md, with grpo_1p5b_sanity_short.yaml reward rose 0.35 → 0.63 and mean length fell 300 → 230 tokens over 40 steps, repeated 4 times — proof that the RL loop updates the policy. Counts bytes, including the 13-byte <|endoftext|>.", { size: 15, color: C.dim }));
  els.push(files(0, 1480, 1400, `${V}ExactMatchVerifier.cpp · ${V}VerifierRegistry.cpp (ShortResponseVerifier, lines 20-35) · scripts/config/grpo_1p5b_sanity_short.yaml`));
  return els;
}

// ======================================================================
// 7 · math
// ======================================================================
function mathPage() {
  const els = header(7, "math", "MathEquivalenceVerifier — summarized here; the full explanation is its own drawing");
  els.push(plain(0, 200, 900, "The math checker reads LaTeX answers like a careful teacher: it knows \\frac{1}{2} = 0.5, that sets don't care about order, and that x+1 = (x²−1)/(x−1). It is big enough to have its own 10-page drawing — the button below opens it."));
  els.push(rect(0, 430, 900, 120, { text: "↗  Open \"Math verifier, explained\"  (10 pages)", font: FONT.display, size: 30, bg: C.bOrange, stroke: C.orange, sw: 3, rough: 0.8, link: MATH(0), color: C.ink }));
  els.push(small(0, 560, "Click in view mode (Ctrl+click while editing). Alt+← comes back here."));
  els.push(h2(0, 640, "Jump straight to a page of the math drawing"));
  const pages = [
    [1, "Extraction — six strategies"], [2, "Normalization — every rule"], [3, "Structure — sets, tuples, ±"], [4, "Relations & expressions"], [5, "Lexer & parser"], [6, "Comparison — exact, rtol, probing"], [7, "Methods & 26 examples"], [8, "Parity with math-verify"], [9, "Bugs, limits & files"],
  ];
  pages.forEach(([p, n], i) => els.push(card((i % 3) * 300, 700 + Math.floor(i / 3) * 80, 285, `${p} · ${n}  ↗`, "reward", { size: 15, link: MATH(p) })));

  const RX = 1000;
  els.push(h2(RX, 420, "In this system"));
  els.push(card(RX, 480, 960, "Registered as type \"math\" (VerifierRegistry). Runs on the reward threads like every verifier; its own try/catch maps any exception to method \"error\", score 0. Writes extra_info acc, pred and method — the method column of rollouts_<pid>.jsonl is filled only by this verifier. Not affected by the decoded <|endoftext|> (verified). No run config uses it yet; grpo_rlvr.yaml asks for math_equivalence, which isn't registered.", "reward", { size: 15 }));
  els.push(card(RX, 720, 960, "Dependencies\n• SymEngine (static, -fPIC, WITH_SYMENGINE_THREAD_SAFE=ON, default ~/.local/symengine) + GMP — Makefile 75-85 (SYMENGINE_LIBS appended to LDLIBS and the worker .so link)\n• <regex> · MiniJson only for the CLI\n• make math_verifier_cli: verifier + MiniJson + SymEngine, no CUDA/Ray — used by scripts/math_verifier_parity.py and math_verifier_metamorphic.py", "data", { size: 15 }));
  els.push(h2(0, 1000, "The pipeline in one line"));
  flow(els, 0, 1060, 280, 100, 30, [
    ["extract\n\\boxed · Answer: · $…$ · last number", "rollout", { size: 14 }],
    ["normalize\nunits, \\text, unicode", "data", { size: 14 }],
    ["structure\nsets · tuples · intervals", "replay", { size: 14 }],
    ["parse\nLaTeX → SymEngine", "reward", { size: 14 }],
    ["compare\nexact · rtol · probing", "trainer", { size: 14 }],
    ["method\nstring/sym/choice/…", "gray", { size: 14 }],
  ]);
  els.push(card(0, 1220, 1960, "As of the 16:57 source (1671 lines, 147 score assertions): exact decimals must be identical unless one has more than 6 places and they agree to ~1e-6; probing uses 7 fixed points with rtol 1e-9 (1e-4 when a side contains a written decimal); answers up to 1024 characters are parsed (kMaxAnswerLen). Still open: \"dog\" = \"god\", the % retry, same-letter choice with an unparsable value — all detailed in the math drawing.", "reward", { size: 15, link: MATH(6) }));
  return els;
}

// ======================================================================
// 8 · IFEval: how it scores
// ======================================================================
function ifevalPage() {
  const els = header(8, "IFEval: how it scores", "IfEvalVerifier(bool all_or_nothing) — a C++ port of open-instruct's IFEvalVerifier over the IFEvalG constraint set");
  els.push(plain(0, 200, 900, "Instruction-following prompts come with rules like \"no commas\", \"mention 'ocean'\", \"under 100 words\". The verifier checks each rule on the final answer and returns the fraction followed (ifeval) or 1 only if all are followed (ifeval_all)."));
  els.push(h2(0, 420, "Ground truth: Python literal → JSON, offline"));
  els.push(code(0, 480, 960, "Dolci row:  \"[{'instruction_id': ['keywords:existence'],\n              'kwargs': [{'keywords': ['ocean']}]}]\"     # a Python literal\n\ndolci_think_rl.py::ifeval_ground_truth_to_json\n  ast.literal_eval → unwrap a 1-element list → json.loads if it's a string\n  → require equal-length non-empty instruction_id / kwargs → json.dumps\n\nstored:     {\"instruction_id\": [\"keywords:existence\"],\n             \"kwargs\": [{\"keywords\": [\"ocean\"]}]}", { size: 14 }));
  els.push(card(1000, 480, 960, "Why offline: the C++ side reads JSON with MiniJson only. Unparseable rows are skipped and counted; --data_sources ifeval keeps only IF rows (every data_source in the file needs a reward.verifiers entry). Without the conversion every row scores 0 with error \"ground_truth is not JSON\".", "data", { size: 15 }));

  els.push(h2(0, 800, "score(response, ground_truth)  (IfEvalVerifier.cpp 1206-1264)"));
  ladder(els, 0, 860, 960, [
    ["parse ground truth (object or 1-element list) — not JSON / empty / missing lists → 0 with an error message", "data"],
    ["clean_answer: drop <|assistant|>, strip, keep text after the LAST </think>, drop <answer> / </answer>, strip  (<|endoftext|> is NOT removed)", "trainer"],
    ["n = min(len(ids), len(kwargs))  (Python zip) — empty answer or n = 0 → 0", "trainer"],
    ["each constraint → Pass / Fail / BadArgs / Unknown; only Pass counts — a broken rule never earns free reward", "trainer"],
    ["ifeval = passed / n   ·   ifeval_all = 1 if passed == n else 0", "trainer"],
  ]);
  els.push(code(1000, 860, 960, "extra_info\n  n_constraints, n_passed        int64\n  pred           \"2/3 failed: punctuation:no_comma\"\n  failed_ids · unknown_ids · bad_args_ids   (only if non-empty)\n  error          (bad ground truth)\n  acc            added by the loop (= the fraction)", { size: 14 }));
  els.push(card(1000, 1060, 960, "Strict only: Google IFEval's \"loose\" variants (drop first/last line, remove *) are not implemented. kwargs: missing and null are the same; numbers are doubles; \"less than\" → <, \"at least\" → >=; counts that Python reads with \"if not x\" are BadArgs at 0.", "trainer", { size: 15 }));

  els.push(h2(0, 1330, "Examples  — gt3 = {no_comma, existence[ocean], number_words < 100}"));
  const E = exTable(0, 1390, [{ w: 620, code: true }, { w: 160 }, { w: 160 }, { w: 520 }, { w: 120 }], [
    ["response", "ifeval", "ifeval_all", "why", "tag"],
    ["The ocean is calm, blue.", "0.667", "0", "comma breaks no_comma", "[TEST]", true],
    ["<think>a, b, c, no ocean</think> The ocean is calm.", "1", "1", "reasoning ignored", "[TEST]", true],
    ["<answer>The ocean.</answer>", "1", "1", "tags stripped", "[TEST]", true],
    ["<think>thinking only</think>", "0", "0", "empty answer", "[TEST]", false],
    ["gt as a Python literal", "0", "0", "error: ground_truth is not JSON", "[RAN]", false],
    ["ids [no_comma, quotation], kwargs [null]; \"Hi there\"", "1", "1", "zip drops quotation (B8)", "[RAN]", true],
  ], 14);
  els.push(...E.els);
  els.push(files(0, 1390 + E.h + 20, 1400, `${V}IfEvalVerifier.cpp (1266 lines) · include/reward/verifiers/IfEvalVerifier.h · data_preprocess/dolci_think_rl.py · tests/unit/test_if_verifier.cpp`));
  return els;
}

// ======================================================================
// 9 · IFEval: the 54 rules
// ======================================================================
function rulesPage() {
  const els = header(9, "IFEval: the 54 rules", "Every instruction id the verifier knows, grouped by family — 25 from Google IFEval, 29 from IFEvalG (Tulu / OLMo training constraints)");
  els.push(plain(0, 200, 900, "Each rule is a small check on the answer text. Some just look for a character, some count words or sentences (using a port of NLTK), a few detect the language (a port of langdetect). Matching is case-sensitive unless marked ci."));
  const groups = [
    ["keywords (10)", [
      "existence {keywords} — each appears, ci substring",
      "frequency {keyword, frequency, relation} — ci count < / ≥ (also word_count_different_numbers)",
      "forbidden_words — none as a whole word, ci",
      "letter_frequency {letter, let_frequency, let_relation}",
      "word_once {keyword} — ci count == 1",
      "exclude_word_harder — \" kw \" never appears",
      "no_adjacent_consecutive — no two adjacent words start with consecutive letters",
      "palindrome — some word reads the same reversed",
      "keyword_specific_position {keyword, n, m} — token m of sentence n",
      "start_end — first and last word tokens equal (ci), ≥ 2 tokens",
    ]],
    ["length_constraints (4)", [
      "number_sentences {num_sentences, relation} — punkt sentences",
      "number_paragraphs {num_paragraphs} — split on ***",
      "number_words {num_words, relation} — \\w+ runs",
      "nth_paragraph_first_word {num_paragraphs, nth_paragraph, first_word}",
    ]],
    ["detectable_format (9)", [
      "number_bullet_lists {num_bullets} — lines starting * or -",
      "constrained_response — \"My answer is yes/no/maybe.\"",
      "number_highlighted_sections {num_highlights} — *x* and **x**",
      "multiple_sections {section_spliter, num_sections}",
      "json_format — strict JSON after stripping ``` fences",
      "title — <<a title>> on one line",
      "square_brackets — every word wrapped in [ ]",
      "bigram_wrapping — <<word word>> pairs",
      "sentence_hyphens — sentences joined by - with no spaces",
    ]],
    ["detectable_content (2)", ["number_placeholders {num_placeholders} — [...] spans", "postscript {postscript_marker} — P.S. / P.P.S"]],
    ["paragraphs (2)", ["paragraphs — exactly 2 *** paragraphs", "paragraphs2 — exactly 2 blank-line paragraphs"]],
    ["combination (2)", ["two_responses — two different parts split by ******", "repeat_prompt {prompt_to_repeat} — answer starts with the prompt"]],
    ["startend (2)", ["end_checker {end_phrase} — ends with it (ci)", "quotation — wrapped in \" \""]],
    ["punctuation (3)", ["no_comma", "punctuation_dot — no .", "punctuation_exclamation — no !"]],
    ["copy (4) + new (1)", ["copy:repeat_phrase {phrase, small_n} — n copies, one word changed each", "copy:copy · copy:copying_simple {prompt_to_repeat} — equal (ci)", "copy:copying_multiple {prompt_to_repeat, N} — N copies split by ******", "new:copy_span_idx {prompt_to_repeat, n_start, n_end} — a slice of the prompt"]],
    ["first_word / last_word (4)", ["first_word_answer {first_word}", "first_word_sent — every sentence starts with it", "last_word_answer {last_word}", "last_word_sent — every sentence ends with it"]],
    ["count (4)", ["lowercase_counting {N} — no lowercase word more than N times", "count_increment_word {keyword1, keyword2} — once and twice", "counting_composition {n_sent, n_words} — 3 paragraphs × n sentences × n words", "count_unique — no repeated word"]],
    ["letters (2)", ["letter_counting {N, relation} — letters (str.isalpha)", "letter_counting2 — alias of letter_frequency"]],
    ["change_case (3)", ["capital_word_frequency {capital_frequency, capital_relation}", "english_capital — all caps AND langdetect = en", "english_lowercase — all lowercase AND langdetect = en"]],
    ["language (1)", ["response_language {language} — langdetect == ISO code"]],
  ];
  const cols = [0, 660, 1320];
  const colY = [420, 420, 420];
  for (const [g, items] of groups) {
    const c = colY.indexOf(Math.min(...colY));
    const r = card(cols[c], colY[c], 640, `${g}\n${items.map((s) => "• " + s).join("\n")}`, "trainer", { size: 14 });
    els.push(r);
    colY[c] += r.height + 24;
  }
  const by = Math.max(...colY) + 30;
  els.push(card(0, by, 1960, "Phases (from the code comments): 42 rules need no tokenizer, 9 use punkt / the IFEvalG regex sentence splitter / word_tokenize, 3 use langdetect. test_if_verifier.cpp has 128 rule-level pass/fail checks covering all 54 ids, with expected values produced by running the Python reference (nltk 3.10, langdetect seed 0).", "trainer", { size: 15 }));
  els.push(note(0, by + 110, 1960, "Rule examples [TEST]: keywords:frequency \"concatenate\" with cat ≥ 1 → Pass (substring) · forbidden_words \"pineapples\" vs apples → Pass (whole word) · json_format {\"a\": 01} → Fail · copy:repeat_phrase with no word changed → Fail · response_language \"12345 !!!\" → Fail (no features).", { size: 15, color: C.dim }));
  return els;
}

// ======================================================================
// 10 · IFEval: NLTK, langdetect, PyStr
// ======================================================================
function portsPage() {
  const els = header(10, "IFEval: NLTK, langdetect, PyStr", "IFEval's Python dependencies, re-implemented in C++ so results match the reference exactly");
  els.push(plain(0, 200, 900, "Python's IFEval leans on three libraries: NLTK to split sentences and words, langdetect to guess the language, and Python's own string rules. BluTrain re-wrote each in C++ with data tables dumped from Python, so the same text gets the same verdict."));
  const comp = [
    ["NltkTokenize.cpp (562 lines)", "PunktEnglishData.inc — 20,620 lines (239 KB): abbrev_types 155, collocations 36, sent_starters 38, ortho_context 20,365", "sent_tokenize: Punkt (inference only, realign_boundaries) — period contexts, first pass (sentbreak, ellipsis, abbreviation), second pass (collocations, orthographic heuristic, sentence starters).\nword_tokenize: NLTKWordTokenizer rules in order — starting quotes, punctuation, brackets, double dashes, ending quotes ('s 'll n't …), contractions (can|not, gon|na, wan|na, 't|is …). Each re.sub is a hand-written scanner: std::regex has no lookbehind or Unicode \\w."],
    ["Langdetect.cpp (365 lines)", "LangdetectData.inc — 184,357 lines (1.86 MB): 55 language profiles + normalization tables", "langdetect 1.0.9: strip URLs/emails, normalize (Vietnamese diacritics, CJK classes), 1-3-gram extraction (skipped inside ALL-CAPS words), 7 trials with CPython's MT19937 seeded 0 + random.gauss, Neumaier-compensated normalization every 5 steps, stop at p > 0.99999 or 1000 iterations; best language above 0.1."],
    ["PyStr.h (190 lines)", "PyStrTables.inc — 794 lines (99 KB), dumped from Python 3.12.13 / unicodedata 15.0.0 / regex 2026.9.29", "Python str semantics on UTF-8: decode (bad bytes → U+FFFD) and encode; re-module and regex-module \\w \\d \\s; isalpha / isalnum / isupper / islower / istitle; single-code-point lower; strip, sub, replace_all, split."],
  ];
  comp.forEach(([n, data, d], i) => {
    const y = 420 + i * 330;
    const src = box(0, y, 380, 110, n, "trainer", { size: 17 });
    const tbl = box(0, y + 140, 380, 130, data, "data", { size: 13, font: FONT.body });
    els.push(src, tbl, arrow(src, tbl, "data"));
    els.push(card(440, y, 1520, d, "trainer", { size: 15 }));
  });
  els.push(h2(0, 1440, "Examples"));
  const E = table(0, 1500, [{ w: 640, code: true }, { w: 760 }, { w: 120 }], [
    ["input", "result", "tag"],
    ["I can't do it, won't you? They're gonna say 'hello' (maybe).", "I ca n't do it , wo n't you ? They 're gon na say ' hello ' ( maybe ) .", "[TEST]"],
    ["Dr. Smith arrived at 3 p.m. today. He said: wow! Is it e.g. fine?", "punkt: 4 sentences, splitting after \"e.g.\" — the IFEvalG regex splitter gives 3", "[RAN]"],
    ["Bonjour, comment allez-vous aujourd'hui? · Hola, ¿cómo estás?", "fr · es", "[RAN]"],
    ["THE QUICK BROWN FOX", "vi — ALL-CAPS words are skipped, so too few n-grams remain", "[RAN]"],
    ["SURE THING BOSS", "de → change_case:english_capital fails", "[TEST]"],
    ["12345 !!!", "no features → response_language fails (Python IFEval counts it as passed)", "[TEST]"],
  ], { size: 14 });
  els.push(...E.els);
  els.push(sticky(1560, 1440, 400, "Missing from the repo: the generator scripts for all three .inc tables — only header comments describe how they were dumped (B14).", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(h2(0, 1500 + E.h + 50, "Deliberate differences from the Python reference"));
  const diffs = [
    "keywords, phrases and markers are matched literally (Python treats them as regexes: \"c++\" raises, \".\" matches anything) — postscript keeps . as a wildcard",
    "missing / null kwargs and 0 counts are BadArgs (fail) — Python's build_description would draw random values",
    "unknown ids and bad kwargs fail that one constraint — Python's verifier crashes",
    "langdetect \"no features\" is a Fail (IFEval returns True) and is deterministic (seed 0, sorted profiles)",
    "case folding for keyword search is ASCII-only; other comparisons use Unicode single-character lower",
    "strict only — no loose mode · ground truth must be JSON (conversion moved offline)",
  ];
  diffs.forEach((d, i) => els.push(card((i % 2) * 990, 1500 + E.h + 110 + Math.floor(i / 2) * 100, 970, d, "trainer", { size: 14 })));
  return els;
}

// ======================================================================
// 11 · Scaffolding
// ======================================================================
function scaffoldPage() {
  const els = header(11, "Scaffolding", "What's real, what throws, what's built but unused — and the architecture the docs plan next");
  els.push(plain(0, 200, 900, "Some reward classes are placeholders for later work: they exist so the design compiles, but calling them throws \"not implemented yet\". This page separates them from what actually runs."));
  const T = table(0, 420, [{ w: 380, code: true }, { w: 260 }, { w: 1320 }], [
    ["component", "status", "details"],
    ["RewardLoopWorker", "real", "the async loop (page 3)"],
    ["VerifierRegistry + 7 verifiers", "real", "pages 3, 5-10"],
    ["RewardLoopManager", "throws", "init_reward_loop_workers / compute_rm_score → logic_error \"not implemented yet (scaffolding only)\"; driver passes it as handle id 0"],
    ["CodeExecVerifier", "throws", "score → \"not implemented yet (P3, scaffolding only)\"; not registered"],
    ["SandboxFusionClient", "throws", "execute → \"not implemented yet (P3)\"; the HTTP client library choice is deferred"],
    ["RewardDispatchPolicy", "real, unused", "select_streaming_worker = std::rand() % n (verl's random.choice); chunk_for_colocated = round-robin i % n"],
    ["reward.mode: model · reward.model · sandbox_fusion", "parsed, unused", "only validation: mode model requires model.enable_resource_pool"],
    ["TrajectoryData.extra_info · score_trajectory", "extension point", "no built-in verifier uses them"],
  ], { size: 14, cellBg: (ri, ci) => (ci === 1 && ri > 0 ? (ri <= 2 ? C.bGreen : ri <= 5 ? C.bRed : C.bYellow) : "#ffffff") });
  els.push(...T.els);

  els.push(h2(0, 1060, "Built today vs designed next  (docs/ARCHITECTURE.md §7.1, IMPLEMENTATION_PLAN.md)"));
  els.push(rect(0, 1120, 940, 560, { bg: C.lGreen, stroke: C.green, sw: 1.5, dash: "dashed", rough: 0.4 }));
  els.push(text(20, 1130, "today", { size: 18, bold: true, color: C.green }));
  const rw = box(40, 1190, 380, 90, "RolloutWorker (Ray actor)", "gray");
  const lp = box(40, 1340, 380, 110, "RewardLoopWorker\nthreads inside the same process", "driver");
  const vv = box(480, 1340, 400, 110, "rule-based verifiers\n(CPU)", "rollout");
  els.push(rw, lp, vv, arrow(rw, lp, "driver"), arrow(lp, vv, "rollout"));
  els.push(rect(1020, 1120, 940, 560, { bg: C.lGray, stroke: C.gray, sw: 1.5, dash: "dashed", rough: 0.4 }));
  els.push(text(1040, 1130, "designed (scaffolding)", { size: 18, bold: true, color: C.dim }));
  const mg = box(1060, 1190, 400, 100, "RewardLoopManager\n(one Ray actor)", "gray");
  const ws = box(1060, 1360, 400, 100, "N RewardLoopWorker Ray actors\nround-robin node placement", "gray");
  const sb = box(1520, 1190, 400, 100, "SandboxFusion service\ncode_exec (security review first)", "gray");
  const rmb = box(1520, 1360, 400, 100, "generative reward model\nown GPU pool (required)", "gray");
  els.push(mg, ws, sb, rmb, arrow(mg, ws), arrow(ws, sb, "gray", { dash: "dashed" }), arrow(ws, rmb, "gray", { dash: "dashed" }));
  els.push(note(1060, 1500, 880, "Two dispatch policies: streaming random.choice per trajectory, or colocated chunk → scatter → gather (verl reward_loop.py 342-360). Rule-based verifiers need no resource pool; a reward model must have its own (enable_resource_pool, copied from verl). Plan order: exact-match and math first, code-exec in a security-reviewed workstream, reward model optional.", { size: 14, color: C.dim }));
  els.push(files(0, 1720, 1400, "src/reward/{RewardLoopManager,RewardDispatchPolicy}.cpp · src/reward/verifiers/{CodeExecVerifier,SandboxFusionClient}.cpp · docs/ARCHITECTURE.md · docs/IMPLEMENTATION_PLAN.md"));
  return els;
}

// ======================================================================
// 12 · Dependencies & build
// ======================================================================
function depsPage() {
  const els = header(12, "Dependencies & build", "What each verifier needs to compile, run and get its data — and where the Makefile puts it");
  els.push(plain(0, 200, 900, "gsm8k and exact_match need only the C++ standard library. math needs the SymEngine algebra library. IFEval carries about 2 MB of generated data tables. All of them are compiled into the Ray worker library that the rollout actors load."));
  // dependency graph
  const vrf = [
    ["gsm8k", 0, "rollout"], ["exact_match", 1, "rollout"], ["short_response", 2, "rollout"], ["math", 3, "reward"], ["ifeval / ifeval_all", 4, "trainer"], ["code_exec (stub)", 5, "gray"],
  ];
  const deps = {
    regex: box(1000, 420, 260, 64, "<regex>", "data", { font: FONT.code, size: 15 }),
    sstream: box(1000, 500, 260, 64, "<sstream> <cctype>", "data", { font: FONT.code, size: 15 }),
    sym: box(1000, 600, 260, 80, "SymEngine + GMP\n(~/.local/symengine)", "reward", { size: 15 }),
    json: box(1000, 720, 260, 64, "MiniJson", "data", { font: FONT.code, size: 15 }),
    nltk: box(1320, 700, 300, 80, "NltkTokenize\n+ PunktEnglishData.inc", "trainer", { size: 14 }),
    lang: box(1320, 800, 300, 80, "Langdetect\n+ LangdetectData.inc", "trainer", { size: 14 }),
    pystr: box(1320, 900, 300, 80, "PyStr.h\n+ PyStrTables.inc", "trainer", { size: 14 }),
    cfg: box(1000, 960, 260, 64, "SandboxFusionConfig", "gray", { font: FONT.code, size: 14 }),
  };
  els.push(...Object.values(deps));
  const vb = vrf.map(([n, i, k]) => box(0, 420 + i * 110, 320, 80, n, k, { size: 16, link: LINK.page([5, 6, 6, 7, 8, 11][i]) }));
  els.push(...vb);
  const edge = (v, d) => els.push(connect(vb[v], deps[d], { stroke: C.gray, sw: 1.3, end: "triangle", rough: 0.4 }));
  edge(0, "regex"); edge(1, "sstream"); edge(3, "sym"); edge(3, "regex"); edge(4, "json"); edge(4, "nltk"); edge(4, "lang"); edge(4, "pystr"); edge(5, "cfg");
  els.push(connect(deps.nltk, deps.pystr, { stroke: C.gray, sw: 1, end: "triangle", dash: "dashed", rough: 0.4, bend: 60 }));
  els.push(label(0, 1090, "short_response depends on nothing; IFEval uses no regex library — every pattern is a hand-written scanner."));

  els.push(h2(1680, 420, "Offline data"));
  els.push(card(1680, 480, 280, "gsm8k.py · gsm8k_chat.py\n→ answer \"72\"", "data", { size: 14 }));
  els.push(card(1680, 600, 280, "dolci_think_rl.py\n→ IFEval JSON gt, math rows (data_source \"math\")", "data", { size: 14 }));
  els.push(card(1680, 760, 280, "jsonl_to_bin.py\n→ .rlbin (optional)", "data", { size: 14 }));

  els.push(h2(0, 1160, "Where the Makefile puts each piece"));
  const T = table(0, 1220, [{ w: 520 }, { w: 1440 }], [
    ["target", "reward sources"],
    ["librl.a (RL_SOURCES := find …, line 215)", "everything under src/reward/, stubs included"],
    ["rollout_bridge_worker.so (ROLLOUT_BRIDGE_SO_SRCS 259-283)", "RewardLoopWorker, VerifierRegistry, ExactMatch, Gsm8k, MathEquivalence, IfEval, Langdetect, NltkTokenize, data/MiniJson — not RewardLoopManager, RewardDispatchPolicy, CodeExec, SandboxFusion"],
    ["link flags", "SYMENGINE_LIBS = -lsymengine -lgmp appended to LDLIBS (213) and the worker .so (323); CPATH / LIBRARY_PATH exported from SYMENGINE_PREFIX"],
    ["math_verifier_cli (465-473)", "MathEquivalenceVerifier + MiniJson + SymEngine only"],
    ["REAL_TESTS (485-490)", "test_reward_dispatch, test_reward_loop, test_verifiers, test_if_verifier"],
    ["NOCUDA_SOURCES (666-677)", "RewardDispatchPolicy, VerifierRegistry, ExactMatchVerifier (compile-only check)"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(h2(0, 1220 + T.h + 50, "Tests  (all four pass on the current sources)"));
  const tt = [
    ["test_verifiers.cpp", 338, "gsm8k, exact_match, math — 147 score + 76 parse assertions"],
    ["test_if_verifier.cpp", 302, "128 rule checks (all 54 ids), 9 tokenizer, 6 langdetect, 11 whole-verifier, 6 BadArgs/Unknown"],
    ["test_reward_loop.cpp", 225, "10 functions: pool, inline, errors, timeout, drain, registry"],
    ["test_reward_dispatch.cpp", 27, "chunk_for_colocated: 10 rows → 3 chunks"],
  ];
  tt.forEach(([n, l, d], i) => els.push(card((i % 2) * 990, 1220 + T.h + 110 + Math.floor(i / 2) * 100, 970, `${n}  (${l} lines)\n${d}`, "trainer", { size: 14 })));
  return els;
}

// ======================================================================
// 13 · Bugs & gotchas
// ======================================================================
function bugsPage() {
  const els = header(13, "Bugs & gotchas", "Known issues found by reading and running the code, most severe first");
  els.push(plain(0, 200, 900, "Two of these can silently cost reward right now: the end-of-text token glued to every answer (B2), and prompts whose dataset has no verifier failing without a log line (B3)."));
  const bugs = [
    ["B1", "grpo_rlvr.yaml names unregistered types", "math_equivalence and code_exec parse fine but make RolloutWorker throw at construction. The registered math type is \"math\"; code-exec isn't registered.", "sync"],
    ["B2", "the decoded EOS reaches every verifier", "\"<|endoftext|>\" ends every eos-terminated response. Breaks exact_match and IFEval end/case rules (quotation, end_checker, last_word, json_format, english_capital: all 1 → 0 [RAN]), adds 13 bytes to short_response. gsm8k and math unaffected. Fix: strip special tokens in agent_loop_postprocess or clean_answer.", "sync"],
    ["B3", "unknown data_source fails silently", "verifier_for throws inside agent_loop_postprocess; run_prompt's catch settles the session as failed with no log line → failure groups, evicted and refilled.", "sync"],
    ["B4", "missing detokenizer_vocab", "every session throws (gpt2_single_validate.yaml) — also silently.", "sync"],
    ["B5", "gsm8k string-compare quirks", "\"72.\" captured with its period; flexible's lone \",\" → empty pred; \\boxed{ 72 } not matched; 1.50 ≠ 1.5; window counts bytes.", "reward"],
    ["B6", "misleading \"verifier threw\" log", "run_job logs it whenever extra_info has \"error\" — including IFEval's normal ground-truth errors.", "gray"],
    ["B7", "exact_match sets no pred", "the rollout log's pred column is always empty for it.", "gray"],
    ["B8", "IFEval zip truncation", "mismatched instruction_id / kwargs lengths drop constraints (same as Python; dolci_think_rl.py guards it).", "gray"],
    ["B9", "duplicate reward.verifiers datasets", "the last entry wins without a warning.", "gray"],
    ["B10", "non-numeric DAPO metric", "filter_groups.metric naming pred or failed_ids makes ReplayBufferAsync throw \"missing DAPO metric\".", "reward"],
    ["B11", "timeout semantics", "the deadline includes queue wait; timeout callbacks run serially; inline mode ignores timeout_s.", "gray"],
    ["B12", "settings dropped or unused", "reward.mode, reward.model, sandbox_fusion never used; RolloutWorkerActor doesn't forward them.", "gray"],
    ["B13", "stale docs", "STATUS.md calls math a placeholder and says RewardLoopWorker throws; README.md lists code-exec; an RLDriver comment mentions a removed stub; IfEvalVerifier.h mentions a parity CLI that doesn't exist.", "gray"],
    ["B14", "missing generators, stale artefacts", "no scripts for the three .inc tables; .d files for removed Gsm8kShaped / Gsm8kAnswer verifiers.", "gray"],
    ["B15", "unused extension points", "TrajectoryData.extra_info, prompt_text and score_trajectory are not used by any built-in verifier.", "gray"],
    ["B16", "open TODOs", "every rollout goes to the train partition (no val routing); partially visible groups are classified anyway.", "gray"],
  ];
  bugs.forEach(([id, t, d, k], i) => els.push(card((i % 2) * 990, 420 + Math.floor(i / 2) * 150, 970, `${id} · ${t}\n${d}`, k, { size: 14 })));
  els.push(h2(0, 1660, "B2, measured: IFEval rules with and without the decoded EOS  [RAN]"));
  const rules = ["startend:quotation", "last_word:last_word_answer", "change_case:english_capital", "detectable_format:json_format", "startend:end_checker"];
  rules.forEach((r, i) => {
    els.push(rect(0, 1720 + i * 60, 520, 50, { text: r, font: FONT.code, size: 14, bg: "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(rect(530, 1720 + i * 60, 220, 50, { text: "clean: 1", font: FONT.code, size: 14, bg: C.bGreen, stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(rect(760, 1720 + i * 60, 300, 50, { text: "+ <|endoftext|>: 0", font: FONT.code, size: 14, bg: C.bRed, stroke: C.gray, sw: 1, rough: 0, round: false }));
  });
  return els;
}

write([overview, archPage, e2ePage, loopPage, configPage, gsm8kPage, smallPage, mathPage, ifevalPage, rulesPage, portsPage, scaffoldPage, depsPage, bugsPage], process.argv[2]);
