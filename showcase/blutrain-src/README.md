# BluTrain showcases: generators

Five drawings, read from `/home/blubridge-029/RLVR-main/RL/BluTrain/RL` and `/home/blubridge-029/RLVR-main/RL/verl-main`
on 2026-11-04/05. Each output is byte-for-byte reproducible.

```bash
node gen-blutrain.cjs ../blutrain-rl-showcase.sketchboard.json        # the async GRPO trainer
node gen-tq.cjs ../blu-transferqueue-showcase.sketchboard.json        # the Blu-TransferQueue submodule
node gen-rv.cjs ../blutrain-reward-verifiers-showcase.sketchboard.json [mathDrawingId]   # every BluTrain verifier
node gen-mv.cjs ../math-verifier-showcase.sketchboard.json [verifiersDrawingId]           # the math verifier in depth
node gen-verl.cjs ../verl-reward-verifiers-showcase.sketchboard.json  # verl's reward verifiers (beginner-friendly)
```

Then import a file in sketchboard (Home → Open file…).

The content is written by hand from the source, not extracted, so re-check it against the code when BluTrain
changes. `kit.cjs` holds what both scripts share — component palette, boxes and cards, tables, line plots, bar
charts, free polylines, and `pagesKit` (page ids, navigation header, link-checking writer) — on top of
`../atlas-src/lib.cjs`.

## BluTrain RL, explained — pages

| Page | Covers |
| --- | --- |
| 0 · Overview | Architecture diagram, the loop in seven steps, GPU topology, control vs data plane, headline results |
| 1 · Launch & config | Build and run, `main()`, `RLDriver::init()` order, parser invariants, the important knobs |
| 2 · Prompts & TransferQueue | PromptDataset, TQ controller/shards, put path, row lifecycle, row contract |
| 3 · Rollout | Manager → workers → sessions → load balancer → replicas, settle countdown, engines, paged KV |
| 4 · Rewards | `agent_loop_postprocess`, every verifier, strict gsm8k examples, the math verifier pipeline |
| 5 · Replay buffer | The sample/evict/refill loop, eviction reasons, staleness timeline, DAPO filter |
| 6 · Advantage & loss | GRPO/Dr.GRPO advantage with a worked example, the fused loss kernel, clip/KL plots, aggregation |
| 7 · Trainer | Models, `build_batch` causal-shift frame, the three RPCs, the `update_actor` loop, LR schedule |
| 8 · Weight sync | The 8-step protocol as a sequence diagram, dtype/size buckets, double buffering, NCCL groups |
| 9 · One step, end to end | Swimlane timeline of a global step, the exact calls, the batch arithmetic |
| 10 · Metrics, results & caveats | MetricsAggregator rules, metric families, checkpoints, offline eval, results, caveats |

## Blu-TransferQueue, explained — pages

| Page | Covers |
| --- | --- |
| 0 · Overview | Controller / shards / clients architecture, a put in three RPCs, the two API layers, throughput |
| 1 · Build & startup | Makefile lanes, binaries, the Ray startup + HANDSHAKE sequence, config |
| 2 · Data model | Keys, global ids, DataPartitionStatus, per-field production, tags, serialize_batch bytes, bytes tensors |
| 3 · Wire & RPC servers | ZMQ frames, the Message header, reactor + 4 workers, the 44 RequestTypes |
| 4 · Put, get, list | kv_batch_put sequence with a worked example, routing by uid prefix, get and list |
| 5 · Clear, ids & capacity | Id allocator and free list, key-count capacity, kv_clear, the release_cleared race before/after |
| 6 · Storage shards | rows_ layout, per-field merge, net-byte accounting, no byte cap |
| 7 · Checkpoints | CheckpointGate, save, two-phase load, file formats |
| 8 · Streaming layer | GET_META, samplers, versions — compiled but unused by RL |
| 9 · Metrics, tests & caveats | Prometheus metrics, test suites, measured numbers, known gaps |

## Math verifier, explained — pages

Every example's method and score was checked against `math_verifier_cli` built from the source as fixed on 11-05 (12:20); the overview lists what those fixes changed.

