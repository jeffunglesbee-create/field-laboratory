// Where else does a failed fetch read as an empty answer?
//
// THE DEFECT, from 2026-08-28. scripts/cfb-first-slate-check.mjs (field-relay-nba)
// asked ESPN for a slate:
//
//   const sb = await (await fetch(url)).json().catch(() => null)
//   const events = sb?.events || []
//   if (!events.length) console.log('NOT OBSERVABLE — ESPN lists no CFB events')
//
// A 403 returns a Response whose body is an HTML error page, `.json()` throws,
// `.catch(() => null)` swallows it, and the check reports a quiet day. Run
// locally it printed "lists no CFB events" while the real state was HTTP 403.
//
// A check that downgrades "I could not look" to "there was nothing to see" is
// worse than no check, on exactly the day something breaks.
//
// WHAT SEPARATES SAFE FROM UNSAFE, and it is not the `.catch`. Most sites here
// are fine:
//
//   return { http: r.status, json: await r.json().catch(() => null) }   SAFE
//   console.log(`HTTP ${r.status} ${JSON.stringify(body)}`)              SAFE
//
// The status survives, so the caller can still tell the two apart. Unsafe is
// when the swallowed value becomes the ONLY evidence and no status is ever
// read — then emptiness is the sole observable and its two causes have merged.
//
// A PROBE, NOT A CHECK. This answers "where else" once. Whether it earns a
// permanent ratchet depends on the count it returns, and inventing the ratchet
// before knowing the count is how this repository accumulates crons nobody
// reads (see jubilant-bassoon outbox/cc-session-2026-08-16-scheduled-workflow-audit.md).

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPOS = process.argv.slice(2).filter(a => !a.startsWith('--'))
const repos = REPOS.length ? REPOS : ['.', '../field-relay-nba', '../jubilant-bassoon']

// A swallow: a .catch whose handler returns an empty-ish literal.
const SWALLOW = /\.catch\(\s*\(\s*\)\s*=>\s*(null|\[\]|\(\{\}\)|\{\}|undefined|''|"")\s*\)/
// Evidence the status survived, looked for in the same statement or the four
// lines after it. `r.ok`, `.status`, `HTTP ${...}` all count.
const STATUS = /\.\s*(ok|status)\b|\bHTTP\b|statusText/

