// INDEPENDENT implementation of the scoring rule in the RULE block of
// outbox/forecast-replicate-uefa-2026-11-28.mjs (version 3), written from that text alone.
// It computes: the candidate U's forecasts, the frozen base-rate benchmark, the paired statistic, the
// three per-competition cells (G1), the home-win slope (G2) and the verdict rows 2 to 4. It does NOT do
// G3, stops, repairs or the gate (the bundle is assumed to have passed them).
//
//   node scripts/uefa-replicate-independent.mjs --look 1 --bundle24 <bundle.json>
//   node scripts/uefa-replicate-independent.mjs --look 2 --bundle24 <bundle.json> --bundle26 <bundle.json>
//
// stdout is exactly one JSON object. A non-finite number (z with n < 2 or sd 0, a slope that did not converge)
// is printed as JSON null, because JSON has no NaN. Errors go to stderr with exit code 3.
import fs from 'node:fs'
import path from 'node:path'

// ---- constants, as printed in the rule text (never fitted, never rounded) ----
export const C = Object.freeze({
  home: 1.34, scale: 1.97, share: 0.18,
  weightGd: 0.25, weightGf: 0.10,
  K: 3,
  N: { 'UEFA Champions League': 8, 'UEFA Europa League': 8, 'UEFA Europa Conference League': 6 },
  baseCounts: [122, 43, 69], baseN: 234,
  z1: -2.241402728, z2: -1.780464342,
  foldMaxZ: 1.0, slopeSigma: 1.96, slopeStepTol: 1e-12, slopeMaxIter: 100,
  forwardFrom: '2026-11-27', frozenThrough: '2026-11-26',
})
export const COMPETITIONS = Object.keys(C.N)

// ---- ordering: (date, Date.parse(start_time), Number(espn_event_id)). A value that is not a number sorts last
// within its tier (the rule has no text for it: a bundle that passed G3 has none). ----
const num = v => { const x = typeof v === 'number' ? v : Number(v); return Number.isNaN(x) ? Infinity : x }
function compareKeys(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.t !== b.t) return a.t < b.t ? -1 : 1
  if (a.eid !== b.eid) return a.eid < b.eid ? -1 : 1
  return 0
}
const keyOf = r => ({ date: r.date, t: num(Date.parse(r.start_time)), eid: num(r.espn_event_id) })

// ---- candidate U: forecasts of every eligible league-phase match of the rows given (one season) ----
// rows: bundle rows, club identifiers already final (a club is its id). Returns the eligible forecasts in
// (date, start, event id) order; each: { sport, date, key, y, pU: [home, draw, away] }.
export function forecastsOf(rows, cfg = C) {   // cfg exists only so a test can mutate a constant; the command line never passes it
  const out = []
  for (const sport of COMPETITIONS) {
    const N = cfg.N[sport]
    const events = rows.filter(r => r.sport === sport).map(r => ({ r, k: keyOf(r) })).sort((a, b) => compareKeys(a.k, b.k))
    const played = new Map()   // club -> events played before (any event of this competition's rows)
    const stats = new Map()    // club -> scored league-phase matches before: { g, pts, gf, ga }
    const get = c => stats.get(c) || { g: 0, pts: 0, gf: 0, ga: 0 }
    for (const { r, k } of events) {
      const ph = played.get(r.home) || 0, pa = played.get(r.away) || 0
      const league = ph < N && pa < N
      const scored = Number.isFinite(r.home_score) && Number.isFinite(r.away_score) && typeof r.home_score === 'number' && typeof r.away_score === 'number'
      if (league) {
        const sh = get(r.home), sa = get(r.away)
        if (scored && sh.g >= cfg.K && sa.g >= cfg.K) {
          const rating = s => s.pts / s.g + cfg.weightGd * ((s.gf - s.ga) / s.g) + cfg.weightGf * (s.gf / s.g)
          const d = rating(sh) - rating(sa) + cfg.home
          const pDraw = cfg.share
          const pHome = (1 - cfg.share) * (1 / (1 + Math.exp(-(d / cfg.scale))))
          const pAway = 1 - pDraw - pHome
          const y = r.home_score > r.away_score ? 0 : r.home_score === r.away_score ? 1 : 2
          out.push({ sport, date: r.date, key: k, y, pU: [pHome, pDraw, pAway] })
        }
        if (scored) {
          const upd = (c, gf, ga) => {
            const s = get(c)
            stats.set(c, { g: s.g + 1, pts: s.pts + (gf > ga ? 3 : gf === ga ? 1 : 0), gf: s.gf + gf, ga: s.ga + ga })
          }
          upd(r.home, r.home_score, r.away_score)
          upd(r.away, r.away_score, r.home_score)
        }
      }
      played.set(r.home, ph + 1)
      played.set(r.away, pa + 1)
    }
  }
  return out.sort((a, b) => compareKeys(a.key, b.key))
}

// ---- the statistic ----
const brier = (p, y) => { let s = 0; for (let k = 0; k < 3; k++) { const e = p[k] - (k === y ? 1 : 0); s += e * e } return s }
export function paired(fcs) {
  const base = C.baseCounts.map(c => c / C.baseN)
  const n = fcs.length
  const bu = fcs.map(f => brier(f.pU, f.y)), bb = fcs.map(f => brier(base, f.y))
  const D = bu.map((v, i) => v - bb[i])
  const sum = a => { let s = 0; for (const v of a) s += v; return s }
  const mean = n > 0 ? sum(D) / n : NaN
  let sd = NaN
  if (n >= 2) { let ss = 0; for (const v of D) ss += (v - mean) * (v - mean); sd = Math.sqrt(ss / (n - 1)) }
  const z = mean / (sd / Math.sqrt(n))
  return { n, brierU: n > 0 ? sum(bu) / n : NaN, brierBase: n > 0 ? sum(bb) / n : NaN, meanD: mean, sdD: sd, z }
}

