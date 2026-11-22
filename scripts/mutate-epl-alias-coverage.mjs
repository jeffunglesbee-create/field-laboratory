// Rule 90 for scripts/epl-alias-coverage-check.mjs, judged by its --self-test.
// field-relay-nba docs/CC-CMD-2026-09-11-epl-identity-resolve.md, Task 2 (built here, LAB-FIRST-A).
//
// E1 and E3 are the ones that matter. E1 is the season window dropping out, which turns the three clubs relegated
// last May into orphans for ever. E3 is orphans not being counted, which is the check passing on the C Palace defect it
// exists to catch.
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const F = 'scripts/epl-alias-coverage-check.mjs'
// THE CONTROL MUST SEE A RUN: an exit status alone reads a self-test that never started as a pass. Only a completed
// run prints the tally line. The output is kept on BOTH paths, because a self-test that fails without throwing still
// has to be read for the check that went red.
const TALLY = /^([1-9]\d*)\/\1 checks passed$/m
const run = (at) => {
  let out
  try { out = execFileSync(process.execPath, [at, '--self-test'], { stdio: 'pipe', encoding: 'utf8' }) }
  catch (e) { out = String(e.stdout || '') }
  return { pass: TALLY.test(out), out }
}

const MUTATIONS = [
  ['E1 the season window is dropped', "const rows = games.filter(g => typeof g?.date === 'string' && g.date >= since)", "const rows = games.filter(g => typeof g?.date === 'string')", 'W2'],
  ['E2 the window opens a day late', "g.date >= since)", "g.date > since)", 'W2'],
  ['E3 orphans are not counted', "const orphans = names.filter(n => !clubs.has(key(n))).sort()", "const orphans = []", 'G1'],
  ['E4 an FPL club with no name does not gate', "if (f.gatesUnseen === true) for (const c of unseen) gaps.push(", "if (false) for (const c of unseen) gaps.push(", 'G4'],
  ['E5 an archive club with no row yet gates too', "if (f.gatesUnseen === true) for (const c of unseen) gaps.push(", "if (true) for (const c of unseen) gaps.push(", 'G5'],
  ['E6 a short standings list is covered', "if (!Array.isArray(league) || league.length !== expected) {", "if (!Array.isArray(league)) {", 'N1'],
  ['E7 a feed with no names is covered', "if (names.length === 0) {", "if (false) {", 'N3'],
  ['E8 two league clubs with one key are not a gap', "if (clubs.has(k)) gaps.push(", "if (false) gaps.push(", 'N4'],
  ['E9 a resolver that throws escapes', "try { return String(resolve(n) ?? '') } catch { return '' }", "return String(resolve(n) ?? '')", 'N5'],
  ['E10 a league club with no key is not a gap', "if (k === '') { gaps.push(`league club \"${n}\" resolves to no key`); continue }", "if (k === '') continue", 'N7'],
  ['E11 the coverage line is not first', "const lines = [\n    `checked ${m.clubs}", "const lines = [\n    `resolver: ${resolver}`,\n    `checked ${m.clubs}", 'O1'],
  ['E12 a gap does not print its per-club table', "if (m.verdict !== 'covered') for (const r of m.table)", "if (false) for (const r of m.table)", 'O2'],
  ['E13 a feed that could not be read exits 0', "export const exitFor = (verdict) => (verdict === 'covered' ? 0 : 1)", "export const exitFor = (verdict) => (verdict === 'gaps' ? 1 : 0)", 'O4'],
  ['E14 an HTTP error is read as an answer', "if (!r.ok) return { state: 'http-error', why: `HTTP ${r.status}` }", "", 'L3'],
  ['E15 an archive with no games list is an empty season', "const games = Array.isArray(j?.games) ? j.games : null", "const games = Array.isArray(j?.games) ? j.games : []", 'W4'],
  ['E16 a missing season year is not noticed', "if (!Number.isInteger(season)) return { ok: false, why: 'the standings carry no season year, so the archive window is unknown' }", "", 'W3'],
  ['E17 FPL stops gating unseen clubs in live()', "why: fp.state === 'ok' ? 'FPL listed no teams' : `FPL ${fp.state}: ${fp.why}`, gatesUnseen: true }", "why: fp.state === 'ok' ? 'FPL listed no teams' : `FPL ${fp.state}: ${fp.why}`, gatesUnseen: false }", 'W5'],
  ['E18 the league size drifts from twenty', "export const EXPECTED_CLUBS = 20", "export const EXPECTED_CLUBS = 19", 'C1'],
  ['E20 main exits 0 whatever the verdict', "  return exitFor(m.verdict)\n}", "  return 0\n}", 'X2'],
  ['E21 a missing resolver exits 0', "Nothing was compared.`)\n    return 2", "Nothing was compared.`)\n    return 0", 'X4'],
  ['E22 the standings are read from another league', "`${relay}/espn-standings/soccer/eng.1/standings`", "`${relay}/espn-standings/soccer/eng.2/standings`", 'L1'],
  ['E23 the archive is read without the season', "archiveNames(ar.json, season)", "archiveNames(ar.json, null)", 'L1'],
  ['E24 pending without the games-played test', "a.ok && a.rows === 0 && a.total > 0 && played === 0", "a.ok && a.rows === 0 && a.total > 0", 'P2'],
  ['E25 an archive with no rows at all is pending', "a.ok && a.rows === 0 && a.total > 0 && played === 0", "a.ok && a.rows === 0 && played === 0", 'P4'],
  ['E26 a missing games-played figure counts as zero', "figures.length > 0 && figures.every(v => typeof v === 'number') ? figures.reduce((a, b) => a + b, 0) : null", "figures.reduce((a, b) => a + (b ?? 0), 0)", 'P3'],
  ['E27 a red run emits no annotation', "if (m.verdict !== 'covered' && env.GITHUB_ACTIONS === 'true') for (const a of annotationsOf(m)) log(a)", "if (false) for (const a of annotationsOf(m)) log(a)", 'X2'],
  ['E28 the annotation cap is gone', "const shown = msgs.slice(0, ANNOTATION_CAP - 1)", "const shown = msgs.slice(0, 99)", 'X6'],
  ['E29 an annotation is not escaped', "::${escapeAnnotationData(t)}`)", "::${t}`)", 'X7'],
  ['E30 the step summary is not written', "if (summary) summary(", "if (false) summary(", 'X5'],
  ['E31 a pending feed is printed as not measured', "v.state === 'pending' ? `${id} PENDING (${v.why})` : ", "", 'P1b'],
  ['E19 an unparseable body is read as present', "catch { return { state: 'unparseable', why: 'the body is not JSON' } }", "catch { return { state: 'ok', json: {} } }", 'L4'],
]

