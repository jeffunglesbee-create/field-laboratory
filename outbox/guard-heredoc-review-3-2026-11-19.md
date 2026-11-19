# Third review of the strict reader (workflow `wf_a221fda7-c68`, 2026-11-19, of `0ba7f399`): the confirmed findings, verbatim, with what was done

Five lenses (contexts, strings-and-flat, tests-and-table, regression, differential-wide), 67 agents, 4.6 h, two skeptics per finding. 31 findings reported, 28 confirmed, 3 refuted as known (CL-5, SF-5, DW-3). Each finding below is as the reviewer wrote it (class, reach, input, expected, observed, pre-existing); the line `Disposition` is this session's.

## CL-1 (claims): `(( (x) cat <<EOF ))`: the first `)` pops the `((` entry of `brk`, so a heredoc operator inside the arithmetic is judged top-level and its body is skipped

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED: `((` outside quotes is EXOTIC (not trusted); brk removed. Rows, refusal table, entries exotic-*.
- Input:

```
Script A (accepted as a PLAIN step; bash runs the marker):
(( (true) cat <<EOF )) || true
mark_ran
EOF
Script B (the arithmetic spans two lines, so after line 1 `brk` is empty and the stop rule C2 does not fire either):
(( (true)
cat <<EOF )) || true
mark_ran
EOF
Code: _scan keeps ONE `brk` entry for the second `(` of `((` and pops it at the first top-level `)`, whichever `)` that is (here the `)` of the plain subshell `(true)`); a `(` that is neither `((`, `<(` nor `>(` is never pushed.
```

- Expected:

```
The operator is inside `(( ))` (bash reads the whole text up to `))` as arithmetic and starts no heredoc), so heredoc_as_data must return None and the lines after it must be read as commands, as they are for the pinned `(( cat<<EOF ))` and `((` NL `cat <<EOF ))`. Claims contradicted: the heredoc_as_data docstring ('only an operator at the top level of its line is read, not one inside ... an arithmetic `(( ))`'), the _Open docstring and the note ('a closer with nothing of its kind to close is a literal'; 'nothing is judged in a carried context').
```

- Observed:

```
Guard: plain step accepted (unresolved == []), also accepted as always(); command_lines gives ['(( (true) cat  )) || true'] with bodies ['mark_ran']. Bash runs mark_ran (-c: True; bash -e file: True): the arithmetic fails at run time, `|| true` absorbs it, and the 'body' line is an ordinary command. Same for the multi-line script B.
```

- Pre-existing:

```
No. The PARENT 39459bd2 refuses (it refuses every heredoc). 1806bf8a and c95eebcf accept it too (plain, both scripts), so it came in with the feature and survived both fix rounds and the Rule 42 rework.
```


## CL-2 (claims): A `$[` left open inside a `$( )` after the operator: _scan closes the `$(` at the first `)` and forgets the open `[`, so bash takes the next line as part of the command and the heredoc body starts a line later than the guard thinks

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED: `$[` is EXOTIC and `[` is not in the flat class. Rows, refusal table.
- Input:

```
cat <<EOF $(echo $[ )
] ) ; mark_ran
EOF
(also inside a loop: `for i in 1; do cat <<EOF $(echo $[ )` / `] ) ; mark_ran` / `EOF` / `done`; with `tee`, `tr`, `jq`, `3<<EOF`, `FOO=1 tee <<EOF`.) Code: in _scan a `)` that brings the parenthesis count of `$(` to 0 pops the `$(` and runs `del brk[bases.pop():]`, which drops the `[` that `$[` pushed; bash keeps the `)` inside `$[ ... ]`, so the command line goes on over the newline and the line `] ) ; mark_ran` is on it (an error inside the comsub subshell is contained, `; mark_ran` runs). FLAT_SUB allows `$` and `[`, so the line also counts as flat.
```

- Expected:

```
A logical line that leaves bash inside a construct must stop heredoc reading (C2), or the operator must not be judged clean: the `$[` is open when the line ends. The pinned rows cover `$[` open AT an operator (`x=$(echo $[ 1; cat <<E ])`) but not a `$[` opened after it on the same line.
```

- Observed:

```
Guard: accepted as a PLAIN step and as always(); the line `] ) ; mark_ran` is returned as heredoc body data. Bash: mark_ran runs (-c True, file True): bash reads the heredoc body after line 2, and line 2 ends the `$[` and the `$( )`, then `; mark_ran`.
```

- Pre-existing:

```
No. The parent refuses (every heredoc is refused); 1806bf8a and c95eebcf accept it as a plain step. The no-heredoc form (`: $(echo $[ )` / `] ) ; mark_ran`) is refused by all four.
```


## CL-3 (claims): A `#` right after the `)` of `<( )`, `>( )` or `a=( )` is read as a comment by _scan's boundary rule, but bash continues the word, so a quote in the 'comment' opens a string the guard never sees

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED for the heredoc forms (`<(`, `=(` are EXOTIC). The form with no heredoc is the parent's: residual 1f.
- Input:

```
Always() step (the `<( )` makes the line unreadable, which an always() step keeps as opaque):
: <(true)#"
cat <<EOF
"; mark_ran; echo ""
EOF
Plain step (array literal):
a=(true)#'
cat <<EOF
'; mark_ran; echo ''
EOF
No heredoc at all (always() step; the PARENT accepts this one too):
: <(true)#"
echo a \
"; mark_ran; echo ""
Code: _scan's `boundary = was_top and not stack and c in " \t\n;&|()"` makes every `)` a word boundary. That is right for a subshell or a case arm, wrong for the `)` that ends `<(...)`, `>(...)` or an array literal (bash: `echo <(x)#'` and `a=(x)#'` both end in 'unexpected EOF while looking for matching `''; `(x)#'` and `case x in a)#'` are comments).
```

- Expected:

```
`#"` is not a comment, so line 1 leaves a double quote open in bash. The guard must see it (or at least not trust the next lines): the heredoc operator on line 2 and the 'body' that closes the quote and runs `; mark_ran` are inside bash's string and then outside it.
```

- Observed:

```
Guard accepts all three (the first as always(), the second as a PLAIN step). Bash runs mark_ran in all three (-c True, file True): the string opened by `#"` is closed by the body line, `; mark_ran` runs, `echo ""` closes the state.
```

- Pre-existing:

```
Split. The two heredoc forms: the PARENT refuses, 1806bf8a and c95eebcf accept (new with the feature). The no-heredoc form (`: <(true)#"` / `echo a \` / `"; mark_ran; echo ""`) is accepted by the PARENT as always() too: the `)#` comment rule in comment_start/_scan is a pre-existing hole that the heredoc reader makes much easier to reach.
```


## CL-4 (claims): `)` inside a `${ }` inside a flat `$( )`: blank_quoted and FLAT_SUB close the substitution early, so the rest of it is read as quoted text; the heredoc-body and joined-string readers feed exactly this view to the guard

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED: braces and brackets are not in the flat class; the closing line of a joined string is judged. The one-line plain form is the parent's: residual 1f.
- Input:

```
Heredoc body (always() step):
cat <<EOF
$(echo ${y:-)}; mark_ran)
EOF
Joined string (always() step):
echo "a
$(echo ${y:-)}; mark_ran) b"
Pre-existing plain form (the parent accepts it as always()):
echo "$(echo ${y:-)}; mark_ran)"
Code: FLAT_SUB's body class `[^()'"`\\#<>\n]*` allows `$`, `{` and `}`, so `$(echo ${y:-)` is a 'flat substitution'; blank_quoted counts parentheses of a `$(` but does not know `${ }` (_scan does), so it closes the `$(` at the `)` inside `${y:-)}` and blanks `}; mark_ran)` as double-quoted text. The body line is handed on as `echo "<line>"`, the joined string as one line.
```

- Expected:

```
A `)` inside `${ }` does not end a command substitution; the substitution `$(echo ${y:-)}; mark_ran)` runs mark_ran. _flat_subs must not call it flat (or blank_quoted must track `${`), so the heredoc is code / the string is not joined, and `mark_ran` is read as a head.
```

- Observed:

```
Guard: always() accepted for all three; plain refused (the `$(` in a word is unreadable). Bash: mark_ran runs for all three (-c True, file True): the `)` inside `${y:-)}` is part of the word and the substitution ends at the last `)`.
```

- Pre-existing:

```
Split. Heredoc-body and joined-string forms: the PARENT refuses (it reads the body lines as commands and the string lines one by one), 1806bf8a and c95eebcf accept: new route. The one-line form `echo "$(echo ${y:-)}; mark_ran)"` is accepted by the PARENT as always(): pre-existing hole in blank_quoted.
```


## CL-6 (claims): `a=(` is not tracked: an operator inside an array literal is judged top-level (only the -c oracle runs the marker; a script file stops at the syntax error)

- Class: FALSE-GREEN; reach: COSMETIC
- Disposition: FIXED: `=(` is EXOTIC (only `bash -c` ran it; a script file stops at the syntax error).
- Input:

```
true
a=( cat <<EOF
mark_ran
EOF
(plain step). `a=(` leaves bash inside a compound array assignment, where `<<` is a syntax error; _scan pushes nothing for a `(` that follows `=`.
```

- Expected:

```
Refused (operator inside `a=( )`), or at least not read as data.
```

- Observed:

```
Guard: accepted as a PLAIN step. `bash -c`: the syntax error discards line 2 and bash CONTINUES, so mark_ran (line 3) runs: True. `bash -eo pipefail file` (how GitHub runs a run step): bash exits at the syntax error, mark_ran does not run: False. So it is a false green only under the -c oracle; I do not claim it is reachable in a workflow.
```

- Pre-existing:

```
No. The PARENT refuses; 1806bf8a and c95eebcf accept it. Not a false green under `bash -e file`.
```


## SF-1 (strings-and-flat): A `)` inside `${ }` (or `$[ ]`) inside a `$( )` ends the substitution early for FLAT_SUB and blank_quoted but not for bash, so the rest of the substitution is read as string text (string spanning lines, heredoc body)

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED as CL-4 (inputs 1, 2, 4); input 3 (one line) is the parent's: residual 1f.
- Input:

```
1) echo "a\nb $(echo ${x:-)}; mark_ran )"   2) cat <<EOF\n$(echo ${x:-)}; mark_ran )\nEOF   3) echo "$(echo ${x:-)}; mark_ran )"   4) echo "a\nb $(false && echo $[1)]; mark_ran )"   (\n is a newline; also `${x%)}`, `${x/)/}`, `${x:-}${y:-)}` in the same place)
```

- Expected:

```
Refused (hides_a_launcher true): bash runs `mark_ran` inside the substitution. The claim at FLAT_SUB / _flat_subs is that a substitution that closes on the line and holds no parenthesis is read exactly as bash reads it.
```

- Observed:

```
The head keeps all four as opaque in an always() step (plain steps refuse any `$(` in a word); bash (file mode, -e) ran the marker 4 of 4. _scan tracks `${` and agrees with bash, but blank_quoted and FLAT_SUB close the `$(` at the first `)`: FLAT_SUB matches `$(echo ${x:-)`, `_flat_subs` passes, blank_quoted blanks `}; mark_ran )` as string text, and COMMAND_HEAD finds only `echo`. This reaches the strict reader's three new routes: a joined multi-line string (input 1), an unquoted data-heredoc body given back as `echo "<line>"` (input 2, C5's flat claim) and the `$[` variant (input 4).
```

- Pre-existing:

```
Input 3 (one-line string) was accepted by the parent 39459bd2 too (pre-existing). Inputs 1, 2 and 4 were refused by 39459bd2 and are accepted by 1806bf8a, c95eebcf and the head: new with the feature. Not in the known list.
```


## SF-2 (strings-and-flat): C7's 'only a space and a tab are blanks' is false below the line splitter: shlex treats CR as a blank and COMMAND_HEAD's `\s` treats FF, VT, FS/GS/RS, NEL, U+2028/9, NBSP and more as blanks, so a redirect operator swallows the next token and the command after it is no command

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED: `_odd_to_word`. Also closes the NBSP and ideographic-space forms the parent accepted.
- Input:

```
Plain and always() steps (CR): `echo a >\r; mark_ran`, `> \r mark_ran`, `<<< \r mark_ran`, `2>\r mark_ran`, `echo a >\r&& mark_ran` (\r is a carriage return character). always() steps only: `> \x0c mark_ran echo "$(date)"`, and the same with \x0b, \x1c-\x1e, \x85,  ,   and (pre-existing) \xa0, \x1f,  ,  - ,  ,  , 　. Glued shape: `> a\recho mark_ran`.
```

- Expected:

```
Refused. Bash reads CR (and the others) as an ordinary word character: the redirect target is `\r` (or `a\recho`) and `mark_ran` is the command. The docstring of command_lines says only a space and a tab are blanks, as in bash.
```

- Observed:

```
The head accepts all of them; bash (file mode, -e) ran the marker each time. split_commands uses shlex, whose whitespace includes CR, so the REDIRECTS branch drops the next token as the target; with `echo a >\r; mark_ran` the dropped token is the `;`, which merges the two commands. In the opaque path COMMAND_HEAD's `_REDIRECT` uses `\s*` and swallows `mark_ran`. A CR reaches a script only through a `\r` escape in a quoted YAML scalar (PyYAML turns CRLF into LF).
```

- Pre-existing:

```
New: `echo a >\r; mark_ran`, `> \r mark_ran` and the FF/VT/FS-RS/NEL/LS/PS spaced forms are refused by 39459bd2 and 1806bf8a (splitlines made the character a line end) and accepted by c95eebcf (where C7 landed) and the head. Pre-existing and not closed: `> a\recho mark_ran` is accepted by all four guards (C7 only closed it for FF/VT/NEL/LS/PS); the NBSP, \x1f, U+1680, U+2000-200A, U+202F, U+205F, U+3000 spaced forms are accepted by the parent too (always() only).
```


## SF-3 (strings-and-flat): Single-quoted and ANSI-C text is not always text in bash (`>&'...'`, `[[ 'a[$(cmd)]' -eq 1 ]]`, `printf -v`, `read -r`); blank_quoted and shlex treat it as text, and the joined-string path now hides a multi-line one

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED (residual 1f, item 4): the one-line forms are the parent's; the multi-line `>&'` forms are a new surface of that root cause.
- Input:

