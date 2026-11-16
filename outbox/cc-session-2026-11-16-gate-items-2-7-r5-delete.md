# Round 5, delete-branches area: B12, B13, B14, A19 (the pin), A16 and A20 (main()'s unverified path), A18 (the recursion)

Date: 2026-11-16. Branch `proof-r5-delete` (worktree of `gate-items-2-7` at 9043fa75). Files: `scripts/delete-branches.mjs`, `.github/workflows/delete-branches.yml` (a header comment only; every non-comment line is unchanged), the `delete-branches-*` entries of `scripts/mutation-check.mjs`. Findings: `outbox/review-round-5-findings-2026-11-16.md`.

Session doc for Rule 67. HEAD progression: 9043fa75 -> commit 1 (the pin) -> commit 2 (A16/A20) -> commit 3 (A18). Each commit message carries its sha below once pushed.

## Threat model and classification (Rule 77)

The guard's stated threat model is a CARELESS edit. Classification of each item, by what an ordinary edit does:

| item | what an ordinary edit / message / file shape does | class |
|---|---|---|
| B12 wrapped `run:` continuation ending `|| true` | wrapping a long command line by hand is an ordinary edit; the second skeptic found 0 of 56 workflows wrapped, and an accidental wrap normally fails safe, but `|| true` / `; git push ...` on the continuation is exactly what the check names ("a failed deletion made green") | REACHABLE as an edit of this file; fixed by construction (the pin) |
| A19 other spellings of the input, a hard-coded list, an extra step | a person adding a debug step, or changing how the input is passed, writes `inputs['branches']` or a literal list | REACHABLE; same construction |
| B14 clauses never failed on purpose | n/a: the clauses no longer exist; the pin comparison has its own entries | the construction removes them |
| B13 four of five table entries pass by a stack trace | any edit of the real workflow text that the self-test's mutant builder used as anchor | REACHABLE (the table entries do exactly this) |
| A16 main()'s print/exit for an unverified result never run | a remote that is unreadable after the pushes (a network drop between the pushes and the final ls-remote) is an ordinary runner event; an ordinary edit of those two lines in main() stays green | REACHABLE |
| A20 near variant: a rejected branch listed as "pushed without an error" | one rejected deletion plus a failed final question: the same ordinary event as above with one branch protected | REACHABLE |
| A18 observation: a mutated parse recurses (86 orphans, 120 s) | an edit of parseArgs that lets `--self-test` through after `--` | REACHABLE as an edit; the damage (orphans) is what is closed |

## Commit 1: the pin (B13 + B12 + B14, and the workflow half of A19)

What changed:

- `workflowProblems(text)` is now a comparison with a pinned constant, `WORKFLOW_PIN` (the real file minus whole-line comments and blank lines, 26 significant lines at this commit, with the one-line `description:` of the input pinned too). Whole-line comments (first non-blank character `#`), blank lines and trailing whitespace (a CRLF file included) are the only free text; any other difference is ONE problem that names the first differing significant line (expected, found) and says an intended edit also edits `WORKFLOW_PIN`. There is no clause beside the comparison.
- The self-test READS the real file and checks it against the pin as its own check (`THE REAL .github/workflows/delete-branches.yml IS ITS PIN`). Its mutants are built from the PIN constant, not from the file, by a builder that answers `null` for an anchor that is absent or occurs twice; the unbuilt anchors are named by a check (`EVERY WORKFLOW MUTANT IS BUILT`), never thrown. A fixture asserts the builder's `null` for an absent anchor and for a doubled one.
- The workflow's header comment (two lines) said the self-test "reads this file's shape: `--apply` on the Delete step, no continue-on-error, ..."; that is no longer how it is read, so the two lines now say the file is compared line by line to the pin. Same line count; no non-comment line moved.
- The five `delete-branches-workflow-*` entries (apply-dropped, plan-applies, continue-on-error, input-inlined, no-dashdash) now have a NARROW expectation: `workflowProblems` over the real file and nothing else. With the whole self-test as the expectation they could not show red-by-absence (see below): blind the comparison and the self-test still goes red, through the mutants check, so the entry passed whether or not the comparison existed.

