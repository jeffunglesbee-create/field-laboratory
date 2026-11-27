// A ONE-OFF MEASUREMENT THAT DECIDES WHETHER A TABLE-BASED UEFA LEAGUE-PHASE FORECAST (candidate U) MAY BE BUILT. Written 2026-11-27 for
// docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md, Task 2, on the owner's "confirmed, pull-only" (2026-11-27: a modelled forecast, pull-only, drawn on request; Rule A
// not cleared). It fits U on last season's UEFA league phase (the archive's rows, written 2026-11-27), scores it by leaving one competition out at a time, and on the league-phase
// matches of this season frozen on 2026-11-27, and prints a mechanical VERDICT. It changes nothing in src/.
//
// THE RULE WAS COMMITTED ALONE FIRST (dc9fdce5, 2026-11-27T20:49:09Z): nothing had been fetched, fitted or scored, and no UEFA model number existed. The two data bundles came next
// (584b517e), then THIS tooling, committed BEFORE the run; each later commit leaves the RULE block byte-identical (its sha256 is printed by `--print-rule-hash`, recorded in dc9fdce5's
// commit message and pinned below as RULE_SHA256, and U6 requires them to be equal). The tooling was tested ONLY on synthetic seasons (scripts/check-uefa-fit.mjs and its mutation
// harness): no real model number was computed before the run. One DATA-ONLY pass (`--integrity-only`: league-phase counts and club counts, no rating, no fit, no score) may be run first.
//
// RUN.   node outbox/forecast-fit-uefa-2026-11-27.mjs <training-bundle.json> <frozen-bundle.json> [--json=<path>] [--integrity-only]
//        node outbox/forecast-fit-uefa-2026-11-27.mjs --print-rule-hash     (prints the sha256 of the RULE block)
//        node outbox/forecast-fit-uefa-2026-11-27.mjs --print-rule          (prints the RULE block)
//   Exit 0 only if every integrity check holds; the VERDICT line is separate from the exit code. Coverage is printed where each number is.
// LICENCE of the match data (ESPN's scoreboard, stored in the relay's archive) is NOT assessed here (STANDARDS Rule 45): flagged for a human.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SELF_PATH = fileURLToPath(import.meta.url)
const sha256 = b => createHash('sha256').update(b).digest('hex')

