# `mutation-check --only <id>` refuses an id that matches nothing

Found 2026-10-19, in `outbox/cc-session-2026-10-19-scheduled-outbox-row.md`,
where it was recorded as a gap and left. Picked up 2026-10-20 as the
30-minute task.

## The defect, measured

An insert of four mutation records failed. Running `--only <id>` for each of
the four then printed:

```
baseline: ran 0 of 0 distinct expectation(s) from 0 mutation(s), 0 failing
PASS  the unmutated tree passes every expectation
```

and exited 0. Four mutations that did not exist were reported green. This is
the harness's own Rule 90 failure from the other side: not "NOT CAUGHT with
nothing mutated", but "PASS with nothing selected".

A second shape had the same effect and is now closed. `--only` as the last
argument leaves `ONLY` undefined, which is falsy, so the run fell through to
the FULL suite while the caller believed they had asked for one mutation.

## The change

`scripts/mutation-check.mjs`, one block after `const selected`: if `--only`
is present and either no id was given or the id selects nothing, print which
and exit **2**. Exit 2 is distinct from 1 (a mutation survived), so a caller
can tell "no such mutation" from "the claim is undefended". The block sits
before `heal()`, the signal handlers and the baseline, so it touches nothing.

`--only known-survivor`, which the gate runs after the full suite and expects
to exit 1, is unchanged: measured exit 1.

## Verified

| invocation | before | now |
|---|---|---|
| `--only no-such-mutation-id` | exit 0, `0 of 0`, PASS | exit 2, names the id |
| `--only` (no value) | the FULL suite | exit 2, "no id given" |
| `--only --self-test` | the FULL suite | exit 2 |
| `--only known-survivor` | exit 1 | exit 1 |
| `--only outbox-na-beyond-schedule` | caught | caught |

**Mutation, caught:** `only-selects-nothing-passes` replaces the condition with
`false`. The record's expectation is `bash -c '! node scripts/mutation-check.mjs
--only no-such-mutation-id'`, inverted like `harness-blind`: it passes only
while the harness refuses. With the refusal removed the nested run exits 0 and
the record would survive. Measured: caught. The harness's own `--self-test`
is 6/6 and the working tree is restored after the run.

## Not covered, said here

- **The "no id given" branch is covered only by the same record**, because it
  shares the condition. Making `!ONLY` alone vanish would leave the
  `selected.length === 0` half and the record still catches nothing for that
  half. The two shapes are probed by hand above, not by a separate record.
- **A typo that happens to match a real id** is a different mutation and runs
  as one. That cannot be told from intent.
