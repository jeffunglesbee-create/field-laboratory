#!/usr/bin/env node
// Do the two small checks of Task 4, Step 1 refuse when their input is wrong? (Rule 90)
//
//   node outbox/venue-review-counts-mutations-2026-11-12.mjs
//
// Part A runs outbox/venue-review-population-2026-11-12.mjs against doctored git histories made in a temporary
// repository. Part B runs outbox/venue-review-counts-recompute-2026-11-12.mjs against doctored copies of the record and
// of the rows file. Each doctored case must be refused (exit 1) with the named message; each control, an unedited input,
// must not be. A case whose doctoring changed nothing is reported BROKEN, not as a pass. The main script's own
// 51-case self-test is `node outbox/venue-review-counts-2026-11-12.mjs selftest ...`.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rel = p => path.join(ROOT, p)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-review-mut-'))
const once = (s, a, b) => { if (s.split(a).length !== 2) throw new Error('anchor not unique or missing: ' + String(a).slice(0, 80)); return s.replace(a, () => b) }
let total = 0, bad = 0

function run(part, name, args, cwd, want) {
  total++
  const p = spawnSync('node', args, { cwd, encoding: 'utf8' })
  const ok = want === null ? p.status === 0 : (p.status === 1 && p.stderr.includes(want))
  const shown = (want === null ? p.stdout.split('\n').filter(Boolean).slice(-3, -2)[0] || p.stdout.split('\n')[0] : p.stderr.split('\n').filter(l => l.startsWith('refused')).join(' ')).slice(0, 150)
  console.log(`${ok ? 'ok     ' : 'WRONG  '} [${part}] ${name}\n          exit ${p.status}: ${shown}`)
  if (!ok) bad++
}
const broken = (part, name) => { total++; bad++; console.log(`BROKEN  [${part}] ${name}: the doctoring changed nothing`) }

