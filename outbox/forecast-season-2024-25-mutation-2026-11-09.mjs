// MUTATION PROOF for the 2024-25 DATA: outbox/forecast-season-2024-25-2026-11-09.mjs (the parser and its checks), outbox/forecast-fit-c-crosscheck-2026-11-09.py in `data` mode
// (the independent re-parse) and the data checks of outbox/forecast-fit-c-2026-11-09.mjs (run with --bundle-only, which stops before C is fitted). Field-relay-nba's Rule 90,
// MUTATE-FIRST-A: a check that has only ever passed has proven nothing. It breaks the raw files, the parser or the bundle one way at a time, runs all three on the broken copy, and
// requires that the SPECIFIC checks that exist to catch that break are the ones that go red, not merely that an exit code is 1.
//
// The harness holds itself to the same rule: every edit asserts its anchor occurs EXACTLY ONCE (or, for a programmatic edit, that exactly one line changed) and that the text
// changed, and a mutation whose anchor does not hold is reported as BROKEN, never as CAUGHT or NOT CAUGHT. The control (nothing broken) must be fully green in all three.
// A script that CRASHES counts for nothing: a mutation is caught only when the checks named for it show FAIL.
//
// TWO FINDINGS FROM THE FIRST RUN, kept here because they are why two entries differ from what was first written:
//   1. The parser's "year advances when the month wraps" rule is never exercised by this file: it states its year on the first date line (line 10, `Fri Aug 16 2024`) AND on the January
//      rollover (line 301, `Wed Jan 1 2025`), so deleting the rule changes nothing (an equivalent mutant: no check can go red, and none should). The entry that deleted it was replaced
//      by one that corrupts the stated rollover year, which the weekday check does catch.
//   2. A home/away swap on one fixture does not turn the FPL "same multiset of (date, goals)" check red, and cannot: that check is name-free by design. What catches a swap is the table
//      comparison with ESPN and the pairing checks; the expectation named the wrong check.
//
// USAGE.  npm run build && node outbox/forecast-season-2024-25-mutation-2026-11-09.mjs <2024-25 sources> <2025-26 sources> <2026-27 hold-out bundle> <2024-25 bundle>
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [src2425, src2526, holdBundle, freshBundle] = process.argv.slice(2)
if (!src2425 || !src2526 || !holdBundle || !freshBundle) { console.error('usage: node outbox/forecast-season-2024-25-mutation-2026-11-09.mjs <2024-25 sources> <2025-26 sources> <2026-27 bundle> <2024-25 bundle>'); process.exit(2) }
const here = path.dirname(fileURLToPath(import.meta.url))
const PREP = path.join(here, 'forecast-season-2024-25-2026-11-09.mjs')
const FIT = path.join(here, 'forecast-fit-c-2026-11-09.mjs')
const PY = path.join(here, 'forecast-fit-c-crosscheck-2026-11-09.py')
const prepText = fs.readFileSync(PREP, 'utf8')
const bundleText = fs.readFileSync(freshBundle, 'utf8')
const OF = 'openfootball-2024-25.txt', FPL = 'fpl-fixtures-2024-25.csv', ESPN = 'espn-final-2024.json'

const once = (text, find) => text.split(find).length - 1
const apply = (text, find, to) => {
  const n = once(text, find)
  if (n !== 1) throw new Error(`anchor occurs ${n} times, not once: ${JSON.stringify(find.slice(0, 70))}`)
  const out = text.replace(find, () => to)
  if (out === text) throw new Error('the edit changed nothing')
  return out
}
// A programmatic edit of one fixture line of the raw file: `fn` gets that line's text and returns the new text. Exactly one line must change.
const FIXTURE = /^\s{4,}(?:\d{2}:\d{2}\s+)?.+?\s+v\s+.+?\s+\d+-\d+(?:\s+\(\d+-\d+\))?\s*\r?$/
const editFirstFixture = (text, fn) => {
  const lines = text.split('\n'), idx = lines.findIndex(l => FIXTURE.test(l))
  if (idx < 0) throw new Error('no fixture line found')
  const before = lines[idx]; lines[idx] = fn(before)
  if (lines[idx] === before) throw new Error('the edit changed nothing')
  return lines.join('\n')
}

