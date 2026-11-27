#!/usr/bin/env node
// The checks of outbox/forecast-fit-uefa-2026-11-27.mjs (docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md, Task 2). SYNTHETIC DATA ONLY: this runs the tooling on seasons
// it generates itself, so no real UEFA model number exists before the pre-registered run. Every check states what it would catch; scripts/mutate-uefa-fit.mjs breaks the tooling on
// purpose, one mutant at a time, and requires this file to go red for each (Rule 90: a check that has only ever passed has proven nothing).
//
//   node scripts/check-uefa-fit.mjs        (UEFA_FIT_FILE=<path> checks a COPY of the tooling; the mutation harness uses it)
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILE = process.env.UEFA_FIT_FILE || path.join(HERE, '..', 'outbox', 'forecast-fit-uefa-2026-11-27.mjs')
const M = await import(pathToFileURL(FILE).href)
const { CLUB_ALIASES, RULE, decide, prepare, fitNewton, fitSimplex, wellPosed, homeSlope, analyse, probs, pairedZ, brier, round2, shares } = M

let n = 0, bad = 0
const check = (name, ok, detail = '') => { n++; if (!ok) { bad++; console.log(`FAIL  ${name}${detail ? `\n      -> ${detail}` : ''}`) } }
const near = (a, b, tol) => Math.abs(a - b) <= tol
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const LABELS = Object.keys(RULE.N)
const SHORT = { 'UEFA Champions League': 'UCL', 'UEFA Europa League': 'UEL', 'UEFA Europa Conference League': 'UECL' }

// ---- a synthetic season: 36 clubs a competition, one match a club a matchday, outcomes drawn SEQUENTIALLY from the model itself (or from fixed shares), so ratings are the real
//      point-in-time ratings. `consts` null means no skill: every outcome is drawn from the shares 0.42 / 0.27 / 0.31 whatever the ratings.
function season(rng, { consts, matchdays, dateBase, idBase }) {
  const rows = []
  let id = idBase
  const goalsFor = (y) => { const r = Math.floor(rng() * 3); return y === 0 ? [[1, 0], [2, 0], [2, 1]][r] : y === 1 ? [[0, 0], [1, 1], [2, 2]][r] : [[0, 1], [0, 2], [1, 2]][r] }
  for (const label of LABELS) {
    const N = RULE.N[label]
    const clubs = Array.from({ length: 36 }, (_, i) => `${SHORT[label]}-${i}`)
    const st = new Map(clubs.map(c => [c, { g: 0, pts: 0, gf: 0, ga: 0 }]))
    const rating = x => x.pts / x.g + RULE.weights.gd * (x.gf - x.ga) / x.g + RULE.weights.gf * x.gf / x.g
    for (let md = 1; md <= Math.min(N, matchdays[label]); md++) {
      const order = clubs.slice().sort(() => rng() - 0.5)
      const day = new Date(Date.parse(dateBase + 'T00:00:00Z') + md * 7 * 86400000).toISOString().slice(0, 10)
      for (let i = 0; i < 36; i += 2) {
        const h = order[i], a = order[i + 1], H = st.get(h), A = st.get(a)
        const eligible = H.g >= RULE.K && A.g >= RULE.K
        const p = consts && eligible ? probs(rating(H) - rating(A), consts) : [0.42, 0.27, 0.31]
        const u = rng(), y = u < p[0] ? 0 : u < p[0] + p[1] ? 1 : 2
        const [hg, ag] = goalsFor(y)
        rows.push({ id: `${label}_${day}_${id}`, sport: label, date: day, home: h, away: a, home_score: hg, away_score: ag, start_time: `${day}T20:00Z`, espn_event_id: String(id++) })
        H.g++; A.g++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg
        H.pts += hg > ag ? 3 : hg === ag ? 1 : 0; A.pts += ag > hg ? 3 : hg === ag ? 1 : 0
      }
    }
    // two knockout-style rows after the league phase: both clubs are already on N, so they are NOT league-phase matches
    if (matchdays[label] >= N) { const day = new Date(Date.parse(dateBase + 'T00:00:00Z') + (N + 3) * 7 * 86400000).toISOString().slice(0, 10); rows.push({ id: `${label}_${day}_k${id}`, sport: label, date: day, home: clubs[0], away: clubs[1], home_score: 1, away_score: 0, start_time: `${day}T20:00Z`, espn_event_id: String(id++) }) }
  }
  return rows
}
const FULL = { 'UEFA Champions League': 8, 'UEFA Europa League': 8, 'UEFA Europa Conference League': 6 }
const PART = { 'UEFA Champions League': 5, 'UEFA Europa League': 5, 'UEFA Europa Conference League': 4 }

