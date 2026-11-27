# Fourth review of the narrowed reader (workflow `wf_2947ccfb-10f`, 2026-11-19, of `652b23e7`): the confirmed findings, verbatim, with what was done

Four lenses (exotic-and-contexts, strings-closing-and-odd-blanks, tests-and-table, regression-and-differential), 54 agents, 3.7 h, 2 or 3 skeptics per finding. 25 findings reported, 22 confirmed, 3 refuted. Each finding below is the reviewer's own text (control characters shown as escapes, `path:line` citations written `path (line N)`), then the disposition. The reviewers' coverage statements follow the findings. Summary and the fixes: `outbox/cc-session-2026-11-19-gate-heredoc.md`, section "What review 4 found, and what was done". Written 2026-11-27 from the saved workflow result: the session's own result file was the only copy, and reviews 2 and 3 already had dossiers.

## EC-1 (exotic-and-contexts): A heredoc operator inside the parentheses of a `[[ x =~ ( ... ) ]]` regex or a `[[ x == @( ... ) ]]` extglob pattern is read as a heredoc: bash reads it as pattern text, so the lines after it run (or a `$( )` in them runs) while the guard skips them as data

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED. New with this item (the parent refused it). A `(` that no `$` precedes, after a `[[` on its line, is EXOTIC; entries `exotic-dbl-bracket`, `exotic-dbl-bracket-lookbehind`; 3 rows.
- Skeptics: 2 of 2 upheld
- Input:

```
Plain-step and always() accept, bash runs the marker (each as a file, -eo pipefail):
(A) `[[ truetrue =~ (true|cat <<EOF)true ]]` / `mark_ran` / `EOF`
(A2) `[[ x =~ (true|cat <<EOF)true ]] || true` / `mark_ran` / `EOF`
(B) extglob: `[[ truetrue == @(true|cat <<EOF)true ]]` / `mark_ran` / `EOF`; the same with `!(`, `*(`, `?(`, `+(`
(C) multi-line group, quoted delimiter hides a live substitution: `[[ x =~ (true|` / `cat <<'EOF'` / `$(mark_ran)` / `EOF` / `)true ]] || true`
(D) as an if condition: `if [[ x =~ (true|cat <<EOF)true ]]; then true; fi` / `mark_ran` / `EOF`
(E) readers tee and jq: `[[ x =~ (true|tee <<EOF)true ]] || true` / `mark_ran` / `EOF`
The closing `)true` matters: a bare `) ]]` leaves `]]` as a command head and the step is refused. 9 templates of the 127 produce it; 16318 of 100000+ accepted generated scripts were this family (7953 + 8365).
Pre-existence: the PARENT 39459bd2 REFUSES all of them (it refuses every heredoc). 1806bf8a ACCEPTS them. c95eebcf REFUSES them and 0ba7f399 REFUSES them (its `brk` stack held a `[` for the `[[` and the operator inside it was not top level). So the false green is new with the feature (1806bf8a) and is RE-OPENED by round 4: removing `brk` dropped the only thing that refused it, and EXOTIC (`(( $[ <( >( =( \w[`) does not name `[[` regex or extglob groups.
Cause: heredoc_as_data checks only a fresh _Open stack and an unmatched `{` at the operator. A plain `(` is not tracked (right for a subshell), and `[[ ... =~ ( ... ) ]]` / `[[ ... == @( ... ) ]]` read their parentheses as text (bash's parse_matched_pair: `<<`, `;`, `|`, newlines and `$( )` live inside). split_commands treats `(`, `)` and `|` in it as separators, so `cat` becomes the head of a group and the reader test passes.
DOC/TEST-GAP: the `_Open` docstring, the EXOTIC comment, heredoc_as_data's docstring and the note's item 2 present the EXOTIC list as the forms in which `<<WORD` is no heredoc; this form is missing. The committed fuzz (outbox/guard-heredoc-fuzz-2026-11-19.py) has 0 occurrences of `=~` or `@(`, and no self-test row draws such a group. No real workflow uses `[[` at all (0 hits), so this needs a deliberate edit.
```
- Expected:

```
Refused, or the heredoc not read as data: after the `[[`, a regex or extglob group is text, `<<EOF` starts no heredoc, `mark_ran` is a command bash runs. A line that holds `=~ (` or an extglob opener inside `[[ ]]` should be EXOTIC (the stop), or the operator inside `[[ ]]` should be code. (Over-broad: making every `[[` EXOTIC would break the pinned row at the self-test's line ~4272, `if [[ -n "$A" ]]; then` / `cat <<EOF`.)
```
- Observed:

```
read_step: unresolved == [] (a plain step accepts) and hides_a_launcher(...) == False (an always() step accepts). command_lines gives (['[[ truetrue =~ (true|cat )true ]]'], ['mark_ran']): `mark_ran` is a skipped heredoc body. bash prints `s.sh: line 4: EOF: command not found` and the marker file exists. Old-guard table (plain/always): HEAD (True,True), 1806bf8a (True,True), 39459bd2 (False,False), c95eebcf (False,False), 0ba7f399 (False,False). Input (E, jq) is accepted only in an always() step at HEAD and 1806bf8a.
```
- Command:

```
mkdir -p /dev/shm/rev4-x && cd /dev/shm/rev4-x && printf 'mark_ran() { echo x >> "$MARK"; }\n[[ truetrue =~ (true|cat <<EOF)true ]]\nmark_ran\nEOF\n' > s.sh && rm -f m && MARK=$PWD/m bash --noprofile --norc -eo pipefail s.sh; ls m   # m exists: the marker ran
python3 - <<'EOF'
import importlib.util, sys
sys.argv=['x']
spec=importlib.util.spec_from_file_location('g','<worktree-at-652b23e7>/scripts/check-browser-gate.py'); g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
s=open('/dev/shm/rev4-x/s.sh').read().split('\n',1)[1]
r=g.read_step({'run':s},{},lambda p:(_ for _ in ()).throw(KeyError(p)))
print(r['unresolved'], g.hides_a_launcher(r['unresolved'],s))   # [] False
print(g.command_lines(s))
EOF
# the older guards: git show 39459bd2:scripts/check-browser-gate.py (and c95eebcf, 0ba7f399) refuse it; 1806bf8a accepts it
```

## EC-2 (exotic-and-contexts): A whole-line `#` inside a multi-line `[[ x =~ ( ... ) ]]` regex group is dropped as a comment by the guard, but bash expands the `$( )` in it (a new surface of the known whole-line-`#`-inside-a-multi-line-construct root cause; no heredoc involved)

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED, accepted by the parent in the same form: a whole-line `#` inside a multi-line `[[ ]]` group. Residual CC-CMD item 1b.
- Skeptics: 2 of 2 upheld
- Input:

```
`[[ x =~ (true` / `#$(mark_ran)` / `)true ]] || true`  (also `[[ x =~ (true|` / `  # $(mark_ran)` / `)true ]] || true`). Run as a file with -eo pipefail the marker runs. Both are accepted as a plain step and as an always() step. Pre-existing: the PARENT 39459bd2, 1806bf8a, c95eebcf and 0ba7f399 ALL accept it (the lines are read one by one; a whole-line comment is dropped), so it is not this change's. Reported because the recorded known list names a `#` line inside a multi-line `${ }` and inside a multi-line string, not inside a `[[` regex or extglob group, and because the narrowed reader's claim that a line the stop does not refuse is read as bash reads it does not hold for it. Same root cause as EC-1: the group is text that spans lines and is not tracked.
```
- Expected:

```
Refused (the `$( )` in the `#` line runs).
```
- Observed:

```
command_lines drops the `#` line. Verdict at HEAD (plain, always) = (True, True); bash ran the marker. Old guards 39459bd2 / 1806bf8a / c95eebcf / 0ba7f399 all (True, True).
```
- Command:

```
cd /dev/shm/rev4-x && printf 'mark_ran() { echo x >> "$MARK"; }\n[[ x =~ (true\n#$(mark_ran)\n)true ]] || true\n' > t.sh && rm -f m && MARK=$PWD/m bash --noprofile --norc -eo pipefail t.sh; ls m   # exists
# then read_step({'run': '[[ x =~ (true\n#$(mark_ran)\n)true ]] || true\n'}, ...) as in EC-1: unresolved == [] and hides_a_launcher == False
```

## SS-1 (strings-closing-and-odd-blanks): hides_a_launcher splits the RAW line with shlex while read_commands splits the odd-blank-rewritten one: a carriage return between a redirect operator and `<<` or `<(`/`>(` makes the opaque reason appear only on one side, and the raw-line scan that would catch the launcher is skipped

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED. New with this item. `hides_a_launcher` reads the line as `read_commands` does (odd blanks as words); entry `hides-odd-word`; 5 refusal rows.
- Skeptics: 2 of 2 upheld
- Input:

```
In an always() step (a plain step is refused: its unresolved list is non-empty), with CR = U+000D written literally: `echo a >CR<< x; mark_ran`  (also `echo a >>CR<< x; mark_ran`, `echo a 2>CR<<x; mark_ran`, `echo a <<<CR<<x; mark_ran`, `echo a >&CR<<x; mark_ran`, `echo a &>CR<<x; mark_ran`, `echo a >CR<<echo; mark_ran`) and the process-substitution form `cat <CR <(mark_ran)`, `cat <CR<(mark_ran)`, `echo a >CR >(mark_ran)`, `echo a >CR>(mark_ran)`, `echo a 2>CR>(mark_ran)`. (`mark_ran` stands for any command; `echo a >CR<< x; npx playwright test` is accepted the same way.) Mechanism (code): read_commands runs _odd_to_word first, so shlex sees `>x<<` and raises Unreadable('a heredoc') / ('a process substitution'), both in OPAQUE_REASON_OK. hides_a_launcher then re-splits each logical line RAW (check-browser-gate.py ~line 1244, `split_commands(line)`), where shlex reads CR as a blank: `>` swallows the next token (`<<`, `<(`) as its redirect target, no Unreadable is raised, so `raw_line_hides(line)` is never called and the command after `;` is never checked. heredoc_as_data's own split_commands call (~line 489) is also on the raw text (fails closed there, no false green found).
```
- Expected:

```
hides_a_launcher must reach the same verdict as read_commands for the same line: the odd-blank rewrite (the stated purpose of _odd_to_word, note item 7: 'where a line is read for its commands') has to apply to every reader of the line, or the raw-line scan runs and finds `mark_ran` as a head, exactly as it does for the same line without the CR (`echo a >x<< x; mark_ran` is refused).
```
- Observed:

```
accepted as opaque in an always() step (hides_a_launcher False; unresolved is `a heredoc` / `a process substitution`), and bash runs the marker as a file: `echo a >CR<< x; mark_ran` ran=True; `cat <CR <(mark_ran)` ran=True; `echo a >CR>(mark_ran)` ran=True (fresh empty cwd; the `<CR<<` variant needs a file named CR to exist or no -e, so use the `>` variants). Controls in the same run: `echo a >x<< x; mark_ran` and `cat <x <(mark_ran)` are refused. Parent 39459bd2, 1806bf8a, c95eebcf and 0ba7f399 REFUSE every one of these inputs, so this is new at the head (introduced by 1e86e68d). A one-line patched copy (`split_commands(_odd_to_word(line))` in hides_a_launcher) refuses all of them. Found by systematic CR insertion at every position of 39 redirect/heredoc/procsubst bases (and not by gen, gen2, gen3, gen4 or the self-test rows).
```
- Command:

```
WT=<a detached worktree of 652b23e7>; cd $(mktemp -d) && python3 - <<'EOF'
import sys, importlib.util, subprocess, os, tempfile
sys.argv=['x']
def load(p):
    s=importlib.util.spec_from_file_location('g',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
G=load(os.environ['WT']+'/scripts/check-browser-gate.py')
rd=lambda p:(_ for _ in ()).throw(KeyError(p))
def bash_ran(s):
    d=tempfile.mkdtemp(); m=d+'/m'; open(d+'/s.sh','w',newline='').write('mark_ran() { echo x >> "$MARK"; }\n'+s+'\n')
    subprocess.run(['bash','--noprofile','--norc','-eo','pipefail',d+'/s.sh'],cwd=d,env={'MARK':m,'PATH':os.environ['PATH']},capture_output=True,timeout=5,stdin=subprocess.DEVNULL); return os.path.exists(m)
for s in ['echo a >\r<< x; mark_ran','echo a >x<< x; mark_ran','cat <\r <(mark_ran)','cat <x <(mark_ran)','echo a >\r>(mark_ran)']:
    st=G.read_step({'run':s},{},rd); print(repr(s),'accepted in always():',not G.hides_a_launcher(st['unresolved'],s),'bash ran:',bash_ran(s))
EOF
# old guards: git -C /home/user/lab-gate-speed show 39459bd2:scripts/check-browser-gate.py (and 1806bf8a, c95eebcf, 0ba7f399) refuse all five
# observed output at the head: True/True/False(control: refused)... i.e. lines 1,3,5 accepted+ran, lines 2,4 refused
```

## SS-2 (strings-closing-and-odd-blanks): _odd_to_word writes an odd blank as the letter `x`, which changes the WORD: a script file, an `npm run` script name or a path containing NBSP, FF, U+3000... is resolved as its `x` spelling, so the guard reads a different file or package script than bash runs

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED. New with this item. An odd blank is written as U+FFFD (`ODD_WORD`), not as the letter `x`, so `npm run a<NBSP>b` no longer reads the sibling `axb`; entry `odd-word-letter`; 2 rows.
- Skeptics: 2 of 2 upheld
- Input:

```
Plain step (unresolved == [] and browser False) with package.json scripts {"a<NBSP>b": "node scripts/shot.mjs" (launches a browser), "axb": "echo hi"}: `npm run a<NBSP>b` (U+00A0; also U+3000, FF, VT, U+2003 and the other 25 odd characters). Second shape, with files scripts/a<NBSP>b.mjs (a launcher) and scripts/axb.mjs (benign): `node scripts/a<NBSP>b.mjs`. Needs a package script or file whose real name contains the odd character AND a sibling named with `x` in its place.
```
- Expected:

```
The guard reads the name bash runs. A word that contains an odd blank must stay a word the guard cannot resolve (fail closed), not be renamed to a plausible allowed one.
```
- Observed:

```
head: `npm run a<NBSP>b` -> browser=False, unresolved=[] (it read the benign script `axb`); `node scripts/a<NBSP>b.mjs` -> browser=False, unresolved=[] (read scripts/axb.mjs). Parent 39459bd2, 1806bf8a, c95eebcf, 0ba7f399: `npm run a<NBSP>b` -> browser=True (the exact name is resolved: shlex keeps NBSP in the word), and `node scripts/a<NBSP>b.mjs` is refused (SCRIPT_FILE's `\w` does not match NBSP). With U+FFFD instead of `x` in _odd_to_word both inputs are refused ('package.json has no script ...'). bash really runs the NBSP-named targets (checked with real files, node 22 and npm). Real tree: 407 run steps scanned, 0 contain a character _odd_to_word would change, so no ordinary step is affected either way.
```
- Command:

```
python3 - <<'EOF'
import sys, importlib.util, os
sys.argv=['x']
def load(p):
    s=importlib.util.spec_from_file_location('g',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
G=load(os.environ['WT']+'/scripts/check-browser-gate.py')
files={'scripts/shot.mjs':"const { chromium } = require('playwright'); chromium.launch();\n",'scripts/a\xa0b.mjs':"const { chromium } = require('playwright'); chromium.launch();\n",'scripts/axb.mjs':'console.log(1)\n'}
pkg={'a\xa0b':'node scripts/shot.mjs','axb':'echo hi'}
for cmd in ['npm run a\xa0b','node scripts/a\xa0b.mjs']:
    st=G.read_step({'run':cmd},pkg,lambda p:files[p]); print(repr(cmd),'browser=',st['browser'],'clean=',st['unresolved']==[])
EOF
# repeat with each of: git -C /home/user/lab-gate-speed show <39459bd2|1806bf8a|c95eebcf|0ba7f399>:scripts/check-browser-gate.py > old.py
```

## SS-3 (strings-closing-and-odd-blanks): A quoted word that is exactly a redirect operator (`">"`, `'>'`, `">>"`, `"<"`, `"<<<"`, `">&"`) is read as the operator: it swallows the separator after it, so the command after the separator is read as an argument and never checked

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED, accepted by the parent in the same form: a quoted word that is exactly a redirect operator. Residual CC-CMD 1f and item 4 (test the unquoted token in the splitter).
- Skeptics: 2 of 2 upheld
- Input:

```
Plain step: `echo ">" && mark_ran`; also `echo '>'; mark_ran`, `echo ">>" ; mark_ran`, `echo "<" && mark_ran`, `printf '%s\n' '>' && mark_ran`, `test x = ">" || mark_ran`, `test x = "<" || mark_ran`, `test x = ">&" || mark_ran`; end to end with package.json {"launch": "node scripts/shot.mjs"}: `echo ">" && npm run launch`. Code: split_commands line ~821 `if t and all(c in "();<>|&" for c in t)` is applied to shlex tokens, which have lost their quotes, so a quoted `>` becomes the REDIRECTS member `>` and `i += 1` skips the next token (`&&`, `;`, `||`), gluing the following command onto the first group. (`"|"`, `";"`, `"&"`, `"("` become separators instead: a false red only; `[ x = ">" ] || cmd` is fine because `]` is the token skipped.)
```
- Expected:

```
A quoted `>` is a word, not an operator; `npm run launch` after it is a command and read as one (browser=True).
```
- Observed:

```
read_step gives unresolved == [] and browser False for `echo ">" && npm run launch` (clean plain step, browser-free); `echo ">" && mark_ran` is accepted as plain AND as always(), and bash runs the marker. Identical at 39459bd2, 1806bf8a, c95eebcf and 0ba7f399. Not in the recorded residual list. Found by the grammar fuzz (seed 8099 of gram: the quoted `">"` after a heredoc).
```
- Command:

```
python3 - <<'EOF'
import sys, importlib.util, os
sys.argv=['x']
def load(p):
    s=importlib.util.spec_from_file_location('g',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
G=load(os.environ['WT']+'/scripts/check-browser-gate.py')
files={'scripts/shot.mjs':"const { chromium } = require('playwright'); chromium.launch();\n"}
for cmd in ['npm run launch','echo ">" && npm run launch','echo \'>\'; npm run launch','test x = "<" || npm run launch']:
    st=G.read_step({'run':cmd},{'launch':'node scripts/shot.mjs'},lambda p:files[p]); print(repr(cmd),'browser=',st['browser'],'unresolved=',st['unresolved'])
EOF
cd $(mktemp -d); printf 'mark_ran() { echo x >> m; }\necho ">" && mark_ran\n' > s.sh; bash --noprofile --norc -eo pipefail s.sh; ls m
```

## SS-5 (strings-closing-and-odd-blanks): No self-test row, no mutation entry and no fuzz generator draws an odd blank between a redirect operator and `<<`/`<(`/`>(`, or inside a script or npm-script NAME; the self-test is 1363/1363 over both SS-1 and SS-2

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED (test gap). One row per odd blank (all 26) and rows for a carriage return between two operators and inside a script name; entries `odd-set-narrow`, `hides-odd-word`, `odd-word-letter`.
- Skeptics: 2 of 2 upheld
- Input:

```
The head's pinned odd-blank rows are `echo a >CR; mark_ran`, `> CR mark_ran`, `<<< CR mark_ran`, `2>CR mark_ran`, `echo a >CR&& mark_ran`, `> FF mark_ran echo "$(date)"`, `> NBSP ...`, `> U+3000 ...`, `> NEL ...`, `> U+2028 ...` and the _odd_to_word unit rows; the committed fuzz draws CR/FF/U+2028 only as a line separator after a delimiter (SEP2) and as `{R} {OP}\r`. None puts the odd blank between two operators, and none has a name with an odd blank in it.
```
- Expected:

```
Rule 90 (an assertion is not trusted until it has failed on purpose): each place _odd_to_word is applied or omitted (read_commands, command_heads, hides_a_launcher, heredoc_as_data) and each word it rewrites should have a row that fails when it is wrong.
```
- Observed:

```
`python3 scripts/check-browser-gate.py --self-test` prints 1363/1363 checks passed at the head while SS-1 and SS-2 are false greens; the fuzz artifact (modes 1 to 4) cannot draw SS-1 or SS-2 (my own 150,000 + 200,000 scripts from three other generators drew SS-1 only through the dedicated insertion pass). Also: the fuzz oracle runs every script in one shared persistent cwd (MK=/dev/shm/hdmk), so a `>CR` redirect of one script creates a file that changes whether a later `<CR` fails; the marker counts are not reproducible for such shapes (seen: `echo a <CR<< x; mark_ran` ran only when a file named CR existed).
```
- Command:

```
cd $WT && python3 scripts/check-browser-gate.py --self-test | tail -1   # 1363/1363 checks passed
# then run the SS-1 and SS-2 commands above against the same $WT: both are accepted
```

## SS-6 (strings-closing-and-odd-blanks): read_step + hides_a_launcher on ONE string that spans N lines is now superlinear in time and, with many `$( )` in it, in memory; the parent was linear; the note says only command_lines' scan count is linear

- Class: TEST-GAP; reach: COSMETIC
- Disposition: RECORDED, measured: reading one long joined string costs about twice the parent's. Residual CC-CMD 1i.
- Skeptics: 2 of 2 upheld
- Input:

```
`echo "a` + N lines of 60 characters + `"` (one joined 60*N-character line), and `echo "a` + N lines each holding 20 `$(date) ` + `"`. command_lines itself is linear (0.05/0.09/0.21/0.42 s for N=500/1000/2000/4000); the cost is in what reads the one long line: shlex builds a 120 KB token by repeated `+=` (1.2 s of 2.4 s at N=2000), and command_heads stores `line[m.end():]` for every head it finds (one copy of the rest of the line per `$( )`), so memory is heads x length.
```
- Expected:

```
Reading cost for a long multi-line string stays near the parent's (linear), as the note's cost claim and the self-test's 2000-line row (which counts _scan calls, not read_step) suggest.
```
- Observed:

```
read_step + hides_a_launcher seconds, head vs parent 39459bd2: N=500 0.27 vs 0.08, N=1000 0.64 vs 0.16, N=2000 1.87 vs 0.34, N=4000 5.12 vs 0.65 (60-char lines); N=20000 x 60 chars did not finish in 60 s. Peak RSS with 20 `$(date)` per line: N=25 18 MB, 50 21 MB, 100 32 MB, 200 79 MB at the head vs 17 to 18 MB at the parent (a 500-line string of this kind was OOM-killed on this machine). No real step is near these sizes (the longest string in the tree is a few dozen lines), so COSMETIC.
```
- Command:

```
python3 - <<'EOF'
import sys, time, importlib.util, os
sys.argv=['x']
spec=importlib.util.spec_from_file_location('g',os.environ['WT']+'/scripts/check-browser-gate.py'); G=importlib.util.module_from_spec(spec); spec.loader.exec_module(G)
for n in (500,1000,2000,4000):
    s='\n'.join(['echo "a']+['x'*60]*n+['"']); t=time.time(); st=G.read_step({'run':s},{},lambda p:(_ for _ in ()).throw(KeyError(p))); G.hides_a_launcher(st['unresolved'],s); print(n, round(time.time()-t,2))
EOF
# compare with git -C /home/user/lab-gate-speed show 39459bd2:scripts/check-browser-gate.py
```

## T4-1 (tests-and-table): Mutation entry browser-gate-ctx-scan-short survives the self-test; the row the commit says pins it (4282) kills no mutant

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED (test gap). A row with the separating script (a stray `}` before a `${` in front of the operator); `ctx-scan-short` is caught.
- Skeptics: 2 of 2 upheld
- Input:

```
Entry browser-gate-ctx-scan-short: find `_scan(text[pos:s], sc)` replace `_scan(text[pos:s - 1], sc)` (heredoc_as_data). Separating script (stray `}` before a `${` directly in front of the operator): `echo }; cat ${<<EOF }` NL `mark_ran` NL `EOF`.
```
- Expected:

```
Each entry's mutant fails at least one row (the commit message says rows pin 'an operator right behind a quote and a `${`'; the note at the tip says ctx-scan-short is 'now caught by a row').
```
- Observed:

```
Self-test with the mutant: exit 0, '1363/1363 checks passed' (sweep: rc=0). Row 4282 (`cat ${<<EOF }`) is decided by the brace count (`{` before the operator unmatched), not by the stack, and row 4289 (`tee f "<<EOF "`) is decided by the splitter masking: both kill none of 357 mutants. The head reads the separating script as code (lines ['echo }; cat ${<<EOF }','mark_ran','EOF']); the mutant reads it as data (['echo }; cat ${ }'] with body ['mark_ran']) and accepts it in a plain and an always() step; bash -c runs mark_ran, a script file stops at the bad substitution (so not a file false green). Same sweep: rewind-joining and rewind-quote also survive at 652b23e7 (rc=0, no hang within 32 s); both were deleted at 57f609b1, ctx-scan-short was not.
```
- Command:

```
git -C /home/user/lab-gate-speed worktree add --detach /dev/shm/rev4-X 652b23e7; cd /dev/shm/rev4-X; python3 -c "s=open('scripts/check-browser-gate.py').read();a='_scan(text[pos:s], sc)';assert s.count(a)==1;open('scripts/_m.py','w').write(s.replace(a,'_scan(text[pos:s - 1], sc)'))"; python3 scripts/_m.py --self-test | tail -1; echo rc=${PIPESTATUS[0]}   # 1363/1363, rc=0
```

## T4-2 (tests-and-table): The closing-line check has no row for a backslash-continued line: judging only the last physical piece (`seg + line`) survives and is a false green

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED (test gap). A row for a backslash-continued closing line; entry `close-line-physical`.
- Skeptics: 2 of 2 upheld
- Input:

```
Mutant of _assemble: `if joining and seg and not _flat_subs(blank_quoted(seg + text[text.rfind("\n") + 1:])):` with `seg + line` in place of the slice. Separating script (line 2 ends in a backslash): `echo "a` NL `$(echo ${y:-\` NL `)}; mark_ran) b"`
```
- Expected:

```
A mutant of the clause 'the line that CLOSES a string is judged with what a backslash joined to it' fails a row.
```
- Observed:

```
Self-test with the mutant: exit 0, 1363/1363 (sweep my-close-after-cur rc=0). Head: lines ['echo "a', '$(echo ${y:-)}; mark_ran) b"'] and the step is refused (False,False). Mutant: one joined line, always() step ACCEPTED (False,True). bash 5.2.21 as a file (-eo pipefail) and with -c: mark_ran RAN. The existing rows put the non-flat substitution on one physical line only (`$(echo ${y:-)}; mark_ran) b"`, which the other mutants of the same clause catch).
```
- Command:

```
in a worktree of 652b23e7: python3 -c "s=open('scripts/check-browser-gate.py').read();a='if joining and seg and not _flat_subs(blank_quoted(seg + text[text.rfind(\"\\n\") + 1:])):';assert s.count(a)==1;open('scripts/_m.py','w').write(s.replace(a,a.replace('text[text.rfind(\"\\n\") + 1:]','line')))"; python3 scripts/_m.py --self-test | tail -1   # exit 0; then read_step/hides_a_launcher on the script above with each guard, and run it as a file with mark_ran() { echo x >> MARK; }
```

## T4-3 (tests-and-table): _odd_to_word has rows for 6 of the 26 characters its docstring lists; narrowing the set survives and is a false green for the rest

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED (test gap). Rows for all 26 odd blanks; entry `odd-set-narrow`.
- Skeptics: 2 of 2 upheld
- Input:

```
The set is `c.isspace() and c not in ' \t\n'` = 26 characters (VT, FF, CR, FS GS RS US, NEL, NBSP, U+1680, U+2000..U+200A, U+2028, U+2029, U+202F, U+205F, U+3000). Rows (the refusal table + the _odd_to_word unit rows) cover CR, FF, NBSP, NEL, U+2028, U+3000. Mutants (site 2 of _odd_to_word): (a) `c in "\r\x0c\xa0U+3000\x85U+2028"` in place of `c.isspace()`; (b) drop U+1680/U+2000..200A/U+2029/U+202F/U+205F; (c) drop VT and FS..US. Script for each character c: `> <c> mark_ran echo "$(date)"`
```
- Expected:

```
Narrowing the set fails a row; the docstring and note promise 'every other str.isspace() character'.
```
- Observed:

```
All three mutants: exit 0, 1363/1363 (sweep rc=0). For the 13 characters tried (VT, FS, GS, RS, US, U+1680, U+2000, U+2001, U+2005, U+200A, U+2029, U+202F, U+205F) head refuses (False,False); mutant (a) accepts all 13 in an always() step, (b) the 9 Unicode spaces, (c) the 5 control characters; bash 5.2.21 ran mark_ran as a file for every one of the 13. Mutant (a) also survives at site 1 alone (`any(c in ...)`).
```
- Command:

```
worktree of 652b23e7; replace `return "".join("x" if c.isspace() and c not in " \t\n" and shown[i] == c` by `..."x" if c in "\r\x0c\xa0U+3000\x85U+2028" and shown[i] == c`; python3 scripts/_m.py --self-test | tail -1  (exit 0); then read each `> <c> mark_ran echo "$(date)"` with the mutant (not hides_a_launcher => True) and run it with bash as a file
```

## T4-4 (tests-and-table): The brace comparator and three EXOTIC regex details are unpinned (whole-line count, `> 0`, `\w` vs letters, `+=(`, `[` followed by non-space)

- Class: TEST-GAP; reach: COSMETIC
- Disposition: FIXED (test gap). Rows (a) to (e) with the separating scripts; entries `brace-whole-line`, `brace-any-open`, `exotic-alnum-subscript`, `exotic-array-plus`, `exotic-subscript-then-blank`.
- Skeptics: 2 of 2 upheld
- Input:

```
Mutants of unchanged-semantics clauses the commit says are pinned: (a) `shown.count("{", 0, s) > shown.count("}", 0, s)` -> whole-line counts `shown.count("{") > shown.count("}")` (review 3 TT-3 (6) named exactly this variant; entry ctx-brace-raw only covers text.count); (b) -> `shown.count("{", 0, s) > 0`; (c) EXOTIC `\w\[` -> `[A-Za-z]\[`; (d) `=\(` -> `\w=\(`; (e) `\w\[` -> `\w\[(?=\S)`. Separating inputs: (a) `{ cat <<EOF ; }` NL `mark_ran` NL `EOF` (head code, mutant data); (b) `{ echo a; } ; cat <<EOF` NL `x` NL `EOF` NL `npm run y` (head data, mutant code: a false red); (c) `a1[1` NL `cat <<EOF` NL `x` NL `EOF` NL `npm run y` and the same with `_[1`; (d) `a+=( cat <<EOF` NL `mark_ran` NL `EOF` (only bash -c runs it); (e) `echo a[ 1` NL `cat <<EOF` ...
```
- Expected:

```
Each mutant fails a row.
```
- Observed:

```
All five exit 0 with 1363/1363. Command_lines output differs between head and each mutant on the inputs above (verified in-process); no bash-run file false green came out of (a), (b), (c), (e); (d) runs only under -c. So these are unpinned details, not known holes.
```
- Command:

```
worktree of 652b23e7; apply each replacement to scripts/check-browser-gate.py (the anchors are unique: `shown.count("{", 0, s) > shown.count("}", 0, s)`, `EXOTIC = re.compile(...)`), python3 scripts/_m.py --self-test | tail -1 (exit 0), then command_lines(<input>) on head vs mutant
```

## T4-5 (tests-and-table): Review 3 TT-4 is not fixed: the 19 rows it named still kill no mutant and keep their labels; 33 of 265 PINNED rows kill nothing; no kill matrix is in the note

- Class: TEST-GAP; reach: COSMETIC
- Disposition: DELIVERED. The kill matrix of the final sweep is `outbox/guard-heredoc-kill-matrix-2026-11-19.txt` (315 entries, each with a kill; 40 of 283 `command_lines:` rows fail under no mutant, listed there). The rows are not relabelled. Residual CC-CMD 1h.
- Skeptics: 2 of 2 upheld
- Input:

```
The 19 row indices review 3 gave at 0ba7f399 (0-based 17, 21, 46, 47, 62, 65, 72, 76, 81, 88, 128, 129, 130, 137, 176, 178, 187, 188, 196), e.g. row `x=$(cat <<EOF)` NL `hi` NL `EOF` NL `npm run y` labelled 'an operator inside a `$( )` that closes on its line is code too: only an operator at the top level is read'.
```
- Expected:

```
Dossier disposition for TT-4: 'FIXED: rows relabelled for the clause that decides them; dead statements removed; kill matrix in the note.'
```
- Observed:

```
Compared by source text: all 19 rows have the identical label at head (0 relabelled). Against 357 mutants (313 harness entries on the guard + 44 mine) each row's verdict changed under none: all 19 still kill nothing, plus 14 more (33 of 265 PINNED rows; 2 of those are this round's rows 4282 and 4289). The row labelled for the top-level operator is decided by _flat_subs (the `<` in the substitution), not by the stack clause: removing `sc.stack or` is caught by exactly 2 other rows. The note at 652b23e7 and at 57f609b1 contains no kill matrix (grep 'kill matrix' in outbox/cc-session-2026-11-19-gate-heredoc.md: no hit).
```
- Command:

```
for each of the 313 browser-gate entries (node extraction of the MUTATIONS table) apply find/replace to scripts/check-browser-gate.py, import the mutant, compare command_lines(row.src)==row.expected for the 265 PINNED_COMMAND_LINES rows and read_step/hides_a_launcher for the 25 tuple tables; list rows whose result never changes. Labels: compare label strings of the same sources at 0ba7f399 and 652b23e7.
```

## T4-6 (tests-and-table): Two rows of the 'third review' refusal table do not run mark_ran, were refused by every revision incl. the parent, and kill nothing; the comment says otherwise

- Class: DOC; reach: COSMETIC
- Disposition: FIXED. The comment above the two rows now says they run no `mark_ran` and kill no mutant.
- Skeptics: 2 of 2 upheld
- Input:

```
Last two scripts of the table at 4354: `echo ]; a[1` NL `cat <<EOF` NL `]=1 || mark_ran` NL `EOF` and `a[$(echo ])` NL `cat <<EOF` NL `]=1 || mark_ran` NL `EOF`. Comment above the table: 'each of these runs `mark_ran` in bash 5.2.21 (as a script file ..., except `a=( cat <<EOF`) and was accepted by 0ba7f399 in an always() step (the plain forms of the heredoc ones too). The parent refused every one of them.' Same family: the SF-2 comment lists 'the first four' plain-accepted and the FF/NBSP/U+3000 always()-accepted at 0ba7f399.
```
- Expected:

```
Every script in a table headed 'runs mark_ran and was accepted by 0ba7f399' runs it and was accepted.
```
- Observed:

```
bash 5.2.21: marker ran False as a file and False with -c for both. Guard verdict (plain,always) for both = (False,False) at the parent, 1806bf8a, c95eebcf, 0ba7f399 and head: refused everywhere, so they pin nothing of review 3 (kill matrix: neither row changes under any of 357 mutants). '(the plain forms of the heredoc ones too)' is true for 4 of the 9 heredoc rows (`: <(true)#"`, `${y:-)}` and `${x%)}` body rows are plain-refused at 0ba7f399). SF-2 table: `echo a >` CR `&& mark_ran` is also plain-accepted at 0ba7f399 and NEL/U+2028 are also always()-accepted, which the comment omits; `> a` CR `echo mark_ran` was already accepted by the parent (the commit says so).
```
- Command:

```
python3 loading the guards from `git show 39459bd2/1806bf8a/c95eebcf/0ba7f399/652b23e7:scripts/check-browser-gate.py`: read_step({'run':s},{},raiser)['unresolved'] and hides_a_launcher; bash --noprofile --norc -eo pipefail script.sh with mark_ran() { echo x >> "$MARK"; }
```

## T4-7 (tests-and-table): Fuzz oracle is still nondeterministic: the claimed fix ('12 racy seeds x 30 runs: 0/30 or 30/30') does not hold, and the cause is SIGPIPE, not the wait

- Class: TEST-GAP; reach: CONTRIVED
- Disposition: FIXED. `restore_signals=False` in the oracle (SIGPIPE stays ignored); the 12 seeds, 30 runs each, give 0/30 or 30/30 (before: 19/30, 28/30, 14/30, 29/30 on four of them).
- Skeptics: 2 of 2 upheld
- Input:

```
outbox/guard-heredoc-fuzz-2026-11-19.py `ran()`, gen3 seeds 3007585, 3007985, 3007986, 3008109, 3008110, 3008112, 3008113, 3009720, 3013196, 3015007, 3015008, 3022505 (the 12 from the dossier), 30 runs each, with the head's Popen/communicate/killpg oracle.
```
- Expected:

```
Every seed gives the same marker bit on every run (commit message 652b23e7; dossier TT-5 'FIXED ... 30 runs of seed 3007585 in the note').
```
- Observed:

```
Idle machine: seed 3007585 = {True: 29, False: 1} (1 of 12 mixed). Loaded machine (other work running): 3007585 {True 13, False 17} and {True 16, False 4} in a second run, 3009720 {True 20, False 10}, 3008109 {True 29, False 1}. Cause: the marker is written by a `<( )` child that gets SIGPIPE when the reader (`diff`) exits first; communicate() cannot wait for a process that is dead. With restore_signals=False (SIGPIPE ignored in the child) the same four seeds give 30/30 True and 3013196 30/30 False. The 'SEED 3007585 x 30' measurement the dossier cites is not in the note.
```
- Command:

```
python3 -c "import importlib.util,sys,collections;sys.argv=['x'];sp=importlib.util.spec_from_file_location('f','outbox/guard-heredoc-fuzz-2026-11-19.py');f=importlib.util.module_from_spec(sp);sp.loader.exec_module(f);print(collections.Counter(f.ran(f.gen3(3007585),'/dev/shm/m') for _ in range(30)))"  # with MK=/dev/shm/hdmk existing; then the same Popen with restore_signals=False
```

## T4-8 (tests-and-table): gen4 cannot detect removal of _odd_to_word or of the stop's stack test, 13 of its 63 alphabet entries never occur in an accepted script, and the dossier's 'gen4 draws the shapes' is false for 5 of the 7 SF-7 shapes

- Class: TEST-GAP; reach: COSMETIC
- Disposition: RECORDED. gen4 cannot see three of the clauses and the oracle `bash -c` cannot carry a NUL; those clauses are pinned by rows and entries, and the fuzz artifact says so. Residual CC-CMD 1h2.
- Skeptics: 2 of 2 upheld
- Input:

```
gen4 (and gen..gen3) of outbox/guard-heredoc-fuzz-2026-11-19.py against controls: head with both _odd_to_word sites off, head with `st.stack or` removed from the dirty stop, head with _FLAT braces/brackets removed, with the closing-line check off, with EXOTIC off. 6000 seeds from 4100000, OLD = head.
```
- Expected:

```
Rule 90 / 91: a control that removes a clause the review's false greens depend on shows violations; dossier SF-7 'FIXED: gen4 draws the shapes'.
```
- Observed:

```
Violations (accepted and marker ran, bash -c): head 3; no-braces 243; no-closing-line 76; no-EXOTIC 11; no-_odd_to_word 3; no-stop-stack 3. So gen4 detects three of the five; for _odd_to_word gen1, gen2, gen3 at 10000 seeds each also show 0 (gen4's alphabet has no CR, FF, NBSP, NEL, U+2028 anywhere; none of `>&'`, a redirect followed by CR, `$[` with `#`, `for ((` with `#`, `printf -v`/`[[ '` is drawn: 5 of the 7 shapes SF-7 listed). Census on 3000 seeds (198 accepted, 54 heredoc-as-data, 98 joined): never in an accepted script: ORD4 `(( i++ ))`, `a=(1 2)`, `a[1]=2`, `echo ]; a[1`, `for ((i=0;i<2;i++)); do :; done`, `f() {`; OPLINE4 `x=$(cat <<EOF`, `tee $[ <<EOF ]`; STR4 the two `${y:-)}`/`$[1)]` strings, the `${x:-)}` one, the `node -e` string, `echo "a $(echo 'b')
c"` (13 of 63; the hostile ones are controls and are refused by design, the ordinary-looking ones are dead). Printed alphabets: gen4 is right (24/12/18/9); gen3's omits STR2, which gen3 draws in 13% of its units. REACHED lines: 6.6% of scripts accepted, 1.8% with a heredoc read as data, 3.3% with a joined string.
```
- Command:

```
GUARD=<mutant copy> OLD=<head> python3 outbox/guard-heredoc-fuzz-2026-11-19.py 6000 4100000 4 (Pool(2), MK in scratch); census: patch random.Random to record choice() and compare with read_step/hides_a_launcher per script
```

## T4-10 (tests-and-table): Claims in the commits, dossier, note, docstrings and entry claims that the code or the artifacts do not support

- Class: DOC; reach: COSMETIC
- Disposition: FIXED. The fuzz artifact was re-run at the head, the note and the residual CC-CMD were rewritten with measured figures; the commit messages are not rewritten (`652b23e7` said 30 entries were added or repointed, its diff adds none and deletes 3).
- Skeptics: 2 of 2 upheld
- Input:

```
(1) Dossier TT-5 'FIXED ... 30 runs of seed 3007585 in the note', R4 'FIXED (doc): the cost is measured ... (note, Verified)', TT-4 'kill matrix in the note': none is in outbox/cc-session-2026-11-19-gate-heredoc.md at 652b23e7 or 57f609b1; its 'Not verified' section still says the self-test cost 'by how much of it this item is is not measured', and the table row says 'the cost measured'. (2) outbox/guard-heredoc-fuzz-2026-11-19.txt was not re-run: header 'head 016b0c9a', OLD = c95eebcf, no gen4, no REACHED line, the controls name `st.brk` (gone); the .py docstring sends the reader to that txt for the controls. (3) Commit 652b23e7 says '30 mutation entries added or repointed': its mutation-check.mjs diff adds 0 entries and deletes 3 (git show --stat: 24 deletions); 1e86e68d says '38 ... repointed or added' and adds 41 and changes 18 (removes 17). (4) command_lines docstring still lists 'a `((`' among what a line 'leaves open'; the stop now tests EXOTIC for it. (5) Entry browser-gate-heredoc-ctx-stack claims 'an operator inside a string, a `${ }`, a backtick pair or a `$'...'`', but the commit itself calls the string and backtick kinds equivalent; the clause decides only `${` and `$'`. (6) Note, review-2 table row 3 says '`_scan` keeps `brk`' as what the strict reader does; `brk` is gone. (7) Row 4291 label 'a substitution in it that is not flat is not joined' with an expected value that IS joined. (8) Dossier SF-7 and DW-6 'FIXED: gen4 draws the shapes': see the 5 of 7 not drawn.
```
- Expected:

```
Comments, labels, commit messages and dispositions describe what the diff and the artifacts contain.
```
- Observed:

```
Each of (1) to (8) reproduced by grep or by `git show --stat`/`git diff` of the named commits; self-test count (1363), anchors (0 stale, 2160 of 2163), probe numbers (407/1/2/46/2) and gen4's 198/54/98 and 237 are accurate.
```
- Command:

```
grep -n -i 'kill matrix\|3007585\|CPU' outbox/cc-session-2026-11-19-gate-heredoc.md; git show --stat 652b23e7; git show 652b23e7 -- scripts/mutation-check.mjs | grep -c '^+    id: '; head -3 outbox/guard-heredoc-fuzz-2026-11-19.txt; grep -c REACHED outbox/guard-heredoc-fuzz-2026-11-19.txt
```

## RD-1 (regression-and-differential): A `${`, `$'` or `$$'` that a backslash-newline splits is no opener for _scan: the lines after it are trusted from a clean state, so a quoted heredoc, a joined single-quoted string or a comment line hide a command in a PLAIN step

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED. New with this item. A logical line that a backslash joined is scanned whole; entry `join-rescan`; 4 rows.
- Skeptics: 2 of 2 upheld
- Input:

```
Python literals (\n = newline, \\ = one backslash). (a) "echo $\\\n{x:-\ncat <<'EOF'\n$(mark_ran)\nEOF\n}"  (b) "echo $\\\n$'\\'\n#\n(mark_ran)\n'"  (c) "echo $\\\n'\\'\necho '$(mark_ran)\n'"  (d) "echo $\\\n$'\\'\nmark_ran\n'" (always() only). Control: "echo ${x:-\ncat <<'EOF'\n$(mark_ran)\nEOF\n}" (the opener on one line). Also with `cat >> \"$GITHUB_STEP_SUMMARY\" <<'EOF'` or `tee f <<'EOF'` as the reader in (a). With `npm run check` (a package.json script that read_step reads as a browser step) in place of `mark_ran` in (a) and (b), read_step at the head gives browser False, unresolved [].
```
- Expected:

```
The line a backslash-newline joined to `echo ${x:-` leaves a `${` open, so the reading must stop (as `echo ${x:-` written on one line does: the control is refused) or the line must be refused; `$$'..` and `$'..` must not be tokenized differently from bash. A reader that claims to trust only what it checks on one logical line from a fresh state must scan that logical line, not its physical halves.
```
- Observed:

```
The head accepts (a), (b) and (c) as PLAIN steps (unresolved == []) and (d) in an always() step; bash runs mark_ran in all four (file mode, -eo pipefail). Cause: _assemble calls _scan(line, st, bound) on each physical line of a backslash-joined logical line while `text` is joined with nothing (c95eebcf's fix). A token split by the join is read as two characters: `$`+`{` pushes no `${`, and _flat_subs rejects an unclosed `$(` or backtick but not an unclosed `${`, so no stop fires; `$`+`'` pushes a plain `'` (backslash literal) where bash opens an ANSI-C `$'` (a backslash escapes `'`); `$`+`$'..` is read as `$'` where bash reads `$$` and a plain quote. The next lines are then read from a clean state while bash is inside `${ }` (where the body of a `<<'EOF'` heredoc is text and `$(mark_ran)` expands: (a)) or inside a string that closes elsewhere ((b), (c), (d)). Found by the boundary oracle (the head's trusted boundaries against `bash -n`): of 130,788 exhaustive scripts it flagged only `echo $\\NL{`; gen E (100,000 scripts) then gave 12 minimal forms the head accepts and the parent refuses.
```
- Command:

```
python3 - <<'PY'
import importlib.util, os, subprocess, sys, tempfile
R = "/home/user/lab-gate-speed"; D = tempfile.mkdtemp()
def guard(sha):
    p = f"{D}/g{sha}.py"; open(p, "w").write(subprocess.check_output(["git", "-C", R, "show", f"{sha}:scripts/check-browser-gate.py"], text=True))
    s = importlib.util.spec_from_file_location("g" + sha, p); m = importlib.util.module_from_spec(s); sys.argv = ["x"]; s.loader.exec_module(m); return m
def verdict(g, s):
    u = g.read_step({"run": s}, {}, lambda p: (_ for _ in ()).throw(KeyError(p)))["unresolved"]
    return "plain" if not u else "always()" if not g.hides_a_launcher(u, s) else "refused"
def ran(s):
    open(f"{D}/s.sh", "w", newline="").write(s); open(f"{D}/env.sh", "w").write('mark_ran() { echo x >> "$MARK"; }\n')
    if os.path.exists(f"{D}/m"): os.unlink(f"{D}/m")
    subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", f"{D}/s.sh"], cwd=D, env={"PATH": os.environ["PATH"], "BASH_ENV": f"{D}/env.sh", "MARK": f"{D}/m"}, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
    return os.path.exists(f"{D}/m")
for name, S in (("a", "echo $\\\n{x:-\ncat <<'EOF'\n$(mark_ran)\nEOF\n}"), ("b", "echo $\\\n$'\\'\n#\n(mark_ran)\n'"), ("c", "echo $\\\n'\\'\necho '$(mark_ran)\n'"), ("d", "echo $\\\n$'\\'\nmark_ran\n'"), ("control", "echo ${x:-\ncat <<'EOF'\n$(mark_ran)\nEOF\n}")):
    print(name, "marker ran:", ran(S), {c[:4]: verdict(guard(c), S) for c in ("39459bd2", "1806bf8a", "c95eebcf", "0ba7f399", "652b23e7")})
PY
# observed: a: ran True, parent refused, 1806 plain, c95e plain, 0ba7 plain, head plain; b: parent refused, 1806 always(), c95e/0ba7/head plain; c: parent refused, the other four plain; d: parent refused, the other four always(); control: ran True, 1806 plain (it had no brk), c95e/0ba7/head refused.
```

## RD-2 (regression-and-differential): After a heredoc that is not read as data, _assemble resumes the trusted reading at the guard's terminator line, but bash is not there: a quoted `<<WORD x` is no operator for bash, and an unquoted body line that ends in a backslash joins the terminator line into the body

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED in part. A heredoc that is not read as data now stops the trust for the rest of the step (entry `code-heredoc-stop`; 3 rows). What remains is the parent's line-by-line reading of a string that spans lines in an always() step: residual CC-CMD 1e.
- Skeptics: 2 of 2 upheld
- Input:

```
Python literals. (a) 'echo "<<true x"\necho "a\ntrue\necho x" ; mark_ran ; echo "\n"'. Same with the quote kinds `echo '<<true x'`, `echo $'<<true x'`, `echo ${x:-<<true }`, and the operator followed by `;`, `|`, `)`, `<`, `>` or `&` inside the quote; also with the operator in the second line of a string that spans lines: (a') 'echo "a\nb <<true x"\necho "a\ntrue\necho x" ; mark_ran ; echo "\n"'. Control for (a): 'echo ok\necho "a\ntrue\necho x" ; mark_ran ; echo "\n"'. With the terminator hidden by a continuation instead of a benign word: 'echo "<<EOF"\necho "a\necho b \\\nEOF\necho x" ; mark_ran ; echo "\n"'. (b) "cat <<EOF\necho \\\nEOF\necho 'x\n$(mark_ran)\ny'" (also with `tee f <<EOF`, with `echo 'NL$(mark_ran)NLEOFNL'` so that a later EOF line sits in the string, and `x=$'a\\n$(mark_ran)\\n'`). Control for (b): the same with `<<'EOF'` (quoted delimiter; nothing runs, accepted correctly).
```
- Expected:

```
An operator that is not read as data (quoted, in `${ }`, or a body whose end the reader cannot place: a line ending in a backslash is why heredoc_as_data returns None) must stop the trusted reading for the rest of the step, as an unparseable operator (`ops is None`) and a missing terminator do. command_lines' docstring: 'trusts only what it can check on one logical line, from a fresh state, and fails closed'.
```
- Observed:

```
All accepted by the head in an always() step (a plain step refuses: the lines of the consumed segment hold an unbalanced quote or the heredoc reason). bash runs mark_ran in every one (file mode). Mechanism: heredoc_operators finds `<<true` followed by a blank (or `;|&)<>`) inside the quote or `${ }`; heredoc_as_data returns None (not at top level); _assemble appends the line, reads the lines up to the first line equal to the word with _assemble(..., False, False) (strings not joined) and sets i = found[0], with joining and heredocs still on and no stop. Bash has no heredoc: a string opened in the consumed lines (`echo "a`) is still open, so the guard's parity is inverted from the terminator line on, and `x" ; mark_ran ; echo "` is read as text. (b): bash joins `echo \\NLEOF` before comparing with the delimiter, so the heredoc does not end at that EOF line (it ends at the end of the script, no terminator needed) and the following lines are its body, where `$(mark_ran)` expands; the guard (body ends in a backslash, so the heredoc is code) ends it at the first EOF line and reads `echo '` NL `$(mark_ran)` NL `y'` as a joined single-quoted string. With `npm run check` for the marker in (a) and (b): browser False, hides_a_launcher False. The boundary oracle flags these boundaries (bash lexically open / still in the heredoc / ended the heredoc earlier). The same oracle also finds NUL in a terminator (RD-3).
```
- Command:

```
python3 - <<'PY'
import importlib.util, os, subprocess, sys, tempfile
R = "/home/user/lab-gate-speed"; D = tempfile.mkdtemp()
def guard(sha):
    p = f"{D}/g{sha}.py"; open(p, "w").write(subprocess.check_output(["git", "-C", R, "show", f"{sha}:scripts/check-browser-gate.py"], text=True))
    s = importlib.util.spec_from_file_location("g" + sha, p); m = importlib.util.module_from_spec(s); sys.argv = ["x"]; s.loader.exec_module(m); return m
def verdict(g, s):
    u = g.read_step({"run": s}, {}, lambda p: (_ for _ in ()).throw(KeyError(p)))["unresolved"]
    return "plain" if not u else "always()" if not g.hides_a_launcher(u, s) else "refused"
def ran(s):
    open(f"{D}/s.sh", "w", newline="").write(s); open(f"{D}/env.sh", "w").write('mark_ran() { echo x >> "$MARK"; }\n')
    if os.path.exists(f"{D}/m"): os.unlink(f"{D}/m")
    subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", f"{D}/s.sh"], cwd=D, env={"PATH": os.environ["PATH"], "BASH_ENV": f"{D}/env.sh", "MARK": f"{D}/m"}, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
    return os.path.exists(f"{D}/m")
T = 'echo "a\ntrue\necho x" ; mark_ran ; echo "\n"'
for name, S in (("a", 'echo "<<true x"\n' + T), ("a-control", 'echo ok\n' + T), ("a-joined", 'echo "a\nb <<true x"\n' + T), ("b", "cat <<EOF\necho \\\nEOF\necho 'x\n$(mark_ran)\ny'"), ("b-control", "cat <<'EOF'\necho \\\nEOF\necho 'x\n$(mark_ran)\ny'")):
    print(name, "marker ran:", ran(S), {c[:4]: verdict(guard(c), S) for c in ("39459bd2", "1806bf8a", "c95eebcf", "0ba7f399", "652b23e7")})
PY
# observed: a: ran True, all five always(); a-control: ran True, parent always(), the other four refused; a-joined: ran True, parent refused, the other four always(); b: ran True, parent refused, the other four always(); b-control: ran False, parent refused, the other four plain.
```

## RD-3 (regression-and-differential): Bash drops a NUL byte from a script file (not on its first line); every reader here keeps it as a character, so `$`NUL`(` is no `$(`, and a delimiter with a NUL ends a heredoc earlier for bash than for the guard

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: FIXED. A script that holds a NUL byte is refused (bash drops it); entry `nul-refused`; rows. Reachable only through a double-quoted YAML `\0`.
- Skeptics: 2 of 2 upheld
- Input:

```
Python literals (\x00 = U+0000). (a) 'true\ncat <<EOF\n$\x00(mark_ran)\nEOF'  (b) 'true\necho "a\n$\x00(mark_ran)\nb"'  (c) 'true\ncat <<EOF\nx\nEO\x00F\nmark_ran\nEOF'  (d) 'true\necho "$\x00(mark_ran)"'. Reachable only through a double-quoted YAML scalar escape: yaml.safe_load('run: "true\\ncat <<EOF\\n$\\0(mark_ran)\\nEOF"') returns (a); PyYAML rejects a raw NUL in a block scalar. Also `EOF` followed by NUL as the terminator line. With `npm run check` for the marker in (a): browser False, unresolved [].
```
- Expected:

```
Refused: a run string that holds U+0000 is not a script this guard reads (bash 5.2.21 reads `$\x00(` as `$(`, `EO\x00F` as `EOF`; on the first line it refuses the file as binary, from the second line it drops the byte).
```
- Observed:

```
The head accepts (a), (b), (c), (d) as PLAIN steps (unresolved == []); bash runs mark_ran in all four as a file. (a) the body line of a data heredoc / (b) the line of a joined string is never read for `$(`; (c) the guard looks for a line that is exactly EOF, bash ends the heredoc at `EO`NUL`F`, so `mark_ran` and the real terminator are 'body' to the guard. The committed fuzz cannot find this: 0 of 80,000 scripts (gen, gen2, gen3, gen4, seeds 0..19999) hold a NUL, and its oracle hands the script to `bash -c` as an argument, which cannot carry a NUL (see RD-7).
```
- Command:

```
python3 - <<'PY'
import importlib.util, os, subprocess, sys, tempfile
R = "/home/user/lab-gate-speed"; D = tempfile.mkdtemp()
def guard(sha):
    p = f"{D}/g{sha}.py"; open(p, "w").write(subprocess.check_output(["git", "-C", R, "show", f"{sha}:scripts/check-browser-gate.py"], text=True))
    s = importlib.util.spec_from_file_location("g" + sha, p); m = importlib.util.module_from_spec(s); sys.argv = ["x"]; s.loader.exec_module(m); return m
def verdict(g, s):
    u = g.read_step({"run": s}, {}, lambda p: (_ for _ in ()).throw(KeyError(p)))["unresolved"]
    return "plain" if not u else "always()" if not g.hides_a_launcher(u, s) else "refused"
def ran(s):
    open(f"{D}/s.sh", "w", newline="").write(s); open(f"{D}/env.sh", "w").write('mark_ran() { echo x >> "$MARK"; }\n')
    if os.path.exists(f"{D}/m"): os.unlink(f"{D}/m")
    subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", f"{D}/s.sh"], cwd=D, env={"PATH": os.environ["PATH"], "BASH_ENV": f"{D}/env.sh", "MARK": f"{D}/m"}, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
    return os.path.exists(f"{D}/m")
for name, S in (("a", 'true\ncat <<EOF\n$\x00(mark_ran)\nEOF'), ("b", 'true\necho "a\n$\x00(mark_ran)\nb"'), ("c", 'true\ncat <<EOF\nx\nEO\x00F\nmark_ran\nEOF'), ("d", 'true\necho "$\x00(mark_ran)"')):
    print(name, "marker ran:", ran(S), {c[:4]: verdict(guard(c), S) for c in ("39459bd2", "1806bf8a", "c95eebcf", "0ba7f399", "652b23e7")})
PY
# observed: a, b, c: ran True, parent refused, 1806bf8a/c95eebcf/0ba7f399/head plain; d: ran True, all five plain.
```

## RD-5 (regression-and-differential): The session note says the design costs and the still-accepted residuals are 'recorded in the residual CC-CMD (item 1, 1g)' / '(1a to 1g)'; at 652b23e7 that file holds no such record

- Class: DOC; reach: COSMETIC
- Disposition: FIXED. The residual CC-CMD holds items 1a to 1i and the design costs (the patch of 2026-11-19).
- Skeptics: 2 of 2 upheld
- Input:

```
outbox/cc-session-2026-11-19-gate-heredoc.md at 652b23e7: 'Design costs, chosen, recorded in the residual CC-CMD (item 1, 1g)' and 'recorded in the residual CC-CMD item 1 (1a to 1g)'; docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md at 652b23e7 (last changed 39459bd2).
```
- Expected:

```
Either the CC-CMD holds items 1a to 1g and the design costs, or the note says they are still to be written (BUILD-ON-A: the residuals must be added to the CC-CMD that already covers them).
```
- Observed:

```
`grep -n '1g\|1a\b\|design cost\|EXOTIC' docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md` finds nothing; item 1 still reads 'APPROVED ... to be built'. The same note's 'Not verified' list says the closure of item 1 with 1a to 1g and the design costs is still to do, so the two paragraphs contradict each other. None of RD-1 to RD-3 or the `<>`-family is in any file either.
```
- Command:

```
git -C /home/user/lab-gate-speed show 652b23e7:docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md | grep -c '1g\|design cost\|EXOTIC'; git -C /home/user/lab-gate-speed show 652b23e7:outbox/cc-session-2026-11-19-gate-heredoc.md | grep -c 'recorded in the residual CC-CMD'
```

## RD-6 (regression-and-differential): Siblings of recorded items that the recorded list does not name, accepted by all five versions: an empty process substitution before a word, and `test -v` / `[ -v ]` / `[[ -v ]]` with a single-quoted subscript

- Class: FALSE-GREEN; reach: CONTRIVED
- Disposition: RECORDED, accepted by the parent in the same form: `<()mark_ran` and a single-quoted subscript in `test -v`, `[ -v ]`, `[[ -v ]]`. Residual CC-CMD 1f.
- Skeptics: 2 of 2 upheld
- Input:

```
'<()mark_ran' (always()); "test -v 'a[$(mark_ran)]'", "[ -v 'a[$(mark_ran)]' ]", "[[ -v 'a[$(mark_ran)]' ]]" (plain).
```
- Expected:

```
Refused, or recorded: bash runs mark_ran in each (an empty `<()` ends the word, so `mark_ran` is a command; a -v operand has its subscript expanded although single-quoted).
```
- Observed:

```
All four are accepted by the head, 0ba7f399, c95eebcf, 1806bf8a and the parent 39459bd2, and bash runs the marker for each. The exhaustive run over 293,000 short token strings found `<()mark_ran` as its only false green.
```
- Command:

```
python3 - <<'PY'
import importlib.util, os, subprocess, sys, tempfile
R = "/home/user/lab-gate-speed"; D = tempfile.mkdtemp()
def guard(sha):
    p = f"{D}/g{sha}.py"; open(p, "w").write(subprocess.check_output(["git", "-C", R, "show", f"{sha}:scripts/check-browser-gate.py"], text=True))
    s = importlib.util.spec_from_file_location("g" + sha, p); m = importlib.util.module_from_spec(s); sys.argv = ["x"]; s.loader.exec_module(m); return m
def verdict(g, s):
    u = g.read_step({"run": s}, {}, lambda p: (_ for _ in ()).throw(KeyError(p)))["unresolved"]
    return "plain" if not u else "always()" if not g.hides_a_launcher(u, s) else "refused"
def ran(s):
    open(f"{D}/s.sh", "w", newline="").write(s); open(f"{D}/env.sh", "w").write('mark_ran() { echo x >> "$MARK"; }\n')
    if os.path.exists(f"{D}/m"): os.unlink(f"{D}/m")
    subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", f"{D}/s.sh"], cwd=D, env={"PATH": os.environ["PATH"], "BASH_ENV": f"{D}/env.sh", "MARK": f"{D}/m"}, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
    return os.path.exists(f"{D}/m")
for S in ('<()mark_ran', "test -v 'a[$(mark_ran)]'", "[ -v 'a[$(mark_ran)]' ]", "[[ -v 'a[$(mark_ran)]' ]]"):
    print(repr(S), "marker ran:", ran(S), {c[:4]: verdict(guard(c), S) for c in ("39459bd2", "1806bf8a", "c95eebcf", "0ba7f399", "652b23e7")})
PY
# observed: ran True for all four; <()mark_ran: always() at all five; the three -v forms: plain at all five.
```

## RD-7 (regression-and-differential): The committed differential fuzz cannot draw the shapes of RD-1 and RD-3 and its '0 violations' says nothing about them

- Class: TEST-GAP; reach: COSMETIC
- Disposition: RECORDED. The committed fuzz cannot draw the shapes of RD-1 and RD-3 (it hands the script to `bash -c`); gen4 now draws a backslash-split opener and a `[[` group; the NUL stays outside the oracle. Residual CC-CMD 1h2.
- Skeptics: 2 of 2 upheld
- Input:

```
outbox/guard-heredoc-fuzz-2026-11-19.py at 652b23e7: gen, gen2, gen3, gen4, seeds 0..19999 each (80,000 scripts); `ran()`: subprocess.Popen(["bash", "--norc", "--noprofile", "-c", pre + script]).
```
- Expected:

```
Rule 91: a generator for each clause the reader's claims rest on, and an oracle that can carry what a runner would execute (a script FILE, stopping at a syntax error).
```
- Observed:

```
Scripts holding a COMMAND line with `$` + backslash-newline + `{`, `'` or `$` (RD-1): gen 0, gen2 0, gen3 0, gen4 0 (the pattern occurs 255, 260, 176, 0 times, always as the bare body line `$\\`, never as the end of a command line). Scripts holding a NUL (RD-3): 0 of 80,000; and a script passed as the argument of `bash -c` cannot hold a NUL at all. The oracle is still `bash -c` without -e (review 3's DW-6): it counts markers that a script file would never run (it continues after a syntax error), which is why its '0 violations' is the safe direction only for shapes the generators can draw. The committed .txt result files are from 016b0c9a (header 'head 016b0c9a'), not from the narrowed head.
```
- Command:

```
cd /home/user/lab-gate-speed && git show 652b23e7:outbox/guard-heredoc-fuzz-2026-11-19.py > /tmp/fz.py && python3 - <<'PY'
import importlib.util, re, sys
sys.argv = ["x"]
s = importlib.util.spec_from_file_location("fz", "/tmp/fz.py"); fz = importlib.util.module_from_spec(s); s.loader.exec_module(fz)
cmd = re.compile(r"(?m)^(.+)\$\\\n[{'$]"); n = {}; nul = 0
for k, f in (("gen", fz.gen), ("gen2", fz.gen2), ("gen3", fz.gen3), ("gen4", fz.gen4)):
    n[k] = sum(1 for i in range(20000) if cmd.search(f(i))); nul += sum(1 for i in range(20000) if "\x00" in f(i))
print("command-line split openers per generator:", n, "scripts with a NUL:", nul)
PY
# observed: command-line split openers per generator: {'gen': 0, 'gen2': 0, 'gen3': 0, 'gen4': 0} scripts with a NUL: 0
```

## Refuted

- SS-4: A heredoc with no terminator keeps its body as lines, and a body line that starts with `#` is dropped as a whole-line comment although bash expands its `$( )` or backtick in an unquoted body; the docstring says such a heredoc 'is then code and refused'
- T4-9: gen4's own run reports false greens at head: an unterminated unquoted heredoc whose body has a whole-line `#` with a substitution is accepted in an always() step and runs it
- RD-4: The narrowing refuses, as a heredoc or multi-line string after a stop, ordinary shapes that 0ba7f399 read as data: an unquoted subscript (this repo's `${PIPESTATUS[0]}`, a regex `^v[0-9]+`), a glob, `<( )`; none is in an audited job

(SS-4 and T4-9 are the unterminated heredoc whose body holds a whole-line `#` with a substitution: the recorded residual 1e, accepted by the parent; RD-4 is the design cost of refusing an unquoted subscript, a glob or `<( )` after a stop, none of which is in an audited job.)

## Coverage, as the reviewers reported it

### Lens exotic-and-contexts (2 reported)

```
Lens exotic-and-contexts, claims C1 to C3. Worktree 652b23e7; the guard's self-test printed 1363/1363. The oracle was bash 5.2.21 running each script as a FILE in its own process group with a 3 s timeout (killed afterwards). A script counts as a false green only when the marker ran as a file and the guard accepted it as a plain step (unresolved == []) or an always() step (not hides_a_launcher). The hit was re-confirmed under -eo pipefail. The generators ran bash without -e, because -e hid markers behind failing earlier commands.

Generated scripts, about 660000 in total (aggregate acceptance 143k, of which 16.3k had the marker run, all of that in finding F1):
- gen5: 120000 scripts, 26976 accepted by the guard, 0 real false greens. Alphabet: 127 distinct tokens, 35 heads, 6 operator spellings, 6 readers, 5 body lines. Its first 3 reports were harness races (scratch dir shared by the two workers), fixed and re-run.
- gen6, bash with -e, no [[ tokens: 150000 scripts, 11756 accepted, 0. Same family, no -e: 150000 scripts, 11487 accepted, 1 hit. The hit is the known `>&'...'` word spanning lines (`cat then >& '\'' -n` / backtick mark_ran / `'`): the parent 39459bd2 refuses it, but the record says a string spanning lines is a new surface of an old root cause. Not reported. Alphabet: 132 tokens, 32 heads.
- gen7, 81 construct templates with the operator hole in a context (groups, loops, pipelines, redirects, continuations, [[ ]], regex, extglob, expansions): 120000 scripts, 50185 accepted, 7953 hits, all in the [[ regex or extglob paren family, 0 other.
- gen7b, 127 templates (adds select, coproc, time, declare, let, printf -v, [ -a ], &>, >|, <>, {fd}<, backslash spellings, !(x), @(x), more [[ shapes): 120000 scripts, 43793 accepted, 8365 hits, all the same family, 0 other.
- Template classification over 12000 seeds: every false green is one of 9 templates (regex group with $x, "$x", a quoted prefix, a bracket expression, a multi-line group; extglob @( )); the other 118 templates accepted scripts in which bash read a real heredoc and the marker never ran.

Hand-written cases, about 70, each run in bash and in the guard (and the four older guards for the hits): [[ in-condition, multi-line, regex, extglob, case, for/select/coproc/let/declare, functions, `\<<EOF`, here-strings, >| <> <& 3<<, <<-, two operators; EXOTIC spellings split by a backslash-newline (`a=\`/`(`, `$\`/`[`, `(\`/`(`, `<\`/`(`), a non-ASCII `\w`, `$ [`, `( (`).
- Result: none of these gives a false green outside F1.
- Result: bash reads `<<WORD` as a heredoc in every non-[[ shape tried that has no syntax error.

Mutation of EXOTIC (8 mutants, each alternative removed, the lookbehind removed, the `<(`/`>(` pair split, the call removed): the self-test goes red for every one (20, 1, 9, 7, 4, 1, 2, 41 failing rows). The `\w\[` alternative and the `(?<!\$)` lookbehind are each pinned by only 1 row.

Not done: the mutation-check.mjs entries were read (entries exist for every EXOTIC alternative), not run; the 3 real workflows with `<<` (a python3 - <<'PY' and two here-strings) were not run through the new reader; no [[ appears in any real workflow (0 of the tree), so F1 and F2 need a deliberate edit.
```

### Lens strings-closing-and-odd-blanks (6 reported)

```
Worktree of 652b23e7, guard self-test 1363/1363 at the head. All counts are scripts read by the guard (read_step + hides_a_launcher, or command_lines/final_script_problems where stated); a script was run in bash (as a FILE, `bash --noprofile --norc -eo pipefail`, fresh empty cwd per run, own process group, 5 s timeout, group killed) only when the guard accepted it, and a false green is counted when the marker ran. Totals: about 2.1 million guard reads. (1) three generators for the lens (token soup with odd blanks, string-opener/middle/closer templates with 36 closers x 25 openers x 29 middle lines x 14 pre/tail forms, odd-blank-in-position templates): 353,000 scripts, 56,070 accepted and run in bash, 14 marker-ran hits, all classified (4 pre-existing known classes, 8 pre-existing known `<<WORD`-before-command shapes, 2 SF-6 assignment-swallow shapes). (2) dense token fuzz fz6: 300,000 scripts (5,045 accepted/run, 107 hits, 9 not accepted by the parent; all 9 in known classes: leading `<<WORD`, `>&'..` multi-line, SF-6). (3) grammar-based generator gram (nested valid dq/sq/ANSI-C/`$()`/backtick/`${}`/arith/heredoc, random newlines, backslash-newlines, CR/FF in strings): 150,000 scripts, 40,608 accepted/run, 27 hits, 5 not at the parent (1 = finding SS-3, 4 known classes). (4) systematic odd-blank mutation: 75 bases x 14 odd characters x every insertion point and every blank replaced = 24,220 scripts, plus 39 redirect/process-substitution/heredoc bases = 16,100 (found SS-1); CR/FF insertion at every position of 2,386 bases that run the marker and are refused = 253,696; CR/NBSP at every position of 2,500 grammar bases = 320,736 (0 further hits). (5) invariant fuzz on command_lines (no physical line dropped, none duplicated, unique token per line): 120,000 scripts, 0 violations; control with the un-join rewind mutated to skip a line: 1,298 violations in 20,000. (6) final-step grammar fuzz: 300,000 scripts through final_script_problems, 5,711 accepted (comment-only scripts), 0 with the marker run. (7) false-red regression: 300,000 scripts head vs parent, 2,835 accepted by the parent only, all of them odd characters in command position (now a word, correctly refused); on the 400 real workflow run steps head, parent and 0ba7f399 give identical plain/always() verdicts (88/128 accepted), 407 real run steps contain 0 characters that _odd_to_word would change. (8) 43 hand probes of bracket-like constructs (`[[ ]]` over lines, select, coproc, function, let, declare -i, `$"..."`, `\(`, brace expansion, `<<<`, `&<(`, `>|`, `<>`, extglob, case, `${y:-"a\nb"}`, `${y:-'a\nb'}`, arithmetic over lines): 0 false greens; ~60 hand probes of closing lines (second string, other quote kind, continuation, `$'`, `$$'`, escaped closer): 0. (9) cost: 18 pathological shapes timed (see SS-7). (10) whitespace classes enumerated over all 0x110000 code points: 29 isspace() characters, 26 besides space/tab/newline; re `\s` and str.split() agree with isspace() exactly (no extra, none missing); shlex blanks are only ' \t\r\n'; bash 5.2.21 reads all 26 odd characters as part of a word and only space/tab as blanks, so there is no character bash blanks that isspace() misses. Controls: with _odd_to_word disabled the fuzz finds 15 false greens in 6,000; with `split_commands(_odd_to_word(line))` in hides_a_launcher all SS-1 inputs are refused; with U+FFFD instead of `x` in _odd_to_word the SS-2 inputs are refused. NOT found: any false green in claims (C4) closing-line check, (C5), (C6) continuation rules, (C3) operator-position reading, and no dropped or duplicated line. Worktree and scratch removed; nothing in /home/user/lab-gate-speed touched.
```

### Lens tests-and-table (10 reported)

```
Lens tests-and-table, head 652b23e7 (worktree removed afterwards). RE-MEASURED: self-test 1363/1363 (43 s wall, loaded machine); `node scripts/mutation-check.mjs --anchors` = 'checked 2160 of 2163 mutation anchors; 0 stale'; outbox/guard-heredoc-probe-2026-11-19.py vs 39459bd2 = 'checked 407 of 407 run steps', 1 heredoc, 2 multi-line strings, 46 blank-only diffs, 2 other diffs (matches the committed txt); gen4 3000 seeds from 4000000 = 198 accepted / 54 heredoc-as-data / 98 joined (matches the commit message), GUARD=0ba7f399 on the same seeds = 237 violations (matches), head = 0 in that window; gen4 vs the parent/OLD runs: accepted_by_old_not_new = 0 for gen..gen4 at 4000 seeds each (docstring claim holds); printed gen4 alphabet 24/12/18/9 equals the lists.
MUTATION ENTRIES: extracted every browser-gate entry of mutation-check.mjs at 0ba7f399 (292) and at head (313): 41 added, 15 changed, 20 removed; replayed all 56 added/changed with the harness's own find/replace (first occurrence, anchors=1 each) through the full self-test: 53 CAUGHT (non-zero exit AND a FAIL line), 3 SURVIVED (exit 0, 1363/1363): ctx-scan-short, rewind-joining, rewind-quote (the last two are deleted at the tip 57f609b1; ctx-scan-short is not). No crash, no hang in the 56.
OWN MUTANTS: 44 (every FLAT class char incl. \n, odd_to_word sites, isspace sets, brace comparator/range/and/or, closing-line conjuncts/slice/rewind, seg value, EXOTIC alternatives and lookbehind, FLAT_SUB order, call sites of _odd_to_word). Survivors: 18. Judged EQUIVALENT (no separating input in 60000 to 120000 random token scripts per mutant, plus reasoning): the three deleted ctx-stack entries (single/double/backtick; confirms the commit), \n in _FLAT, the newline exclusion at both _odd_to_word sites, the `seg and` conjunct of the closing check, `heredocs=False` in the closing rewind, `reversed()` in the closer join, FLAT_SUB alternative order, _odd_to_word before/after strip_comment/blank_quoted in command_heads, whole-text variant of the closing check, the (?<![$(]) lookbehind variant. Survivors with a separating input are findings 1 to 4.
ROWS: compared the 44 new/changed PINNED rows against the 0ba7f399 guard: 20 fail there (they pin a fix), 24 pass there (they pin existing behaviour: not claimed as fixes, except the two table rows in finding 6). Kill matrix: 357 mutants (313 harness entries + my 44) x 265 PINNED rows + 25 table scripts: 33 rows kill nothing (finding 5). Replayed both new refusal tables against bash 5.2.21 (file under -eo pipefail and -c) and against the parent, 1806bf8a, c95eebcf, 0ba7f399, head (finding 6).
FUZZ: outbox/guard-heredoc-fuzz-2026-11-19.py run with Pool(2): gen4 6000 seeds from 4100000 on head and on five mutants (no-braces, no-EXOTIC, no-closing-line, no-odd_to_word, no-stop), 20000 seeds from 5000000 (0 violations), 60000 seeds from 4100000 (9 violations, finding 9), gen1..gen3 10000 each with _odd_to_word removed (0 violations each); oracle: 12 'racy' seeds x 30 runs idle, 4 seeds x 20-30 runs under load, with and without SIGPIPE restored (finding 7); alphabet census of gen4 on 3000 seeds (13 of 63 entries never in an accepted script, listed in finding 8). Also probed 55 shapes from the brief (a [[ ]] over lines, case, function, coproc, select, let, declare, ${x[0]}, $"", \(, brace expansion, <<<, &<(, >|, <>, extglob-free) against bash and 5 guard revisions: 0 false greens beyond finding 9; the differential random searches above are in-process, not bash.
NOT DONE: did not run `--only <id>` (npm build/dotnet) nor the real mutation harness; verdicts are the replayed find/replace + self-test, which is what the harness runs. Did not re-run the 100000-script volume fuzz.
```

### Lens regression-and-differential (7 reported)

```
DENOMINATORS (Rule 91). Every count below was run against bash 5.2.21 as a FILE (`bash --noprofile --norc -eo pipefail`, own process group, 3 s timeout, killed afterwards, as `nobody`, PATH of read-only tools, unknown commands return 0) with the marker `mark_ran`; a false green = the head accepts (plain: unresolved == [] / always(): not hides_a_launcher) AND the marker ran (re-run twice). Bash was only run when some guard accepted. Each false green was minimised (line then character ddmin) and grouped; each group was checked at 39459bd2, 1806bf8a, c95eebcf, 0ba7f399 and the head.

1) FALSE-GREEN HUNT, 2,043,000 scripts in 8 own generators (none of the repo's): A grammar-based valid bash (functions, case, [[ ]], (( )), arrays, heredocs of every delimiter kind, multi-line strings, process substitutions, extglob, coproc, select, marker in a random command or word slot) 400,000 -> head accepted 9,803 (3,599 plain), marker ran in 72 of the accepted, 9 false greens, all one family (`X="$(mark_ran)" cmd`, recorded). B mutation of the 407 real run: steps (1-3 random edits: quote, heredoc around a block, backslash, #, $(, newline, form feed, CR, NBSP, [, ((, <(, a[, =(, $[, marker moved) 300,000 -> accepted 24,619 (17,589 plain), 23 false greens, 0 plain, all recorded families (`VAR="..$(x).." node script`, leading `<<WORD cmd`, whole-line # after a stop). C corpus: C1 single-char/single-line edits of 57 review-3 shapes 300,000 (328 false greens, 22 minimal forms, all recorded families, 0 plain); C2 exhaustive, every sequence of 1-4 tokens over 23 tokens (< ' " $ ( ) { } [ ] # \ NL ` a space ; = & | marker cat EOF) 293,000 -> accepted 89,127, 1 false green (`<()mark_ran`, RD-6); C3 slot skeletons 200,000 (2 false greens, both a backtick pair with a # line, accepted by the parent); C4 random 5-16 token strings 150,000 (0). D line pool (open/close quote lines, heredoc operators of 8 readers, terminators, markers, `[[ a ==`, case, f() {, x=$( ...) 300,000 -> 1,046 false greens, 30 minimal forms, 3 plain, ALL accepted by the parent too (unterminated heredoc + `#$(..)`, `${x-` NL `#$(..)}`). E tokens split by a backslash-newline, then heredocs/strings/comments 100,000 -> 876 false greens, 36 minimal forms, 12 refused by the parent = RD-1. Controls (the harness can fail): the 57 review-3 false greens that are still open at the head (e.g. `>&'$(mark_ran)'`, `(( n=1 # c )) || :; mark_ran`) are found by C1 every time; `echo $\`/`{x:-`... is found by E.
2) BOUNDARY ORACLE (a second, marker-free differential): the head guard's own trusted logical-line boundaries, string interiors and heredoc ends were compared with `bash -n` on the script prefix (bash must be lexically closed at a boundary, still inside the string in a string's interior, still in the heredoc one line before the guard's terminator; a prefix that already has a syntax error is skipped). Controls: it flags the known desyncs (fake operator, NUL in a terminator, backslash before a terminator). Runs: real run: steps 407 (396 with a trusted boundary) -> 0 flagged; exhaustive `echo ` + 2-5 tokens over {" ' \ $ { ( ) } NL a # [ ]} requiring a newline, 130,788 scripts -> 2 flagged: `echo $\`NL`{` (RD-1) and `echo "$["` (bash parses a nested quote in `$[ ]` inside a string but then fails the expansion with 'bad substitution', nothing runs: not exploitable); exhaustive 2-5 tokens over {cat <<, <<', ', EOF, NL, \, a, $(, ), ", #} 31,432 scripts (2 of 6 slices) -> 1 flagged (`\<<EOF`/`EOF`, the fake-operator family of RD-2); exhaustive over {" ' \ $' ` $( ) NL a space # ${ }} lengths 2-4 8,319 and 2-5 21,796 (1 of 6 slices) -> 0; gens: c_skel 60,000 -> 36 flagged, d 40,000 -> 31, e 30,000 -> 8,935 (by construction). Every flagged non-noise shape is RD-1 or RD-2.
3) FALSE REDS. Probe `outbox/guard-heredoc-probe-2026-11-19.py` with the 39459bd2 guard: checked 407 of 407 run steps in 57 files; 1 step with a heredoc operator, 2 with a string that spans lines; 46 differ only in the blank where a backslash joined two lines; 2 differ (mutation-ids-probe.yml 'What the driver said about each id' 8->4 lines, 12->1 reasons; open-meteo-egress-probe.yml 'Recorded weather and the availability record, under the fault' 18->13 lines, 30->5), both outside the audited jobs. With the 0ba7f399 guard: 0 steps differ. It does NOT cover: verdicts (it compares command lines and reasons, not plain/always()/browser), `audit()` of the four target jobs, steps that do not exist yet, the 3 of 407 steps that reach the new paths are its whole sample of them, nothing outside .github. I added: verdicts (plain-clean, always()-accepted, browser) of all 407 steps at 39459bd2/0ba7f399/head: identical, 330/375/50 each; `python3 scripts/check-browser-gate.py` prints `verdict: gated` at all three. Appending one of 4 ordinary blocks (summary heredoc, quoted summary heredoc, multi-line commit message, multi-line echo) to each real step (1,628 cases): head accepts 1,376 in always() (parent 0), head refuses and parent accepted 0, head refuses and 0ba accepted 76 (19 steps, all with a stop line) -> RD-4. 95 ordinary shapes by hand (summary heredocs, multi-line echo, git commit -m over lines, gh/jq/curl chains, loops, case, functions, counters, arrays, [[ ]], globs, node -e over lines): head differs from the parent in 30 shapes, always in the direction of reading more; refused at the head but read at 0ba: `echo f[0-9]` + heredoc, unquoted `${arr[0]}` + heredoc, `diff <(..)` + heredoc, `$(echo ${v})` + multi-line string (the listed design costs). 100,000 benign edits of real steps (a comment, a multi-line echo, a summary heredoc, `$(date)`, `$((n+1))`, arrays, case, [[ ]] inserted): head accepts 73,970, parent 31,048, 0ba 74,980; head refuses where the parent accepted: 0; where 0ba accepted: 1,010 (1.0%). Performance: 16 pathological shapes (3,000 lines of strings/heredocs/continuations): head <= 0.65 s each, no crash in any of the 2.04M scripts (head_err 0); the parent took 11.2 s on 3,000 continuation lines, the head 0.04 s. Real tree stop triggers: 22 of 407 steps hold an EXOTIC line (25 lines: 11 `exit ${PIPESTATUS[0]}`, `PREM=`/`JUDGE=${PIPESTATUS[0]}`, `| tee ...; exit ${PIPESTATUS[0]}`); 27 hold a non-flat substitution; of the 143 run steps in the four audited jobs 0 hold an EXOTIC line, 3 a non-flat substitution.
4) TIMING `python3 scripts/check-browser-gate.py --self-test`, 3 runs each, wall seconds at load average 2.6-3.6 (4 CPUs, about 1 real): 39459bd2 20.9/21.2/21.2 (954/954 checks); 0ba7f399 29.7/29.3/29.6 (1288/1288); 652b23e7 31.3/29.8/29.4 (1363/1363). One run each under fuzz load 5-6: user+sys CPU 16.2+2.1, 22.7+2.8, 23.2+3.1 s. The head costs +40-45% over the parent and +2% over 0ba; the note's 'about 25 s' is CPU time. `node scripts/mutation-check.mjs --anchors`: checked 2160 of 2163 mutation anchors; 0 stale. The repo's gen4 at seed 4000000 (3000 scripts, Pool reduced to 2): 198 accepted, 54 heredoc, 98 joined, 0 violations, old 237: the commit message's numbers reproduce exactly.
NOT DONE / LIMITS: only bash 5.2.21, only `read_step` + `hides_a_launcher` (not `audit()` or the final-step run), markers not real launchers (checked for RD-1/RD-2/RD-3 with `npm run check`: browser False); GitHub's own acceptance of a NUL (RD-3) not tested; the mutation sweep of the 30 new entries not run (the self-test is 30 s per mutant). Seen, accepted at the parent too, siblings of recorded items, NOT reported as findings: `<>f mark_ran "$(date)"`, `&>>f`, leading `<<WORD cmd` with a CR spelling, `VAR="$(x)" cmd`, unterminated heredoc or `read -r x <<true` + `#$(x)` line, `${x-` NL `#$(x)}`, `echo "$(echo ${y:-)}; x)"`, `x="$(` NL `x)echo"`, `[[ 'a[$(x)]' ]]`/`printf -v` (RD-6 adds `test -v`).
```
