#!/usr/bin/env node
// Rule 90 for the measuring apparatus: the self-test of scripts/font-dependence-probe.mjs must go red when the comparison, the verdict or the premises are broken. Each mutation
// is applied to a COPY of scripts/, its anchor asserted to occur exactly once and to have changed the file, and the copy's self-test is run. A mutation the self-test does not
// catch is printed NOT CAUGHT and the script exits 1. Run from the repository root:  node outbox/font-probe-sweep-2026-11-11.mjs
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = 'font-dependence-probe.mjs'
const MUTATIONS = [
  ['an element count that moves is not a geometry difference', "if (a.n !== b.n) geometry.push('elementCount')", ''],
  ['a scroll width that moves is not seen', 'if (a.scrollWidth !== b.scrollWidth || a.scrollHeight !== b.scrollHeight)', 'if (a.scrollHeight !== b.scrollHeight)'],
  ['a scroll height that moves is not seen', 'if (a.scrollWidth !== b.scrollWidth || a.scrollHeight !== b.scrollHeight)', 'if (a.scrollWidth !== b.scrollWidth)'],
  ['a 1 px box change is tolerated', 'if (d > 0) { maxDelta = Math.max(maxDelta, d)', 'if (d > 1) { maxDelta = Math.max(maxDelta, d)'],
  ['box differences are measured and not reported', "if (maxDelta > 0) geometry.push('boxes')", ''],
  ['font usage differences are not seen', 'fontsDiffer: fa !== fb', 'fontsDiffer: false'],
  ['a pixel difference is not counted', 'pixelsDiffer: a.shotSha !== b.shotSha', 'pixelsDiffer: false'],
  ['runs of different cells are compared', 'if (ids(A) !== ids(B)) throw', 'if (false) throw'],
  ['a failed apt install still gets a verdict', "if (apt !== 'ok') return", 'if (false) return'],
  ['a control that differs is tolerated', 'if (control.geometryDiffer > 0) return', 'if (control.geometryDiffer > 5) return'],
  ['teeth that miss most cells are tolerated', 'if (teeth.geometryDiffer < teeth.checked) return', 'if (teeth.geometryDiffer < 1) return'],
  ['an invisible treatment still gets a verdict', 'if (visible && visible.changed.length < NEEDED_VISIBLE) return', 'if (false) return'],
  ['the visibility threshold is zero', 'visible.changed.length < NEEDED_VISIBLE', 'visible.changed.length < 0'],
  ['a new font that drew glyphs does not count', 'if (treatment.geometryDiffer === 0 && used.length === 0) {', 'if (treatment.geometryDiffer === 0) {'],
  ['geometry that moved does not count', 'if (treatment.geometryDiffer === 0 && used.length === 0) {', 'if (used.length === 0) {'],
  ['a shim call is not a failed premise', 'n(a.shim_calls) === 0,', 'n(a.shim_calls) !== null,'],
  ['a library not found is not a failed premise', 'n(a.ldd_not_found_total) === 0 && n(a.browser_binaries) >= 1', 'n(a.browser_binaries) >= 1'],
  ['no browser binary at all is a held premise', 'n(a.ldd_not_found_total) === 0 && n(a.browser_binaries) >= 1', 'n(a.ldd_not_found_total) === 0'],
  ['the install limit is 30 minutes', 'n(sec.install_seconds) <= INSTALL_LIMIT_SECONDS', 'n(sec.install_seconds) <= 1800'],
  ['a runner that already had a font still passes', 'n(b.nine_fonts_installed) === 0,', 'n(b.nine_fonts_installed) !== null,'],
  ['a timeout that exits 0 is a held premise', 'n(t[`${k}_exit`]) !== null && n(t[`${k}_exit`]) !== 0 && ', 'n(t[`${k}_exit`]) !== null && '],
  ['a timeout that leaves survivors is a held premise', 'n(t[`${k}_survivors`]) === 0,', 'n(t[`${k}_survivors`]) !== null,'],
  ['a timeout that takes a minute is a held premise', 'n(t[`${k}_seconds`]) <= TIMEOUT_TEST_SECONDS + 3', 'n(t[`${k}_seconds`]) <= 60'],
  ['a rewritten apt lists directory is not a failed premise', ' && b.apt_lists_sha === a.apt_lists_sha,', ','],
  ['a changed package list is not a failed premise', 'b.dpkg_list_sha === a.dpkg_list_sha && ', ''],
  ['a family drawn the same before and after counts as visible', 'JSON.stringify([...a[f]].sort()) !== JSON.stringify([...b[f]].sort())', 'true'],
  ['a family missing from a run counts as visible', 'a?.[f] !== undefined && b?.[f] !== undefined && ', ''],
  ['the first printed line shows the denominator as the numerator', '`checked ${list.length} of ${list.length} premises: ${held} held`', '`checked ${held} of ${held} premises: ${held} held`'],
  ['a treatment that did not run prints as a clean one', "treatment NOT RUN (0 of 0 cells compared)", "treatment 0 differ in geometry"],
]

