#!/usr/bin/env node
// Rule 90: scripts/check-browser-gate.py must go red when it is broken (its code) and when the thing it guards is broken (the workflow). Two kinds of mutation, each
// applied to a COPY, each anchor asserted to occur exactly once and to have changed the file:
//   CODE      a mutation of the guard's own source, judged by `python3 <copy>/scripts/check-browser-gate.py --self-test`: caught only if it exits non-zero AND prints a FAIL line.
//             The self-test runs the guard's real-tree path and CLI exit in a temporary root, so the mutants of real_tree() and of the exit code are CODE mutants too
//             (a second review found that none reached them: a mutated guard could print FAIL and exit 0).
//   WORKFLOW  a mutation of a copy of .github/workflows/verify.yml, judged by the guard on the real-tree path (cwd = the copy's root): caught only if it exits non-zero AND
//             prints `FAIL:`. These are the edits a careless change would make: drop a gate, drop continue-on-error, gate a step that needs no browser, add a browser step
//             with no gate (in the forms the first reader missed), weaken the final step in the ways that keep its text and lose its effect.
// The unmutated copy is run first on BOTH paths, so a copy that cannot run is reported before any mutation is judged. A crash with no FAIL line is not a catch.
//
// MUTANTS NOT RUN, and why (Rule 91: the denominator below counts only what ran; these are left out, each equivalent or crashing, and each was challenged by a second review):
//   E1  clauses(): the `||` rejection. Equivalent only because GATE_EXTRA ends in `$` and the final form is exact; both are mutated below, so `||` alone changes no verdict.
//   E5  read_npm(): the `n in seen` cycle test. Differs in RUNNING TIME only: without it a self-recursive script with several calls hangs until the depth cap. No input changes a verdict.
//   E7  read_npm(): the `isinstance(body, str)` test. Without it the guard crashes with a traceback (fails closed, loudly, no FAIL line), and a crash is not a catch.
//   E8  split_commands(): the heredoc test. Equivalent for the verdict except for a heredoc whose delimiter is itself a safe head (`cat <<true`); the test gives the clearer message.
//   E9  run_final(): the `-e` flag. Under the closed grammar nothing in the script can fail except `exit N`, so `-e` changes no exit code.
//   E10 run_final(): the subprocess timeout. Under the closed grammar nothing in the script can wait.
//   E11 NODE_INLINE: the separate-word `--run`. The word after it is not a script file, so the entry rule refuses it anyway.
//   E12 audit(): not running a final step the reader refused. Equivalent for the verdict: the reader's refusal is already a problem; skipping the run only avoids executing text the guard cannot read.
// FOUND BY THE FIRST SWEEP, then removed: a `not preload` clause on the --self-test exemption (preload entries carry no arguments) and the final step's own
// `continue-on-error` and `shell` checks (the rules that read every step already refuse both). FOUND BY THE SECOND REVIEW, now mutants below: E2, E3, E4, E6 of the first
// version of this list were not equivalent (each had an input the self-test lacked) and the real-tree path had no mutant at all.
//   node outbox/browser-gate-sweep-2026-11-12.mjs        (from the repository root)
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = new URL('..', import.meta.url).pathname
const GATE = "        if: steps.chromium.outcome == 'success'\n"
const EXCLUDED = 8