// ==== RULE BEGIN
// THE SHIP RULE FOR CANDIDATE U. FIXED BEFORE ANY UEFA MODEL NUMBER WAS COMPUTED, and committed before the data bundles were committed or this script was run on them.
//
// THE CANDIDATE.  U is the EPL's shipped table-v2 form applied to a UEFA league phase, with its three constants REFITTED on UEFA data:
//     rating(club) = ppg + 0.25 * gdpg + 0.10 * gfpg   over the club's league-phase matches in THIS competition played BEFORE the match (3 / 1 / 0 points; goal difference and goals
//                    for, each per game). The 0.25 and 0.10 are table-v1's, chosen on the EPL, NOT fitted on UEFA data and not changed.
//     d = rating(home) - rating(away) + home;  pDraw = share;  pHome = (1 - share) * logistic(d / scale);  pAway = 1 - pDraw - pHome.
//   Three constants: home, scale, share. They are fitted by MAXIMUM LIKELIHOOD (three-way outcome log-likelihood) on the forecasts of the training set and ROUNDED TO TWO DECIMALS
//   before U is scored on anything but its own fit, because the rounded values are what would ship. (Cross-validation folds fit and round the same way, once per fold.)
//   No other quantity is fitted. There is no early-season shrinkage, no prior, no cross-competition rating, no club identity outside the competition and no market input.
//
// THE MATCHES.  A match is a LEAGUE-PHASE MATCH of a competition and season iff BOTH clubs have played fewer than N earlier matches in that competition and season, counting the
//   archive's rows in date order, with N = 8 (UEFA Champions League), 8 (UEFA Europa League), 6 (UEFA Europa Conference League). This is mechanical: a club plays exactly N league-phase
//   matches before any playoff or knockout match, so its (N+1)th row is the first not in the league phase. Knockout ties (two legs, an aggregate) are NOT forecast by U.
//   SEASON: a main-label row dated before 2026-08-01 belongs to 2025-26; a row dated 2026-08-01 or later belongs to 2026-27. The three Qualifying labels are not used.
//   ELIGIBLE FORECAST: a league-phase match with BOTH clubs having >= 3 league-phase matches played before it (K = 3). Fewer is "opening matches": reported, never gated.
//   OUTCOME: the archive row's home_score against away_score (home win, draw, away win). A match with a null score is excluded and counted.
//   TRAINING / CV SEASON 2025-26: expected 144 + 144 + 108 = 396 league-phase matches (a 36-team league phase of 8 matches each, and of 6 for the Conference League); eligible forecasts
//   are counted by the script and printed, not assumed here. FROZEN BUNDLE 2026-27: main-label rows dated 2026-08-01 to 2026-11-26 inclusive, frozen on 2026-11-27; the archive then
//   held 90 + 90 + 72 league-phase matches (Champions League, Europa League, Conference League).
//
// THE FOLDS.  LEAVE ONE COMPETITION OUT: fit U on the eligible forecasts of two of the three 2025-26 competitions, score it on the third; do it for each. The pooled out-of-fold forecasts
//   are the CV SET. (Clubs do not play two of the competitions in one season, so a held-out competition has no club in its training matches.)
// THE BENCHMARKS.  BASE RATE = the home / draw / away shares of the fold's TRAINING eligible forecasts, the same three numbers for every match (for the frozen bundle: the shares of ALL
//   2025-26 eligible forecasts). It is the forecast anyone could make without a table, and the benchmark for whether the table adds anything. UNIFORM = 1/3 each (reported only).
//   EPL CONSTANTS = table-v2 as shipped (home 0.42, scale 1.14, share 0.27) on the same ratings (reported only).
// BRIER = the sum over the three outcomes of (forecast - indicator)^2, so a uniform guess scores 0.6667. z = mean paired difference / (sd / sqrt n); NEGATIVE FAVOURS U.
// SLOPE = the coefficient on logit(pHome) in a logistic regression of "home win" on [1, logit(pHome)] by maximum likelihood; its SE from the inverse observed information.
//
// U MAY BE BUILT (Task 3) ONLY IF ALL of these hold:
//   U1  the CV SET: U's Brier is below the base rate's, paired per match, z <= -1.645 (one-sided 5%: the direction was predicted)
//   U2  each of the THREE folds on its own: U's paired z against the base rate is <= +1.0 (no competition is clearly worse than a table-free forecast)
//   U3  the CV SET: U's home-win slope is within 1.96 standard errors of 1
//   U4  the FROZEN BUNDLE (2026-27, eligible forecasts, U with the rounded constants fitted on ALL 2025-26 eligible forecasts): U's Brier is not above the base rate's (paired mean
//       difference <= 0). A tripwire in the direction only: its outcome was NOT known when this rule was written. Its n is printed; a small n makes it weak, and that is accepted.
//   U5  the fit on all 2025-26 eligible forecasts is well posed: two unrelated solvers (Newton with analytic gradient and Hessian; Nelder-Mead) agree to 1e-9 in log loss, the largest
//       gradient component is <= 1e-4 in absolute value, the Hessian is positive definite, and none of the THREE constants lies within 1e-6 of a bound
//       (home in [-1.0, 2.0], scale in [0.20, 5.00], share in [0.02, 0.80])
//   U6  every integrity check in the script holds: 396 league-phase matches in 2025-26 (144 + 144 + 108) with every club on exactly 8 / 8 / 6 of them; the frozen bundle's league-phase
//       counts equal 90 / 90 / 72; no duplicate ESPN event id; no null score in a league-phase match; the bundle files match their pinned sha256; the rule block's sha256 equals the one
//       recorded in the commit that fixed it
//   Any rule failing is "DO NOT BUILD", and the output names the rule.
// NO FURTHER LOOK.  If any rule fails there is no second pass over 2025-26, no refit, no change of K, of the weights or of the folds, and no alternative candidate on these data: the
//   verdict stands and no UEFA forecast is built. Any revision after that is a new decision with new matches to read. If every rule passes, the constants Task 3 ships are EXACTLY the
//   rounded 2025-26 values this script prints, nothing re-tuned, and the method string carries them.
// REPORTED, NOT GATING: log loss; U against a uniform guess and against the EPL constants; per-fold constants and Briers; the opening matches (both clubs on 1-2 league-phase matches),
//   which U does not forecast; K = 4 as a sensitivity; draws (U's share against the observed); the frozen bundle's Brier against the base rate with its z; pooled folds' constants.
//
// DISCLOSED: what was known when this rule was fixed, so the reader can see what is not blind.
//   NO MODEL NUMBER. No UEFA model number, home / draw / away share, league table, rating or Brier has been computed or read. The thresholds above were chosen blind, from the sizes the
//     FORMAT allows (about 230 CV forecasts and about 90 frozen ones) and from the EPL precedent, not from any UEFA result. No power calculation was possible. The rule may fail on a
//     real but small effect, and that is accepted: the EPL's table-v1 was refitted once under a rule fixed first and the rule said do not ship.
//   WHAT WAS SEEN. The archive's row counts per label and per date (Champions League 279 rows on 44 dates, Europa League 279 on 27, Conference League 225 on 20, and the date lists);
//     ESPN's completed-match counts per window (186 / 186 / 150 for 2025-09-01 to 2026-04-30); and ONE served day, /context/date/2025-12-10: nine Champions League results were
//     printed in full while confirming that the rows carry scores. No tally of results was made.
//   WHAT THE AUTHOR KNOWS. The author has general knowledge of parts of the 2025-26 UEFA competitions from before this session. None of it was read from the data, and none of it
//     enters a number: the only inputs are the archive's rows in the bundle files.
//   CHOICES MADE WITHOUT DATA. K = 3 (K = 4 would leave about 180 forecasts, K = 5 about 120, from the format's arithmetic alone); the weights 0.25 and 0.10 (the EPL's); the thresholds
//     in U1 to U5; leave-one-competition-out as the fold. The CV is WITHIN the fit season: it asks whether the table has skill on a competition it was not fitted on, not whether it
//     forecasts the future. The forward evidence is the frozen bundle, and about 90 forecasts is too few to say anything about calibration.
//   WHAT THESE DATA CANNOT SAY (written now, before any number): (1) the z's treat matches as independent and clubs appear in several of them; (2) a rating from 3 to 7 matches is noisy
//     and the draw and scale constants absorb that, so a pass is evidence of skill over a table-free forecast on this format, not of a good rating; (3) knockout ties, whose second legs
//     depend on the first, are not forecast and nothing here says they could be; (4) 2026-27's league phase is partly played, so the frozen bundle is early-season, and the two
//     seasons' constants may differ.
const RULE = {
  K: 3,
  N: { 'UEFA Champions League': 8, 'UEFA Europa League': 8, 'UEFA Europa Conference League': 6 },
  weights: { gd: 0.25, gf: 0.10 },
  seasonCut: '2026-08-01',
  frozenThrough: '2026-11-26',
  expectedLeaguePhase2025: { 'UEFA Champions League': 144, 'UEFA Europa League': 144, 'UEFA Europa Conference League': 108 },
  expectedLeaguePhaseFrozen: { 'UEFA Champions League': 90, 'UEFA Europa League': 90, 'UEFA Europa Conference League': 72 },
  z1: -1.645,
  z2Fold: 1.0,
  slopeSigma: 1.96,
  forwardMaxDiff: 0,
  solverLogLossGap: 1e-9,
  maxGradient: 1e-4,
  bounds: { home: [-1.0, 2.0], scale: [0.2, 5.0], share: [0.02, 0.8] },
  boundEps: 1e-6,
}
function decide(m) {
  const failed = []
  if (!(m.z1 <= RULE.z1)) failed.push(`U1 CV-set paired z against the base rate ${m.z1?.toFixed?.(2)} is not <= ${RULE.z1}`)
  for (const f of m.folds ?? []) if (!(f.z <= RULE.z2Fold)) failed.push(`U2 fold "${f.name}" paired z against the base rate ${f.z?.toFixed?.(2)} is not <= ${RULE.z2Fold}`)
  if (!(m.folds?.length === 3)) failed.push('U2 there are not three folds')
  if (!(Math.abs(m.slope - 1) <= RULE.slopeSigma * m.slopeSE)) failed.push(`U3 CV-set home-win slope ${m.slope?.toFixed?.(2)} (SE ${m.slopeSE?.toFixed?.(2)}) differs from 1 by more than ${RULE.slopeSigma} SE`)
  if (!(m.forwardDiff <= RULE.forwardMaxDiff)) failed.push(`U4 frozen-bundle Brier minus the base rate's ${m.forwardDiff?.toFixed?.(4)} is not <= ${RULE.forwardMaxDiff}`)
  if (!m.wellPosed) failed.push('U5 the fit on all 2025-26 eligible forecasts is not well posed')
  if (!m.integrity) failed.push('U6 an integrity check failed')
  return { verdict: failed.length === 0 ? 'BUILD' : 'DO NOT BUILD', failed }
}
// ==== RULE END

