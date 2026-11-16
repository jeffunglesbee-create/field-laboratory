# Gate items 2 and 7, round 6b: the pins of scripts/delete-branches.mjs and scripts/no-launch-check.mjs

Session doc (Rule 67). Date 2026-11-16. Branch `proof-r6b-pins` (local, not pushed), cut from `2aa79ba2`. Scope: `scripts/delete-branches.mjs`, `scripts/no-launch-check.mjs`
and their mutation-table entries (`delete-branches-*`, `no-launch-check-*`) in `scripts/mutation-check.mjs`. Another worker owns `scripts/gate-mode.mjs` and
`scripts/check-browser-gate.py`; neither is touched here.

Method for every BEFORE and AFTER below: each finding was re-reproduced at the base `2aa79ba2` first, with the edit the review stated, in a scratch tree
(`scripts/checks.mjs`, `scripts/delete-branches.mjs` and `.github/workflows/delete-branches.yml` copied; the edit made to BOTH the workflow and the text of `WORKFLOW_PIN`),
then `node scripts/delete-branches.mjs --self-test`. A table entry is `PASS [id]` only beside `PASS the unmutated tree passes every expectation`.

## F-C-1 (delete-branches, reachable false red): mutants cut from a literal `"$BRANCHES"`

REPRODUCED at base. BEFORE (edit in both files, `--self-test`):

| edit made to the workflow and to the pin | result at `2aa79ba2` |
|---|---|
| none (control) | 35/35 |
| Delete step: `BRANCHES:` to `PROOF_BRANCHES:` and `"$BRANCHES"` to `"$PROOF_BRANCHES"` | 33/35, `survived: the input inlined into the run line` |
| Delete run line: `"${BRANCHES}"` | 33/35, `survived: the input inlined into the run line` |
| Delete run line wrapped: `... --apply --` newline `"$BRANCHES"` | 32/35, `survived: the list not after a bare --, the input inlined into the run line` (and the check that names the first differing line also red) |
| `NOTE: x` after the Delete env line (control, was already green) | 35/35 |

Cause: `the input inlined into the run line` anchored on the literal `"$BRANCHES"` and `the list not after a bare --` on the literal ` -- ` inside the first line of the run;
neither is cut from the pin, and `sub()` left the text unchanged when its pattern matched nothing, so a mutant that changed nothing was the pin and was reported `survived`.

Fix (scripts/delete-branches.mjs, self-test only; no behaviour of the script changes):
- `anchorsOf` reads the Delete run as the whole of its `run:` value (the lines under it, indented deeper, belong to it: `runEnd`), the variable as the key of the env line `INPUT_RE` found
  (`VAR`), the expression it holds (`EXPR`) and the reference to it in whatever spelling the run has (`REF`: `$NAME`, `${NAME}`, quoted or not). A pin whose env line has no `NAME:` key is named in `missing`.
- `the input inlined into the run line` replaces `REF` by `EXPR`; `the list not after a bare --` removes the bare `--` where it stands (`/ --(?=\s)/`, also at the end of a wrapped line).
- `sub()` answers a `Miss` (carrying the pattern) when its pattern matches nothing, `cat()` passes it on, the builder marks the mutant unbuilt with `kind: 'miss'`, and `unbuiltMessage` names the mutant,
  the pattern and the text it was looked up in, then where to edit. A no-op mutant is a FAIL line that names it, never `survived`.
- Fixtures (the literal table `wfEdits`, three more rows, 6 to 9): the Delete variable renamed (env key and reference), the reference spelled the other way (braced or unbraced), the run line wrapped
  (or joined when it already is). Each is made to the pin at the lines `anchorsOf` located and read off the pin (`A.VAR`, `A.REF`, `refLine`), so an edit of the real pin that already renames, braces or wraps leaves them meaningful.
- A new check, `A MUTANT WHOSE EDIT FINDS NOTHING TO CHANGE IS A FAIL LINE, NOT A SURVIVOR`: a pin whose Delete run has no reference to the input leaves exactly `the input inlined into the run line`
  unbuilt, the other 29 built and none surviving, and the message names the mutant, the pattern (`A.REF`) and where to edit.

AFTER (same edits, both files), head of this commit: none 36/36; renamed variable 36/36; `"${BRANCHES}"` 36/36; wrapped 36/36; `NOTE: x` 36/36.
Controls that stay red (35/36, the red check is `THE REAL .github/workflows/delete-branches.yml IS ITS PIN`, naming significant line 26): `NOTE: x` in the workflow alone, `NOTE: x` in the pin alone,
`--apply` removed from the workflow alone.

