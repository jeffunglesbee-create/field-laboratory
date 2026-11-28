// THE SCORING of the 2026-11-28 replication rule, as one pure module: it loads the rule, scores, and builds every set that is scored. It is its own file so that its sha256 can be recorded in each bundle's data commit message and in the Look 1 result, and compared at Look 2 (G3 (n)):
// everything that FIXES A NUMBER lives here (the loader of the rule, the league-phase counting, the forecasts, the statistic, the slope, the eligible sets of each look and the Look 2 pool, and the call that turns statistics into a verdict), so the scoring cannot change between the data and a look,
// while a repair of a G3 check (which lives in scripts/uefa-replicate-run.mjs, with the I/O and the reporting) leaves this file's sha256 alone.
//   THE RULE LOADER. The module does not import the rule file: it reads the file's bytes, cuts the RULE block by the rule's recipe, hashes that block text itself, and evaluates THE BLOCK TEXT (comments, the constant RULE and the functions decide, stopVerdict and look2Gate) in a fresh function scope.
//   Whatever the unhashed part of the rule file (its importer, its command line, anything appended after the end marker) exports or does is therefore never what the verdict runs through, and G3 (b) compares the hash of the very text that was executed.
//   `new Function` is used on a file in this repository, committed before any data and checked by G3 (b) against its commit; it is not applied to any fetched text.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const RULE_FILE = fileURLToPath(new URL('../outbox/forecast-replicate-uefa-2026-11-28.mjs', import.meta.url))
export const sha256 = b => createHash('sha256').update(b).digest('hex')
const BEGIN = '// ==== RULE BEGIN', END = '// ==== RULE END'

/** The block of a file's text by the rule's recipe: the lines from the BEGIN marker line to the END marker line inclusive, LF-joined, no trailing newline; null unless each marker line occurs exactly once (as a whole line) and BEGIN precedes END. */
export function blockOf(text) {
  const lines = text.split('\n'), b = [], e = []
  lines.forEach((l, i) => { if (l === BEGIN) b.push(i); if (l === END) e.push(i) })
  return b.length === 1 && e.length === 1 && e[0] > b[0] ? lines.slice(b[0], e[0] + 1).join('\n') : null
}
export const markerCounts = text => ({ begin: text.split('\n').filter(l => l === BEGIN).length, end: text.split('\n').filter(l => l === END).length })
export const blockSha256Of = text => { const b = blockOf(text); return b === null ? null : sha256(b) }

/** Evaluates a block's text and returns the rule's names. The block is self-contained: comments, `const RULE = {...}`, `const fin`, `function decide`, `function stopVerdict`, `function look2Gate`. */
export function evaluateBlock(block) {
  return new Function(`${block}\nreturn { RULE, decide, stopVerdict, look2Gate }`)()
}

const text = fs.readFileSync(RULE_FILE, 'utf8')
const block = blockOf(text)
if (block === null) throw new Error(`the RULE block of ${RULE_FILE} is missing, or a marker line does not occur exactly once ${JSON.stringify(markerCounts(text))}`)
export const ruleBlock = block
export const ruleBlockSha256 = sha256(block)
export const MARKER_LINES = markerCounts(text)
export const { RULE, decide, stopVerdict, look2Gate } = evaluateBlock(block)

export const LABELS = Object.keys(RULE.N)
export const SHORT = { 'UEFA Champions League': 'UCL', 'UEFA Europa League': 'UEL', 'UEFA Europa Conference League': 'UECL' }
export const BASE = RULE.baseCounts.map(c => c / RULE.baseN)
const mean = a => a.reduce((s, v) => s + v, 0) / a.length
const sdev = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) }
const logistic = z => 1 / (1 + Math.exp(-z))
export const probs = (gap, c = RULE.constants) => { const pH = (1 - c.share) * logistic((gap + c.home) / c.scale); return [pH, c.share, 1 - c.share - pH] }
export const brier = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0)
export const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
// The rule's order: (date, Date.parse(start_time), Number(espn_event_id)).
export const orderCmp = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (Date.parse(a.start_time) - Date.parse(b.start_time)) || (Number(a.espn_event_id) - Number(b.espn_event_id)))
export const orderRows = rows => rows.slice().sort(orderCmp)