const SELF_SRC = fs.readFileSync(SELF_PATH, 'utf8')
const ruleBlock = (() => {
  const a = SELF_SRC.indexOf('// ==== RULE BEGIN'), b = SELF_SRC.indexOf('// ==== RULE END')
  return a >= 0 && b > a ? SELF_SRC.slice(a, b + '// ==== RULE END'.length) : null
})()
if (ruleBlock === null) { console.error('the RULE block is missing'); process.exit(2) }


// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// THE TOOLING. Nothing below is part of the rule: it computes what the rule defines, and it is tested on synthetic data only.
const RULE_SHA256 = '6cf976ba8b895439894346c066c22ff752d2789b208cdccdb563ddae41118cf1' // the RULE block's sha256, from the commit message of dc9fdce5
const PINNED = { // the bundles' sha256, as committed by the data workflow in 584b517e (before this tooling existed)
  train: '45fae278311bbea97882766aa911c850ff181e21e4668d20008bf5e76b9ba2e2',
  frozen: '3ccdad96a359bbdc6f1e0608058dec23f26a04dcc944817d648594f28130735e',
}
const LABELS = Object.keys(RULE.N)
const SHORT = { 'UEFA Champions League': 'UCL', 'UEFA Europa League': 'UEL', 'UEFA Europa Conference League': 'UECL' }
const EPL = { home: 0.42, scale: 1.14, share: 0.27 } // table-v2 as shipped, a benchmark only
// CLUB IDENTITY. The archive writes a club under more than one spelling: the three FINAL rows (2026-05-20, 05-27, 05-30) carry full names, every other row of 2025-26 ESPN's short ones, and
// two 2026-27 clubs change spelling mid-season. Found by the DATA-ONLY pass (--integrity-only: names, dates and row counts, no score and no model number) before the run, and fixed here, in the
// tooling, outcome-blind: the rule block is untouched. A spelling split would give a club a rating built from part of its matches. This map is applied to BOTH bundles and recorded in the
// session document; the integrity checks below (36 distinct clubs a competition, every 2025-26 club on exactly N league-phase matches) are what notice a spelling the map does not know.
const CLUB_ALIASES = { 'Paris Saint-Germain': 'PSG', 'SC Freiburg': 'Freiburg', 'Crystal Palace': 'C Palace', 'Rayo Vallecano': 'Rayo', 'Man United': 'Man Utd', 'Ararat': 'Ararat-Armenia' }
const canon = c => CLUB_ALIASES[c] ?? c
const round2 = x => Math.round(x * 100) / 100
const mean = a => a.reduce((s, v) => s + v, 0) / a.length
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) }
const pairedZ = (a, b) => { const d = a.map((v, i) => v - b[i]); return mean(d) / (sd(d) / Math.sqrt(d.length)) }
const logistic = z => 1 / (1 + Math.exp(-z))
const cmpRow = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start_time ?? '') < (b.start_time ?? '') ? -1 : (a.start_time ?? '') > (b.start_time ?? '') ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// The three-way probabilities of the rule: pHome = (1 - share) * logistic((gap + home) / scale), pDraw = share, pAway = the remainder.
function probs(gap, c) {
  const pH = (1 - c.share) * logistic((gap + c.home) / c.scale)
  return [pH, c.share, 1 - c.share - pH]
}
const brier = (p, y) => p.reduce((s, v, k) => s + (v - (k === y ? 1 : 0)) ** 2, 0)
const meanNLL = (fs, c) => mean(fs.map(f => -Math.log(probs(f.gap, c)[f.y])))
const shares = fs => [0, 1, 2].map(k => fs.filter(f => f.y === k).length / fs.length)

