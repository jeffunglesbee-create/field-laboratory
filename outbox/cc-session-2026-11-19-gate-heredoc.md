# CC session 2026-11-19 — the browser gate guard reads heredocs and strings that span lines

Scope: `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`, item 1 (APPROVED to build by the owner, 2026-11-18). Repo field-laboratory, work branch `gate-items-2-7`. Landed on `main`: see the last row of the table.

The branch `gate-items-2-7` named here, and the shas of its commits cited below, are kept as the tag `archive/gate-items-2-7` (the branch was deleted 2026-11-23: `outbox/branch-cleanup-2026-11-23.md`): `git fetch origin 'refs/tags/archive/*:refs/tags/archive/*'`.

## HEAD progression

| step | sha | state |
|---|---|---|
| start | `39459bd2` | `main` after the items 2 to 7 closure and the proof branches' deletion |
| feature | `1806bf8a` | the guard reads a data heredoc and a string that spans lines; self-test 1045/1045 |
| review 1 | workflow `wf_e852d66e-255` | 4 lenses, 66 agents, 2 skeptics per finding: 25 findings confirmed, 6 refuted |
| fix round 1 | `0f1182bf`, `7e31228a` | the 25 findings fixed in the same design; self-test 1123/1123 |
| review 2 | workflow `wf_c6a2a2b4-b6b` | 5 lenses, 103 agents, 3.9 h: 48 findings confirmed (5 root causes), 1 refuted |
| fix round 2 | `aa048d40` | a carried scan state through the whole script; self-test 1244/1244 |
| sweep and fuzz fixes | `c518887f`, `743d3e02`, `cae4c0af`, `c95eebcf` | 25 mutants the sweep did not catch fixed; the fuzz at volume found one more false green (a backslash-newline joined with a space); self-test 1278/1278 |
| Rule 42 | `016b0c9a` | the carried-state reader REPLACED by a strict one (below); self-test 1288/1288 |
| review 3 | workflow `wf_a221fda7-c68` | 5 lenses, 67 agents, 4.6 h, 2 skeptics per finding: 28 findings confirmed, 3 refuted (as known) |
| narrowing | `1e86e68d` and after | the bracket stack REMOVED; a line that holds an arithmetic command, a `$[ ]`, a subscript, a `<( )`, a `>( )` or an array literal is not trusted; the line that closes a joined string is judged; odd blanks read as letters; self-test 1363/1363 |
| review 4 | workflow `wf_2947ccfb-10f` | 4 lenses, 54 agents, 3.7 h, 2 or 3 skeptics per finding: 22 findings confirmed, 3 refuted; 9 were false greens, 6 of them new with this item |
| review-4 fixes | `58dee9bc`, `92334d5d` | a `[[` with a `(` after it is a stop; a backslash-joined line is scanned whole; a heredoc that is not data stops the trust; odd blanks written as U+FFFD, in `hides_a_launcher` too; a NUL refused; rows for T4-1 to T4-4, SS-5; the oracle ignores SIGPIPE; self-test 1425/1425 |
| landed | `2f841c5e` (squash commit `25065d4b` on `main` 799c872c, then the ledger of the scored run) | scored `verify-full` run `44637826337`: earned 530 of 530, failing [], skipped [], notApplicable [], mutation baseline failing 0, 8 of 8 shards |
| why a squash | `25065d4b` | the first scored run (`44625526303`, head `443b40a0` of `gate-items-2-7`) failed on the row `every governed commit paired source with outbox`: it walks every commit and `7e31228` and `92334d5` of this branch changed `scripts/` with no outbox entry. Shard 6 stopped at its baseline on that row. History is not rewritten: the squash commit pairs source with outbox in one commit, and `gate-items-2-7` keeps the 28 commits it replaces |

## Why the design was replaced (Rule 42)

The owner invoked Rule 42 (a fix that has not worked after three attempts: stop, look at what the system shows, change the approach). What the system showed: review 1 confirmed 25 findings, review 2 confirmed 48 in five root causes, the mutant sweep then found 25 clauses that were masked, dead or crashing, and the 100000-script `gen2` run found one more false green, in a design that had grown a carried scan state, a bracket stack, a risk flag and an after-operator rule, each added to answer the last round and each a new place where the model and bash could differ. The real need is tiny: the probe reads 407 run steps, 1 has a heredoc operator and 2 have a multi-line string. And the guard's own principle is a closed grammar that fails closed; the carried-state reader was a model of bash.

