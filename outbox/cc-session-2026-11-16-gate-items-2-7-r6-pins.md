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

## F-B (O-new-2): a new non-browser gate row turned `gate-mode --self-test` red on literal denominators, and nothing named the third file

Reproduced at `4b5395e6` (this was run at the F-A head, which does not touch these files): `  { name: 'zz new row', weight: 30, run: () => ok('true') },` inserted before the closing `]` of `rows` in `scripts/gate-checks.mjs` (the line asserted to be `]`), then `node scripts/gate-mode.mjs --self-test 2>&1 | grep -A1 '^FAIL'`, file restored.

BEFORE: two checks red. `BROWSERLESS WITH THE SHARDS READ BACK: ... the other 17 run (350)` with the detail `not applicable: render checks pass on both captures | grouping and date navigation pass | ...` (the six UNCHANGED names: the count that moved was not in it), and `quick still skips exactly the ten rows it did, and runs the rest; full runs all 23` with `skip 10, run 14, rows 24`. `docs/gate-rows.txt` said `edit this file and scripts/gate-checks.mjs together`, and the refusal text of `scripts/gate-inventory.mjs` names the same two. `scripts/gate-mode.mjs` was not named anywhere a person adding a row would read.

Fix, option (1) of the brief (the pinned denominators stay; Rule 91, a visible denominator is the point): the literals are one table, `PINNED`, at the head of the self-test (the labels are written from it); `pinsOf(rows)` computes both checks over any table of rows; each failing check prints `read N (pinned M, DIFFERS)` for every count (rows, skipped and run in quick, run in full, rows and points run in browserless, points not applicable) and then says which three files change together (`docs/gate-rows.txt`, `scripts/gate-checks.mjs` and `PINNED` in `scripts/gate-mode.mjs`). The weights check prints the real weights beside the pinned `[10,20,30]` and says a new weight needs a failing stand-in. The `TO CHANGE THE GATE` paragraph of `docs/gate-rows.txt` names `scripts/gate-mode.mjs` as the third file to edit, names `PINNED` and what it pins, and the weights list. Readers of `docs/gate-rows.txt` that I ran, all green: `node scripts/gate-inventory.mjs` 7/7, `node scripts/confidence-record-check.mjs` 3/3 and `--self-test` 28/28, `node scripts/history-check.mjs --self-test` 11/11, `python3 scripts/check-browser-gate.py` verdict `gated`. Nothing compares the paragraph (`readInventory` drops every `#` line), and the one table entry that mutates this file (`known-survivor`) anchors on a different line.

AFTER, the same command with the same inserted row: the same two checks are red and nothing else (41/43, the third check does not pile on: it asserts what a row ADDED does, relative to the table's own counts), and the details are `Read beside pinned: not applicable points 180 (pinned 180); rows run 18 (pinned 17, DIFFERS); points run 380 (pinned 350, DIFFERS). A row added to the gate or removed from it moves these counts: change PINNED (the first lines of this self-test in scripts/gate-mode.mjs) in the same commit as docs/gate-rows.txt and scripts/gate-checks.mjs` and `Read beside pinned: rows 24 (pinned 23, DIFFERS); skipped in quick 10 (pinned 10); run in quick 14 (pinned 13, DIFFERS); run in full 24 (pinned 23, DIFFERS); not applicable in full 0, skipped in full 0 (both pinned 0). ...`. On the real table: 43/43 (was 41/41).

Fixtures: `A ROW ADDED TO THE GATE MOVES EVERY COUNT A PINNED CHECK READS` (a synthetic 30-point row: +1 row, +1 run in quick, +1 and +30 points in browserless, the counts printed, the three files named) and `docs/gate-rows.txt: the TO CHANGE THE GATE paragraph says in its first sentence to edit all three files ... and names the PINNED table`.

Mutation entries (each applied by hand, the named check went red, 42/43, restored; each prints `PASS [id]` under `node scripts/mutation-check.mjs --only <id>`, the baseline of `gate-mode.mjs --self-test` being green here, so these are not the build/-tainted lines of F-A):

- `gate-mode-pin-detail-prints-no-counts`: the detail prints the pinned count and not the one read.
- `gate-mode-pin-detail-names-no-third-file`: the detail does not name `scripts/gate-mode.mjs`.
- `gate-mode-pin-detail-names-no-sibling-files`: the detail does not name the other two files.
- `gate-mode-pin-run-count-moved` and `gate-mode-pin-browserless-points-moved`: a pin off by one (or by ten points) turns the real check red: the pins can fail.
- `gate-mode-rows-doc-omits-the-third-file` and `gate-mode-rows-doc-omits-the-pinned-table`: the paragraph of `docs/gate-rows.txt` loses the third file, or the name of the table.
