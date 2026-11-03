# Claude Code Command — the gate's mutation row: incremental compiles, then parallel shards

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, on the owner's instruction ("Go 1 and 2"), after `docs/GATE-TIMING.md`'s two named designs were measured against the gate as it is now.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. This changes the gate itself, so the scored run is on the NEW topology and its ledger line is on the branch.
**Status:** **IN PROGRESS** (2026-11-03). Resolved against HEAD `14e48ad`; Task 0 re-probes every line. Tasks 1 to 4 are built on branch `gate-speed` (harness `fcfb108`, shards and row `e7098be`); the whole-table equivalence run and the scored gate are Task 5; this line becomes DONE with their run ids.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## Why this exists, measured

The last four ledger lines (`docs/confidence-log.jsonl`) put the row "breaking each invariant makes a check fail" at 4003, 5008, 5445 and 5688 seconds
of a 4624, 5769, 6228 and 6513 second gate: **87% of the run**. The next row is "doc claims are compiler-verified": 776 s, 12%, and `verify-full.yml` runs the same
`check:proof` once more before the gate (the workflow's own comment: "run twice here"). Everything else is under a minute.

`scripts/mutation-check.mjs` has 235 selected mutations (`outbox/mutation-baseline-latest.json`: `from_mutations 235`, 71 distinct expectations). 139 of the 211 that name a file
target `src/`, and each pays a whole-project compile (`npm run build`: 25.5 s in Fable's own report, 34.5 s wall) before its expectation runs, strictly in series, on one runner.

`docs/GATE-TIMING.md` (2026-08-12) named the two designs that follow, measured on 35 mutations and an 11-minute gate. It did not build them: "the synchronisation must be exact".
Both are built here, in the order that makes the second one sound.

## What was measured before filing (Rule 100: each premise had one command try to refute it)

| premise | result | command |
|---|---|---|
| a watched, incremental compile is the same compile as the full one | **true only with `-c Release`.** Fable's default in watch mode is Debug: 53 of 53 files differ from the full compile (a lambda is inlined in one and bound to names in the other). With `-c Release`, every file is byte-identical to the full compile, for the clean tree AND for a real mutation (`brief-flip-not-a-button`), except `fable_modules/project_cracked.json`, which carries paths | `dotnet fable watch src/Laboratory.fsproj -c Release --outDir X` against `dotnet fable src/Laboratory.fsproj --outDir Y`, digest over every file but that one |
| an incremental compile is about 3 s | 2.8 to 3.1 s (mutate), 2.8 to 3.0 s (restore), against 34.5 s | timed on 4 cores |
| the end of a compile is the line "Fable compilation finished" | **false.** On a type error the line still prints, and the error lines arrive AFTER it (2 ms later in the measurement). The cycle ends at `Watching src` | a mutation that does not type-check, output read line by line |
| restoring the file restores the build | true, byte-exactly (digest equals the clean digest), including after a failed compile | same experiment |
| two quick writes of one file make two compiles | one (200 ms debounce) | two writes 5 ms apart |
| every mutation's expectation runs on a clean build | **false.** `needsRebuild` is true only for `src/` and `index.html`, and the file is restored but the build is not. 94 of the 94 mutations that do not rebuild (`scripts/`, `.github/`, three world mutations) run on whatever build the previous source mutation left | `grep` of the harness and the order of the table: `SSSSSSSSSSSSSSNSSS...` |

The last row matters for both tasks. A mutation of a script whose expectation reads `build/` is "caught" if it fails, and it fails if EITHER its own mutation OR the leftover compiled mutation of the
mutation before it broke the check. Today's verdicts are therefore order-dependent, and a sharded run reorders them. The harness must make the build clean before every mutation, which is also what makes the watch driver safe:
a stale build between mutations can then only be a CLEAN build, so the failure it can produce is a survivor (loud), never a false catch (silent).

## Rulings and prior work this must not undo (BUILD-ON-A)

- `docs/GATE-TIMING.md`: the two designs and the stdout-synchronised watch driver it asks for are the spec; its numbers are stale and are superseded in Task 6.
- `scripts/mutation-check.mjs`'s own rules, each written after an incident: backups outside `src/` and durable (`.mutation-state`), the marker and `heal()`; a mutation that did not apply is broken, never "caught"; `--only` that selects nothing exits 2; only a FULL run owns the baseline artifact; the baseline runs EVERY distinct expectation (`.every` short-circuited once); the module has no `export` (it runs at module scope). New pure code goes in a new importable module.
- `docs/gate-rows.txt` and `scripts/gate-checks.mjs`: the gate is a conjunction of declared rows; the score comes from exit codes; a row cannot be dropped. The row "breaking each invariant makes a check fail" stays one row, with the same weight (20) and the same three halves.
- `docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md` (DONE): the baseline and record steps stay as they are, and the ledger line is still written once by the scorer.
- A scheduled `verify-full` run scores out of 520, not 530 (the outbox row is not applicable): the new topology changes nothing about that.

## Scope

**Touch:** `scripts/mutation-check.mjs` (the build driver, the clean-build invariant, `--shard`, `--ids`, `--list-ids`, `--out`, `--build`, per-mutation records), a NEW `scripts/mutation-lib.mjs` (pure: the Fable cycle parser,
the digest, the shard split), a NEW `scripts/mutation-merge.mjs` (the aggregator), a NEW `scripts/mutation-compare.mjs` (the equivalence report), `scripts/gate-checks.mjs` (the mutation row only), `.github/workflows/verify-full.yml`,
a NEW `.github/workflows/mutation-equivalence.yml`, `package.json`, `.github/workflows/verify.yml` (self-test steps), `docs/GATE-TIMING.md`, `outbox/`.
**Do NOT touch:** any gate row's weight or name, `docs/gate-rows.txt`, `scripts/confidence.mjs`'s scoring or ledger, any mutation entry's `find`/`replace`/`expect`, `src/`.

## TASK 0 — Probe block (run first; write nothing until it prints)

```bash
git log --oneline -5
dotnet fable --version; dotnet fable --help | grep -A1 -e "-c|--configuration" 
node -e "const m=require('fs').readFileSync('scripts/mutation-check.mjs','utf8'); console.log('needsRebuild line:', m.split('\n').findIndex(l=>l.includes('const needsRebuild'))+1)"
node scripts/mutation-check.mjs --anchors | tail -1
python3 -c "import json; d=json.load(open('outbox/mutation-baseline-latest.json')); print(d['from_mutations'], d['ran'])"
```

## TASK 1 — The pure module and the build driver (local, no CI)

`scripts/mutation-lib.mjs`: `parseCycles(lines)` (a state machine over Fable's output: `Started Fable compilation...` opens a cycle, `Watching src` closes it, any `error FSHARP|FABLE` line inside it
marks it failed), `digestDir(dir)` (sha-256 over every file but `project_cracked.json`, paths included), `shardOf(ids, i, n)` (stable, round-robin by position, every id in exactly one shard).
Self-test with the real lines recorded in Task 0's experiment as fixtures and a must-fail input per clause: a "finished" line without its cycle end is not the end; an error after "finished" fails the cycle; a second `Started` inside the settle window extends it;
a shard split that drops or repeats an id fails.

`scripts/mutation-check.mjs --build watch|full` (default `watch`): `watch` spawns `dotnet fable watch src/Laboratory.fsproj -c Release --outDir build`, assembles `public/` with `build-site.mjs` after every cycle, and records the digest of the initial compile.
`full` is the reference: `npm run build` after every source mutation and again after its restore. **In both modes the build is made clean and its digest compared to the clean digest before every mutation**; a mismatch aborts the run with exit 1 and names the mutation.
The initial compile's digest is also compared to the digest of the `build/` that existed when the run started (a full compile): Fable, its configuration or its cache drifting is caught on every run, in a second.
Per-mutation records `{id, file, kind, verdict, expect, buildMs, expectMs, digestChanged}` go to `--out`.

## TASK 2 — Prove the driver can fail, then prove it equals the reference (local)

- **Stale build, must fail:** `MUTATION_FAULT=skip-restore-wait` makes the driver restore the file and NOT wait for the cycle. The next mutation's pre-check must see a digest that is not clean and the run must exit 1 naming it. The same fault under `--build full` must be a no-op (a full build has no cycle to skip), so the fault test cannot pass vacuously.
- **A mutation that does not compile** is reported `compiler`, as today, and the build returns to clean.
- **Equality on a subset, locally:** twelve mutations chosen to cover an early src file, a late one, `index.html`, a compile-refused one, an output-neutral one, a world one and `scripts/` ones that follow `src/` ones: identical per-mutation verdicts and identical compiled digests under `--build full` and `--build watch`.

## TASK 3 — Sharding and the aggregator

`--shard i/N` runs the entries at positions `i-1, i-1+N, ...` of `selected`, `--ids a,b,c` an explicit list, `--list-ids` prints the selected ids as JSON and exits (reads, runs nothing, like `--anchors`).
A shard writes `--out outbox/mutation-shard-<i>-of-<N>.json` carrying `sha`, `mode`, the ids it was given, its records and its own baseline (the distinct expectations of ITS mutations, run unmutated first). A shard does not write the baseline artifact.

`scripts/mutation-merge.mjs <dir> [--of N]`: refuses unless exactly N shard files are present for `N` shards, every one carries the current `HEAD` sha, the union of their ids is `--list-ids` EXACTLY (no id missing, none twice), no baseline failure, no survivor.
It prints the denominator (`235 of 235 mutations across 8 shards, 0 survived, 0 not applicable`) and writes `outbox/mutation-baseline-latest.json` in today's schema plus the shards' wall time. Self-test: a missing shard, a repeated id, an id from nowhere, a sha from another commit and a survivor each exit 1.

## TASK 4 — The workflow topology

`verify-full.yml`: a matrix job `shard` (N = 8) builds, starts the server, runs `mutation-check.mjs --shard i/8 --build watch` and uploads `mutation-shard-i-of-8` with `if: always()`.
The existing job `full` is NOT made to wait for them: it starts at once. Its mutation row (`gate-checks.mjs`, only when `GATE_MUTATION_SHARDS=<dir>` is set; unset, the row is exactly today's three commands) runs
`--self-test`, then `scripts/mutation-await.mjs` (polls this run's artifacts through the Actions API, up to 40 minutes, downloads them, FAILS LOUDLY if a shard never uploads, naming it), then `mutation-merge.mjs`, then `--only known-survivor` must fail.
The pre-gate step `Proof-doc claims are compiler-verified` loses its duplicated suite: the gate's proof row runs `node scripts/proof-check.mjs`, the step ran `check:proof` (`proof-check.mjs --self-test && proof-check.mjs`). The row reports the same failure, and 13 minutes are not an early warning. **Corrected while building (Rule 100 miss, one command would have shown it):** the self-test half is in no gate row and runs nowhere else in CI, so the step stays as `proof-check.mjs --self-test` (0.06 s) and only the suite half is dropped.

## TASK 5 — Equivalence on the whole table, then the scored run

`mutation-equivalence.yml` (trigger file or dispatch; no schedule) runs the 8 shards under `--build full` and under `--build watch` on one tree and `mutation-compare.mjs` writes `outbox/mutation-equivalence-latest.json`: for each of the 235, both verdicts and, for each source mutation, both compiled digests.
Then ONE `verify-full` dispatch on the new topology, scored. Both are read, not assumed.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/mutation-lib.mjs --self-test` and `node scripts/mutation-merge.mjs --self-test` print their denominators and pass, and run in `verify`.
2. The stale-build must-fail (Task 2) is printed: exit 1 naming the mutation under `watch`, and the same fault a no-op under `full`.
3. `outbox/mutation-equivalence-latest.json`: **235 of 235 compared, 0 verdicts differing, and for every one of the 139 source mutations the watch digest equal to the full digest.** Any difference is listed by id and resolved in the outbox, not averaged away.
4. The legacy finding is answered with a number: how many of the 94 non-rebuild mutations are caught under today's leftover-build order and survive on a clean build (expected 0; each one found is an undefended claim the old order was hiding, named, and fixed or recorded).
5. One scored `verify-full` run on the new topology: 530/530 (a session dispatch), its ledger line on the branch, `Record this measurement` green, and the wall-clock printed against 6228 and 6513 s. The row's seconds in the ledger are the aggregator's; the shards' wall time is in the baseline artifact.
6. `verify` green on the landing commit, `docs/GATE-TIMING.md` carrying the new measurements, run ids in the outbox.

**What this does not prove:** that no mutation anywhere is order-dependent for a reason other than the build (a mutation of a shared file another expectation also reads is isolated only by running in a shard of its own); that 8 shards fit the repository's concurrent-job allowance when other workflows run (the scored run records whether any shard waited to start);
that the proof checks (776 s, now once) cannot also be sharded. They are the next-longest path and are named, not changed.

## TASK 6 — Outbox manifest (last)

`outbox/cc-session-<date>-gate-speed.md`: commit hashes, the equivalence artifact, the stale-build output, the legacy finding, the scored run id and its ledger run id, the measured wall-clock and runner-minutes before and after. Mark this CC-CMD DONE with the run ids.