## The reader now

Everything it trusts is checkable on one logical line from a fresh state; everything else falls back to the parent's behaviour for the rest of the step (read line by line; a heredoc is refused as 'a heredoc').

1. Each logical line is scanned from a fresh `_Open` (the openers `'`, `"`, `$'`, `${`, `$(`, a backtick, and the parentheses of each `$(`). Nothing is carried to the next logical line. There is no bracket stack (the second review's `brk` and the third review's findings in it are gone with it).
2. A line that leaves anything open (`st.stack`), holds an EXOTIC form outside quotes (`_exotic`, on `blank_quoted`'s view: an arithmetic command `((` that is not `$((`, a `$[`, a subscript `\w[`, a process substitution `<(` or `>(`, an array `=(`), or holds a substitution that is not flat (`_flat_subs`), stops the joining of strings and the reading of heredocs for the rest of the step, and the operator on that line is not read either.
3. A heredoc operator is read only at the top level of its line (a fresh scan up to it leaves nothing open, and no `{` is unmatched on the line). Its reader must be one of `cat`, `tee`, `grep`, `wc`, `tr`, `jq`.
4. A string that spans lines is joined while only a plain quote is open at the end of a line and the physical line (with what a backslash joined to it, in the quote its segment started in: `seg`) is flat once `blank_quoted` has blanked what is in quotes. The line that CLOSES the string is judged the same way, and a closing line that is not flat un-joins the string (it is re-read from its first line with joining and heredocs off).
5. An unquoted body line with a `$(` or backtick is given back as `echo "<line>"` only when it has no `"`, is flat, and no body line ends in a backslash. A substitution is flat (`FLAT_SUB`) when it closes on the line and holds no quote, parenthesis, `#`, `<`, `>`, backslash, brace, bracket or `case`.
6. A backslash-newline joins with nothing (as bash does); the `#` of a joined line begins a comment only after a blank or a separator; a backslash followed by a blank is no continuation. A line ends at a newline only; only space and tab are blanks in `command_lines` and `_scan`; `$$` is the process id in `_scan` and `blank_quoted`.
7. `_odd_to_word`: every other `str.isspace()` character outside quotes (a carriage return, a form feed, a vertical tab, FS to US, NEL, NBSP, U+2028, U+2029, U+2000 to U+200A, U+3000) is written as a letter where a line is read for its commands (`read_commands`, `command_heads`), because bash reads it as part of a word and shlex and `COMMAND_HEAD`'s `\s` read it as a blank (the third review's SF-2; it also closes the NBSP and ideographic-space forms the parent accepted).
8. (review 4) A `[[` with a `(` that no `$` precedes, after it on its line, is EXOTIC: a regex group or an extglob pattern holds `<<EOF` as text. A `[[ ]]` test with only a `"$(date)"` in it is not a stop.
9. (review 4) A logical line that a backslash joined is scanned whole (`$` + `{` is `${` once they are one line), not as the physical halves.
10. (review 4) A heredoc that is not read as data stops the trust for the rest of the step. A script with a NUL byte is refused (bash drops it). `_odd_to_word` writes the odd blank as U+FFFD (`ODD_WORD`), not as a letter: with `x` a script or package script `a<NBSP>b` was read as the benign `axb`; `hides_a_launcher` reads the line as `read_commands` does.