// ---- 1. the league-phase split and the ratings, against numbers worked out by hand
{
  const R = (id, d, h, a, hs, as) => ({ id, sport: 'UEFA Champions League', date: d, home: h, away: a, home_score: hs, away_score: as, start_time: d + 'T20:00Z', espn_event_id: id })
  const rows = [R('1', '2025-10-01', 'A', 'B', 2, 0), R('2', '2025-10-01', 'C', 'D', 1, 1), R('3', '2025-10-08', 'A', 'C', 0, 1), R('4', '2025-10-08', 'B', 'D', 0, 1), R('5', '2025-10-15', 'A', 'D', 3, 0)]
  const p = prepare(rows, { N: { 'UEFA Champions League': 2 }, K: 1 })
  check('prepare: four league-phase matches of five (the fifth has both clubs on N = 2 already)', p.matches.length === 4 && p.integrity.leaguePhase['UEFA Champions League'] === 4, JSON.stringify(p.integrity.leaguePhase))
  check('prepare: the first two matches are not eligible (K = 1, nobody has played), the next two are', p.matches.map(m => m.eligible).join() === 'false,false,true,true', p.matches.map(m => m.eligible).join())
  // A: 1 game, 3 pts, gf 2 ga 0 -> 3 + 0.25*2 + 0.10*2 = 3.7 ; C: 1 pt, gf 1 ga 1 -> 1 + 0 + 0.1 = 1.1 ; gap 2.6
  check('prepare: A (3.7) against C (1.1) has gap 2.6, worked by hand', near(p.matches[2].gap, 2.6, 1e-12), String(p.matches[2].gap))
  // B: 0 pts, gf 0 ga 2 -> 0 - 0.5 + 0 = -0.5 ; D: 1.1 ; gap -1.6
  check('prepare: B (-0.5) against D (1.1) has gap -1.6, worked by hand', near(p.matches[3].gap, -1.6, 1e-12), String(p.matches[3].gap))
  check('prepare: outcomes are home win 0, draw 1, away win 2 (A-C 0-1 is a away win)', p.matches.map(m => m.y).join() === '0,1,2,2', p.matches.map(m => m.y).join())
  check('prepare: every club has played exactly N league-phase matches', p.integrity.clubsNotOnN.length === 0, p.integrity.clubsNotOnN.join())
  // no leak: the same history with a different RESULT for the match itself gives the same features for that match
  const alt = rows.map(r => (r.id === '3' ? { ...r, home_score: 5, away_score: 0 } : r))
  const q = prepare(alt, { N: { 'UEFA Champions League': 2 }, K: 1 })
  check('prepare: a match\'s own result does not enter its own rating gap', near(q.matches[2].gap, p.matches[2].gap, 1e-12) && q.matches[2].y !== p.matches[2].y)
  // a club already on N meeting a club that is not: NOT a league-phase match (both clubs must be under N), whatever the other club has played
  const mixed = prepare([R('m1', '2025-10-01', 'A', 'B', 1, 0), R('m2', '2025-10-08', 'A', 'C', 1, 0), R('m3', '2025-10-15', 'A', 'D', 1, 0)], { N: { 'UEFA Champions League': 2 }, K: 1 })
  check('prepare: a club already on N meeting one that is not is NOT a league-phase match (both must be under N)', mixed.integrity.leaguePhase['UEFA Champions League'] === 2 && mixed.matches.length === 2, JSON.stringify(mixed.integrity.leaguePhase))
  {
    const rng0 = rngOf(21), sea = season(rng0, { consts: null, matchdays: FULL, dateBase: '2025-09-01', idBase: 1 })
    const d = prepare(sea), x = prepare(sea, { N: RULE.N, K: RULE.K })
    check('prepare: with no options it uses the rule\'s N and K (234 eligible of 396)', d.matches.length === 396 && d.matches.filter(m => m.eligible).length === 234 && x.matches.filter(m => m.eligible).length === 234, `${d.matches.length} ${d.matches.filter(m => m.eligible).length}`)
  }
  // club identity: the same club under two spellings is ONE club
  {
    const Q = (id, d, h, a) => ({ id, sport: 'UEFA Champions League', date: d, home: h, away: a, home_score: 1, away_score: 0, start_time: d + 'T20:00Z', espn_event_id: id })
    const rows2 = [Q('a1', '2025-10-01', 'PSG', 'B'), Q('a2', '2025-10-08', 'C', 'D'), Q('a3', '2025-10-15', 'Paris Saint-Germain', 'E')]
    const pr = prepare(rows2, { N: { 'UEFA Champions League': 2 }, K: 1 })
    check('prepare: "Paris Saint-Germain" and "PSG" are one club (its second match has one game behind it, and 5 distinct clubs, not 6)', pr.integrity.distinctClubs['UEFA Champions League'] === 5 && pr.matches[2].gH === 1, JSON.stringify(pr.integrity.distinctClubs) + ' ' + pr.matches[2]?.gH)
    check('prepare: every alias maps to a spelling that is itself not an alias (no chains), and two aliases never share a target', Object.values(CLUB_ALIASES).every(v => !(v in CLUB_ALIASES)) && new Set(Object.values(CLUB_ALIASES)).size === Object.keys(CLUB_ALIASES).length)
  }
  check('prepare: a null score is counted and excluded, not read as 0-0', prepare([R('x', '2025-10-01', 'A', 'B', null, 1)], { N: { 'UEFA Champions League': 2 }, K: 1 }).integrity.nullScores === 1)
  check('prepare: a match against itself is counted', prepare([R('y', '2025-10-01', 'A', 'A', 1, 1)], { N: { 'UEFA Champions League': 2 }, K: 1 }).integrity.sameClub === 1)
  check('prepare: a duplicate ESPN event id is counted', prepare([R('1', '2025-10-01', 'A', 'B', 1, 0), { ...R('2', '2025-10-01', 'C', 'D', 1, 0), espn_event_id: '1' }], { N: { 'UEFA Champions League': 2 }, K: 1 }).integrity.dupEspnIds === 1)
}

