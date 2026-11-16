# Round 5 of items 2 to 7, the Chromium guard, part B: B0 B8 B9 A21 A22 A23 (session note, 2026-11-16)

Branch `proof-r5-guard-b`, from `proof-r5-guard-a` (674c5f99, which holds part A). Files: `scripts/check-browser-gate.py`, the mutation table in `scripts/mutation-check.mjs` (entries
`browser-gate-heads-*`, inserted before the `venue sourcing` header) and, for one consequence of A23 (below), the two ledger steps of `.github/workflows/verify-full.yml`. The record being
answered is `outbox/review-round-5-findings-2026-11-16.md`. One commit per cluster closed by one construction.

Method for every clause: the fixture is written in the guard's own `--self-test` (literal lists asserted equal to the constant), then the clause is broken by ONE find/replace (anchor
asserted to occur exactly once and to change the file) and the break is shown red twice: by `node scripts/mutation-check.mjs --only <id>` (`PASS [<id>]` = the mutated tree's self-test
failed) and by running the mutated COPY's self-test to count its FAIL lines (so a crash is not mistaken for a catch).

Baselines at the start of this branch (its base is part A, not 9043fa75, so the self-test count is 812, not 715):
`python3 scripts/check-browser-gate.py --self-test` 812/812; `python3 scripts/check-browser-gate.py` `verdict: gated`, `--plain-commands` 70 commands.

## Classification (Rule 77: what an ordinary edit would do)

