# Round 6, guard fixes from the verification round (2026-11-16)

Base: `4b5395e6` (head of `gate-items-2-7` after the round-5 merge and its three verification fixes). Source: workflow `wf_f9f5e556-127`, 66 agents (five verifiers and hunters, and two skeptics per new finding). Each fix below is one commit with fixtures that were seen to fail on purpose (Rule 90: the mutation-table entry named in each section, each `PASS [id]` under `node scripts/mutation-check.mjs --only <id>`). A finding both skeptics REFUTED, or both called CONTRIVED or COSMETIC, is not fixed here; it is listed with its exact passing input in `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`.

The premise of each fix was re-run at `4b5395e6` before any edit (Rule 100): the three reproductions below were taken with a scratch copy of the tree (`.github`, `scripts`, `package.json`) and one inserted step.

## G-pop-1 (REACHABLE, false red; both skeptics UPHELD): `tee`, `cp`, `mv`, `rm`, `uniq` in an always() step of an audited job

| input, one step added before the final step of `.github/workflows/verify-full.yml` | at `4b5395e6` | after |
|---|---|---|
| `echo x > scripts/render-check.mjs` (a redirect that replaces a script) | rc 0 `verdict: gated` | rc 0 `verdict: gated` |
| `node scripts/check-script-orphans.mjs \| tee outbox/x.txt` | rc 1, `tee` is not a command this guard can read | rc 0 `verdict: gated` |
| `cp outbox/a.txt outbox/b.txt` | rc 1 | rc 0 |
| `rm -f outbox/x.txt` | rc 1 | rc 0 |
| `node scripts/check-script-orphans.mjs \| sort \| uniq -c` | rc 1 (2 problems) | rc 1 (the `sort` refusal stays) |
| `sed -i 's/a/b/' outbox/x.txt` | rc 1 | rc 1 (the `sed` refusal stays) |

The round-4 fix (A23) removed eight tools from `BENIGN_HEADS`. Three run another command from their arguments (`awk` `system()`, `sed` `e` and `s///e`, `sort --compress-program`); they stay removed. Five only write a file (`tee`, `cp`, `mv`, `rm`, `uniq`); the ground for removing them was that they can replace a script the guard has already read. The first row above is the premise that fails: `echo x > scripts/render-check.mjs` is read clean, so a write to a script path was never refused, and the refusal of the tool bought nothing a redirect did not give back while refusing `| tee outbox/x.txt`, the repo's commonest pipeline sink. The five are restored; none runs another command. A step that writes a script and then runs it is no careless edit (the guard's stated threat model); it is one residual with the redirect, filed in the second CC-CMD with the option that closes both (classify the target of every write).

Fixtures: `BENIGN_HEADS` pinned to the 29 names (`PINNED_BENIGN`, five added); the three that run a command stay a literal list that is not in the set and each is refused; each of the five is kept as opaque on a plain, a piped and an unreadable line; five ordinary shapes are not refused; `tee x; npm run shot` still reads as a browser step. Table: `browser-gate-benign-tee`, `-cp`, `-mv`, `-rm`, `-uniq` now REMOVE the tool from the set (each `PASS`, each fails the vocab check on purpose); `-sed`, `-awk`, `-sort`, `-find` are unchanged.

## hunt-guard-5 (REACHABLE, false red; both skeptics UPHELD): an echo message with `;` `|` `&` `<` `>` in the required no-browser step

| input | at `4b5395e6` | after |
|---|---|---|
| the no-browser step `run:` of `verify-full.yml` becomes `echo "no browser; running the browser-free rows"` then `npm run gate:browserless` | rc 1, `must run scripts/confidence.mjs --browserless as real work ... in the closed form` | rc 0 `verdict: gated` |
| the same with `echo x; npm run shot` | rc 1 | rc 1 (2 problems) |

`flagged_step_ok` tested FORBIDDEN_IN_LINE on the raw echo line, quotes and all, so a notice with an arrow or a semicolon refused the whole step. It now tests the line with its quoted strings blanked (`blank_quoted` keeps a `$( )` and a backtick pair inside double quotes, which run). The refusal says an `echo` line is allowed and where its characters may sit. Fixtures: six messages are the work; fourteen shapes that run something or put one of the characters outside quotes are still refused. Table: `browser-gate-nb-echo-quoted-text`, `browser-gate-nb-echo-quoted-code` (a naive blanking that also erases `$( )` inside double quotes: caught by `echo "$(npm run shot)"`), `browser-gate-nb-echo-message`; each `PASS`.