const here = new URL('..', import.meta.url).pathname
const run = dir => spawnSync(process.execPath, [join(dir, 'scripts', FILE), '--self-test'], { encoding: 'utf8', cwd: here, maxBuffer: 64 * 1024 * 1024 })
const fails = out => (out.match(/^FAIL .*$/gm) ?? []).length
const clean = run(here)
console.log(`unmutated: exit ${clean.status}, ${fails(clean.stdout)} failing check(s), ${(clean.stdout.match(/(\d+)\/(\d+) checks passed/) ?? [])[0] ?? 'no summary'}`)
if (clean.status !== 0) { console.log('the unmutated self-test is not green: nothing to sweep'); process.exit(1) }
{
  const dir = mkdtempSync(join(tmpdir(), 'fpsweep-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  symlinkSync(join(here, 'node_modules'), join(dir, 'node_modules'))
  const r = run(dir)
  rmSync(dir, { recursive: true, force: true })
  console.log(`unmutated copy: exit ${r.status}, ${(r.stdout.match(/(\d+)\/(\d+) checks passed/) ?? [])[0] ?? 'no summary'}`)
  if (r.status !== 0) { console.log('the unmutated COPY does not run green, so a mutation here would be judged by a crash: stop'); process.exit(1) }
}
let caught = 0
const survivors = []
for (const [name, from, to] of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'fpsweep-'))
  cpSync(join(here, 'scripts'), join(dir, 'scripts'), { recursive: true })
  symlinkSync(join(here, 'node_modules'), join(dir, 'node_modules')) // the probe imports playwright; a copy without it crashes instead of failing a check
  const f = join(dir, 'scripts', FILE)
  const src = readFileSync(f, 'utf8')
  const n = src.split(from).length - 1
  if (n !== 1) { console.log(`ANCHOR  ${name}: the anchor occurs ${n} times, not once`); process.exit(1) }
  const out = src.replace(from, () => to)
  if (out === src) { console.log(`NOOP    ${name}: the mutation changed nothing`); process.exit(1) }
  writeFileSync(f, out)
  const r = run(dir)
  const failed = fails(r.stdout)
  const ok = r.status !== 0 && failed > 0
  if (ok) caught++
  else survivors.push(name)
  console.log(`${ok ? 'CAUGHT    ' : 'NOT CAUGHT'}  ${name}  (exit ${r.status}, ${failed} failing: ${(r.stdout.match(/^FAIL .*$/gm) ?? []).slice(0, 1).map(l => l.slice(5, 80)).join('')})`)
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\ncaught ${caught} of ${MUTATIONS.length} mutations${survivors.length ? `; survivors: ${survivors.join('; ')}` : ''}`)
process.exit(caught === MUTATIONS.length ? 0 : 1)