Mutation entries (each `PASS [id]` beside `PASS the unmutated tree passes every expectation`; the fixture that went red was read off a scratch copy, not assumed):

| id | what it puts back | the fixture that goes red |
|---|---|---|
| `delete-branches-self-test-input-reference-literal` | the literal `"$BRANCHES"` in the inlined-input mutant | the renamed-variable and the braced-reference rows (built 29 of 30, `the input inlined into the run line` unbuilt), and the new no-op check |
| `delete-branches-self-test-bare-dashdash-literal` | the literal ` -- ` in the bare-`--` mutant | the wrapped row (`the list not after a bare --` unbuilt) |
| `delete-branches-self-test-run-line-only` | the Delete run as its first line only | the wrapped row (28 of 30 built: both mutants that read the continuation unbuilt) |
| `delete-branches-self-test-noop-edit-survives` | `sub()` without the Miss | the new no-op check (the unchanged text is built and is the pin) |
| `delete-branches-self-test-miss-names-no-pattern` | the unbuilt message without the pattern | the new no-op check |

## F-C-2 (delete-branches, reachable false red): the Plan step written with `- id: plan` before `name: Plan (dry run)`

REPRODUCED at base. BEFORE (edit in both files, `--self-test`): at `2aa79ba2` 33/35, `survived: no dry run before the Delete step` (the mutant replaced `name:` on the step's first line;
there was none, so it changed nothing and was reported as a survivor). The same key order on the Delete step: 35/35 (not a defect). At the F-C-1 head, where a no-op mutant is already a named FAIL,
the same edit is 32/36 and the detail reads `no dry run before the Delete step (its edit /name: .*/ matches nothing in its anchor "      - id: plan\n")`: named, but still a false red.

Fix: `anchorsOf` locates the Plan step's name line anywhere between the step's first line and its run line (`planName`, `PLAN_NAME`), the mutant edits that line (the old first-line anchor `PLAN_STEP` had no other
user and is gone), and a Plan step with no name line at all is listed in `missing` (`the Plan step's name line (none of its lines above the run line starts name: or - name:)`).
Fixture row 10 of `wfEdits` (the name key moved below an id key, or back to the first line when it already is below), and one check, `A PLAN STEP WITH NO NAME LINE IS NAMED`.

AFTER (same edits, both files): `- id: plan` before `name:` 37/37; `- id: del` before the Delete `name:` 37/37; no edit 37/37.

| id | what it puts back | the fixture or check that goes red |
|---|---|---|
| `delete-branches-self-test-plan-name-on-first-line` | the mutant anchored on the Plan step's first line | the name-key row (29 of 30 built, `no dry run before the Delete step` unbuilt) and the no-name check |
| `delete-branches-self-test-plan-name-missing-unlisted` | the `missing` entry for the name line, removed | the no-name check (`missing.length` 0, the detail is a bare `no step to anchor on`) |

## F-C-3 (delete-branches, cosmetic): an empty list before a full stop, and which flags the locators tolerate

REPRODUCED. BEFORE: a pin whose Plan run line reads `delete-branches.mjs --quiet -- "$BRANCHES"` (edit in both files) leaves only locators failed; the detail of the wfEdits check read
`no unique anchor in the pin for: . Not located: the Plan step's run line (no line of the pin matches PLAN_RUN_RE: ...`. Measured at the F-C-2 head, edits in both files, `--self-test`:

| edit | result |
|---|---|
| a flag after the bare --, Plan line (`-- "$BRANCHES" --quiet`) | 37/37 (tolerated) |
| a flag after the bare --, Delete line | 37/37 (tolerated) |
| a flag between `--apply` and the bare --, Delete line | tolerated (the existing fixture `a flag added to the Delete run line`) |
| a flag before the bare --, Plan line (`mjs --quiet -- ...`) | red, named FAIL lines (Plan step run line, first line, env line not located) |
| a flag before `--apply`, Delete line (`mjs --quiet --apply -- ...`) | red, named FAIL lines (the same three for the Delete step) |

So the review's sentence is right in substance: a flag after `--apply` is tolerated by the Delete locator and a flag between the script and the Plan line's bare -- is not (nor one before `--apply`).
The self-test's comment above `DEL_RUN_RE` now says which, exactly as measured (no behaviour change).