Design costs, chosen, recorded in the residual CC-CMD (item 1, 1g): a heredoc, or a string that spans lines, after a line that leaves anything open (`x=$(` ... `)`, a multi-line `"$( )"`, a multi-line `[[ ]]`, a `$( )` with a comment line in it), that holds an EXOTIC form (`(( i++ ))`, `a=(1 2)`, an unquoted `${arr[0]}` or `f[0-9]`) or a substitution that is not flat (`X=$(cat "$F")`, `echo "built $(date -u +"%F")"`, `$(echo ${v})`, a comment that mentions a quote and a substitution) is refused as at the parent; a body line with escaped backticks or a quote is code; a reader outside the six is code; `echo $((1<<2))` is refused; CRLF heredocs are code. Compared on 20 ordinary step shapes (a summary heredoc, an `if` ladder, a `for` loop, a subshell, a group, a multi-line commit message with and without a backtick, a heading with `$(date)` or `$((N))`, a quoted-delimiter body, a continued line before a heredoc), the carried-state reader and the strict one differ in 4 (each has a multi-line `$( )` before the heredoc or string), and the real tree has none (probe below).

## What reviews 1 and 2 found, and what the rework does about it

Review 1 (25 findings against `1806bf8a`): a multi-line `"$( )"` whose closing line opened a phantom string; a heredoc in `$( )` closed by `EOF)`; `<<WORD` in `(( ))`, `${ }`, `$(( ))`, `$[ ]`; `splitlines` ending a line at a form feed; a `#` or `case` pattern holding the `)` of a `$( )`; `$$'` read as ANSI-C; test gaps; a quadratic join. Review 2 (48 findings against `7e31228a`, dossier in `outbox/guard-heredoc-review-2-2026-11-19.md`), by root cause:

| root cause | findings | what the strict reader does |
|---|---|---|
| what an earlier line left open was dropped at each logical line | OPS-1, OPS-2, SJ2-1, SJ2-2, SJ2-3, F01, F02, DW-1, DW-2, DW-12 | any line that leaves something open stops heredoc and string reading for the rest of the step: by construction there is no operator judged in a carried context |
| the operator's line opens a `$(` after the operator, or two operators with one inside a `$( )` | OPS-4, OPS-6, DW-3 | an operator is read only at top level, and the line must leave nothing open |
| the bracket test counted characters, so a stray closer balanced an open `$[ ]` or `(( ))` | OPS-3, DW-4 | `_scan` keeps `brk` (a closer with nothing to close is a literal) |
| a regex over the whole line judged `#`, `<<` and `case` in a `$( )` | OPS-5, OPS-9, RG-1, RG-2, RG-4, DW-5, DW-9 | the flat predicate judges the substitution alone, on the line with quoted text blanked |
| blanks and `$$` in two scanners | OPS-8, SJ2-4, SJ2-5, DW-6, DW-7 | only space and tab are blanks; `$$` in both scanners |
| tests, cost, doc | OPS-10, F03 to F13, SJ2-7, SJ2-8, DW-13 | rows, fixtures, entries for what is left; many operators on one line are linear; counts below measured |

Still accepted, pre-existing at the parent, recorded in the residual CC-CMD item 1 (1a to 1g) with the input that passes: a line that starts inside an open `"$(` is read from scratch (`BASE="$(` / `date` / `)" mark_ran`), a `#` in a multi-line `${ }`, `cat \<;mark_ran`, a leading `<<E mark_ran`, a whole-line `#` and a quote inside a backtick pair. After a stop the rest of the step is read as the parent read it, with those weaknesses.

## What review 3 found, and what the narrowing does about it

Review 3 (workflow `wf_a221fda7-c68` of `0ba7f399`, 5 lenses, 67 agents, 4.6 h; dossier `outbox/guard-heredoc-review-3-2026-11-19.md`): 31 findings reported, 28 confirmed by two skeptics each, 3 refuted as known (CL-5, SF-5, DW-3: the lines read after a stop). By root cause:

