// Builds the "BluTrain RL, explained" sketchboard showcase.
// Source of truth: /home/blubridge-029/RLVR-main/RL/BluTrain/RL (read 2026-11-04). Numbers in
// brackets are the 1.5B GSM8K run (scripts/config/grpo_1p5b_gsm8k*.yaml).
const fs = require("fs");
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame, group } = L;
const { K, box, card, code, h2, small, label, arrow, poly, harrow, table, plot, bars, pagesKit, files } = require("./kit.cjs");

// ---------- pages, navigation, links ----------
const PAGE_NAMES = [
  "0 · Overview",
  "1 · Launch & config",
  "2 · Prompts & TransferQueue",
  "3 · Rollout",
  "4 · Rewards",
  "5 · Replay buffer",
  "6 · Advantage & loss",
  "7 · Trainer",
  "8 · Weight sync",
  "9 · One step, end to end",
  "10 · Metrics, results & caveats",
];
const ACCENT = [C.violet, C.dim, C.teal, C.blue, C.orange, C.grape, C.yellow, C.green, C.red, C.violet, C.dim];
const { LINK, header, write } = pagesKit("bt", PAGE_NAMES, ACCENT);

// ======================================================================
// 0 · Overview
// ======================================================================
function overview() {
  const els = header(0, "BluTrain RL — how it works", "Asynchronous GRPO (RL with verifiable rewards) in pure C++ on Ray · a port of verl's separate_async trainer · rollout and training run on separate GPU pools");
  els.push(small(0, 156, "Read from RL/ in the BluTrain repo. [brackets] = the 1.5B GSM8K run. Every box with a page number jumps to that page (click in view mode, Ctrl+click while editing; Alt+← comes back)."));

  // ----- architecture -----
  const F = { x: 0, y: 230, w: 1520, h: 1010 };
  els.push(frame(F.x, F.y, F.w, F.h, "Architecture — processes, planes and data flow"));
  const drv = box(560, 270, 400, 120, "RLDriver  (lib/train_grpo)\nfit loop · ReplayBufferAsync · advantages\nMetricsAggregator · WeightSyncEngine", "driver", { size: 18, link: LINK.page(9) });
  const ds = box(40, 285, 330, 90, "PromptDatasetActor\nshuffled pretokenized prompts", "data", { link: LINK.page(2) });
  const ckpt = box(1150, 285, 330, 90, "Checkpoints\nglobal_step_N/actor.safetensors", "gray", { link: LINK.page(10) });
  const tq = box(160, 500, 1200, 120, "Blu-TransferQueue  —  the data plane\nZMQ KV store: 1 controller + N storage shards · rows {uid} (prompt) and {uid}_{session}_0 (trajectory)", "data", { size: 20, sw: 3, link: LINK.page(2) });
  els.push(drv, ds, ckpt, tq);

  // rollout pool
  els.push(rect(30, 700, 690, 510, { bg: K.rollout.l, stroke: K.rollout.s, sw: 1.5, dash: "dashed", rough: 0.5, opacity: 70 }));
  els.push(text(50, 712, "Rollout pool · GPUs 1–7  →  page 3", { size: 18, bold: true, color: K.rollout.s, link: LINK.page(3) }));
  const mgr = box(60, 760, 290, 90, "RolloutManager\nsplits a batch across workers", "rollout", { link: LINK.page(3) });
  const wk = box(60, 900, 290, 100, "RolloutWorker ×7  (CPU)\nthread pool · n sessions per prompt", "rollout", { link: LINK.page(3) });
  const ver = box(60, 1060, 290, 100, "Verifier  →  page 4\ngsm8k · math · ifeval · exact", "reward", { link: LINK.page(4) });
  const lb = box(400, 760, 290, 90, "RolloutLoadBalancer\nsticky LRU · least in-flight", "rollout", { link: LINK.page(3) });
  const rep = box(400, 900, 290, 100, "RolloutReplica ×7  (1 GPU each)\nPagedEngine: paged KV cache", "rollout", { link: LINK.page(3) });
  els.push(mgr, wk, ver, lb, rep);
  els.push(arrow(mgr, wk, "rollout"), arrow(wk, lb, "rollout"), arrow(lb, rep, "rollout"), arrow(wk, ver, "reward"));
  els.push(label(355, 870, "tokens", { size: 13 }));

  // trainer pool
  els.push(rect(800, 700, 690, 510, { bg: K.trainer.l, stroke: K.trainer.s, sw: 1.5, dash: "dashed", rough: 0.5, opacity: 70 }));
  els.push(text(820, 712, "Trainer pool · GPU 0  →  page 7", { size: 18, bold: true, color: K.trainer.s, link: LINK.page(7) }));
  const tw = box(830, 760, 630, 100, "TrainerWorker  (1 GPU)\nActorModel (trained) + ReferenceModel (frozen) + AdamW", "trainer", { link: LINK.page(7) });
  const t1 = box(1047, 900, 195, 100, "old log-probs\nπ_old", "trainer", { size: 17, link: LINK.page(7) });
  const t2 = box(1265, 900, 195, 100, "ref log-probs\nπ_ref", "trainer", { size: 17, link: LINK.page(7) });
  const t3 = box(830, 900, 195, 100, "update_actor\nfused GRPO loss", "trainer", { size: 17, link: LINK.page(6) });
  const rb = box(830, 1060, 630, 100, "ReplayBufferAsync  (in the driver)  →  page 5\npicks the oldest finished groups · evicts stale / failed / zero-signal (DAPO) groups", "replay", { size: 17, link: LINK.page(5) });
  els.push(tw, t1, t2, t3, rb);
  els.push(arrow(tw, t1, "trainer"), arrow(tw, t2, "trainer"), arrow(tw, t3, "trainer"));

  // control plane (dashed violet) and data plane (teal)
  const ctl = { dash: "dashed", sw: 1.5 };
  els.push(arrow(drv, ds, "driver", ctl), arrow(drv, ckpt, "driver", ctl));
  els.push(connect(drv, tq, { stroke: K.data.s, sw: 2.5, start: "triangle", end: "triangle", rough: 0.5 }));
  els.push(label(770, 430, "put prompts · read rewards\nput advantages", { size: 13 }));
  els.push(connect(tq, wk, { stroke: K.data.s, sw: 2.5, start: "triangle", end: "triangle", rough: 0.5, bend: -40 }));
  els.push(label(118, 660, "trajectories + rewards", { size: 13 }));
  els.push(connect(tq, tw, { stroke: K.data.s, sw: 2.5, start: "triangle", end: "triangle", rough: 0.5 }));
  els.push(label(1160, 660, "log-probs · advantages", { size: 13 }));
  els.push(connect(drv, mgr, { stroke: K.driver.s, sw: 1.5, dash: "dashed", end: "triangle", rough: 0.5, bend: 140 }));
  els.push(connect(drv, tw, { stroke: K.driver.s, sw: 1.5, dash: "dashed", end: "triangle", rough: 0.5, bend: -110 }));
  // weight sync
  els.push(connect(t3, rep, { stroke: K.sync.s, sw: 4, end: "triangle", rough: 0.5 }));
  els.push(text(760, 1015, "NCCL weight sync\nevery step\n→ page 8", { size: 15, bold: true, color: K.sync.s, align: "center", link: LINK.page(8) }));

  // legend
  const lg = F.y + F.h - 16;
  els.push(poly([{ x: 40, y: lg + 60 }, { x: 110, y: lg + 60 }], { type: "arrow", end: "triangle", stroke: K.driver.s, sw: 1.5, dash: "dashed" }), label(120, lg + 51, "control plane: Ray actor RPCs (keys, tags, small structs)"));
  els.push(poly([{ x: 560, y: lg + 60 }, { x: 630, y: lg + 60 }], { type: "arrow", end: "triangle", stroke: K.data.s, sw: 2.5 }), label(640, lg + 51, "data plane: tensors through TransferQueue"));
  els.push(poly([{ x: 1000, y: lg + 60 }, { x: 1070, y: lg + 60 }], { type: "arrow", end: "triangle", stroke: K.sync.s, sw: 4 }), label(1080, lg + 51, "weights: NCCL broadcast"));

  // ----- right column: the loop + page index -----
  const RX = 1620;
  els.push(h2(RX, 230, "The loop, one step"));
  const loop = [
    ["1", "Submit prompts", "driver puts 32 prompt rows in TQ and fans them out to rollout workers (fire-and-forget)", "driver", 2],
    ["2", "Generate + score (async)", "8 samples per prompt on GPUs 1–7; the verifier scores each and writes a trajectory row", "rollout", 3],
    ["3", "Sample from the replay buffer", "wait until enough groups finished; drop stale, failed and all-same-reward groups", "replay", 5],
    ["4", "Log-probs on GPU 0", "π_old with the current actor, π_ref with the frozen reference", "trainer", 7],
    ["5", "Advantages", "per-group (r − mean)/(std + 1e-6), broadcast to every response token", "driver", 6],
    ["6", "Update the actor", "fused clipped-PG + k3 KL loss, AdamW step", "trainer", 6],
    ["7", "Sync weights", "pause replicas → NCCL broadcast → resume; in-flight requests re-prefill", "sync", 8],
  ];
  let ly = 290;
  const steps = loop.map(([n, t, d, k, pg]) => {
    const r = card(RX, ly, 520, `${n}. ${t}  →  page ${pg}\n${d}`, k, { link: LINK.page(pg), size: 16 });
    ly += 118;
    return r;
  });
  els.push(...steps);
  for (let i = 0; i < steps.length - 1; i++) els.push(arrow(steps[i], steps[i + 1], "gray", { sw: 1.5 }));
  els.push(connect(steps[steps.length - 1], steps[2], { stroke: C.gray, sw: 1.5, dash: "dashed", end: "triangle", bend: 330, rough: 0.5 }));
  els.push(label(RX + 610, 640, "next step\n(rollout never\nstops: steps 1–2\noverlap 3–7)", { size: 14 }));

  // page index
  els.push(h2(RX + 760, 230, "Pages"));
  const idx = [
    [1, "gray", "How a run starts · RLDriver::init · config knobs"],
    [2, "data", "Prompt data · TransferQueue row contract"],
    [3, "rollout", "Manager → workers → load balancer → GPU replicas"],
    [4, "reward", "Verifiers: gsm8k, math, ifeval, exact"],
    [5, "replay", "Staleness, DAPO filter, eviction loop"],
    [6, "trainer", "GRPO advantage, fused loss, clip & KL"],
    [7, "trainer", "Models, padded batches, update_actor, LR"],
    [8, "sync", "8-step protocol, buckets, NCCL groups"],
    [9, "driver", "Timeline of one step with exact calls"],
    [10, "gray", "Metrics, checkpoints, eval, results, caveats"],
  ];
  idx.forEach(([pg, k, d], i) => els.push(card(RX + 760, 290 + i * 92, 440, `${PAGE_NAMES[pg]}\n${d}`, k, { link: LINK.page(pg), size: 15, h: undefined })));

  // ----- below: topology, two planes, headline numbers -----
  const by = 1340;
  els.push(h2(0, by, "Hardware topology [1.5B run, one node, 8× RTX 6000 Ada]"));
  for (let g = 0; g < 8; g++) {
    const t = g === 0;
    els.push(box(g * 150, by + 60, 130, 110, t ? "GPU 0\ntrainer" : `GPU ${g}\nreplica ${g}`, t ? "trainer" : "rollout", { size: 17 }));
  }
  els.push(
    note(0, by + 190, 1200, "No FSDP, ZeRO or vLLM in the loop: fit() requires exactly one trainer GPU. The driver, TransferQueue, load balancer, manager, dataset and rollout workers are CPU actors. Ray C++ does not set CUDA_VISIBLE_DEVICES, so devices are picked explicitly: trainer = local rank, replica i = replica_device_offset (1) + i.", { size: 16, color: C.dim }),
  );

  els.push(h2(1300, by, "Two planes"));
  els.push(card(1300, by + 60, 420, "Control plane — Ray C++ actor RPCs (msgpack)\nOnly KVBatchMeta {partition_id, keys, tags} and small structs move here. Actors find each other by name: rl_bridge_<type>_<id>.", "driver"));
  els.push(card(1740, by + 60, 420, "Data plane — Blu-TransferQueue\nTensors are written once and read by key from any actor with its own TQClient. A prompt and all its trajectories share one storage shard.", "data"));

  els.push(h2(0, by + 330, "Headline results (docs/GRPO_1P5B_REPORT.md)"));
  els.push(
    ...bars(20, by + 420, 360, 220, 0, 12, [
      { v: 6.29, top: "6.29%", label: "base model", color: C.bGray },
      { v: 9.86, top: "9.86%", label: "after 150 steps", color: C.bGreen },
    ]),
  );
  els.push(label(20, by + 680, "GSM8K accuracy, 1.5B Qwen3-shaped model\n(McNemar p < 0.001)", { size: 14 }));
  els.push(
    ...bars(480, by + 420, 360, 220, 0, 80, [
      { v: 73, top: "73 s", label: "before fixes", color: C.bRed },
      { v: 35, top: "35 s", label: "after", color: C.bGreen },
    ]),
  );
  els.push(label(480, by + 680, "Wall time per training step", { size: 14 }));
  els.push(
    ...bars(940, by + 420, 360, 220, 0, 60, [
      { v: 18, top: "18%", label: "GSM8K as is", color: C.bGray },
      { v: 48, top: "44–53%", label: "difficulty-filtered", color: C.bGreen },
    ]),
  );
  els.push(label(940, by + 680, "Groups with a learning signal (not all-same reward)", { size: 14 }));
  els.push(sticky(1400, by + 410, 560, "Status note\nREADME.md still says \"mostly scaffolding\" — that is stale. STATUS.md (2026-10-21) and GRPO_1P5B_REPORT.md describe the working async loop shown here. Where docs and code disagree, this showcase follows the code.", { size: 17, font: FONT.body, angle: -0.01 }));
  return els;
}