| Page | Covers |
| --- | --- |
| 0 · Overview | The score() pipeline as a flowchart with every outcome label, where it runs, headline false-reward risks |
| 1 · Extraction | Pre-processing, the six strategies in priority order with examples, ground truth, edge cases |
| 2 · Normalization | The seven steps, before → after table, replacement groups, the 26 unit words |
| 3 · Structure | Naming-lhs stripping, shape_of checks in order, shape comparison, ± expansion |
| 4 · Relations & expressions | Operator table, dispatch, proportional equations, ratio and % rules, multiple choice |
| 5 · Lexer & parser | Token kinds, grammar ladder, a parse tree, math-verify semantics, guards |
| 6 · Comparison | The sym_equal ladder, rtol examples, the 5 fixed probe points and a probing plot |
| 7 · Methods & examples | Method labels and 24 traced cases |
| 8 · Parity with math-verify | Harness, reported and on-disk numbers, deliberate divergences |
| 9 · Bugs, limits & files | Reproduced false rewards, operational gaps, performance, files |

## verl reward verifiers, explained — pages

Written for beginners: every page opens with an "In plain words" note. Examples for gsm8k, math_reward, math_dapo
and search_r1 were run against the scorer files; the others are traced from code or quoted from verl's tests.

| Page | Covers |
| --- | --- |
| 0 · Overview | What a verifier is, the manager → dispatcher → scorer layers, a glossary |
| 1 · Rewards 101 | GRPO with 4 tries and their advantages, last-token rewards, rule vs model rewards, a dataset row |
| 2 · The dispatcher | data_source → scorer routing, how results are normalized |
| 3–9 · Scorers | gsm8k, MATH (lm-eval), DAPO math, PRIME math, code execution (prime_code / SandboxFusion), Geometry3K, Search-R1, math-verify, RLLA tool calls |
| 10 · Reward managers | run_single, naive / dapo / gdpo / remote / rate_limited, the DAPO overlong penalty, reward models |
| 11 · One batch, end to end | Swimlane from finished rollout to advantages, tensor shapes |
| 12 · Config & custom rewards | reward.* keys and defaults, writing your own reward function |
| 13 · Cheat sheet & gotchas | Every scorer's score values on one number line, timeouts, known bugs |

## BluTrain reward verifiers, explained — pages

| Page | Covers |
| --- | --- |
| 0 · Overview | Architecture at a glance, a guide to every page, the 7 verifier types in one table |
| 1 · Architecture | Layers, the Verifier interface, RewardTypes, class map |
| 2 · One rollout, end to end | Swimlane from tokens to the TQ row and rollout log; the decoded-EOS issue |
| 3 · Reward loop & registry | RewardLoopWorker (pool, watchdog, errors), VerifierRegistry, tests |
| 4 · Config & wiring | reward: keys, run configs per type, DAPO filter and advantage use |
| 5 · gsm8k | strict / flexible, differences from verl, examples |
| 6 · exact_match & short_response | Whole-string match; the 800-byte pipeline test |
| 7 · math | Summary + links into "Math verifier, explained" |
| 8–10 · IFEval | Scoring, all 54 rules, the NLTK / langdetect / PyStr ports |
| 11 · Scaffolding | Stubs, unused pieces, the designed next architecture |
| 12 · Dependencies & build | Per-verifier dependency graph, Makefile placement, tests |
| 13 · Bugs & gotchas | B1–B16 |

### Links between drawings

`gen-rv.cjs` page 7 links into the math drawing (`sketchboard:p/<id>/mv-<n>`), and every page of
`gen-mv.cjs` links back (`sketchboard:p/<id>/rv-7`). Drawing ids are per sketchboard instance: after
importing both into another instance, regenerate with the new ids as the second argument and re-import.
The defaults are the ids in the dev instance these were built in. `kit.cjs` skips these links when it
checks links, since it can't see other drawings.

Page ids are `bt-0` … `bt-10`, `tq-0` … `tq-9`, `mv-0` … `mv-9`, `vr-0` … `vr-13` and `rv-0` … `rv-13`. Every page has ⌂ Overview · ← previous · next → buttons, and the overview's
boxes link to the page that explains them. The script stops with an error if an internal link misses.