```
>&'$(mark_ran)'   |   >&'\n$(mark_ran)\n'   |   echo a >&'x\n$(mark_ran)\ny'   |   [[ 'a[$(mark_ran)]' -eq 1 ]]   |   printf -v 'a[$(mark_ran)]' x   (also `read -r 'a[$(mark_ran)]' </dev/null`, and `>&$'$(mark_ran)'`)
```

- Expected:

```
Refused. In bash 5.2.21 the word after `>&` is expanded although single-quoted, and an arithmetic operand or variable name (`[[ -eq ]]`, `printf -v`, `read`) has its `a[...]` subscript expanded, so `$(mark_ran)` runs. blank_quoted's docstring says the content of single quotes is all text.
```

- Observed:

```
The head accepts all of them, in a plain step too (clean); bash ran the marker for each. The two multi-line `>&'` inputs are new: the parent read the string line by line and saw the `$(` as code, the strict reader joins it and blanks it.
```

- Pre-existing:

```
The one-line forms (`>&'$(mark_ran)'`, `[[ ... ]]`, `printf -v`, `read`) are accepted by 39459bd2 too (pre-existing). The two multi-line `>&'` forms are refused by 39459bd2 and accepted by 1806bf8a, c95eebcf and the head (new surface of an old root cause).
```


## SF-4 (strings-and-flat): _scan / comment_start cut a `#` that bash does not read as a comment: inside `$[ ]`, inside `(( ))` (a `for ((` header is read as data), and glued to the `)` of `<( )` / `>( )`

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED (residual 1f): accepted by the parent.
- Input:

