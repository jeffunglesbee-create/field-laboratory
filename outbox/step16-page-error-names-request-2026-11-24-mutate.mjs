// Rule 90: the checks for the console-error naming (scripts/console-error-text.mjs, and the handler in
// scripts/schedule-live-check.mjs that calls it) are not trusted until each has failed on purpose.
// This breaks the code seven ways and runs the one check that guards it on each:
//   scripts/schedule-live-check-names-request.mjs  = five helper cases (no browser) + seven checks on the real
//                                                    script run against a stub 429 page (a browser)
// and reports which of those two parts went red, because they exist for different mutations.
//
// Run from the repo root:  node outbox/step16-page-error-names-request-2026-11-24-mutate.mjs [base-sha]
//
// C0 is the control: nothing mutated, and it must pass 12 of 12. A harness whose every variant is red proves
// nothing, so the control comes first and a red control stops the run before any mutation is reported.
// M0 is not a mutation: it is the script as it stood at `base-sha` (default 18606cb7, the commit that filed the
// CC-CMD, before the change), read with `git show`. The stub part must fail on it, which is the red-first run.
// M1 to M4 break the helper and M5 to M6 break the handler; each anchor is asserted to occur EXACTLY once and the
// mutated text to differ from the source before anything runs, because "NOT CAUGHT" with no mutation applied is
// worse than no test. Variants run from a temp dir that holds copies of the driver, checks.mjs, the helper and
// the script, and a link to the repo's node_modules, so the working tree is never edited.
// Exit 0 when the control passes and every variant is caught by at least one part.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const repo = process.cwd()
const base = process.argv[2] || '18606cb7'
const read = f => fs.readFileSync(path.join(repo, f), 'utf8')
const lib = read('scripts/console-error-text.mjs')
const script = read('scripts/schedule-live-check.mjs')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step16-mut-'))
fs.mkdirSync(path.join(dir, 'scripts'))
for (const f of ['checks.mjs', 'schedule-live-check-names-request.mjs']) {
  fs.copyFileSync(path.join(repo, 'scripts', f), path.join(dir, 'scripts', f))
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'))
const at = f => path.join(dir, 'scripts', f)

// The first five checks of the driver are the helper cases; the rest read the real script on a stub page.
const HELPER_CASES = [
  'a refused request is named by its URL',
  'a connection that never opened is named too',
  'no URL on the message adds nothing',
  'a CORS refusal names the request already',
  'an app-level console.error carries its script as location',
]

const HELPER = "text.startsWith('Failed to load resource') && requestUrl ? `${text} — ${requestUrl}` : text"
const CALL = 'errors.push(describeConsoleError(m.text(), m.location()?.url))'
const mutate = (name, source, anchor, repl) => {
  const n = source.split(anchor).length - 1
  if (n !== 1) { console.log(`ABORT ${name}: anchor occurs ${n} time(s), need exactly 1`); process.exit(2) }
  const text = source.replace(anchor, () => repl)
  if (text === source) { console.log(`ABORT ${name}: the mutation changed nothing`); process.exit(2) }
  return text
}
const variants = [
  { name: 'C0 control: nothing mutated (must pass)', control: true, lib, script },
  { name: 'M0 the script before the change (red first)',
    lib, script: execFileSync('git', ['show', `${base}:scripts/schedule-live-check.mjs`], { cwd: repo, encoding: 'utf8' }) },
  { name: 'M1 drop the append (return the text)', script,
    lib: mutate('M1', lib, HELPER, 'text') },
  { name: 'M2 drop the prefix guard (always append)', script,
    lib: mutate('M2', lib, HELPER, 'requestUrl ? `${text} — ${requestUrl}` : text') },
  { name: 'M3 URL first, text second', script,
    lib: mutate('M3', lib, HELPER, "text.startsWith('Failed to load resource') && requestUrl ? `${requestUrl} — ${text}` : text") },
  { name: 'M4 drop the empty-URL guard', script,
    lib: mutate('M4', lib, HELPER, "text.startsWith('Failed to load resource') ? `${text} — ${requestUrl}` : text") },
  { name: 'M5 the handler reads the wrong field (.urlx)', lib,
    script: mutate('M5', script, 'm.location()?.url', 'm.location()?.urlx') },
  { name: 'M6 the handler stops calling the helper', lib,
    script: mutate('M6', script, CALL, 'errors.push(m.text())') },
]

let notCaught = 0
for (const v of variants) {
  fs.writeFileSync(at('console-error-text.mjs'), v.lib)
  fs.writeFileSync(at('schedule-live-check.mjs'), v.script)
  const r = spawnSync(process.execPath, [at('schedule-live-check-names-request.mjs')], { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  const tally = (r.stdout.match(/(\d+)\/(\d+) checks passed/) || [])[0]
  if (!tally) { console.log(`ABORT ${v.name}: the driver printed no tally (exit ${r.status})\n${r.stdout}${r.stderr}`); process.exit(2) }
  const failing = r.stdout.split('\n').filter(l => l.startsWith('FAIL')).map(l => l.slice(6))
  const helperRed = failing.filter(f => HELPER_CASES.some(h => f.startsWith(h))).length
  const stubRed = failing.length - helperRed
  const red = r.status !== 0
  if (v.control) {
    console.log(`${red ? 'CONTROL IS RED' : 'CONTROL GREEN'} ${v.name} (${tally})`)
    if (red) { console.log(r.stdout); process.exit(2) }
    continue
  }
  if (!red) notCaught++
  console.log(`${red ? 'CAUGHT    ' : 'NOT CAUGHT'} ${v.name} | helper cases ${helperRed ? `RED ${helperRed}` : 'green'} | stub run ${stubRed ? `RED ${stubRed}` : 'green'} (${tally})`)
}
fs.rmSync(dir, { recursive: true, force: true })
console.log(`\napplied ${variants.length - 1} variant(s) after the control, each anchor unique; ${notCaught} not caught`)
process.exit(notCaught === 0 ? 0 : 1)
