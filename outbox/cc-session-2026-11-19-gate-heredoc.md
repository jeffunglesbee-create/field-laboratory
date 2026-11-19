# CC session 2026-11-19 — the browser gate guard reads heredocs and strings that span lines

Scope: `docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`, item 1 (APPROVED to build by the owner, 2026-11-18). Repo field-laboratory, work branch `gate-items-2-7`, not yet on `main`.

## HEAD progression

| step | sha | state |
|---|---|---|
| start | `39459bd2` | `main` after the items 2 to 7 closure and the proof branches' deletion |
| feature | `1806bf8a` | the guard reads a data heredoc and a string that spans lines; self-test 1045/1045; pushed to `origin/gate-items-2-7` |
| review | workflow `wf_e852d66e-255` | 4 lenses, 66 agents, 2 skeptics per finding: 25 findings confirmed, 6 refuted |
| fix round | this commit | the 25 findings fixed (below); self-test 1122/1122; not scored, not landed |

## What the review found (all against `1806bf8a`)

Reproduced with a script in which bash runs a marker (`mark_ran`) and the guard at `1806bf8a` accepts the step (the repro set printed `violations: 30` there and `violations: 0` at the fix round):

- REACHABLE: a multi-line `"$( )"` whose closing line `)"` opened a phantom string that hid the commands below it (SJ-1); a heredoc inside `$( )` closed by `EOF)` swallowed everything up to a later bare `EOF` (F1); five echo give-back mutants survived the self-test (T2).
- CONTRIVED false greens: `<<WORD` inside `(( ))`, `${ }`, `$(( ))`, `$[ ]`, `$'...'` read as an operator (H1, SJ-5, C1); `str.splitlines` ending a line at a form feed, U+2028 or a lone carriage return (H2, SJ-3, SJ-4); a `#` or a case pattern holding the `)` of a `$( )` in a heredoc body or a joined string (H3, H4, F2, F3); a quoted string and a substitution open at once (H5); a backslash inside the operator (H6); `$$'` read as an ANSI-C opener (SJ-2, C2).
- TEST-GAP / DOC: T3 to T6, D1 (a mutation claim), D2 (a string that never closes, last line ending in a backslash), H8 (the fuzz drew none of these shapes), H9 (the join was quadratic: 2000 lines took 10 s).
- Refuted by the skeptics: H7 (an internal marker word in a script), SJ-6 and SJ-7 (pre-existing, not this commit), T1, C3, C4.

## What the fix round changed (scripts/check-browser-gate.py)

1. A line ends at `\n` only (`script.split("\n")`, and only spaces and tabs are cut off a line's end); a delimiter ends at a blank or a metacharacter, not at any Unicode space.
2. `_scan` carries what a line leaves open into the next (one scan per line, linear) and reads `$$` as the process id.
3. A string and a substitution open at once, or a string whose `$( )` holds a `#`, `<<` or `case` (`RISKY_IN_SUB`), stops the joining and the heredoc reading for the rest of the script.
4. A heredoc operator is data only at the top level or inside one `$( )`; inside a string, `${ }`, a backtick pair, `(( ))`, `$[ ]`, `{ }` or `( )` it is code. Inside `$( )` a body line that starts with the delimiter (`EOF)`) makes it code.
5. An operator on a line that a backslash joined, or a `<\` and `<EOF` split, is not read (bash joins with nothing, this reader with a space).
6. An echo give-back line is refused when its `$( )` holds a `#`, `<<` or `case`.

Tests: 51 pinned rows and 19 refusal fixtures added, one scan-cost check (a 400-line string is scanned 2.92 times over, bound 4), 56 mutation entries added and 11 repointed (`--anchors` 0 stale), the fuzz harness has a second generator (`gen2`, alphabet printed with the result).

## Verified and not yet verified

Verified in this session: self-test 1122/1122; `python3 scripts/check-browser-gate.py` `verdict: gated`; the probe `outbox/guard-heredoc-probe-2026-11-19.py` prints `checked 407 of 407 run steps`, the same 2 differ as at `1806bf8a`; the repro set above; `gen2` 0 violations in 3000 scripts at the fix round and 25 in 6000 at `1806bf8a`.

Not yet done (all of these gate the landing, none is deferred past it): the 108 heredoc and string mutants (running), the 100,000-script `gen2` run, a second independent review of the fix round, the 554-mutant sweep on the final head, a scored `verify-full` 530/530, the landing on `main`, the closure of item 1 in the residual CC-CMD.
