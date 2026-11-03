# Claude Code Command — the proof checks are the gate's longest path once the mutation suite is sharded; one batched compile replaces 133 serial ones

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, as the follow-up `docs/CC-CMD-2026-11-03-gate-speed.md` names ("the proof checks (776 s, now once) ... are the next-longest path and are named, not changed") and Rule 87.4 requires.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Changes the command behind the gate row `doc claims are compiler-verified, not prose`; the row's name, weight and command line are unchanged.
**Status:** **IN PROGRESS 2026-11-03.** Task 0 ran and CHANGED THE DESIGN (below). Built; waiting on the review, the scored gate and the landing.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## Why this exists, measured

With the mutation suite in eight shards, what is left on the critical path of `verify-full` is `scripts/proof-check.mjs`, and it is on it twice.

| fact | value | where it was read |
|---|---|---|
| proof cases | **133** (`<!-- proof: FSxxxx -->` blocks followed by an ```fsharp block in `docs/*-PROOF.md`; the largest document has 24). The filed figure of 134 was `grep -h "<!-- proof:" docs/*PROOF*.md \| wc -l`, which also counts the prose mention at `docs/ODDS-PROOF.md:290`; the script's own parser never counted it | Task 0, parser run over every document |
| cost of the gate row `doc claims are compiler-verified, not prose` | 729 to 776 s of a 1075 to 1869 s gate | `rowSeconds` in `docs/confidence-log.jsonl` |
| what a case cost | one `dotnet build src/Laboratory.fsproj` per case, about 5.8 s, strictly in series in the ONE real tree | `scripts/proof-check.mjs` before this change |
| where it also ran | the mutation `seal-goes-public` expects the same row, so the shard that holds it paid the baseline AND the mutation: 31 min watch, 39 min reference against 3 to 18 for the other seven | `mutation-equivalence` run 41585094592 |

## TASK 0 RESULT — the filed design (shards) is superseded

The filed design was `--shard i/N` over a CI matrix, merged like the mutation shards. Task 0 probed the premise it rests on, that a case costs a compile, and the premise is false: the F# compiler does not stop at one function's first error and does not let one function's error hide another's. So every case can be injected as its own `__proofN` function in ONE build and each error attributed to the case whose lines it falls in.

| premise | the command that could refute it | result |
|---|---|---|
| one build can carry all 133 cases | inject all, `dotnet build`, count attributed errors | refuted at first: **67 of 133**, build ended at "100 Error(s)" |
| ... because of the compiler's default error cap | rerun with `-p:OtherFlags=--maxerrors:5000` | **133 of 133** attributed with the stated code, 217 errors, 14.5 s, 0 errors outside every case's lines, 0 wrong-code-only |
| a case in a batch sees the same errors it sees alone | the old method, one build per case, recording each case's SET of codes, in a throwaway copy | see the oracle line in `outbox/cc-session-2026-11-03-proof-check-batch.md` |
| the fsproj sets no `OtherFlags` that the property would replace | `grep OtherFlags src/Laboratory.fsproj` | none; only `WarningsAsErrors` (FS0025) |

One compile of 14.5 s replaces 776 s. Sharding 133 cases over N runners would have cost N runner start-ups, N checkouts, N builds and a merge to save at most the same time, so it is not built.

## Rulings and prior work this must not undo (BUILD-ON-A)

- `docs/CC-CMD-2026-11-03-gate-speed.md`: nothing in the mutation shards, `mutation-await`, `mutation-merge` or `GATE_MUTATION_SHARDS` changes. The mutation `seal-goes-public` is untouched and still expects the row to go red.
- `proof-check.mjs`'s own rules, each written after an incident, all kept: the injected marker and the state directory (`active.json`, the `.bak` files), `check:clean-source` before anything runs, the heal of a killed run, no second run while one is injected, `--only` and its Rule 91 coverage line, the registry-completeness phase.
- A passing proof case is a failing check: the rejection must carry the stated error code. A batch can only CONFIRM a case, from the case's own lines. Every case it does not confirm is compiled alone, by the old method, and that compile decides, so the batch can speed up a pass and cannot turn a failure into one.
- No gate row's name or weight changes, and `scripts/confidence.mjs`'s scoring and ledger are untouched.

## Scope

**Touched:** `scripts/proof-check.mjs`, `docs/CC-CMD-2026-11-03-proof-check-shards.md` (this file), `docs/GATE-TIMING.md`, `outbox/`.
**Not touched:** any gate row's weight or name, `docs/gate-rows.txt`, the content of any `docs/*PROOF*.md` case, `src/`, any mutation entry's `find`/`replace`/`expect`, any workflow. No workflow needed changing: the row's command is still `node scripts/proof-check.mjs`, and the pre-gate step still runs `--self-test`.

## What changed in `scripts/proof-check.mjs`

1. `layout` injects every case in one block above the anchor and returns each case's 1-based line range. It slices at the anchor instead of `String.replace`, whose replacement string expands `$&` and `` $' `` in a case body.
2. `build` takes extra arguments; the batch passes `-p:OtherFlags=--maxerrors:N` (`--max-errors N`, default 5000, 23 times what 133 cases produce).
3. `parseErrors` and `attribute` place each `Scoreboard.fs(L,C): error FSxxxx` in a case's range; the stated code in the case's own lines confirms it.
4. `decideAlone` is the old method, unchanged in predicate (`rejected && the stated code appears`), for every case the batch did not confirm.
5. TWO CONTROLS run in every run (Rule 90): a case that compiles cleanly and a case rejected with a code other than the one it claims. Both must come out as failures; either one accepted fails the run.
6. A check that no batch error fell outside every case's lines, and a printed line with the denominators: cases, controls, confirmed, compiled alone, error lines reported, placed, strays.
7. `--out FILE` writes what each case was decided by; `--max-errors` and `--out` refuse an empty value with exit 2.
8. `--self-test` grew from 7 to 23 clauses, on strings: layout arithmetic, inclusive range edges, neighbour attribution, stray reporting, error parsing.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/proof-check.mjs --self-test` prints `23/23 checks passed`, in `verify` (`check:proof`).
2. `node scripts/proof-check.mjs` prints `133 case(s) + 2 control(s) in ONE compile ... 133 confirmed from their own lines, 2 compiled alone`, `139/139 checks passed`, exit 0; the output is kept in `outbox/`.
3. The Rule 90 sweeps are kept in `outbox/`: every pure clause broken in a copy and `--self-test` red; every live clause broken in a copy and the full run red (or green-and-degraded where that is the design, recorded as such).
4. The old method run over all 133 cases records each case's set of codes; the batch's per-case sets are compared to it, case by case, and the result is kept (`outbox/`).
5. One scored `verify-full` on the landing tree: 530/530, its ledger line on the branch, and the row's seconds against the 729 to 776 s above.
6. `verify` green on the landing commit.

**What this does not prove:** that the 133 cases are the right 133 (that is the proof documents' business); that a future case whose expected error is a PARSE error can be batched (a parse error stops type-checking of the whole file, so every case would be compiled alone: correct, and back to serial speed, and visible in the printed counts).

## TASK — Outbox manifest (last)

`outbox/cc-session-2026-11-03-proof-check-batch.md`: commit hashes, the run ids, the before and after seconds of the row and of the gate, the oracle comparison, both sweeps. Mark this CC-CMD DONE with the run ids.
