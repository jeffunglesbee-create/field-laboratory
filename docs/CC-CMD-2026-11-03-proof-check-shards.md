# Claude Code Command — the proof checks are the gate's longest path once the mutation suite is sharded; one batched compile replaces 133 serial ones

**Branch:** main — commit directly, do not create a feature branch or PR
**Repo:** field-laboratory
**Filed:** 2026-11-03, as the follow-up `docs/CC-CMD-2026-11-03-gate-speed.md` names ("the proof checks (776 s, now once) ... are the next-longest path and are named, not changed") and Rule 87.4 requires. The file keeps its filed name (`...-shards`) because other documents link to it; the design it describes is below.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands. Changes the command behind the gate row `doc claims are compiler-verified, not prose`; the row's name, weight and command line are unchanged.
**Status:** **DONE 2026-11-03.** Task 0 ran and CHANGED THE DESIGN (below): one batched compile, not shards. Built, swept (38 deliberate breakages), reviewed twice (92 agents), scored: `verify-full` run 41680758770 on tree `8b1ee44`, 530/530, the proof row 15 s against 729 to 760 s, the gate step 354 s against 975 to 1869 s, the run 7 min 5 s against 19 to 33 min. Landed on main by fast-forward; the landing commit, its `verify` and `deploy` runs are in `outbox/cc-session-2026-11-03-proof-check-batch.md`. Evidence per done condition: (1) `--self-test` 24/24, run in `verify-full` as the pre-gate step "The proof-doc checker can still tell a rejected violation from an accepted one" (step 10 of the `full` job, success); (2) the gate's row ran `node scripts/proof-check.mjs` and scored; locally 141/141, `133 of 133 case(s) confirmed from their own lines in ONE compile`; (3) and (4) `outbox/proof-check-sweeps-2026-11-03.txt`; (5) the ledger line `8b1ee4425697-7c985ab97947`. Corrections to the premises of the filing, found by running them: 133 cases, not 134 (a prose mention counted by grep); a case does not cost a compile (type errors in separate functions do not hide each other, measured) but a parse error does hide the rest (measured), so a parse-class case cannot be batched; the first batch saw 67 of 133 because the compiler stops at 100 errors.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
```

## Why this exists, measured

With the mutation suite in eight shards, what is left on the critical path of `verify-full` is `scripts/proof-check.mjs`, and it is on it twice.

| fact | value | where it was read |
|---|---|---|
| proof cases | **133** (`<!-- proof: FSxxxx -->` followed by an ```fsharp block, in `docs/*-PROOF.md`; the largest document has 24). The filed figure of 134 was `grep -h "<!-- proof:" docs/*PROOF*.md \| wc -l`, which also counts the prose mention at `docs/ODDS-PROOF.md:290`; the script's own parser never counted it | Task 0, the parser run over every document |
| cost of the gate row `doc claims are compiler-verified, not prose` | unsharded gates: 733, 776 and 743 s of 6228, 6513 and 6153 s; sharded gates: 760, 729, 750 and 747 s of 830, 1075, 1869 and 975 s | `rowSeconds` and the gate seconds in `docs/confidence-log.jsonl` |
| what a case cost | one `dotnet build src/Laboratory.fsproj` per case, 5.8 s on the CI runner (776 s / 133), strictly in series in the ONE real tree | `scripts/proof-check.mjs` before this change |
| where it also ran | the mutation `seal-goes-public` expects the same row, so the shard that holds it paid the baseline AND the mutation: 31 min watch, 39 min reference against 3 to 18 for the other seven | `mutation-equivalence` run 41585094592 |

## TASK 0 RESULT — the filed design (shards) is superseded

The filed design was `--shard i/N` over a CI matrix, merged like the mutation shards. Task 0 probed the premise it rests on, that a case costs a compile, and the premise is false for type errors: the F# compiler keeps type-checking after an error in one function and an error in one function does not hide the next. So every case can be injected as its own `__proofN` function in ONE build, and each error attributed to the case whose lines it falls in.

| premise | the command that could refute it | result |
|---|---|---|
| one build can carry all 133 cases | inject all, `dotnet build`, count attributed errors | refuted at first: **67 of 133**, the build ended at "100 Error(s)" |
| ... because of the compiler's default error cap | rerun with `-p:OtherFlags=--maxerrors:5000` | **133 of 133** attributed with the stated code, 217 errors, 14.5 s, 0 errors outside every case's lines |
| a case in a batch sees the same errors it sees alone | the old method, one build per case, recording each case's SET of codes, in a throwaway copy | **identical for 133 of 133**; the stated code present 133 of 133 both ways; 6 cases carry more than one code (`outbox/proof-check-sweeps-2026-11-03.txt`, `outbox/proof-check-oracle-2026-11-03.json`) |
| the fsproj sets no `OtherFlags` that the property would replace | `grep OtherFlags src/Laboratory.fsproj` | none; only `WarningsAsErrors` (FS0025) |
| a parse error in one case does not hide the next case | an unclosed expression in one injected function, an ordinary `1 + "a"` in the next | **refuted**: only FS0058, FS0010, FS3156 and FS3118 came back, FS0001 never did. A parse-class case cannot be batched (below) |

Sharding 133 cases over N runners would have cost N runner start-ups, N checkouts, N builds and a merge to save at most the same time, so it is not built.

## Rulings and prior work this must not undo (BUILD-ON-A)