/** The rule's counting rule, with the rows kept: per competition, in the rule's order, a row is a league-phase match iff BOTH clubs have played fewer than N earlier events. */
export function leaguePhaseRows(rows) {
  const out = { rows: [], perLabel: {}, clubsNotOnN: [], distinctClubs: {}, twoOnOneDate: 0, sameClub: 0 }
  for (const label of LABELS) {
    const rs = orderRows(rows.filter(r => r.sport === label))
    const n = new Map(), seenDay = new Set(), lpN = new Map()
    let lp = 0
    for (const r of rs) {
      if (r.home === r.away) out.sameClub++
      for (const k of [r.home, r.away]) { const d = `${k}|${r.date}`; if (seenDay.has(d)) out.twoOnOneDate++; seenDay.add(d) }
      const isLp = (n.get(r.home) ?? 0) < RULE.N[label] && (n.get(r.away) ?? 0) < RULE.N[label]
      if (isLp) { lp++; out.rows.push(r); lpN.set(r.home, (lpN.get(r.home) ?? 0) + 1); lpN.set(r.away, (lpN.get(r.away) ?? 0) + 1) }
      n.set(r.home, (n.get(r.home) ?? 0) + 1); n.set(r.away, (n.get(r.away) ?? 0) + 1)
    }
    out.perLabel[label] = lp
    out.distinctClubs[label] = n.size
    for (const [k, v] of lpN) if (v !== RULE.N[label]) out.clubsNotOnN.push(`${SHORT[label]}:${k}:${v}`)
    for (const k of n.keys()) if (!lpN.has(k)) out.clubsNotOnN.push(`${SHORT[label]}:${k}:0`)
  }
  return out
}

/** The forecasts of U for one season's rows: every league-phase match in the rule's order, rated by the club's EARLIER league-phase matches of this competition and season; eligible iff both clubs have >= K scored ones. The match enters the ratings only after its own forecast. */
export function forecastsOf(rows) {
  const all = []
  for (const label of LABELS) {
    const clubs = new Map()
    const get = c => { let x = clubs.get(c); if (!x) { x = { n: 0, g: 0, pts: 0, gf: 0, ga: 0 }; clubs.set(c, x) } return x }
    const rating = x => x.pts / x.g + RULE.weights.gd * (x.gf - x.ga) / x.g + RULE.weights.gf * x.gf / x.g
    for (const r of orderRows(rows.filter(r => r.sport === label))) {
      const H = get(r.home), A = get(r.away)
      if (H.n < RULE.N[label] && A.n < RULE.N[label] && r.home_score !== null && r.away_score !== null) {
        const hg = Number(r.home_score), ag = Number(r.away_score)
        const eligible = H.g >= RULE.K && A.g >= RULE.K
        all.push({ label, date: r.date, espn_event_id: r.espn_event_id, home: r.home, away: r.away, eligible, gap: eligible ? rating(H) - rating(A) : NaN, y: hg > ag ? 0 : hg === ag ? 1 : 2 })
        H.g++; A.g++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg
        H.pts += hg > ag ? 3 : hg === ag ? 1 : 0; A.pts += ag > hg ? 3 : hg === ag ? 1 : 0
      }
      H.n++; A.n++
    }
  }
  return all
}

/** The home-win slope of the rule: the coefficient on logit(pHome) in the logistic regression of "home win" on [1, logit(pHome)], Newton's method from (0, 1), at most 100 iterations, stopping when the step is < 1e-12; the standard error is the square root of the [1][1] element of the inverse observed information at the final point. */
export function homeSlope(pHome, yHome, maxIter = RULE.slopeMaxIter) {
  const x = pHome.map(p => Math.log(p / (1 - p)))
  let c0 = 0, c1 = 1
  const info = () => { let i00 = 0, i01 = 0, i11 = 0, g0 = 0, g1 = 0; for (let i = 0; i < x.length; i++) { const mu = logistic(c0 + c1 * x[i]), w = mu * (1 - mu); g0 += yHome[i] - mu; g1 += (yHome[i] - mu) * x[i]; i00 += w; i01 += w * x[i]; i11 += w * x[i] * x[i] } return { i00, i01, i11, g0, g1, det: i00 * i11 - i01 * i01 } }
  let converged = false
  for (let it = 0; it < maxIter; it++) {
    const { i00, i01, i11, g0, g1, det } = info()
    const d0 = (i11 * g0 - i01 * g1) / det, d1 = (-i01 * g0 + i00 * g1) / det
    c0 += d0; c1 += d1
    if (Math.hypot(d0, d1) < RULE.slopeStepTol) { converged = true; break }
  }
  const f = info()
  // no convergence within the iteration cap: the rule's G2 fails (NaN is not a finite number)
  return converged ? { slope: c1, se: Math.sqrt(f.i00 / f.det) } : { slope: NaN, se: NaN }
}