| root cause | findings | what was done |
|---|---|---|
| the bracket stack `brk` was a model of bash: the `)` of a plain subshell popped the `((`, a `)` that closed a `$(` dropped a `[`, a `#` after the `)` of `<( )` or an array was a comment, `a=(` was not tracked | CL-1, CL-2, CL-3 (heredoc forms), CL-6 | REMOVED. A line that holds `((`, `$[`, a subscript, `<(`, `>(` or `=(` outside quotes is not trusted (`EXOTIC`), and the operator on it is not read |
| a `)` in a `${ }` or a `$[ ]` in a flat `$( )` closed it early for `FLAT_SUB` and `blank_quoted`, and the line that closes a joined string was not judged at all | CL-4, SF-1, DW-1 | `_FLAT` excludes braces and brackets; the closing line is judged like the lines before it |
| shlex reads a carriage return as a blank, `COMMAND_HEAD`'s `\s` all `isspace()` characters, bash none of them | SF-2 | `_odd_to_word` (item 7 above) |
| accepted at the parent too, and not this change's | SF-3, SF-4, SF-6, DW-2, DW-4, DW-5, CL-3 (the form with no heredoc) | recorded in the residual CC-CMD, 1f and item 4, with the inputs; the multi-line forms of SF-3 and SF-6 are a new surface of an old root cause and are recorded as that |
| false reds, design costs | R1, R2, R3 | recorded, 1g; measured on the real tree (none) |
| tests, fuzz, docs | TT-1 to TT-7, SF-7, SF-8, DW-6, R4 | rows and mutation entries for every clause the review named (the sweep below), `gen4`, a deterministic oracle, the REACHED lines, stale labels and comments, the cost measured |

## Found after review 3

- Mutants with no separating script, deleted as entries with the reason (the clause stays): `ctx-stack-single`, `-double`, `-backtick` (the splitter puts the marker inside a quoted token or raises on the backtick, so an operator in a quote or a backtick pair is code with or without the clause); `rewind-quote` (a rewind of the last line that re-reads the same lines: the output is identical); `rewind-joining` (without the conjunct the rewind repeats at the last line forever once strings are no longer joined: a hang on an input no row has, not a failed check).
- Mutants the sweep found uncaught after the first round of rows, each now caught by a row: `ctx-stack-param` (a stray `}` before a `${`), `close-line-no-seg`, `ctx-scan-short` (an operator right behind a `${`), `seg-reset` (found by a search for a separating script: a line after a joined single-quoted string), `odd-blank-tab`.

## What review 4 found, and what was done

Review 4 (workflow `wf_2947ccfb-10f` of `652b23e7`; 4 lenses, 54 agents, 3.7 h; dossier with every finding verbatim: `outbox/guard-heredoc-review-4-2026-11-19.md`): 22 confirmed, 3 refuted (SS-4 and T4-9, the unterminated heredoc with a `#` body line, which is the recorded 1e; RD-4, the design costs). The fixes are in `58dee9bc` and `92334d5d`; each has pinned rows and a mutation entry that goes red (14 new entries and 9 repointed ones, all caught by the isolated-copy runner; the full sweep below).

| finding | what it was | what was done |
|---|---|---|
| EC-1 | new: `[[ x =~ (true|cat <<EOF)true ]]` and `@(`: `<<EOF` is text, the lines after it run | item 8 above; entries `exotic-dbl-bracket`, `exotic-dbl-bracket-lookbehind` |
| RD-1 | new: `$` + backslash-newline + `{`, `'` or `$'` is not an opener when scanned by halves | item 9; entry `join-rescan` |
| RD-2 | new in part: after a heredoc not read as data the reader resumed trust at the guard's terminator | item 10; entry `code-heredoc-stop`. What remains is the parent's line-by-line reading of a string that spans lines in an always() step: recorded, residual 1e |
| RD-3 | new: a NUL byte (reachable through a double-quoted YAML `\0`) | refused; entry `nul-refused` |
| SS-1 | new: `hides_a_launcher` split the raw line, `read_commands` the rewritten one: `echo a >CR<< x; mark_ran` in an always() step | item 10; entry `hides-odd-word` |
| SS-2 | new: the odd blank written as `x` renamed the word (`npm run a<NBSP>b` read `axb`) | `ODD_WORD`; entry `odd-word-letter` |
| EC-2, SS-3, RD-6 | accepted by the parent too: a `#` line in a multi-line `[[ ]]` regex group; a quoted word that is exactly a redirect operator (`echo ">" && mark_ran`); `<()mark_ran` and `test -v 'a[$(mark_ran)]'` | recorded, residual CC-CMD 1b, 1f and item 4 |
| T4-1 to T4-4, SS-5 | test gaps | rows for each separating script the review gave; one row per odd blank (all 26); entries `close-line-physical`, `brace-whole-line`, `brace-any-open`, `exotic-alnum-subscript`, `exotic-array-plus`, `exotic-subscript-then-blank`, `odd-set-narrow` |
| T4-5 | 33 of 265 pinned rows kill no mutant; no kill matrix | the matrix of the final sweep is in `outbox/guard-heredoc-kill-matrix-2026-11-19.txt` (315 entries, each with a recorded kill; 40 of the 283 `command_lines:` rows fail under no mutant of the table); the rows are listed there, not relabelled: recorded, residual 1h |
| T4-6, T4-10, RD-5 | labels and claims the artifacts do not support | the comment of the two subscript rows now says they run no `mark_ran` and kill no mutant; the fuzz artifact was re-run at the head; this note and the residual CC-CMD hold what they said they held. Commit messages are not rewritten: `652b23e7` said 30 entries were added or repointed (its diff adds none and deletes 3), `1e86e68d` said 38 (adds 41, changes 18, removes 17) |
| T4-7 | the oracle was still nondeterministic: the cause is SIGPIPE | `restore_signals=False`; the 12 seeds, 30 runs each: 0/30 or 30/30 (`outbox/guard-heredoc-fuzz-2026-11-19.txt`); before: 19/30, 28/30, 14/30, 29/30 on four of them |
| T4-8, RD-7 | gen4 cannot see three of the clauses; it cannot draw a NUL | recorded, residual 1h2; the clauses are pinned by rows and entries (the fuzz artifact says so) |
| SS-6 | reading one long joined string costs about twice the parent's | measured, residual 1i |