// Run the three checkers on one (sources, prep script, bundle) combination. If `bundle` is not given, the (possibly mutated) prep script writes one from the sources.
function runAll({ dir, script = PREP, bundle = null, tmp }) {
  const reds = [], codes = {}
  let bpath = bundle
  if (!bpath) {
    bpath = path.join(tmp, 'bundle.json')
    const r = spawnSync(process.execPath, [script, dir, `--write-bundle=${bpath}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    codes.prep = r.status
    for (const l of (r.stdout ?? '').split('\n')) if (l.startsWith('FAIL ')) reds.push('prep: ' + l.slice(5))
    if (!fs.existsSync(bpath)) { reds.push('prep: (no bundle written) ' + (r.stderr ?? '').trim().split('\n').pop().slice(0, 100)); return { reds, codes, bpath: null } }
  }
  const p = spawnSync('python3', ['-I', PY, 'data', dir, bpath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  codes.py = p.status
  for (const l of (p.stdout ?? '').split('\n')) if (l.startsWith('FAIL ')) reds.push('py: ' + l.slice(5))
  if (p.status !== 0 && !(p.stdout ?? '').includes('FAIL ')) reds.push('py: (crashed) ' + (p.stderr ?? '').trim().split('\n').pop().slice(0, 100))
  const f = spawnSync(process.execPath, [FIT, src2526, bpath, holdBundle, '--bundle-only'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  codes.fit = f.status
  for (const l of (f.stdout ?? '').split('\n')) if (l.startsWith('FAIL ')) reds.push('fit: ' + l.slice(5))
  if (f.status !== 0 && !(f.stdout ?? '').includes('FAIL ')) reds.push('fit: (crashed) ' + (f.stderr ?? '').trim().split('\n').pop().slice(0, 100))
  return { reds, codes, bpath }
}

const MUTATIONS = [
  // ---- the raw files
  { name: 'raw openfootball: the first fixture\'s home goals + 1', raw: { [OF]: t => editFirstFixture(t, l => l.replace(/(\s)(\d+)-(\d+)/, (m, s, h, a) => `${s}${+h + 1}-${a}`)) },
    expect: ['prep: source openfootball is the pinned file', 'prep: results-derived final table equals ESPN', 'prep: fpl: the same multiset', 'py: the four raw files are the ones the bundle pins', 'py: ESPN, read straight from its JSON', 'fit: 2024-25: the final table the results make equals ESPN'] },
  { name: 'raw openfootball: the first fixture line deleted', raw: { [OF]: t => { const lines = t.split('\n'), i = lines.findIndex(l => FIXTURE.test(l)); lines.splice(i, 1); return lines.join('\n') } },
    expect: ['prep: source openfootball is the pinned file', 'prep: openfootball: the header', 'prep: openfootball: every club has 38', 'prep: openfootball: every ordered pair', 'fit: 2024-25: the bundle holds 379 matches'] },
  { name: 'raw openfootball: the first yearless date line moved one day (Sat 17 -> 18)', raw: { [OF]: t => apply(t, '  Sat Aug 17', '  Sat Aug 18') },
    expect: ['prep: openfootball: every date line names its own weekday', 'prep: openfootball: every non-blank line is a title'] },
  { name: 'raw openfootball: home and away swapped on the first fixture', raw: { [OF]: t => editFirstFixture(t, l => { const m = /^(\s{4,}(?:\d{2}:\d{2}\s+)?)(.+?)(\s+v\s+)(.+?)(\s+\d+-\d+.*)$/.exec(l.replace(/\r$/, '')); return `${m[1]}${m[4]}${m[3]}${m[2]}${m[5]}${l.endsWith('\r') ? '\r' : ''}` }) },
    expect: ['prep: openfootball: every club has 38', 'prep: openfootball: every ordered pair', 'prep: results-derived final table equals ESPN', 'prep: fpl: every one of 380', 'prep: fpl: paired fixtures agree'] },
  { name: 'raw openfootball: the first matchday heading renumbered 1 -> 99', raw: { [OF]: t => apply(t, '▪ Matchday 1\r\n', '▪ Matchday 99\r\n') },
    expect: ['prep: openfootball: the matchday headings', 'fit: 2024-25: the matchday headings are exactly 1..38'] },
  { name: 'raw FPL fixtures: the first fixture\'s home score 1 -> 2', raw: { [FPL]: t => apply(t, '2024-08-16T19:00:00Z,90,False,True,9,0,14,1,"', '2024-08-16T19:00:00Z,90,False,True,9,0,14,2,"') },
    expect: ['prep: source fplFixtures is the pinned file', 'prep: fpl: the same multiset', 'prep: fpl: every one of 380'] },
  { name: 'raw FPL fixtures: the first fixture marked not finished', raw: { [FPL]: t => apply(t, '2444470,1,True,True,1,2024-08-16', '2444470,1,False,True,1,2024-08-16') },
    expect: ['prep: source fplFixtures is the pinned file', 'prep: fpl fixtures: 380 rows parsed'] },
  { name: 'raw ESPN: the first club\'s games played 38 -> 37', raw: { [ESPN]: t => { const j = JSON.parse(t); const s = j.children[0].standings.entries[0].stats.find(x => x.name === 'gamesPlayed'); if (s.value !== 38) throw new Error('anchor: gamesPlayed is not 38'); s.value = 37; return JSON.stringify(j) } },
    expect: ['prep: source espnFinal is the pinned file', 'prep: results-derived final table equals ESPN', 'py: ESPN, read straight from its JSON'] },
  // ---- the parser
  { name: 'raw openfootball: the explicit year on the January rollover line, 2025 -> 2026', raw: { [OF]: t => apply(t, '  Wed Jan 1 2025', '  Wed Jan 1 2026') },
    expect: ['prep: openfootball: every date line names its own weekday', 'prep: openfootball: every non-blank line is a title'] },
  { name: 'parser: the half-time score is required', script: s => apply(s, '(\\d+)-(\\d+)(?:\\s+\\((\\d+)-(\\d+)\\))?\\s*$/.exec(line))) {\n      if (date === null', '(\\d+)-(\\d+)(?:\\s+\\((\\d+)-(\\d+)\\))\\s*$/.exec(line))) {\n      if (date === null'),
    expect: ['prep: openfootball: every non-blank line is a title', 'prep: openfootball: the header', 'prep: openfootball: every club has 38'] },
  { name: 'parser: the kick-off time is no longer carried to the next fixture', script: s => apply(s, 'if (m[1]) time = m[1]; else if (time !== null) inherited++', 'time = m[1] ?? null'),
    expect: ['prep: openfootball: every non-blank line is a title'] },
  { name: 'comparison: ESPN\'s goals for and against swapped in the tuple', script: s => apply(s, 'const eByTuple = new Map(E.map(r => [tup(r.Played, r.Points, r.GoalsFor, r.GoalsAgainst), r]))', 'const eByTuple = new Map(E.map(r => [tup(r.Played, r.Points, r.GoalsAgainst, r.GoalsFor), r]))'),
    expect: ['prep: results-derived final table equals ESPN'] },
  { name: 'table engine: a win is worth 2 points', script: s => apply(s, 'if (m.hg > m.ag) h.pts += 3; else if', 'if (m.hg > m.ag) h.pts += 2; else if'),
    expect: ['prep: results-derived final table equals ESPN'] },
  // ---- the bundle itself (the sources are untouched)
  { name: 'bundle: match 10\'s home goals + 1', bundle: b => { b.matches[10].hg += 1 },
    expect: ['fit: 2024-25: the final table the results make equals ESPN', 'fit: 2024-25: FPL\'s', 'py: every fixture equals the bundle'] },
  { name: 'bundle: match 10\'s weekday name rotated', bundle: b => { const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; b.matches[10].dow = W[(W.indexOf(b.matches[10].dow) + 1) % 7] },
    expect: ['fit: 2024-25: every match\'s date names its own weekday', 'py: every fixture equals the bundle'] },
  { name: 'bundle: the FPL teams file\'s recorded sha256 altered', bundle: b => { b.raw.fplTeams.sha256 = '0'.repeat(64) },
    expect: ['fit: 2024-25: the bundle records the four pinned raw files', 'py: the four raw files are the ones the bundle pins'] },
  { name: 'bundle: the first standings row\'s goals for + 1', bundle: b => { b.standings[0].gf += 1 },
    expect: ['fit: 2024-25: the final table the results make equals ESPN', 'py: ESPN: the bundle\'s 20 standings rows'] },
  { name: 'bundle: a match deleted', bundle: b => { b.matches.splice(200, 1) },
    expect: ['fit: 2024-25: the bundle holds', 'py: openfootball re-parsed independently'] },
  { name: 'bundle: the ESPN season recorded as 2025-26', bundle: b => { b.espn.season = 2025; b.espn.name = 'English Premier League 2025-2026' },
    expect: ['fit: 2024-25: the ESPN payload is the 2024-25 season', 'py: ESPN: no entry carries a deduction'] },
  { name: 'bundle: the last match dated after the training season began', bundle: b => { b.matches[379].date = '2025-09-01'; b.matches[379].dow = 'Mon' },
    expect: ['fit: 2024-25: it ends before the training season begins'] },
  { name: 'bundle: an FPL fixture deleted', bundle: b => { b.fpl.splice(100, 1) },
    expect: ['fit: 2024-25: FPL\'s', 'py: FPL: the bundle\'s 380 fixtures'] },
]

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'data-mut-'))
console.log('CONTROL  (nothing broken: sources, parser and bundle as committed)')
let tmp = mk()
const control = runAll({ dir: src2425, bundle: freshBundle, tmp })
const control2 = runAll({ dir: src2425, tmp })       // and once with the bundle re-written from the sources by the unmodified parser
fs.rmSync(tmp, { recursive: true, force: true })
const controlOk = control.reds.length === 0 && control2.reds.length === 0 && [control.codes.py, control.codes.fit, control2.codes.prep, control2.codes.py, control2.codes.fit].every(c => c === 0)
console.log(`  committed bundle: python exit ${control.codes.py}, fit --bundle-only exit ${control.codes.fit}; re-written bundle: prep exit ${control2.codes.prep}, python exit ${control2.codes.py}, fit exit ${control2.codes.fit}; red: ${control.reds.length + control2.reds.length}`)
let caught = 0, broken = 0
if (!controlOk) { console.log('  the control is not green: no mutation result below can be trusted'); for (const r of [...control.reds, ...control2.reds]) console.log('    ' + r.slice(0, 160)); process.exitCode = 1 }
else {
  for (const m of MUTATIONS) {
    tmp = mk()
    const mutPrep = path.join(here, `.mut-prep-${process.pid}.mjs`)
    try {
      let dir = src2425, script = PREP, bundle = null
      if (m.raw) {
        dir = path.join(tmp, 'src'); fs.mkdirSync(dir)
        for (const f of fs.readdirSync(src2425)) fs.copyFileSync(path.join(src2425, f), path.join(dir, f))
        for (const [f, fn] of Object.entries(m.raw)) { const before = fs.readFileSync(path.join(dir, f), 'utf8'); const after = fn(before); if (after === before) throw new Error('the edit changed nothing'); fs.writeFileSync(path.join(dir, f), after) }
      } else if (m.script) {
        fs.writeFileSync(mutPrep, m.script(prepText)); script = mutPrep
      } else if (m.bundle) {
        const b = JSON.parse(bundleText); const before = JSON.stringify(b); m.bundle(b)
        if (JSON.stringify(b) === before) throw new Error('the edit changed nothing')
        bundle = path.join(tmp, 'mutated-bundle.json'); fs.writeFileSync(bundle, JSON.stringify(b))
      }
      const r = runAll({ dir, script, bundle, tmp })
      const missing = m.expect.filter(e => !r.reds.some(l => l.includes(e)))
      const ok = missing.length === 0
      if (ok) caught++
      console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${m.name}\n    exits ${JSON.stringify(r.codes)}; red checks: ${r.reds.length}; expected red: ${m.expect.length}, red as expected: ${m.expect.length - missing.length}${missing.length ? '; STILL GREEN: ' + missing.join(' | ') : ''}`)
    } catch (e) { broken++; console.log(`BROKEN  ${m.name}: ${e.message}`) }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(mutPrep, { force: true }) }
  }
  console.log(`\n${caught} of ${MUTATIONS.length} mutations caught by the checks written to catch them (${broken} broken harness anchors); control green in all three checkers, on the committed bundle and on a re-written one`)
  process.exitCode = caught === MUTATIONS.length && broken === 0 ? 0 : 1
}