```
for ((i=0 #$(mark_ran);i<1;i++)); do :; done   |   echo $[1 #$(mark_ran)]   |   echo <(true)#x; mark_ran   (also `echo <(true)#x "` newline `# $(mark_ran)` newline `"`)
```

- Expected:

```
Refused. In `(( ))` and `$[ ]` a `#` is not a comment, so the `$(mark_ran)` after it runs; in `echo <(true)#x` the `#` is in the middle of the word `/dev/fd/63#x`, so `; mark_ran` is a separate command.
```

- Observed:

```
The head accepts: the first two in a plain step too, the third in an always() step. Bash ran the marker for each. _scan keeps `[`, `((` and `<(` in brk and so knows it is inside them, but still returns the `#` as a comment where it is at the top level of the opener stack; after the `)` of `<( )` it also reports a word boundary.
```

- Pre-existing:

```
Accepted by all four guards including the parent 39459bd2 (pre-existing). Not in the known list.
```


## SF-6 (strings-and-flat): COMMAND_HEAD's assignment and redirect prefix swallows a double-quoted word whole, including the `$( )` that blank_quoted keeps in it, so `VAR="$(cmd)" word` and `> "$(cmd)" word` hide `cmd`; the joined-string path adds the multi-line forms

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED (residual 1f, item 4): the one-line forms are the parent's; the multi-line form is a new surface of that root cause.
- Input:

```
FOO="$(mark_ran)" cat f   |   > "$(mark_ran)" echo x   |   x="a\n$(mark_ran)" true   |   x="\n$(mark_ran)$((1+1))"if true;
```

- Expected:

```
Refused: bash expands the substitution in the assignment value or redirect target, so `mark_ran` runs. The real tree has `X="$(...)"` only as a standalone assignment (grep of .github/workflows: 5 lines, none followed by a command), which COMMAND_HEAD does see.
```

- Observed:

```
The head accepts all four in an always() step (plain steps refuse any `$(` in a word); bash ran the marker. `_ASSIGN_VALUE` and `_REDIRECT` consume `"..."` as one `_CHAR`, so the `$(` inside it is never a head and the next head is `cat` / `echo` / `true`.
```

- Pre-existing:

```
The one-line forms (inputs 1 and 2) are accepted by the parent 39459bd2 (pre-existing). The two multi-line forms are refused by 39459bd2 and accepted by 1806bf8a, c95eebcf and the head (new surface).
```


## SF-7 (strings-and-flat): The committed differential fuzz and the self-test rows draw none of the shapes behind SF-1 to SF-6, so '0 false greens in 100000 x 3' is a statement about the shapes drawn

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED: gen4 draws the shapes; rows and a refusal table for each.
- Input:

```
Patterns in outbox/guard-heredoc-fuzz-2026-11-19.py and in scripts/check-browser-gate.py at 0ba7f399: `>&'`, a redirect operator followed by CR, `$[` with a `#` inside, `for ((` with a `#`, `<( )` followed by `#`, `printf -v` / `[[ '`, a `)` inside `${ }` inside `$( )`.
```

- Expected:

```
At least one generator unit or self-test row per shape the claims (C4 to C7, FLAT_SUB) rest on.
```

- Observed:

```
Every pattern matches 0 lines in the fuzz file and 0 in the self-test (output below). The generators' only form feed, U+2028 and CR are line separators after a heredoc delimiter, and the only `${x:-)}` is a stray closer before an operator, never inside a `$( )`.
```


## SF-8 (strings-and-flat): The design-cost list omits that any earlier closed line holding a non-flat substitution turns heredoc reading off for the rest of the step (a later summary heredoc is refused)

- Class: DOC; reach: COSMETIC
- Disposition: FIXED (doc): the design costs list the earlier closed line with a non-flat substitution.
- Input:

```
echo "built $(date -u +"%F")"\ncat >> "$GITHUB_STEP_SUMMARY" <<EOF\nok\nEOF   (and `V="$(printf '%s' "$X")"` as the first line)
```

- Expected:

```
The note's design costs name a heredoc or string after a line that leaves something open, a non-flat body or string, and a reader outside the six. The same heredoc after `echo "built $(date -u +%F)"` (a flat substitution) is read, so a reader expects a quote inside an earlier `$( )` to cost nothing.
```

- Observed:

```
With the quote-holding substitution on an earlier, fully closed line the summary heredoc gets the reason 'a heredoc' (refused, as at the parent); with the flat one it does not. Not a regression (the parent refused every heredoc), but C2 acts on any line of the step and the note lists no such cost.
```


## TT-1 (tests-and-table): Five mutation entries can no longer fail since the rework; the `${` one hides a mutant false green

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED: ctx-stack entries repointed; `-param` pinned by a row (a stray `}` before `${`); `-single`, `-double`, `-backtick` are EQUIVALENT (the splitter masks the operator in a quote or a backtick pair) and deleted; scan-bracket-in-sub deleted with the bracket stack.
- Input:

```
Entries browser-gate-ctx-stack-single, -double, -backtick, -param (find `        if sc.stack or sc.brk or shown`, replace filtering one opener kind out of sc.stack) and browser-gate-scan-bracket-in-sub (find `            elif c == "[" and top in ("", "$("):`, replace `top in ("",)`). Script that the -param mutant accepts: `echo } ; cat ${x:- <<EOF }\nmark_ran\nEOF`
```

- Expected:

```
Each entry's mutant fails at least one self-test row; the claim text says the operator "is read as a heredoc operator" when the clause is filtered. The -param mutant should still refuse the script, because bash runs mark_ran.
```

- Observed:

```
All five survive the full self-test (`1288/1288 checks passed`). All five were CAUGHT at c95eebcf (replayed against that file with its own self-test). The -param mutant accepts `echo } ; cat ${x:- <<EOF }` / `mark_ran` / `EOF`, reading it as `cat ${x:-  }` with the body swallowed as data, and bash runs the marker. The brace-count clause hides `${` unless a stray `}` precedes it. I found no script that separates the single, double or backtick mutants: the splitter makes the operator's marker part of a quoted token or raises Unreadable on a backtick, so those three are masked. -bracket-in-sub: a `[` pushed inside a `$(` is deleted when the `$(` closes (`del brk[bases.pop():]`), and a `$(` left open is already stack, so the clause is dead. Only one self-test row (the `$'\' <<E` row) pins the sc.stack clause at all; the row `echo ]; ... ` and the `$( )` rows pass without it. The note lists this sweep as not yet done.
```

- Pre-existing:

```
Regression of this change, not pre-existing: the five entries were caught at c95eebcf (replayed) and survive at 016b0c9a. The mutant false-green input is refused by the head, the parent, 7e31228a, aa048d40 and c95eebcf, and accepted by 1806bf8a.
```


## TT-2 (tests-and-table): Four boundary or granularity clauses of the new code are unpinned, and each mutant of them is a false green

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED: rows and entries for the four boundary clauses (join-flat-offset, flat-case-first-only, flat-case-prefix, ctx-scan-short) and the dirty first character.
- Input:

```
(a) `text[text.rfind("\n") + 1:]` (the physical line the flat check judges) mutated to `+ 2`: `echo "a\n$(echo a # )\nmark_ran)"`. (b) the case check `any(re.search(r"\bcase\b", m.group(0)) for m in FLAT_SUB.finditer(text))` mutated to the first match only (`m = FLAT_SUB.search(text)`), or to `re.search(..., m.group(0)[:6])`: `cat <<EOF\n$(echo a) $(case x in x)\nmark_ran;; esac)\nEOF` and `cat <<EOF\n$(true; case x in x)\nmark_ran;; esac)\nEOF`. (c) `_scan(text[pos:s], sc)` in heredoc_as_data mutated to `text[pos:s - 1]`: `tee $[<<E ]\nmark_ran\nE`.
```

- Expected:

```
Each mutant fails a row. No row puts a non-flat substitution at column 0 of a continuation line of a string, a `case` substitution after another flat substitution or later than 6 characters into its match, or an opener directly in front of `<<`. Without such a row, each of these off-by-one edits to the guard goes unnoticed.
```

- Observed:

```
All four mutants survive the full self-test (1288/1288 checks passed). Each accepts its script: for (a) the joined line is `echo "a\n$(echo a # )\nmark_ran)"`, for (b) the body line is given back as `echo "$(echo a) $(case x in x)"`, for (c) the line reads `tee $[ ]`. Bash ran the marker for each of the four scripts. The head refuses all of them. A fifth mutant, the first character skipped in the dirty check (`blank_quoted(text)[1:]`), also survives; I found no script that makes it a false green.
```

- Pre-existing:

```
Code new in 016b0c9a; no earlier equivalent. All four scripts are refused by the parent, 7e31228a, aa048d40, c95eebcf and the head, and accepted by 1806bf8a.
```


## TT-3 (tests-and-table): Further clauses of the new code have no row: seg reset, continuation rewind, `$'` closer, empty substitutions, regex details

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED: rows and entries for seg reset, the rewinds, the `$'` closer, empty substitutions, the arithmetic alternative, the brace count, the scan start (the hanging mutant (8) is not an entry: a hang is not a catch).
- Input:

```
Mutants of 016b0c9a: (1) `seg` not reset at the start of a logical line (`first, st, bound = i, _Open(), True`). (2) the rewind of the continuation branch (`if joining and i == len(phys) and _quote_only(st.stack): i, cur, joining = first, "", False`): `first` replaced by 0, or any one of the three conjuncts dropped. (3) `"".join(q[-1] ...)` replaced by `q[0]`, which breaks the closer of a `$'` string. (4) `_FLAT` quantifier `*` to `+`, and the same for the backtick alternative, so an empty `$()` or `` `` `` stops being flat. (5) the second `\)` of the `$(( ))` alternative dropped. (6) `shown.count` replaced by `text.count` or by a whole-line count in the `{` clause. (7) the scan start `pos = 0` replaced by 1. (8) the rewind assignments `joining = False` changed so the rewind does not clear `joining` (hangs).
```

- Expected:

```
Each mutant fails a row.
```

- Observed:

```
All of (1) to (7) survive the full self-test (1288/1288); (8) hangs the self-test (300 s timeout, no FAIL line) in 6 variants. Examples: with (2) `first` -> 0 the script `echo ok\necho "a\nnpm run y \\` duplicates `echo ok`; with (4) `echo "a $()\nb"` stops being joined; with (5) `cat <<EOF\n$((a) )\nEOF` is read as an echo instead of code (still refused by the echo reader, so I found no false green). The first-batch fast screen also showed the equivalents I judged harmless, so these are the ones that change output.
```

- Pre-existing:

```
Code new or changed in 016b0c9a. At c95eebcf the corresponding seg, state-reset and rewind clauses were different code (the entries browser-gate-rewind-state-* were deleted with them).
```


## TT-4 (tests-and-table): Rows pass for a reason other than the one their label claims; one statement is dead

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED: rows relabelled for the clause that decides them; dead statements removed with the bracket stack; kill matrix in the note.
- Input:

```
Rows of PINNED_COMMAND_LINES labelled for the operator context, e.g. `x=$(cat <<EOF)\nhi\nEOF\nnpm run y` ("only an operator at the top level is read"), `x=$(cat <<EOF\nhi\nEOF\n)\nnpm run y`, `x=$(( cat<<EOF , 1 ))...`, `x=$(echo $[ 1; cat <<E ])...`, the `$( )`-in-`$( )` row. Dead statement: `joining = heredocs = False  # a substitution in the string that this reader cannot read exactly`.
```

- Expected:

```
A row labelled "only an operator at the top level is read" fails when the sc.stack clause of the operator-context check is removed. A statement with a comment explaining it changes some result when deleted.
```

- Observed:

```
Removing `sc.stack or` (entry browser-gate-heredoc-ctx-stack) fails exactly 1 of the 334 checks in the heredoc section (the `tee $'\' <<E` row); every `$( )`-context row still passes, because _flat_subs(blank_quoted(line)) is already False for them (the `<` is excluded from _FLAT, or the `$(` is unclosed). Over 370 non-crash mutants of the changed code, 19 of the 223 rows kill none (0-based indices 17, 21, 46, 47, 62, 65, 72, 76, 81, 88, 128, 129, 130, 137, 176, 178, 187, 188, 196); 10 of them are labelled for a clause that no longer decides them (17, 76, 81, 88, 129, 130, 137, 187, 188, 196). Deleting the join-stop statement leaves the self-test at 1288/1288, because the dirty stop two lines below runs with st.stack non-empty. The `[` in `$(` clause of _scan is dead for the same reason (TT-1).
```

- Pre-existing:

```
Introduced by this change: the rows were written for the carried-state reader, where the operator-context clause decided them.
```


## TT-5 (tests-and-table): The fuzz oracle (`ran`) is nondeterministic, so the marker_ran counts are not reproducible and a false green can be missed

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED: the oracle waits for every holder of the pipe, in its own process group; 30 runs of seed 3007585 in the note.
- Input:

```
outbox/guard-heredoc-fuzz-2026-11-19.py gen3, seed 3007585: `diff <(\necho ]\necho '(' ; jq . <<-_E1\n${x:-$(mark_ran)}\n$(echo 'a\n_E1\r\n\n) /dev/null\n)\n((\necho ]\ntrue ${x:-))}; tr a b <<-_E1 # (x\nmark_ran;; esac)\n\t_E1\n\nmark_ran\n)`
```

- Expected:

```
The same script gives the same marker_ran bit on every run, so the printed counts (55845, 26353, 10515 and the controls' 3162, 3162, 3163) can be reproduced and a violation cannot be hidden by timing.
```

- Observed:

```
Run 30 times, the marker file exists 14 times and is missing 16 times (the marker is written by a process substitution that races bash's exit). Two independent passes over seeds 3000000..3029999 both counted 3163 scripts with the marker run, but the sets differ in 12 seeds (3007585, 3007985, 3007986, 3008109, 3008110, 3008112, 3008113, 3009720, 3013196, 3015007, 3015008, 3022505). The txt itself shows it: the three controls run the same 30000 seeds and print marker_ran 3162, 3162 and 3163. A false green whose marker runs only inside `<( )` or `>( )` is counted as a violation only about half the time.
```

- Pre-existing:

```
The oracle is the same at 1806bf8a and later; it was not introduced by the rework. The txt's three controls were added in 0ba7f399.
```


## TT-6 (tests-and-table): The fuzz prints a denominator of 100000 but exercises the accept path of the strict reader in a tiny fraction of scripts

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED: the REACHED lines print how many accepted scripts hold a heredoc read as data or a joined string; gen4 reaches the accept path at volume.
- Input:

```
gen, gen2 and gen3 of outbox/guard-heredoc-fuzz-2026-11-19.py, seeds 1000000, 2000000 and 3000000, 20000 scripts each, read by the head guard
```

- Expected:

```
Rule 91: the output says how much of the new code the 100000 scripts reach. gen3 was written to hunt scripts where a heredoc follows an opener on an earlier line.
```

- Observed:

```
Scripts accepted by the head that hold a heredoc read as data: gen 789, gen2 134, gen3 17 of 20000 (0.085%, about 85 of 100000). In gen3 (4000 seeds, per-entry counts) 8 of the 18 printed openers (`V=$(`, `x=$(`, `echo ${x:-`, `true $[`, `` x=` ``, `diff <(`, `for ((`, `echo $(echo $(`) never appear in an accepted script, because the stop refuses every one of them by construction; 32 of the 38 body lines never do either. They are live only as controls for the stop (the txt's second control shows 1 violation). The printed gen3 alphabet also omits the string units (STR2, 13% of units) that gen3 draws, and the printed result lists new_accepts_opaque_ok (7275 for gen3) without saying how few of those hold a heredoc.
```

- Pre-existing:

```
The generators were written for the carried-state reader; the rework made most of gen3's openers unreachable for an accept. 1806bf8a is the commit that introduced gen/gen2.
```


## TT-7 (tests-and-table): Stale comments, labels and a docstring that describe the replaced design or contradict the output

- Class: DOC; reach: COSMETIC
- Disposition: FIXED (doc): stale comments and labels, the docstring.
- Input:

```
scripts/check-browser-gate.py line 4132: `# review of 7e31228a ...: what an earlier line left open is carried into the lines after it, so an operator is judged where it is in the script, not where it is on its line` (above rows that now pin the stop, and nothing is carried). Row labels at lines 4170, 4234, 4236 and 4238 use the removed `risk` flag ("is no risk", "is a risk too: the scanner counts it"). outbox/guard-heredoc-fuzz-2026-11-19.py docstring: "...(all of them false reds before) and that no script is refused now that was accepted before". Rows that pass at c95eebcf (4) or 7e31228a (8) are labelled as if they pin new behaviour and none says it is a regression pin.
```

- Expected:

```
Comments and labels describe the code that is there; the docstring matches the txt.
```

- Observed:

```
The txt, run with OLD = c95eebcf, prints accepted_by_old_not_new 795 (gen), 896 (gen2) and 384 (gen3): scripts the head refuses that the old reader accepted. That is the design cost, and it contradicts the docstring. Rows that pass at c95eebcf: the `$(echo a) case b)` row, the lone-backtick row, the single-quoted `$(x # y)` row and the joined-string row (replayed: command_lines on the old guard equals the expected value); the `$(echo a) case b)` row also passes at 7e31228a's neighbours except that one.
```

- Pre-existing:

```
The docstring has said this since 1806bf8a, where OLD was the parent (which refused every heredoc); it became wrong once OLD = the carried-state reader. The 4132 comment and the `risk` labels became stale in 016b0c9a.
```


## R1 (regression): A one-line substitution holding a quote, redirect, parenthesis, # or backslash stops heredoc and string reading for the rest of the step; the note says only multi-line constructs do

- Class: FALSE-RED; reach: REACHABLE
- Disposition: RECORDED (design cost, residual 1g): `X=$(cat "$F")` before a summary heredoc is refused as at the parent; the real tree has no such step.
- Input:

```
Any earlier line with a `$( )` or backtick pair that is not FLAT (holds ' " ( ) ` \ # < >), then a data heredoc or a multi-line string. Minimal: `X=$(cat "$FILE")` newline `cat >> "$GITHUB_STEP_SUMMARY" <<EOF` newline `## Result` newline `sha: $GITHUB_SHA` newline `EOF`. Also `X=$(git log -1 --pretty=format:"%s")`, `X=$(git rev-parse HEAD 2>/dev/null || echo none)`, `X=$(wc -c < f)`, `DEPLOYED=$(curl -sSf --max-time 30 "$SITE/version.txt" | tr -d '[:space:]')` (the real step 'The deployed build stamp matches main' in live-check.yml, an audited job) followed by a summary heredoc, `cat <<'EOF' > file`, `tee -a "$GITHUB_STEP_SUMMARY" <<EOF`, or a multi-line `git commit -m "a<newline>b"`. Code: scripts/check-browser-gate.py:543 `if st.stack or st.brk or not _flat_subs(blank_quoted(text)): joining = heredocs = False`.
```

- Expected:

```
The heredoc or string is read as data, as c95eebcf reads it and as the claim in 016b0c9a and the note implies ('Design costs: a heredoc after x=$( or a multi-line quoted substitution'; 'all four [differing shapes] have a multi-line `$( )` before the heredoc or string'). Nothing is open at the end of these lines (`_scan` leaves an empty stack); the comment at line 543 names a `#` hiding the `)` as the reason, and quotes, `<`, `>`, `2>&1`, balanced parentheses and backslashes are not that.
```

- Observed:

```
Parent / c95 / head: `X=$(cat "$FILE")` + summary heredoc is refused / clean / refused as a plain step and refused / clean / refused as an always() step (reason 'a heredoc'); the live-check.yml step plus a summary heredoc: refused / clean / refused; with the heredoc FIRST, or after a flat `X=$(cat package.json)`, head is clean (controls). Reach in this repo: 25 of 407 real steps (64 lines) hold a stop-triggering line, all 64 single-line (quote 29+, `2>/dev/null` 17, `<` 8, parentheses 6...), 0 multi-line. Appending a summary heredoc (the same counts for a tee heredoc, `cat <<'EOF' > file`, a multi-line commit message, a multi-line echo) to the 403 real steps without `<<`: of 90 plain steps accepted as they are, c95 accepts 90 and head 88 (refused: deploy.yml 'Is the live site already on this commit?', live-check.yml 'The deployed build stamp matches main'); of 129 always() steps, c95 accepts 129 and head 119. In ordinary shell the stop is the common case: of 830 system shell scripts, 464 hold a stop line, 2272 of 2733 stop lines are non-flat one-line substitutions and 10 are stray brackets. In 20000 random recompositions, about 1550 of the 3345 c95-ok-head-refuses were one-line non-flat. Not necessary for safety on what I could test: a head variant that stops only when the substitution holds `#` or `case` gives 0 false greens on 726 targeted scripts (31 one-line substitution shapes incl. `)` in quotes, `\)`, nested quotes, `<<<`, `case` x 11 heredoc and string tails x 2; bash ran the marker in 480) and 0 on 60000 fuzz scripts; it also changes 0 fuzz verdicts, so the fuzz and the 20 shapes of the note cannot tell the two readers apart. The self-test row and mutation entry for this clause (`x=$(echo a#(b))`) pin only the `#` and parenthesis class.
```

- Pre-existing:

```
Not a regression against the parent 39459bd2: it refused every heredoc and every multi-line string, so these inputs were red there too. A regression against c95eebcf (clean on every input above) and against 1806bf8a (read the heredoc after `D=$(date -u +"%Y-%m-%d")` as data in an always() step; the only input of this group I ran against it). Whether to accept it is a design call; the finding is that the reach is 6% of real steps and every real trigger is a one-line substitution, which the commit message, the note and the 20-shape comparison do not say.
```


## R2 (regression): The stop's flatness test judges the trailing comment too, so a comment that mentions a quoted `$( )` or holds one backtick stops the reading

- Class: FALSE-RED; reach: CONTRIVED
- Disposition: RECORDED (design cost, 1g).
- Input:

```
`echo start  # was: X=$(date +"%F")` newline `cat >> "$GITHUB_STEP_SUMMARY" <<EOF` newline `## x` newline `EOF`. Same with the comment `# the ` char` (a lone backtick) and `# see $(foo` (unclosed). Controls: the same text as a whole-line comment above `echo start`, and the comment `# don't`, are read. Code: scripts/check-browser-gate.py:543, `_flat_subs(blank_quoted(text))` runs on the logical line with its trailing comment still on it, while strip_comment cuts the comment everywhere else.
```

- Expected:

```
A comment is not a substitution: the line is as clean as the same line with the comment cut, and the heredoc after it is data (c95eebcf reads it).
```

- Observed:

```
parent refused/refused, c95eebcf clean/clean, head refused/refused (reason 'a heredoc') for all three comments; whole-line comment and `# don't`: head clean/clean.
```

- Pre-existing:

```
Not a regression against the parent (it refused every heredoc). A regression against c95eebcf, which read all three.
```


## R3 (regression): An unquoted summary heredoc whose body has escaped backticks (markdown code spans) is code at the head, data at c95eebcf, in an always() step

- Class: FALSE-RED; reach: REACHABLE
- Disposition: RECORDED (design cost, 1g).
- Input:

```
`cat >> "$GITHUB_STEP_SUMMARY" <<EOF` newline `Run \`npm test\` to reproduce.` newline `EOF` in an always() step that is not the last. `\`` is a literal backtick to bash, so nothing in the body runs. Code: `_FLAT` excludes the backslash, `_flat_subs` then sees an unpaired backtick and heredoc_as_data returns None for the whole body (scripts/check-browser-gate.py:415-425, 484-490).
```

- Expected:

```
Data, as at c95eebcf: the body is text and kept opaque in an always() step.
```

- Observed:

```
Plain step: refused at parent, c95 and head (c95's echo-wrap of the line is itself 'a command substitution inside a word'). always() step: parent refused, c95eebcf opaque (accepted), head refused ('a heredoc', then the body line and `EOF` read as commands). Escaped dollar bodies (`Cost: \$5 (see \$(foo))`) are still opaque at head, so only the backtick form regresses.
```

- Pre-existing:

```
Not a regression against the parent (refused there). A regression against c95eebcf in always() steps only; plain steps refuse it at every version.
```


## R4 (regression): Self-test cost of the item is now measurable: +34% CPU over the parent; the note's 'about 25 s' is CPU time, wall time is 39 to 52 s under load

- Class: DOC; reach: COSMETIC
- Disposition: FIXED (doc): the cost is measured at the parent, the previous head and the head (note, Verified).
- Input:

```
outbox/cc-session-2026-11-19-gate-heredoc.md, 'Not verified': 'the self-test is about 25 s on this machine ... by how much of it this item is is not measured'; hook budget 2.7 s at filing (docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md).
```

- Expected:

```
A figure for the item's share and the conditions it was measured under.
```

- Observed:

```
Interleaved runs, machine load average 7.5 to 8.5: wall parent 28.7 to 37.3 s (954 checks), c95eebcf 38.4 to 51.0 s (1278), head 39.4 to 51.6 s (1288). CPU user+sys: parent 19.5 and 18.7 s, c95eebcf 25.8 and 25.6 s, head 26.1 and 25.5 s. So the item adds about 6.5 to 7 s CPU (+34%), almost all of it already in c95eebcf; the strict rework itself adds about 0 (1278 to 1288 checks, 25.7 to 25.8 s). The 25 s matches CPU time, not wall time, and the guard is about 10x over the 2.7 s hook budget at the parent already (about 19 s CPU).
```

- Pre-existing:

```
Not applicable (a measurement).
```


## DW-1 (differential-wide): A `)` inside a `${ }` inside a flat `$( )` ends the substitution early for the reader: a launcher after it is hidden in an always() heredoc body or multi-line string

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED as CL-4.
- Input:

```
(a) heredoc: `cat <<EOF` / `$(echo ${x%)}; mark_ran)` / `EOF`. (b) multi-line string: `echo "a` / `$(echo ${x%)}; mark_ran)"`. (c) one line: `echo "$(echo ${x%)}; mark_ran)"`. Same with `${x:-)}` and `${x//)/}` (`${x#*)}` is refused: its # makes it non-flat). With a real launcher: `cat <<EOF` / `$(echo ${x%)}; npx playwright test)` / `EOF` gives needs_browser False and an accepted always() step.
```

- Expected:

```
Refused. In bash a `)` inside `${ }` does not close the `$( )`, so the substitution is `echo ${x%)}; mark_ran` and mark_ran runs. The reader must either see mark_ran as a head or call the line non-flat.
```

- Observed:

```
always() accepted (a plain step is refused only because any `$(` in a word is unreadable); bash 5.2.21 ran the marker both under -c and as a script file (-e -o pipefail). Cause: _FLAT/FLAT_SUB (scripts/check-browser-gate.py ~L415) end `$(` at the first `)`, and blank_quoted knows no `${ }`, so _flat_subs passes; heredoc_as_data then returns the body line as `echo "$(echo ${x%)}; mark_ran)"`, whose double-quoted tail `; mark_ran)` is blanked. Also a test gap: the 1288 rows have `${x:-)}` only as a prefix of an operator line, never inside a substitution of a body or string, and the committed fuzz (gen, gen2, gen3) never draws `$( ... ${..)..} ... )` (grep of BODY, BODY2, STR2, TAIL2 and the STRAY3 prefixes).
```

- Pre-existing:

```
(a) and (b) are NEW in 1806bf8a: the parent 39459bd2 refused both (it refused every heredoc and read each line of a string alone); 1806bf8a and c95eebcf accept both, and so does the head. (c) the one-liner is pre-existing: 39459bd2, 1806bf8a, c95eebcf and the head all accept it (blank_quoted gap). The strict rework therefore keeps a false green that the feature added.
```


## DW-2 (differential-wide): `#` inside `(( ))` is taken for a comment: the rest of the line is cut, in a PLAIN step too

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED (residual 1f): accepted by the parent.
- Input:

```
`(( n=1 # c )) || :; mark_ran`, `(( true # 2 )) || :; mark_ran`, and with a real launcher `(( n=1 # c )) || :; npx playwright test chromium` (read_step: browser False, unresolved []). `((#));mark_ran` also runs under bash -c, not under -e. The same line without the `#` is refused, and `(( n=1 # c ))` with the launcher on the next line is refused (the next line is read).
```

- Expected:

```
Refused. A `#` inside `(( ))` is arithmetic text, not a comment: bash prints 'syntax error in expression' and the status is 1, so `|| :` lets the command after `;` run.
```

- Observed:

```
Plain and always() accepted; bash ran the marker as a script file (-e -o pipefail). _scan returns the `#` as the comment start while st.brk is ['('] (it never looks at brk when it meets a `#`), strip_comment cuts the line to `(( n=1`, which reads clean. The comment_start docstring says that where the scanner reads a comment bash does not have, the reader reads MORE (the safe direction); here it reads less. `$[ 1 # 2 ]` and `a[1 # 2]=1` have the same cut but bash fails the whole command there, so only `(( ))` is exploitable.
```

- Pre-existing:

```
Pre-existing: 39459bd2, 1806bf8a, c95eebcf and the head all accept it (the comment cut predates this change).
```


## DW-4 (differential-wide): A backslash at the end of a comment line inside a multi-line `$( )` joins the next line, which bash does not

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED (residual 1f): accepted by the parent.
- Input:

```
`x=$(date \` / `# note \` / `mark_ran)` and `echo "$(date \` / `#\` / `mark_ran)"` (always() step).
```

- Expected:

```
Refused. Joined with nothing, line 1 and 2 give `date # note \`; a comment ends at the newline whatever it ends with, so line 3 is a new command inside the substitution and mark_ran runs.
```

- Observed:

```
always() accepted; bash ran the marker (script file and -c). _scan does not treat a `#` inside `$( )` as a comment, so the odd trailing backslash is a continuation, line 3 is joined into `x=$(date # note mark_ran)`, and mark_ran is no head position. The existing fix for this (finding 1 of review 5b5a89b: a comment ends at the newline) holds at top level only.
```

- Pre-existing:

```
Pre-existing: 39459bd2, 1806bf8a, c95eebcf and the head all accept it (the join code in _assemble is independent of the stop).
```


## DW-5 (differential-wide): A single-quoted `$( )` that bash expands later (PS4 under set -x, `${x@P}`, `$((x))`, the word of `>&`) is accepted in a PLAIN step

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED (residual 1f): accepted by the parent.
- Input:

```
`PS4='$(mark_ran) '; set -x; true`; `x='$(mark_ran)'; echo ${x@P}`; `x='a[$(mark_ran)]'; echo $((x))`; `>&'$(mark_ran)'` (also `echo a >&'$(mark_ran)'`).
```

- Expected:

```
Refused or documented as outside the grammar: each runs mark_ran in bash (PS4 is expanded for every traced command, `@P` and an arithmetic subscript expand a stored `$( )`, a non-numeric `>&` word is expanded twice).
```

- Observed:

```
plain and always() accepted; bash ran the marker as a script file (-e -o pipefail) and under -c. The `$(` is single-quoted text to every reader, and PS4/set/echo/`>&` are allowed. Not in the known list (which names the six readers, writing a file in a heredoc, `&>` and `<<WORD` before the head). A careless edit does not produce these; listed because they are accepted by a closed grammar that says it fails closed.
```

- Pre-existing:

```
Pre-existing: all four accepted identically by 39459bd2, 1806bf8a, c95eebcf and the head.
```


## DW-6 (differential-wide): The committed fuzz cannot draw four of the five accepted-and-run shapes above, and uses bash -c as its oracle

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED: gen4 draws `#$(mark_ran)` body lines, `)` in `${ }` and `$[ ]`, the glued `#`, the array and process substitution forms.
- Input:

```
outbox/guard-heredoc-fuzz-2026-11-19.py: BODY and BODY2 have no `#$(mark_ran)` line (only `# c`, `# ) c`) and no safe head followed by a quoted `$(mark_ran)`; `$(echo ${x..)..} ...)` never occurs inside a body or string (the `${x:-))}` in STRAY3 is an operator prefix); `(( ))` occurs only as `(( {R}{OP} ))` with no `#` and no later `mark_ran` on the same line; no comment line ending in a backslash inside `$( )`. Its oracle is `bash -c`, where bash recovers from some syntax errors and goes on (`x=(<'` newline `mark_ran` newline `'` runs mark_ran), and without -e.
```

- Expected:

```
A differential test whose 'marker ran' set is what a runner would execute, and whose generators can reach the shapes the reader's clauses are about.
```

- Observed:

```
The three published runs show '0 accepted scripts whose marker ran' while DW-1 (always() heredoc and string forms), DW-2, DW-3 and DW-4 are accepted and run. Under -c, 69 of the 79 G candidates and `x=(<'...` were not runnable as a script file, and my first run counted 324 marker runs of which 220 were stale background jobs; the file oracle and a fresh marker path per run removed both.
```

- Pre-existing:

```
Pre-existing for the fuzz design; the heredoc and string inputs of DW-1 only became accepted with 1806bf8a.
```


## Refuted as known

- CL-5: A fake heredoc operator (inside a quote) whose delimiter is an allowed command makes _assemble read the lines up to a line `true` as a code heredoc and then trust the next line from a clean state, though bash is inside a string opened in the consumed lines; no stop fires
- SF-5: After a stop (C2) a whole-line `#` inside a multi-line double-quoted string is dropped as a comment, but bash expands the `$( )` on it; c95eebcf refused this and the strict reader accepts it again
- DW-3: The fallback that reads a heredoc body or a string as command lines hides what bash expands: `'$(cmd)'` and `#$(cmd)` lines, and 'a heredoc' is not a refusal in an always() step
