# Session record — verify-full.yml is read for GATE_MUTATION_SHARDS (review 7, C3 (e))

Date 2026-11-05. Scope: `scripts/sharded-row-check.mjs` (`gateShardsSet`, two clauses), six table entries
in `scripts/mutation-check.mjs`. Part of C3; the runtime check of the exempt scripts is the next record.

## Reproduction, run first
In a scratch copy, the line `GATE_MUTATION_SHARDS: '8'` deleted from `.github/workflows/verify-full.yml`:
`node scripts/workflow-check.mjs` 10/10, `node scripts/sharded-row-check.mjs --self-test` 13/13,
`node scripts/row-confidence.mjs` 2/2, all exit 0. CI would then run the mutation suite in-process in the
gate row again, which is the cost the sharding exists to avoid. The skeptic's ruling holds and is not
rebuilt: the eight earlier commits never touched `verify-full.yml` and nothing pinned the variable before,
so this is not a regression and it costs a timeout, not a wrong score.

## Which of the skeptic's two options
Read both. The exemption table's sanction text for `mutation-await.mjs` says "verify-full sets
GATE_MUTATION_SHARDS". Rewording it to "describes the workflow, not checks it" would make the sentence
honest and leave the sanction exactly as unprovable as before; reading the workflow makes it true. Built
the read, in `sharded-row-check.mjs`, because that script already owns the row's CI branch and runs in
`check:mutation-parts` on CI.

## Built
- `gateShardsSet(text)`: the workflow sets the variable on exactly one step, to a positive integer, and that
  step runs `npm run gate`. Not a YAML parser; steps are cut at six spaces and a dash.
- Two clauses: 11 stand-in workflows (3 that set it: quoted, unquoted, with a trailing comment; 8 that do
  not: unset, a comment, empty, zero, text, a suffix, the wrong step, two steps) and the real file.
- Six entries: the line removed, the value emptied, zero accepted, a suffix accepted, the step not required,
  two holders allowed.

## Red evidence
By hand, 8 mutants against `--self-test`: 5 caught at once; 3 survived and were investigated. The comment
filter I had written was redundant (a name after a `#` is not at the start of a line) and was removed;
the two-steps case failed for a different reason (its first step ran the build) and was rebuilt with two
steps that both run the gate; the third (reading a stand-in instead of the real file) is superseded by the
entry that deletes the line from the real file. Through the harness: the six entries printed `PASS` and
`7/7 checks passed`.

## Not verified
- The value is not compared with the number of shard jobs in the workflow (`mutation shard i of 8`). A
  mismatch would make the wait run its 40 minutes and fail. Not part of this finding.
