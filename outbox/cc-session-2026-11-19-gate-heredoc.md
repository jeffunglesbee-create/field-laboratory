# CC session 2026-11-19 — the browser gate guard reads heredocs and strings that span lines

Scope: `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`, item 1 (APPROVED to build by the owner, 2026-11-18). Repo field-laboratory, work branch `gate-items-2-7`. Not yet on `main`: this note is rewritten with the final numbers before the landing.

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
| review 3 | `__WF3__` | `__REVIEW3__` |
| final | `__FINAL__` | `__FINALSTATE__` |

## Why the design was replaced (Rule 42)

The owner invoked Rule 42 (a fix that has not worked after three attempts: stop, look at what the system shows, change the approach). What the system showed: review 1 confirmed 25 findings, review 2 confirmed 48 in five root causes, the mutant sweep then found 25 clauses that were masked, dead or crashing, and the 100000-script `gen2` run found one more false green, in a design that had grown a carried scan state, a bracket stack, a risk flag and an after-operator rule, each added to answer the last round and each a new place where the model and bash could differ. The real need is tiny: the probe reads 407 run steps, 1 has a heredoc operator and 2 have a multi-line string. And the guard's own principle is a closed grammar that fails closed; the carried-state reader was a model of bash.

## The reader now

Everything it trusts is checkable on one logical line from a fresh state; everything else falls back to the parent's behaviour for the rest of the step (read line by line; a heredoc is refused as 'a heredoc').

1. Each logical line is scanned from a fresh `_Open` (the openers, the parentheses of each `$(`, `brk`: the second `(` of a `((`, the `(` of `<(` and `>(`, and `[`). Nothing is carried to the next logical line.
2. A line that leaves anything open (`st.stack` or `st.brk`), or holds a substitution that is not flat (`_flat_subs(blank_quoted(text))`), stops the joining of strings and the reading of heredocs for the rest of the step.
3. A heredoc operator is read only at the top level of its line (a fresh scan up to it leaves nothing open, and no `{` is unmatched on the line). Its reader must be one of `cat`, `tee`, `grep`, `wc`, `tr`, `jq`.
4. A string that spans lines is joined while only a plain quote is open at the end of a line and the physical line (with what a backslash joined to it, in the quote its segment started in: `seg`) is flat once `blank_quoted` has blanked what is in quotes.
5. An unquoted body line with a `$(` or backtick is given back as `echo "<line>"` only when it has no `"`, is flat, and no body line ends in a backslash. A substitution is flat (`FLAT_SUB`) when it closes on the line and holds no quote, parenthesis, `#`, `<`, `>`, backslash or `case`.
6. A backslash-newline joins with nothing (as bash does); the `#` of a joined line begins a comment only after a blank or a separator; a backslash followed by a blank is no continuation. A line ends at a newline only; only space and tab are blanks; `$$` is the process id in `_scan` and `blank_quoted`.

Design costs, chosen, recorded in the residual CC-CMD (item 1, 1f): a heredoc, or a string that spans lines, after a line that leaves anything open (`x=$(` ... `)`, a multi-line `"$( )"`, a multi-line `[[ ]]`, a `$( )` with a comment line in it) is refused as at the parent; a body or string whose substitution is not flat is refused or not joined; a reader outside the six is code; `echo $((1<<2))` is refused; CRLF heredocs are code. Compared on 20 ordinary step shapes (a summary heredoc, an `if` ladder, a `for` loop, a subshell, a group, a multi-line commit message with and without a backtick, a heading with `$(date)` or `$((N))`, a quoted-delimiter body, a continued line before a heredoc), the carried-state reader and the strict one differ in 4: a heredoc inside `x=$(` ... `)`, a `$( )` with a comment line, a multi-line `"$( )"` then a summary heredoc, a string that spans lines inside a multi-line `$( )`; all four have a multi-line `$( )` before the heredoc or string, and the real tree has none (probe below).

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

## Found after review 2

