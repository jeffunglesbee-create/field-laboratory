#!/usr/bin/env node
// Rule 90: scripts/check-browser-gate.py must go red when it is broken (its code) and when the thing it guards is broken (the workflow). Two kinds of mutation, each
// applied to a COPY, each anchor asserted to occur exactly once and to have changed the file:
//   CODE      a mutation of the guard's own source, judged by `python3 <copy>/scripts/check-browser-gate.py --self-test`: caught only if it exits non-zero AND prints a FAIL line
//   WORKFLOW  a mutation of a copy of .github/workflows/verify.yml, judged by the guard on the real-tree path (cwd = the copy's root): caught only if it exits non-zero AND
//             prints `FAIL:`. These are the edits a careless change would make: drop a gate, drop continue-on-error, gate a step that needs no browser, add a browser step
//             with no gate, weaken the final step.
// The unmutated copy is run first on BOTH paths, so a copy that cannot run is reported before any mutation is judged. A crash with no FAIL line is not a catch.
//   node outbox/browser-gate-sweep-2026-11-12.mjs        (from the repository root)
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = new URL('..', import.meta.url).pathname
const GATE = "        if: steps.chromium.outcome == 'success'\n"

const CODE = [
  ['a launch is only an import of playwright', "r\"\"\"from\\s+['\"]playwright(?:-core)?['\"]|", 'r"""'],
  ['require(playwright) is not a launch', "require\\(\\s*['\"]playwright(?:-core)?['\"]\\s*\\)|", ''],
  ['import(playwright) is not a launch', "import\\(\\s*['\"]playwright|", ''],
  ['chromium.launch is not a launch', "|chromium\\.launch|launchPersistentContext|PW_CHROMIUM|\"\"\"", "|launchPersistentContext|PW_CHROMIUM|\"\"\""],
  ['launchPersistentContext is not a launch', "|chromium\\.launch|launchPersistentContext|PW_CHROMIUM|\"\"\"", "|chromium\\.launch|PW_CHROMIUM|\"\"\""],
  ['PW_CHROMIUM is not a use', "launchPersistentContext|PW_CHROMIUM|\"\"\"", "launchPersistentContext|\"\"\""],
  ['an inline browser launch in the step text is not read', "if re.search(r\"chromium\\.launch|launchPersistentContext|require\\(\\s*['\\\"]playwright\", own):", "if False:"],
  ['a python import of playwright is not a launch', '    r"""^\\s*(?:import|from)\\s+playwright\\b"""\n', '    r"""(?!)"""\n'],
  ['--self-test still launches', 'if "--self-test" in args.split():\n            continue\n', 'pass\n'],
  ['comments are read as code', 'return bool(LAUNCH.search(strip_comments(src)))', 'return bool(LAUNCH.search(src))'],
  ['npm run is not followed', 'body = (pkg.get(m.group(1)) or "")', 'body = ""'],
  ['a command after && is not read', 'return [s.strip() for s in re.split(r"\\s*(?:&&|\\|\\||;|\\|)\\s*", line) if s.strip()]', 'return [line]'],
  ['a backslash-continued command is read line by line', 'if line.endswith("\\\\"):', 'if False:'],
  ['npx playwright <anything> is not a browser step', 'if m.group(1) != "install":\n            return True', 'if False:\n            return True'],
  ['the install step is found by a comment', 'return bool(INSTALL_CMD.search("\\n".join(logical_lines(run_text(step)))))', 'return bool(INSTALL_CMD.search(run_text(step)))'],
  ['continue-on-error is not required on the install', 'if inst.get("continue-on-error") is not True:', 'if False:'],
  ['the install id is not required', 'if inst.get("id") != INSTALL_ID:', 'if False:'],
  ['an id that no earlier step has is not reported', 'if ref not in ids or ids[ref] >= i:', 'if False:'],
  ['a browser step before the install is not reported', 'if needs_browser(s, pkg, read):\n                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")', 'if False:\n                bad.append(f"step {name(s)} needs a browser but runs BEFORE the install")'],
  ['an ungated browser step is not reported', 'if not gated_if(if_text(s)):', 'if False:'],
  ['a plain step gated on the install is not reported', 'if f"steps.{INSTALL_ID}" in if_text(s):', 'if False:'],
  ['the final step is accepted with == failure', 'FINAL_CLAUSES = ["always()", f"steps.{INSTALL_ID}.outcome != \'success\'"]', 'FINAL_CLAUSES = ["always()", f"steps.{INSTALL_ID}.outcome == \'failure\'"]'],
  ['the final step is accepted without always()', 'FINAL_CLAUSES = ["always()", ', 'FINAL_CLAUSES = ['],
  ['unrecognised clauses are accepted', 'return parts if all(CLAUSE.match(p) for p in parts) else None', 'return parts'],
  ['the final step form is not exact', 'return cl is not None and sorted(cl) == sorted(FINAL_CLAUSES)', 'return cl is not None and all(c in cl for c in FINAL_CLAUSES)'],
  ['a missing final step is not reported', '        bad.append(f"no final step whose', '        (lambda *_: None)(f"no final step whose'],
  ['a final step that does not exit 1 is accepted', 'if "exit 1" not in run_text(fs):', 'if False:'],
  ['a final step before the last browser step is accepted', 'if fi < last_browser:', 'if False:'],
  ['more than one install step is accepted', 'if len(installs) != 1:', 'if len(installs) < 1:'],
  ['the coverage floors are zero', 'MIN_STEPS = 60 ', 'MIN_STEPS = 0 '],
  ['the browser floor is zero', 'MIN_BROWSER = 10', 'MIN_BROWSER = 0'],
  ['the browser-free floor is zero', 'MIN_PLAIN = 30', 'MIN_PLAIN = 0'],
]