## Found after review 2

- The mutant sweep of the 171 heredoc and string entries on `aa048d40`: 146 caught, 25 not (13 masked or unpinned clauses, 6 crashes, 1 dead return value, 5 equivalent mutants). All 25 were looked at; none was explained away. Several masked clauses were masked because the reader of an operator inside a quote or a substitution is not found, so the operator is code with or without the clause: the clause then has no row that can reach it from one line, which is part of why the strict reader is simpler.
- `gen2` at 100000 scripts (seed 2035603) found a script bash runs and that `1806bf8a` to the carried-state reader accepted (the parent refused it): `echo a` + backslash-newline + `# don't edit the line above` is the word `a#...` to bash, with no comment, so the apostrophe opens a string; the reader joined with a space and read a comment. A continuation joins with nothing since `c95eebcf`; this also closed `echo "a $` + backslash-newline + `(mark_ran)"`, which review 2 had recorded as pre-existing.
- The first version of the strict reader took the quote a joined string line starts in from the physical line; a mutant (`browser-gate-join-flat-physical`) showed that is wrong after a continuation. `seg` fixes it.

### Built, tried and dropped

- Joining a multi-line `"$( )"` into one logical line (to close `BASE="$(` / `date` / `)" mark_ran`): the newline inside the `$( )` is a command separator and the readers take it for a space, so `x="$(` / `true` / `mark_ran` / `)"` was then accepted. Reverted before any commit.

## Verified in this session (guard at `4d255064`, bash 5.2.21)

