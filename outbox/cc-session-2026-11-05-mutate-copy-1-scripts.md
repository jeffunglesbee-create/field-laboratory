# Session record — the seven mutate-*.mjs break a copy (residuals Task 2, commit 1 of 2)

Date 2026-11-05. Scope: `scripts/mutate-claim-check.mjs`, `mutate-deploy-gate.mjs`,
`mutate-deploy-landed.mjs`, `mutate-odds-coverage.mjs`, `mutate-odds-shape-census.mjs`,
`mutate-run-steps.mjs`, `mutate-replay-odds-coverage.mjs`, the new
`scripts/mutate-copy-check.mjs`, `package.json` (`check:mutate-copy`) and one
`verify.yml` step (`docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 2; the
owner chose run-on-a-copy). The table entries are the second commit.

## Premise commands, run first (Rule 100)
- `NODE_OPTIONS="--require slow.cjs" node scripts/mutate-odds-coverage.mjs`, killed
  with SIGKILL 4.5 s in (inside the first mutation window): `git status --short`
  printed ` M scripts/odds-coverage.mjs`; a rerun printed `NOTE — ... has uncommitted
  changes` then `FAIL — ... --self-test is already red on clean source.` and left the
  file mutated.
- the same for `mutate-replay-odds-coverage.mjs`: ` M scripts/replay-odds-coverage.mjs`
  plus untracked `scripts/replay-odds-coverage.mjs.mutbak`; the rerun printed `FAIL —
  an UNMUTATED copy at the mutant location is red`, deleted the backup and left the
  mutation.
- baseline of the seven in place: all rc=0; `11 of 11`, `4 of 4`, `5 of 5`, `19 of 19`,
  `8 of 8`, `7 of 7`, `7 of 7` caught (61 mutations).

## Built
- Each script copies `scripts/` to `mkdtempSync(tmpdir())`, writes the mutation to
  the copy, runs the self-test on the copy from the repo root, and never writes the
  tracked file. The two-line `git diff --quiet` NOTE is gone (it would be untrue).
  The six that had no positive control print and enforce one; replay's gained the
  printed line. The `.mutbak` is gone.
- `scripts/mutate-copy-check.mjs`: runs each script under a preload that refuses and
  logs every write under `<root>/scripts/`, five clauses per script (36 clauses over
  the seven with the existence clause), and a `--self-test` of 10 clauses: a probe of
  the guard over the seven functions, an in-place stand-in, and eight copy-based
  stand-ins each pinned to the pattern of the five clauses (one lacks exactly one
  thing). It ends with `finish(summarize())`, so `check:exit-drains` is unchanged.
- The fifth clause is not in the CC-CMD's design: a second run makes every
  `--self-test` started from outside the repo fail, and the script must stop with its
  FAIL line. Without it the positive control could be deleted down to its printed
  line and the check would stay green.

## Red before, green after
- The check over the seven scripts as they were at HEAD (a scratch root made with
  `git archive`): `1/36 checks passed`, every script blocked at its first write
  (`BLOCKED .../scripts/odds-coverage.mjs`, replay at `.../replay-odds-coverage.mjs.mutbak`),
  sha1 of four tracked targets unchanged. Over the converted scripts: `36/36`.
- The seven end to end on copies: rc=0 each, `11 of 11`, `4 of 4`, `5 of 5`,
  `19 of 19`, `8 of 8`, `7 of 7`, `7 of 7`. `diff` of each log against the in-place
  log: the only difference is the added `positive control:` line and the blank line
  after it.
- Real SIGKILL of `mutate-odds-coverage.mjs` 6.8 s in and of the replay script 4.5 s
  in, each checked by diffing the temp copy against the tracked file at the moment of
  the kill (the copy carried the mutation, the tracked file did not): sha1 of both
  tracked files identical to before, `git status` clean, no `.mutbak`, and the rerun
  printed `19 of 19` with nothing to heal. Each kill left a 3.4 MB directory in
  `$TMPDIR`.

## Not verified
- The guard's coverage is the seven functions on string or Buffer paths; the check
  prints that. `fs.promises`, write streams, `cpSync`/`mkdirSync` into `scripts/`,
  `openSync` with a write flag, a URL path and a shell-out are not seen.
- The leftover `$TMPDIR` directory after a kill is not cleaned by anything. On a
  runner the job ends with the machine; locally the operating system's temp
  clearing owns it. Left as it is, recorded.
- The workflow step has not run on a runner; it is `npm run check:mutate-copy`.