let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `\n        → ${detail}`}`)
  ok ? pass++ : fail++
}

// The first version of this function reported 17 unsafe sites and was wrong
// about 15 of them. It matched its own explanatory comments, its own self-test
// fixtures, and every Playwright `page.click(...).catch(() => {})` in the tree
// -- none of which is a fetch, and several of which carry a comment saying the
// swallow is deliberate.
//
// So the detector claimed "a failed fetch reads as an empty answer" and
// measured "any .catch returning something empty, anywhere, including in
// prose". That is the defect it was written to find, in itself, on the first
// run. Two narrowings, both stated rather than tuned until the number looked
// right:
//
//   1. A COMMENT IS NOT CODE. Lines whose first non-space characters are // or
//      * are skipped outright.
//   2. A SWALLOW IS ONLY THIS DEFECT IF IT IS ON A FETCH. The line, or the two
//      above it, must mention `fetch(` or `.json(`. A browser-driver promise
//      (`page.goto`, `.click`, `waitForSelector`, `browser.close`) is excluded
//      by name, because those legitimately swallow -- the assertion after them
//      is what reports, and that is the documented pattern in render-check.mjs
//      and nav-check.mjs.
const DRIVER = /\b(page|browser|ctx|context)\s*\.|waitForSelector|\.click\(|\.goto\(|\.evaluate\(|\.close\(/
export function classify (lines, i) {
  const line = lines[i]
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) return null
  if (!SWALLOW.test(line)) return null
  const near = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
  if (!/fetch\(|\.json\(/.test(near)) return null
  if (DRIVER.test(line)) return null
  const window = lines.slice(Math.max(0, i - 3), i + 5).join('\n')
  return STATUS.test(window) ? 'safe' : 'unsafe'
}

if (process.argv.includes('--self-test')) {
  const T = (l, ok) => check(l, ok)
  const c = src => classify(src.split('\n'), src.split('\n').findIndex(l => SWALLOW.test(l)))
  T('a swallow with the status kept in the same expression is safe',
    c(`return { http: r.status, json: await r.json().catch(() => null) }`) === 'safe')
  T('a swallow logged beside HTTP ${r.status} is safe',
    c(`const b = await r.json().catch(() => ({}));\nconsole.log(\`HTTP \${r.status}\`)`) === 'safe')
  T('a swallow gated by r.ok afterwards is safe',
    c(`const b = await r.json().catch(() => null)\nif (!put.ok) process.exit(1)`) === 'safe')
  T('THE REAL DEFECT IS FLAGGED: no status anywhere near it',
    c(`const sb = await (await fetch(u)).json().catch(() => null)\nconst events = sb?.events || []\nif (!events.length) console.log('nothing here')`) === 'unsafe')
  T('...and the relay variant with ({}) too',
    c(`const ctx = await (await fetch(u)).json().catch(() => ({}))\nconst rows = ctx.games ?? []`) === 'unsafe')
  T('a line with no swallow is not classified at all',
    classify(['const x = await r.json()'], 0) === null)
  T('a catch returning a real value is not a swallow',
    classify([`const x = await r.json().catch(() => ({ error: true }))`], 0) === null)
  // The two narrowings, each with the real line that forced it.
  T('a COMMENT describing the defect is not the defect',
    classify(['//   const sb = await (await fetch(u)).json().catch(() => null)'], 0) === null)
  T('a Playwright swallow is not a fetch swallow',
    classify([`await page.waitForSelector('.pick-outlets', { timeout: 10000 }).catch(() => {})`], 0) === null)
  T('...nor is browser.close()',
    classify(['await browser.close().catch(() => {});'], 0) === null)
  T('but a real fetch swallow beside a driver call is STILL flagged',
    c(`const r = await fetch(u)\nconst j = await r.json().catch(() => null)\nconst rows = j?.rows || []`) === 'unsafe')
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} self-test(s)\n`)
  process.exit(fail === 0 ? 0 : 1)
}

const findings = { safe: [], unsafe: [] }
let scanned = 0
for (const repo of repos) {
  const dir = join(repo, 'scripts')
  if (!existsSync(dir)) continue
  // Skip this file. Its self-test fixtures are swallow sites written on purpose
  // as strings, and every one of them is already exercised by --self-test. A
  // detector reporting its own fixtures is noise that hides the real rows.
  const SELF = 'fetch-silently-empty-probe.mjs'
  for (const f of readdirSync(dir).filter(n => /\.(mjs|js)$/.test(n) && n !== SELF)) {
    const path = join(dir, f)
    const lines = readFileSync(path, 'utf8').split('\n')
    scanned++
    for (let i = 0; i < lines.length; i++) {
      const v = classify(lines, i)
      if (v) findings[v].push(`${repo}/scripts/${f}:${i + 1}  ${lines[i].trim().slice(0, 96)}`)
    }
  }
}

console.log(`\n  ${scanned} script(s) scanned across ${repos.length} repo(s)`)
console.log(`  ${findings.safe.length} swallow(s) with the status preserved, ${findings.unsafe.length} without\n`)
if (findings.unsafe.length) {
  console.log('  UNSAFE — a failed fetch is indistinguishable from an empty answer here:\n')
  for (const u of findings.unsafe) console.log(`    ${u}`)
  console.log('')
}
console.log('  safe, for the record:\n')
for (const s of findings.safe) console.log(`    ${s}`)

// Non-vacuity: a regex that stopped matching would report zero of both and read
// as a clean codebase.
console.log('')
check('the scan found swallow sites at all — otherwise this proves nothing',
  findings.safe.length + findings.unsafe.length > 0,
  'the pattern matched nothing in any repo, which is more likely a broken regex than a clean tree')
check('no fetch failure reads as an empty answer',
  findings.unsafe.length === 0,
  `${findings.unsafe.length} site(s) — each needs the status read before the value is used as data`)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} checks passed`)
process.exit(fail === 0 ? 0 : 1)