// ---- 2. the probabilities, the paired z, the slope
{
  const c = { home: 0.4, scale: 1.1, share: 0.27 }
  for (const g of [-4, -1, 0, 0.7, 5]) { const p = probs(g, c); check(`probs(${g}): three non-negative numbers that sum to 1`, near(p[0] + p[1] + p[2], 1, 1e-12) && p.every(v => v >= 0) && p[1] === 0.27) }
  check('probs: a larger gap raises the home share', probs(1, c)[0] > probs(0, c)[0] && probs(0, c)[0] > probs(-1, c)[0])
  check('probs: a positive home edge raises the home share at a zero gap', probs(0, { ...c, home: 0.5 })[0] > probs(0, { ...c, home: 0 })[0])
  check('brier: a uniform guess scores 0.6667, a certain right forecast 0', near(brier([1 / 3, 1 / 3, 1 / 3], 1), 2 / 3, 1e-12) && brier([1, 0, 0], 0) === 0)
  check('pairedZ: worked by hand (differences -1 -1 -1 -2: mean -1.25, sd 0.5, z -5)', near(pairedZ([1, 1, 1, 1], [2, 2, 2, 3]), -5, 1e-12), String(pairedZ([1, 1, 1, 1], [2, 2, 2, 3])))
  check('round2: two decimals', round2(0.4249) === 0.42 && round2(0.4251) === 0.43 && round2(1.144) === 1.14)
}

