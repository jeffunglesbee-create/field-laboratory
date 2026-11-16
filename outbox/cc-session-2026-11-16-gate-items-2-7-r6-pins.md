# Gate items 2-7, round 6: four findings, one commit each (branch `proof-r6-pins`, base `4b5395e6`)

Four findings were reproduced by independent reviewers at `c6b1c33f`. Each was re-reproduced by hand at `4b5395e6`, in a scratch worktree on `/dev/shm`, BEFORE a line was changed. The commands and their output are below, one section per finding. Rule 90: every new check was seen to FAIL on purpose (the mutation applied by hand to the real file, the self-test read, the file restored) before it was trusted, and each mutation is a table entry in `scripts/mutation-check.mjs`.

A caveat that applies to every `--only` line below for the `no-launch-check-*` ids: the expectation of those entries is `node scripts/no-launch-check.mjs --self-test`, whose one standing failure here is `the axis-check mutation needs build/` (only CI can build). The harness says so (`FAIL the unmutated tree passes every expectation`), and `PASS [id]` is printed under it regardless, because the expectation fails on the unmutated tree. So the evidence that each of those mutations is caught for the right reason is the manual run: the mutated file's self-test shows the NEW check red beside the standing one (51/53 against 52/53 unmutated), named below.

## F-A (O-new-1): a reworded listed comment turned `no-launch-check --self-test` red with only a JSON dump

Reproduced at `4b5395e6`:

```
n=$(grep -n 'A MARKER THAT APPEARS BETWEEN THE CHECK' scripts/proof-check.mjs | head -1 | cut -d: -f1)
sed -i "${n}s#// A MARKER THAT APPEARS#// A MARKER THAT NOW APPEARS#" scripts/proof-check.mjs
node scripts/no-launch-check.mjs --self-test 2>&1 | grep -A1 '^FAIL'
```

BEFORE: `FAIL  ...and the real scripts/ has every line that names the node options on the list and every listed line still there (13 of 14 lines on the list in 195 scripts, 1 stale)` followed by `→ {"files":195,"lines":14,"offenders":[{"at":"scripts/proof-check.mjs, line 1108","text":"// A MARKER THAT NOW APPEARS ...` and nothing that says what to do. The sentence that does (`add the line to the list on purpose`) is printed by `verdictOf` on the no-argument run, which `--self-test && no-argument` never reaches.

Fix: `offenderProblem` and `staleProblem` hold the two sentences (`verdictOf` now calls them, so there is one copy), `scanDetail` builds the detail from them, and `scanCheckOf` hands the check its `[passed, detail]` pair. A reworded line is both an offender (the new text) and a stale entry (the old), and the stale sentence now says so: the reworded line is refused above, add that one on purpose and delete this one. The scan did NOT start skipping comment lines (a template-literal line that starts with `//` is data a child may read; the allowlist stays default-deny).

AFTER, the same command: the `FAIL` line is the same, and the detail is two sentences, `scripts/proof-check.mjs, line 1108, names the node options in a line that is not on the list (KNOWN_NODE_OPTIONS_LINES in scripts/no-launch-check.mjs): ... and add the line to the list on purpose, or say it without the word` and `scripts/proof-check.mjs is listed with a line that is no longer in it: ... (delete it from KNOWN_NODE_OPTIONS_LINES, ...; if the line was reworded, not removed, the reworded line is refused above: add that one on purpose and delete this one)`.

Fixture: `THE REAL-SCAN DETAIL SAYS HOW TO FIX A REWORDED LISTED LINE` (a reworded line's pair read from `scanCheckOf`; a clean scan passes with an empty detail; a scan that read too little fails and says so). Self-test 52/53 (was 51/52; the one failure is the `build/` check).

Mutation entries (each applied by hand to `scripts/no-launch-check.mjs`, the new check goes red, 51/53; restored):

- `no-launch-check-scan-detail-is-a-json-dump`: the detail is a JSON dump again.
- `no-launch-check-scan-check-given-a-dump`: the check is handed a JSON dump instead of `scanDetail`.
- `no-launch-check-scan-offender-lacks-its-remedy`: the offender sentence loses `add the line to the list on purpose`.
- `no-launch-check-scan-stale-lacks-the-reword-remedy`: the stale sentence loses the reworded-line pair remedy.
- `no-launch-check-scan-detail-floor-silent`: a scan that read too little has no detail.
