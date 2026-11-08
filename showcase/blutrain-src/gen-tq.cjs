// Builds the "Blu-TransferQueue, explained" sketchboard showcase.
// Source of truth: /home/blubridge-029/RLVR-main/RL/BluTrain/RL/Blu-TransferQueue (TQ/) and its RL client in
// RL/src/transfer_queue_client (read 2026-11-04). [brackets] = the 1.5B GSM8K run's settings.
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame } = L;
const { K, box, card, code, h2, small, label, arrow, poly, harrow, table, bars, pagesKit, files } = require("./kit.cjs");

// Roles in this drawing: controller = violet, shard = teal, client = blue, ids/capacity = orange,
// checkpoint = green, bugs = red, legacy streaming layer = grape.
const PAGE_NAMES = [
  "0 · Overview",
  "1 · Build & startup",
  "2 · Data model",
  "3 · Wire & RPC servers",
  "4 · Put, get, list",
  "5 · Clear, ids & capacity",
  "6 · Storage shards",
  "7 · Checkpoints",
  "8 · Streaming layer",
  "9 · Metrics, tests & caveats",
];
const ACCENT = [C.teal, C.dim, C.blue, C.violet, C.blue, C.orange, C.teal, C.green, C.grape, C.red];
const { LINK, header, write } = pagesKit("tq", PAGE_NAMES, ACCENT);

/** Sequence diagram: lanes [{name, k, x}], msgs [{a, b, t, d?, k?, bold?}] from y0, `gap` apart. */
function sequence(els, lanes, top, bottom, msgs, y0, gap) {
  for (const l of lanes) {
    els.push(box(l.x - (l.w ?? 300) / 2, top, l.w ?? 300, 80, l.name, l.k, { size: 17 }));
    els.push(poly([{ x: l.x, y: top + 80 }, { x: l.x, y: bottom }], { stroke: K[l.k].s, sw: 1.5, dash: "dashed" }));
  }
  msgs.forEach((m, i) => {
    if (m.a === m.b) return; // spacer row
    const y = y0 + i * gap;
    const xa = lanes[m.a].x;
    const xb = lanes[m.b].x;
    const k = m.k ?? lanes[m.a].k;
    const left = Math.min(xa, xb);
    els.push(harrow(xa + (xb > xa ? 4 : -4), xb + (xb > xa ? -6 : 6), y, { stroke: K[k].s, sw: m.bold ? 4 : 2, dash: m.dash }));
    els.push(text(left + 16, y - 28, m.t, { size: 15, font: FONT.code, bold: m.bold, color: m.bold ? K[k].s : C.ink }));
    if (m.d) els.push(text(left + 16, y + 8, m.d, { size: 13, color: C.gray, italic: true }));
  });
}

// ======================================================================
// 0 · Overview
// ======================================================================
function overview() {
  const els = header(0, "Blu-TransferQueue — how it works", "A C++ port of Ascend/verl TransferQueue: the KV store every BluTrain RL actor writes tensors into and reads them back from");
  els.push(small(0, 156, "Read from RL/Blu-TransferQueue (a git submodule) and RL/src/transfer_queue_client. Boxes with a page number jump there (click in view mode, Ctrl+click while editing; Alt+← comes back)."));

  els.push(frame(0, 230, 1520, 1000, "Architecture — one controller for metadata, N shards for tensors"));
  // clients
  els.push(text(40, 262, "Clients — one rl::TQClient → tq::KVClient per Ray actor", { size: 17, bold: true, color: K.rollout.s }));
  const cl = [
    box(40, 300, 300, 90, "RLDriver\nprompt rows · advantages · clears", "rollout", { size: 16, link: LINK.page(4) }),
    box(40, 420, 300, 90, "RolloutWorker ×7\nstatus tags · trajectory rows", "rollout", { size: 16, link: LINK.page(4) }),
    box(40, 540, 300, 90, "TrainerWorker\nreads ids · writes log-probs", "rollout", { size: 16, link: LINK.page(4) }),
    box(40, 660, 300, 90, "ReplayBufferAsync\nkv_list polls · evictions", "rollout", { size: 16, link: LINK.page(4) }),
  ];
  els.push(...cl);
  // controller
  els.push(rect(520, 270, 960, 470, { bg: K.driver.l, stroke: K.driver.s, sw: 1.5, dash: "dashed", rough: 0.5, opacity: 70 }));
  els.push(text(540, 282, "ControllerServer (1 process, TQControllerActor)  →  page 3", { size: 17, bold: true, color: K.driver.s, link: LINK.page(3) }));
  const ctl = box(550, 330, 440, 110, "TransferQueueController\nmetadata only · one global mutex\nmax_kv_samples = total_storage_size [20000]", "driver", { size: 16, link: LINK.page(5) });
  const pim = box(1020, 330, 430, 110, "PartitionIndexManager\nglobal u64 SampleIds\nnext_index_ + FIFO free list", "reward", { size: 16, link: LINK.page(5) });
  const dps = box(550, 470, 440, 110, "DataPartitionStatus per partition\nkey↔id · per-field production\nshard · version · tags", "driver", { size: 16, link: LINK.page(2) });
  const reg = box(1020, 470, 430, 110, "Shard registry\nshard_index → tcp address\nfilled by HANDSHAKE", "driver", { size: 16, link: LINK.page(1) });
  const gate = box(550, 610, 440, 100, "CheckpointGate\nwriter-preferring shared lock", "trainer", { size: 16, link: LINK.page(7) });
  const met = box(1020, 610, 430, 100, "MetricsHttpServer\nPrometheus text on any path", "gray", { size: 16, link: LINK.page(9) });
  els.push(ctl, pim, dps, reg, gate, met);
  // shards
  els.push(rect(520, 830, 960, 330, { bg: "#e3fafc", stroke: K.data.s, sw: 1.5, dash: "dashed", rough: 0.5, opacity: 70 }));
  els.push(text(540, 842, "StorageServer shards (num_data_storage_units [2], TQStorageActor each)  →  page 6", { size: 17, bold: true, color: K.data.s, link: LINK.page(6) }));
  const sh = [0, 1, 2].map((i) => box(560 + i * 310, 900, 280, 130, i < 2 ? `shard ${i}\nSimpleStorageManager\nrows_[partition][id] = Record` : "shard N−1\n…", "data", { size: 16, link: LINK.page(6) }));
  els.push(...sh);
  els.push(note(560, 1060, 900, "Tensors live only here, in memory. No byte cap in production, no replication: a dead shard loses its rows.", { size: 15, color: C.dim }));
  // arrows
  const meta = { stroke: K.driver.s, sw: 2, end: "triangle", start: "triangle", rough: 0.5 };
  const data = { stroke: K.data.s, sw: 2.5, end: "triangle", start: "triangle", rough: 0.5 };
  els.push(connect(cl[0], ctl, meta), connect(cl[1], ctl, { ...meta, dash: "dashed" }));
  els.push(connect(cl[2], sh[0], data), connect(cl[3], dps, { ...meta, dash: "dashed" }));
  els.push(connect(cl[1], sh[0], { ...data, dash: "dashed" }));
  els.push(connect(gate, sh[1], { stroke: C.gray, sw: 1.5, end: "triangle", rough: 0.5 }));
  els.push(label(360, 300, "KV_RETRIEVE · KV_UPDATE\nKV_LIST · KV_CLEAR", { size: 13 }), label(360, 780, "PUT_DATA · GET_DATA\n(direct, never via the controller)", { size: 13 }), label(880, 760, "CLEAR_DATA · checkpoint fan-out · GET_STATS", { size: 13 }));
  els.push(connect(sh[2], reg, { stroke: C.gray, sw: 1.5, end: "triangle", dash: "dotted", rough: 0.5, bend: -80 }));
  els.push(label(1400, 780, "HANDSHAKE once\nat startup", { size: 13 }));
  els.push(poly([{ x: 40, y: 1260 }, { x: 110, y: 1260 }], { type: "arrow", end: "triangle", stroke: K.driver.s, sw: 2 }), label(120, 1251, "metadata RPCs (controller)"));
  els.push(poly([{ x: 420, y: 1260 }, { x: 490, y: 1260 }], { type: "arrow", end: "triangle", stroke: K.data.s, sw: 2.5 }), label(500, 1251, "tensor bytes (shards)"));
  els.push(label(760, 1251, "All links: ZMQ DEALER (client) → ROUTER (server) over tcp, ephemeral ports, custom little-endian binary messages."));

  // right column: a put in three steps + index
  const RX = 1620;
  els.push(h2(RX, 230, "One kv_batch_put, three RPCs"));
  const st = [
    ["1 · KV_RETRIEVE(create) → controller", "keys → global ids; unknown keys get fresh ids (capacity is checked here); reply carries each id's shard and the shard registry", "driver"],
    ["2 · PUT_DATA → shard(s)", "new keys go to registered[hash(uid prefix) % n], so a prompt and its trajectories share a shard; rows merge per field", "data"],
    ["3 · KV_UPDATE → controller", "mark the fields produced, record the shard, merge tags. Data lands before metadata: no reader sees a field before it is stored.", "driver"],
  ];
  let y = 290;
  const sb = st.map(([t, d, k]) => {
    const r = card(RX, y, 560, `${t}\n${d}`, k, { size: 16, link: LINK.page(4) });
    y += 150;
    return r;
  });
  els.push(...sb, arrow(sb[0], sb[1]), arrow(sb[1], sb[2]));
  els.push(h2(RX, 760, "Pages"));
  const idx = [
    [1, "gray", "Makefile lanes, Ray actors, shard handshake"],
    [2, "rollout", "Ids, keys, partitions, tags, tensor bytes"],
    [3, "driver", "Message format, ZMQ frames, reactor + 4 workers"],
    [4, "rollout", "kv_batch_put / get / list, routing, worked example"],
    [5, "reward", "Id allocator, kv_clear, the release_cleared fix"],
    [6, "data", "SimpleStorageManager, merge, byte accounting"],
    [7, "trainer", "CheckpointGate, save, two-phase load, file formats"],
    [8, "replay", "GET_META, samplers, versions (unused by RL)"],
    [9, "sync", "Prometheus, benchmarks, tests, known bugs"],
  ];
  idx.forEach(([pg, k, d], i) => els.push(card(RX + (i % 2) * 300, 820 + Math.floor(i / 2) * 92, 285, `${PAGE_NAMES[pg]}\n${d}`, k, { size: 14, link: LINK.page(pg) })));

  // two layers
  const by = 1360;
  els.push(h2(0, by, "Two API layers — RL uses only the first"));
  els.push(card(0, by + 60, 740, "KV layer (verl v1)  —  used by RL\nkv_put · kv_batch_put · kv_batch_get · kv_list · kv_clear · save_checkpoint · load_checkpoint. Rows are addressed by string keys; status lives in tags that RL interprets.", "rollout"));
  els.push(card(780, by + 60, 740, "Streaming layer (original TQ)  —  compiled and tested, never called by RL\nNOTIFY_DATA_UPDATE · GET_META with per-task consumption · FifoSampler / GRPOGroupNSampler · ADVANCE_VERSION · FIND_STRANDED_GROUPS.  →  page 8", "replay", { link: LINK.page(8) }));
  els.push(sticky(1620, by + 40, 560, "Status note\nTQ/README.md is empty, and docs/PHASE_*.md, PIPELINE_WALKTHROUGH.md and others that the code comments cite are not in the tree. This showcase is built from the code.", { size: 16, font: FONT.body, angle: -0.01 }));

  els.push(h2(0, by + 260, "Throughput, PUT → GET  (benchmark_main, single shard)"));
  els.push(
    ...bars(30, by + 360, 760, 220, 0, 2, [
      { v: 0.66, top: "0.66", label: "PUT 1024×8192×9", color: C.bCyan },
      { v: 0.94, top: "0.94", label: "GET", color: C.bBlue },
      { v: 0.73, top: "0.73", label: "PUT 512×4096×10", color: C.bCyan },
      { v: 1.14, top: "1.14", label: "GET", color: C.bBlue },
      { v: 0.91, top: "0.91", label: "PUT 256×2048×10", color: C.bCyan },
      { v: 1.7, top: "1.70", label: "GET", color: C.bBlue },
    ]),
  );
  els.push(label(30, by + 620, "GB/s, float32 fields. From TRANSFERQUEUE_BENCHMARK_REPORT.md in another checkout (team_codebase, submodule f52f57b, 10-19) — no numbers are stored in this tree."));
  return els;
}