// ---- 3. the fit recovers constants it generated, and the two solvers agree
{
  const rng = rngOf(7), TRUE = { home: 0.42, scale: 1.14, share: 0.27 }
  const fs = Array.from({ length: 4000 }, () => { const gap = (rng() + rng() + rng() - 1.5) * 2.4, p = probs(gap, TRUE), u = rng(); return { gap, y: u < p[0] ? 0 : u < p[0] + p[1] ? 1 : 2 } })
  const nw = fitNewton(fs), sx = fitSimplex(fs)
  check('fitNewton: recovers home, scale and share from 4000 draws of the model', near(nw.home, TRUE.home, 0.08) && near(nw.scale, TRUE.scale, 0.12) && near(nw.share, TRUE.share, 0.02) && nw.converged, JSON.stringify({ h: nw.home, s: nw.scale, q: nw.share }))
  check('fitSimplex: an unrelated solver reaches the same mean log loss to 1e-9', Math.abs(nw.meanNLL - sx.meanNLL) <= 1e-9, String(Math.abs(nw.meanNLL - sx.meanNLL)))
  const w = wellPosed(fs, nw)
  check('wellPosed: true on a well-conditioned fit (gradient, Hessian, bounds, solver agreement)', w.ok === true, JSON.stringify(w))
  const degenerate = Array.from({ length: 60 }, (_, i) => ({ gap: i / 30, y: 0 }))
  check('wellPosed: false when every outcome is a home win (the logistic fit does not exist)', wellPosed(degenerate, fitNewton(degenerate)).ok === false)
  const noDraws = Array.from({ length: 200 }, (_, i) => ({ gap: (i % 7) - 3, y: i % 5 === 0 ? 2 : 0 }))
  check('wellPosed: false when the share sits on its bound (no draws at all)', wellPosed(noDraws, fitNewton(noDraws)).ok === false)
  const cal = [], ycal = [], flat = [], yflat = []
  for (let i = 0; i < 30000; i++) { const g = (rng() + rng() + rng() - 1.5) * 2.4, pH = probs(g, TRUE)[0]; cal.push(pH); ycal.push(rng() < pH ? 1 : 0); const pf = 0.5 + 0.35 * (pH - 0.5); flat.push(pH); yflat.push(rng() < pf ? 1 : 0) }
  const s1 = homeSlope(cal, ycal), s2 = homeSlope(flat, yflat)
  check('homeSlope: a calibrated forecast has slope near 1 (within 2 SE)', Math.abs(s1.slope - 1) < 2 * s1.se && s1.se > 0.005 && s1.se < 0.1, JSON.stringify(s1))
  check('homeSlope: an over-confident forecast (true effect flattened to 0.35) has slope well below 1', s2.slope < 0.6 && Math.abs(s2.slope - 1) > 1.96 * s2.se, JSON.stringify(s2))
}