// anchors that exist exactly once in verify.yml (the sweep asserts it). `byName` removes or alters the gate of ONE step.
const ins = (name, add) => [`      - name: ${name}\n`, `      - name: ${name}\n${add}`]
const WORKFLOW = [
  ['the install loses its id', '        id: chromium\n', ''],
  ['the install loses continue-on-error', '        continue-on-error: true\n        timeout-minutes: 3\n        run: npx playwright install chromium', '        timeout-minutes: 3\n        run: npx playwright install chromium'],
  ['the install id is renamed', '        id: chromium\n', '        id: browser\n'],
  ['a browser step loses its gate (the first)', `      - name: Render checks (both captures, including the state transition)\n${GATE}`, '      - name: Render checks (both captures, including the state transition)\n'],
  ['a browser step loses its gate (the last before the tail)', `      - name: Games are separated from each other\n${GATE}`, '      - name: Games are separated from each other\n'],
  ['a browser step loses its gate (a probe)', `      - name: The live score probe's glue, on the rendered page\n${GATE}`, "      - name: The live score probe's glue, on the rendered page\n"],
  ['the tail browser step loses the install part of its gate', "        if: \"!cancelled() && steps.build.outcome == 'success' && steps.chromium.outcome == 'success'\"\n", "        if: \"!cancelled() && steps.build.outcome == 'success'\"\n"],
  ['a gate tests the conclusion, not the outcome', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.conclusion == 'success'\n"],
  ['a gate tests failure', `      - name: Drama sparkline\n${GATE}`, "      - name: Drama sparkline\n        if: steps.chromium.outcome == 'failure'\n"],
  ['the F# suite waits for the install', ...ins('The F# suite, on the F# harness', GATE)],
  ['a decoder check waits for the install', ...ins('Pick decoders', GATE)],
  ['a new browser step is added with no gate', ...ins('Drama sparkline', '        run: node scripts/nav-check.mjs\n\n      - name: A new check that needs a browser\n').slice(0, 1).concat([`      - name: A new check that needs a browser\n        run: node scripts/nav-check.mjs\n\n      - name: Drama sparkline\n`])],
  ['the final step tests == failure', "        if: always() && steps.chromium.outcome != 'success'\n", "        if: always() && steps.chromium.outcome == 'failure'\n"],
  ['the final step drops always()', "        if: always() && steps.chromium.outcome != 'success'\n", "        if: steps.chromium.outcome != 'success'\n"],
  ['the final step does not fail the job', 'This commit is NOT verified."\n          exit 1\n', 'This commit is NOT verified."\n          true\n'],
  ['the final step is removed', "      - name: Install Chromium did not succeed, so the steps that need a browser were skipped\n        if: always() && steps.chromium.outcome != 'success'\n", "      - name: Install Chromium did not succeed, so the steps that need a browser were skipped\n        if: always() && steps.chromium.outcome != 'success' && false\n"],
]

const prep = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bgsweep-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
  cpSync(join(here, '.github', 'workflows', 'verify.yml'), join(dir, '.github', 'workflows', 'verify.yml'))
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
console.log(`\ncaught ${caught} of ${total} mutations (${CODE.length} of the guard's code, ${WORKFLOW.length} of the workflow it guards)`)
process.exit(caught === total ? 0 : 1)