// ---- league-phase matches, point-in-time ratings, eligibility. `rows` are ONE season of the three main labels. N and K may be overridden only by tests.
function prepare(rows, { N = RULE.N, K = RULE.K } = {}) {
  const out = []
  const integrity = { leaguePhase: {}, distinctClubs: {}, clubsNotOnN: [], nullScores: 0, dupIds: 0, dupEspnIds: 0, sameClub: 0 }
  const seenId = new Set(), seenEspn = new Set()
  for (const r of rows) {
    if (seenId.has(r.id)) integrity.dupIds++
    seenId.add(r.id)
    if (r.espn_event_id !== null && r.espn_event_id !== undefined) { if (seenEspn.has(r.espn_event_id)) integrity.dupEspnIds++; seenEspn.add(r.espn_event_id) }
  }
  for (const label of Object.keys(N)) {
    const rs = rows.filter(r => r.sport === label).slice().sort(cmpRow)
    const clubs = new Map() // club -> { n: rows so far in this competition, g: scored league-phase games, pts, gf, ga }
    const get = c => { let x = clubs.get(c); if (!x) { x = { n: 0, g: 0, pts: 0, gf: 0, ga: 0 }; clubs.set(c, x) } return x }
    let lp = 0
    for (const r of rs) {
      const H = get(canon(r.home)), A = get(canon(r.away))
      if (canon(r.home) === canon(r.away)) integrity.sameClub++
      const isLp = H.n < N[label] && A.n < N[label]
      if (isLp) {
        lp++
        if (r.home_score === null || r.home_score === undefined || r.away_score === null || r.away_score === undefined) integrity.nullScores++
        else {
          const hg = Number(r.home_score), ag = Number(r.away_score)
          const rating = x => x.pts / x.g + RULE.weights.gd * (x.gf - x.ga) / x.g + RULE.weights.gf * x.gf / x.g
          const eligible = H.g >= K && A.g >= K
          out.push({ label, date: r.date, gH: H.g, gA: A.g, eligible, gap: eligible ? rating(H) - rating(A) : NaN, y: hg > ag ? 0 : hg === ag ? 1 : 2 })
          // the match enters the ratings only AFTER its own features were taken
          H.g++; A.g++
          H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg
          H.pts += hg > ag ? 3 : hg === ag ? 1 : 0
          A.pts += ag > hg ? 3 : hg === ag ? 1 : 0
        }
      }
      H.n++; A.n++
    }
    integrity.leaguePhase[label] = lp
    integrity.distinctClubs[label] = clubs.size
    for (const [club, x] of clubs) if (x.g !== N[label]) integrity.clubsNotOnN.push(`${SHORT[label] ?? label}:${club}:${x.g}`)
  }
  return { matches: out, integrity }
}