- `python3 scripts/check-browser-gate.py --self-test`: 1425/1425. `python3 scripts/check-browser-gate.py`: `verdict: gated`. `node scripts/mutation-check.mjs --anchors`: `checked 2162 of 2165 mutation anchors; 0 stale`.
- The review-4 inputs (19 of the dossier, plus 2 controls that are accepted at both: a message over lines and a `[[ -n "$(date)" ]]` test before a data heredoc; each run in bash as a script file under `-e -o pipefail` for the dossier, read by `652b23e7` and by the head, plain step and always() step: `read_step` plus `hides_a_launcher`): `652b23e7` accepted all 19 in at least one of the two modes; the head refuses 17 in both. The other 2 are the RD-2 string over lines (`echo "<<true x"` and `echo '<<true x'` / `echo "a` / `true` / `echo x" ; mark_ran ; echo "` / `"`), which the head accepts in an always() step as the parent does (recorded, residual 1e).
- Mutation: the full table, 325 entries at `92334d5d`, in the isolated-copy runner: 314 caught, 11 survived. Ten were mutants of the `bound` flag, which nothing read once a joined line was scanned whole: the flag and the 10 entries were removed (dead code, Rule 63). One (`odd-blank-read-heads`) needed a row: added, now caught. 315 entries, each with a recorded kill (`outbox/guard-heredoc-kill-matrix-2026-11-19.txt`); 40 of the 283 `command_lines:` rows fail under no mutant of the table (listed there).
- The removal of `bound` changes no reading: `command_lines` of `58dee9bc` and of `4d255064` on 120000 generated scripts (gen, gen2, gen3, gen4, 30000 each): 0 differences.
- Differential fuzz against bash, 50000 scripts per generator, at `58dee9bc` (`outbox/guard-heredoc-fuzz-2026-11-19.txt`): 0 accepted scripts whose marker ran in every mode (the marker ran in 27832 of gen, 13218 of gen2, 5293 of gen3, 24187 of gen4; the head accepted 7295, 5427, 3709 and 2864). Controls (gen4, 20000 scripts): `0ba7f399` 1181 violations, the head without the exotic stop 46, without the closing-line check 239; the three review-4 controls (no whole-line scan, `_odd_to_word` off, no stop after a heredoc that is not data) 0, so the fuzz does not decide those three clauses: rows and entries do (the artifact says so).
- Oracle determinism: the 12 seeds of the third review's dossier, 30 runs each: 0/30 or 30/30 on all 12 (before, with SIGPIPE at its default: 19/30, 28/30, 14/30, 29/30 on four of them).
- Real tree, `outbox/guard-heredoc-probe-2026-11-19.py` against the `39459bd2` guard: `checked 407 of 407 run steps`; 1 heredoc, 2 strings over lines, 46 steps that differ only in the blank where a backslash joined two lines, 2 that differ otherwise (the multi-line `node -e` steps of `mutation-ids-probe.yml` and `open-meteo-egress-probe.yml`, outside the audited jobs); the output is identical to the one at `016b0c9a`.
- Cost, `python3 scripts/check-browser-gate.py --self-test`, user plus system CPU seconds, at a load of about 10 (inflated): head 24.7 + 4.0, parent 14.8 + 2.8; wall 51.5 s and 31.7 s. At a load of 7 to 8 earlier: parent 18.6, `0ba7f399` 26.3, head 27.3 CPU-s. The hook budget of `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md` was 2.7 s at its filing and the parent already exceeds it; this item's share is about 10 CPU-s of the self-test. One long string that spans lines costs about twice the parent's (residual 1i).

## Not verified

- No fifth review was run. Reviews 1 to 4 confirmed 25, 48, 28 and 22 findings; review 4's fixes are checked by their rows, entries, the sweep, the equivalence run and the volume fuzz, not by a fresh independent read of the head.
- The fuzz artifact is the run at `58dee9bc`; the head differs from it by the removal of `bound` (0 differences on 120000 scripts, above), not by a re-run.
- The scored `verify-full` (530/530) and the landing on `main` are in the last rows of the table. The `verify` and `guards` runs on the landing push are read after it (the residual CC-CMD's closure paragraph holds the result).
- Two commits of `gate-items-2-7` (`7e31228`, `92334d5`) broke the per-commit pairing rule, and no check run here before the first scored run caught it: `node scripts/history-check.mjs` was not part of the local routine. It is now (it passes on the landed history).

- After the landing: the push's `verify` run `44649181259` (head `2f841c5e`) failed on one step, `Doc citations are anchored, not just numbered`: this note's dossier `outbox/guard-heredoc-review-3-2026-11-19.md` held two `path:line` citations of a guard line that later edits had rewritten (1 bare citation against a budget of 0), and steps 79 to 90 were skipped because of it; `guards` `44649181321` and `44649217614` failed on the same step. Fixed in `12da9c20` (the citations name `0ba7f399`, the guard they describe), `guards` run `44649385183` passed on it, and a dispatched `verify` run `44650893844` passed on `c43f748c` (the head that carries the fix; the fix is docs-only and so triggered no `verify` run of its own). Cause: `node scripts/check-doc-citations.mjs` was not in the local routine before the push; it is now (all 13 `guards` steps run locally before a push).