- `docs/CC-CMD-2026-11-03-gate-speed.md`: nothing in the mutation shards, `mutation-await`, `mutation-merge` or `GATE_MUTATION_SHARDS` changes. The mutation `seal-goes-public` is untouched and still turns the row red (swept: live sweep L10, exit 1, 2 failing).
- `proof-check.mjs`'s own rules, each written after an incident, all kept: the injected marker and the state directory (`active.json`, the `.bak` files), `check:clean-source` before anything runs, the heal of a killed run, no second run while one is injected, `--only` and its Rule 91 coverage line, the registry-completeness phase.
- A passing proof case is a failing check: the rejection must carry the stated error code. **A real case passes only when the BATCH confirms it** (the stated code inside its own lines). Every case it does not confirm is also compiled alone, by the old method with its predicate unchanged, but only to say WHY: a case that fails alone is a real failure, and a case that passes alone but was not confirmed means the batch is blind to it, which fails the run too. There is no quiet fallback to serial speed: the first version let those cases pass alone, and with the error cap at its default it went green after 1030 s with nothing red (live sweep, 2026-11-03).
- No gate row's name or weight changes, and `scripts/confidence.mjs`'s scoring and ledger are untouched.

## Scope

**Touched:** `scripts/proof-check.mjs`, this file, `docs/GATE-TIMING.md`, three comments that quoted the old cost (`scripts/mutation-await.mjs`, `scripts/mutation-check.mjs`, `.github/workflows/verify-full.yml`), `outbox/`.
**Not touched:** any gate row's weight or name, `docs/gate-rows.txt`, the content of any `docs/*PROOF*.md` case, `src/`, any mutation entry's `find`/`replace`/`expect`, any workflow step. The row's command is still `node scripts/proof-check.mjs`, and the pre-gate step still runs `--self-test`.

## What changed in `scripts/proof-check.mjs`

1. `layout` injects every case in one block above the anchor and returns each case's 1-based line range. It slices at the anchor instead of `String.replace`, whose replacement string expands `$&` and `` $' `` in a case body.
2. `build` takes extra arguments; the batch passes `-p:OtherFlags=--maxerrors:N` (`--max-errors N`, default 5000, 23 times what 133 cases produce).
3. `parseErrors` and `attribute` place each `Scoreboard.fs(L,C): error FSxxxx` in a case's range; the stated code in the case's own lines confirms it. The file name is matched exactly, not by suffix.
4. `decideAlone` is the old method, its predicate unchanged, for every case the batch did not confirm: it explains a failure, and it is the whole verdict for the controls.
5. TWO CONTROLS run in every run (Rule 90): a case that compiles cleanly and a case rejected with a code other than the one it claims. Each must fail FOR ITS OWN REASON, and each probes the batch's attribution: the clean one must have no error placed in its lines, the wrong-code one must have some.
6. A batch that reports no error at all (the wrong-code control guarantees some) is repeated once, visibly (`2 TRIES` in the printed line); two empty batches in a row fail a check that shows the output's tail.
7. Checks that every `error FS` mention in the output was placed in some case's lines, and a printed line with the denominators: cases confirmed of cases, which ones were not, controls, mentions, placed, strays.
8. `--out FILE` writes what each case was decided by and whether it PASSED; a failing write is a failing check. `--out`, `--max-errors` and `--only` refuse an empty value, a bare trailing flag and the `--flag=value` form with exit 2 (the old `--only` ran the full suite for all three, silently).
9. `--self-test` grew from 7 to 24 clauses, on strings: layout arithmetic, inclusive range edges, neighbour attribution, stray reporting, error parsing, the file-name match.

## DONE CONDITION — every line an artifact (Rule 89)

1. `node scripts/proof-check.mjs --self-test` prints `24/24 checks passed`: in `verify-full` (the pre-gate step) and locally. `verify` does not run this script; its only link is `check:clean-source`.
2. `node scripts/proof-check.mjs` prints `proof batch: 133 of 133 case(s) confirmed from their own lines in ONE compile`, `controls: 2 compiled alone, as designed`, `141/141 checks passed`, exit 0; the output of the scored gate's row is kept in `outbox/`.
3. The Rule 90 sweeps are kept in `outbox/proof-check-sweeps-2026-11-03.txt`: every pure clause broken in a copy and `--self-test` red (18 of 18); every live clause broken in a copy and the full run red, or green where that is the design (L13, N1, N3b), recorded as such.
4. The old method run over all 133 cases records each case's set of codes; the batch's per-case sets are compared to it: identical for 133 of 133 (`outbox/proof-check-sweeps-2026-11-03.txt`).
5. One scored `verify-full` on the landing tree: 530/530, its ledger line on the branch, and the row's seconds against the 729 to 776 s above.
6. `verify` green on the landing commit (a regression guard for everything else; it does not exercise this script).

**What this does not prove:** that the 133 cases are the right 133 (that is the proof documents' business); that a proof case whose stated error is a PARSE error can be batched. It cannot (measured above): the batch sees nothing, the run fails with 133 "the batch cannot see this case" lines and the dead-batch check names the output's tail, and such a case needs the batch taught about it deliberately, not a quiet fallback; that the CI runner's per-compile cost matches this container's (84 s here for the whole run, 12 to 16 s per failing compile here against 5.8 s measured on the runner: the CI figure is the scored gate's `rowSeconds`).

## TASK — Outbox manifest (last)

`outbox/cc-session-2026-11-03-proof-check-batch.md`: commit hashes, the run ids, the before and after seconds of the row and of the gate, both reviews, both sweeps, the adjacent findings. Mark this CC-CMD DONE with the run ids.