// ---- 4. the folds, the rounding, the benchmark, the frozen bundle (structure)
{
  const rng = rngOf(11)
  const train = season(rng, { consts: { home: 0.42, scale: 1.14, share: 0.27 }, matchdays: FULL, dateBase: '2025-09-01', idBase: 1 })
  const frozen = season(rng, { consts: { home: 0.42, scale: 1.14, share: 0.27 }, matchdays: PART, dateBase: '2026-08-20', idBase: 100000 })
  const an = analyse(train, frozen, RULE.K)
  check('synthetic season: 144 + 144 + 108 league-phase matches, every club on exactly N', JSON.stringify(Object.values(an.trainLeaguePhase)) === '[144,144,108]' && an.integrityRaw.train.clubsNotOnN.length === 0, JSON.stringify(an.trainLeaguePhase))
  check('synthetic frozen bundle: 90 + 90 + 72 league-phase matches', JSON.stringify(Object.values(an.frozenLeaguePhase)) === '[90,90,72]', JSON.stringify(an.frozenLeaguePhase))
  check('eligible forecasts equal the format\'s arithmetic at K = 3: 90 + 90 + 54 = 234 (frozen 36 + 36 + 18 = 90)', an.cvN === 234 && an.forwardN === 90, `${an.cvN} ${an.forwardN}`)
  check('three folds, each trained on exactly the OTHER two competitions\' forecasts', an.folds.length === 3 && an.folds.every(f => f.trainN === an.cvN - f.n), JSON.stringify(an.folds.map(f => [f.n, f.trainN])))
  check('fold constants and full-fit constants are rounded to two decimals before scoring', an.folds.every(f => Object.values(f.constants).every(v => near(v * 100, Math.round(v * 100), 1e-9))) && Object.values(an.fullFit.constants).every(v => near(v * 100, Math.round(v * 100), 1e-9)))
  check('each fold\'s raw fit differs from the full fit (a held-out competition was really left out)', an.folds.some(f => Math.abs(f.fit.home - an.fullFit.raw.home) > 1e-6))
  check('the frozen bundle is scored against the base rate of ALL training forecasts', near(an.fullFit.baseShares.reduce((s, v) => s + v, 0), 1, 1e-12) && an.forwardN === 90)
  // the benchmark shares, recomputed here from the prepared matches by a separate count
  const prep = prepare(train, { K: RULE.K }).matches.filter(m => m.eligible)
  const indep = labs => [0, 1, 2].map(k => prep.filter(m => labs.includes(m.label) && m.y === k).length / prep.filter(m => labs.includes(m.label)).length)
  check('each fold\'s benchmark is the home / draw / away shares of ITS TRAINING forecasts (not the held-out competition\'s)', an.folds.every(f => indep(LABELS.filter(l => l !== f.name)).every((v, k) => near(v, f.baseShares[k], 1e-12))) && an.folds.some(f => indep([f.name]).some((v, k) => Math.abs(v - f.baseShares[k]) > 1e-6)))
  check('the frozen bundle\'s benchmark is the shares of ALL 2025-26 eligible forecasts (not the frozen bundle\'s own)', indep(LABELS).every((v, k) => near(v, an.fullFit.baseShares[k], 1e-12)))
  const ex = analyse(train, frozen, 4)
  check('K = 4 leaves 72 + 72 + 36 = 180 forecasts (the sensitivity run uses the same pipeline)', ex.cvN === 180, String(ex.cvN))
  const raw = analyse(train, [], RULE.K)
  check('an empty frozen bundle gives no forward forecasts and a NaN difference, not a pass', raw.forwardN === 0 && Number.isNaN(raw.forwardDiff) && decide({ z1: -9, folds: raw.folds, slope: 1, slopeSE: 0.1, forwardDiff: raw.forwardDiff, wellPosed: true, integrity: true }).verdict === 'DO NOT BUILD')
}

// ---- 4a. each z is the z of the benchmark it claims: its sign agrees with the Brier difference against THAT benchmark
{
  let differing = 0
  for (const seed of [31, 32, 33, 34, 35, 36]) {
    const rng = rngOf(seed)
    const train = season(rng, { consts: null, matchdays: FULL, dateBase: '2025-09-01', idBase: 1 }), frozen = season(rng, { consts: null, matchdays: PART, dateBase: '2026-08-20', idBase: 100000 })
    const a = analyse(train, frozen, RULE.K)
    check(`z1 (seed ${seed}) has the sign of (U's Brier minus the BASE RATE's), and zEPL the sign of (U minus the EPL constants')`, Math.sign(a.z1) === Math.sign(a.cvBrierU - a.cvBrierBase) && Math.sign(a.zEPL) === Math.sign(a.cvBrierU - a.cvBrierEPL), `${a.z1.toFixed(2)} ${(a.cvBrierU - a.cvBrierBase).toFixed(5)} ${a.zEPL.toFixed(2)} ${(a.cvBrierU - a.cvBrierEPL).toFixed(5)}`)
    if (Math.sign(a.cvBrierU - a.cvBrierBase) !== Math.sign(a.cvBrierU - a.cvBrierEPL)) differing++
  }
  check('the sign test above has power: on at least one no-skill seed the two benchmarks disagree about the sign', differing >= 1, `${differing} of 6`)
}