## hunt-guard-1 and hunt-guard-2 (the A29 residuals; one UPHELD as REACHABLE and one REFUTED, both UPHELD as CONTRIVED): the write and the name it writes on different lines

| input, one step added before the final step of `.github/workflows/verify-full.yml` | at `7144cdc2` | after |
|---|---|---|
| `{` / `  echo "NODE_OPTIONS=--require /tmp/x.cjs"` / `} >> "$GITHUB_ENV"` (a group written over several lines, the idiom GitHub documents) | rc 0 `verdict: gated` | rc 1 |
| `echo "NODE_OPTIONS<<EOF" >> "$GITHUB_ENV"` and the two lines GitHub's multi-line syntax then needs | rc 0 | rc 1 |
| `V="NODE_OPTIONS=--require /tmp/x.cjs"` then `echo "$V" >> "$GITHUB_ENV"` (the residual round 5 filed) | rc 0 | rc 1 |
| the same group with harmless names (`A=1`, `B=2`) | rc 0 | rc 0 |
| `echo "NODE_OPTIONS=--require /tmp/x.cjs" >> "$GITHUB_ENV"` on one line (control) | rc 1 | rc 1 |

`later_step_effects` was asked about one logical line at a time, so a write and the name it writes met only when they shared a line. It is now asked about the text of the whole step (`read_commands`), with the line that holds the `$GITHUB_ENV`, `$GITHUB_PATH` or `.npmrc` reference shown in the refusal; `ASSIGNED_NAME` also reads `NAME<<`. One construction closes the three. Not closed, filed: a name built from pieces (`N=NODE_OPTIONS`, then `echo "$N=x" >> "$GITHUB_ENV"`), and a step BEFORE the install (hunt-guard-3: the check is only made for the steps after it). Fixtures: seven shapes refused, four controls say nothing about `$GITHUB_ENV`. Table: `browser-gate-later-step-is-per-line`, `browser-gate-later-step-name-heredoc-form` (new, each `PASS`), and `browser-gate-later-steps-wired` and `-comment-cut` repointed to the new lines (each `PASS`; their anchors had gone stale: `--anchors` reported them). The whole `browser-gate-later-step*` family was re-run after the change.

## Two Rule 90 survivors a good-faith input reaches, and two messages that named no remedy (one commit: all four are test and text, no verdict changes)

- **imp-use-dot-method-ws** (REACHABLE, one skeptic UPHELD and one REFUTED the class; the mutant was reproduced by both): the pattern that finds `rows.push(` in an importer reads `\s*\.\s*`, and no fixture had whitespace between the name and the dot, so a pattern that required the dot glued to the name passed the self-test at 909/909. `rows\n  .push({})` (a method chain as a formatter writes it) and `rows . push(1)` are now importer fixtures. Table: `browser-gate-importer-use-dot-whitespace`, `PASS`.
- **cs-sq-in-dq** (REACHABLE, one UPHELD and one REFUTED the class; the mutant reproduced by both): `comment_start` takes a `'` inside a double-quoted string as text only through `and not in_dq`, and no `PINNED_COMMENT_STARTS` row had an apostrophe inside double quotes, so the mutant left the self-test at 909/909 and `echo "it's done" # note; more` lost its comment cut. Three rows added (`echo "it's" # c` at 12, `echo "it's ok" # a; b` at 15, `echo "don't" # see: x | y` at 13). Table: `browser-gate-comment-start-apostrophe-in-double-quotes`, `PASS`.
- **G-pop-5 and hunt-guard-8** (a parameter or local called `rows` in a file that imports `{ rows }` reads as the import; one skeptic UPHELD REACHABLE, one REFUTED): the scan matches the name, and a scope-aware reader is the contrived-residual item. The refusal now says the match is by name and the remedy is a rename. Table: `browser-gate-importer-message-rename`, `PASS`.
- **G-pop-2 (b)** (a trailing comment after `exit 1` or after the final step's echo is refused; one skeptic UPHELD REACHABLE, one REFUTED): the closed grammar is deliberate, and the refusal now says a comment goes on a line of its own above the command (a full-line comment is accepted, and is a fixture). Table: `browser-gate-final-message-comment-line` went NOT CAUGHT first (`FAIL [id]`: no fixture read the sentence), then `PASS` after the fixture.
- G-pop-2 (a), a `$VAR` that is not in the step's `env:` inside an echo of the final step, was already fixed at `697042ee` (G-new-4).

Self-test 923/923. `--anchors`: `checked 1900 of 1903 mutation anchors; 0 stale`.