Inputs that passed before and are red now (measured: the 9043fa75 `workflowProblems` and this commit's, run over the real file with one edit each; 9 of 14 edits tried were `[]` before and 1 problem now, the other 5 were already red and stay red):

- before `[]`, now one problem: a wrapped continuation `          || true` after the Delete run (the problem now reads `at significant line 27 ... expected nothing (the text ends here), found `|| true``); a wrapped continuation `; git push origin :refs/heads/main`; `inputs['branches']` in an extra step's run; `github.event["inputs"]["branches"]` in the Delete env; a hard-coded `BRANCHES: proof-a,proof-b` in the Delete step; an extra step; an extra job; `shell: bash {0}` on the Delete step; a job-level `permissions:` that widens the token (9 of 14).
- already red before (and still red): a quoted `"continue-on-error"` key, a trigger after a blank line, `|| true` after a `#` on the same line, `"$BRANCHES"#|| true`, a block scalar with `|| true` after a `#` line (5 of 14).

The self-test carries 30 literal edits of this kind (`wfMutants.length === 30`).

### The FAIL line that catches each of the five workflow entries (self-test run in a scratch copy with the entry's edit applied; 5 of 5, each exit 1, 1 FAIL line, no stack trace)

All five print `FAIL  THE REAL .github/workflows/delete-branches.yml IS ITS PIN ...` with the detail naming the line:

| entry | the detail (first differing significant line) |
|---|---|
| delete-branches-workflow-apply-dropped | line 26: expected `run: node scripts/delete-branches.mjs --apply -- "$BRANCHES"`, found `run: node scripts/delete-branches.mjs -- "$BRANCHES"` |
| delete-branches-workflow-plan-applies | line 22: expected the Plan line without `--apply`, found it with |
| delete-branches-workflow-continue-on-error | line 24: expected `env:`, found `continue-on-error: true` |
| delete-branches-workflow-input-inlined | line 26: expected `... "$BRANCHES"`, found `... "${{ inputs.branches }}"` |
| delete-branches-workflow-no-dashdash | line 26: expected `... --apply -- "$BRANCHES"`, found `... --apply "$BRANCHES"` |

Before this commit four of these exited 1 with 0 FAIL lines and a Node stack trace (`Error: workflow mutation anchor is not unique`), B13.

### Red-by-absence of the five (the comparison disabled, one mutation: `if (want[i] !== got[i]) return [` -> `if (false) return [`, applied by hand to the script, then each entry run through the harness)

```
FAIL  [delete-branches-workflow-apply-dropped]      mutation SURVIVED ... Nothing defends this claim.   1/2 checks passed
FAIL  [delete-branches-workflow-plan-applies]       mutation SURVIVED ... Nothing defends this claim.   1/2 checks passed
FAIL  [delete-branches-workflow-continue-on-error]  mutation SURVIVED ... Nothing defends this claim.   1/2 checks passed
FAIL  [delete-branches-workflow-input-inlined]      mutation SURVIVED ... Nothing defends this claim.   1/2 checks passed
FAIL  [delete-branches-workflow-no-dashdash]        mutation SURVIVED ... Nothing defends this claim.   1/2 checks passed
```

5 of 5 entries fail (survive) when the comparison is absent; with the comparison present each prints `PASS [id]` (2/2). The script was restored after (`git diff` shows no `if (false) return [`).

### B14: the pin comparison's own entries (all `PASS [id]`, 2/2, through `node scripts/mutation-check.mjs --only <id>`; the FAIL line that goes red is from the same mutation run in a scratch copy)

| entry | mutation | what goes red |
|---|---|---|
| delete-branches-workflow-pin-edited (a) | pin `runs-on: ubuntu-latest` -> `ubuntu-latesT` | `THE REAL ... IS ITS PIN`: expected `...latesT`, found `...latest` (line 12) |
| delete-branches-workflow-pin-not-compared (b) | `if (want[i] !== got[i]) return [` -> `if (false) return [` | `THE PIN COMPARISON` (all 30 edits survived) and `THE PROBLEM NAMES THE FIRST LINE` |
| delete-branches-workflow-comment-strip-hides-a-line (c) | the line filter also strips `#.*$` | `THE PIN COMPARISON`, survived: `|| true after a # on the same line`, `|| true glued to the line by a # that is no YAML comment` |
| delete-branches-workflow-hash-line-dropped (c) | a line is a comment if it CONTAINS `#` (`/#/`), not if it starts with one | `THE PIN COMPARISON`, survived: `an extra step that is one line with a trailing comment` |
| delete-branches-workflow-comment-lines-counted | whole-line comments no longer dropped | `THE REAL ... IS ITS PIN` (line 1 is a comment) and `COMMENT LINES, BLANK LINES, ... ARE NOT COUNTED` |
| delete-branches-workflow-blank-lines-counted | blank lines no longer dropped | the same two |
| delete-branches-workflow-trailing-space-counted | trailing whitespace no longer dropped | `COMMENT LINES, ...`: `trailing space on a line, CRLF line endings` read as a problem |
| delete-branches-workflow-extra-lines-ignored | `Math.max(...)` -> `Math.min(...)` | `THE PIN COMPARISON`: every wrapped continuation, extra step, extra job and the last-line-removed edit survived |
| delete-branches-workflow-problem-silent | the sentence "An intended edit ... also edits WORKFLOW_PIN" removed | `THE PROBLEM NAMES THE FIRST LINE THAT DIFFERS ... and says an intended edit also edits the pin` |
| delete-branches-workflow-mutant-builder-throws (B13) | the builder throws on a bad anchor again | `A MUTANT WHOSE ANCHOR IS NOT IN THE PIN IS A FAIL LINE, NOT A STACK TRACE` (1 FAIL line, no stack trace) |

The B14 "as a wrapped continuation" part of (c) is the literal mutants `a wrapped continuation of the Delete run ending || true`, `... that deletes the default branch`, `a wrapped continuation behind a comment line` and `a block scalar for the Delete run with || true after a # line`: each is a different significant line, so none can hide behind the comment stripping (the stripping drops whole-line comments only; the two `#` mutations above are what prove it).

Denominators (Rule 91): the self-test counts `wfMutants.length === 30` workflow edits (each must be a problem) and 5 benign edits (a comment line, an indented comment line, a blank line, trailing space, CRLF: none may be a problem); 10 new entries, 5 narrowed; `node scripts/mutation-check.mjs --anchors`: `checked 1675 of 1678 mutation anchors; 0 stale`.

Self-test: `node scripts/delete-branches.mjs --self-test` 23/23 at 9043fa75 -> 28/28 at this commit (the old workflow check replaced by six: real file is the pin, every mutant built, the 30 edits, the message, the 5 benign edits, the builder's null).