- The mutant sweep of the 171 heredoc and string entries on `aa048d40`: 146 caught, 25 not (13 masked or unpinned clauses, 6 crashes, 1 dead return value, 5 equivalent mutants). All 25 were looked at; none was explained away. Several masked clauses were masked because the reader of an operator inside a quote or a substitution is not found, so the operator is code with or without the clause: the clause then has no row that can reach it from one line, which is part of why the strict reader is simpler.
- `gen2` at 100000 scripts (seed 2035603) found a script bash runs and that `1806bf8a` to the carried-state reader accepted (the parent refused it): `echo a` + backslash-newline + `# don't edit the line above` is the word `a#...` to bash, with no comment, so the apostrophe opens a string; the reader joined with a space and read a comment. A continuation joins with nothing since `c95eebcf`; this also closed `echo "a $` + backslash-newline + `(mark_ran)"`, which review 2 had recorded as pre-existing.
- The first version of the strict reader took the quote a joined string line starts in from the physical line; a mutant (`browser-gate-join-flat-physical`) showed that is wrong after a continuation. `seg` fixes it.

### Built, tried and dropped

- Joining a multi-line `"$( )"` into one logical line (to close `BASE="$(` / `date` / `)" mark_ran`): the newline inside the `$( )` is a command separator and the readers take it for a space, so `x="$(` / `true` / `mark_ran` / `)"` was then accepted. Reverted before any commit.

## Verified in this session (at `016b0c9a`, bash 5.2.21, one core of real CPU)

- `python3 scripts/check-browser-gate.py --self-test`: 1288/1288; `python3 scripts/check-browser-gate.py`: `verdict: gated`; `node scripts/mutation-check.mjs --anchors`: `checked 2139 of 2142 mutation anchors; 0 stale`.
- The 24 mutation entries added with the strict reader (every character of the flat class, the dirty stop, the join check, `seg`): all 24 caught by the isolated-copy runner (an earlier run of them found 12 uncaught, which got the rows `$(echo (a))`, `$(echo a) case b)`, a quote or backtick or backslash or `>` in a substitution, a lone backtick, a single-quoted `$(x # y)`, and exposed the `seg` bug).
- The repro sets, each shape run in bash with a marker function and read by the guard in an always() step: `repro.py` (37 shapes of review 1): 0 accepted with the marker run. `repro2.py` (60 shapes of review 2; bash ran the marker in 59): the head accepts 9, all present at the parent (SJ2-6, DW-8, DW-11 x3, OPS-7a to OPS-7c, DW-10), the same 9 as the carried-state reader; of the 8 shapes that the carried-state design accepted and that a careless edit could contain, 6 are accepted by the strict reader (a commit message with a backtick and a `#`, a heading with `$(date)` or `$((N + 1))` in a plain or an always() step, a summary heredoc, a continued line before a summary heredoc) and 2 are refused (a heredoc inside `x=$(` ... `)`, on one line or several: a design cost).
- `outbox/guard-heredoc-probe-2026-11-19.py` with the `39459bd2` guard (blank-insensitive since the continuation change): `checked 407 of 407 run steps`; 46 differ only in the blank where a backslash joined two lines; 2 differ otherwise (the multi-line `node -e` steps of `mutation-ids-probe.yml` and `open-meteo-egress-probe.yml`, outside the audited jobs, each read with fewer false reasons).
- The differential fuzz against bash, 100000 scripts per generator (`outbox/guard-heredoc-fuzz-2026-11-19.txt`): `gen` 0 accepted scripts whose marker ran (it ran in 55845), `gen2` 0 (26353), `gen3` 0 (10515). Controls: the carried-state reader of `7e31228a` shows 11 of 30000 gen3 scripts accepted with the marker run, the head with the dirty stop removed shows 1, the head with the operator context check removed shows 0 (gen3 draws no script in which that clause decides: the clause is pinned by rows and mutation entries, not by the fuzz).
- 20 ordinary step shapes read by the parent, the carried-state reader and the strict reader (script in the session scratch, summarised above): 4 differ between the carried-state and the strict reader, each with a multi-line `$( )` before the heredoc or string.

## Not verified

Not done yet, and each gates the landing: the rest of the mutant sweep on this text (137 heredoc and string entries, running), the third independent review, the time of the self-test against the hook budget of `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md` (2.7 s at its filing; the self-test is about 25 s on this machine, so the budget is already exceeded, and by how much of it this item is is not measured), the merge of `origin/main`, the scored `verify-full` (530/530), the landing on `main`, and the closure of item 1 in the residual CC-CMD with the residuals 1a to 1g and the design costs.