// ---- 4b. the slope's standard error, from the information matrix computed again here, by a separate path
{
  const rng = rngOf(5), pH = [], yH = []
  for (let i = 0; i < 3000; i++) { const p = 0.15 + 0.7 * rng(); pH.push(p); yH.push(rng() < p ? 1 : 0) }
  const r = homeSlope(pH, yH)
  let a = 0, b = 0, c = 0
  for (let i = 0; i < pH.length; i++) { const x = Math.log(pH[i] / (1 - pH[i])), mu = 1 / (1 + Math.exp(-(r.intercept + r.slope * x))), w = mu * (1 - mu); a += w; b += w * x; c += w * x * x }
  const inv11 = a / (a * c - b * b)
  check('homeSlope: the standard error is the root of the (1,1) element of the inverse information at the fit', near(r.se, Math.sqrt(inv11), 1e-9) && !near(r.se, Math.sqrt(c / (a * c - b * b)), 1e-4), `${r.se} ${Math.sqrt(inv11)}`)
}

// ---- 4c. the integrity checks (U6) can pass and can fail
{
  const fs = await import('node:fs')
  const text = fs.readFileSync(FILE, 'utf8')
  const block = text.slice(text.indexOf('// ==== RULE BEGIN'), text.indexOf('// ==== RULE END') + '// ==== RULE END'.length)
  const rng = rngOf(3)
  const train = season(rng, { consts: null, matchdays: FULL, dateBase: '2025-09-01', idBase: 1 })
  const frozen = season(rng, { consts: null, matchdays: PART, dateBase: '2026-08-20', idBase: 100000 })
  const bundle = (rows, extra = {}) => ({ counts: { rows: rows.length }, statuses: { 200: 10 }, rows, ...extra })
  const an = analyse(train, frozen, RULE.K)
  const run = (rowsT, rowsF, blk, an_) => M.integrityChecks('t', 'f', bundle(rowsT), bundle(rowsF), an_ ?? an, blk)
  const base = run(train, frozen, block)
  const failing = base.filter(c => !c.ok).map(c => c.name)
  check('integrityChecks: on consistent synthetic bundles only the three provenance checks (rule hash recorded, two pinned bundle hashes) can differ, and the rule block of THIS file matches the recorded hash', failing.every(f => f.includes('pinned')) && base.find(c => c.name.startsWith('the RULE block')).ok === true, failing.join(' | '))
  check('integrityChecks: a tampered RULE block fails the recorded-hash check', run(train, frozen, block.replace('z1: -1.645', 'z1: -1.0')).find(c => c.name.startsWith('the RULE block')).ok === false)
  const dupEspn = frozen.map((r, i) => (i === 1 ? { ...r, espn_event_id: frozen[0].espn_event_id } : r))
  check('integrityChecks: a duplicate ESPN event id fails', run(train, dupEspn, block, analyse(train, dupEspn, RULE.K)).find(c => c.name.startsWith('no duplicate')).ok === false)
  const short = train.slice(0, train.length - 4)
  check('integrityChecks: a missing league-phase match fails the 2025-26 count and the club count', (() => { const a2 = analyse(short, frozen, RULE.K); const r = run(short, frozen, block, a2); return !r.find(c => c.name.startsWith('2025-26 UCL')).ok || !r.find(c => c.name.startsWith('2025-26: every club')).ok })())
  const ghost = train.map((r, i) => (i === 5 ? { ...r, away: 'ghost-club' } : r))
  check('integrityChecks: a club that is not on exactly N league-phase matches (a spelling variant) fails the club count', (() => { const a2 = analyse(ghost, frozen, RULE.K); const r = run(ghost, frozen, block, a2); return r.find(c => c.name.startsWith('2025-26: every club')).ok === false })())
  const nullScore = train.map((r, i) => (i === 3 ? { ...r, away_score: null } : r))
  check('integrityChecks: a null score in a league-phase match fails', (() => { const a2 = analyse(nullScore, frozen, RULE.K); return run(nullScore, frozen, block, a2).find(c => c.name.startsWith('no null score')).ok === false })())
  const split = train.map((r, i) => (i === 7 ? { ...r, home: r.home + ' FC' } : r))
  check('integrityChecks: a club under a spelling the alias map does not know fails the 36-clubs check', (() => { const a2 = analyse(split, frozen, RULE.K); return run(split, frozen, block, a2).find(c => c.name.startsWith('36 distinct')).ok === false })())
  check('integrityChecks: the 36-clubs check passes on consistent bundles', base.find(c => c.name.startsWith('36 distinct')).ok === true)
  const wrongSeason = train.map((r, i) => (i === 0 ? { ...r, date: '2026-09-01' } : r))
  check('integrityChecks: a training row dated after the season cut fails', run(wrongSeason, frozen, block).find(c => c.name.startsWith('the training bundle holds')).ok === false)
}