// ---- the fit: three constants by maximum likelihood.
// The share's MLE is the draw frequency (it is a constant); (home, scale) are the logistic regression of the decisive matches on the rating gap, reparametrised z = a*gap + b.
function fitNewton(fs) {
  const n = fs.length
  const share = fs.filter(f => f.y === 1).length / n
  const dec = fs.filter(f => f.y !== 1)
  let a = 1, b = 0.3, converged = false, iterations = 0
  const ll = (a_, b_) => dec.reduce((s, f) => { const z = a_ * f.gap + b_; return s + (f.y === 0 ? -Math.log1p(Math.exp(-z)) : -Math.log1p(Math.exp(z))) }, 0)
  for (; iterations < 200; iterations++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0
    for (const f of dec) { const mu = logistic(a * f.gap + b), t = f.y === 0 ? 1 : 0, w = mu * (1 - mu); g0 += (t - mu) * f.gap; g1 += (t - mu); h00 += w * f.gap * f.gap; h01 += w * f.gap; h11 += w }
    const det = h00 * h11 - h01 * h01
    if (!(det > 0)) break
    let d0 = (h11 * g0 - h01 * g1) / det, d1 = (-h01 * g0 + h00 * g1) / det
    let step = 1; const base = ll(a, b)
    while (step > 1e-10 && !(ll(a + step * d0, b + step * d1) >= base - 1e-14)) step /= 2
    a += step * d0; b += step * d1
    if (Math.hypot(step * d0, step * d1) < 1e-13) { converged = true; break }
  }
  const c = { home: b / a, scale: 1 / a, share }
  return { ...c, a, converged: converged && a > 0, iterations, meanNLL: a > 0 ? meanNLL(fs, c) : Infinity }
}
function nelderMead(f, x0, step, maxIter = 40000) {
  const n = x0.length
  let S = [x0.slice(), ...x0.map((v, i) => { const x = x0.slice(); x[i] = v + step[i]; return x })]
  let F = S.map(f)
  for (let it = 0; it < maxIter; it++) {
    const idx = F.map((_, i) => i).sort((i, j) => F[i] - F[j]); S = idx.map(i => S[i]); F = idx.map(i => F[i])
    if (Math.abs(F[n] - F[0]) <= 1e-17 && S.every(s => Math.hypot(...s.map((v, k) => v - S[0][k])) < 1e-9)) break
    const c = S[0].map((_, k) => mean(S.slice(0, n).map(s => s[k])))
    const refl = c.map((v, k) => v + (v - S[n][k])), fr = f(refl)
    if (fr < F[0]) { const ex = c.map((v, k) => v + 2 * (v - S[n][k])), fe = f(ex); if (fe < fr) { S[n] = ex; F[n] = fe } else { S[n] = refl; F[n] = fr } }
    else if (fr < F[n - 1]) { S[n] = refl; F[n] = fr }
    else {
      const con = fr < F[n] ? c.map((v, k) => v + 0.5 * (refl[k] - v)) : c.map((v, k) => v + 0.5 * (S[n][k] - v)), fc = f(con)
      if (fc < Math.min(fr, F[n])) { S[n] = con; F[n] = fc } else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, k) => S[0][k] + 0.5 * (v - S[0][k])); F[i] = f(S[i]) }
    }
  }
  const best = F.indexOf(Math.min(...F))
  return { x: S[best], f: F[best] }
}
// An UNRELATED solver: Nelder-Mead on the full three-constant mean log loss, from a start that is not the Newton solution, restarted until it stops improving.
function fitSimplex(fs) {
  const f = x => (x[1] <= 1e-3 || x[2] <= 1e-6 || x[2] >= 1 - 1e-6 ? Infinity : meanNLL(fs, { home: x[0], scale: x[1], share: x[2] }))
  let best = nelderMead(f, [0, 1, 0.25], [0.3, 0.3, 0.05])
  for (let r = 0; r < 8; r++) { const next = nelderMead(f, best.x, [0.05 / (r + 1), 0.05 / (r + 1), 0.01 / (r + 1)]); if (best.f - next.f < 1e-16) { if (next.f < best.f) best = next; break } best = next }
  return { home: best.x[0], scale: best.x[1], share: best.x[2], meanNLL: best.f }
}
function wellPosed(fs, fit) {
  const c = { home: fit.home, scale: fit.scale, share: fit.share }
  const f = x => meanNLL(fs, { home: x[0], scale: x[1], share: x[2] })
  const x0 = [c.home, c.scale, c.share]
  const simplex = fitSimplex(fs)
  const solverGap = Math.abs(simplex.meanNLL - fit.meanNLL)
  const grad = x0.map((_, i) => { const h = 1e-6, p = x0.slice(), m = x0.slice(); p[i] += h; m[i] -= h; return (f(p) - f(m)) / (2 * h) })
  const maxGrad = Math.max(...grad.map(Math.abs))
  const H = x0.map((_, i) => x0.map((__, j) => { const h = 1e-3, pp = x0.slice(), pm = x0.slice(), mp = x0.slice(), mm = x0.slice(); pp[i] += h; pp[j] += h; pm[i] += h; pm[j] -= h; mp[i] -= h; mp[j] += h; mm[i] -= h; mm[j] -= h; return (f(pp) - f(pm) - f(mp) + f(mm)) / (4 * h * h) }))
  const minor2 = H[0][0] * H[1][1] - H[0][1] * H[1][0]
  const det3 = H[0][0] * (H[1][1] * H[2][2] - H[1][2] * H[2][1]) - H[0][1] * (H[1][0] * H[2][2] - H[1][2] * H[2][0]) + H[0][2] * (H[1][0] * H[2][1] - H[1][1] * H[2][0])
  const pd = H[0][0] > 0 && minor2 > 0 && det3 > 0
  const B = RULE.bounds
  const onBound = [['home', c.home], ['scale', c.scale], ['share', c.share]].filter(([k, v]) => v <= B[k][0] + RULE.boundEps || v >= B[k][1] - RULE.boundEps).map(([k]) => k)
  const ok = fit.converged && solverGap <= RULE.solverLogLossGap && maxGrad <= RULE.maxGradient && pd && onBound.length === 0
  return { ok, solverGap, maxGrad, pd, onBound, simplex: { home: simplex.home, scale: simplex.scale, share: simplex.share } }
}
// Home-win calibration slope: logistic regression of "home win" on [1, logit(pHome)], with its standard error.
function homeSlope(pHome, yHome) {
  const x = pHome.map(p => Math.log(p / (1 - p)))
  let c0 = 0, c1 = 1, i00 = 0, i01 = 0, i11 = 0
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0; i00 = 0; i01 = 0; i11 = 0
    for (let i = 0; i < x.length; i++) { const mu = logistic(c0 + c1 * x[i]), w = mu * (1 - mu); g0 += yHome[i] - mu; g1 += (yHome[i] - mu) * x[i]; i00 += w; i01 += w * x[i]; i11 += w * x[i] * x[i] }
    const det = i00 * i11 - i01 * i01
    const d0 = (i11 * g0 - i01 * g1) / det, d1 = (-i01 * g0 + i00 * g1) / det
    c0 += d0; c1 += d1
    if (Math.hypot(d0, d1) < 1e-12) break
  }
  return { slope: c1, intercept: c0, se: Math.sqrt(i00 / (i00 * i11 - i01 * i01)) }
}