// ======================================================================
// 1 · Build & startup
// ======================================================================
function buildPage() {
  const els = header(1, "Build & startup", "Makefile lanes, the three server binaries, and how RL brings the store up as Ray actors");
  els.push(h2(0, 200, "Makefile lanes (no CMake)"));
  const T = table(0, 260, [{ w: 260, code: true }, { w: 620 }], [
    ["target", "builds / runs"],
    ["smoke", "core only (BatchMeta, Message, ids, partitions, Controller, samplers, GroupRouter) — plain g++"],
    ["test_tensor", "+ Tensor-Implementations (StorageManager, in-process Client)"],
    ["test_rpc · test_correctness", "+ libzmq / cppzmq: RPC servers, clients, pipeline correctness"],
    ["test_distributed[_n_to_m]", "mpic++ / mpirun: per-rank servers, N rollout → M trainer ranks"],
    ["server_bin · controller_server_bin · storage_server_bin", "the three standalone binaries"],
    ["benchmark · control_plane_benchmark", "PUT→GET GB/s; CSV control-plane microbenchmarks"],
    ["checkpoint_inspect", "read-only dump + consistency check of a checkpoint dir"],
    ["unit_tests", "16 suites: unit_core_% (8), unit_tensor_% (2), unit_rpc_% (6)"],
    ["lib", "lib/libtransferqueue.a = core + tensor + Transport stub (no RPC sources)"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(card(940, 260, 520, "Toolchain\ng++ -std=c++2a -O2 -g. No msgpack or protobuf: the wire format is hand-written. Depends on libzmq + cppzmq and BluTrain's Tensor-Implementations (OwnTensor::Tensor, save/load_tensor, ThreadPool) — which pulls in the CUDA link line.", "gray"));
  els.push(code(940, 480, 520, "server_bin <bind> [id]          colocated (legacy)\ncontroller_server_bin <bind>    no cap, no metrics\nstorage_server_bin <bind> <shard> <controller>\n\n# each prints its bound address and sleeps\n# in 200 ms loops until SIGTERM/SIGINT", { size: 14 }));

  // startup sequence
  const sy = 860;
  els.push(h2(0, sy, "How RL starts it — start_transfer_queue(config)  (RL/src/transfer_queue_client/TransferQueueActor.cpp)"));
  const lanes = [
    { name: "RLDriver::init", k: "rollout", x: 160 },
    { name: "TQControllerActor\nControllerServer", k: "driver", x: 640 },
    { name: "TQStorageActor ×N\nStorageServer", k: "data", x: 1140 },
  ];
  sequence(els, lanes, sy + 70, sy + 760, [
    { a: 0, b: 1, t: "create actor (max_samples = total_storage_size, metrics_port)", d: "binds tcp://0.0.0.0:0 → address tcp://<node_ip>:<port>" },
    { a: 1, b: 0, t: "Address()", d: "node_ip(): connect a UDP socket to 8.8.8.8:53 (nothing sent), read getsockname" },
    { a: 0, b: 2, t: "create actor i (shard i, controller_address)", d: "binds its own ephemeral port" },
    { a: 2, b: 1, t: "HANDSHAKE{shard_index=i, address}", d: "announce_shard — in the constructor, before it returns", k: "data", bold: true },
    { a: 1, b: 2, t: "HANDSHAKE_ACK  (register_shard)", d: "re-announcing an index overwrites its address" },
    { a: 0, b: 2, t: "ray::Get(Address()) for every shard", d: "so startup blocks until all shards are registered" },
  ], sy + 230, 95);
  els.push(code(1380, sy + 80, 580, "transfer_queue:              # RLConfig.h  [1.5B]\n  metrics:\n    enabled: false            # [true]\n    port: 0                   # 0 = ephemeral\n  storage_backend: SimpleStorage\n  SimpleStorage:\n    total_storage_size: 100000   # [20000]\n    num_data_storage_units: 8    # [2]", { size: 14 }));
  els.push(card(1380, sy + 330, 580, "Capacity check before start\ntotal_storage_size ≥ ceil((num_warmup_batches + 1) · train_batch_size) · (1 + rollout.n), or ≤ 0 for unlimited.  [1.5B: 20000 ≥ 2 · 32 · 9 = 576]", "reward"));
  els.push(card(1380, sy + 480, 580, "History\ntools/ray_launcher.py used to start the colocated binary from a Python Ray actor; commit f52f57b (10-19) replaced it with the C++ RAY_REMOTE actors above.", "gray"));
  els.push(files(0, sy + 790, 1400, "TQ/Makefile · TQ/tools/*_main.cpp · RL/src/transfer_queue_client/TransferQueueActor.cpp · RL/include/config/RLConfig.h:290-297"));
  return els;
}

// ======================================================================
// 2 · Data model
// ======================================================================
function dataPage() {
  const els = header(2, "Data model", "Partitions, keys and global ids; what the controller knows about each row; how tensors and strings are serialized");
  els.push(h2(0, 200, "Names for a row"));
  const nm = [
    box(0, 270, 300, 100, "partition\n\"train\" · \"val\"", "driver", { font: FONT.code, size: 16 }),
    box(380, 270, 380, 100, "key (per partition)\n\"9f1c-…\"  prompt\n\"9f1c-…_<session>_0\"  trajectory", "rollout", { font: FONT.code, size: 15 }),
    box(840, 270, 300, 100, "SampleId\nglobal uint64\nkMissingSample = UINT64_MAX", "reward", { font: FONT.code, size: 15 }),
    box(1220, 270, 300, 100, "shard index\nwhere the tensors live\n-1 = no data yet", "data", { font: FONT.code, size: 15 }),
  ];
  els.push(...nm, arrow(nm[0], nm[1]), arrow(nm[1], nm[2]), arrow(nm[2], nm[3]));
  els.push(label(310, 250, "scopes"), label(770, 250, "key_to_id_"), label(1150, 250, "sample_shard_"));
  els.push(card(0, 410, 1520, "Ids are global across partitions — there is one allocator. A partition is created lazily (KV_RETRIEVE with create, KV_UPDATE, …) and pre-allocates 1 id (kPreAllocSampleNum) that is never bound to a key. The uid prefix before the first '_' is what routes a key to a shard, so RL uids contain '-' but never '_'.", "gray"));

  // DataPartitionStatus
  els.push(h2(0, 560, "DataPartitionStatus — the controller's view of one partition"));
  const T = table(0, 620, [{ w: 280, code: true }, { w: 330, code: true }, { w: 480 }], [
    ["member", "type", "holds"],
    ["key_to_id_ / id_to_key_", "map<string, id>", "the key binding (KV layer)"],
    ["production_by_field_", "map<field, set<id>>", "which ids have each field — per-field production"],
    ["global_indexes_", "unordered_set<id>", "ids with any production update"],
    ["sample_shard_", "map<id, int32>", "shard holding the row (-1 if absent)"],
    ["sample_tag_", "map<id, Tag>", "one merged tag map per key"],
    ["sample_version_ · sample_group_id_", "map<id, i64> · map<id, string>", "policy version (always 0 in RL) · group (streaming)"],
    ["sample_produced_at_", "map<id, ms>", "first production time (emplace, never updated)"],
    ["consumption_by_task_ · declared_schema_", "map<task, set<id>> · map<field, dtype>", "streaming-layer consumption · opt-in schema"],
  ], { size: 14 });
  els.push(...T.els);

  // production grid
  const gx = 1180;
  els.push(text(gx, 620, "Per-field production, e.g. after rollout + trainer", { size: 17, bold: true }));
  const fields = ["input_ids", "rm_scores", "old_log_probs", "advantages"];
  const ids = [1, 2, 3, 4];
  const have = { 1: [1, 1, 1, 1], 2: [1, 1, 1, 0], 3: [1, 1, 0, 0], 4: [1, 0, 0, 0] };
  fields.forEach((f, fi) => els.push(text(gx + 110 + fi * 165 + 75, 660, f, { size: 13, font: FONT.code, align: "center" })));
  ids.forEach((id, r) => {
    els.push(text(gx, 700 + r * 56 + 12, `id ${id}`, { size: 15, font: FONT.code }));
    fields.forEach((f, fi) => els.push(rect(gx + 110 + fi * 165, 700 + r * 56, 150, 46, { text: have[id][fi] ? "✓" : "", font: FONT.code, size: 18, bg: have[id][fi] ? C.bGreen : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false })));
  });
  els.push(note(gx, 930, 780, "scan_data_status(fields, task) returns ids produced for ALL requested fields and not yet consumed by that task. Asking for {rm_scores, old_log_probs} → ids 1, 2. A field never produced anywhere in the partition → empty. (The KV path doesn't use this — RL reads tags instead.)", { size: 15, color: C.dim }));

  // tags
  els.push(h2(0, 1110, "Tags — small metadata merged per key"));
  els.push(code(0, 1170, 760, "using TagValue = std::variant<std::string, int64_t, double, bool>;\nusing Tag      = std::unordered_map<std::string, TagValue>;\n\n// merge_tags: per name, later write wins; other names are kept\n{status:\"pending\", is_prompt:true, global_steps:5}\n  + {status:\"running\"}\n  = {status:\"running\", is_prompt:true, global_steps:5}\n\n// wire: u32 count; per entry name, u8 index (0 str,1 i64,2 f64 bits,3 bool), value", { size: 14 }));

  // serialization visuals
  els.push(h2(860, 1110, "serialize_batch — the bytes of a PUT_DATA payload"));
  const seg = [
    ["u32 count", 110, C.bGray], ["u64 id", 100, C.bOrange], ["u32 nfields", 120, C.bGray], ["u32 len · name", 150, C.bBlue], ["\"TNS1\"", 80, C.bGreen], ["i32 dtype · i32 rank", 170, C.bGreen], ["i64 dims[rank]", 140, C.bGreen], ["raw bytes (nbytes)", 200, C.bGreen],
  ];
  let sx = 860;
  for (const [t, w, col] of seg) {
    els.push(rect(sx, 1180, w, 56, { text: t, font: FONT.code, size: 12, bg: col, stroke: C.gray, sw: 1, rough: 0, round: false }));
    sx += w;
  }
  els.push(poly([{ x: 860 + 110, y: 1250 }, { x: 860 + 110, y: 1260 }, { x: sx, y: 1260 }, { x: sx, y: 1250 }], { stroke: C.orange, sw: 2 }), label(1300, 1266, "repeated per sample", { color: C.orange }));
  els.push(poly([{ x: 860 + 330, y: 1290 }, { x: 860 + 330, y: 1300 }, { x: sx, y: 1300 }, { x: sx, y: 1290 }], { stroke: C.blue, sw: 2 }), label(1420, 1306, "repeated per field (OwnTensor::save_tensor)", { color: C.blue }));
  els.push(note(860, 1340, 1100, "The buffer is pre-sized exactly (serialized_batch_size) — VectorWriteBuf throws if the estimate is wrong. Host-endian raw writes. load_tensor copies every tensor on read. \"TNS0\" encodes an invalid tensor.", { size: 15, color: C.dim }));
  els.push(text(860, 1450, "Strings ride as \"bytes tensors\": 1-D UInt8, marker 0xB7 first", { size: 17, bold: true }));
  const bt = ["0xB7", "'7'", "'2'"].map((v, i) => rect(860 + i * 80, 1490, 72, 50, { text: v, font: FONT.code, size: 15, bg: i ? C.bYellow : C.bRed, stroke: C.gray, sw: 1, rough: 0, round: false }));
  els.push(...bt);
  els.push(note(1120, 1480, 840, "bytes_tensor(\"72\") = UInt8[3]. The marker is the only check (tensor_bytes throws without it). RL sends prompt_text, ground_truth, data_source and extra_fields (JSON) this way; only the field name says it's text.", { size: 14, color: C.dim }));
  els.push(text(860, 1560, "FieldDtype (u8, 18 values): Int8…Int64, UInt8…UInt64, Bfloat16, Float16, Float32, Float64, Bool, Complex32/64/128, Float4_e2m1(_2x)", { size: 14, color: C.dim }));
  els.push(files(0, 1640, 1400, "TQ/include/transferqueue/{BatchMeta,DataPartitionStatus,StorageManager}.h · TQ/src/StorageManager.cpp (serialize_batch, bytes_tensor)"));
  return els;
}

// ======================================================================
// 3 · Wire & RPC servers
// ======================================================================
function wirePage() {
  const els = header(3, "Wire & RPC servers", "One Message type, a hand-rolled binary codec, and a ZMQ ROUTER reactor feeding four worker threads");
  els.push(h2(0, 200, "A request on the wire"));
  const fr = [
    ["identity", "added by ROUTER", C.bGray],
    ["header", "Message with an empty payload slot", C.bViolet],
    ["payload", "serialize_batch bytes (may be empty)", C.bCyan],
  ];
  fr.forEach(([t, d, col], i) => els.push(rect(i * 330, 270, 310, 90, { text: `${t}\n${d}`, font: FONT.body, size: 15, bg: col, stroke: C.dim, sw: 1.5, rough: 0.4 })));
  els.push(note(0, 380, 1000, "DEALER clients send 2 frames (header with SNDMORE, then payload); the ROUTER sees 3. Anything that isn't exactly 3 frames is dropped silently — the client just times out. Payloads ≥ 4096 bytes go out zero-copy (zmq_msg_init_data with a free callback).", { size: 15, color: C.dim }));

  // header fields strip
  els.push(text(0, 500, "Message header — fields in encode order (explicit little-endian; strings = u32 length + bytes)", { size: 17, bold: true }));
  const hf = ["u8 type", "sender_id", "receiver_id?", "request_id", "f64 timestamp", "partition_id", "sample_ids", "fields", "field_dtypes", "task_name", "u32 batch_size", "u8 flag", "u8 success", "error_message", "payload slot", "i32 shard_index", "address", "sample_shard_indices", "shard_registry_indices", "shard_registry_addresses", "sample_versions", "i64 current_version", "group_id", "i64 max_age_ms", "stranded_group_ids", "stranded_group_sizes", "stranded_group_ages_ms", "keys", "tags"];
  const kvUsed = new Set(["u8 type", "sender_id", "request_id", "partition_id", "sample_ids", "fields", "field_dtypes", "u8 flag", "u8 success", "error_message", "payload slot", "i32 shard_index", "address", "sample_shard_indices", "shard_registry_indices", "shard_registry_addresses", "keys", "tags"]);
  hf.forEach((f, i) => {
    const c = i % 10;
    const r = Math.floor(i / 10);
    els.push(rect(c * 196, 540 + r * 62, 188, 52, { text: `${i + 1}. ${f}`, font: FONT.code, size: 12, bg: kvUsed.has(f) ? C.bBlue : C.lGray, stroke: C.gray, sw: 1, rough: 0, round: false }));
  });
  els.push(label(0, 740, "blue = used by the KV path · grey = streaming / bookkeeping. request_id = 8 random hex chars; every RPC is one Message in, one Message out."));

  // server internals
  els.push(h2(0, 820, "Inside every server — RpcServerBase"));
  const cli = box(0, 920, 220, 90, "clients\n(DEALER)", "rollout");
  const rt = box(320, 900, 300, 130, "reactor thread\nzmq::poll {ROUTER, wake PULL}\n20 ms timeout", "driver", { size: 16 });
  const pool = box(740, 880, 300, 170, "ThreadPool\nkWorkerThreads = 4\ndeserialize → handle_request\n→ time into stats[type]", "driver", { size: 16 });
  const q = box(740, 1110, 300, 90, "PendingReply deque\n(mutex) + 1 wake byte", "gray", { size: 16 });
  els.push(cli, rt, pool, q);
  els.push(connect(cli, rt, { stroke: K.rollout.s, sw: 2, start: "triangle", end: "triangle", rough: 0.5 }), arrow(rt, pool, "driver"), arrow(pool, q), connect(q, rt, { stroke: C.gray, sw: 2, end: "triangle", rough: 0.5, dash: "dashed" }));
  els.push(label(250, 890, "3 frames"), label(628, 985, "enqueue_detach"), label(440, 1120, "inproc://rpc-server-wake\nreactor drains + sends"));
  els.push(card(1120, 880, 840, "Only the reactor touches the ROUTER socket; up to 4 handlers run at once per server. A handler exception becomes REQUEST_ERROR{success=false, error_message} — and isn't counted in stats. The controller's handlers then serialize on Controller::mutex_, so 4 threads mostly buy overlap with shard RPCs inside KV_CLEAR and checkpoints.", "driver"));
  els.push(card(1120, 1060, 840, "Client side — TransferQueueRpcClient(id, address, timeout 5000 ms)\nIts own zmq context + DEALER (rcvtimeo, linger 0). One outstanding request, no request_id matching, no retries. On timeout it rebuilds the socket so a late reply can't answer the next call, then throws. KVClient raises the timeout to 60 s.", "rollout"));

  // request types grid
  els.push(h2(0, 1270, "RequestType — 44 values (u8)"));
  const types = [
    ["HANDSHAKE", "both"], ["PUT_DATA", "shard"], ["GET_DATA", "shard"], ["CLEAR_DATA", "shard"], ["NOTIFY_DATA_UPDATE", "stream"], ["GET_META", "stream"], ["CLEAR_PARTITION", "ctl"], ["RESET_CONSUMPTION", "stream"], ["DECLARE_SCHEMA", "ctl"], ["GET_SHARD_ADDRESS", "ctl"], ["ADVANCE_VERSION", "stream"],
    ["FIND_STRANDED_GROUPS", "stream"], ["KV_RETRIEVE", "kv"], ["KV_UPDATE", "kv"], ["KV_LIST", "kv"], ["KV_CLEAR", "kv"], ["SAVE_CHECKPOINT", "ckpt"], ["LOAD_CHECKPOINT", "ckpt"], ["GET_STATS", "both"], ["COMMIT_LOAD_CHECKPOINT", "ckpt"], ["ABORT_LOAD_CHECKPOINT", "ckpt"],
  ];
  const tcol = { kv: [C.bBlue, "KV layer → controller"], shard: [C.bCyan, "data → shard"], ckpt: [C.bGreen, "checkpoint"], stream: [C.bGrape, "streaming layer"], ctl: [C.bViolet, "controller admin"], both: [C.bGray, "both servers"] };
  types.forEach(([t, k], i) => {
    const c = i % 7;
    const r = Math.floor(i / 7);
    els.push(rect(c * 280, 1330 + r * 66, 268, 56, { text: t, font: FONT.code, size: 13, bg: tcol[k][0], stroke: C.gray, sw: 1, rough: 0, round: false }));
  });
  Object.values(tcol).forEach(([col, n], i) => els.push(rect(i * 300, 1550, 24, 24, { bg: col, stroke: C.gray, sw: 1, rough: 0, round: false }), label(i * 300 + 34, 1553, n)));
  els.push(note(0, 1590, 1960, "Each request type has a matching _RESPONSE (HANDSHAKE → HANDSHAKE_ACK; NOTIFY_DATA_UPDATE → _ACK / _ERROR), plus REQUEST_ERROR. Unhandled types get REQUEST_ERROR \"… has no handler for request_type X\". Clients turn success=false into runtime_error(\"…server reported failure: …\").", { size: 15, color: C.dim }));
  els.push(files(0, 1680, 1400, "TQ/src/{Message,RpcServerBase,RpcClient,ControllerServer,StorageServer}.cpp"));
  return els;
}

// ======================================================================
// 4 · Put, get, list
// ======================================================================
function kvPage() {
  const els = header(4, "Put, get, list", "The KV operations RL calls, step by step — KVClient::kv_batch_put, kv_batch_get and kv_list");
  els.push(h2(0, 200, "kv_batch_put(\"train\", [\"u1_0_0\", \"u1_1_0\"], rows {X, Y}, tags {status: success})  — a worked example"));
  els.push(small(0, 250, "Fresh store, shards {0, 1}. Everything below happens under KVClient::mutex_: one request in flight per client."));
  const lanes = [
    { name: "KVClient (RolloutWorker)", k: "rollout", x: 180 },
    { name: "ControllerServer", k: "driver", x: 760 },
    { name: "shard s = registered[hash(\"u1\") % 2]", k: "data", x: 1400, w: 380 },
  ];
  sequence(els, lanes, 290, 1130, [
    { a: 0, b: 1, t: "1. KV_RETRIEVE(partition, keys, create=1)", d: "takes CheckpointGate shared; capacity check: live keys + new > max → \"TransferQueue full …\"" },
    { a: 1, b: 0, t: "sample_ids [1, 2] · shards [-1, -1] · registry {0, 1}", d: "partition created → pre-allocates id 0; the two keys get ids 1 and 2" },
    { a: 0, b: 2, t: "2. PUT_DATA(\"train\", fields [X, Y], payload {1:{X,Y}, 2:{X,Y}})", d: "both keys share prefix \"u1\" → one shard, one RPC; rows merge per field", k: "data", bold: true },
    { a: 2, b: 0, t: "PUT_DATA_RESPONSE", d: "try_put_data: never blocks (no byte cap in production)" },
    { a: 0, b: 1, t: "3. KV_UPDATE(ids [1,2], fields, dtypes, shards [s,s], tags)", d: "production_by_field_[X], [Y] += {1,2}; shard, version 0, produced_at; merge tags" },
    { a: 1, b: 0, t: "success", d: "only now can a reader see X and Y for these keys" },
  ], 470, 105);
  els.push(card(0, 1160, 900, "Later, the trainer writes advantages for u1_0_0\nKV_RETRIEVE finds id 1 with shard s → PUT_DATA with only {advantages} to shard s (merged into the existing row) → KV_UPDATE with fields [advantages]. Keys keep their shard for life.", "rollout"));
  els.push(card(940, 1160, 1020, "Tags-only put (rows empty) — status flips like {status: running}\nKV_RETRIEVE(create) → KV_UPDATE with tags and no fields. No shard is contacted, so it works even with zero shards. RL's async_kv_put is std::async around this: it frees the caller but adds no throughput.", "driver"));

  // routing
  els.push(h2(0, 1360, "Routing: which shard gets a new key?"));
  const keys = ["9f1c_0_0", "9f1c_1_0", "9f1c", "a07e_0_0", "a07e", "c3d2_3_0"];
  const sh = [0, 0, 0, 1, 1, 0];
  keys.forEach((k, i) => {
    const kb = rect(0, 1430 + i * 64, 220, 50, { text: k, font: FONT.code, size: 15, bg: "#ffffff", stroke: C.blue, sw: 1.5, rough: 0.4 });
    els.push(kb);
    els.push(text(240, 1430 + i * 64 + 14, `→ prefix "${k.split("_")[0]}"`, { size: 15, font: FONT.code, color: C.dim }));
  });
  const s0 = box(560, 1450, 200, 120, "shard 0", "data");
  const s1 = box(560, 1650, 200, 120, "shard 1", "data");
  els.push(s0, s1);
  els.push(code(820, 1430, 1140, "registered = sorted(shard registry indices)          // from the KV_RETRIEVE reply\nfor each key whose shard < 0 (no data yet):\n    shard = registered[ std::hash<string>(key.substr(0, key.find('_'))) % registered.size() ]\n// keys that already have data keep their shard; one PUT_DATA per shard per call", { size: 14 }));
  els.push(note(820, 1580, 1140, "A prompt row and all its trajectories land together. std::hash is unseeded — stable within one build only — which is fine because the choice is stored at the controller once made. If the shard count changes, only new keys route differently. (Example assignment illustrative.)", { size: 15, color: C.dim }));
  for (let i = 0; i < keys.length; i++) els.push(poly([{ x: 440, y: 1455 + i * 64 }, { x: 555, y: sh[i] ? 1710 : 1510 }], { type: "arrow", end: "triangle", stroke: K.data.s, sw: 1.2 }));

  // get & list
  els.push(h2(0, 1880, "kv_batch_get and kv_list"));
  els.push(card(0, 1940, 960, "kv_batch_get(partition, keys, select_fields)\n1. KV_RETRIEVE(create=0) — not gated, not counted against capacity\n2. one GET_DATA per shard with the deduplicated ids and select_fields (empty = all fields)\nUnknown keys are left out; a known key with no shard yet comes back as an empty Record. Nothing is marked consumed.", "rollout"));
  els.push(card(1000, 1940, 960, "kv_list(partition, filter?)\nOne KV_LIST returns every key + its tags (no tensors, hash-map order). The filter runs client-side in rl::TQClient, so each ReplayBufferAsync poll costs O(keys in the partition). RL tells prompt rows from trajectories by the tag is_prompt == true.", "replay"));
  els.push(sticky(0, 2150, 1960, "Not transactional: a put is 3 separate RPCs. A failure in between leaves keys created with no data (still counted toward capacity) or rows on a shard that the controller never marked. And because a status tag and the trajectory rows are written by different calls, a reader can see \"finished\" before the rows are visible — RL's replay buffer treats such groups as \"unsettled\".", { size: 16, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 2320, 1400, "TQ/src/KVClient.cpp · TQ/src/GroupRouter.cpp · RL/src/transfer_queue_client/TQClient.cpp"));
  return els;
}

// ======================================================================
// 5 · Clear, ids & capacity
// ======================================================================
function clearPage() {
  const els = header(5, "Clear, ids & capacity", "Where SampleIds come from, when they are reused, and the race that the release_cleared fix closed");
  els.push(h2(0, 200, "PartitionIndexManager — one allocator for all partitions"));
  // counter + free list visual
  els.push(box(0, 280, 220, 100, "next_index_\n= 9", "reward", { font: FONT.code }));
  els.push(text(260, 270, "reusable_indexes_ (FIFO deque)", { size: 16, bold: true }));
  [4, 7, 2].forEach((v, i) => els.push(rect(260 + i * 90, 305, 80, 60, { text: String(v), font: FONT.code, size: 20, bg: C.bOrange, stroke: C.orange, sw: 1.5, rough: 0.4 })));
  els.push(label(260, 375, "front ← pop          push → back"));
  els.push(code(560, 270, 760, "allocate_indexes(\"train\", 4)\n  → 4, 7, 2  (free list first, FIFO)\n  → 9        (then mint next_index_++ → 10)\n\nrelease_indexes(p, ids)   // throws if any id isn't owned,\n                          // checked before any change\nrelease_partition(p)      // frees all of p's ids\nadopt_indexes(…)          // checkpoint restore", { size: 15 }));
  els.push(card(1360, 270, 600, "Ids never shrink and there is no compaction — the u64 space doesn't run out, which is why leaking ids after a failed clear is an acceptable trade.", "reward"));

  // capacity
  els.push(h2(0, 520, "Capacity — live keys, not bytes"));
  els.push(card(0, 580, 960, "max_kv_samples_ = total_storage_size [20000]; 0 = unlimited.\nChecked only in KV_RETRIEVE(create=1): if live keys + new keys > max it throws\n\"TransferQueue full: N samples held, M new key(s) would exceed total_storage_size=X -- clear consumed groups first\".\nNo blocking, no eviction; updating existing keys still works. Live keys = Σ key_count over partitions (pre-allocated ids don't count).", "reward"));
  // gauge
  const used = 0.72;
  els.push(rect(1040, 600, 900, 60, { bg: "#ffffff", stroke: C.gray, sw: 1.5, rough: 0, round: false }));
  els.push(rect(1040, 600, 900 * used, 60, { bg: C.bOrange, stroke: C.orange, sw: 1, rough: 0, round: false }));
  els.push(rect(1040 + 900 * used, 600, 900 * 0.2, 60, { bg: C.bRed, stroke: C.red, sw: 1, rough: 0, round: false, dash: "dashed", text: "new keys", font: FONT.body, size: 14 }));
  els.push(poly([{ x: 1940, y: 585 }, { x: 1940, y: 680 }], { stroke: C.red, sw: 3 }), label(1890, 690, "max", { color: C.red }));
  els.push(label(1040, 690, "live keys held   →   a put that crosses the line fails at step 1; kv_clear makes room"));

  // kv_clear sequence
  els.push(h2(0, 800, "kv_clear(partition, keys) — after the fix"));
  const lanes = [
    { name: "KVClient", k: "rollout", x: 160 },
    { name: "ControllerServer", k: "driver", x: 700 },
    { name: "each shard holding the ids", k: "data", x: 1300 },
  ];
  sequence(els, lanes, 860, 1430, [
    { a: 0, b: 1, t: "KV_CLEAR(partition, keys)", d: "gate shared" },
    { a: 1, b: 1, t: "", d: "" },
    { a: 1, b: 2, t: "CLEAR_DATA(partition, ids)  — new client, 5 s timeout", d: "grouped by shard; whole rows dropped", k: "data", bold: true },
    { a: 2, b: 1, t: "ok  /  unreachable", d: "" },
    { a: 1, b: 0, t: "success  /  \"KV_CLEAR: could not clear …\"", d: "" },
  ], 1040, 90);
  els.push(card(830, 1060, 340, "Controller::kv_clear\nunder the mutex: unbind keys, erase production / shard / tags. Ids NOT freed yet.", "driver", { size: 14 }));
  els.push(card(1500, 1180, 460, "release_cleared(partition, ids)\nonly if every shard succeeded → the ids go back on the free list. Otherwise they stay out of circulation for good (a deliberate leak).", "reward", { size: 15 }));

  // race before/after
  els.push(h2(0, 1500, "The race it fixed  (commit bc15fd9, \"Bug 2\" in GRPO_1P5B_REPORT.md)"));
  const tl = (y, rows, title, col) => {
    els.push(text(0, y, title, { size: 18, bold: true, color: col }));
    ["clear", "put"].forEach((lane, i) => els.push(text(0, y + 50 + i * 70 + 14, lane, { size: 15, bold: true })));
    rows.forEach(([lane, x, w, t, c]) => {
      els.push(rect(200 + x, y + 50 + (lane === "clear" ? 0 : 70), w, 54, { text: t, font: FONT.body, size: 13, bg: c, stroke: C.dim, sw: 1, rough: 0.4 }));
    });
    els.push(harrow(200, 1500, y + 190, { stroke: C.dim, sw: 1.5 }));
    els.push(label(1460, y + 196, "time"));
  };
  tl(1560, [
    ["clear", 0, 300, "kv_clear: free id 17 at once", C.bOrange],
    ["put", 330, 300, "concurrent put gets id 17", C.bBlue],
    ["put", 650, 260, "PUT_DATA new row → id 17", C.bBlue],
    ["clear", 930, 380, "CLEAR_DATA id 17 lands — wipes the new row", C.bRed],
  ], "Before: release first", C.red);
  tl(1810, [
    ["clear", 0, 300, "kv_clear: unbind id 17", C.bOrange],
    ["clear", 330, 300, "CLEAR_DATA id 17 on the shard", C.bCyan],
    ["clear", 660, 300, "release_cleared → id 17 free", C.bGreen],
    ["put", 990, 320, "the next put may now reuse 17 safely", C.bBlue],
  ], "After: release only once the shard row is gone", C.green);
  els.push(note(1540, 1560, 420, "Symptom: \"finished groups are missing DAPO metric 'reward'\" — or, because shard puts merge, a row holding a mix of two trajectories.", { size: 15, color: C.dim }));
  els.push(sticky(1540, 1800, 420, "Still unfixed: CLEAR_PARTITION calls release_partition (Controller.cpp:250) BEFORE clear_on_shards — the same reuse race. RL doesn't use it during training.", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 2060, 1400, "TQ/src/{PartitionIndexManager,Controller}.cpp (kv_retrieve, kv_clear, release_cleared, clear_partition) · TQ/src/ControllerServer.cpp (clear_on_shards)"));
  return els;
}

// ======================================================================
// 6 · Storage shards
// ======================================================================
function storagePage() {
  const els = header(6, "Storage shards", "StorageServer + SimpleStorageManager: in-memory rows, merged field by field");
  els.push(h2(0, 200, "rows_ : partition → id → Record (field → tensor)"));
  const parts = [["\"train\"", [[1, ["prompts", "responses", "rm_scores", "advantages"]], [2, ["prompts", "responses", "rm_scores"]], [5, ["prompt_token_ids", "prompt_text"]]]], ["\"val\"", [[9, ["prompts"]]]]];
  let py = 270;
  for (const [p, rows] of parts) {
    els.push(box(0, py, 180, 70, p, "driver", { font: FONT.code, size: 16 }));
    rows.forEach(([id, fs], ri) => {
      const y = py + ri * 80;
      els.push(rect(240, y, 100, 60, { text: `id ${id}`, font: FONT.code, size: 15, bg: C.bOrange, stroke: C.orange, sw: 1.5, rough: 0.4 }));
      fs.forEach((f, fi) => els.push(rect(370 + fi * 200, y, 190, 60, { text: f, font: FONT.code, size: 13, bg: C.bCyan, stroke: C.teal, sw: 1, rough: 0.4 })));
    });
    py += rows.length * 80 + 30;
  }
  els.push(note(0, py + 10, 1200, "One mutex + a condition variable per shard. Data is in memory only (plus checkpoint files). A Record is an unordered_map<string, OwnTensor::Tensor>. There's no device handling: save_tensor copies GPU tensors to CPU.", { size: 15, color: C.dim }));

  // ops
  const T = table(1260, 270, [{ w: 200, code: true }, { w: 500 }], [
    ["request", "what the shard does"],
    ["PUT_DATA", "try_put_data: merge each listed field into the row; never blocks. No schema check."],
    ["GET_DATA", "the requested fields (empty = whole row); missing ids skipped"],
    ["CLEAR_DATA", "erase whole rows, drop empty partitions, notify_all"],
    ["SAVE / LOAD / COMMIT / ABORT", "checkpoint file and staged load (page 7)"],
    ["GET_STATS", "{bytes, rows, capacity_bytes} + request counters"],
  ], { size: 14 });
  els.push(...T.els);

  // merge + accounting
  els.push(h2(0, 760, "Merge per field, and net-byte accounting"));
  const before = ["prompts 1 KB", "responses 2 KB"];
  const inc = ["responses 3 KB", "advantages 2 KB"];
  const after = ["prompts 1 KB", "responses 3 KB", "advantages 2 KB"];
  const row = (x, y, list, col, t) => {
    els.push(text(x, y - 34, t, { size: 16, bold: true }));
    list.forEach((f, i) => els.push(rect(x, y + i * 62, 230, 52, { text: f, font: FONT.code, size: 14, bg: col, stroke: C.gray, sw: 1, rough: 0.4 })));
  };
  row(0, 840, before, C.bCyan, "row 7 before");
  row(330, 840, inc, C.bYellow, "incoming PUT_DATA");
  row(660, 840, after, C.bGreen, "row 7 after");
  els.push(text(270, 880, "+", { size: 34, bold: true }), text(600, 880, "=", { size: 34, bold: true }));
  els.push(code(980, 820, 980, "net new bytes = Σ over (id, field)  max(0, new.nbytes − existing.nbytes)\n              = max(0, 3 − 2) + max(0, 2 − 0) = 3 KB      // not 5 KB\n\nif capacity_bytes > 0:\n    net > capacity            → invalid_argument (\"can never fit, even empty\")\n    current + net > capacity  → try_put_data returns false → \"storage full …\"\nelse:                           // capacity_bytes = 0 — what RL and the binary use\n    always fits", { size: 14 }));
  els.push(card(980, 1090, 980, "The net-bytes rule came from commit 72bc934 (\"fixed_storage\"); before it, overwriting a field counted its full size again. Servers always call the non-blocking try_put_data, so a full shard can't park one of its 4 worker threads (regression-tested).", "data"));
  els.push(sticky(0, 1100, 900, "No byte cap in production: SimpleStorageManager() defaults to capacity_bytes = 0 in both TQStorageActor and storage_server_main. The only limit is the controller's key count, so a shard can grow until the process runs out of memory.", { size: 16, font: FONT.body, bg: C.bRed }));
  els.push(files(0, 1300, 1400, "TQ/src/{StorageManager,StorageServer}.cpp"));
  return els;
}

// ======================================================================
// 7 · Checkpoints
// ======================================================================
function ckptPage() {
  const els = header(7, "Checkpoints", "save_checkpoint / load_checkpoint: one controller file, one file per shard, and an all-or-nothing load");
  els.push(h2(0, 200, "CheckpointGate — who waits for whom"));
  const ex = box(0, 280, 320, 100, "exclusive\nSAVE / LOAD (whole run)", "trainer", { size: 17 });
  const sh = box(420, 260, 520, 140, "shared\nKV_UPDATE · KV_CLEAR · CLEAR_PARTITION\nNOTIFY_DATA_UPDATE · KV_RETRIEVE(create=1)", "rollout", { size: 16 });
  const no = box(1040, 260, 420, 140, "not gated\nKV_RETRIEVE(create=0) · KV_LIST · GET_META\nshard PUT_DATA / GET_DATA", "gray", { size: 16 });
  els.push(ex, sh, no);
  els.push(note(1500, 260, 460, "Writer-preferring: once a save is waiting, new shared holders queue behind it. Shard PUT_DATA isn't gated, so a row written mid-save can appear in a shard file without metadata — checkpoint_inspect calls these \"harmless orphan rows\".", { size: 15, color: C.dim }));

  els.push(h2(0, 470, "SAVE_CHECKPOINT(dir)"));
  const sv = [
    box(0, 540, 260, 90, "create_directories(dir)", "gray", { size: 16 }),
    box(320, 540, 360, 90, "controller.tqck\nwrite .tmp → rename", "driver", { size: 16 }),
    box(740, 540, 420, 90, "SAVE_CHECKPOINT → each shard\nshard-<i>.tqsh (30 min timeout)", "data", { size: 16 }),
  ];
  els.push(...sv, arrow(sv[0], sv[1]), arrow(sv[1], sv[2]));
  els.push(card(1220, 540, 740, "Client side: KVClient builds a temporary RpcClient with a 1 h timeout (kCheckpointTimeoutMs). Not saved: consumption state, group ids, produced_at (reset at load), declared schema, streaming-layer samples.", "trainer", { size: 15 }));

  // load sequence
  els.push(h2(0, 700, "LOAD_CHECKPOINT(dir) — stage everywhere, then commit"));
  const lanes = [
    { name: "ControllerServer", k: "driver", x: 200 },
    { name: "shard 0", k: "data", x: 760 },
    { name: "shard 1", k: "data", x: 1260 },
  ];
  sequence(els, lanes, 760, 1280, [
    { a: 0, b: 0, t: "", d: "" },
    { a: 0, b: 1, t: "LOAD_CHECKPOINT(shard-0.tqsh) → prepare_load", d: "parse into staged_, live rows untouched", k: "data" },
    { a: 0, b: 2, t: "LOAD_CHECKPOINT(shard-1.tqsh) → prepare_load", d: "if any shard fails: ABORT_LOAD_CHECKPOINT to the staged ones, throw \"… nothing loaded\"", k: "data" },
    { a: 0, b: 2, t: "COMMIT_LOAD_CHECKPOINT → swap rows_ and current_bytes_", d: "sent to every shard", k: "trainer", bold: true },
    { a: 0, b: 0, t: "", d: "" },
  ], 940, 100);
  els.push(card(260, 860, 420, "1. parse_kv_checkpoint — magic, format, every shard listed. 2. deployed shard set must EQUAL the saved one, else \"nothing loaded\". Controller state untouched so far.", "driver", { size: 14 }));
  els.push(card(260, 1300, 700, "3. apply_kv_checkpoint — drop all partitions, set the version, adopt_indexes for every restored id BEFORE re-creating partitions (so the new pre-allocated id can't collide), rebind keys, re-mark production, merge tags.", "driver", { size: 14 }));
  els.push(sticky(1400, 1300, 560, "Known gap (ponytail comment): a shard that dies between stage and commit stays stale while the others commit. Headers are host-endian.", { size: 15, font: FONT.body, bg: C.bRed }));

  els.push(h2(0, 1500, "File formats"));
  els.push(code(0, 1560, 960, "controller.tqck   (format 2)\n\"TQCK\" | u32 format | i64 current_version\n       | u32 n_shards | i32 shard_idx[n]  (sorted)\n       | u32 n_records\n       | repeat: u64 len + Message(KV_UPDATE, sender \"checkpoint\")\n// one record per (partition, produced-field set):\n// keys, sample_ids, fields, tags, shard indices, versions", { size: 14 }));
  els.push(code(1000, 1560, 960, "shard-<i>.tqsh   (format 1)\n\"TQSH\" | u32 format | u32 n_partitions\n       | repeat: u32 id_len, id, u64 len,\n                 serialize_batch(rows of that partition)\n// serialized under the lock, written outside it,\n// .tmp then rename\n\ncheckpoint_inspect <dir>  — read-only dump + consistency check", { size: 14 }));
  els.push(files(0, 1800, 1400, "TQ/src/Controller.cpp (save/parse/apply_kv_checkpoint) · TQ/src/ControllerServer.cpp (CheckpointGate) · TQ/src/StorageManager.cpp · TQ/tools/checkpoint_inspect_main.cpp"));
  return els;
}

// ======================================================================
// 8 · Streaming layer
// ======================================================================
function streamPage() {
  const els = header(8, "Streaming layer", "The original TransferQueue model — consumption-tracked GET_META and samplers. Still compiled and tested; RL never calls it.");
  els.push(h2(0, 200, "Produce → notify → select & consume"));
  const p = [
    box(0, 280, 300, 100, "producer\nPUT_DATA → shard GroupRouter(world)", "rollout", { size: 16 }),
    box(380, 280, 340, 100, "NOTIFY_DATA_UPDATE\nids, fields, shard, group_id", "replay", { size: 16 }),
    box(800, 280, 360, 100, "update_production_status\nstamps current_version_", "driver", { size: 16 }),
    box(1240, 280, 340, 100, "GET_META(fields, task, n)\nselect_and_consume", "replay", { size: 16 }),
    box(1660, 280, 300, 100, "consumer\nGET_DATA from the shards", "rollout", { size: 16 }),
  ];
  els.push(...p);
  for (let i = 0; i < 4; i++) els.push(arrow(p[i], p[i + 1], "replay"));
  els.push(code(0, 430, 1100, "select_and_consume(partition, fields, task, sampler, batch_size):   // under the controller mutex\n    ready  = scan_data_status(fields, task)    // produced for all fields, not consumed by task\n    groups = group_id of each ready id\n    chosen = sampler.sample(ready, groups, batch_size)\n    mark_consumed(task, chosen)                // per task_name; RESET_CONSUMPTION clears", { size: 14 }));
  els.push(card(1160, 430, 800, "Controller GET_META returns metadata only (ids, their shards, the shard registry, versions) — data comes from GET_DATA. The legacy colocated TransferQueueServer returns data inline instead, and has no KV ops. Quirk: TransferQueueRpcClient::get() against a ControllerServer throws \"truncated\" on the empty payload.", "replay", { size: 15 }));

  // samplers
  els.push(h2(0, 650, "Samplers — GRPOGroupNSampler, n = 4, batch_size = 8"));
  const groups = [["g-a", 4], ["g-b", 4], ["g-c", 2], ["g-d", 3]];
  groups.forEach(([g, n], gi) => {
    const y = 720 + gi * 74;
    els.push(text(0, y + 14, g, { size: 17, font: FONT.code, bold: true }));
    for (let j = 0; j < 4; j++) els.push(rect(90 + j * 70, y, 60, 54, { text: j < n ? "✓" : "…", font: FONT.code, size: 18, bg: j < n ? (n === 4 ? C.bGreen : C.bYellow) : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(text(400, y + 14, n === 4 ? "complete → selected" : `${n}/4 ready → waits`, { size: 16, color: n === 4 ? C.green : C.orange, bold: true }));
  });
  els.push(note(0, 1020, 760, "Sorts ids, buckets them by non-empty group_id (lexicographic group order), takes the first n of each complete group. Needs batch_size / n = 2 complete groups here — if it can't find them all it returns nothing (all-or-nothing). Throws if n = 0 or batch_size % n ≠ 0.", { size: 15, color: C.dim }));
  els.push(card(860, 720, 1100, "FifoSampler — the one always installed on ControllerServer\nTakes the first min(batch_size, n) ids in the order given. That order is unordered_set iteration order, so it is not FIFO in insertion order.", "gray", { size: 15 }));
  els.push(card(860, 880, 1100, "find_stranded(max_age_ms) — GRPOGroupNSampler only\nGroups with an empty id or fewer than n members whose oldest produced_at is at least max_age_ms old → StrandedGroup{group_id, ids, oldest_age_ms}. FifoSampler returns none.", "gray", { size: 15 }));
  els.push(card(860, 1040, 1100, "Versions\ncurrent_version_ starts at 0 and only ADVANCE_VERSION bumps it; every production update is stamped with it. RL never advances it, so all RL samples are version 0 — staleness lives in RL's global_steps tags instead.", "driver", { size: 15 }));
  els.push(card(0, 1200, 1960, "Why RL doesn't use this layer: verl v1 moved to the KV API, and BluTrain's ReplayBufferAsync re-implements verl's staleness/DAPO eviction and oldest-first sampling on top of kv_list. The Makefile notes that the RankAwareSampler was removed (\"Phase 4\") in favour of write-time routing by GroupRouter.", "replay"));
  els.push(files(0, 1340, 1400, "TQ/src/{Sampler,GRPOGroupNSampler,GroupRouter,Server}.cpp · TQ/tests/test_pipeline_correctness.cpp · test_distributed_n_to_m_smoke.cpp"));
  return els;
}

// ======================================================================
// 9 · Metrics, tests & caveats
// ======================================================================
function miscPage() {
  const els = header(9, "Metrics, tests & caveats", "Observability, what the 16 test suites cover, measured numbers, and the known gaps");
  els.push(h2(0, 200, "Prometheus — served by the controller"));
  const T = table(0, 260, [{ w: 520, code: true }, { w: 120 }, { w: 380 }], [
    ["metric", "type", "value"],
    ["tq_samples · tq_capacity_samples", "gauge", "live keys · max_kv_samples"],
    ["tq_partition_samples{partition}", "gauge", "live keys per partition"],
    ["tq_policy_version · tq_shards_registered", "gauge", "current version · registry size"],
    ["tq_requests_total{server, type}", "counter", "requests per RequestType"],
    ["tq_request_seconds_total{server, type}", "counter", "handler seconds per type"],
    ["tq_shard_up{shard}", "gauge", "1 if GET_STATS answered"],
    ["tq_shard_bytes · _rows · _capacity_bytes{shard}", "gauge", "shard stats"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(card(1080, 260, 880, "MetricsHttpServer\nRaw POSIX socket, HTTP/1.0, one connection at a time, polls every 200 ms. Answers any path with text/plain; version=0.0.4 (500 on a render error). Each scrape synchronously sends GET_STATS to every shard with a 2 s timeout. Enabled by transfer_queue.metrics.enabled [true].", "gray"));
  els.push(card(1080, 470, 880, "Logging: none. The library never writes to stderr; binaries print only their address. Errors are exceptions on the client or REQUEST_ERROR / success=false on the wire.", "gray"));

  els.push(h2(0, 650, "Tests"));
  const TT = table(0, 710, [{ w: 300 }, { w: 640 }], [
    ["suite (≈ CHECKs)", "covers"],
    ["Controller [104]", "lifecycle, schema, versions, registry, KV binding, tags, release_cleared, thread safety"],
    ["Message [92]", "round trip of every RequestType with boundary values"],
    ["DataPartitionStatus [77] · KVClient [70]", "production/consumption · full verl v1 lifecycle, capacity across partitions, timeouts"],
    ["GRPOGroupNSampler [67] · StorageManager [66]", "group contamination fix · byte deltas, backpressure, deadlock fix"],
    ["Checkpoint [31]", "3 partitions × 120 groups × 5 rows, 8 dtypes, byte-for-byte; corruption leaves the store intact"],
    ["Server, RpcClient, ControllerServer, StorageServer, …", "malformed frames, disconnects, latency regression, no schema check on shards"],
    ["integration", "pipeline correctness · MPI N-rollout → M-trainer smoke"],
  ], { size: 14 });
  els.push(...TT.els);

  els.push(h2(1080, 650, "Measured, through Ray (benchmark report, 10-19)"));
  els.push(...bars(1100, 760, 420, 200, 0, 160, [
    { v: 80.5, top: "80.5 ms", label: "avg", color: C.bBlue },
    { v: 145.6, top: "145.6 ms", label: "max", color: C.bOrange },
  ]));
  els.push(label(1100, 1000, "status tag → visible to a poller\n(150 ms poll interval)"));
  els.push(note(1560, 760, 400, "• 1–64 MB single-key writes: 322–542 MB/s, none rejected (no byte cap)\n• cap 5, 16 concurrent clients: exactly 5 succeed, 27 rejected\n• 200 rows settled in 0.051 s (~3925 rows/s): 16 replicas, 16 workers, 4 shards", { size: 15, color: C.dim }));

  els.push(h2(0, 1130, "Caveats"));
  const cav = [
    ["Partition clear race", "CLEAR_PARTITION frees ids before clearing shards (unfixed; unused in training).", "sync"],
    ["No byte cap", "Shards are unbounded in production; only the key count is limited.", "sync"],
    ["Not transactional", "A put is 3 RPCs; failures leave orphan keys or rows. No retries anywhere.", "sync"],
    ["Single copy, in memory", "No replication or restart, though the requirements doc asks for both.", "sync"],
    ["One request per client", "KVClient serializes everything on one mutex; a fresh ZMQ context per RpcClient.", "gray"],
    ["Controller ceiling", "4 workers + one global mutex, blocking shard RPCs in clears — unmeasured at scale.", "gray"],
    ["kv_list is O(keys)", "Every replay-buffer poll fetches the whole partition and filters client-side.", "gray"],
    ["Stale shard cache", "KVClient keeps a shard's old address if it re-registers elsewhere.", "gray"],
  ];
  cav.forEach(([t, d, k], i) => els.push(card((i % 4) * 490, 1190 + Math.floor(i / 4) * 150, 470, `${t}\n${d}`, k, { size: 15 })));
  els.push(note(0, 1500, 1960, "Docs vs code: TQ/README.md is empty; docs cited in comments are missing; RL/STATUS.md notes the `vv` branch pins the submodule at f52f57b — before the checkpoint (d4a3b85), net-bytes (72bc934) and release_cleared (bc15fd9) fixes.", { size: 15, color: C.gray, italic: true }));
  els.push(files(0, 1580, 1400, "TQ/src/{ControllerServer,MetricsHttpServer}.cpp · TQ/tests/ · RL/docs/TRANSFER_QUEUE_REQUIREMENTS.md · RL/docs/GRPO_1P5B_REPORT.md"));
  return els;
}

write([overview, buildPage, dataPage, wirePage, kvPage, clearPage, storagePage, ckptPage, streamPage, miscPage], process.argv[2]);
