// AN INDEPENDENT RECOMPUTE of outbox/forecast-fit-uefa-2026-11-27.txt (run 46071082308), written AFTER that run, as outbox/cc-session-2026-11-09-fit-c.md's "independent recompute" was.
// It changes no verdict and tests no new hypothesis: it recomputes the SAME pre-registered quantities from the same two committed bundles by a different route, so a defect in the tooling
// cannot have produced the verdict (a false DO NOT BUILD any more than a false BUILD). It imports NOTHING from the tooling: club histories are kept as lists, not running sums; the
// fit is a grid with repeated zooming, not Newton or a simplex; the slope is gradient ascent with a backtracking line search and its standard error comes from a numerical Hessian.
// The six spellings are listed again here from the data-only pass's output (names and dates), not read from the tooling.
//
//   node outbox/forecast-fit-uefa-recompute-2026-11-27.mjs outbox/forecast-uefa-data-2025-26-2026-11-27.json outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json outbox/forecast-fit-uefa-result-2026-11-27.json
import fs from 'node:fs'

const [trainPath, frozenPath, resultPath] = process.argv.slice(2)
const train = JSON.parse(fs.readFileSync(trainPath, 'utf8')).rows, frozen = JSON.parse(fs.readFileSync(frozenPath, 'utf8')).rows
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
const NAME = { 'Paris Saint-Germain': 'PSG', 'SC Freiburg': 'Freiburg', 'Crystal Palace': 'C Palace', 'Rayo Vallecano': 'Rayo', 'Man United': 'Man Utd', 'Ararat': 'Ararat-Armenia' }
const COMP = [['UEFA Champions League', 8], ['UEFA Europa League', 8], ['UEFA Europa Conference League', 6]]

// ---- forecasts: one per league-phase match whose clubs both have >= 3 league-phase games behind them
function forecasts(rows) {
  const out = []
  for (const [label, N] of COMP) {
    const hist = {} // club -> list of every match of this competition so far, as [goalsFor, goalsAgainst]
    const ms = rows.filter(r => r.sport === label).map(r => ({ ...r, h: NAME[r.home] ?? r.home, a: NAME[r.away] ?? r.away }))
      .sort((p, q) => (p.date + (p.start_time ?? '') + p.id < q.date + (q.start_time ?? '') + q.id ? -1 : 1))
    for (const m of ms) {
      const hh = hist[m.h] ?? (hist[m.h] = []), ha = hist[m.a] ?? (hist[m.a] = [])
      if (hh.length < N && ha.length < N) {
        const rate = L => { const pts = L.map(([f, g]) => (f > g ? 3 : f === g ? 1 : 0)), avg = x => x.reduce((s, v) => s + v, 0) / x.length; return avg(pts) + 0.25 * avg(L.map(([f, g]) => f - g)) + 0.10 * avg(L.map(([f]) => f)) }
        if (hh.length >= 3 && ha.length >= 3) out.push({ label, gap: rate(hh) - rate(ha), y: m.home_score > m.away_score ? 0 : m.home_score === m.away_score ? 1 : 2 })
      }
      hh.push([m.home_score, m.away_score]); ha.push([m.away_score, m.home_score])
    }
  }
  return out
}
const sig = z => 1 / (1 + Math.exp(-z))
const round2 = x => Math.round(x * 100) / 100
const P = (gap, h, s, q) => { const ph = (1 - q) * sig((gap + h) / s); return [ph, q, 1 - q - ph] }
const brier = (p, y) => (p[0] - (y === 0 ? 1 : 0)) ** 2 + (p[1] - (y === 1 ? 1 : 0)) ** 2 + (p[2] - (y === 2 ? 1 : 0)) ** 2
const avg = x => x.reduce((s, v) => s + v, 0) / x.length
const zOf = (u, b) => { const d = u.map((v, i) => v - b[i]), m = avg(d); return m / (Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (d.length - 1)) / Math.sqrt(d.length)) }
// the fit by grid and zoom: the draw share is the draw frequency; (home, scale) maximise the decisive-match log-likelihood
function fit(fs) {
  const q = fs.filter(f => f.y === 1).length / fs.length, dec = fs.filter(f => f.y !== 1)
  const ll = (h, s) => dec.reduce((t, f) => { const p = sig((f.gap + h) / s); return t + Math.log(f.y === 0 ? p : 1 - p) }, 0)
  let hLo = -1, hHi = 3, sLo = 0.2, sHi = 6, best = [0, 1]
  for (let level = 0; level < 9; level++) {
    let bv = -Infinity
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const h = hLo + (hHi - hLo) * i / 40, s = sLo + (sHi - sLo) * j / 40, v = ll(h, s); if (v > bv) { bv = v; best = [h, s] } }
    const dh = (hHi - hLo) / 10, ds = (sHi - sLo) / 10
    hLo = best[0] - dh; hHi = best[0] + dh; sLo = Math.max(0.05, best[1] - ds); sHi = best[1] + ds
  }
  return { home: best[0], scale: best[1], share: q }
}
function slope(ph, yh) {
  const x = ph.map(p => Math.log(p / (1 - p))), ll = c => x.reduce((t, xi, i) => { const z = c[0] + c[1] * xi; return t + (yh[i] ? -Math.log1p(Math.exp(-z)) : -Math.log1p(Math.exp(z))) }, 0)
  let c = [0, 1], step = 0.5
  for (let it = 0; it < 20000 && step > 1e-12; it++) {
    const g = [0, 0]; x.forEach((xi, i) => { const r = yh[i] - sig(c[0] + c[1] * xi); g[0] += r; g[1] += r * xi })
    const nc = [c[0] + step * g[0] / x.length, c[1] + step * g[1] / x.length]
    if (ll(nc) > ll(c)) { c = nc; step *= 1.2 } else step /= 2
  }
  const e = 1e-4, d2 = (i, j) => { const f = (a, b) => { const k = c.slice(); k[0] += a * e; k[1] += b * e; return ll(k) }; const di = i === 0 ? [1, 0] : [0, 1], dj = j === 0 ? [1, 0] : [0, 1]; return (f(di[0] + dj[0], di[1] + dj[1]) - f(di[0] - dj[0], di[1] - dj[1]) - f(-di[0] + dj[0], -di[1] + dj[1]) + f(-di[0] - dj[0], -di[1] - dj[1])) / (4 * e * e) }
  const h00 = -d2(0, 0), h01 = -d2(0, 1), h11 = -d2(1, 1)
  return { slope: c[1], se: Math.sqrt(h00 / (h00 * h11 - h01 * h01)) }
}