// ======================================================================
// 1 · Launch & config
// ======================================================================
function launchPage() {
  const els = header(1, "Launch & config", "Building, starting a Ray cluster, what main() does, and the knobs that matter");
  els.push(h2(0, 200, "Running it"));
  const st = [
    ["Build deps", "make tensor dist (BluTrain root)\nmake -C third_party/ray_cpp_build\nyaml-cpp · libzmq · SymEngine+GMP"],
    ["Build RL", "make train_grpo\n→ lib/train_grpo\n→ ./rollout_bridge_worker.so"],
    ["Start Ray", "~/.ray-node-venv/bin/ray start --head\n(or deploy/bringup.sh head|join)"],
    ["Train (cwd = RL/)", "./lib/train_grpo \\\n  --config=scripts/config/\n  grpo_1p5b_gsm8k.yaml"],
  ];
  const sb = st.map(([t, d], i) => code(i * 380, 260, 340, `${t}\n\n${d}`, { bg: i === 3 ? C.lViolet : C.lGray, stroke: i === 3 ? C.violet : C.gray, size: 14, h: undefined }));
  els.push(...sb);
  for (let i = 0; i < 3; i++) els.push(arrow(sb[i], sb[i + 1]));
  els.push(sticky(1560, 250, 420, "Gotchas\n• Use the new-ABI venv's ray binary — the bare `ray` on PATH silently breaks the actors.\n• Run from RL/: code_search_path = cwd, so Ray finds rollout_bridge_worker.so there (it holds every RAY_REMOTE).\n• If a token exists, the binary re-execs itself with RAY_AUTH_MODE=token.", { size: 15, font: FONT.body, bg: C.bRed }));

  // main() flow
  els.push(h2(0, 520, "main()  —  scripts/train_grpo.cpp"));
  const m = [
    box(0, 590, 230, 80, "RLConfigParser\n::parse(yaml)", "gray"),
    box(270, 590, 230, 80, "RayRuntime::init\n(address, ns, cwd)", "gray"),
    box(540, 590, 260, 80, "register_trainers()\n\"separate_async\" → RLDriver", "driver", { size: 16 }),
    box(840, 590, 260, 80, "register_algorithms()\n\"grpo\" → GRPO advantage", "driver", { size: 16 }),
    box(1140, 590, 230, 80, "TrainerRegistry\n::create → init()", "driver"),
  ];
  els.push(...m);
  for (let i = 0; i < m.length - 1; i++) els.push(arrow(m[i], m[i + 1]));
  const dia = rect(1110, 720, 290, 140, { text: "role_to_pool\nhas actor?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange, sw: 2 });
  dia.type = "diamond";
  const fit = box(1460, 600, 230, 80, "driver->fit()\nthe training loop", "driver");
  const smoke = box(1460, 800, 230, 80, "replay buffer\nsmoke check", "gray");
  const sd = box(1760, 700, 200, 80, "RayShutdownGuard\nray::Shutdown", "gray", { size: 16 });
  els.push(dia, fit, smoke, sd, arrow(m[4], dia), arrow(dia, fit, "driver"), arrow(dia, smoke), arrow(fit, sd), arrow(smoke, sd));
  els.push(label(1400, 690, "yes"), label(1300, 870, "no (rollout-only configs)"));

  // RLDriver::init
  els.push(h2(0, 940, "RLDriver::init() — the order things come up"));
  const init = [
    ["RLResourcePoolManager::create_resource_pool()", "one named placement group per node \"<pool>_node<i>\", bundles {CPU:1, GPU:1}, 60 s wait", "gray"],
    ["check_transfer_queue_capacity → start_transfer_queue", "controller + storage actors; driver gets its TQClient", "data"],
    ["create_load_balancer(full_determinism)", "", "rollout"],
    ["create_gpu_replica × gpus_per_node per rollout node", "engine on device replica_device_offset+i; asserts ray_actor_max_concurrency > num_workers × max_concurrent_per_worker", "rollout"],
    ["create_rollout_worker × num_workers", "unplaced CPU actors", "rollout"],
    ["lb_add_replicas → create_rollout_manager → create_prompt_dataset", "", "rollout"],
    ["ReplayBufferAsync(config, tq_client, submit_prompts)", "refill_fn submits fresh prompts for every evicted group", "replay"],
    ["create_trainer_worker per trainer GPU ({GPU:1})", "+ RoleWorkerGroup; NCCL \"trainer_pool_fsdp\" only if world > 1", "trainer"],
    ["WeightSyncEngine(trainers, replicas, weight_sync)", "the NCCL group itself is built lazily on the first sync", "sync"],
  ];
  init.forEach(([t, d, k], i) => {
    els.push(ellipse(0, 1000 + i * 70, 46, 46, { text: String(i + 1), font: FONT.body, size: 17, bold: true, bg: K[k].b, stroke: K[k].s, sw: 1.5 }));
    els.push(text(64, 1000 + i * 70 + 2, t, { font: FONT.code, size: 16 }));
    if (d) els.push(text(64, 1000 + i * 70 + 26, d, { size: 14, color: C.dim }));
  });
  els.push(files(0, 1640, 900, "RL/src/driver/RLDriver.cpp · RL/scripts/train_grpo.cpp · RL/src/orchestration/*"));

  // invariants
  els.push(h2(1100, 940, "Checks the parser enforces"));
  els.push(code(1100, 1000, 860, "train_batch_size == parameter_sync_step × ppo_mini_batch_size\n     [32]                [1]                 [32]\n\ntotal_storage_size ≥ ceil((num_warmup_batches + 1) · train_batch_size) · (1 + n)\n     [20000]              (1 + 1) · 32 · 9 = 576\n\nweight_sync.backend != \"naive\"      reward-model pool is valid", { size: 15, bg: C.lYellow, stroke: C.orange }));
  els.push(sticky(1100, 1290, 860, "Parsed but never read\ndecoupled_ppo.*, use_kl_in_reward, kl_ctrl, entropy_coeff, val_temperature, reward.num_workers, gpu_health, checkpoint.keep_last / resume_mode, validate_freq_steps, run.seed.\nreference.enable is ignored (the ref model is always built). data.seed: null → 0, not run.seed. weight_sync.rebuild_process_group isn't parsed. backend: nixl parses but only NCCL exists.", { size: 15, font: FONT.body, bg: C.bGray }));

  // config table
  els.push(h2(0, 1740, "The knobs that matter  (RLConfig.h default  →  [1.5B run])"));
  const T = table(0, 1800, [{ w: 200 }, { w: 380, code: true }, { w: 300, code: true }, { w: 1080 }], [
    ["Section", "Key", "Default → [1.5B]", "What it does"],
    ["training", "train_batch_size", "64 → [32]", "Prompts per training step (each yields rollout.n trajectories)."],
    ["training", "parameter_sync_step", "4 → [1]", "step_once() calls per global step; groups per call = train_batch_size / this."],
    ["training", "total_steps · num_warmup_batches", "2000 → [200] · 1.0", "Global steps; prompts submitted at step 0 before the loop starts."],
    ["rollout", "n · temperature · top_p · top_k", "8 · 1.0 · 1 · -1", "Samples per prompt. Keep temperature 1.0: engine log-probs are pre-temperature."],
    ["rollout", "num_workers · max_concurrent_per_worker", "16 → [7] · 256 → [64]", "CPU worker actors and the in-flight sessions each one runs."],
    ["rollout", "max_num_seqs · kv_cache_mib", "16 → [64] · 8192 → [16384]", "PagedEngine batch size and KV cache budget per replica."],
    ["loss", "clip_ratio_low / high / c", "0.2 / 0.2 / 3.0", "PPO trust region and dual-clip floor for negative advantages."],
    ["loss", "use_kl_loss · kl_loss_coef · kl_loss_type", "true · 0.001 · low_var_kl", "k3 KL to the frozen reference, in the loss (only low_var_kl works)."],
    ["loss", "loss_agg_mode", "token-mean", "token-mean | seq-mean-token-mean | seq-mean-token-sum."],
    ["loss", "ppo_mini_batch_size · ppo_micro_batch_size_per_gpu", "16 → [32] · 8 → [2]", "Groups per optimizer step; trajectories per forward/backward."],
    ["algorithm", "norm_adv_by_std_in_grpo", "true", "GRPO (÷ std) vs Dr.GRPO (mean-centred only)."],
    ["optimizer", "max_lr · min_lr · lr_scheduler", "6e-4 → [1e-6 / 2e-6] · cosine", "AdamW, β=(0.9, 0.95 → [0.999]), wd 0.1 → [0], grad_clip 1.0."],
    ["data", "max_prompt_length · max_response_length", "1024 → [320] · 3072 → [512]", "Response cap = rollout max_tokens. prompt_encoding must be pretokenized_ids."],
    ["staleness", "max_off_policy_threshold · strategy", "8 → [2] · drop", "Max (now − birth + 1) a group may reach before it is dropped (or waited for)."],
    ["filter_groups", "enable · metric", "false → [true] · reward", "DAPO: evict groups whose rewards are all identical."],
    ["weight_sync", "bucket_size_mb · sync_every_n_steps", "2048 → [256] · 1", "NCCL broadcast bucket size; how often weights are pushed."],
    ["transfer_queue", "total_storage_size · num_data_storage_units", "100000 → [20000] · 8 → [2]", "Row capacity and number of storage shards."],
    ["checkpoint", "save_freq_steps", "50 → [25]", "Weights only, to <dir>/global_step_<N>/actor.safetensors."],
  ], { size: 14, firstCol: C.lGray });
  els.push(...T.els);
  els.push(files(0, 1800 + T.h + 16, 1200, "RL/include/config/RLConfig.h · RL/src/config/RLConfigParser.cpp · RL/scripts/config/*.yaml"));
  return els;
}

// ======================================================================
// 2 · Prompts & TransferQueue
// ======================================================================
function dataPage() {
  const els = header(2, "Prompts & TransferQueue", "Where prompts come from, and the KV store every actor reads and writes tensors through");
  els.push(h2(0, 200, "From a dataset to a PromptBatch"));
  const d = [
    box(0, 270, 250, 100, "data_preprocess/\ngsm8k_chat.py", "gray", { size: 17 }),
    box(300, 270, 270, 100, "train.jsonl\nprompt · input_ids · answer\ndata_source", "data", { size: 16 }),
    box(620, 270, 300, 100, "PromptDataset\nshuffle: mt19937_64(seed+epoch)\nreshuffle each epoch", "data", { size: 16 }),
    box(970, 270, 300, 100, "next_train_batch(n, step)\nfresh uuid4 per row", "data", { size: 16 }),
  ];
  els.push(...d);
  for (let i = 0; i < 3; i++) els.push(arrow(d[i], d[i + 1], "data"));
  els.push(code(1320, 250, 640, "PromptRow {\n  uid                   // uuid4: has '-' but never '_'\n  prompt_text\n  prompt_token_ids      // int32[P]\n  ground_truth          // e.g. \"72\"\n  data_source           // picks the verifier\n  birth_global_steps    // staleness clock\n}", { size: 15 }));
  els.push(card(0, 410, 1270, "Why pretokenized?  C++ has no tokenizer, so prompt_encoding must be pretokenized_ids for rollout. gsm8k_chat.py applies the chat template + a \\boxed{} instruction and stores input_ids. max_prompt_length, truncation (error|left|right|middle) and filter_overlong_prompts are enforced only in this mode. The dataset lives in a singleton Ray actor, and get_state/restore_state make the cursor resumable.", "data"));

  // TQ architecture
  els.push(h2(0, 600, "TransferQueue — one controller, N storage shards"));
  const cl = [
    box(0, 680, 260, 80, "Driver TQClient", "driver"),
    box(0, 800, 260, 80, "RolloutWorker ×7 TQClients", "rollout", { size: 16 }),
    box(0, 920, 260, 80, "TrainerWorker TQClient", "trainer"),
  ];
  const ctrl = box(520, 680, 420, 130, "TQControllerActor\nTransferQueueController(max_samples = total_storage_size)\nFifoSampler · per-row metadata + tags", "data", { size: 16 });
  const sh = [box(520, 880, 200, 110, "TQStorageActor 0\nSimpleStorageManager", "data", { size: 16 }), box(740, 880, 200, 110, "TQStorageActor 1\n…", "data", { size: 16 })];
  els.push(...cl, ctrl, ...sh);
  for (const c of cl) els.push(connect(c, ctrl, { stroke: K.data.s, sw: 1.5, end: "triangle", dash: "dashed", rough: 0.5 }));
  for (const c of cl) els.push(connect(c, sh[0], { stroke: K.data.s, sw: 2, end: "triangle", rough: 0.5 }));
  els.push(connect(ctrl, sh[0], { stroke: C.gray, sw: 1, start: "triangle", end: "triangle", rough: 0.5 }));
  els.push(connect(ctrl, sh[1], { stroke: C.gray, sw: 1, start: "triangle", end: "triangle", rough: 0.5 }));
  els.push(label(290, 700, "metadata (ZMQ)"), label(290, 960, "tensor bytes (ZMQ)"));
  els.push(card(990, 680, 470, "Put path — data lands before metadata\n1. controller KV_RETRIEVE(create) → allocate the row\n2. shard PUT_DATA → the tensors\n3. controller KV_UPDATE → fields + tags become visible\nPuts merge into an existing row (new fields and tags are added).", "data"));
  els.push(card(990, 880, 470, "Sharding — GroupRouter\nKey prefix before the first '_' = the prompt uid. So {uid} and every {uid}_{s}_0 trajectory land on the same shard. Servers bind tcp://0.0.0.0:0 and announce themselves to the controller.", "data"));
  els.push(code(1510, 680, 450, "kv_put / async_kv_put\nkv_batch_put(keys, partition,\n             fields{name→tensors}, tags)\nkv_batch_get(keys, partition,\n             select_fields)\nkv_list(partition, filter)\nkv_clear(keys, partition)\nsave_checkpoint / load_checkpoint\n\n// strings go through tq::bytes_tensor\n// (a 1-D UInt8 tensor)", { size: 14 }));

  // row lifecycle visual
  els.push(h2(0, 1090, "A trajectory row fills in as it moves through the pipeline"));
  els.push(small(0, 1140, "Partition \"train\". Each cell is a field; colour = who writes it. Shapes: P = prompt length, R = response length."));
  const fields = [
    ["prompts", "Int64[P]", "rollout"], ["responses", "Int64[R]", "rollout"], ["response_mask", "Int64[R] (all 1)", "rollout"], ["input_ids", "Int64[P+R]", "rollout"],
    ["rollout_log_probs", "F32[R]", "rollout"], ["rm_scores", "F32[R]  score on last token", "reward"], ["extra_fields", "bytes {acc}", "reward"],
    ["old_log_probs", "F32[R]", "trainer"], ["ref_log_prob", "F32[R]", "trainer"], ["advantages", "F32[R]", "driver"],
  ];
  let fx = 0;
  const cells = fields.map(([n, t, k]) => {
    const r = rect(fx, 1190, 186, 96, { text: `${n}\n${t}`, font: FONT.code, size: 13, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4, color: C.ink });
    fx += 192;
    return r;
  });
  els.push(...cells);
  const stage = [
    [0, 4, "RolloutWorker · agent_loop_postprocess", "rollout"],
    [5, 6, "Verifier (same worker)", "reward"],
    [7, 8, "TrainerWorker · compute_*_log_prob", "trainer"],
    [9, 9, "RLDriver · compute_advantage", "driver"],
  ];
  for (const [a, b, t, k] of stage) {
    const x1 = cells[a].x;
    const x2 = cells[b].x + cells[b].width;
    els.push(poly([{ x: x1, y: 1300 }, { x: x1, y: 1310 }, { x: x2, y: 1310 }, { x: x2, y: 1300 }], { stroke: K[k].s, sw: 2 }));
    els.push(text((x1 + x2) / 2, 1320, t, { size: 14, align: "center", color: K[k].s, bold: true }));
  }
  els.push(card(0, 1370, 900, "Tags on the trajectory row\nstatus=success · prompt_len · response_len · seq_len · global_steps · min_global_steps · max_global_steps (all = the prompt's birth step). The driver kv_clear()s the row once the step that used it finishes.", "gray"));

  // prompt row status machine
  els.push(h2(1000, 1390, "The prompt row's status tag"));
  const s1 = box(1000, 1500, 170, 70, "pending", "gray", { font: FONT.code, size: 17 });
  const s2 = box(1230, 1500, 170, 70, "running", "rollout", { font: FONT.code, size: 17 });
  const s3 = box(1530, 1460, 170, 64, "finished", "trainer", { font: FONT.code, size: 17 });
  const s4 = box(1530, 1550, 170, 64, "failure", "sync", { font: FONT.code, size: 17 });
  const s5 = box(1790, 1500, 230, 70, "kv_clear by sample()\nor evict()", "replay", { size: 16 });
  els.push(s1, s2, s3, s4, s5, arrow(s1, s2), arrow(s2, s3), arrow(s2, s4), arrow(s3, s5), arrow(s4, s5));
  els.push(label(1000, 1585, "written by\nsubmit_prompts", { size: 13 }), label(1210, 1585, "RolloutWorker::run_prompt", { size: 13 }), label(1710, 1620, "the last of the n sessions\nwrites the final status", { size: 13 }));

  // contract table
  els.push(h2(0, 1700, "Row contract"));
  const T = table(0, 1760, [{ w: 300, code: true }, { w: 300 }, { w: 820, code: true }, { w: 540, code: true }], [
    ["Key", "Written by", "Fields", "Tags"],
    ["{uid}", "RLDriver::submit_prompts", "prompt_token_ids Int32[P], prompt_text, ground_truth, data_source (bytes)", "is_prompt=true, status=pending, global_steps"],
    ["{uid}", "RolloutWorker", "—", "status=running → finished | failure"],
    ["{uid}_{session}_0", "RolloutWorker", "prompts, responses, response_mask, input_ids, rollout_log_probs, rm_scores, extra_fields", "status=success, *_len, *global_steps"],
    ["{uid}_{session}_0", "TrainerWorker", "old_log_probs F32[R], ref_log_prob F32[R]", "—"],
    ["{uid}_{session}_0", "RLDriver::compute_advantage", "advantages F32[R]", "—"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(files(0, 1760 + T.h + 16, 1500, "RL/src/data/PromptDataset.cpp · RL/src/transfer_queue_client/{TQClient,TransferQueueActor}.cpp · RL/Blu-TransferQueue/ (submodule)"));
  els.push(sticky(1500, 1760 + T.h + 40, 460, "Known gaps\n• Storage shards have no byte cap — only the sample count is enforced.\n• KV_CLEAR used to free ids before the shard erase; fixed with Controller::release_cleared(). The whole-partition clear path is still unfixed.", { size: 15, font: FONT.body, bg: C.bRed }));
  return els;
}

// ======================================================================
// 3 · Rollout
// ======================================================================
function rolloutPage() {
  const els = header(3, "Rollout", "How 32 prompts become 256 scored trajectories on GPUs 1–7, while training runs on GPU 0");
  els.push(h2(0, 200, "Fan-out: driver → manager → workers → sessions → replicas"));
  const drv = box(0, 300, 220, 90, "RLDriver\nsubmit_prompts(32)", "driver");
  const mgr = box(290, 300, 260, 90, "RolloutManager\nPromptBatch::chunk(7)", "rollout");
  els.push(drv, mgr, arrow(drv, mgr, "driver", { dash: "dashed" }));
  els.push(label(214, 270, "fire-and-forget"));
  const chunks = [5, 5, 5, 5, 4, 4, 4];
  const wks = chunks.map((c, i) => box(640, 250 + i * 64, 230, 52, `worker ${i} · ${c} prompts`, "rollout", { size: 15, font: FONT.body, rough: 0.5 }));
  els.push(...wks);
  for (const w of wks) els.push(arrow(mgr, w, "rollout", { sw: 1.2 }));
  els.push(small(640, 710, "contiguous, uneven chunks — never padded"));
  // sessions of worker 0
  const prm = box(960, 250, 230, 90, "run_prompt(row)\nstatus = running", "rollout", { size: 16 });
  els.push(prm, arrow(wks[0], prm, "rollout"));
  const sess = [];
  for (let s = 0; s < 8; s++) sess.push(rect(1260 + (s % 4) * 82, 230 + Math.floor(s / 4) * 70, 70, 54, { text: `s${s}`, font: FONT.code, size: 15, bg: "#ffffff", stroke: K.rollout.s, sw: 1.5, rough: 0.4 }));
  els.push(...sess, arrow(prm, sess[0], "rollout", { sw: 1.2 }), arrow(prm, sess[4], "rollout", { sw: 1.2 }));
  els.push(small(1260, 380, "rollout.n = 8 sessions on the worker's ThreadPool"));
  const pc = box(1260, 440, 320, 80, "PartialRolloutClient::generate\nrequest_id = uid_session", "rollout", { size: 16 });
  const lb = box(1660, 300, 300, 90, "LoadBalancer\nacquire_server(request_id)", "rollout", { size: 16 });
  const rp = box(1660, 440, 300, 90, "ReplicaActor::Generate\n→ PagedEngine::generate", "rollout", { size: 16 });
  const pp = box(1260, 590, 320, 90, "agent_loop_postprocess\ndetokenize · verify · kv_put", "reward", { size: 16 });
  const tq = box(1660, 590, 300, 90, "TransferQueue\n{uid}_{s}_0", "data");
  els.push(pc, lb, rp, pp, tq, arrow(sess[5], pc, "rollout"), arrow(pc, lb, "rollout"), arrow(lb, rp, "rollout"), arrow(rp, pc, "rollout", { dash: "dashed" }), arrow(pc, pp, "reward"), arrow(pp, tq, "data"));
  els.push(label(1590, 530, "GenerateResult{token_ids,\nlog_probs, stop_reason}", { size: 13 }), label(1830, 395, "release_server\nafter (no retries)", { size: 13 }));

  // settle countdown
  els.push(h2(0, 800, "Settling a prompt — PromptSettleState"));
  els.push(small(0, 850, "An atomic countdown over the n sessions; the last one to finish writes the prompt row's final status."));
  for (let s = 0; s < 8; s++) {
    const fail = false;
    els.push(rect(s * 86, 900, 74, 60, { text: `s${s}\n✓`, font: FONT.code, size: 14, bg: fail ? C.bRed : C.bGreen, stroke: C.dim, sw: 1, rough: 0.4 }));
    els.push(text(s * 86 + 37, 970, `${7 - s}`, { size: 16, font: FONT.code, align: "center", color: C.dim }));
  }
  els.push(label(0, 1000, "remaining after each session settles  →  0 means \"I'm last\""));
  els.push(box(710, 900, 260, 70, "status = finished\n(failure if any threw)", "trainer", { size: 16 }));
  els.push(card(0, 1050, 970, "A session fails on an empty completion, a missing verifier or a generation error. One failed session marks the whole group failure — the replay buffer evicts it and submits a replacement prompt (page 5).", "sync", { link: LINK.page(5) }));

  // LB policy
  els.push(h2(1060, 800, "Load balancer: which replica gets a request?"));
  const q1 = rect(1060, 870, 260, 120, { text: "request_id in\nsticky LRU?", font: FONT.hand, size: 17, bg: C.bYellow, stroke: C.orange });
  q1.type = "diamond";
  const a1 = box(1400, 880, 260, 90, "same replica again\n(cap 10 000 ids)", "rollout", { size: 16 });
  const q2 = rect(1060, 1050, 260, 120, { text: "full_\ndeterminism?", font: FONT.hand, size: 17, bg: C.bYellow, stroke: C.orange });
  q2.type = "diamond";
  const a2 = box(1400, 1000, 260, 70, "hash(request_id) % n", "rollout", { font: FONT.code, size: 15 });
  const a3 = box(1400, 1110, 260, 90, "least in-flight replica\nrandom among ties", "rollout", { size: 16 });
  els.push(q1, a1, q2, a2, a3, arrow(q1, a1), arrow(q1, q2), arrow(q2, a2), arrow(q2, a3));
  els.push(label(1330, 890, "yes"), label(1200, 1005, "no"), label(1330, 1010, "yes"), label(1330, 1150, "no"));
  els.push(card(1700, 870, 260, "Concurrency check at init\nray_actor_max_concurrency must exceed num_workers × max_concurrent_per_worker:\n[512 > 7 × 64 = 448] ✓", "gray", { size: 15 }));

  // engines
  els.push(h2(0, 1260, "The engine inside each replica"));
  const T = table(0, 1320, [{ w: 240 }, { w: 560 }, { w: 560 }], [
    ["", "PagedEngine  (production_gqa — used)", "NaiveEngine  (classic_gpt2)"],
    ["Model", "blu::BLU + paged::PagedDecodeBackend", "ClassicGpt2 / ProductionGptModel"],
    ["KV cache", "blocks of 16 tokens; num_blocks = kv_cache_mib·2²⁰ / bytes_per_block", "none — a full forward over [B, L] each token"],
    ["Batching", "AsyncEngine: max_active = max_num_seqs [64], max_prefill_tokens 8192", "continuous batching up to max_num_seqs; L padded to seq_multiple"],
    ["Sampling", "returns raw log-softmax log-probs (temperature-1 distribution)", "CPU infstub::sample_token, mt19937 seeded from hash(request_id)"],
    ["Pause for weight sync", "pause(Keep, clear_cache=true): in-flight requests drop KV and re-prefill on resume", "—"],
  ], { size: 14, firstCol: C.lGray });
  els.push(...T.els);
  els.push(card(0, 1320 + T.h + 20, 1360, "StubRolloutEngine serves CPU-only pools in the pipeline smoke tests. SamplingParams per session: temperature 1.0, top_p 1, top_k −1, max_tokens = data.max_response_length [512].", "gray"));

  // paged KV visual
  els.push(h2(1460, 1260, "Paged KV cache, at a glance"));
  const seqs = [[3, C.bBlue], [5, C.bGreen], [2, C.bOrange], [4, C.bGrape]];
  let bi = 0;
  const order = [];
  seqs.forEach(([n, col], si) => { for (let j = 0; j < n; j++) order.push({ si, col }); });
  // interleave as the allocator would hand blocks out
  order.sort((a, b) => (a.si * 7 + 3) % 5 - (b.si * 7 + 3) % 5 || 0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++) {
      const o = order[bi++];
      els.push(rect(1460 + c * 76, 1330 + r * 56, 68, 46, { text: o ? `seq ${o.si}` : "free", font: FONT.code, size: 12, bg: o ? o.col : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false, color: o ? C.ink : C.gray }));
    }
  els.push(note(1460, 1560, 460, "Each block holds 16 tokens of K/V. A sequence owns a list of blocks anywhere in the pool, so memory is not reserved for max_response_length up front.", { size: 15, color: C.dim }));
  els.push(files(0, 1320 + T.h + 130, 1600, "RL/src/rollout_client/{RolloutManager,RolloutWorker,PartialRolloutClient,RolloutLoadBalancer,RolloutReplica}.cpp · BluTrain/inference/"));
  return els;
}

// ======================================================================
// 4 · Rewards
// ======================================================================
function rewardPage() {
  const els = header(4, "Rewards & verifiers", "Rule-based scoring runs inside the rollout worker, right after generation (verl's colocated path)");
  els.push(h2(0, 200, "agent_loop_postprocess, step by step"));
  const f = [
    box(0, 270, 220, 100, "response tokens\n(GenerateResult)", "rollout", { size: 17 }),
    box(270, 270, 230, 100, "drop ids ≥ vocab\nGpt2Detokenizer", "reward", { size: 17 }),
    box(550, 270, 240, 100, "verifiers_[data_source]\n(unknown → throw)", "reward", { size: 17 }),
    box(840, 270, 250, 100, "score(response_text,\nground_truth)", "reward", { size: 17 }),
    box(1140, 270, 250, 100, "kv_put trajectory\n+ optional rollouts_<pid>.jsonl", "data", { size: 16 }),
  ];
  els.push(...f);
  for (let i = 0; i < 4; i++) els.push(arrow(f[i], f[i + 1], "reward"));
  // rm_scores visual
  els.push(text(0, 420, "rm_scores: the outcome score sits on the last response token", { size: 18, bold: true }));
  for (let t = 0; t < 12; t++) {
    const last = t === 11;
    els.push(rect(t * 62, 460, 56, 50, { text: last ? "1.0" : "0", font: FONT.code, size: 15, bg: last ? C.bGreen : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false }));
  }
  els.push(label(0, 520, "t = 0 … R−1   (no format reward, no per-token shaping)"));
  els.push(card(780, 440, 610, "extra_fields = {\"reward_extra_info\": {\"acc\": score}} — used by the DAPO filter when filter_groups.metric isn't \"reward\". Sequence score later = Σ rm_scores = the single outcome score.", "gray"));

  els.push(h2(0, 620, "The verifiers"));
  const T = table(0, 680, [{ w: 190, code: true }, { w: 280, code: true }, { w: 800 }, { w: 200 }], [
    ["type", "Class", "What it checks", "Score"],
    ["gsm8k", "Gsm8kVerifier(strict)", "Last 300 chars; regex (?:#### |\\boxed\\{)(-?[0-9.,]+), last match; strip , $ space tab; string-equal to the cleaned answer.", "1 / 0  (acc, pred)"],
    ["gsm8k_flexible", "Gsm8kVerifier(flexible)", "Last number in the last 300 chars that isn't \"\" or \".\".", "1 / 0"],
    ["exact_match", "ExactMatchVerifier", "Whitespace-collapsed, lowercased full-string equality.", "1 / 0"],
    ["math", "MathEquivalenceVerifier", "SymEngine + GMP, ~1500 lines: extract → normalize → split → parse LaTeX → compare (see right).", "1 / 0  (method)"],
    ["ifeval", "IfEvalVerifier()", "Text after the last </think>; all 54 IFEvalG constraints (nltk / langdetect ports). Unknown constraint = failed.", "fraction passed"],
    ["ifeval_all", "IfEvalVerifier(true)", "Same checks.", "1 only if all pass"],
    ["short_response", "ShortResponseVerifier", "Pipeline sanity check: response < 800 chars.", "1 / 0"],
    ["—", "CodeExec · SandboxFusion", "Stubs that throw (grpo_rlvr.yaml's code_exec isn't accepted).", "—"],
  ], { size: 14 });
  els.push(...T.els);

  // gsm8k worked examples
  const ey = 680 + T.h + 60;
  els.push(h2(0, ey, "Strict gsm8k scoring, by example  (ground truth = 72)"));
  const ex = [
    ["…so she has \\boxed{72} cookies.", "72", "1", true],
    ["…the total is 72.\n#### 72", "72", "1", true],
    ["#### 1,200 … wait, \\boxed{72}", "72 (last match wins)", "1", true],
    ["\\boxed{\\$72}", "no match", "0", false],
    ["\\boxed{72.00}", "72.00 ≠ 72", "0", false],
    ["The answer is 72.", "no #### or \\boxed", "0", false],
  ];
  const T2 = table(0, ey + 60, [{ w: 520, code: true }, { w: 300, code: true }, { w: 110 }], [["response tail", "extracted", "score"], ...ex.map((e) => [e[0], e[1], e[2]])], {
    size: 15,
    cellBg: (ri, ci) => (ci === 2 ? (ex[ri - 1][3] ? C.bGreen : C.bRed) : "#ffffff"),
  });
  els.push(...T2.els);
  els.push(sticky(980, ey + 60, 420, "Known miss\nThe strict verifier rejects \\boxed{\\$720}, 72.00 and \\boxed{ 72 }, and only scans the last 300 chars. The report puts the cost at about 0.4 accuracy points.", { size: 15, font: FONT.body, bg: C.bRed }));

  // math verifier pipeline
  els.push(h2(1540, 620, "math: comparing answers"));
  const mv = [
    ["extract", "last \\boxed{}, \"final answer is\", \"Answer:\", last $..$, last number (tail 4000 chars)"],
    ["normalize", "Hendrycks / Minerva rules: units, \\text, \\frac, spaces, dfrac…"],
    ["split", "sets, tuples, intervals, \"x = …\""],
    ["parse", "own recursive-descent LaTeX → SymEngine"],
    ["compare", "string · multiple choice · expand(a−b)==0 · numeric rtol 1e-4 · random-point probing"],
  ];
  let my = 680;
  const mb = mv.map(([t, d]) => {
    const r = card(1540, my, 420, `${t}\n${d}`, "reward", { size: 15 });
    my += 112;
    return r;
  });
  els.push(...mb);
  for (let i = 0; i < mb.length - 1; i++) els.push(arrow(mb[i], mb[i + 1], "reward", { sw: 1.5 }));
  els.push(note(1540, my, 420, "method ∈ string · choice · sym · mismatch · unparsed · no_answer. Anything that fails to parse falls back to string comparison. Parity with HF math-verify: scripts/math_verifier_parity.py.", { size: 14, color: C.dim }));
  els.push(files(0, ey + 60 + T2.h + 20, 1400, "RL/src/reward/verifiers/* · RL/src/rollout_client/RolloutWorker.cpp (type → class map) · RewardLoopManager/Worker are stubs"));
  return els;
}

// ======================================================================
// 5 · Replay buffer
// ======================================================================
function replayPage() {
  const els = header(5, "Replay buffer", "ReplayBufferAsync (a verl port) decides which finished groups train next — and which get thrown away");
  els.push(h2(0, 200, "sample(global_steps, \"train\", groups) — the wait loop"));
  const s = [
    box(0, 290, 250, 90, "sync_metadata()\none kv_list", "replay"),
    box(330, 290, 250, 90, "eviction_reasons()", "replay"),
    box(660, 290, 250, 90, "evict()\nclear_groups(prompt + traj)", "sync", { size: 16 }),
    box(990, 290, 270, 90, "refill_fn(k)\n= submit_prompts(k)", "driver"),
  ];
  const q = rect(330, 450, 250, 130, { text: "has_enough?", font: FONT.hand, size: 19, bg: C.bYellow, stroke: C.orange });
  q.type = "diamond";
  const sl = box(0, 470, 250, 90, "sleep poll_interval\n(2000 ms)", "gray");
  const so = box(660, 470, 250, 90, "select_oldest\nstable sort by birth step", "replay", { size: 16 });
  const mat = box(990, 470, 270, 90, "materialize\nkv_clear prompt rows", "replay", { size: 16 });
  const out = box(1340, 470, 260, 90, "KVBatchMeta\ntrajectory keys + tags", "driver");
  els.push(...s, q, sl, so, mat, out);
  els.push(arrow(s[0], s[1], "replay"), arrow(s[1], s[2], "replay"), arrow(s[2], s[3], "replay"), connect(s[3], q, { stroke: K.replay.s, sw: 2, end: "triangle", rough: 0.5 }), arrow(q, sl), arrow(sl, s[0]), arrow(q, so, "replay"), arrow(so, mat, "replay"), arrow(mat, out, "driver"));
  els.push(label(270, 530, "no"), label(600, 490, "yes"));
  els.push(code(1340, 260, 620, "PartitionState {\n  pending, running, finished, failure   // prompt uids\n  prompt_global_steps                    // uid → birth\n  trajectories                           // uid → keys\n}", { size: 14 }));
  els.push(card(1340, 620, 620, "Only metadata moves here. sample() returns keys; the tensors stay in TransferQueue until the trainer reads them. Metric: timing/sample_wait_s.", "gray"));

  // eviction reasons
  els.push(h2(0, 720, "Four reasons a group is evicted"));
  const ev = [
    ["stale", "Finished but too old (drop strategy only): now − birth + 1 > max_off_policy_threshold [2].", "sync"],
    ["dapo", "filter_groups on: every trajectory has the same metric (all 0 or all 1) → zero advantage, no gradient.", "replay"],
    ["failed", "Any session threw → the group's status is failure.", "sync"],
    ["unsettled", "Status says finished but trajectory rows aren't visible yet (a race the report fixed).", "gray"],
  ];
  ev.forEach(([t, d, k], i) => els.push(card(i * 490, 780, 470, `${t}\n${d}`, k)));
  els.push(small(0, 930, "Every evicted group is replaced one-for-one by a fresh prompt (verl refills in whole gen_batch_size chunks). Metrics: training/off_policy/evicted_samples*, training/filter_groups/evicted_samples, training/rollout_failure/evicted_samples."));

  // staleness timeline
  els.push(h2(0, 1010, "Staleness, drawn  (threshold = 2, now = step 5)"));
  const X = (st) => 120 + (st - 1) * 170;
  for (let st = 1; st <= 6; st++) {
    els.push(text(X(st) + 85, 1070, `step ${st}`, { size: 15, align: "center", color: st === 5 ? C.ink : C.gray, bold: st === 5 }));
    els.push(poly([{ x: X(st), y: 1095 }, { x: X(st), y: 1420 }], { stroke: C.bGray, sw: 1 }));
  }
  els.push(poly([{ x: X(5) + 85, y: 1095 }, { x: X(5) + 85, y: 1420 }], { stroke: C.red, sw: 2, dash: "dashed" }));
  els.push(text(X(5) + 92, 1425, "now", { size: 14, color: C.red }));
  const groups = [
    [3, "born step 3 · span 3 > 2 → stale, dropped", C.bRed],
    [4, "born step 4 · span 2 → OK", C.bGreen],
    [5, "born step 5 · span 1 → OK", C.bGreen],
  ];
  groups.forEach(([b, t, col], i) => {
    els.push(rect(X(b) + 10, 1120 + i * 95, X(5) + 85 - X(b) - 10, 60, { bg: col, stroke: C.dim, sw: 1, rough: 0.4 }));
    els.push(text(X(5) + 110, 1135 + i * 95, t, { size: 16 }));
  });
  els.push(card(1300, 1060, 660, "is_stale(birth, now, thr):  (now − birth + 1) > thr\n\ndrop — finished stale groups are evicted and refilled.\nwait — has_enough() stays false while any pending/running group has now − birth + 1 ≥ thr, so rollouts can't run too far ahead.\nmax_off_policy_threshold: null turns staleness control off.", "replay"));
  els.push(card(1300, 1300, 660, "Staleness is measured, not corrected: logprob_gap_by_staleness compares old_log_probs with rollout_log_probs in buckets span0 / span1 / span2plus. There is no importance weight for the rollout-vs-trainer policy gap.", "sync"));

  // DAPO visual
  els.push(h2(0, 1520, "DAPO group filter  (n = 8)"));
  const G = [
    ["prompt A", [0, 0, 0, 0, 0, 0, 0, 0], "all 0 → A = 0 everywhere → evict"],
    ["prompt B", [1, 1, 1, 1, 1, 1, 1, 1], "all 1 → A = 0 everywhere → evict"],
    ["prompt C", [1, 0, 0, 1, 0, 0, 0, 0], "mixed → real signal → keep"],
  ];
  G.forEach(([n, r, t], gi) => {
    const y = 1590 + gi * 80;
    els.push(text(0, y + 14, n, { size: 17, bold: true }));
    r.forEach((v, j) => els.push(rect(120 + j * 58, y, 50, 50, { text: String(v), font: FONT.code, size: 17, bg: v ? C.bGreen : C.bRed, stroke: C.gray, sw: 1, rough: 0, round: false })));
    els.push(text(600, y + 14, t, { size: 16, color: gi < 2 ? C.red : C.green, bold: true }));
  });
  els.push(card(1000, 1590, 960, "Why it matters on GSM8K: only ~18% of groups carried signal on the raw set. data_preprocess/filter_from_rollouts.py drops prompts the model always or never solves, lifting that to 44–53%. dapo_filtered caches its verdict per uid; metric \"reward\" sums rm_scores, any other metric reads extra_fields.reward_extra_info[metric].", "replay"));
  els.push(files(0, 1850, 1200, "RL/src/replay_buffer/{ReplayBufferAsync,StalenessPolicy}.cpp"));
  return els;
}

// ======================================================================
// 6 · Advantage & loss
// ======================================================================
function lossPage() {
  const els = header(6, "Advantage & loss", "GRPO advantages on the driver, then one fused CUDA kernel for the clipped policy-gradient + KL loss");
  els.push(h2(0, 200, "1 · Group-relative advantage  (src/algorithm/GRPO.cpp)"));
  els.push(code(0, 260, 880, "s_i   = Σ_t rm_scores[i,t]                  // the outcome score\ngroup = key prefix before '_'           // same prompt uid\nμ_g  = mean(s over group)\nσ_g  = std(s over group, ddof = 1)       // Bessel\n\nGRPO    (norm_adv_by_std_in_grpo = true):  A_i = (s_i − μ_g) / (σ_g + 1e-6)\nDr.GRPO (norm_adv_by_std_in_grpo = false): A_i =  s_i − μ_g\n\ngroup of size 1 → μ = 0, σ = 1   (verl's special case)\nA_i is broadcast to every response token; computed on CPU", { size: 15 }));
  // worked example
  els.push(text(960, 250, "Worked example: 8 samples, 2 correct", { size: 18, bold: true }));
  els.push(small(960, 280, "μ = 0.25 · σ (ddof 1) = √(1.5/7) ≈ 0.463"));
  const r = [1, 0, 0, 1, 0, 0, 0, 0];
  const A = r.map((v) => +((v - 0.25) / 0.46291).toFixed(2));
  els.push(
    ...bars(980, 340, 640, 260, -1, 2, r.map((v, i) => ({ v: A[i], top: (A[i] > 0 ? "+" : "") + A[i].toFixed(2), label: `o${i + 1}: r=${v}`, color: v ? C.bGreen : C.bRed })), { labelY: 600 }),
  );
  els.push(label(1660, 360, "GRPO advantage", { size: 15, bold: true }));
  els.push(note(1660, 390, 300, "Correct answers get +1.62, wrong ones −0.54.\nDr.GRPO gives +0.75 / −0.25 (no ÷ σ), so easy and hard prompts aren't rescaled.", { size: 15, color: C.dim }));

  // loss formula
  els.push(h2(0, 700, "2 · Per-token loss  (GRPOLossKernels.cu — one CUDA block per valid token row)"));
  els.push(code(0, 760, 1100, "log πθ    = logit[target] − logsumexp(logits)          // block reduction over the vocab\nratio r   = exp(clamp(log πθ − log π_old, −20, 20))     // 1 if no π_old\nunclipped = r · A\nclipped   = clip(r, 1 − clip_ratio_low, 1 + clip_ratio_high) · A\nobjective = min(unclipped, clipped)\nif clip_ratio_c > 0 and A < 0:  objective = max(objective, clip_ratio_c · A)   // dual clip\n\nx  = clamp(log π_ref − log πθ, −20, 20)\nkl = eˣ − x − 1  ≥ 0                                     // k3 / low_var_kl\n\nloss_i = −objective + kl_loss_coef · kl                   // coef 0.001; 0 if use_kl_loss = false", { size: 15 }));
  els.push(card(1160, 760, 800, "Gradient routing\nThe PG gradient flows only when the unclipped branch is the active min and isn't overridden by the dual-clip floor. clipfrac counts the rows where it isn't. The KL gradient dkl/dlog πθ = 1 − eˣ is zeroed once x saturates at ±20.", "trainer"));
  els.push(card(1160, 950, 800, "Not implemented: kl_loss_type other than low_var_kl throws · calculate_entropy=true throws · entropy_coeff is parsed but never read · use_kl_in_reward is unused.", "sync"));

  // plots
  els.push(h2(0, 1110, "3 · What clip and KL look like"));
  const eps = 0.2;
  els.push(
    ...plot(60, 1220, 460, 300, { x0: 0, x1: 2, y0: 0, y1: 2 }, [
      { f: (x) => x, stroke: C.gray, sw: 2, dash: "dashed" },
      { f: (x) => Math.min(x, Math.min(Math.max(x, 1 - eps), 1 + eps)), stroke: C.green },
    ], { title: "A > 0: objective / A vs ratio r", xlabel: "r", guides: [{ x: 0.8, label: "1−ε" }, { x: 1.2, label: "1+ε" }] }),
  );
  els.push(
    ...plot(660, 1220, 460, 300, { x0: 0, x1: 5, y0: -5, y1: 0 }, [
      { f: (x) => -x, stroke: C.gray, sw: 2, dash: "dashed" },
      { f: (x) => Math.max(Math.min(-x, -Math.min(Math.max(x, 1 - eps), 1 + eps)), -3), stroke: C.red },
    ], { title: "A = −1: objective vs r (dual clip c = 3)", xlabel: "r", guides: [{ x: 0.8, label: "0.8" }, { x: 1.2, label: "1.2" }, { x: 3, label: "c = 3" }] }),
  );
  els.push(
    ...plot(1260, 1220, 460, 300, { x0: -2, x1: 2, y0: 0, y1: 4.5 }, [{ f: (x) => Math.exp(x) - x - 1, stroke: C.violet }], {
      title: "k3 KL:  eˣ − x − 1,  x = log π_ref − log πθ",
      xlabel: "x",
    }),
  );
  els.push(note(0, 1580, 1960, "Dashed grey = no clipping. Left: for good tokens the gain is capped once r > 1.2. Middle: for bad tokens the loss is capped once r < 0.8, and the dual-clip floor stops it growing past c·A when r explodes. Right: k3 is always ≥ 0, ≈ x²/2 near 0, and an unbiased low-variance KL estimate.", { size: 15, color: C.dim }));

  // aggregation
  els.push(h2(0, 1690, "4 · Turning per-token losses into one number (loss_agg_mode)"));
  const T = table(0, 1750, [{ w: 300, code: true }, { w: 520, code: true }, { w: 640 }], [
    ["mode", "weight w_i for each valid token", "effect"],
    ["token-mean  [used]", "1 / total_valid_tokens", "Every token counts the same; long answers weigh more."],
    ["seq-mean-token-mean", "1 / (valid_tokens(seq) · num_nonempty_seqs)", "Every sequence counts the same (original GRPO)."],
    ["seq-mean-token-sum", "1 / num_nonempty_seqs", "Sum over tokens, mean over sequences (no length norm)."],
  ], { size: 15 });
  els.push(...T.els);
  els.push(note(1490, 1750, 470, "loss = Σ loss_i · w_i with a deterministic per-row-slot reduction (no atomics), so runs are bit-reproducible. Reported kl and clipfrac are always a plain token mean.", { size: 15, color: C.dim }));

  els.push(sticky(0, 1750 + T.h + 50, 1100, "Important consequence\nπ_old is recomputed by the trainer, with its current weights, right before each optimizer step — and with ppo_epochs = 1 there is one step per batch. So r ≈ 1 at update time, the clip is effectively inactive (actor/pg_clipfrac ≈ 0 in the logs), and the update is a vanilla policy gradient + k3 KL. The rollout-vs-trainer gap from async staleness is not importance-corrected: rollout_log_probs is only used for diagnostics.", { size: 16, font: FONT.body, bg: C.bYellow }));
  els.push(files(1160, 1750 + T.h + 50, 800, "RL/src/algorithm/{GRPO,PolicyLoss}.cpp · Tensor-Implementations/src/Kernels/cuda/loss/GRPOLossKernels.cu · RL/src/driver/RLDriver.cpp (compute_advantage)"));
  return els;
}

// ======================================================================
// 7 · Trainer
// ======================================================================
function trainerPage() {
  const els = header(7, "Trainer", "TrainerWorker on GPU 0: two models, three RPCs, and the update loop");
  els.push(h2(0, 200, "Models"));
  const am = box(0, 270, 260, 90, "ActorModel\n(trained)", "trainer");
  const rm = box(0, 400, 260, 90, "ReferenceModel\n(frozen, same ckpt)", "gray");
  const bb = box(340, 330, 280, 100, "IPolicyBackbone\nmake_policy_backbone()", "trainer", { size: 17 });
  const c1 = box(700, 270, 300, 90, "ClassicGpt2Backbone\n(GPT-2 configs)", "gray", { size: 17 });
  const c2 = box(700, 400, 300, 90, "ProductionGptBackbone\n(Llama-style: 135M + 1.5B)", "trainer", { size: 17 });
  els.push(am, rm, bb, c1, c2, arrow(am, bb, "trainer"), arrow(rm, bb), arrow(bb, c1), arrow(bb, c2, "trainer"));
  els.push(card(0, 530, 1000, "ProductionGPT = RMSNorm · QK-norm + RoPE (sequential path — the fused kernel ignores strides) · GQA · SwiGLU · tied lm_head (cast before transposing). Sequence length must be a multiple of 64. Allocator SizeClass::set_mode(\"exact\"). Checkpoints load from BluTrain CKPT, .safetensors (param_NNNNNN) or DCPM dirs; convert_hf_qwen3.py converts HF Qwen3.", "trainer"));
  const MT = table(1080, 260, [{ w: 300 }, { w: 200, code: true }, { w: 200, code: true }], [
    ["shape", "1.5B run", "135M run"],
    ["d_model · layers", "2304 · 26", "512 · 37"],
    ["q heads · kv heads", "18 · 6", "4 · 2"],
    ["head_dim · FFN", "128 · 6144", "128 · 1408"],
    ["context · vocab", "4096 · 50304", "4096 · 50304"],
    ["rope_theta", "500000", "50000"],
  ], { size: 15 });
  els.push(...MT.els);
  els.push(small(1080, 260 + MT.h + 10, "From the model section of the run YAMLs (production_gqa)."));

  // padded batch visual
  els.push(h2(0, 720, "build_batch — the causal-shift frame  (example: P = 4, R = 3)"));
  const toks = ["p0", "p1", "p2", "p3", "r0", "r1", "r2", "pad"];
  const rows = [
    ["input", toks, (i) => (i < 4 ? C.lBlue : i < 7 ? C.bGreen : C.lGray)],
    ["target", ["p1", "p2", "p3", "r0", "r1", "r2", "pad", "pad"], (i) => (i < 3 ? C.lBlue : i < 6 ? C.bGreen : C.lGray)],
    ["mask", ["0", "0", "0", "1", "1", "1", "0", "0"], (i) => (i >= 3 && i <= 5 ? C.bYellow : "#ffffff")],
  ];
  rows.forEach(([n, vals, col], ri) => {
    els.push(text(0, 800 + ri * 70 + 14, n, { size: 17, bold: true, font: FONT.code }));
    vals.forEach((v, i) => els.push(rect(110 + i * 80, 800 + ri * 70, 72, 54, { text: v, font: FONT.code, size: 16, bg: col(i), stroke: C.gray, sw: 1, rough: 0, round: false })));
  });
  els.push(note(0, 1020, 760, "target[t] = ids[t+1], so the logits at position P−1 … P+R−2 predict the response tokens: mask = 1 exactly there. L = ceil(max(P+R)/64)·64 per micro-batch. scatter_response / gather_response move TQ's [R] vectors into and out of this [b, L] frame.", { size: 15, color: C.dim }));

  // RPCs
  els.push(h2(1100, 720, "The three RPCs (keys in, tensors via TQ)"));
  const rpc = [
    ["compute_old_log_prob", "kv_batch_get(input_ids, prompts) → per micro-batch: build_batch → actor.log_probs_no_grad → gather_response → kv_batch_put(old_log_probs)"],
    ["compute_ref_log_prob", "same, with the reference model → ref_log_prob  (only if loss.use_kl_loss)"],
    ["update_actor", "reads input_ids, prompts, old_log_probs, advantages, rollout_log_probs (+ ref_log_prob) and runs the loop below; returns a metrics map"],
  ];
  rpc.forEach(([t, d], i) => els.push(card(1100, 790 + i * 120, 860, `${t}\n${d}`, "trainer", { font: FONT.body })));
  els.push(small(1100, 1170, "log_probs_no_grad = NoGradGuard + forward + autograd::grpo_token_logp (fused log-softmax + gather)."));

  // update loop nested frames
  els.push(h2(0, 1230, "update_actor — the loop  [1.5B numbers]"));
  els.push(rect(0, 1290, 1300, 560, { bg: C.lGreen, stroke: C.green, sw: 1.5, rough: 0.5, opacity: 60 }));
  els.push(text(20, 1300, "for epoch in ppo_epochs  [1]", { font: FONT.code, size: 17, bold: true, color: C.green }));
  els.push(rect(40, 1340, 1220, 490, { bg: "#ffffff", stroke: C.green, sw: 1.5, dash: "dashed", rough: 0.5 }));
  els.push(text(60, 1350, "for mini-batch of ppo_mini_batch_size × n trajectories  [32 × 8 = 256]   →  zero_grad()", { font: FONT.code, size: 16, color: C.green }));
  els.push(rect(80, 1390, 760, 300, { bg: C.lGreen, stroke: C.green, sw: 1, dash: "dotted", rough: 0.5 }));
  els.push(text(100, 1400, "for micro-batch of ppo_micro_batch_size_per_gpu  [2]   (128 of them)", { font: FONT.code, size: 15, color: C.green }));
  const mb = [
    box(110, 1450, 220, 80, "logits = actor.forward\n[b, L, V]", "trainer", { size: 15 }),
    box(370, 1450, 220, 80, "compute_policy_loss\n(fused kernel, page 6)", "trainer", { size: 15, link: LINK.page(6) }),
    box(110, 1580, 480, 80, "loss × w  →  backward()\nw = tokens_micro / tokens_mini   (token-mean)", "trainer", { size: 15 }),
  ];
  els.push(...mb, arrow(mb[0], mb[1], "trainer"), arrow(mb[1], mb[2], "trainer"));
  const st = [
    box(880, 1400, 340, 70, "clip_grad_norm_(grad_clip = 1.0)", "trainer", { size: 15 }),
    box(880, 1500, 340, 70, "optimizer_steps++ → set_lr(lr_at(step))", "trainer", { size: 15 }),
    box(880, 1600, 340, 70, "AdamW.step()  (created lazily)", "trainer", { size: 15 }),
  ];
  els.push(...st, arrow(st[0], st[1], "trainer"), arrow(st[1], st[2], "trainer"), connect(mb[2], st[0], { stroke: C.green, sw: 2, end: "triangle", rough: 0.5 }));
  els.push(note(110, 1720, 1120, "One optimizer step per mini-batch; parameter_sync_step [1] mini-batches per global step. Metrics: actor/pg_loss, actor/kl_loss (raw k3 mean, not ×coef), actor/pg_clipfrac, actor/grad_norm, actor/lr, actor/optimizer_steps, framework/rollout_vs_trainer_logprob_{absdiff_mean, diff_mean, absdiff_max, frac_gt1}.", { size: 14, color: C.dim }));

  // LR schedule plot
  const total = 200;
  const warm = 5;
  const lr = 2e-6;
  const mn = 2e-7;
  els.push(
    ...plot(1420, 1350, 500, 300, { x0: 0, x1: total, y0: 0, y1: 2.2 }, [
      { f: (s) => (s <= warm ? (lr * s) / warm : mn + 0.5 * (lr - mn) * (1 + Math.cos((Math.PI * (s - warm)) / (total - warm)))) / 1e-6, stroke: C.green },
    ], { title: "LR schedule, lr_at(step)  [cont run]", xlabel: "optimizer step", ylabel: "lr (×1e-6)", guides: [{ y: 2, label: "2e-6" }, { y: 0.2, label: "2e-7" }] }),
  );
  els.push(note(1420, 1690, 540, "Linear warmup lr·step/warmup, then constant or cosine: min_lr + ½(lr − min_lr)(1 + cos(π·progress)). total = total_steps · parameter_sync_step · ppo_epochs · ceil(groups / mini). warmup = lr_warmup_steps, else ratio × total.", { size: 14, color: C.dim }));
  els.push(files(0, 1880, 1600, "RL/src/trainer_worker/{TrainerWorker,TrainerWorkerActor}.cpp · RL/include/trainer_worker/ModelConfigWire.h (lr_at) · RL/src/models/*"));
  return els;
}

// ======================================================================
// 8 · Weight sync
// ======================================================================
function syncPage() {
  const els = header(8, "Weight sync", "WeightSyncEngine::update_weights — pushing 3.4 GB from GPU 0 to seven replicas in ~0.4 s");
  // sequence diagram
  els.push(h2(0, 200, "The protocol, as a sequence"));
  const lanes = [
    ["Driver (CPU)", "driver", 120],
    ["TrainerWorker · GPU 0\nweight_sync rank 0", "trainer", 620],
    ["ReplicaActor ×7 · GPUs 1–7\nranks 1…7", "rollout", 1180],
  ];
  const top = 270;
  const bottom = 1250;
  for (const [n, k, x] of lanes) {
    els.push(box(x - 170, top, 340, 80, n, k, { size: 17 }));
    els.push(poly([{ x, y: top + 80 }, { x, y: bottom }], { stroke: K[k].s, sw: 1.5, dash: "dashed" }));
  }
  const msgs = [
    [0, 2, "1. pause_all_requests(reject_new=false)", "keep mode: in-flight requests pause, PagedEngine drops their KV"],
    [0, 2, "2. release_kv_cache", "no-op for both engines (already cleared at pause)"],
    [0, 1, "3. join_weight_sync_group(uid, rank 0, world 8)", "driver mints ncclGetUniqueId → hex (NcclUidCodec)"],
    [0, 2, "3. init_process_group(uid, ranks 1…7)", "first call only — the group stays warm afterwards"],
    [0, 1, "4. push_weights(group, bucket_size_mb)", "dispatched to everyone before waiting on anyone"],
    [0, 2, "4. update_weights(global_steps)", "requires the paused state"],
    [1, 2, "NCCL broadcast_inplace(root 0), bucket by bucket", ""],
    [0, 2, "6. finalize_checkpoint_engine · 7. resume_kv_cache", "no-ops"],
    [0, 2, "8. resume_generation", "paused requests re-prefill under the new weights"],
  ];
  msgs.forEach(([a, b, t, d], i) => {
    const y = top + 140 + i * 100;
    const x1 = lanes[a][2];
    const x2 = lanes[b][2];
    const k = a === 1 ? "sync" : "driver";
    els.push(harrow(x1 + 4, x2 - 6, y, { stroke: K[k].s, sw: a === 1 ? 5 : 2 }));
    els.push(text(x1 + 20, y - 30, t, { size: 15, font: FONT.code, color: a === 1 ? C.red : C.ink, bold: a === 1 }));
    if (d) els.push(text(x1 + 20, y + 8, d, { size: 13, color: C.gray, italic: true }));
  });
  els.push(small(0, bottom + 20, "Step 5 has no separate call: transfer is steps 4 together. The weight-hash diagnostic (FNV-1a) runs at step ≤ 2 and every 50 — about 4 s per hashed sync."));

  // right side
  const RX = 1460;
  els.push(h2(RX, 200, "Buckets: by size and by dtype"));
  const params = [
    ["wte", 3, "fp32"], ["q_proj", 2, "bf16"], ["k_proj", 1, "bf16"], ["v_proj", 1, "bf16"], ["o_proj", 2, "bf16"], ["norm", 0.5, "fp32"], ["gate", 3, "bf16"], ["up", 3, "bf16"], ["down", 3, "bf16"], ["norm", 0.5, "fp32"],
  ];
  let px = RX;
  params.forEach(([n, w, dt]) => {
    els.push(rect(px, 270, w * 25, 50, { text: w >= 3 ? n : "", font: FONT.code, size: 11, bg: dt === "fp32" ? C.bOrange : C.bBlue, stroke: C.gray, sw: 1, rough: 0, round: false }));
    px += w * 25 + 3;
  });
  els.push(label(RX, 328, "parameters in positional order: wte · q k v o projections · norm · gate up down · norm (orange = fp32, blue = bf16)"));
  const bk = [[0, 1, "b0 fp32"], [1, 5, "b1 bf16"], [5, 6, "b2 fp32"], [6, 9, "b3 bf16 (size cap)"], [9, 10, "b4 fp32"]];
  const starts = [];
  px = RX;
  params.forEach(([, w]) => {
    starts.push(px);
    px += w * 25 + 3;
  });
  starts.push(px);
  for (const [a, b, n] of bk) {
    els.push(poly([{ x: starts[a] + 2, y: 365 }, { x: starts[a] + 2, y: 375 }, { x: starts[b] - 5, y: 375 }, { x: starts[b] - 5, y: 365 }], { stroke: C.red, sw: 2 }));
    els.push(text((starts[a] + starts[b]) / 2, 382, n, { size: 12, align: "center", color: C.red, font: FONT.code }));
  }
  els.push(card(RX, 430, 500, "bucket_by_size(params, MB) starts a new bucket when the size cap [256 MB] is hit or the dtype changes. One dtype per bucket fixed a weight-corruption bug with mixed bf16/fp32. Both sides re-derive the same schedule independently: there are no names on the wire, so trainer ProductionGPT and replica blu::BLU must have identical parameter order and dtypes.", "sync", { size: 15 }));

  els.push(h2(RX, 720, "Double buffering on the trainer"));
  const gx = RX + 110;
  const cw = 76;
  els.push(text(RX, 785, "flatten", { size: 14, bold: true }), text(RX, 845, "broadcast", { size: 14, bold: true }));
  for (let b = 0; b < 4; b++) {
    els.push(rect(gx + b * cw, 775, cw - 4, 44, { text: `b${b}`, font: FONT.code, size: 14, bg: C.bBlue, stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(rect(gx + (b + 1) * cw, 835, cw - 4, 44, { text: `b${b}`, font: FONT.code, size: 14, bg: C.bRed, stroke: C.gray, sw: 1, rough: 0, round: false }));
  }
  els.push(harrow(gx, gx + 5 * cw + 10, 900, { stroke: C.dim, sw: 1.5 }), label(gx + 5 * cw - 30, 908, "time"));
  els.push(note(RX, 940, 500, "flatten_concat bucket i+1 while bucket i's async broadcast is in flight. A cudaDeviceSynchronize() before every broadcast fixed a race that sent half-written buffers. Replicas: flatten → sync → broadcast (sync) → unflatten_into.", { size: 15, color: C.dim }));

  els.push(h2(RX, 1110, "Two NCCL groups"));
  els.push(card(RX, 1170, 500, "trainer_pool_fsdp — only when there's more than one trainer GPU (and then fit() refuses to run).\n\nweight_sync — trainers are ranks 0…N−1, replicas N…N+M−1 [world 8]. A rejoin with a different rank or world size throws.", "gray", { size: 15 }));
  els.push(sticky(0, bottom + 80, 1300, "Why pause in keep mode instead of aborting? In-flight generations survive the sync: they lose only their KV cache and re-prefill with the new weights, so a sequence can span two policy versions. That's one more source of the off-policy gap the replay buffer's staleness threshold bounds.", { size: 16, font: FONT.body, bg: C.bYellow }));
  els.push(files(RX, 1400, 500, "RL/src/weight_sync/{WeightSyncEngine,WeightBucketing,DdpWeightSource,WeightHash}.cpp · RL/src/orchestration/ProcessGroupRendezvous"));
  return els;
}

// ======================================================================
// 9 · One step end to end
// ======================================================================
function stepPage() {
  const els = header(9, "One step, end to end", "RLDriver::fit() — what happens between [step N] and [step N+1], with the exact calls");
  // swimlane timeline
  els.push(h2(0, 200, "Timeline of one global step  (not to scale)"));
  const lanes = [
    ["RLDriver", "driver"],
    ["ReplayBuffer", "replay"],
    ["TransferQueue", "data"],
    ["Rollout pool", "rollout"],
    ["Trainer GPU 0", "trainer"],
  ];
  const LX = 220;
  const LW = 1740;
  const LH = 110;
  const T0 = 270;
  lanes.forEach(([n, k], i) => {
    els.push(rect(0, T0 + i * LH, LX - 10, LH - 10, { text: n, font: FONT.body, size: 16, bold: true, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4 }));
    els.push(rect(LX, T0 + i * LH, LW, LH - 10, { bg: K[k].l, stroke: K[k].s, sw: 1, rough: 0, round: false, opacity: 60 }));
  });
  const ly = (i) => T0 + i * LH + 15;
  const ev = (lane, x, w, str, link) => {
    const k = lanes[lane][1];
    const r = rect(LX + x, ly(lane), w, LH - 40, { text: str, font: FONT.body, size: 14, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4, color: C.ink, link });
    els.push(r);
    return r;
  };
  const A = ev(0, 10, 150, "A. submit_prompts(32)", LINK.page(2));
  const Aq = ev(2, 10, 150, "32 prompt rows\nstatus=pending");
  // rollout runs continuously, with a pause at sync
  const g1 = ev(3, 10, 1290, "generating: prompts from steps N−1, N (and N+1 once submitted) · 8 sessions each · score · kv_put trajectories", LINK.page(3));
  const B1 = ev(1, 180, 230, "B1. sample(): wait, evict,\nrefill, select oldest", LINK.page(5));
  const B2 = ev(4, 430, 200, "B2. compute_old_log_prob", LINK.page(7));
  const B3 = ev(4, 650, 200, "B3. compute_ref_log_prob");
  const B4 = ev(0, 870, 210, "B4–5. staleness gap\n+ compute_advantage", LINK.page(6));
  const B6 = ev(4, 1100, 210, "B6. update_actor\n(AdamW step)", LINK.page(7));
  const B8 = ev(2, 1320, 160, "B8. kv_clear\nconsumed rows");
  const C2 = ev(0, 1330, 150, "C. on_step_end\naggregate metrics");
  const sync = ev(4, 1500, 230, "C2. push_weights (NCCL)", LINK.page(8));
  const paused = rect(LX + 1310, ly(3), 420, LH - 40, { text: "paused → weights land → resume (re-prefill)", font: FONT.body, size: 14, bg: C.bRed, stroke: C.red, sw: 1.5, rough: 0.4, link: LINK.page(8) });
  els.push(paused);
  els.push(arrow(A, Aq, "driver"), arrow(Aq, g1, "data"), arrow(B1, B2, "replay"), arrow(B2, B3, "trainer"), arrow(B3, B4, "trainer"), arrow(B4, B6, "driver"), arrow(B6, B8, "trainer"), arrow(B8, C2, "data"), arrow(C2, sync, "driver"), arrow(sync, paused, "sync", { sw: 3 }));
  els.push(small(LX, T0 + 5 * LH + 6, "Rollout never waits for training: while GPU 0 trains on step N's batch, GPUs 1–7 keep generating newer prompts. Only the weight sync pauses them. [1.5B: ~35 s per step]"));

  // detailed list
  els.push(h2(0, 920, "The calls, in order"));
  els.push(
    code(0, 980, 1180, `on_train_begin():  submit floor(num_warmup_batches·train_batch_size / gen_batch_size)·gen_batch_size
                   prompts at global_steps = 0                                   [32]

for global_steps = 1 … total_steps:                                              [200]
  A  prepare_step() → submit_prompts(train_batch_size)
       prompt_dataset_next_train_batch(id, n, step)          → PromptBatch
       tq.kv_batch_put(uids, "train", {prompt_token_ids, prompt_text,
                       ground_truth, data_source}, {is_prompt, status=pending, global_steps})
       manager_generate_sequences(manager_id, batch)         // fire-and-forget

  B  repeat max(1, parameter_sync_step) times:  step_once(i)                     [×1]
     1 replay_buffer.sample(step, "train", groups)            → KVBatchMeta     [32 groups]
     2 trainer_worker_compute_old_log_prob(trainer, batch)   → old_log_probs
     3 trainer_worker_compute_ref_log_prob(trainer, batch)   → ref_log_prob    (if use_kl_loss)
     4 logprob_gap_by_staleness(batch, m)                    // span0/1/2plus diagnostics
     5 compute_advantage(batch):  kv_batch_get(rm_scores) → GRPO → kv_batch_put(advantages)
     6 trainer_worker_update_actor(trainer, batch)           → metrics map
     7 metrics_aggregator.add_mini_batch_metrics(m, batch.size())
     8 tq.kv_clear(batch.keys, "train")

  C  on_step_end():
       aggregate_and_reset()
       if step % sync_every_n_steps == 0:  weight_sync_engine.update_weights(step)
       if step % save_freq_steps == 0 or last:  save_checkpoint()                [25]
       print "[metrics] {json}"  and append to log_dir/metrics.jsonl
  D  print "[step N] <secs>s"`,
      { size: 14 },
    ),
  );

  // batch arithmetic
  els.push(h2(1260, 920, "The batch arithmetic  [1.5B]"));
  const nums = [
    ["32", "prompts per step (train_batch_size)"],
    ["× 8", "samples each (rollout.n)"],
    ["= 256", "trajectories per optimizer step"],
    ["÷ 2", "per micro-batch (ppo_micro_batch_size_per_gpu)"],
    ["= 128", "forward/backward passes per step"],
    ["1", "AdamW step and 1 weight sync per global step"],
  ];
  nums.forEach(([n, d], i) => {
    els.push(rect(1260, 990 + i * 74, 130, 60, { text: n, font: FONT.code, size: 22, bold: true, bg: i % 2 ? C.lGreen : C.bGreen, stroke: C.green, sw: 1.5, rough: 0.4 }));
    els.push(text(1410, 1005 + i * 74, d, { size: 16 }));
  });
  els.push(card(1260, 1460, 700, "Invariant: train_batch_size (32) = parameter_sync_step (1) × ppo_mini_batch_size (32), so each step_once() trains on exactly one mini-batch → one optimizer step. With the 135M configs, train_batch_size 8 and parameter_sync_step 2 give two smaller updates per global step.", "gray", { size: 15 }));
  els.push(files(0, 1720, 1200, "RL/src/driver/RLDriver.cpp: fit, prepare_step, step_once, compute_advantage, on_step_end"));
  return els;
}

// ======================================================================
// 10 · Metrics, results & caveats
// ======================================================================
function miscPage() {
  const els = header(10, "Metrics, results & caveats", "What gets logged and saved, how runs were evaluated, and what isn't there yet");
  els.push(h2(0, 200, "MetricsAggregator: how mini-batch values combine"));
  const T = table(0, 260, [{ w: 340, code: true }, { w: 240 }, { w: 380, code: true }], [
    ["key contains…", "rule", "examples"],
    ["lr", "last value", "actor/lr"],
    ["samples · evicted · count · steps", "sum", "actor/optimizer_steps, …/evicted_samples"],
    ["anything else", "sample-weighted mean", "actor/pg_loss, reward/mean"],
  ], { size: 15 });
  els.push(...T.els);
  els.push(note(0, 260 + T.h + 10, 960, "Quirk: matching is by substring, so …/evicted_samples_staleness/mean contains \"evicted\" and is summed across mini-batches, not averaged.", { size: 14, color: C.red }));
  els.push(h2(1060, 200, "Metric families"));
  const fam = [
    ["actor/*", "pg_loss, kl_loss, pg_clipfrac, grad_norm, lr, optimizer_steps", "trainer"],
    ["reward/*", "mean, groups · response_length/mean", "reward"],
    ["training/*", "off_policy/evicted_samples(_staleness/mean,max,min), filter_groups/…, rollout_failure/…", "replay"],
    ["timing/*", "sample_wait_s, weight_sync_s · weight_sync/bytes", "sync"],
    ["framework/*", "rollout_vs_trainer_logprob_{absdiff_mean, diff_mean, absdiff_max, frac_gt1}", "gray"],
  ];
  fam.forEach(([t, d, k], i) => els.push(card(1060, 260 + i * 92, 900, `${t}\n${d}`, k, { size: 15 })));

  els.push(h2(0, 760, "Checkpoints & evaluation"));
  els.push(card(0, 820, 620, "Checkpoints — weights only\n<checkpoint.dir>/global_step_<N>/actor.safetensors every save_freq_steps [25] and at the last step. No optimizer state and no rotation; load_checkpoint throws. A continuation run resets AdamW, and its KL reference becomes the continuation checkpoint.", "gray"));
  els.push(card(660, 820, 620, "Evaluation is offline\nRLDriver::validate() throws and val_path is never used. Instead: scripts/eval_gsm8k_vllm.py scores gsm8k_chat/val.jsonl greedily with vLLM using the same strict rule, and scripts/compare_evals.py runs a paired McNemar test.", "gray"));
  els.push(card(1320, 820, 640, "Logs\n[metrics] {json} lines on stdout + log_dir/metrics.jsonl; per-rollout JSON lines in rollout_data_dir/rollouts_<pid>.jsonl (analyze_rollouts.py, filter_from_rollouts.py read them).", "gray"));

  // results
  els.push(h2(0, 1060, "Results so far  (docs/GRPO_1P5B_REPORT.md)"));
  els.push(
    ...bars(30, 1160, 420, 240, 0, 12, [
      { v: 6.29, top: "6.29%", label: "base", color: C.bGray },
      { v: 9.86, top: "9.86%", label: "step 150", color: C.bGreen },
    ]),
  );
  els.push(label(30, 1440, "GSM8K accuracy, 1.5B, p < 0.001"));
  els.push(card(560, 1140, 700, "Fixed during the 1.5B bring-up\n• NCCL broadcast race → cudaDeviceSynchronize() before each broadcast\n• TQ KV_CLEAR freed ids early → Controller::release_cleared()\n• \"finished\" before rows visible → the unsettled set\n• mixed-dtype buckets corrupted weights → one dtype per bucket\n• step time 73 s → ~35 s", "trainer", { size: 15 }));
  els.push(card(1300, 1140, 660, "Runs in the repo\n135M GPT on GSM8K, 2× RTX 3060 · 1.5B Qwen3-shaped on 8× RTX 6000 Ada (1 trainer + 7 rollout GPUs) · configs: grpo_135m_{gsm8k, sft_gsm8k, oneshot_104, ifeval}, grpo_1p5b_{gsm8k, cont100, 1000, sanity_short}.", "gray", { size: 15 }));

  // caveats grid
  els.push(h2(0, 1530, "Caveats — read before trusting a knob"));
  const cav = [
    ["Single trainer GPU", "fit() throws unless there is exactly one trainer worker; RoleWorkerGroup::call_* throw; no FSDP/ZeRO or grad all-reduce.", "sync"],
    ["Ratio ≈ 1", "π_old is recomputed right before the single optimizer step, so the PPO clip rarely bites (pg_clipfrac ≈ 0).", "sync"],
    ["No off-policy correction", "rollout_log_probs is diagnostic only; decoupled_ppo.* is parsed but never read.", "sync"],
    ["No entropy", "Not computed or regularized (docs/ENTROPY_PLAN.md).", "gray"],
    ["Advantage registry bypassed", "compute_advantage calls GRPO directly with a literal 1e-6; adv_estimator: gae parses but has no implementation.", "gray"],
    ["Validation partition", "RolloutWorker hard-codes partition \"train\" (TODO in run_prompt).", "gray"],
    ["Ray C++ constraints", "Actors are found by name, not passed as handles (that crashed Ray); positional MSGPACK_DEFINE wire structs must be kept in sync by hand.", "gray"],
    ["Orphan binary", "lib/train_grpo_sync has no source in the tree — logs show a synchronous 4-GPU colocated variant.", "gray"],
  ];
  cav.forEach(([t, d, k], i) => els.push(card((i % 4) * 490, 1600 + Math.floor(i / 4) * 170, 470, `${t}\n${d}`, k, { size: 15 })));
  els.push(note(0, 1960, 1500, "Stale docs: README.md (\"mostly scaffolding\"), STATUS.md (no KV cache, MathEquivalence a placeholder) and include/replay_buffer/README.md (FakeTQClient) lag the code.", { size: 15, color: C.gray, italic: true }));
  return els;
}
// ---------- assemble ----------
write([overview, launchPage, dataPage, rolloutPage, rewardPage, replayPage, lossPage, trainerPage, syncPage, stepPage, miscPage], process.argv[2]);