// ---- the analysis for one K: leave one competition out, then the frozen bundle.
function analyse(trainRows, frozenRows, K = RULE.K, opts = {}) {
  const tr = prepare(trainRows, { K, ...opts }), fz = prepare(frozenRows, { K, ...opts })
  const elig = m => m.matches.filter(f => f.eligible)
  const byLabel = Object.fromEntries(LABELS.map(l => [l, elig(tr).filter(f => f.label === l)]))
  const folds = []
  const cv = { bU: [], bB: [], pH: [], yH: [], bEPL: [], bUni: [], nllU: [], nllB: [], y: [] }
  for (const label of LABELS) {
    const train = LABELS.filter(l => l !== label).flatMap(l => byLabel[l]), test = byLabel[label]
    const fit = fitNewton(train)
    const c = { home: round2(fit.home), scale: round2(fit.scale), share: round2(fit.share) }
    const base = shares(train)
    const pU = test.map(f => probs(f.gap, c)), bU = test.map((f, i) => brier(pU[i], f.y)), bB = test.map(f => brier(base, f.y))
    folds.push({ name: label, n: test.length, trainN: train.length, baseShares: base, fit: { home: fit.home, scale: fit.scale, share: fit.share }, constants: c, brierU: mean(bU), brierBase: mean(bB), z: pairedZ(bU, bB) })
    cv.bU.push(...bU); cv.bB.push(...bB)
    cv.pH.push(...pU.map(p => p[0])); cv.yH.push(...test.map(f => (f.y === 0 ? 1 : 0)))
    cv.bEPL.push(...test.map(f => brier(probs(f.gap, EPL), f.y))); cv.bUni.push(...test.map(f => brier([1 / 3, 1 / 3, 1 / 3], f.y)))
    cv.nllU.push(...pU.map((p, i) => -Math.log(p[test[i].y]))); cv.nllB.push(...test.map(f => -Math.log(base[f.y]))); cv.y.push(...test.map(f => f.y))
  }
  const all = LABELS.flatMap(l => byLabel[l])
  const fullFit = fitNewton(all)
  const full = { home: round2(fullFit.home), scale: round2(fullFit.scale), share: round2(fullFit.share) }
  const posed = wellPosed(all, fullFit)
  const slope = homeSlope(cv.pH, cv.yH)
  const fzE = elig(fz)
  const baseAll = shares(all)
  const fU = fzE.map(f => brier(probs(f.gap, full), f.y)), fB = fzE.map(f => brier(baseAll, f.y))
  return {
    K, trainLeaguePhase: tr.integrity.leaguePhase, frozenLeaguePhase: fz.integrity.leaguePhase,
    trainEligible: Object.fromEntries(LABELS.map(l => [l, byLabel[l].length])), frozenEligible: Object.fromEntries(LABELS.map(l => [l, fzE.filter(f => f.label === l).length])),
    openingMatches: { train: tr.matches.length - all.length, frozen: fz.matches.length - fzE.length },
    folds, cvN: cv.bU.length, cvBrierU: mean(cv.bU), cvBrierBase: mean(cv.bB), cvBrierEPL: mean(cv.bEPL), cvBrierUniform: mean(cv.bUni),
    cvLogLossU: mean(cv.nllU), cvLogLossBase: mean(cv.nllB), z1: pairedZ(cv.bU, cv.bB), zEPL: pairedZ(cv.bU, cv.bEPL),
    slope: slope.slope, slopeSE: slope.se, cvDrawObserved: cv.y.filter(y => y === 1).length / cv.y.length,
    fullFit: { raw: { home: fullFit.home, scale: fullFit.scale, share: fullFit.share }, constants: full, n: all.length, drawObserved: baseAll[1], baseShares: baseAll }, wellPosedDetail: posed, wellPosed: posed.ok,
    forwardN: fzE.length, forwardBrierU: fzE.length ? mean(fU) : NaN, forwardBrierBase: fzE.length ? mean(fB) : NaN, forwardDiff: fzE.length ? mean(fU) - mean(fB) : NaN, forwardZ: fzE.length > 2 ? pairedZ(fU, fB) : NaN,
    integrityRaw: { train: tr.integrity, frozen: fz.integrity },
  }
}