| item | class | why |
|---|---|---|
| B0, B8 (a `;` `|` `&` `(` in an echo message, or in a trailing comment, on an unreadable always() line) | REACHABLE | `echo "tried 3 times; giving up at $(date)"` and `echo "at $(date) (utc)"` are ordinary log lines; two real steps of this repo's .github flipped from kept to refused (drift-sentinel `Append to the drift log` and font-dependence-probe `Commit`) |
| A21 (a launcher after a case pattern's `)`) | CONTRIVED as an input, closed BY CONSTRUCTION | a launcher in a case arm on a line that also holds a quoted substitution; one more position in COMMAND_HEAD closes it |
| A22 (a launcher after a leading redirect) | CONTRIVED as an input, closed BY CONSTRUCTION | `>/dev/null timeout 5 ./x.sh` is unusual; the same table of positions closes it |
| A23 (`sed`, `awk`, `sort`, `tee`, `rm`, `cp`, `mv`, `uniq` read as "runs no other command") | REACHABLE for the writers (`tee`, `cp`, `mv`, `rm`: an ordinary cleanup or log line), CONTRIVED for the exec forms (`awk system()`, `sed e`); one whitelist change closes both | |
| B9 (the vacuous `xargs -r` fixture) | REACHABLE in the sense that matters: a fixture that cannot fail pins nothing | |

## Commit 1: the two ledger steps of verify-full strip the diff's `+` with `cut`, not `sed` (the real tree difference of A23)

A23 removes `sed` from BENIGN_HEADS (below), and `sed` IS used by an audited job: the `full` job of `.github/workflows/verify-full.yml` has two `if: always()` steps the guard keeps
as opaque (`not read, always() (kept): 2`), and both read the ledger's new line back with `git diff -- "$LEDGER" | grep '^+' | grep -v '^+++' | sed 's/^+//'`:

| step | line | before | after the A23 change alone |
|---|---|---|---|
| `Keep the mutation baseline` | 325 | kept | refused (`sed` can run a command: `e`, `s///e`) |
| `Record this measurement` | 384 | kept | refused |

The real tree would have stopped saying `verdict: gated` (6 problems, `could not be read (refused): 2`). Rule: the list is not weakened. The two steps are rewritten with `cut -c2-`, which
is in the list for what it does (it prints). It is the same edit: `grep '^+'` keeps only lines that start with `+`, `grep -v '^+++'` drops the diff header, and `sed 's/^+//'` removes the
first character of each; `cut -c2-` removes the first character of each. Proved, not argued:

- `node scripts/gate-ledger-step-check.mjs` runs the REAL text of the two steps against a bare origin and a racing clone: 6/6 checks passed before the edit and 6/6 after (5 scenarios,
  quiet branch, branch moved, other file dirty, no confidence line, every push refused).
- `cmp` of the two pipelines over a 7-line diff sample (unicode, an empty record, a tab, leading spaces, a `+++` header, a context and a removed line): identical bytes under
  `LC_ALL=C`, `C.UTF-8` and `en_US.UTF-8`.

This commit is on its own so it can be taken or dropped with the A23 commit that needs it (it does not depend on it: `cut` is in the list today, the real tree is `gated` with and
without it).

## Commit 2: what is quoted, and a trailing comment, is not a command (B0, B8)

`command_heads` (which `raw_line_hides` and the wrapper scan of `hides_a_launcher` both read) searched the RAW line for command positions, quotes and comment included. It now cuts the
trailing comment where bash cuts it (`strip_comment`, part A's `comment_start`) and runs `blank_quoted` first: a small stack machine in `comment_start`'s style that replaces, character for
character, the CONTENT of every quoted string with `_` (the quotes stay, so a quoted word is still one word). Single quotes and `$'...'`: all of it (a backslash escapes in the second).
Double quotes: all of it EXCEPT the body of a `$( ... )` and of a backtick pair inside, which are code and stay visible (their own quotes nest). A quote that never closes on the line (a
multi-line message, a heredoc line) is not a string: the text from it is left as it is, so more of the line is read. Arithmetic is masked first, as the splitter does.

One deliberate difference from "blank every quoted string": a quoted string that IS the command word (`"timeout" 5 x`, `"$RUNNER" x`) becomes the word `_______`, because the quotes stay.
That is a head this guard does not allow, so `echo "$(date)"; "timeout" 5 x` is refused as an unknown command rather than read as nothing. Erasing the quotes with the content would have kept
it (a quoted command word is reachable: `"$BIN" --flag`). The two finding-22 fixtures that named `"timeout" 5 x` and `'timeout' 5 x` as heads of a READABLE line (empty reasons) became
`echo "$(date)"; "timeout" 5 x` (an unreadable line, which is the only place the raw scan decides); the readable form is refused by the splitter's own reason, now also a fixture
(`"timeout" 5 node scripts/pure.mjs`).

| input (unreadable always() line) | before (674c5f99) | now |
|---|---|---|
| `echo "tried 3 times; giving up at $(date)"` (B0 a) | refused: head `giving` | kept |
| `echo "at $(date)" # note: one line; no retry` (B0 b) | refused: head `no` | kept |
| `echo "at $(date) (utc)"` (B8) | refused: head `utc` | kept |
| `echo "done; see the log $(date)"`, `echo "started $(date) \| ok"` (B8) | refused: heads `see`, `ok` | kept |
| `printf '\| %s \| %s \|\n' "$(date)"` (B8) | refused: head `%s` | kept |
| `echo "push rejected (attempt 2 of 3) at $(date)"`, `echo "record landed (sha $(git rev-parse HEAD))"` (the review's skeptic 1) | refused | kept |
| controls: `echo "note; $(date)" && npm run pure`, `echo "at $(timeout 5 x)"`, `echo "at \`timeout 5 x\`"`, `echo "$(date)"; npm run pure # a note`, `echo "a # b $(date)"; npm run pure` | refused | refused |

Self-test: 812 to 839 (`python3 scripts/check-browser-gate.py --self-test`; 27 new checks: a table of 18 `blank_quoted` inputs, a table of 8 `command_heads` lines, 12 kept, 1 for the two real
lines of drift-sentinel.yml, 12 still-refused). Against 674c5f99's `command_heads` 12 of the 27 are red (the others are the controls, which the old scan refused by accident, and the
`blank_quoted` unit table, which tests the new function).

Population (every `run` step of `.github/**` with `if: always()` and an unresolved reason in either guard; `python3 /dev/shm/r5b-scratch/population.py`, not committed): 34 steps at
48f504e against this branch (32 against 674c5f99: part A removed two from the unresolved set). Kept to refused since 48f504e: 2 before this commit, 1 after. `drift-sentinel.yml`
`Append to the drift log` is kept again. `font-dependence-probe.yml` `Commit` stays refused, for a reason unrelated to quotes: it runs `git rebase --abort`, which the guard cannot tell
from `git rebase -x` (a policy choice the review names; `GIT_READONLY` is not widened here). Neither job is audited, the real tree is unchanged: `python3 scripts/check-browser-gate.py`
`verdict: gated`, byte-identical to the output before the commit (`diff` empty), `--plain-commands` 70 commands.

Red on purpose, each `PASS [<id>]` from `node scripts/mutation-check.mjs --only <id>` and the FAIL lines of the mutated copy (a crash is not counted; none crashed):

| id | the break | failing checks |
|---|---|---|
| `browser-gate-heads-single-quote-content` | single-quoted content is not blanked | 5 |
| `browser-gate-heads-double-quote-content` | double-quoted content is not blanked | 10 |
| `browser-gate-heads-escape-in-string` | a backslash in a double-quoted string escapes nothing | 2 |
| `browser-gate-heads-escape-in-code` | a backslash outside quotes escapes nothing | 1 |
| `browser-gate-heads-substitution-body` | the body of `$( )` inside double quotes is blanked | 3 |
| `browser-gate-heads-backtick-body` | the body of a backtick pair inside double quotes is blanked | 2 |
| `browser-gate-heads-paren-count` | parentheses inside `$( )` are not counted | 1 |
| `browser-gate-heads-unterminated-visible` | a quote that never closes is blanked to the end of the line | 2 |
| `browser-gate-heads-comment-cut` | the trailing comment is not cut | 2 |
| `browser-gate-heads-quotes-blanked` | `blank_quoted` is not called | 11 |
| `browser-gate-heads-arithmetic-masked` | arithmetic is not masked before the scan | 3 |

A twelfth mutant I tried, "mask arithmetic AFTER blanking", is equivalent (the mask only matches text that blanking leaves alone) and is not in the table: an equivalent mutant is no check.
Sweep (`outbox/browser-gate-sweep-2026-11-12.mjs`, not edited): no CODE entry's find text changed (`node /dev/shm/r5b-scratch/sweep_anchors.mjs`: 13 of 428 entries are not exactly once before
and after this commit, the same 13, all from earlier rounds).

## Commit 3: where a command starts: after a case pattern's `)` and after leading redirections (A21, A22)

`COMMAND_HEAD` knew the start of the line, `; | & ( { `` ` `` !` and the words `then do else if elif while until`. It now knows two more, each a table with a pinned literal list:

- `COMMAND_CASE_STARTS = (";;", ";&", "in")` and the start of the line: a case pattern is `word)`, `(word)` or `a|b)` at one of those; the command after its `)` starts there. After `$(` it is no
  pattern (`echo $(date) now` has no head `now`). `;;&` is a `;` followed by a `;&`, so it needs no member of its own (I had written it and its mutant stayed green: an equivalent member
  removed rather than pinned).
- `COMMAND_REDIRECTS = (">>", "<<<", ">&", "<&", ">", "<")`: a leading `[N]OP TARGET` before the command word, glued or spaced, in front of or after assignments (`>/dev/null npm run x`, `2>&1 timeout 5 x`, `< file cmd`).

One more clause, found while writing the redirect one and not in the review: the `&` of `2>&1`, `>&2`, `<&0` and `&>file` is no separator. Before, `echo "at $(date)" 2>&1` and `echo "$(date)" >&2`
had the pseudo-heads `1` and `2` and were refused (a false red of the same class as B8, at 674c5f99 and at 48f504e; `>&2` ends most error lines). It is one spelling in `_SEP_SPELLING` and has its own
fixture and mutant (`browser-gate-heads-redirect-ampersand`); it is what makes `2>&1` (the task's own example) a redirect and not a command on both sides of the command word.

| input (the review's four, each on a line the splitter cannot read) | 674c5f99+B0/B8 | now | its plain control (no substitution) |
|---|---|---|---|
| `case "$(date)" in *) npm run shot ;; esac` (A21 a; `shot` is a package script that launches a browser) | kept | refused | refused: `needs a browser and must carry steps.chromium.outcome == 'success'` |
| `echo "$(date)"; >/dev/null npm run shot` (A21 b) | kept | refused | refused, same |
| `case "$(date)" in *) xvfb-run -a ./run-checks.sh ;; esac` (A22 a) | kept | refused | refused: `xvfb-run is not a command this guard can read` |
| `echo "$(date)" > /dev/null; >/dev/null timeout 5 ./x.sh` (A22 b) | kept | refused | refused: `timeout is not a command ...` |
| `echo "at $(date)" 2>&1`, `echo "$(date)" >&2` | refused (head `1`, `2`) | kept | |
| `echo x >/dev/null`, `echo "$(date)" > /dev/null`, `echo "$(date)"; > file`, `case "$(date)" in *) echo x ;; esac`, `echo "$(date)" >> log 2>&1` | kept | kept | |

Self-test: 839 to 881 (42 new checks: 2 pinned tables, 5+4 case-start inputs, 6+9 redirect inputs, the review's four with their controls, 10 kept controls, 3 real `&`/`&&` after a redirect).
Real tree: `python3 scripts/check-browser-gate.py` byte-identical to the output before this commit (`diff` empty), `verdict: gated`, `--plain-commands` 70. Population: unchanged from the previous commit
(34 steps against 48f504e: 1 kept to refused, `font-dependence-probe.yml` `Commit`, for `git rebase --abort`). Sweep: no CODE entry's find text changed (the same 13 of 428 entries that are
not exactly once, all from earlier rounds).

Red on purpose (`PASS [<id>]` from `node scripts/mutation-check.mjs --only <id>`; failing checks of the mutated copy):

| id | the break | failing checks |
|---|---|---|
| `browser-gate-heads-case-start-in` | `in` is not a start | 8 |
| `browser-gate-heads-case-start-double-semicolon` | `;;` is not a start | 3 |
| `browser-gate-heads-case-start-semicolon-ampersand` | `;&` is not a start | 2 |
| `browser-gate-heads-case-start-line` | the start of a line is not a start | 1 |
| `browser-gate-heads-case-paren` | `(word)` is no pattern | 1 |
| `browser-gate-heads-case-alternatives` | `a|b)` is no pattern | 3 |
| `browser-gate-heads-redirect-append` | `>>` is not a redirection | 2 |
| `browser-gate-heads-redirect-here-string` | `<<<` is not a redirection | 2 |
| `browser-gate-heads-redirect-dup-out` | `>&` is not a redirection | 4 |
| `browser-gate-heads-redirect-dup-in` | `<&` is not a redirection | 2 |
| `browser-gate-heads-redirect-out` | `>` is not a redirection | 12 |
| `browser-gate-heads-redirect-in` | `<` is not a redirection | 2 |
| `browser-gate-heads-redirect-fd` | a file descriptor is no part of one | 3 |
| `browser-gate-heads-redirect-spaced` | the target must be glued to the operator | 3 |
| `browser-gate-heads-redirect-in-prefix` | redirections are not read before the command word | 17 |
| `browser-gate-heads-redirect-ampersand` | the `&` of `2>&1` is a separator | 3 |

## Commit 4: the benign tools only print, count, compare, list or create (A23)

`BENIGN_HEADS` is what an unreadable always() step may use and stay opaque (the reason `\`X\` is not a command this guard can read` is benign for these, and so is a head of these on a raw line). It held
tools that run another command from their arguments and tools that overwrite a file the guard has already read. Each tool decided by what it does, probed in this sandbox (`--help`, and a run for the
positive controls), not by habit.