// ---- G2: logistic regression of "home win" on [1, logit(pHome)], Newton from (0, 1) ----
export function homeWinSlope(fcs) {
  const x = fcs.map(f => Math.log(f.pU[0] / (1 - f.pU[0])))
  const y = fcs.map(f => (f.y === 0 ? 1 : 0))
  const info = (b0, b1) => {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0
    for (let i = 0; i < x.length; i++) {
      const p = 1 / (1 + Math.exp(-(b0 + b1 * x[i]))), r = y[i] - p, w = p * (1 - p)
      g0 += r; g1 += r * x[i]; h00 += w; h01 += w * x[i]; h11 += w * x[i] * x[i]
    }
    return { g0, g1, h00, h01, h11, det: h00 * h11 - h01 * h01 }
  }
  const bad = { slope: NaN, slopeSE: NaN }
  let b0 = 0, b1 = 1
  for (let it = 1; it <= C.slopeMaxIter; it++) {
    const a = info(b0, b1)
    if (!Number.isFinite(a.det) || a.det === 0) return bad
    const s0 = (a.h11 * a.g0 - a.h01 * a.g1) / a.det
    const s1 = (a.h00 * a.g1 - a.h01 * a.g0) / a.det
    b0 += s0; b1 += s1
    if (!Number.isFinite(b0) || !Number.isFinite(b1)) return bad
    if (Math.hypot(s0, s1) < C.slopeStepTol) {
      const f = info(b0, b1)                       // observed information at the final point
      if (!Number.isFinite(f.det) || f.det === 0) return bad
      return { slope: b1, slopeSE: Math.sqrt(f.h00 / f.det) }   // inverse[1][1] = h00 / det
    }
  }
  return bad
}

// ---- verdict rows 2 to 4 (G3 assumed passed) ----
const fin = v => typeof v === 'number' && Number.isFinite(v)
export function verdictOf(look, m) {
  if (!fin(m.z)) return 'NO VERDICT'                                              // row 2
  const bound = look === 1 ? C.z1 : C.z2
  if (!(m.z <= bound)) return look === 1 ? 'CONTINUE TO LOOK 2' : 'DO NOT BUILD'   // row 3
  const names = m.folds.map(f => f.name)
  const g1 = names.length === 3 && COMPETITIONS.every(c => names.filter(x => x === c).length === 1) &&
    m.folds.every(f => fin(f.z) && f.z <= C.foldMaxZ)                             // row 4, G1
  const g2 = fin(m.slope) && fin(m.slopeSE) && m.slopeSE > 0 && Math.abs(m.slope - 1) <= C.slopeSigma * m.slopeSE   // row 4, G2
  return g1 && g2 ? 'BUILD' : 'DO NOT BUILD'
}

// ---- one look ----
export function scoreLook(look, bundle24Rows, bundle26Rows) {
  let fcs = forecastsOf(bundle24Rows)
  if (look === 2) {
    const fwd = forecastsOf(bundle26Rows).filter(f => f.date >= C.forwardFrom)   // frozen (<= frozenThrough) are inputs only
    fcs = fcs.concat(fwd)                                                         // Look 1 forecasts first, forward after
  }
  const t = paired(fcs)
  const folds = COMPETITIONS.map(name => { const p = paired(fcs.filter(f => f.sport === name)); return { name, n: p.n, z: p.z } })
  const { slope, slopeSE } = homeWinSlope(fcs)
  const verdict = verdictOf(look, { z: t.z, folds, slope, slopeSE })
  return { look, n: t.n, brierU: t.brierU, brierBase: t.brierBase, meanD: t.meanD, sdD: t.sdD, z: t.z, folds, slope, slopeSE, verdict }
}

// ---- command line ----
function readRows(p) {
  const b = JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'))
  if (b === null || typeof b !== 'object' || !Array.isArray(b.rows)) throw new Error(`${p}: not a bundle (no rows array)`)
  return b.rows
}
function main(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!/^--(look|bundle24|bundle26)$/.test(argv[i] || '') || argv[i + 1] === undefined) throw new Error(`bad argument ${argv[i]}`)
    a[argv[i].slice(2)] = argv[i + 1]
  }
  const look = Number(a.look)
  if (look !== 1 && look !== 2) throw new Error('--look must be 1 or 2')
  if (!a.bundle24) throw new Error('--bundle24 is required')
  if (look === 2 && !a.bundle26) throw new Error('--bundle26 is required at look 2')
  const r = scoreLook(look, readRows(a.bundle24), look === 2 ? readRows(a.bundle26) : null)
  process.stdout.write(JSON.stringify(r) + '\n')
}
if (process.argv[1] && decodeURIComponent(new URL(import.meta.url).pathname) === path.resolve(process.argv[1])) {
  try { main(process.argv.slice(2)) } catch (e) { process.stderr.write(String(e && e.message || e) + '\n'); process.exit(3) }
}
