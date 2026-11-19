# CC session 2026-11-19 — the browser gate guard reads heredocs and strings that span lines

Scope: `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`, item 1 (APPROVED to build by the owner, 2026-11-18). Repo field-laboratory, work branch `gate-items-2-7`, not yet on `main`: this note is written in its in-progress state and is rewritten with the final numbers before the landing.

## HEAD progression

| step | sha | state |
|---|---|---|
| start | `39459bd2` | `main` after the items 2 to 7 closure and the proof branches' deletion |
| feature | `1806bf8a` | the guard reads a data heredoc and a string that spans lines; self-test 1045/1045 |
| review 1 | workflow `wf_e852d66e-255` | 4 lenses, 66 agents, 2 skeptics per finding: 25 findings confirmed, 6 refuted |
| fix round 1 | `0f1182bf`, `7e31228a` | the 25 findings fixed; self-test 1123/1123 |
| review 2 | workflow `wf_c6a2a2b4-b6b` | 5 lenses, 103 agents, 3.9 h: 48 findings confirmed (5 root causes), 1 refuted |
| fix round 2 | this commit | the root causes fixed (below); self-test 1244/1244 |
| review 3 | not run yet | to run on the commit that follows this one |
| final | not yet | the scored `verify-full` and the landing on `main` come after review 3 |

## What review 1 found (against `1806bf8a`) and fix round 1 did

REACHABLE: a multi-line `"$( )"` whose closing line `)"` opened a phantom string that hid the commands below it; a heredoc inside `$( )` closed by `EOF)` swallowed everything up to a later bare `EOF` (written on one line, `V=$(cat <<EOF`); five echo give-back mutants survived the self-test. CONTRIVED: `<<WORD` inside `(( ))`, `${ }`, `$(( ))`, `$[ ]`, `$'...'`; `splitlines` ending a line at a form feed, U+2028 or a lone CR; a `#` or a `case` pattern holding the `)` of a `$( )`; a quoted string and a substitution open at once; a backslash inside the operator; `$$'` read as an ANSI-C opener. Test gaps, a doc claim, a quadratic join (2000 lines took 10 s). Fix round 1: a line ends at `\n` only; `_scan` carries a string's state from line to line (linear); `RISKY_IN_SUB`; operator contexts; the continuation rules. Repro set of the 25: 30 violations at `1806bf8a`, 0 after.

## What review 2 found (against `7e31228a`) and fix round 2 did

48 confirmed findings with five root causes (the dossier: `outbox/guard-heredoc-review-2-2026-11-19.md`). Each was reproduced with bash 5.2.21 running a marker function, and each false green was run at the parent, `1806bf8a` and the head.

| root cause | findings | class | fix round 2 |
|---|---|---|---|
| what an earlier physical line left open (`$(`, `${`, a backtick, `((`, `$[`, `<(`) was dropped at every logical line, so an operator on the next line was judged as if at the top level: `V=$(` / `cat <<EOF` / `x` / `EOF)` / `mark_ran` | OPS-1, OPS-2, SJ2-1, SJ2-2, SJ2-3, F01, F02, DW-1, DW-2, DW-12 | 4 REACHABLE, rest CONTRIVED, false green | `_Open` carried through the whole script; each operator is judged from the state at the start of its logical line plus its line up to it |
| the operator's own line leaves a `$(` open after the operator (`cat <<EOF $(` / `mark_ran` / `)`), or has a second operator inside a `$( )` (bash reads the inner body first) | OPS-4, OPS-6, DW-3 | CONTRIVED, false green | the line must not open a frame after its last operator; two operators with one inside a `$( )` are code |
| the bracket test counted characters, so a stray `]` or `\)` balanced an open `$[ ]` or `(( ))` | OPS-3, DW-4 | CONTRIVED, false green | `_scan` keeps `brk` (a `[`, the second `(` of a `((`, the `(` of `<(` and `>(`); a closer with nothing to close is a literal |
| `RISKY_IN_SUB` was a regex over the whole line: it missed a `#` that hides the `)` on the operator's line and refused every commit message with a backtick and a `#` | OPS-5, OPS-9, RG-1, RG-2, RG-4, DW-5, DW-9 | 3 REACHABLE false reds, rest CONTRIVED false greens | `risk` is set by `_scan` where bash reads a `$( )` differently from how its parentheses are counted: a `#` that begins a word with a parenthesis after it, the word `case`, a `<<` in the `$( )` of a string. Sticky |
| two scanners disagreed with bash on blanks and `$$`: any Unicode space began a word before `#`; `blank_quoted` read `$$'` as `$'` | OPS-8, SJ2-4, SJ2-5, DW-6, DW-7 | CONTRIVED, false green, present at the parent | only space and tab are blanks; `$$` is the process id in `blank_quoted` |
| tests: no row, fixture, mutation entry or generator drew an opener on one line and its operator on the next | OPS-10, F03 to F10, F12, F13, DW-12 | TEST-GAP | 71 rows, 49 refusal fixtures, a cost check, 59 mutation entries (25 repointed, 5 removed), `gen3` in the fuzz |
| cost: many operators on one line was cubic (1280 operators took 9.1 s) | SJ2-7 | COSMETIC | incremental scan: 0.1 s |
| docs: the commit message and this note said 51 rows were added; 57 were | SJ2-8, F11, DW-13 | DOC | counts below measured |

Refuted by the skeptics: RG-5 (the note said 1122/1122 at the commit that added 56 entries; the head prints 1123/1123 because `7e31228a` added a row).