// ---- Part A: the population recount, against doctored git histories ----
{
  const repo = path.join(TMP, 'repo'); fs.mkdirSync(path.join(repo, 'outbox'), { recursive: true }); fs.mkdirSync(path.join(repo, 'src'))
  const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-C', repo, ...a], { encoding: 'utf8' })
  const RES = 'outbox/venue-source-results-latest.json', FSF = 'src/Venues.fs'
  const res0 = fs.readFileSync(rel(RES), 'utf8'), fs0 = fs.readFileSync(rel(FSF), 'utf8')
  const commit = (r, f, m) => { fs.writeFileSync(path.join(repo, RES), r); fs.writeFileSync(path.join(repo, FSF), f); g('add', '-A'); g('commit', '-q', '--allow-empty', '-m', m); return g('rev-parse', '--short', 'HEAD').trim() }
  g('init', '-q', '-b', 'main')
  const A = commit(res0, fs0, 'A clean')
  const firstRow = fs0.split('\n').find(l => /^\s*at "/.test(l))
  const json = () => JSON.parse(res0)
  const cases = [
    ['control: a clean copy (must not be refused)', res0, fs0, null],
    ['a review name twice', (() => { const o = json(); o.review.push({ ...o.review[0] }); return JSON.stringify(o) })(), fs0, 'a name is on the review list twice'],
    ['a review entry with an empty name', (() => { const o = json(); o.review[0].name = ''; return JSON.stringify(o) })(), fs0, 'a review entry has no name'],
    ['a table row twice', res0, once(fs0, firstRow, firstRow + '\n' + firstRow), 'a venue name is a row twice'],
    ['a row line with no closing quote', res0, once(fs0, firstRow, firstRow + '\n  at "Broken name'), 'a row line does not parse'],
  ]
  for (const [name, r, f, want] of cases) {
    if (want !== null && r === res0 && f === fs0) { broken('A', name); continue }
    const B = commit(r, f, name)
    run('A', name, [rel('outbox/venue-review-population-2026-11-12.mjs'), A, B], repo, want)
  }
}

// ---- Part B: the recompute, against doctored copies of the record and the rows ----
{
  const MD = fs.readFileSync(rel('outbox/venue-review-counts-2026-11-12.md'), 'utf8')
  const ROWS = fs.readFileSync(rel('outbox/venue-review-counts-rows-2026-11-12.json'), 'utf8')
  const vare = /\| 71 \| Vare Areena TN[^\n]*\n/.exec(MD)
  if (!vare) throw new Error('the Vare Areena TN row is not in the record')
  const cases = [
    ['control: the unedited record and rows (must not be refused)', MD, ROWS, null],
    ['headline: games at the 71 one too high', once(MD, '**283 games on 261 venue-days**', '**284 games on 261 venue-days**'), ROWS, 'games at the 71: recomputed 283, the record says 284'],
    ['headline: the share of the window', once(MD, "5.8% of the window's games", "5.9% of the window's games"), ROWS, 'share of the window: recomputed 5.8, the record says 5.9'],
    ['a band row: games', once(MD, '| 5 to 9 days | 22 | 139 |', '| 5 to 9 days | 22 | 140 |'), ROWS, '5 to 9 days: games: recomputed 139, the record says 140'],
    ['a reason row: venue-days', once(MD, '| ambiguous name | 8 | 25 | 25 |', '| ambiguous name | 8 | 25 | 26 |'), ROWS, 'ambiguous name: venue-days: recomputed 25, the record says 26'],
    ['a table row: days', once(MD, '| 1 | Nu Stadium | MLS | Miami (+1 more) | 30 | 20 |', '| 1 | Nu Stadium | MLS | Miami (+1 more) | 30 | 21 |'), ROWS, 'Nu Stadium: days: recomputed 20, the record says 21'],
    ['a table row: last date', once(MD, vare[0], vare[0].replace('| 2026-08-27 | 2026-08-27 |', '| 2026-08-27 | 2026-08-28 |')), ROWS, 'Vare Areena TN: last: recomputed 2026-08-27, the record says 2026-08-28'],
    ['a table row deleted', once(MD, vare[0], ''), ROWS, 'rows in the table of the 71: recomputed 71, the record says 70'],
    ['a table row names another venue', once(MD, '| 2 | Olimpico |', '| 2 | Olympia |'), ROWS, 'Olympia: games: recomputed 2, the record says 13'],
    ['a row of the table of the 4: first date', once(MD, '| Manadon Sports Hub | FA Cup | Plymouth | 1 | 1 | 2026-11-09 |', '| Manadon Sports Hub | FA Cup | Plymouth | 1 | 1 | 2026-11-08 |'), ROWS, 'Manadon Sports Hub: first: recomputed 2026-11-09, the record says 2026-11-08'],
    ['the rows file: a venue one game higher', MD, once(ROWS, '["venue", 40, 30, 30, 20, 2, 28,', '["venue", 40, 31, 30, 20, 2, 28,'), 'games at the 71: recomputed 284, the record says 283'],
    ['the rows file: the statement hash altered', MD, once(ROWS, 'a7f0627d77a8594f1f7517e9ed3f46b0a753b8bc24770049b3b49d30836f429b', 'b7f0627d77a8594f1f7517e9ed3f46b0a753b8bc24770049b3b49d30836f429b'), 'the statement printed now hashes to a7f0627d'],
  ]
  let n = 0
  for (const [name, md, rows, want] of cases) {
    n++
    if (want !== null && md === MD && rows === ROWS) { broken('B', name); continue }
    const m = path.join(TMP, `b${n}.md`), r = path.join(TMP, `b${n}.json`)
    fs.writeFileSync(m, md); fs.writeFileSync(r, rows)
    run('B', name, [rel('outbox/venue-review-counts-recompute-2026-11-12.mjs'), m, r], ROOT, want)
  }
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log('')
console.log(`${total - bad} of ${total} cases as wanted; ${bad} problem(s)`)
console.log('coverage: part A, 4 doctored histories and 1 control for the population recount (5); part B, 11 doctored inputs and 1 control for the recompute (12).')
console.log('NOT exercised here: in the recount, a missing file or an unknown commit (git itself refuses); in the recompute, a section heading moved, a hold reason it does not know, a review name missing from the results file, and the membership read of src/Venues.fs. Those refusals exist and have not been made to fail.')
process.exit(bad ? 1 : 0)
