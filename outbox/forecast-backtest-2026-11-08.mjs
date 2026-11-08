// A ONE-OFF MEASUREMENT, NOT A LEDGER. Replays the EPL season so far through table-v1 (src/Forecast.fs, compiled to build/Forecast.js) and
// scores it against the market line as the card draws it (Desk.winProbability on the archive row), match by match, each forecast made from the
// table as it stood BEFORE that match. Written 2026-11-08 for docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md, whose Phase 2 rules out an accuracy
// record in the product ("No prediction obligation, no correctness claim"): this is a diagnostic of the model's declared constants and ships
// nothing. Its output is outbox/forecast-backtest-2026-11-08.txt.
//
// DATA. One /context/date payload per day, the shape the lab's own page reads, from the relay's archive:
//   mkdir season && for d in $(node -e 'for (let t=Date.parse("2026-08-14"); t<=Date.parse("2026-11-08"); t+=864e5) console.log(new Date(t).toISOString().slice(0,10))'); do
//     curl -s "https://field-relay-nba.jeffunglesbee.workers.dev/context/date/$d" -o "season/$d.json"; done
// RUN.   npm run build && node outbox/forecast-backtest-2026-11-08.mjs season
//
// WHAT IT DOES NOT DO. It does not fit anything. It also ends with an independent JavaScript recomputation of the model against the compiled one,
// because a backtest of a model that is not the shipped model measures nothing. "Man United" is read as "Man Utd" HERE ONLY: the archive
// changed the spelling on 2026-10-31 and 8 older rows carry the old one; the cards do not normalise (Rule 60, Rule 64).
import fs from 'node:fs'
import { makeRow, forecastFor, triple } from '../build/Forecast.js'
import { decodePayload, winProbability, winProbabilityKind, sportMeta } from '../build/Desk.js'
import { threeWayHome, threeWayDraw, threeWayAway } from '../build/Market.js'
const dir = process.argv[2]
if (!dir) { console.error('usage: node outbox/forecast-backtest-2026-11-08.mjs <season-directory>'); process.exit(2) }
const norm = n => n === 'Man United' ? 'Man Utd' : n       // script-level only: the archive spelling drift
let games = []
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const r = decodePayload(fs.readFileSync(dir + '/' + f, 'utf8'))
  for (const g of [...Array.from(r.fields[0].Regular)]) if (sportMeta(g.Sport).Label === 'EPL') games.push(g)
}
const startOf = g => g.RawStartTime ?? ''
games.sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.Id.localeCompare(b.Id))
const T = new Map()   // team -> {p,pts,gf,ga}
const get = n => { if (!T.has(n)) T.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return T.get(n) }
const row = n => { const t = get(n); return makeRow(n, n, t.p, t.pts, t.gf, t.ga, 0) }
const out = []
let finished = 0
for (const g of games) {
  const h = norm(g.Home), a = norm(g.Away)
  const final = g.FinalizedAt != null && g.HomeScore != null && g.AwayScore != null
  if (!final) continue
  finished++
  const th = get(h), ta = get(a)
  const mf = Array.from(triple(forecastFor(1, row(h), row(a))))      // pre-match table: results strictly earlier
  const wp = winProbability(g)
  const mk = winProbabilityKind(wp) === 'three-way' ? [threeWayHome(wp.fields[0]), threeWayDraw(wp.fields[0]), threeWayAway(wp.fields[0])] : null
  const hs = g.HomeScore, as = g.AwayScore
  const o = hs > as ? [1,0,0] : hs === as ? [0,1,0] : [0,0,1]
  out.push({ day: startOf(g).slice(0,10), h, a, pre: Math.min(th.p, ta.p), model: mf.length ? mf : null, market: mk, o })
  // apply the result AFTER forecasting
  th.p++; ta.p++; th.gf += hs; th.ga += as; ta.gf += as; ta.ga += hs
  if (hs > as) th.pts += 3; else if (hs === as) { th.pts += 1; ta.pts += 1 } else ta.pts += 3
}
console.log('finished EPL matches replayed:', finished)
const brier = (p, o) => p.reduce((s, x, i) => s + (x - o[i]) ** 2, 0)
const ll = (p, o) => -Math.log(Math.max(1e-12, p[o.indexOf(1)]))
const rep = (label, set) => {
  const both = set.filter(r => r.model && r.market)
  const m = both.map(r => brier(r.model, r.o)), k = both.map(r => brier(r.market, r.o))
  const lm = both.map(r => ll(r.model, r.o)), lk = both.map(r => ll(r.market, r.o))
  const mean = x => x.reduce((s, v) => s + v, 0) / x.length
  const gap = both.map(r => Math.abs(r.model[0] - r.market[0]) * 100)
  const maxp = both.map(r => Math.max(...r.model)), maxk = both.map(r => Math.max(...r.market))
  console.log(label.padEnd(34), 'n', String(both.length).padStart(3),
    '| mean |home gap|', mean(gap).toFixed(1) + ' pts',
    '| Brier model', mean(m).toFixed(3), 'market', mean(k).toFixed(3),
    '| logloss model', mean(lm).toFixed(3), 'market', mean(lk).toFixed(3),
    '| mean top-prob model', (mean(maxp)*100).toFixed(0)+'%', 'market', (mean(maxk)*100).toFixed(0)+'%')
}
rep('all matches with both sides', out)
rep('both clubs >=5 played (GW6+)', out.filter(r => r.pre >= 5))
rep('both clubs >=8 played (GW9+)', out.filter(r => r.pre >= 8))
const modelOnly = out.filter(r => r.model && !r.market)
console.log('matches where the model exists and the market does not (real ModelOnly cases):', modelOnly.length)