// ---- 5. the decision function names each part
{
  const ok = { z1: -2, folds: [{ name: 'a', z: -1 }, { name: 'b', z: 0.5 }, { name: 'c', z: 0.9 }], slope: 1.1, slopeSE: 0.2, forwardDiff: -0.01, wellPosed: true, integrity: true }
  check('decide: BUILD when every part holds', decide(ok).verdict === 'BUILD')
  const named = (patch, tag) => { const d = decide({ ...ok, ...patch }); return d.verdict === 'DO NOT BUILD' && d.failed.some(f => f.startsWith(tag)) }
  check('decide: U1 names a CV z above -1.645', named({ z1: -1.6 }, 'U1'))
  check('decide: U2 names a fold above +1.0', named({ folds: [{ name: 'a', z: 1.2 }, { name: 'b', z: 0 }, { name: 'c', z: 0 }] }, 'U2'))
  check('decide: U2 needs three folds', named({ folds: [{ name: 'a', z: 0 }] }, 'U2'))
  check('decide: U3 names a slope more than 1.96 SE from 1', named({ slope: 0.5 }, 'U3'))
  check('decide: U4 names a frozen Brier above the base rate\'s', named({ forwardDiff: 0.002 }, 'U4'))
  check('decide: U5 names an ill-posed fit', named({ wellPosed: false }, 'U5'))
  check('decide: U6 names a failed integrity check', named({ integrity: false }, 'U6'))
  check('decide: a NaN z fails (NaN is never <= a threshold)', decide({ ...ok, z1: NaN }).verdict === 'DO NOT BUILD')
}

// ---- 6. the verdict has the right BEHAVIOUR on seasons it was not told about
{
  const verdicts = (consts, seeds) => seeds.map(seed => {
    const rng = rngOf(seed)
    const train = season(rng, { consts, matchdays: FULL, dateBase: '2025-09-01', idBase: 1 }), frozen = season(rng, { consts, matchdays: PART, dateBase: '2026-08-20', idBase: 100000 })
    const an = analyse(train, frozen, RULE.K)
    return decide({ z1: an.z1, folds: an.folds, slope: an.slope, slopeSE: an.slopeSE, forwardDiff: an.forwardDiff, wellPosed: an.wellPosed, integrity: true })
  })
  const seeds = Array.from({ length: 24 }, (_, i) => 1000 + i)
  const nulls = verdicts(null, seeds), skill = verdicts({ home: 0.3, scale: 0.35, share: 0.25 }, seeds)
  const builtNull = nulls.filter(v => v.verdict === 'BUILD').length, builtSkill = skill.filter(v => v.verdict === 'BUILD').length
  check('no skill: at most 3 of 24 synthetic seasons would be built (the rule is meant to refuse a table with no information)', builtNull <= 3, `${builtNull} of 24`)
  check('strong skill: at least 20 of 24 synthetic seasons would be built (the rule is not unreachable)', builtSkill >= 20, `${builtSkill} of 24; first failures ${skill.filter(v => v.verdict !== 'BUILD').slice(0, 2).map(v => v.failed.join(' | ')).join(' || ')}`)
  console.log(`coverage: no-skill BUILD ${builtNull}/24, strong-skill BUILD ${builtSkill}/24 (synthetic seasons, seeds 1000 to 1023)`)
}

console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}`)
process.exit(bad === 0 ? 0 : 1)