Fix: `unbuiltMessage` prints only the sentences that have something to say (`no unique anchor in the pin for: ...` only when a mutant is unbuilt, `Not located: ...` only when a locator failed, always the closing
`Each step is found in ... edit the regexp or the literal ...`). AFTER: the same edit reads `Not located: the Plan step's run line (no line of the pin matches PLAN_RUN_RE: ...` with no empty list before it.
New check `THE FAILURE DETAIL PRINTS ONLY THE SENTENCES THAT HAVE SOMETHING TO SAY` (38/38 on this head); the entry `delete-branches-self-test-unbuilt-message-names-no-locator` is re-anchored on the new expression.

| id | what it puts back | the check that goes red |
|---|---|---|
| `delete-branches-self-test-empty-anchor-list-printed` | the unconditional `no unique anchor in the pin for: .` sentence | `THE FAILURE DETAIL PRINTS ONLY THE SENTENCES THAT HAVE SOMETHING TO SAY` (detail: `no unique anchor in the pin for: . Not located: ...`) |
| `delete-branches-self-test-unbuilt-message-names-no-locator` (re-anchored) | no `Not located` sentence | the check that names an anchor that cannot be found, the no-name check and the new detail check |

## F-A-1 (no-launch-check, Rule 90 survivors): four clauses of `scanCheckOf`'s pass condition, and verdictOf's stale sentence

REPRODUCED at base `2aa79ba2`, in a scratch copy of the base (`scripts/`, `.github/`, `package.json`, `node_modules` linked), each mutation applied alone, `node scripts/no-launch-check.mjs --self-test`.
Baseline there: 52/53 (the one failure is `the axis-check mutation needs build/`, build/ is absent here). BEFORE, every row below is also 52/53 with the same single failure, i.e. the self-test is unchanged:

| mutation applied to the base | result at `2aa79ba2` |
|---|---|
| the offenders clause removed from `scanCheckOf` | 52/53 |
| the stale clause removed | 52/53 |
| the floor on scripts (`scan.files >= minFiles`) removed | 52/53 |
| the floor on lines (`scan.lines >= minLines`) removed | 52/53 |
| the floor on scripts loosened to `>` (not asked; the same shape) | 52/53 |
| the floor on lines loosened to `>` (not asked; the same shape) | 52/53 |
| `verdictOf`'s stale sentence replaced by its own copy without the remedy | 52/53 |

Cause: every scan the self-test hands `scanCheckOf` is wrong in two ways at once (an offender plus a stale entry; too few scripts plus too few lines), so dropping one clause leaves the other to fail it, and the
check that says verdictOf and the real-scan check print the same sentences (the title of the reworded-line check) read only one of them.

Fix (scripts/no-launch-check.mjs, self-test only):
- `PASS_ROWS`, a literal table of `[offenders, stale, lines, files]` and the pass each gives, six rows: clean above both floors (true); clean exactly AT both floors, 50 scripts and 10 lines (true); an offender
  alone, a stale entry alone, 49 scripts alone, 9 lines alone (each false). Each row differs from the clean one in exactly one thing.
- `SAME_ROWS`: for a stale entry alone, an offender alone and a reworded line (both), `verdictOf(...).problems` joined as the check joins them is the text `scanCheckOf` hands the check, and there is one problem per entry.

Mutation entries. These expect `node scripts/no-launch-check.mjs --self-test`, whose unmutated run fails here (no build/), so `--only` prints `FAIL the unmutated tree passes every expectation` beside `PASS [id]`
and that PASS alone means nothing. Each mutation was therefore applied BY HAND to the real `scripts/no-launch-check.mjs` of this worktree (the find and replace read out of the table), the self-test run, the file restored
(compared byte for byte afterwards) and the checks that went red read. Baseline of the new head there: 54/55 (only the build/ check). With each mutation applied: 53/55, the build/ check plus exactly one new check:

| id | by hand, the new check that goes red and why |
|---|---|
| `no-launch-check-scan-pass-ignores-offenders` | `THE REAL-SCAN CHECK PASSES ONLY ON A CLEAN SCAN ...`: the wrong pass for `one offender, nothing else wrong` |
| `no-launch-check-scan-pass-ignores-stale` | the same check: `one stale entry, nothing else wrong` |
| `no-launch-check-scan-pass-drops-the-script-floor` | the same check: `one script under the floor, nothing else wrong (49 of 50)` |
| `no-launch-check-scan-pass-drops-the-line-floor` | the same check: `one line under the floor, nothing else wrong (9 of 10)` |
| `no-launch-check-scan-pass-script-floor-strict` | the same check: `clean, exactly AT both floors (50 scripts, 10 lines)` |
| `no-launch-check-scan-pass-line-floor-strict` | the same check: `clean, exactly AT both floors (50 scripts, 10 lines)` |
| `no-launch-check-verdict-stale-sentence-copied` | `THE VERDICT AND THE REAL-SCAN CHECK SAY THE SAME WORDS`: different for `a stale entry alone; both, as a reworded listed line is` |
| `no-launch-check-verdict-offender-sentence-copied` | the same check: different for `an offender alone; both, as a reworded listed line is` |

`node scripts/mutation-check.mjs --only <id>` for each of the eight printed `FAIL  the unmutated tree passes every expectation` (the build/ check) and `PASS  [id] ...`, and `--anchors` reads 0 stale.

## Evidence at the branch head, and what was left

Final numbers on the head of `proof-r6b-pins` (verbatim): `node scripts/delete-branches.mjs --self-test` 38/38; `node scripts/no-launch-check.mjs --self-test` 54/55 (the one failure is `the axis-check mutation
needs build/`, as at the base); `python3 scripts/check-browser-gate.py` ends `verdict: gated`; `npm run --silent check:citations` ends `bare citations do not grow (budget 0)`; `node scripts/mutation-check.mjs --self-test`
221/221; `node scripts/mutation-lib.mjs --self-test` alone 81/81; `node scripts/mutation-check.mjs --anchors` `checked 1973 of 1976 mutation anchors; 0 stale`; `--stranded` 0 markers before each commit.

Both-files edits, `delete-branches.mjs --self-test` on the final head: no edit, variable renamed, `"${BRANCHES}"`, run line wrapped, `- id: plan` before the Plan `name:`, `- id: del` before the Delete `name:`, a flag after the
bare -- on either line, `NOTE: x` after the Delete env line: each 38/38. All of the Plan `- id:` edit, the Delete variable renamed AND braced AND wrapped AND given an `id:` key and a `NOTE:` key, together: 38/38.
Controls still red (37/38, `THE REAL .github/workflows/delete-branches.yml IS ITS PIN` naming significant line 26): `NOTE: x` in the workflow alone, `NOTE: x` in the pin alone, `--apply` removed from the workflow alone.

`node scripts/mutation-check.mjs --only <id>` for the delete-branches entries added or re-anchored, verbatim (the line is cut at 110 characters here), each `PASS [id]` beside `PASS  the unmutated tree passes every expectation`:

```
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-input-reference-literal] the mutant that inlines the input into the run line 
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-bare-dashdash-literal] the mutant that drops the bare -- finds it where the p
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-run-line-only] the Delete run is the whole of its run: value, a wrapped conti
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-noop-edit-survives] a mutant whose edit matches nothing in its anchor is unbu
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-miss-names-no-pattern] an unbuilt mutant whose edit found nothing names the p
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-plan-name-on-first-line] the mutant that renames the Plan step finds its name
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-plan-name-missing-unlisted] a Plan step with no name line is named as not loc
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-empty-anchor-list-printed] the failure detail prints a sentence only when it 
PASS  the unmutated tree passes every expectation
PASS  [delete-branches-self-test-unbuilt-message-names-no-locator] an anchor that cannot be found names the re
```

For the eight no-launch-check entries the unmutated expectation fails here (no build/), so their `--only` prints `FAIL  the unmutated tree passes every expectation` beside each `PASS  [id]`; the by-hand runs above are their evidence.

Left, and why:
- A wrap of the Delete run line directly after `--apply` (no trailing space) or of the Plan run line directly after its bare `--` leaves DEL_RUN_RE or PLAN_RUN_RE (each needs the space after the flag) with no line: a named FAIL
  (the step, the regexp, where to edit), not a survivor. Widening the two regexps to accept a line end is a different change from the findings and was not made.
- The four clauses also survive in the inline condition at the base's parent, which is history and was not touched.
- Not run here: the full `--self-test` of no-launch-check with build/ present (it is absent in this sandbox), so the 55th check, the real `axis-check.mjs` mutation, is as at the base: red for want of build/. The runner has build/.