// ---- sanity: independent recomputation of the model (copy of Forecast.fs maths in JS) against the compiled one
const rating = t => t.p <= 0 ? null : t.pts / t.p + 0.25 * ((t.gf - t.ga) / t.p) + 0.10 * (t.gf / t.p)
const indep = (rh, ra) => { const d = rh - ra + 0.30; const pD = 0.28 * Math.exp(-Math.abs(d) / 1.10); const pH = (1 - pD) * (1 / (1 + Math.exp(-d / 0.55))); return [pH, pD, 1 - pD - pH] }
{
  const T2 = new Map(); const g2 = n => { if (!T2.has(n)) T2.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return T2.get(n) }
  let maxdiff = 0, checked = 0
  for (const r of games.filter(g => g.FinalizedAt != null && g.HomeScore != null)) {
    const h = norm(r.Home), a = norm(r.Away), th = g2(h), ta = g2(a)
    const rh = rating(th), ra = rating(ta)
    if (rh !== null && ra !== null) {
      const mine = indep(rh, ra)
      const comp = Array.from(triple(forecastFor(1, makeRow(h, h, th.p, th.pts, th.gf, th.ga, 0), makeRow(a, a, ta.p, ta.pts, ta.gf, ta.ga, 0))))
      for (let i = 0; i < 3; i++) maxdiff = Math.max(maxdiff, Math.abs(mine[i] - comp[i]))
      checked++
    }
    const hs = r.HomeScore, as = r.AwayScore
    th.p++; ta.p++; th.gf += hs; th.ga += as; ta.gf += as; ta.ga += hs
    if (hs > as) th.pts += 3; else if (hs === as) { th.pts += 1; ta.pts += 1 } else ta.pts += 3
  }
  console.log('independent JS recomputation vs compiled model: matches', checked, 'max abs difference', maxdiff.toExponential(2))
}
// ---- calibration bins on the model's home probability (all matches with a model, GW6+)
const bins = [[0,.2],[.2,.4],[.4,.6],[.6,.8],[.8,1.01]]
console.log('model home-win probability bins, matches where both clubs had played >=5:')
for (const [lo,hi] of bins) { const s = out.filter(r => r.model && r.pre >= 5 && r.model[0] >= lo && r.model[0] < hi); if (!s.length) { console.log('  ',lo,'-',hi,'n 0'); continue }
  console.log('  ', String(lo).padEnd(3),'-',String(Math.min(hi,1)).padEnd(3),'n',String(s.length).padStart(2),'| mean predicted',(s.reduce((x,r)=>x+r.model[0],0)/s.length*100).toFixed(0)+'%','| home actually won',(s.filter(r=>r.o[0]===1).length/s.length*100).toFixed(0)+'%') }
{
  const u = [1 / 3, 1 / 3, 1 / 3]
  const meanOver = set => (set.reduce((s, r) => s + brier(u, r.o), 0) / set.length).toFixed(3)
  const both = out.filter(r => r.model && r.market)
  console.log('uniform guess (1/3, 1/3, 1/3), Brier, same sets: all', meanOver(both), '| GW6+', meanOver(both.filter(r => r.pre >= 5)), '| GW9+', meanOver(both.filter(r => r.pre >= 8)), '(analytic: 0.667 for any outcome)')
}