const CODE = [
  ['a launch is only an import of playwright', "r\"\"\"from\\s+['\"]playwright(?:-core)?['\"]|", 'r"""'],
  ['require(playwright) is not a launch', "require\\(\\s*['\"]playwright(?:-core)?['\"]\\s*\\)|", ''],
  ['import(playwright) is not a launch', "import\\(\\s*['\"]playwright|", ''],
  ['chromium.launch is not a launch', '|chromium\\.launch\\s*\\(|launchPersistentContext\\s*\\(|', '|launchPersistentContext\\s*\\(|'],
  ['launchPersistentContext is not a launch', '|chromium\\.launch\\s*\\(|launchPersistentContext\\s*\\(|', '|chromium\\.launch\\s*\\(|'],
  ['PW_CHROMIUM is not a use', 'process\\.env\\.PW_CHROMIUM|environ[^\\n]{0,24}PW_CHROMIUM|', '(?!)|'],
  ['PW_CHROMIUM through os.environ is not a use', '|environ[^\\n]{0,24}PW_CHROMIUM|', '|'],
  ['a PROSE mention of chromium.launch is a launch (no call needed)', 'chromium\\.launch\\s*\\(|launchPersistentContext', 'chromium\\.launch|launchPersistentContext'],
  ['the python import pattern is not multiline', '    re.MULTILINE,\n)', ')'],
  ['an inline browser launch in the step text is not read', 'if LAUNCH.search(strip_comments(script)):', 'if False:'],
  ['a python import of playwright is not a launch', '    r\"\"\"^\\s*(?:import|from)\\s+playwright\\b\"\"\",\n', '    r\"\"\"(?!)\"\"\",\n'],
  ['--self-test still launches', 'if "--self-test" in args:\n            continue', 'if False:\n            continue'],
  ['comments are read as code', 'return bool(LAUNCH.search(strip_comments(src))), None', 'return bool(LAUNCH.search(src)), None'],
  ['a `#` inside a word starts a comment', 'elif c == "#" and (not out or out[-1].isspace() or out[-1] in ";&|()"):', 'elif c == "#":'],
  ['comments are not stripped before tokenizing', 'lex = shlex.shlex(strip_comment(line), posix=True, punctuation_chars=True)\n        lex.whitespace_split = True\n        lex.commenters = ""\n        toks = list(lex)\n    except ValueError as e:\n        raise Unreadable(', 'lex = shlex.shlex(line, posix=True, punctuation_chars=True)\n        lex.whitespace_split = True\n        lex.commenters = ""\n        toks = list(lex)\n    except ValueError as e:\n        raise Unreadable('],
  ['npm run is not followed', 'read_commands(body, pkg, read, seen | {n}, depth + 1, out)', 'pass'],
  ['a command after && is not read', 'SEPARATORS = {"&&", ', 'SEPARATORS = {'],
  ['a command after || is not read', 'SEPARATORS = {"&&", "||", ', 'SEPARATORS = {"&&", '],
  ['a command after a pipe is not read', '";;", ";", "|", "&", "(", ")"}', '";;", ";", "&", "(", ")"}'],
  ['the operators of `);` are not split (a command after it is swallowed)', 'flat.extend(OPERATORS.findall(t))', 'flat.append(t)'],
  ['a process substitution is read as a redirect', 'if i + 1 < len(flat) and flat[i + 1] == "(":\n                raise Unreadable("a process substitution")', 'if False:\n                raise Unreadable("a process substitution")'],
  ['a redirect target is read as the first argument', "i += 1                                 # the redirect's target is not a word of the command", 'pass'],
  ['a backslash-continued command is read line by line', 'if line.endswith("\\\\"):', 'if False:'],
  ['a last line ending in a backslash is dropped', '    if cur:\n        out.append(cur.strip())', '    if False:\n        out.append(cur.strip())'],
  ['npx playwright <anything> is not a browser step', 'if sub != "install":\n            out["direct"] = True', 'if False:\n            out["direct"] = True'],
  ['an npx browser step is not a step', 'res["browser"] = out["direct"]', 'res["browser"] = False'],
  ['the install step is found by a comment', 'return bool(INSTALL_CMD.search("\\n".join(logical_lines(run_text(step)))))', 'return bool(INSTALL_CMD.search(run_text(step)))'],
  ['continue-on-error is not required on the install', 'if inst.get("continue-on-error") is not True:', 'if False:'],
  ['the install id is not required', 'if inst.get("id") != INSTALL_ID:', 'if False:'],
  ['the install step may carry more commands', 'if len(lines) != 1 or not INSTALL_LINE.match(lines[0]):', 'if False:'],
  ['the install command pattern is not anchored at its end', 'install(?: [\\w-]+)*$")', 'install(?: [\\w-]+)*")'],
  ['an id that no earlier step has is not reported', 'if ref not in ids or ids[ref] >= i:', 'if False:'],
  ['bracket notation is not normalised to the dotted form', 'r".\\1", str(c))', 'r"[\\1]", str(c))'],
  ['a browser step before the install is not reported', 'if needs_browser(s, pkg, read):\n                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")', 'if False:\n                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")'],
  ['an ungated browser step is not reported', 'if not gated_if(if_text(s)):', 'if False:'],
  ['a plain step gated on the install is not reported', 'if f"steps.{INSTALL_ID}" in if_text(s):', 'if False:'],
  ['a final step that is not last is also told to stop waiting for the install', 'if is_final_if(if_text(s)):         # the final step, wherever it is: if it is not LAST, that is its own message below\n            continue', 'if i == final_at:\n            continue'],
  ['the gate accepts a narrowing `failure()`', "GATE_EXTRA = re.compile(r\"^(?:always\\(\\)|", "GATE_EXTRA = re.compile(r\"^(?:failure\\(\\)|always\\(\\)|"],
  ['the gate accepts another step == failure', "steps\\.\\w+\\.outcome == 'success')$\")", "steps\\.\\w+\\.outcome == '(?:success|failure|skipped)')$\")"],
  ['the gate extra clauses are not anchored at their end', "outcome == 'success')$\")", "outcome == 'success')\")"],
  ['the gate accepts any extra clause', 'GATE_CLAUSE in cl and all(GATE_EXTRA.match(p) for p in cl)', 'GATE_CLAUSE in cl'],
  ['the final step is accepted with == failure', 'FINAL_CLAUSES = ["always()", f"steps.{INSTALL_ID}.outcome != \'success\'"]', 'FINAL_CLAUSES = ["always()", f"steps.{INSTALL_ID}.outcome == \'failure\'"]'],
  ['the final step is accepted without always()', 'FINAL_CLAUSES = ["always()", ', 'FINAL_CLAUSES = ['],
  ['the final step form is not exact', 'return cl is not None and sorted(cl) == sorted(FINAL_CLAUSES)', 'return cl is not None and all(c in cl for c in FINAL_CLAUSES)'],
  ['a missing final step is not reported', '        bad.append(f"the LAST step of job', '        (lambda *_: None)(f"the LAST step of job'],
  ['the final step may be anywhere in the job', 'final_at = last if last > at and is_final_if(if_text(steps[last])) else None', 'final_at = next((i for i in range(at + 1, len(steps)) if is_final_if(if_text(steps[i]))), None)'],
  ['the final step is not run', 'fp = final_step_problems(steps[final_at], name(steps[final_at]), final_timeout)\n        bad += fp', 'fp = []\n        bad += fp'],
  ['the final step grammar is not applied', 'if grammar:\n        bad.append(f"the final step {name} must use only echo', 'if False:\n        bad.append(f"the final step {name} must use only echo'],
  ['the final step may use any command', 'if head not in FINAL_HEADS:', 'if False:'],
  ['the final step may use more commands (cat, false, true)', 'FINAL_HEADS = frozenset({"echo", "exit", "[", "test"})', 'FINAL_HEADS = frozenset({"echo", "exit", "[", "test", "cat", "false", "true"})'],
  ['exit may take any argument', 'elif head == "exit" and not (len(w) == 2 and re.fullmatch(r"[1-9][0-9]*", w[1])):', 'elif False:'],
  ['a test may use file operators', 'elif head in ("[", "test") and any(x.startswith("-") for x in w[1:]):', 'elif False:'],
  ['the final step may pipe and redirect', '        if stray:\n            bad.append(f"`{line[:60]}`: {stray[0]!r}', '        if False:\n            bad.append(f"`{line[:60]}`: {stray[0]!r}'],
  ['the install outcome is not substituted into the final step', 'env[str(k)] = outcome', 'env[str(k)] = "success"'],
  ['an exit of 0 is accepted', 'if r.returncode == 0:', 'if False:'],
  ['a final step that says nothing is accepted', 'elif "::error::" not in r.stdout + r.stderr:', 'elif False:'],
  ['an expression interpolated into the final script is accepted', 'if "${{" in run_text(step):', 'if False:'],
  ['an env expression the guard cannot evaluate is accepted', 'elif "${{" in v:', 'elif False:'],
  ['a continue-on-error expression counts as off', 'return v not in (None, False, "false", "False")', 'return v is True'],
  ['a stray continue-on-error on a step is accepted', 'if i != at and truthy(s.get("continue-on-error")):', 'if False:'],
  ['the install is counted as a stray continue-on-error', 'if i != at and truthy(s.get("continue-on-error")):', 'if truthy(s.get("continue-on-error")):'],
  ['continue-on-error on the job is accepted', 'if truthy(jobdoc.get("continue-on-error")):', 'if False:'],
  ['`if: false` is accepted', 'if is_false_if(s.get("if")):', 'if False:'],
  ['`if: false` as YAML\'s boolean is accepted', '.strip().lower()))', '.strip()))'],
  ['`if: 0` is accepted', '(?:false|0)(?:\\s*\\}\\})?", str(cond)', '(?:false)(?:\\s*\\}\\})?", str(cond)'],
  ['a step the reader cannot read is accepted', 'if r["unresolved"]:', 'if False:'],
  ['an unknown command is browser-free', 'out["unresolved"].append(f"`{shown}`: `{head}` is not a command', '(lambda *_: None)(f"`{shown}`: `{head}` is not a command'],
  ['every command is safe', 'elif head in SAFE_HEADS:', 'elif True:'],
  ['a loop header is read as a command', 'if head in ("for", "select"):', 'if False:'],
  ['a VAR=value prefix is not stripped', 'while w and (w[0] in PREFIX_WORDS or re.match(r"^[A-Za-z_]\\w*=", w[0])):', 'while w and (w[0] in PREFIX_WORDS):'],
  ['the shell keywords are not stripped', 'PREFIX_WORDS = {"if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "fi", "done", "esac"}', 'PREFIX_WORDS = set()'],
  ['a command substitution inside a word is accepted', 'if "`" in t or "$(" in t:', 'if False:'],
  ['a node preload is not read', 'for p in preloads:\n        out["entries"].append((p, []))', 'for p in []:\n        out["entries"].append((p, []))'],
  ['`--import=X` is not a preload', 'if a.startswith(NODE_PRELOAD_EQ):', 'if False:'],
  ['an attached `-rX` is not a preload', 'if a.startswith("-r") and not a.startswith("--") and len(a) > 2:', 'if False:'],
  ['--require is not a preload flag', 'NODE_PRELOAD = {"-r", "--require", ', 'NODE_PRELOAD = {"-r", '],
  ['--loader is not a preload flag', '"--import", "--loader", "--experimental-loader"}', '"--import", "--experimental-loader"}'],
  ['--experimental-loader is not a preload flag', '"--import", "--loader", "--experimental-loader"}', '"--import", "--loader"}'],
  ['--import is not a preload flag', 'NODE_PRELOAD = {"-r", "--require", "--import", ', 'NODE_PRELOAD = {"-r", "--require", '],
  ['inline code in the `=` form is accepted', 'if a in NODE_INLINE or a.startswith(NODE_INLINE_EQ):', 'if a in NODE_INLINE:'],
  ['inline code in the separate form is accepted', 'if a in NODE_INLINE or a.startswith(NODE_INLINE_EQ):', 'if a.startswith(NODE_INLINE_EQ):'],
  ['a node entry need not be a script file', 'if i >= len(w) or not SCRIPT_FILE.match(w[i]):', 'if i >= len(w):'],
  ['a python entry need not be a .py file', 'if i >= len(w) or not PY_FILE.match(w[i]):', 'if i >= len(w):'],
  ['the separate-value flag ambiguity is accepted', '    if i > 1 and w[i - 1].startswith("--") and "=" not in w[i - 1]', '    if False and w[i - 1].startswith("--") and "=" not in w[i - 1]'],
  ['a dangerous variable set in front of a command is accepted', 'if any(a in DANGEROUS_VARS for a in assigned):', 'if False:'],
  ['`export NODE_OPTIONS=...` is not read', 'list(w[1:]) if w and w[0] == "export" else []', '[]'],
  ['a step env of NODE_OPTIONS is accepted', 'if str(k) in DANGEROUS_VARS:\n            res["unresolved"]', 'if False:\n            res["unresolved"]'],
  ['a job or workflow env of NODE_OPTIONS is accepted', 'if str(k) in DANGEROUS_VARS:\n                bad.append(f"the {scope}', 'if False:\n                bad.append(f"the {scope}'],
  ['a pass-through --self-test is accepted', 'if "--self-test" in extra:', 'if False:'],
  ['npm arguments without `--` are accepted', 'if extra and extra[0] != "--":', 'if False:'],
  ['npm flags after `run` are not read', 'while rest and rest[0].startswith("-") and rest[0] != "--":', 'while False:'],
  ['an unknown npm flag after `run` is accepted', 'if rest[0] not in NPM_FLAGS:\n                out["unresolved"]', 'if False:\n                out["unresolved"]'],
  ['the preX/postX hooks are not read', 'names = [f"pre{rest[0]}", rest[0], f"post{rest[0]}"]', 'names = [None, rest[0], None]'],
  ['the test hooks are not read', 'names = ["pretest", "test", "posttest"]', 'names = [None, "test", None]'],
  ['the start hooks are not read', 'names = ["prestart", "start", "poststart"]', 'names = [None, "start", None]'],
  ['the install lifecycle hooks are not read', 'names = ["preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare"]', 'names = ["preinstall", "install", "postinstall"]'],
  ['a missing npm script is accepted', 'if n == explicit:', 'if False:'],
  ['the depth cap is gone', 'elif depth >= MAX_DEPTH:', 'elif False:'],
  ['an npm flag it does not know is accepted', 'if w[i] not in NPM_FLAGS:', 'if False:'],
  ['an npm subcommand it does not read is accepted', 'out["unresolved"].append(f"`{shown}`: npm {sub or \'(nothing)\'} is not a subcommand', '(lambda *_: None)(f"`{shown}`: npm {sub or \'(nothing)\'} is not a subcommand'],
  ['an npx of any package is accepted', 'out["unresolved"].append(f"`{shown}`: npx of', '(lambda *_: None)(f"`{shown}`: npx of'],
  ['a composite action is accepted', 'if not str(uses).startswith(ACTIONS_OK):', 'if False:'],
  ['a shell other than bash is accepted', '    if step.get("shell") not in (None, "bash"):\n        res["unresolved"]', '    if False:\n        res["unresolved"]'],
  ['a working-directory is accepted', 'if step.get("working-directory") not in (None, "."):', 'if False:'],
  ['the other install sites count a comment', 'if INSTALL_CMD.search(line) and not line.lstrip().startswith("#"):', 'if INSTALL_CMD.search(line):'],
  ['the other install sites include verify.yml', 'if rel == WORKFLOW:\n                continue', 'if False:\n                continue'],
  ['the other install sites miss the composite actions', 'for pat in (".github/workflows/*.yml", ".github/actions/*/action.yml"):', 'for pat in (".github/workflows/*.yml",):'],
  ['the coverage floors are zero', 'MIN_STEPS = 60 ', 'MIN_STEPS = 0 '],
  ['the browser floor is zero', 'MIN_BROWSER = 10', 'MIN_BROWSER = 0'],
  ['the browser-free floor is zero', 'MIN_PLAIN = 30', 'MIN_PLAIN = 0'],
  ['more than one install step is accepted', 'if len(installs) != 1:', 'if len(installs) < 1:'],
  ['a bad tree prints FAIL and returns True', '            print(f"  - {b}")\n        return False\n', '            print(f"  - {b}")\n        return True\n'],
  ['the CLI exits 0 whatever the verdict', 'sys.exit(0 if real_tree() else 1)', 'real_tree(); sys.exit(0)'],
  ['the problems of audit() are not reported', 'bad, cov = audit(doc, pkg, read)\n    print(f"=== the {JOB}', 'bad, cov = [], audit(doc, pkg, read)[1]\n    print(f"=== the {JOB}'],
  ['the coverage floors are not applied on the real tree', '    bad += coverage_problems(cov)\n', '    pass\n'],
  ['the other install sites are not listed', 'others = other_install_sites(root)', 'others = []'],
]

