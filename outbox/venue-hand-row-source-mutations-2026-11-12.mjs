// Rule 90 for the F# side of Task 4's hand rows (docs/CC-CMD-2026-11-09-venue-review-remainder.md, Result 2026-11-12, second).
//
// The F# suite has one check over all 61 rows: "the hand rows of 2026-11-12 are held at the roof, zone and point their evidence gives" (src/Suite.fs, a table of the
// rows' own numbers read against Venues.tryFind). A check that has only ever passed has proven nothing, so this breaks the source on purpose: for each mutation it writes
// src/Venues.fs with one row changed (the row's line is found by name, asserted to occur exactly once, and the change asserted to differ from the original), compiles,
// runs the F# suite and requires the failing set to be exactly that check. It samples rows across the table (first, last, the alias, the retractable one, a name with an
// apostrophe, a name with an accent) because the check iterates the table and a short-circuit on the first rows would not show on the first row.
// scripts/mutation-check.mjs holds four entries of the same kind on one row (Allianz Stadium); its records do not name the check that failed, which this does.
//
// The file is restored in `finally` and compared by sha256, and the compiled output is rebuilt from the restored source, because build/ is a copy of the source.
//
//   node outbox/venue-hand-row-source-mutations-2026-11-12.mjs     (from the repository root, about five minutes; exits 1 unless every mutation was red by the named check)

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createChecks, finish } from '../scripts/checks.mjs'

const FILE = 'src/Venues.fs'
const NAMED = 'the hand rows of 2026-11-12 are held at the roof, zone and point their evidence gives'
const orig = readFileSync(FILE, 'utf8')
const sha = t => createHash('sha256').update(t).digest('hex')
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env } })
const compile = () => run('dotnet', ['fable', 'src/Laboratory.fsproj', '--outDir', 'build'])
const suite = () => {
  const r = run('node', ['build/VerifyMain.js'], { TZ: 'UTC' })
  return { exit: r.status, failed: (r.stdout + r.stderr).split('\n').filter(l => /^FAIL\b/.test(l)).map(l => l.replace(/^FAIL\s+/, '').trim()), last: (r.stdout.trim().split('\n').pop() ?? '') }
}

const ROW = /^( {6}at )"((?:[^"\\]|\\.)+)" (-?\d+\.\d+) (-?\d+\.\d+) (OpenAir|Dome|Retractable) "([^"]+)"$/
const lineOf = name => {
  const ls = orig.split('\n').filter(l => l.startsWith(`      at "${name}" `))
  if (ls.length !== 1) throw new Error(`anchor: ${ls.length} lines start with the row of "${name}", not one`)
  const m = ROW.exec(ls[0])
  if (!m) throw new Error(`anchor: the row of "${name}" is not in the form the mutations read: ${ls[0]}`)
  return { line: ls[0], lead: m[1], name: m[2], lat: m[3], lon: m[4], roof: m[5], zone: m[6] }
}
const put = (r, o) => `${r.lead}"${r.name}" ${o.lat ?? r.lat} ${o.lon ?? r.lon} ${o.roof ?? r.roof} "${o.zone ?? r.zone}"`
const shift = (x, d) => (Number(x) + d).toFixed(4)

const MUTATIONS = [
  { name: 'AIL Arena', what: 'latitude moved 0.1 degrees (the first row of the table)', to: r => put(r, { lat: shift(r.lat, 0.1) }) },
  { name: 'Allianz Stadium', what: 'roof Dome', to: r => put(r, { roof: 'Dome' }) },
  { name: 'Parken Stadium', what: 'roof OpenAir (the retractable ground)', to: r => put(r, { roof: 'OpenAir' }) },
  { name: 'Chase Field (NH)', what: 'zone America/Chicago (the alias row)', to: r => put(r, { zone: 'America/Chicago' }) },
  { name: "Children's Mercy Park", what: 'longitude 0.001 degrees off (beyond the three-decimal key; a name with an apostrophe)', to: r => put(r, { lon: shift(r.lon, 0.001) }) },
  { name: 'Stade Boréale', what: 'row deleted (a name with an accent)', to: () => null },
  { name: 'Yager Stadium', what: 'zone Europe/Paris (the last row of the table)', to: r => put(r, { zone: 'Europe/Paris' }) },
]

const { check, summarize } = createChecks()
let restored = false
const restore = () => { writeFileSync(FILE, orig); restored = true }
try {
  const c0 = compile()
  const base = c0.status === 0 ? suite() : null
  check('the unmutated tree compiles and its suite holds (the baseline)', c0.status === 0 && base?.exit === 0 && /held/.test(base.last), c0.status === 0 ? `exit ${base.exit}; ${base.last}` : `compile exit ${c0.status}`)
  if (!base || base.exit !== 0) throw new Error('baseline did not hold; nothing was mutated')
  // the suite prints FAIL lines on its own (a deliberate must-fail sample); they are the baseline, not a mutation's effect
  const anyway = new Set(base.failed)
  const printed = []
  for (const m of MUTATIONS) {
    const r = lineOf(m.name)
    const to = m.to(r)
    const text = orig.replace(r.line + '\n', to == null ? '' : to + '\n')
    if (text === orig) { check(`[${m.name}] the mutation changed the file`, false, 'identical'); continue }
    if (orig.split(r.line + '\n').length !== 2) { check(`[${m.name}] its anchor is in the file exactly once`, false, 'not once'); continue }
    writeFileSync(FILE, text)
    const c = compile()
    if (c.status !== 0) { check(`[${m.name}] ${m.what}: compiled`, false, `compile exit ${c.status}: ${(c.stdout + c.stderr).slice(-200)}`); continue }
    const s = suite()
    const added = s.failed.filter(f => !anyway.has(f))
    const ok = s.exit === 1 && added.length === 1 && added[0] === NAMED
    printed.push(`${ok ? 'RED BY THE NAMED CHECK' : 'NOT AS WANTED'} | ${m.name}: ${m.what} | exit ${s.exit} | failed beyond the baseline: ${JSON.stringify(added)}`)
    check(`[${m.name}] ${m.what}: red by exactly the named check`, ok, `exit ${s.exit}; ${JSON.stringify(added)}`)
  }
  restore()
  console.log(`baseline: exit ${base.exit}, ${base.last}; FAIL lines it prints anyway: ${JSON.stringify([...anyway])}`)
  for (const l of printed) console.log(l)
} finally {
  if (!restored) restore()
}
const back = sha(readFileSync(FILE, 'utf8')) === sha(orig)
check('src/Venues.fs is restored byte for byte', back, `${sha(readFileSync(FILE, 'utf8'))} vs ${sha(orig)}`)
const c1 = compile()
const after = c1.status === 0 ? suite() : null
check('the compiled output is rebuilt from the restored source and its suite holds', c1.status === 0 && after?.exit === 0, c1.status === 0 ? `exit ${after.exit}; ${after.last}` : `compile exit ${c1.status}`)
console.log(`checked ${MUTATIONS.length} of ${MUTATIONS.length} source mutations of the hand rows; each must go red by exactly "${NAMED}"; src/Venues.fs sha256 ${sha(orig)}`)
finish(summarize())
