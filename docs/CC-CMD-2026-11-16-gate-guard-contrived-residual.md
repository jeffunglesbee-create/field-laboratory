# Claude Code Command — the browser-gate guard, its trap, the delete workflow's pin and the gate-mode self-test: what five rounds of review left, each with the input that still passes, its class, and when it closes

**Branch:** main — commit directly, do not create a feature branch or PR (a work branch is used only to run `verify-full`, and lands on `main` by merge with the run id in the message)
**Repo:** field-laboratory
**Parent:** `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md`, items 2 to 7 (closed in the same session as this file) and the five review rounds that built them. Filed 2026-11-16 by CC under Rule 87.4: the verification round of 2026-11-16 (workflow `wf_f9f5e556-127`, 66 agents) found everything below, and each item is either not reachable by an ordinary edit of the files it guards (CONTRIVED, COSMETIC) or needs a design decision the parent did not make.
**Confidence gate:** `npm run gate` >= 95 before any commit that lands.
**Status:** OPEN. Nothing here blocks the parent. Items marked REACHABLE are the next work; CONTRIVED and COSMETIC items close by a one-line owner ruling (WON'T FIX, dated) or by their own commit.

```bash
git remote get-url origin | grep -q field-laboratory || { echo "WRONG REPO"; exit 1; }
git pull; git log --oneline -5
python3 scripts/check-browser-gate.py | tail -1; python3 scripts/check-browser-gate.py --self-test | tail -1
node scripts/mutation-check.mjs --anchors | tail -1
```

## What the classes mean (so that this file can be read without the five rounds)

The guard `scripts/check-browser-gate.py` is a hand-written classifier of bash and JavaScript. Its stated threat model is "a careless edit, not a deliberate one". Every finding is put in one of three classes by that model, and a false red counts exactly as a false green does:

- **REACHABLE**: a good-faith, ordinary edit, in a shape the repository already uses, is misread.
- **CONTRIVED**: the input has to be written to defeat the reader (an alias, a computed property, a variable that holds a name).
- **COSMETIC**: no verdict an ordinary edit can reach changes (a message, a spelling the shell treats the same).

## Related, read before building (BUILD-ON-A)

Searched 2026-11-16 by content (`check-browser-gate`, `browser-gate`, `heredoc`, `BENIGN_HEADS`, `later_step_effects`, `importer_rows`) in `docs/CC-CMD-*.md`. Status, rulings and holds were read; what this does with each:

- `docs/CC-CMD-2026-11-11-runner-apt-mirror-dns.md` (the parent): items 2 to 7 are closed there. This file adds no item to it and undoes none of its rulings; the guard's design (a closed grammar, fail closed, every unreadable line refused rather than guessed) is kept in every option below.
- `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md` (DONE): the hook runs this guard and its self-test on every commit. Every item below that adds fixtures raises the self-test's running time; the cost is measured in the Done condition and has to stay inside that CC-CMD's stated budget.
- `docs/CC-CMD-2026-11-11-workflow-pipes-into-tee.md` (DONE): its ruling is about a pipe into `tee` reporting `tee`'s exit status, read by `scripts/workflow-check.mjs`. It does not touch this guard. Round 6 puts `tee` back among the tools this guard reads as running nothing (it was removed in round 4), which changes no ruling there. Its `shellViews` scanner already reads heredoc bodies; item 1 below should reuse that approach rather than write a second one.
- `docs/CC-CMD-2026-11-14-weather-failure-tls-stage.md` and `docs/CC-CMD-2026-11-15-brief-phase-card-identity.md`: they edit workflows the guard reads. Not edited.

## The items

### 1. A heredoc or a multi-line quoted string in an always() step of an audited job is refused — REACHABLE, false red, fails closed, present since before round 5

Input (both refused at `9043fa75` and at `4b5395e6`): `cat <<EOF` / `result ok at $(date)` / `EOF`, and `echo "line one` / `line two $(date)"` on two physical lines. Cause: `logical_lines` splits on newlines, so `blank_quoted` never sees a string that spans lines or a heredoc body, and every such line is read as code. Measured 2026-11-16 by reading all 57 workflow and action files with PyYAML: a heredoc (`<<WORD`) is in 2 of 402 `run:` steps in the whole tree, both outside the audited jobs, so the real tree is green; one is `python3 - <<'PY'` in `generate-team-colours.yml` (code, not data). A here-string (`<<<`) is not a heredoc and is read today. The reviewer of `945daddf` added the shape `tee -a "$GITHUB_STEP_SUMMARY" <<'EOF'` / `### Result` / `ok` / `EOF` (and the same with `cat >> "$GITHUB_STEP_SUMMARY" <<'EOF'`): refused at `4b5395e6` and at `945daddf`, because the body line `ok` is read as a command. The two reviewers who reached this class judged an `echo` message over two lines and a heredoc to `$GITHUB_STEP_SUMMARY` ordinary; this repo holds no example of either in an audited job.

Design, from the existing `shellViews` in `scripts/workflow-check.mjs`: a heredoc body is DATA only when the command that reads it is a tool that runs nothing (`cat`, `tee`, `grep`, `wc`, `tr`, `jq`) and is CODE otherwise (`bash <<EOF`, `python3 - <<EOF`, `xargs`, `node -`); in a body with an unquoted delimiter a `$( )` or a backtick pair still runs and stays a head. A string that spans lines is blanked as one string. Close when: fixtures for each of those, a mutation entry for each (Rule 90), `python3 scripts/check-browser-gate.py` still `verdict: gated` on the real tree, and the real files that would flip counted and printed (`checked N of N steps`).

### 2. `sed`, `awk` and `sort` in an always() step of an audited job are refused — OWNER DECISION

Each can run a command from its arguments (`sed '1e cmd'`, `sed 's/x/cmd/e'`, `awk 'BEGIN{system("cmd")}'`, `sort --compress-program=cmd`); that is why round 4 removed them from `BENIGN_HEADS` and why round 6 kept them removed when it restored `tee`, `cp`, `mv`, `rm` and `uniq` (which run nothing). `| sort | uniq -c` and `sed -i` are ordinary shapes, so this is a false red by the class definition, and it is a deliberate trade. Options: (a) leave it (the refusal text says "write `node <script>` or gate the step on the install"); (b) read each tool's arguments (`sort`: a word beginning `--co`, the only long option `sort --help` lists with that start on this machine, `--compress-program`; `sed`: an `e` command or `e` flag in its script; `awk`: `system(`, a pipe in a `print`, `getline`). Close when the owner rules (a) or (b); (b) needs a fixture per refused spelling and the exact abbreviation rule for `sort`.

### 3. A step that writes a script and then runs it reads as the script it found — CONTRIVED, false green

Run 2026-11-16 at `7144cdc2`: an always() step added to `verify-full.yml` with `cp scripts/render-check.mjs scripts/check-script-orphans.mjs` then `node scripts/check-script-orphans.mjs` is read `rc 0 verdict: gated` (the guard read `check-script-orphans.mjs`, which is browser-free, before the step replaced it with a script that drives a browser). The same with `mv`, `tee`, or `printf ... > scripts/check-script-orphans.mjs` before the run. The reviewer of the P2 change measured it in a PLAIN step too (refused at `945daddf` for `cp`, read clean now, as the redirect form `cat scripts/render-check.mjs > scripts/check-script-orphans.mjs; node scripts/check-script-orphans.mjs` already was in both positions), and `cp x.json package.json; npm run <a browser-free script>` (`package.json` is read from disk) and `cp /tmp/x node_modules/.bin/node` the same way. Not an ordinary edit. Round 6 makes the position consistent (the redirect and the tools that only write are all read clean) instead of refusing the tools and accepting the redirect. Option that closes all of them: classify the target of every write (a redirect target, `tee`'s operands, `cp` and `mv`'s last operand, `rm`'s operands, `uniq`'s second operand) and refuse a target that is under `scripts/`, `.github/`, `package.json` or a variable; default-allow `outbox/`, `/tmp/`, `/dev/null`, `$RUNNER_TEMP`. Close when that is built with a fixture per writer, or ruled WON'T FIX.

### 4. The splitter's head positions and a backslash before a space — CONTRIVED, false green (round 4 A21, A22; hunt-guard-4)

Passing inputs, probed 2026-11-16 at the head of round 6 with one always() step added before the final step of `.github/workflows/verify-full.yml` (each `rc 0 verdict: gated`; the control without the defect is `rc 1`):

- `echo "$(date)"; &>/dev/null npm run check:spark`: `&>`, `&>>` and `<>` are not in `COMMAND_REDIRECTS`, so the command after such a leading redirect is no head (on a line that is already unreadable because of a quoted `$( )`).
- `echo hi \ ` (a backslash, then a space) on one line and `npm run check:spark` on the next: `logical_lines` strips the line's trailing whitespace before it counts backslashes, so it joins the next line, where bash ends the first command at the newline; the launcher is then read as an argument of `echo`. `echo hi` then `npm run check:spark` is `rc 1`. `grep -rnP '\\[ \t]+$' .github package.json` finds 0 such lines today.

Closed in round 6 (so not listed here as open): the `VAR=$( )` and `VAR=`...`` prefix (`_ASSIGN_VALUE`), including a nested one (`X=$(a $(b)) npm run x` is refused). The inputs round 4's hunter listed as passing under a mutant of the guard (`3>/dev/null timeout 5 x`, `FOO= timeout 5 x`, a case arm with three or more alternatives) are REFUSED by the guard as it stands (probed, `rc 1`); they are survivors of mutants, test gaps, and are row 8's. Close when each open input has a fixture and a mutation entry, or WON'T FIX.

### 5. A regular-expression literal in a gate row — CONTRIVED, false green (round 4 A26)

Passing: `() => { if (s) /it's/.test(s); return ok('node scripts/render-check.mjs') }` and `() => ('a' + /it's/.source) && ok('node scripts/render-check.mjs')`; the same with `-`, `<`, `*`, `~` before the regex, or `while (c) /re/`. A `/` after `)` or after an arithmetic or comparison operator is read as division. Needs a regex with an odd quote in operand position and a browser call after it in the same row. Close when `js_tokens` tracks the keyword that precedes a parenthesised head (`if (`, `while (`, `for (`) or the case is ruled WON'T FIX.

### 6. The importer scan reads names, not scopes — CONTRIVED, false green and a rare false red (round 5 A27; hunt-guard-9; G-pop-5, G-pop-6)

Passing: `rows[3].browser = false`; `rows.forEach(r => { r.run = () => true })`; `rows?.push(...)`; `rows['push'](...)`; `rows.length--`; `Array.prototype.push.apply(rows, [...])`; `Object.assign(rows, ...)`; `const all = rows; all.push(...)`; a shadow `function f() { const rows = [] }` placed BEFORE the real use; an importer in `scripts/lib/` (the scan globs `scripts/*` one level, the node-options scan recurses); a `.ts`, `.mts` or `.cts` importer. False red: a function parameter or local called `rows` that gets a `.push` in a file that also imports `{ rows }` (the message says so and names the rename). Close when the scan is built on a tokenizer with scopes, or each form is a refused spelling with a fixture, or WON'T FIX.

### 7. A name built from pieces, and a step before the install — CONTRIVED, false green (round 5 A29; hunt-guard-3)

Round 6 closes a write and its name on different lines (a group, `NAME<<DELIM`, a value held in a variable, the file held in a variable). Not closed (each `rc 0` at `945daddf` and at `4b5395e6`, from the review of `945daddf`): `N=NODE_OPTIONS` then `echo "$N=--require /tmp/x.cjs" >> "$GITHUB_ENV"`; `echo "NODE_OPTIONS"="--require /tmp/x.cjs" >> "$GITHUB_ENV"`; `echo 'NODE_OPTIONS'=x >> "$GITHUB_ENV"`; `printf '%s=%s\n' NODE_OPTIONS "--require /tmp/x.cjs" >> "$GITHUB_ENV"`; `echo "NODE_OPTIONS=x" >> "$GITHUB""_ENV"`; `F=GITHUB_ENV; echo "NODE_OPTIONS=x" >> "${!F}"`; `echo "NODE_OPTIONS=x" >> "$(printenv GITHUB_ENV)"`; `cp env.txt "$GITHUB_ENV"`; and names outside `DANGEROUS_VARS` (`LD_LIBRARY_PATH`, `NODE_EXTRA_CA_CERTS`). Also not closed: a harmless `$GITHUB_ENV` write beside a message that names `PATH=` or `NODE_OPTIONS=` in the same step is a false red (the cost of reading the whole step; the refusal says to put the message in a step of its own); a reader that attributes each line to its own redirect closes it. And a step BEFORE the install that writes a dangerous name (`later_step_effects` is consulted for the steps after it only, so the same line one step later is refused). Close when the check is made for every step of a target job or ruled WON'T FIX for the steps that run before the install.

### 8. Rule 90 gaps in the guard's own clauses — CONTRIVED and COSMETIC (hunt-guard surv-contrived, surv-cosmetic, A30)

A survivor is a clause whose removal or loosening leaves the self-test green. Round 6 closes the two a good-faith input reaches (`rows\n  .push(x)`, an apostrophe inside double quotes before a comment). The rest need an input that no ordinary edit makes; each is `find`/`replace` against `scripts/check-browser-gate.py` and each leaves the self-test green:

| clause | mutation | what it would let through |
|---|---|---|
| `COMMAND_HEAD` assignment prefix | `_CHAR*` to `_CHAR+` | `A= npm run check:peak` loses its head (false green) |
| `JS_REGEX` class escape | `\[(?:\\.\|[^\]\\\n])*\]` to `\[[^\]\\\n]*\]` | `/[\]']/.test(s) && ok('node scripts/render-check.mjs')` reads clean (false green) |
| `logical_lines` continuation test | `comment_start(text)` to `comment_start(line)` | a continuation whose comment began on an earlier physical line |
| case-pattern alternation | `(?:\|ARM)*\)` to `(?:\|ARM)?\)` | a three-way case arm hides the wrapper after it |
| redirect fd class | `\d*(?:` to `[12]?(?:` | `3>/dev/null timeout 5 x` loses its head |
| script-name quote | `lit[0] in "'\""` to `lit[0] in "'"` | a double-quoted script name |
| importer suffix and glob | drop `.cjs` or `.js`; `glob("*")` to `glob("*.mjs")` | a `.cjs` or `.js` importer, a non-`.mjs` file |
| `comment_start` `$'` | drop `and not in_dq` | `echo "a $'b # c" # r` loses its comment |
| `comment_start` paren stack | drop `parens.pop()` after a nested `$( ... $( ... ) ... )` | the outer substitution never closes and the trailing comment is not cut |
| `GITHUB_PATH_REF` braces | `\$\{?GITHUB_PATH\b` to `\$GITHUB_PATH\b` | `"${GITHUB_PATH}"` is not read as a write (the table pins the braces for `$GITHUB_ENV` only) |
| `FINAL_ARG` empty double quotes | `"[^"`\\]*"` to `"[^"`\\]+"` | a final step with `echo ""` (a blank line) is refused and no check notices |
| `gate_rows` trimmed shape | `blanked[:end], shape_all[:end]` to `blanked[:end], shape_all` | the array's trimming is pinned through `end` and not through the `shape` that counts `weight:` keys |
| four more, cosmetic | `ff-ws-bracket`, `ff-head-split`, `le-env-boundary`, `le-assigned-lookbehind`, `le-npmrc-boundary`, `le-path-first`, `ch-amp-lookahead`, `imp-specifier-*` | messages, spellings the shell treats alike, or a bound another clause enforces |

Close when each has a fixture that fails the mutant (Rule 90), or the row is ruled out.

### 9. `.npmrc`, `$GITHUB_PATH` and `$GITHUB_ENV` named in a quoted message — REACHABLE (low), false red (hunt-guard-7)

`echo "using the repo .npmrc"` and `if [ -f .npmrc ]; then echo found; fi` make a step unresolved: the text scan reads quotes. A write to `.npmrc` can be `> "$HOME/.npmrc"` (quoted), so blanking quotes is not enough. Close when a mention is told from a write (the redirect target, `tee`'s operand) or ruled WON'T FIX.

### 10. The no-launch trap — CONTRIVED and COSMETIC (rounds 4 and 5)

- A vendored copy of the library: `cp -r node_modules/playwright-core vendor/pwcore`, a script that requires `../vendor/pwcore` by path and launches in a `try`, is not seen (the resolve hook looks under `node_modules/playwright(-core)/`). Listed in the header as not covered. Close by an owner ruling that the header is the closure.
- `node node_modules/playwright-core/cli.js screenshot about:blank /tmp/x.png` is resolved to the stub (the hook returns it for the CLI's main entry too) and logs no launch. No script runs the CLI; every one of the 70 listed commands is a node self-test or a read-only mode.
- `makeTrap` drops the inherited node options if the append is removed, and no check fails (the controls run with an empty inherited value). No workflow or script sets the variable today.
- A name built at run time, a value set in `.npmrc` or `package.json` outside `scripts/`, a `.ts`, `.mts` or `.cts` file under `scripts/`: outside the default-deny scan.

### 11. The delete workflow's pin and the delete-branches self-test — CONTRIVED and design (rounds 4 and 5)

- `delete-branches.mjs`'s comparison of the workflow with its pin: a change that strips LEADING whitespace as well as trailing passes 33/33, and so does a comparison that starts at line 2 and a case-insensitive one. Three mutants survive; no fixture changes only leading whitespace.
- The `PROOF` pattern can be widened with the self-test green (`[a-z0-9-]*` to `[a-zA-Z0-9-]*`, `[a-z0-9._-]*`, the first class to `[a-z0-9-]`), and `FLAGS` accepting `--force`: the `proof-` prefix still has to match, so a non-proof branch is still refused.
- A second workflow file that calls `delete-branches.mjs --apply` is not read by the pin (it reads one file).
- Any edit of `actions/checkout`, `actions/setup-node`, `node-version`, `timeout-minutes` or an input description of `delete-branches.yml` reds `check:delete-branches` until `WORKFLOW_PIN` is edited in the same commit (the refusal names the fix). The tree holds 69 uses of `checkout@v4` and 52 of `setup-node@v4`; a repo-wide bump edits this file too. Option: exempt the `uses:` version suffix from the comparison. Close when the owner rules it a design, or the exemption is built.

### 12. The gate-mode self-test and the gate's row pins — CONTRIVED and COSMETIC (rounds 4 to 6)

- `failedRows` filtered by the real row's name; `needsServer = !QUICK && !BROWSERLESS` (equivalent to the pinned form); the detached-less server spawn (needs a stand-in server on a port to show). Each is a clause the self-test does not tell from its twin.
- Changes of the gate that leave every pinned check green (the review of `411729ee`, each 48/48 at that head and at `4b5395e6`): swapping the weights of two rows (30 and 10, or 20 and 30), renaming a non-browser row, adding one row and removing another of the same weight, and moving `skipQuick` from one non-browser row to another. `node scripts/gate-inventory.mjs` catches the weight swap (6/7) and not the `skipQuick` move (7/7), so nothing run catches that move. The pinned check's label says it "skips exactly the 10 rows it did"; it counts them.
- `exitCallsOf` cuts a call at the first `)`: `failed: failedRows.filter(r => r.weight).length` in an `exitFor` call is red; `failed: [a, b].length` (a comma and no parenthesis) reads as six keys and is red (old: green). `process .exit(0)`, `process["exit"](0)` and `const { exit } = process` are invisible to the exit scan, and a `process.exit(...)` inside a string, a template or a regular expression counts as an exit (all pre-existing).
- `exitForOk`'s pinned counts (`=== 3`, `=== 7`, `=== 10`) loosened to `>=` leave the self-test green (they are only evaluated on the real file); `String(out).trim()` dropped in `say` (cosmetic); the problems argument of eight `saying(...)` call sites (`redSays`, `truthySays`, `greenSays`, `dirtySays`, `identSays`, `nothingSays`, `inventorySays`, the weightless `refusedSays`) and three `refusedSays` clauses replaced by `[]` leave it green: the message regexes live in `say` and no fixture holds those call sites.
- The paragraph check of `docs/gate-rows.txt` cuts the first sentence at the literal ` together.`: reword it to `at once.` and drop `scripts/gate-mode.mjs` from it and the check stays green; a comment paragraph glued to the end of the paragraph is absorbed into it (cosmetic).
- `delete-branches.mjs --self-test`: a flag after `--apply` is tolerated by the Delete locator and a flag on the Plan line is not (documented in its comment); a block-scalar Delete run, the input inlined into the run with no env, and a flag on the Plan run are named reds (design).

## Done condition (Rule 89: an artifact, not a word)

1. Every row above that is REACHABLE or OWNER DECISION is CLOSED with a commit sha, or has a dated owner ruling in this file's Status. Artifact: `git log --oneline -- docs/CC-CMD-2026-11-16-gate-guard-contrived-residual.md`, and the Status line.
2. `python3 scripts/check-browser-gate.py --self-test` prints `N/N checks passed` with N at least the figure at filing, and `node scripts/mutation-check.mjs --anchors` prints `0 stale`.
3. The hook's measured cost stays inside `docs/CC-CMD-2026-11-15-hook-runs-the-workflow-guards.md`'s stated budget: `time python3 scripts/check-browser-gate.py --self-test` is printed in the closing outbox note.
4. Outbox manifest is the last task.