// ---- integrity (U6): data properties and provenance, none of them a model number.
function integrityChecks(trainText, frozenText, trainBundle, frozenBundle, an, ruleBlockText) {
  const checks = []
  const ck = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail })
  ck('the RULE block equals the one recorded when it was fixed', sha256(ruleBlockText) === RULE_SHA256, sha256(ruleBlockText))
  ck('the training bundle is the pinned one (sha256)', sha256(trainText) === PINNED.train, sha256(trainText))
  ck('the frozen bundle is the pinned one (sha256)', sha256(frozenText) === PINNED.frozen, sha256(frozenText))
  const T = an.integrityRaw.train, F = an.integrityRaw.frozen
  for (const l of LABELS) ck(`2025-26 ${SHORT[l]}: league-phase matches = ${RULE.expectedLeaguePhase2025[l]}`, T.leaguePhase[l] === RULE.expectedLeaguePhase2025[l], String(T.leaguePhase[l]))
  ck('2025-26: every club has played exactly N league-phase matches (N = 8 / 8 / 6)', T.clubsNotOnN.length === 0, T.clubsNotOnN.slice(0, 6).join(' '))
  for (const l of LABELS) ck(`frozen ${SHORT[l]}: league-phase matches = ${RULE.expectedLeaguePhaseFrozen[l]}`, F.leaguePhase[l] === RULE.expectedLeaguePhaseFrozen[l], String(F.leaguePhase[l]))
  ck('36 distinct clubs in each competition, in each bundle (a spelling the alias map does not know adds a name)', LABELS.every(l => T.distinctClubs[l] === 36 && F.distinctClubs[l] === 36), `${JSON.stringify(T.distinctClubs)} ${JSON.stringify(F.distinctClubs)}`)
  ck('no duplicate row id and no duplicate ESPN event id, in either bundle', T.dupIds + T.dupEspnIds + F.dupIds + F.dupEspnIds === 0, `${T.dupIds}/${T.dupEspnIds}/${F.dupIds}/${F.dupEspnIds}`)
  ck('no null score in a league-phase match, in either bundle', T.nullScores + F.nullScores === 0, `${T.nullScores}/${F.nullScores}`)
  ck('no match has the same club on both sides', T.sameClub + F.sameClub === 0, `${T.sameClub}/${F.sameClub}`)
  ck('the bundles\' own counts equal the rows they carry', trainBundle.counts.rows === trainBundle.rows.length && frozenBundle.counts.rows === frozenBundle.rows.length, `${trainBundle.counts.rows}/${trainBundle.rows.length} ${frozenBundle.counts.rows}/${frozenBundle.rows.length}`)
  ck('the training bundle holds only rows dated before the season cut, the frozen one only rows from it to the freeze day', trainBundle.rows.every(r => r.date < RULE.seasonCut) && frozenBundle.rows.every(r => r.date >= RULE.seasonCut && r.date <= RULE.frozenThrough), '')
  ck('every day of both windows answered 200', Object.keys(trainBundle.statuses).join() === '200' && Object.keys(frozenBundle.statuses).join() === '200', `${JSON.stringify(trainBundle.statuses)} ${JSON.stringify(frozenBundle.statuses)}`)
  return checks
}