// Resolved: a copy reached through a symlinked $TMPDIR is not the entry point of its own file, so its
// isMain block would be skipped and every mutation would read as NOT CAUGHT (scripts/mutate-copy-check.mjs, clause 1).
const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'mutate-epl-alias-coverage-')))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
const COPY = join(TMP, F)
const ORIG = readFileSync(F, 'utf8')

if (!run(COPY).pass) { console.log(`FAIL — the UNMUTATED copy of ${F} is red`); process.exit(1) }
console.log('positive control: the unmutated copy passes\n')

let failed = 0
for (const [name, from, to, expect] of MUTATIONS) {
  const n = ORIG.split(from).length - 1
  if (n !== 1) { console.log(`FAIL  ${name}: anchor found ${n} times, must be exactly once — nothing mutated`); failed++; continue }
  const mutated = ORIG.replace(from, to)
  if (mutated === ORIG) { console.log(`FAIL  ${name}: replacement changed nothing`); failed++; continue }
  writeFileSync(COPY, mutated)
  const r = run(COPY)
  const named = new RegExp(`^FAIL  ${expect} `, 'm').test(r.out)
  if (r.pass) { console.log(`FAIL  ${name}: NOT CAUGHT`); failed++ }
  else if (!named) { console.log(`FAIL  ${name}: red, but not by ${expect}`); failed++ }
  else console.log(`ok    ${name}: caught by ${expect}`)
  writeFileSync(COPY, ORIG)
}
console.log(`\n${MUTATIONS.length - failed} of ${MUTATIONS.length} mutations caught, each by its named check`)
process.exit(failed ? 1 : 0)
