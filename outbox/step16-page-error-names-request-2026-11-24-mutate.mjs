// Rule 90: the checks for scripts/schedule-live-check.mjs's describeConsoleError are not trusted
// until each has failed on purpose. This breaks the script seven ways and runs both checks on each:
//   `schedule-live-check.mjs --self-test`                     (five cases, no browser)
//   `schedule-live-check-names-request.mjs --script <variant>` (the real script against a stub 429 page)
//
// Run from the repo root:  node outbox/step16-page-error-names-request-2026-11-24-mutate.mjs [base-sha]
//
// M0 is not a mutation: it is the script as it stood at `base-sha` (default 18606cb7, the commit that
// filed the CC-CMD, before the change), read with `git show`. The stub check must fail on it, which is
// the red-first run. M1 to M6 break the edited script; each anchor is asserted to occur EXACTLY once and
// the mutated text to differ from the source before anything runs, because "NOT CAUGHT" with no mutation
// applied is worse than no test. Variants run from a temp dir that holds a copy of checks.mjs and a link
// to the repo's node_modules, so the working tree is never edited.
// Exit 0 when every variant is caught by at least one check.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const repo = process.cwd()
const base = process.argv[2] || '18606cb7'
const driver = path.join(repo, 'scripts/schedule-live-check-names-request.mjs')
const source = fs.readFileSync(path.join(repo, 'scripts/schedule-live-check.mjs'), 'utf8')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step16-mut-'))
fs.mkdirSync(path.join(dir, 'scripts'))
fs.copyFileSync(path.join(repo, 'scripts/checks.mjs'), path.join(dir, 'scripts/checks.mjs'))
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'))
const variant = path.join(dir, 'scripts/variant.mjs')

const HELPER = "text.startsWith('Failed to load resource') && requestUrl ? `${text} — ${requestUrl}` : text"
const CALL = 'errors.push(describeConsoleError(m.text(), m.location()?.url))'
const variants = [
  { name: 'M0 the script before the change (red first)', selfTest: false,
    text: execFileSync('git', ['show', `${base}:scripts/schedule-live-check.mjs`], { cwd: repo, encoding: 'utf8' }) },
  ...[
    ['M1 drop the append (return the text)', HELPER, 'text'],
    ['M2 drop the prefix guard (always append)', HELPER, 'requestUrl ? `${text} — ${requestUrl}` : text'],
    ['M3 URL first, text second', HELPER, "text.startsWith('Failed to load resource') && requestUrl ? `${requestUrl} — ${text}` : text"],
    ['M4 drop the empty-URL guard', HELPER, "text.startsWith('Failed to load resource') ? `${text} — ${requestUrl}` : text"],
    ['M5 the handler reads the wrong field (.urlx)', 'm.location()?.url', 'm.location()?.urlx'],
    ['M6 the handler stops calling the helper', CALL, 'errors.push(m.text())'],
  ].map(([name, anchor, repl]) => {
    const n = source.split(anchor).length - 1
    if (n !== 1) { console.log(`ABORT ${name}: anchor occurs ${n} time(s), need exactly 1`); process.exit(2) }
    const text = source.replace(anchor, () => repl)
    if (text === source) { console.log(`ABORT ${name}: the mutation changed nothing`); process.exit(2) }
    return { name, text, selfTest: true }
  }),
]

let notCaught = 0
for (const v of variants) {
  fs.writeFileSync(variant, v.text)
  const self = v.selfTest ? spawnSync(process.execPath, [variant, '--self-test'], { encoding: 'utf8' }) : null
  const stub = spawnSync(process.execPath, [driver, '--script', variant], { encoding: 'utf8', timeout: 120_000 })
  const selfRed = self ? self.status !== 0 : null
  const stubRed = stub.status !== 0
  const caught = selfRed === true || stubRed
  if (!caught) notCaught++
  const word = s => (s === null ? 'n/a' : s ? 'RED' : 'green')
  console.log(`${caught ? 'CAUGHT    ' : 'NOT CAUGHT'} ${v.name} | self-test ${word(selfRed)} | stub check ${word(stubRed)} (${(stub.stdout.match(/(\d+)\/(\d+) checks passed/) || [])[0] || 'no tally'})`)
}
fs.rmSync(dir, { recursive: true, force: true })
console.log(`\napplied ${variants.length} variant(s), each anchor unique; ${notCaught} not caught`)
process.exit(notCaught === 0 ? 0 : 1)
