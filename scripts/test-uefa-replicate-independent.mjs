// Test of scripts/uefa-replicate-independent.mjs: the two known answers, the committed synthetic fixtures,
// the verdict table, and a set of mutations that must each turn at least one check red (a check that has
// only ever passed has proven nothing). Run: node scripts/test-uefa-replicate-independent.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { C, COMPETITIONS, forecastsOf, paired, homeWinSlope, verdictOf, scoreLook } from './uefa-replicate-independent.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const TOL = 1e-9
const ALIASES = { 'Paris Saint-Germain': 'PSG', 'SC Freiburg': 'Freiburg', 'Crystal Palace': 'C Palace', 'Rayo Vallecano': 'Rayo', 'Man United': 'Man Utd', 'Ararat': 'Ararat-Armenia' }
const alias = n => (Object.prototype.hasOwnProperty.call(ALIASES, n) ? ALIASES[n] : n)
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const aliasRows = rows => rows.map(r => ({ ...r, home: alias(r.home), away: alias(r.away) }))

let failed = 0
const maxdiff = {}
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`) }
const track = (group, key, a, b) => {
  const d = (a === null || b === null) ? (a === b ? 0 : Infinity) : Math.abs(a - b)
  const k = group + ' ' + key
  maxdiff[k] = Math.max(maxdiff[k] ?? 0, Number.isNaN(d) ? Infinity : d)
  return d
}
const sameNum = (a, b) => (a === null || b === null || a === undefined || b === undefined ? a == b : Math.abs(a - b) <= TOL)

// ---- A. known answer: the frozen 2026-27 bundle as ONE set (alias map applied) ----
function knownA() {
  const rows = aliasRows(readJson('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json').rows)
  const p = paired(forecastsOf(rows))
  const want = { n: 90, brierU: 0.6444168130366863, brierBase: 0.6285338593030909, meanD: 0.015882953733595384, z: 0.4780692703377383 }
  for (const k of Object.keys(want)) {
    const d = track('A', k, p[k], want[k])
    check(`A ${k} = ${want[k]}`, d <= TOL, `got ${p[k]} diff ${d}`)
  }
  return p
}

// ---- B. known answer: the 2025-26 rows give 234 eligible forecasts with outcome counts 122 / 43 / 69 ----
function knownB() {
  const rows = aliasRows(readJson('outbox/forecast-uefa-data-2025-26-2026-11-27.json').rows)
  const f = forecastsOf(rows)
  const counts = [0, 0, 0]
  for (const x of f) counts[x.y]++
  check('B n = 234', f.length === 234, `got ${f.length}`)
  check('B outcome counts = 122,43,69', counts.join() === '122,43,69', `got ${counts.join()}`)
  return f
}

// ---- fixtures ----
function fixtureCompare(label, got, exp) {
  const scal = ['n', 'brierU', 'brierBase', 'meanD', 'sdD', 'z', 'slope', 'slopeSE']
  for (const k of scal) { const d = track('fixture', k, got[k], exp[k]); check(`${label} ${k}`, sameNum(got[k], exp[k]), `got ${got[k]} want ${exp[k]} diff ${d}`) }
  check(`${label} verdict`, got.verdict === exp.verdict, `got ${got.verdict} want ${exp.verdict}`)
  check(`${label} folds length`, got.folds.length === exp.folds.length)
  exp.folds.forEach((f, i) => {
    const g = got.folds[i]
    check(`${label} fold ${i} name`, g && g.name === f.name)
    track('fixture', 'fold n', g.n, f.n); track('fixture', 'fold z', g.z, f.z)
    check(`${label} fold ${i} n,z`, g.n === f.n && sameNum(g.z, f.z), `got n ${g.n} z ${g.z} want n ${f.n} z ${f.z}`)
  })
}
function fixtures() {
  const out = {}
  for (const name of fs.readdirSync(path.join(root, 'outbox')).filter(n => /^uefa-replication-synthetic-look1-.*\.json$/.test(n)).sort()) {
    const fx = readJson('outbox/' + name)
    out[name] = scoreLook(1, fx.bundle.rows)
    fixtureCompare(name, out[name], fx.expected)
  }
  const f2 = readJson('outbox/uefa-replication-synthetic-look2.json')
  const l1 = readJson(f2.look1Fixture)
  out.look2 = scoreLook(2, l1.bundle.rows, f2.bundle26.rows)
  fixtureCompare('look2', out.look2, f2.expected)
  return out
}

// ---- the CLI: stdout is exactly one JSON object and equals the library result ----
function cli() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uefa-indep-'))
  try {
    const f2 = readJson('outbox/uefa-replication-synthetic-look2.json')
    const l1 = readJson(f2.look1Fixture)
    const p24 = path.join(tmp, 'b24.json'), p26 = path.join(tmp, 'b26.json')
    fs.writeFileSync(p24, JSON.stringify(l1.bundle)); fs.writeFileSync(p26, JSON.stringify(f2.bundle26))
    const script = path.join(here, 'uefa-replicate-independent.mjs')
    const r1 = spawnSync(process.execPath, [script, '--look', '1', '--bundle24', p24], { encoding: 'utf8' })
    const r2 = spawnSync(process.execPath, [script, '--look', '2', '--bundle24', p24, '--bundle26', p26], { encoding: 'utf8' })
    for (const [label, r, exp] of [['cli look1', r1, l1.expected], ['cli look2', r2, f2.expected]]) {
      let o = null
      try { o = JSON.parse(r.stdout) } catch { /* reported below */ }
      check(`${label} exit 0 and stdout is one JSON object`, r.status === 0 && o !== null && typeof o === 'object' && r.stdout.trim().split('\n').length === 1 && r.stdout.endsWith('\n'))
      if (o) {
        check(`${label} keys`, Object.keys(o).join() === 'look,n,brierU,brierBase,meanD,sdD,z,folds,slope,slopeSE,verdict', Object.keys(o).join())
        check(`${label} equals expected`, o.n === exp.n && sameNum(o.z, exp.z) && o.verdict === exp.verdict && sameNum(o.slope, exp.slope))
      }
    }
    const bad = spawnSync(process.execPath, [script, '--look', '2', '--bundle24', p24], { encoding: 'utf8' })
    check('cli look 2 without bundle26 exits non-zero with empty stdout', bad.status !== 0 && bad.stdout === '')
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

// ---- the verdict table, rows 2 to 4 ----
function verdictTable() {
  const folds = (zs = [0.5, 0.5, 0.5]) => COMPETITIONS.map((name, i) => ({ name, n: 90, z: zs[i] }))
  const ok = { slope: 1.1, slopeSE: 0.2 }
  const cases = [
    ['row 2: z NaN -> NO VERDICT', 1, { z: NaN, folds: folds(), ...ok }, 'NO VERDICT'],
    ['row 2: z Infinity -> NO VERDICT', 2, { z: -Infinity, folds: folds(), ...ok }, 'NO VERDICT'],
    ['row 3 look 1: z just above z1 -> CONTINUE', 1, { z: C.z1 + 1e-9, folds: folds(), ...ok }, 'CONTINUE TO LOOK 2'],
    ['row 3 look 1: z = z1 goes to row 4 -> BUILD', 1, { z: C.z1, folds: folds(), ...ok }, 'BUILD'],
    ['row 3 look 2: z just above z2 -> DO NOT BUILD', 2, { z: C.z2 + 1e-9, folds: folds(), ...ok }, 'DO NOT BUILD'],
    ['row 3 look 2: z = z2 -> BUILD', 2, { z: C.z2, folds: folds(), ...ok }, 'BUILD'],
    ['row 3 look 2 uses z2, not z1: z -2.0 builds', 2, { z: -2.0, folds: folds(), ...ok }, 'BUILD'],
    ['row 3 look 1 uses z1, not z2: z -2.0 continues', 1, { z: -2.0, folds: folds(), ...ok }, 'CONTINUE TO LOOK 2'],
    ['row 4 G1: a fold z 1.0 passes', 1, { z: -3, folds: folds([1.0, 0, 0]), ...ok }, 'BUILD'],
    ['row 4 G1: a fold z 1.0000001 fails', 1, { z: -3, folds: folds([0, 1.0000001, 0]), ...ok }, 'DO NOT BUILD'],
    ['row 4 G1: a non-finite fold z fails', 1, { z: -3, folds: folds([0, 0, NaN]), ...ok }, 'DO NOT BUILD'],
    ['row 4 G2: slope exactly 1.96 SE from 1 passes', 1, { z: -3, folds: folds(), slope: 1 + 1.96 * 0.2, slopeSE: 0.2 }, 'BUILD'],
    ['row 4 G2: slope beyond 1.96 SE fails', 1, { z: -3, folds: folds(), slope: 1 + 1.96 * 0.2 + 1e-6, slopeSE: 0.2 }, 'DO NOT BUILD'],
    ['row 4 G2: slope below 1 beyond 1.96 SE fails', 2, { z: -3, folds: folds(), slope: 1 - 1.96 * 0.2 - 1e-6, slopeSE: 0.2 }, 'DO NOT BUILD'],
    ['row 4 G2: non-finite slope fails', 1, { z: -3, folds: folds(), slope: NaN, slopeSE: NaN }, 'DO NOT BUILD'],
    ['row 4 G2: slope SE 0 fails', 1, { z: -3, folds: folds(), slope: 1, slopeSE: 0 }, 'DO NOT BUILD'],
  ]
  for (const [label, look, m, want] of cases) { const got = verdictOf(look, m); check(`verdict ${label}`, got === want, `got ${got}`) }
}

// ---- Newton slope: against a case with a known answer (a perfectly calibrated sample has slope near 1) and
// non-convergence (separable data) ----
function slopeUnits() {
  // deterministic sample from a logistic model with slope 1 (a fixed low-discrepancy sequence, no RNG)
  const fcs = []
  for (let i = 0; i < 4000; i++) {
    const u = (i * 0.6180339887498949) % 1, v = (i * 0.7548776662466927) % 1
    const eta = -2 + 4 * u, p = 1 / (1 + Math.exp(-eta))
    fcs.push({ pU: [p, 0.18, 1 - p - 0.18 > 0 ? 1 - p - 0.18 : 0.01], y: v < p ? 0 : 1 })
  }
  const g = homeWinSlope(fcs)
  check('slope unit: slope near 1 on data generated with slope 1', Number.isFinite(g.slope) && Math.abs(g.slope - 1) < 0.1 && g.slopeSE > 0, `slope ${g.slope} se ${g.slopeSE}`)
  const sep = [0.1, 0.2, 0.3, 0.6, 0.7, 0.8].map((p, i) => ({ pU: [p, 0.18, 0.02], y: i < 3 ? 1 : 0 }))
  const s = homeWinSlope(sep)
  check('slope unit: perfectly separable data is non-convergent (NaN, NaN)', Number.isNaN(s.slope) && Number.isNaN(s.slopeSE), `got ${s.slope} ${s.slopeSE}`)
}

// ---- mutations: break one thing in a copy of the pipeline and require that at least one known-answer or
// fixture value moves by more than TOL. The mutation is applied through a parameter of the check, not by
// editing the module, and asserts that it did apply. ----
function mutations(base) {
  const rowsA = aliasRows(readJson('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json').rows)
  const want = 0.4780692703377383
  const run = (label, fn) => {
    const z = fn()
    check(`mutation ${label} is caught (z moves off ${want})`, !(Math.abs(z - want) <= TOL), `mutant z ${z}`)
  }
  const rawA = readJson('outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json').rows
  const withCfg = o => paired(forecastsOf(rowsA, { ...C, ...o })).z
  run('K = 2', () => withCfg({ K: 2 }))
  run('home 1.35', () => withCfg({ home: 1.35 }))
  run('scale 1.98', () => withCfg({ scale: 1.98 }))
  run('share 0.19', () => withCfg({ share: 0.19 }))
  run('gd weight 0.26', () => withCfg({ weightGd: 0.26 }))
  run('gf weight 0.11', () => withCfg({ weightGf: 0.11 }))
  // N cannot be exercised by the frozen bundle (no club has played more than 5 matches in it); a full season can
  const full = readJson('outbox/uefa-replication-synthetic-look1-b-moderate.json').bundle.rows
  const nN = forecastsOf(full, { ...C, N: { ...C.N, 'UEFA Champions League': 7 } }).length
  check('mutation N 7 for the Champions League is caught on a full season (n moves off 234)', forecastsOf(full).length === 234 && nN !== 234, `mutant n ${nN}`)
  run('no alias map (clubs split by spelling)', () => paired(forecastsOf(rawA)).z)
  // swapping home and away scores changes every outcome
  run('home and away scores swapped', () => paired(forecastsOf(rowsA.map(r => ({ ...r, home_score: r.away_score, away_score: r.home_score })))).z)
  // reversing the order of two events of the same club: shuffle dates (ratings use the wrong "before")
  run('dates reversed (ratings from the wrong matches)', () => { const ds = [...new Set(rowsA.map(r => r.date))].sort(); const m = new Map(ds.map((d, i) => [d, ds[ds.length - 1 - i]])); return paired(forecastsOf(rowsA.map(r => ({ ...r, date: m.get(r.date) })))).z })
  // a row dropped
  run('first row dropped', () => paired(forecastsOf(rowsA.slice(1))).z)
  // Look 2: scoring the frozen matches too (no forward cut) must move n off 378, and the forward rows alone (frozen not
  // used as rating inputs) must give no forecasts
  const f2 = readJson('outbox/uefa-replication-synthetic-look2.json')
  const l1 = readJson(f2.look1Fixture)
  const r26 = f2.bundle26.rows
  check('mutation look 2 without the forward cut is caught (234 eligible 2026-27 forecasts, not 144)', forecastsOf(r26).length === 234 && forecastsOf(r26).filter(f => f.date >= C.forwardFrom).length === 144)
  check('mutation look 2 without frozen rating inputs is caught (forward rows alone give 0 forecasts)', forecastsOf(r26.filter(r => r.date >= C.forwardFrom)).length === 0)
  const pooled = scoreLook(2, l1.bundle.rows, r26), l1only = scoreLook(1, l1.bundle.rows)
  check('mutation look 2 pooled set differs from the Look 1 set alone (n 378 vs 234)', pooled.n === 378 && l1only.n === 234)
  void base
}

const a = knownA()
knownB()
const fx = fixtures()
cli()
verdictTable()
slopeUnits()
mutations(a)

// ---- Rule 91: say the coverage ----
console.log('\nlargest absolute difference per quantity:')
for (const [k, v] of Object.entries(maxdiff)) console.log(`  ${k}: ${v}`)
console.log(`fixtures checked: ${Object.keys(fx).length} (look1 a-d and look2); known answers: A (5 quantities) and B (2 checks)`)
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