function report(an, checks, verdict) {
  const L = []
  const p = (...a) => L.push(a.join(' '))
  const f4 = x => (Number.isFinite(x) ? x.toFixed(4) : String(x))
  p(`RULE block sha256 ${sha256(ruleBlock)}  (${ruleBlock.length} characters)`)
  p(`K = ${an.K}; league-phase matches 2025-26 ${JSON.stringify(an.trainLeaguePhase)}; frozen ${JSON.stringify(an.frozenLeaguePhase)}`)
  p(`eligible forecasts 2025-26 ${JSON.stringify(an.trainEligible)} (CV n ${an.cvN}); frozen ${JSON.stringify(an.frozenEligible)} (n ${an.forwardN}); opening matches (not forecast): 2025-26 ${an.openingMatches.train}, frozen ${an.openingMatches.frozen}`)
  for (const f of an.folds) p(`fold ${SHORT[f.name]}: test n ${f.n}, trained on ${f.trainN}; constants home ${f.constants.home} scale ${f.constants.scale} share ${f.constants.share} (raw ${f.fit.home.toFixed(4)} ${f.fit.scale.toFixed(4)} ${f.fit.share.toFixed(4)}); Brier U ${f4(f.brierU)} base ${f4(f.brierBase)} z ${f.z.toFixed(2)}`)
  p(`CV set (n ${an.cvN}): Brier U ${f4(an.cvBrierU)}, base rate ${f4(an.cvBrierBase)}, EPL constants ${f4(an.cvBrierEPL)}, uniform ${f4(an.cvBrierUniform)}; z against base ${an.z1.toFixed(2)}, against EPL constants ${an.zEPL.toFixed(2)}; log loss U ${f4(an.cvLogLossU)} base ${f4(an.cvLogLossBase)}`)
  p(`CV set home-win slope ${an.slope.toFixed(3)} +/- ${an.slopeSE.toFixed(3)}; draws observed ${an.cvDrawObserved.toFixed(3)} against the fitted share`)
  p(`FULL FIT on all ${an.fullFit.n} 2025-26 eligible forecasts: raw home ${an.fullFit.raw.home.toFixed(4)} scale ${an.fullFit.raw.scale.toFixed(4)} share ${an.fullFit.raw.share.toFixed(4)}; ROUNDED (what Task 3 would ship) home ${an.fullFit.constants.home} scale ${an.fullFit.constants.scale} share ${an.fullFit.constants.share}; base shares ${an.fullFit.baseShares.map(v => v.toFixed(3)).join(' / ')}`)
  const w = an.wellPosedDetail
  p(`well posed: ${w.ok}; solver gap ${w.solverGap.toExponential(2)}, max gradient ${w.maxGrad.toExponential(2)}, Hessian positive definite ${w.pd}, on a bound [${w.onBound.join(',')}]; simplex solution home ${w.simplex.home.toFixed(4)} scale ${w.simplex.scale.toFixed(4)} share ${w.simplex.share.toFixed(4)}`)
  p(`FROZEN bundle (n ${an.forwardN}): Brier U ${f4(an.forwardBrierU)}, base rate ${f4(an.forwardBrierBase)}, difference ${f4(an.forwardDiff)}, paired z ${Number.isFinite(an.forwardZ) ? an.forwardZ.toFixed(2) : 'n/a'}`)
  for (const c of checks) p(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' [' + c.detail + ']' : ''}`)
  p(`${checks.filter(c => c.ok).length} of ${checks.length} integrity checks passed`)
  p(`VERDICT: ${verdict.verdict}${verdict.failed.length ? '\n  ' + verdict.failed.join('\n  ') : ''}`)
  return L.join('\n')
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--print-rule-hash')) { console.log(`${sha256(ruleBlock)}  RULE block, ${ruleBlock.length} characters`); return 0 }
  if (args.includes('--print-rule')) { console.log(ruleBlock); return 0 }
  const [trainPath, frozenPath] = args.filter(a => !a.startsWith('--'))
  if (!trainPath || !frozenPath) { console.error('usage: node outbox/forecast-fit-uefa-2026-11-27.mjs <training-bundle.json> <frozen-bundle.json> [--json=<path>] [--integrity-only]'); return 2 }
  const trainText = fs.readFileSync(trainPath, 'utf8'), frozenText = fs.readFileSync(frozenPath, 'utf8')
  const trainBundle = JSON.parse(trainText), frozenBundle = JSON.parse(frozenText)
  if (args.includes('--integrity-only')) {
    // DATA ONLY: no rating gap is used, no constant is fitted, no outcome share or score is computed.
    const tr = prepare(trainBundle.rows), fz = prepare(frozenBundle.rows)
    console.log(`league-phase matches 2025-26 ${JSON.stringify(tr.integrity.leaguePhase)} (expected ${JSON.stringify(RULE.expectedLeaguePhase2025)}); frozen ${JSON.stringify(fz.integrity.leaguePhase)} (expected ${JSON.stringify(RULE.expectedLeaguePhaseFrozen)})`)
    console.log(`distinct clubs 2025-26 ${JSON.stringify(tr.integrity.distinctClubs)}, frozen ${JSON.stringify(fz.integrity.distinctClubs)} (expected 36 each)`)
    console.log(`clubs not on exactly N league-phase matches in 2025-26: ${tr.integrity.clubsNotOnN.length} ${tr.integrity.clubsNotOnN.slice(0, 12).join(' ')}`)
    console.log(`null scores ${tr.integrity.nullScores}/${fz.integrity.nullScores}; duplicate ids ${tr.integrity.dupIds}/${fz.integrity.dupIds}; duplicate ESPN ids ${tr.integrity.dupEspnIds}/${fz.integrity.dupEspnIds}; same club both sides ${tr.integrity.sameClub}/${fz.integrity.sameClub}`)
    console.log(`bundle sha256 ${sha256(trainText) === PINNED.train ? 'pinned' : 'NOT PINNED'} / ${sha256(frozenText) === PINNED.frozen ? 'pinned' : 'NOT PINNED'}; rule block ${sha256(ruleBlock) === RULE_SHA256 ? 'as recorded' : 'CHANGED'}`)
    return 0
  }
  const an = analyse(trainBundle.rows, frozenBundle.rows, RULE.K)
  const checks = integrityChecks(trainText, frozenText, trainBundle, frozenBundle, an, ruleBlock)
  const integrity = checks.every(c => c.ok)
  const verdict = decide({ z1: an.z1, folds: an.folds, slope: an.slope, slopeSE: an.slopeSE, forwardDiff: an.forwardDiff, wellPosed: an.wellPosed, integrity })
  const text = report(an, checks, verdict)
  console.log(text)
  // REPORTED, NOT GATING: K = 4 as a sensitivity (the same pipeline; nothing here enters the verdict)
  const an4 = analyse(trainBundle.rows, frozenBundle.rows, 4)
  console.log(`K = 4 (sensitivity, not gating): eligible ${an4.cvN} CV / ${an4.forwardN} frozen; CV z against base ${an4.z1.toFixed(2)}; slope ${an4.slope.toFixed(3)} +/- ${an4.slopeSE.toFixed(3)}; frozen difference ${Number.isFinite(an4.forwardDiff) ? an4.forwardDiff.toFixed(4) : 'n/a'}; full-fit constants home ${an4.fullFit.constants.home} scale ${an4.fullFit.constants.scale} share ${an4.fullFit.constants.share}`)
  const jsonArg = args.find(a => a.startsWith('--json='))
  if (jsonArg) fs.writeFileSync(jsonArg.slice('--json='.length), JSON.stringify({ verdict, ruleBlockSha256: sha256(ruleBlock), an: { ...an, integrityRaw: undefined }, integrity: checks, k4: { ...an4, integrityRaw: undefined } }, null, 1) + '\n')
  return integrity ? 0 : 1
}

export { CLUB_ALIASES, RULE, decide, prepare, fitNewton, fitSimplex, wellPosed, homeSlope, analyse, probs, pairedZ, brier, round2, shares, integrityChecks }
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exit(main())