Removed (8 of the 32 that were in the list):

| tool | why it is not benign | the control |
|---|---|---|
| `sed` | the `e` command and the `s///e` flag run a command; `-i` and `w` write files | `printf 'x\n' \| sed 's/x/echo RAN_BY_SED_E/e'` printed `RAN_BY_SED_E` |
| `awk` | `system()` and a pipe to a command run one | `awk 'BEGIN{system("echo RAN_BY_AWK")}'` printed `RAN_BY_AWK` |
| `sort` | `--compress-program=PROG` runs a program; `-o FILE` overwrites a file | `--help` lists both |
| `uniq` | the second operand, `uniq IN OUT`, is a file it overwrites | `--help`: `uniq [OPTION]... [INPUT [OUTPUT]]` |
| `tee` | overwrites every file it is given | `echo hi \| tee F` wrote F |
| `rm` | deletes a script the guard has read | |
| `cp`, `mv` | overwrite a script the guard has read | |

Kept (24), each with the one line of why (also in the comment at `BENIGN_HEADS`): `mktemp` makes a NEW file or directory, never replaces one; `grep`, `egrep`, `fgrep` print matching lines (no exec,
no output file); `read` is a builtin that puts one line in shell variables; `cat`, `cut`, `tr`, `head`, `tail`, `tac` print; `wc` counts; `date`, `basename`, `dirname`, `stat`, `ls` print; `mkdir` makes a
directory, never replaces a file; `sleep` and `wait` wait; `jq` filters JSON (jq 1.7: no exec, no write); `diff` and `cmp` compare; `touch` creates an empty file or sets a time, never changes the content of
one that is there. Probe: `--help` of the 22 external tools of the 24 (`read` and `wait` are builtins) for an exec, in-place or output-file option: 22 of 22 have none (the two hits were grep's `-o,
--only-matching` and cut's `--output-delimiter`, which write no file). The tools the review names that were never in the list (`find`, `xargs`, `env`, `tar`, `install`, `dd`, `ln`, `gawk`, `mawk`) are
pinned as not benign and refused (9 of 9), so a later edit cannot add one.

REAL TREE DIFFERENCE (audited jobs): of the 32 `if: always()` run steps of `.github/**` that have an unresolved reason, 2 are in an audited job (the four targets: `verify` of verify.yml, `live` of
live-check.yml, the mutation-shard composite action, `full` of verify-full.yml), and both are `full`'s: `Keep the mutation baseline` and `Record this measurement` of verify-full.yml (`sed 's/^+//'`).
With the workflows as at 674c5f99 the new guard reads them as refused and the real tree stops saying `verdict: gated` (`FAIL: 6 problem(s)`, exit 1, run in a copy of that tree). The list is not weakened:
commit 1 rewrote the two lines with `cut -c2-`, and with it the real tree is byte-identical to before this whole series (`verdict: gated`, `--plain-commands` 70). Other differences, all in jobs the
guard does not classify (an exempt install site's always() steps are not read for opacity): `alternate-colour-probe.yml` `Why the remaining cards stay plain` and `Spellings that resolve to nothing`,
`font-dependence-probe.yml` `The verdicts`: each ends `| tee outbox/...` (`tee -a "$GITHUB_STEP_SUMMARY"`), now refused. That is the cost of the decision: a step that pipes into `tee FILE` under
always() in an audited job is refused; the remedy is a redirect (`> FILE`), which the splitter reads (fixture). Against 48f504e: 34 steps, 4 kept to refused (those three and
`font-dependence-probe.yml` `Commit`, which is `git rebase --abort`), and `drift-sentinel.yml` `Append to the drift log` back to kept.

Self-test: 881 to 906 (25 new checks: the raw-line family of the 24, the literal list of the 8, one per removed tool for its three shapes, 12 inputs the review names or implies, the redirect remedy,
the never-benign list). The ledger-kind fixture used `sed s/a/b/` and now uses `cut -d, -f1`; the pinned list of `BENIGN_HEADS` is the 24.

Red on purpose (`PASS [<id>]` from `node scripts/mutation-check.mjs --only <id>`; failing checks of the mutated copy): each puts ONE tool back.

| id | the break | failing checks |
|---|---|---|
| `browser-gate-benign-sed` | `sed` is benign again | 7 |
| `browser-gate-benign-awk` | `awk` | 5 |
| `browser-gate-benign-sort` | `sort` | 6 |
| `browser-gate-benign-uniq` | `uniq` | 5 |
| `browser-gate-benign-tee` | `tee` | 6 |
| `browser-gate-benign-rm` | `rm` | 5 |
| `browser-gate-benign-cp` | `cp` | 5 |
| `browser-gate-benign-mv` | `mv` | 5 |
| `browser-gate-benign-find` | `find` (never in the list) | 3 |
| `browser-gate-benign-raw-line` | the raw-line scan no longer allows the benign list | 25 |

Sweep (`outbox/browser-gate-sweep-2026-11-12.mjs`, not edited): four CODE entries now have a find text that is not in the guard, because their anchor is the whole old `BENIGN_HEADS` literal:
`` `mktemp` is not an ordinary head ``, `` `grep` is not an ordinary head ``, `` `sed` is not an ordinary head `` and `` `read` is not an ordinary head `` (13 of 428 not exactly once before, 17
after). `sed` is no longer a member, so its entry has nothing to remove and should be dropped; the other three need the new literal as their anchor. No entry for `COMMAND_HEAD`, `command_heads`,
`raw_line_hides` or `hides_a_launcher` changed its find text.