/** The statistic and the guard inputs of a set of ELIGIBLE forecasts, in the rule's order. Pure arithmetic of the rule; nothing is rounded. */
export function scoreForecasts(fs) {
  const pU = fs.map(f => probs(f.gap)), bU = fs.map((f, i) => brier(pU[i], f.y)), bB = fs.map(f => brier(BASE, f.y))
  const D = bU.map((v, i) => v - bB[i])
  const zOf = d => (d.length >= 2 ? mean(d) / (sdev(d) / Math.sqrt(d.length)) : NaN)
  const folds = LABELS.map(l => { const ix = fs.map((f, i) => (f.label === l ? i : -1)).filter(i => i >= 0); return { name: l, n: ix.length, z: zOf(ix.map(i => D[i])), brierU: mean(ix.map(i => bU[i])), brierBase: mean(ix.map(i => bB[i])) } })
  const sl = fs.length >= 3 ? homeSlope(pU.map(p => p[0]), fs.map(f => (f.y === 0 ? 1 : 0))) : { slope: NaN, se: NaN }
  return { n: fs.length, z: zOf(D), folds, slope: sl.slope, slopeSE: sl.se, meanD: fs.length ? mean(D) : NaN, sdD: fs.length > 1 ? sdev(D) : NaN, brierU: mean(bU), brierBase: mean(bB) }
}

/** Reported, not gating: log loss of U and of the base rate, U's Brier against uniform, the observed shares against the draw share assumed, the iid SE of mean D beside the SE clustered by HOME club (CR0). Never an input to a verdict. */
export function reported(fs) {
  const pU = fs.map(f => probs(f.gap)), D = fs.map((f, i) => brier(pU[i], f.y) - brier(BASE, f.y)), m = mean(D), cl = new Map()
  fs.forEach((f, i) => cl.set(f.home, (cl.get(f.home) ?? 0) + (D[i] - m)))
  return {
    logLossU: mean(fs.map((f, i) => -Math.log(pU[i][f.y]))), logLossBase: mean(fs.map(f => -Math.log(BASE[f.y]))), brierUniform: mean(fs.map(f => brier([1 / 3, 1 / 3, 1 / 3], f.y))),
    observedShares: [0, 1, 2].map(k => fs.filter(f => f.y === k).length / fs.length), drawShareAssumed: RULE.constants.share,
    seIid: sdev(D) / Math.sqrt(D.length), seClusteredByHomeClub: Math.sqrt([...cl.values()].reduce((s, v) => s + v * v, 0)) / D.length,
  }
}

/** The opening matches, reported and not scored: the league-phase matches that get no forecast because a club has fewer than K scored league-phase matches before it, per competition (counts only). */
export function openingMatches(rows) { const all = forecastsOf(rows); return Object.fromEntries(LABELS.map(l => [l, all.filter(f => f.label === l && !f.eligible).length])) }

// ---- the sets and the verdict call (everything that decides WHICH forecasts are scored lives in this pinned module, not in the run module)
/** Eligibility counts per competition from the presence of scores only: no gap, probability or outcome is computed (G3 (m)). Same counting rule and K as forecastsOf. */
export function eligibilityCounts(rows) {
  const out = Object.fromEntries(LABELS.map(l => [l, { leaguePhase: 0, eligible: 0, forward: 0 }]))
  for (const label of LABELS) {
    const n = new Map(), g = new Map()
    for (const r of orderRows(rows.filter(r => r.sport === label))) {
      if ((n.get(r.home) ?? 0) < RULE.N[label] && (n.get(r.away) ?? 0) < RULE.N[label] && r.home_score !== null && r.away_score !== null) {
        out[label].leaguePhase++
        if ((g.get(r.home) ?? 0) >= RULE.K && (g.get(r.away) ?? 0) >= RULE.K) { out[label].eligible++; if (r.date >= RULE.look2.forwardFrom) out[label].forward++ }
        g.set(r.home, (g.get(r.home) ?? 0) + 1); g.set(r.away, (g.get(r.away) ?? 0) + 1)
      }
      n.set(r.home, (n.get(r.home) ?? 0) + 1); n.set(r.away, (n.get(r.away) ?? 0) + 1)
    }
  }
  return out
}
/** The Look 1 set: the eligible forecasts of the 2024-25 rows, in the rule's order within each competition. */
export const look1Set = rows24 => forecastsOf(rows24).filter(f => f.eligible)
/** The FORWARD set: the eligible forecasts of the 2026-27 read whose requested day is on or after forwardFrom (the frozen matches are rating inputs only, never scored). */
export const forwardSet = rows26 => forecastsOf(rows26).filter(f => f.eligible && f.date >= RULE.look2.forwardFrom)
/** The frozen 2026-27 eligible forecasts (REPORTED only: the pooled z with them included, for disclosure). */
export const frozenSet = rows26 => forecastsOf(rows26).filter(f => f.eligible && f.date <= RULE.look2.frozenThrough)
/** The Look 2 pool: the Look 1 forecasts first, then the forward ones. */
export const look2Pool = (rows24, rows26) => look1Set(rows24).concat(forwardSet(rows26))
/** The verdict of a scored set at a look: the rule's decide() on the statistics (G3 having passed). */
export const verdictOf = (look, s) => decide(look, { integrityOk: true, z: s.z, folds: s.folds, slope: s.slope, slopeSE: s.slopeSE })