// anchors that exist exactly once in verify.yml (the sweep asserts it). `ins` puts text directly under a step's name.
const ins = (name, add) => [`      - name: ${name}\n`, `      - name: ${name}\n${add}`]
const FINAL_NAME = '      - name: Install Chromium did not succeed, so the steps that need a browser were skipped\n'
const FINAL_IF = "        if: always() && steps.chromium.outcome != 'success'\n"
const TAIL = '          fi\n          exit 1\n'
// A new step added just before the sparkline, with no gate, in a form a careless author writes
const ungated = run => ['      - name: Drama sparkline\n', `      - name: A new check that needs a browser\n        run: ${run}\n\n      - name: Drama sparkline\n`]
const WORKFLOW = [
  ['the install loses its id', '        id: chromium\n', ''],
  ['the install loses continue-on-error', '        continue-on-error: true\n        timeout-minutes: 3\n        run: npx playwright install chromium', '        timeout-minutes: 3\n        run: npx playwright install chromium'],
  ['the install id is renamed', '        id: chromium\n', '        id: browser\n'],
  ['the install step carries more work, which continue-on-error swallows', '        run: npx playwright install chromium\n', '        run: |\n          npx playwright install chromium\n          npm run check:palette\n'],
  ['a browser step loses its gate (the first)', `      - name: Render checks (both captures, including the state transition)\n${GATE}`, '      - name: Render checks (both captures, including the state transition)\n'],
  ['a browser step loses its gate (the last before the tail)', `      - name: Games are separated from each other\n${GATE}`, '      - name: Games are separated from each other\n'],
  ['a browser step loses its gate (a probe)', `      - name: The live score probe's glue, on the rendered page\n${GATE}`, "      - name: The live score probe's glue, on the rendered page\n"],
  ['the tail browser step loses the install part of its gate', "        if: \"!cancelled() && steps.build.outcome == 'success' && steps.chromium.outcome == 'success'\"\n", "        if: \"!cancelled() && steps.build.outcome == 'success'\"\n"],
  ['a gate tests the conclusion, not the outcome', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.conclusion == 'success'\n"],
  ['a gate tests failure', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.outcome == 'failure'\n"],
  ['a gate is narrowed by failure()', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.outcome == 'success' && failure()\n"],
  ['a gate is narrowed by another step failing', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.outcome == 'success' && steps.build.outcome == 'failure'\n"],
  ['a gate contradicts itself', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.outcome == 'success' && steps.chromium.outcome != 'success'\n"],
  ['the F# suite waits for the install', ...ins('The F# suite, on the F# harness', GATE)],
  ['the F# suite waits for the install, in bracket notation', ...ins('The F# suite, on the F# harness', "        if: steps['chromium'].outcome == 'success'\n")],
  ['a decoder check waits for the install', ...ins('Pick decoders', GATE)],
  ['the five self-tests wait for the install again', ...ins("The browser checks' own self-tests, which launch no browser", GATE)],
  ['a plain step never runs (if: false)', ...ins('Pick decoders', '        if: false\n')],
  ['a new browser step is added with no gate', ...ungated('node scripts/nav-check.mjs')],
  ['...behind `timeout`', ...ungated('timeout 60 node scripts/nav-check.mjs')],
  ['...behind `env`', ...ungated('env CI=1 node scripts/nav-check.mjs')],
  ['...behind `bash -c`', ...ungated("bash -c 'node scripts/nav-check.mjs'")],
  ['...behind `xvfb-run`', ...ungated('xvfb-run -a node scripts/nav-check.mjs')],
  ['...in a one-line for loop', ...ungated('for f in a b; do node scripts/nav-check.mjs; done')],
  ['...in an `if`', ...ungated('if true; then node scripts/nav-check.mjs; fi')],
  ['...through a preload that launches', ...ungated('node -r ./scripts/nav-check.mjs scripts/palette-check.mjs')],
  ['...through `--import=` in the = form', ...ungated('node --import=./scripts/nav-check.mjs scripts/palette-check.mjs')],
  ['...through an attached -r', ...ungated('node -r./scripts/nav-check.mjs scripts/palette-check.mjs')],
  ['...behind a `$#` that hides it from a comment-reading tokenizer', ...ungated('echo $#; node scripts/nav-check.mjs')],
  ['...through a process substitution', ...ungated('diff <(echo a) <(node scripts/nav-check.mjs)')],
  ['...through NODE_OPTIONS', ...ungated("NODE_OPTIONS='-r ./scripts/nav-check.mjs' node scripts/palette-check.mjs")],
  ['...as an npm script with a pass-through argument', ...ungated('npm run check:nav -- --flag')],
  ['...as `npm --silent run`', ...ungated('npm --silent run check:nav')],
  ['...as `npm run --silent`', ...ungated('npm run --silent check:nav')],
  ['...with `--self-test` only in a trailing comment', ...ungated('node scripts/nav-check.mjs # --self-test of this is above')],
  ['...as `node --max-old-space-size 4096`', ...ungated('node --max-old-space-size 4096 scripts/nav-check.mjs')],
  ['...as a heredoc', ...ungated('node - <<EOF\n          console.log(1)\n          EOF')],
  ['a step sets NODE_OPTIONS in its env', ...ins('Drama sparkline', '        env:\n          NODE_OPTIONS: --import=./scripts/nav-check.mjs\n')],
  ['the final step tests == failure', FINAL_IF, "        if: always() && steps.chromium.outcome == 'failure'\n"],
  ['the final step drops always()', FINAL_IF, "        if: steps.chromium.outcome != 'success'\n"],
  ['the final step does not fail the job', TAIL, '          fi\n          true\n'],
  ['the final step has `exit 1` commented out', TAIL, '          fi\n          # exit 1\n'],
  ['the final step exits 0 before `exit 1`', TAIL, '          fi\n          exit 0\n          exit 1\n'],
  ['the final step `exit 1` is inside an `if false`', TAIL, '          fi\n          if false; then exit 1; fi\n'],
  ['the final step writes to the step summary, a file the guard does not set', TAIL, '          fi\n          echo x >> "$GITHUB_STEP_SUMMARY"\n          exit 1\n'],
  ['the final step pipes', TAIL, '          fi\n          false | true\n          exit 1\n'],
  ['the final step keeps its script and swallows its failure', FINAL_IF, FINAL_IF + '        continue-on-error: true\n'],
  ['the final step is removed (its if gets `&& false`)', FINAL_NAME + FINAL_IF, FINAL_NAME + "        if: always() && steps.chromium.outcome != 'success' && false\n"],
  ['the final step is no longer last (a plain step follows)', TAIL, TAIL + '\n      - name: A check added at the end of the file\n        run: npm run check:palette\n'],
  ['the final step interpolates the outcome into its script', 'The run was cancelled before the Chromium install finished.', 'The run was cancelled (${{ steps.chromium.outcome }}) before the Chromium install finished.'],
  ['the final step takes an expression the guard cannot evaluate', '          INSTALL_OUTCOME: ${{ steps.chromium.outcome }}\n', '          INSTALL_OUTCOME: ${{ github.sha }}\n'],
  ['the final step runs under another shell', FINAL_IF, FINAL_IF + '        shell: python\n'],
  ['a step swallows its failure (the F# suite)', ...ins('The F# suite, on the F# harness', '        continue-on-error: true\n')],
  ['a browser step swallows its failure', ...ins('Drama sparkline', '        continue-on-error: true\n')],
  ['the build swallows its failure', ...ins('Build (F# -> JS, then assemble public/)', '        continue-on-error: true\n')],
  ['the job swallows its failure', '  verify:\n    runs-on: ubuntu-latest\n', '  verify:\n    runs-on: ubuntu-latest\n    continue-on-error: true\n'],
]

const prep = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bgsweep-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
  cpSync(join(here, '.github', 'workflows', 'verify.yml'), join(dir, '.github', 'workflows', 'verify.yml'))
  mkdirSync(join(dir, '.github', 'actions', 'mutation-shard'), { recursive: true })
  cpSync(join(here, '.github', 'actions', 'mutation-shard', 'action.yml'), join(dir, '.github', 'actions', 'mutation-shard', 'action.yml'))
  cpSync(join(here, 'package.json'), join(dir, 'package.json'))
  return dir
}
const guard = dir => join(dir, 'scripts', 'check-browser-gate.py')
const selfTest = dir => spawnSync('python3', [guard(dir), '--self-test'], { encoding: 'utf8', cwd: dir, maxBuffer: 64 * 1024 * 1024 })
const realTree = dir => spawnSync('python3', [guard(dir)], { encoding: 'utf8', cwd: dir, maxBuffer: 64 * 1024 * 1024 })
const failLines = out => out.match(/^FAIL .*$/gm) ?? []
const bail = (dir, msg) => { console.log(msg); if (dir) rmSync(dir, { recursive: true, force: true }); process.exit(1) }

const d0 = prep()
const c1 = selfTest(d0), c2 = realTree(d0)
console.log(`unmutated copy: self-test exit ${c1.status} (${(c1.stdout.match(/(\d+)\/(\d+) checks passed/) ?? [])[0] ?? 'no summary'}); real tree exit ${c2.status} (${(c2.stdout.match(/verdict: \w+/) ?? ['no verdict'])[0]}; ${(c2.stdout.match(/need a browser \(gated\)\s*:\s*(\d+)/) ?? [])[1] ?? '?'} browser steps read)`)
rmSync(d0, { recursive: true, force: true })
if (c1.status !== 0 || c2.status !== 0) bail(null, 'the unmutated copy is not green on both paths: nothing to sweep')

let caught = 0, total = 0
const sweep = (kind, list, file, judge) => {
  for (const [name, from, to] of list) {
    total++
    const dir = prep()
    const f = join(dir, file)
    const src = readFileSync(f, 'utf8')
    const n = src.split(from).length - 1
    if (n !== 1) bail(dir, `ANCHOR  [${kind}] ${name}: the anchor occurs ${n} times, not once`)
    const out = src.replace(from, () => to)
    if (out === src) bail(dir, `NOOP    [${kind}] ${name}: the mutation changed nothing`)
    writeFileSync(f, out)
    const r = judge(dir)
    const fails = kind === 'CODE' ? failLines(r.stdout) : (/^FAIL: /m.test(r.stdout) ? ['FAIL:'] : [])
    const ok = r.status !== 0 && fails.length > 0
    if (ok) caught++
    const why = kind === 'CODE' ? failLines(r.stdout).slice(0, 2).map(l => l.slice(5, 70)).join(' | ') : ((r.stdout.match(/^  - .*$/m) ?? [''])[0].slice(4, 110))
    console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  [${kind}] ${name}  (exit ${r.status}${why ? ': ' + why : r.stderr ? ': ' + r.stderr.split('\n').filter(Boolean).pop().slice(0, 80) : ''})`)
    rmSync(dir, { recursive: true, force: true })
  }
}
sweep('CODE', CODE, join('scripts', 'check-browser-gate.py'), selfTest)
sweep('WORKFLOW', WORKFLOW, join('.github', 'workflows', 'verify.yml'), realTree)
console.log(`\ncaught ${caught} of ${total} mutations (${CODE.length} of the guard's code, ${WORKFLOW.length} of the workflow it guards); ${EXCLUDED} more were NOT run, each named in this file's header as equivalent or as a crash`)
process.exit(caught === total ? 0 : 1)