Not fixed, pre-existing at the parent, recorded in the residual CC-CMD item 1 (1a to 1g) with the input that still passes: a line that starts inside an open `"$(` is read from scratch (`BASE="$(` / `date` / `)" mark_ran`), a `#` in a multi-line `${ }`, `cat \<;mark_ran`, a leading `<<E mark_ran`, a whole-line `#` and a quote inside a backtick pair, the desync after a risk stop. RG-3 (`{ cat <<EOF; } >> f` is code) is a chosen design cost.

### Built, tried and dropped in fix round 2

- Joining a mixed `"$(` ... `)"` into one logical line would have closed the `)" cmd` finding (DW-10) too. Built, run against 14 shapes, dropped: the newline inside the `$( )` is a command separator and the readers take it for a space, so `x="$(` / `true` / `mark_ran` / `)"` was then accepted (a new false green). Reverted before any commit.
- The stop after a quote-and-substitution state (`_quote_mixed`) is gone: with the state carried, an operator inside the construct is code by the context check, and what follows its closing line is read normally. A data heredoc after a multi-line `OUT="$(` ... `)"` (the ordinary summary shape) is read; before it was refused.
- A plain `( )` subshell is a heredoc context like any other and is no longer code (`(` / `cat <<EOF` / `x` / `EOF` / `)` was data at `7e31228a` and a false red in the first version of this round).

## Verified in this session

Measured on this machine (one core of real CPU, bash 5.2.21), at the working tree of this commit:

- `python3 scripts/check-browser-gate.py --self-test`: 1244/1244 checks passed; `python3 scripts/check-browser-gate.py`: `verdict: gated`; `node scripts/mutation-check.mjs --anchors`: `checked 2148 of 2151 mutation anchors; 0 stale`.
- The repro sets (`repro.py`, 37 shapes of review 1; `repro2.py`, 60 shapes of review 2, each run in bash 5.2.21 with a marker function and read by the guard in an always() step): in the second set bash ran the marker in 59 shapes (the 60th, finding DW-5c, runs nothing); `7e31228a` accepted 58 of the 59 and this commit accepts 9, all of them present at the parent and recorded: findings SJ2-6 (`echo ${x:-` / `echo a # $(mark_ran) }`), DW-8 (`cat \<;mark_ran`), DW-11 (three shapes: `<<E mark_ran`, a whole-line `#` in a backtick pair, a quote in a backtick pair) and four closing lines of a multi-line `"$( )"` (DW-10 `BASE="$(` / `date` / `)" mark_ran`, and OPS-7a to OPS-7c). The 8 shapes that must stay accepted (a commit message with a backtick and a `#`, a summary heading with `$(date)` or `$((N + 1))`, a multi-line `$( )` with a heredoc in it, a continued line before a summary heredoc) are accepted (one of them only in an always() step, as its `$( )` in a word is read as a message).
- `outbox/guard-heredoc-probe-2026-11-19.py` with the `39459bd2` guard: `checked 407 of 407 run steps`, the same 2 steps differ (the multi-line `node -e` steps of `mutation-ids-probe.yml` and `open-meteo-egress-probe.yml`); the output is byte-identical to the committed `.txt`.
- 18 ordinary step shapes (two heredocs in one step, an `if` ladder, a `for` loop, a multi-line `$( )` with a `#` comment line, a commit message over several lines, a multi-line `"$( )"` and then a summary heredoc, a subshell, a group) were read by `7e31228a` and by this commit: 1 shape was refused here that `7e31228a` accepted (a multi-line `( )` subshell with a heredoc in it) and is accepted after the second change of this round; 1 shape (a multi-line `OUT="$(` ... `)"` and then a summary heredoc) is accepted here in an always() step and was refused at `7e31228a` and at the parent.
- 43 of the 171 heredoc and string mutants were run against an earlier text of this round and all 43 were caught; the text then changed (the mixed stop was removed and `(` narrowed), and the 171 are running again against this commit's text. At 56 of the 171 on `aa048d40`'s text one mutant survived: `browser-gate-heredoc-unparsable-reads` (a heredoc after a `<<` this reader cannot parse is read as data). Its row (`cat <<[`) was masked: the `[` is remembered as open and made the next heredoc code anyway, so the stop it pins did nothing visible. A row with a variable delimiter (`cat <<$X`) pins it, and the runner confirms the mutant is caught by it. Two more sweep results on the same text were fixed in the code: `browser-gate-scan-open` mutated the stack that `_scan` returned, which no caller reads any more (they read the carried `_Open`), so `_scan` now returns only the comment's index and the entry is deleted; `browser-gate-heredoc-ctx-stack` crashed with an IndexError instead of failing a check, because the parens clause only worked behind the stack clause, which now reads `sc.parens and sc.parens[-1] != 1` (the same on every real input; the `ctx-paren` entry is repointed). Self-test 1245/1245; `--anchors` 2147 of 2150, 0 stale.

## Not verified

Not done yet, and each gates the landing: the result of the 171-mutant sweep on this text, the whole mutation table on the final head, the 100000-script `gen2` run and the `gen3` run with the sabotaged-copy controls (`gen3` exists, draws the multi-line opener shapes, and has not run at volume), the `time` of the self-test at `39459bd2`, `1806bf8a`, `7e31228a` and the head against the budget of `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md` (2.7 s at its filing; the self-test is about 25 s on this machine at `7e31228a`, so the budget is already exceeded and by how much of it this item is, is not measured), the third independent review, the merge of `origin/main`, the scored `verify-full` (530/530), the landing, and the closure of item 1 in the residual CC-CMD with its residuals 1a to 1g.
