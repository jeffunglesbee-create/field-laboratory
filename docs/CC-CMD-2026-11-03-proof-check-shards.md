# Claude Code Command — the proof checks are the gate's longest path once the mutation suite is sharded; shard them the same way

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, as the follow-up `docs/CC-CMD-2026-11-03-gate-speed.md` names ("the proof checks (776 s, now once) ... are the next-longest path and are named, not changed") and Rule 87.4 requires.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Changes the gate's `doc claims are compiler-verified, not prose` row and the workflow that runs it, so the scored run is on the NEW topology.
**Status:** **FILED.** Resolved against the tree that carries `docs/CC-CMD-2026-11-03-gate-speed.md`; Task 0 re-probes every line. Not started: it waits for that CC-CMD to land, because both change `verify-full.yml` and the gate's rows.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## Why this exists, measured

With the mutation suite in eight shards, what is left on the critical path of `verify-full` is `scripts/proof-check.mjs`, and it is on it twice.

| fact | value | where it was read |
|---|---|---|
| proof cases | 134 (`<!-- proof: FSxxxx -->` blocks in `docs/*PROOF*.md`; the largest document has 24) | `grep -h "<!-- proof:" docs/*PROOF*.md \| wc -l` |
| cost of the gate row `doc claims are compiler-verified, not prose` | 743 s of a 6153 s gate (run 41576121384); 776 s earlier | `rowSeconds` in `docs/confidence-log.jsonl` |
| what a case costs | one `dotnet build src/Laboratory.fsproj` per case, about 5.8 s, strictly in series in the ONE real tree (it injects `let private __proofN` into `src/Scoreboard.fs`, builds, restores) | `scripts/proof-check.mjs` lines 37 to 100, 305 to 360 |
| where it also runs | the mutation `seal-goes-public` expects the same row, so the shard that holds it pays the baseline (776 s) and the mutation (776 s): 31 min watch, 39 min reference against 3 to 18 for the other seven | `mutation-equivalence` run 41585094592, jobs `mutation shard 8 of 8` and `reference shard 8 of 8` |
| the one existing lever | `--only <substring>` restricts the run to documents whose filename matches | `scripts/proof-check.mjs` line 113 |

After the mutation suite is sharded, the longest path of the gate is the proof row (about 13 min, in the `full` job) and the shard that holds `seal-goes-public` (about 30 min).

## Rulings and prior work this must not undo (BUILD-ON-A)

- `docs/CC-CMD-2026-11-03-gate-speed.md`: the shard matrix, the composite action `.github/actions/mutation-shard`, `mutation-await.mjs` and `mutation-merge.mjs` are the pattern; extend them, do not build a second mechanism. Its merge refuses a shard set that is not exactly the table; this one must refuse a case set that is not exactly the 134.
- `proof-check.mjs`'s own rules, each written after an incident: the injected marker and the state directory (`active.json`, the `.bak` files), `check:clean-source` before anything runs, the heal of a killed run, no second run while one is injected. A shard runs in its own checkout, so none of them may be weakened to make that easier.
- A passing proof case is a failing check: the rejection must carry the stated error code.
- No gate row's name or weight changes, and `scripts/confidence.mjs`'s scoring and ledger are untouched.

## Scope

**Touch:** `scripts/proof-check.mjs` (`--shard i/N`, `--list-cases`, `--out`), a NEW `scripts/proof-merge.mjs` (or the same merge script generalised, whichever Task 0 finds smaller), `scripts/gate-checks.mjs` (the proof row only), `.github/workflows/verify-full.yml`, `package.json`, `.github/workflows/verify.yml` (self-tests), `docs/GATE-TIMING.md`, `outbox/`.
**Do NOT touch:** any gate row's weight or name, `docs/gate-rows.txt`, the content of any `docs/*PROOF*.md` case, `src/`, any mutation entry's `find`/`replace`/`expect`.

## TASK 0 — Probe block (run first; write nothing until it prints)

```bash
git log --oneline -5
grep -h "<!-- proof:" docs/*PROOF*.md | wc -l
node -e "const r=require('fs').readFileSync('docs/confidence-log.jsonl','utf8').trim().split('\n').slice(-3).map(l=>JSON.parse(l)); for (const x of r) console.log(x.id, x.rowSeconds['doc claims are compiler-verified, not prose'])"
grep -n "const TARGET\|const REGISTRY\|STATE_DIR\|--only" scripts/proof-check.mjs | head
```

## TASK 1 — Shards of the case list (local)

`proof-check.mjs --shard i/N` runs the cases at positions `i-1, i-1+N, ...` of the document-ordered list, `--list-cases` prints them as JSON, `--out` writes `{sha, shard, cases: [{doc, code, rejected: bool, reportedCode}]}`. A shard injects into ITS checkout's `src/Scoreboard.fs` only. Self-test with a must-fail input per clause: a case that compiles must fail; the wrong error code must fail; a shard split that drops or repeats a case must fail.

## TASK 2 — Merge, workflow, gate row

The merge refuses unless the shards are exactly the 134 cases of this commit, all of this commit, each rejected with its stated code. `verify-full.yml` runs the shards as a matrix next to the mutation shards; the proof row of the gate reads them back through the same await. `GATE_PROOF_SHARDS` unset keeps the row exactly as it is. The shard that holds the mutation `seal-goes-public` is the open question for Task 0: its expectation is the whole row, so either that mutation's expectation reads the shards too (then it is no longer a `find`/`replace`/`expect` that this CC-CMD may touch, and the ruling has to be asked for), or the shard keeps paying 2 x the sharded cost, which is still about 4 minutes instead of 26.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/proof-check.mjs --self-test` and the merge's self-test print their denominators and pass, in `verify`.
2. A run of the shards on CI prints `134 of 134 cases across N shards, 0 accepted, 0 wrong code` and the merge refuses a set with one shard removed (output kept in `outbox/`).
3. One scored `verify-full` on the new topology: 530/530, its ledger line on the branch, and the wall-clock against the figure in `docs/GATE-TIMING.md` after `docs/CC-CMD-2026-11-03-gate-speed.md`.
4. `verify` green on the landing commit.

**What this does not prove:** that the 134 cases are the right 134 (that is the proof documents' business); that `dotnet build` in N parallel checkouts on one runner is faster than N runners (Task 0 decides one or the other from the runner's core count, measured, not assumed).

## TASK 3 — Outbox manifest (last)

`outbox/cc-session-<date>-proof-check-shards.md`: commit hashes, the run ids, the before and after seconds of the row and of the gate. Mark this CC-CMD DONE with the run ids.