const tr = forecasts(train), fz = forecasts(frozen)
const shares = fs => [0, 1, 2].map(k => fs.filter(f => f.y === k).length / fs.length)
const rep = {}
const folds = COMP.map(([label]) => {
  const trn = tr.filter(f => f.label !== label), tst = tr.filter(f => f.label === label)
  const c = fit(trn), r = { home: round2(c.home), scale: round2(c.scale), share: round2(c.share) }, base = shares(trn)
  const u = tst.map(f => brier(P(f.gap, r.home, r.scale, r.share), f.y)), b = tst.map(f => brier(base, f.y))
  return { label, n: tst.length, raw: c, r, u, b, ph: tst.map(f => P(f.gap, r.home, r.scale, r.share)[0]), yh: tst.map(f => (f.y === 0 ? 1 : 0)), z: zOf(u, b) }
})
const U = folds.flatMap(f => f.u), B = folds.flatMap(f => f.b)
const sl = slope(folds.flatMap(f => f.ph), folds.flatMap(f => f.yh))
const full = fit(tr), fr = { home: round2(full.home), scale: round2(full.scale), share: round2(full.share) }, base0 = shares(tr)
const fU = fz.map(f => brier(P(f.gap, fr.home, fr.scale, fr.share), f.y)), fB = fz.map(f => brier(base0, f.y))
const mine = { cvN: U.length, z1: zOf(U, B), brierU: avg(U), brierBase: avg(B), slope: sl.slope, slopeSE: sl.se, fullConstants: fr, forwardN: fz.length, forwardDiff: avg(fU) - avg(fB), forwardZ: zOf(fU, fB), forwardBrierU: avg(fU), forwardBrierBase: avg(fB), folds: folds.map(f => ({ label: f.label, n: f.n, r: f.r, z: f.z })) }
const theirs = result.an
let n = 0, bad = 0
const cmp = (name, a, b, tol) => { n++; const ok = Math.abs(a - b) <= tol; if (!ok) bad++; console.log(`${ok ? 'AGREE   ' : 'DISAGREE'} ${name.padEnd(44)} recompute ${a.toFixed(6)}   run ${b.toFixed(6)}   |diff| ${Math.abs(a - b).toExponential(2)} (tolerance ${tol})`) }
cmp('CV set n', mine.cvN, theirs.cvN, 0)
cmp('frozen n', mine.forwardN, theirs.forwardN, 0)
for (const f of mine.folds) { const t = theirs.folds.find(x => x.name === f.label); for (const k of ['home', 'scale', 'share']) cmp(`fold ${f.label.replace('UEFA ', '')} rounded ${k}`, f.r[k], t.constants[k], 1e-9); cmp(`fold ${f.label.replace('UEFA ', '')} paired z`, f.z, t.z, 1e-6) }
for (const k of ['home', 'scale', 'share']) cmp(`full fit rounded ${k}`, mine.fullConstants[k], theirs.fullFit.constants[k], 1e-9)
cmp('CV Brier U', mine.brierU, theirs.cvBrierU, 1e-9)
cmp('CV Brier base rate', mine.brierBase, theirs.cvBrierBase, 1e-9)
cmp('CV z against the base rate (U1)', mine.z1, theirs.z1, 1e-6)
cmp('CV home-win slope (U3)', mine.slope, theirs.slope, 2e-3)
cmp('CV home-win slope SE (U3)', mine.slopeSE, theirs.slopeSE, 2e-3)
cmp('frozen Brier U', mine.forwardBrierU, theirs.forwardBrierU, 1e-9)
cmp('frozen Brier base rate', mine.forwardBrierBase, theirs.forwardBrierBase, 1e-9)
cmp('frozen difference (U4)', mine.forwardDiff, theirs.forwardDiff, 1e-9)
cmp('frozen paired z', mine.forwardZ, theirs.forwardZ, 1e-6)
console.log(`\nVERDICT FROM THE RECOMPUTE'S OWN NUMBERS (the rule's thresholds): U1 ${mine.z1 <= -1.645 ? 'holds' : 'FAILS'} (z ${mine.z1.toFixed(2)}); U2 ${mine.folds.every(f => f.z <= 1) ? 'holds' : 'FAILS'} (${mine.folds.map(f => f.z.toFixed(2)).join(', ')}); U3 ${Math.abs(mine.slope - 1) <= 1.96 * mine.slopeSE ? 'holds' : 'FAILS'} (${mine.slope.toFixed(3)} +/- ${mine.slopeSE.toFixed(3)}); U4 ${mine.forwardDiff <= 0 ? 'holds' : 'FAILS'} (frozen difference ${mine.forwardDiff.toFixed(4)})`)
console.log(`coverage: ${n} quantities compared, ${n - bad} agree, ${bad} disagree`)
process.exit(bad === 0 ? 0 : 1)
