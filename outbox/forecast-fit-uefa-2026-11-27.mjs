// A ONE-OFF MEASUREMENT THAT DECIDES WHETHER A TABLE-BASED UEFA LEAGUE-PHASE FORECAST (candidate U) MAY BE BUILT. Written 2026-11-27 for
// docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md, Task 2, on the owner's "confirmed, pull-only" (2026-11-27: a modelled forecast, pull-only, drawn on request; Rule A
// not cleared). It fits U on last season's UEFA league phase (the archive's rows, written 2026-11-27), scores it by leaving one competition out at a time, and on the league-phase
// matches of this season frozen on 2026-11-27, and prints a mechanical VERDICT. It changes nothing in src/.
//
// THIS COMMIT HOLDS ONLY THE RULE. Nothing has been fetched, fitted or scored: no UEFA model number exists when this file is written. The data bundle, the fit and score code and the
// run are separate commits made AFTER this one, each leaving the RULE block below byte-identical (its sha256 is printed by `--print-rule-hash` and recorded in the commit message and
// in docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md).
//
// RUN (once the later commits exist).  node outbox/forecast-fit-uefa-2026-11-27.mjs <training-bundle.json> <frozen-bundle.json>
//   Today:  node outbox/forecast-fit-uefa-2026-11-27.mjs --print-rule-hash     (prints the sha256 of the RULE block)
//           node outbox/forecast-fit-uefa-2026-11-27.mjs --print-rule          (prints the RULE block)
// LICENCE of the match data (ESPN's scoreboard, stored in the relay's archive) is NOT assessed here (STANDARDS Rule 45): flagged for a human.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

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

const src = fs.readFileSync(SELF_PATH, 'utf8')
const ruleBlock = (() => {
  const a = src.indexOf('// ==== RULE BEGIN'), b = src.indexOf('// ==== RULE END')
  return a >= 0 && b > a ? src.slice(a, b + '// ==== RULE END'.length) : null
})()
const argv = process.argv.slice(2)
if (ruleBlock === null) { console.error('the RULE block is missing'); process.exit(2) }
if (argv.includes('--print-rule-hash')) { console.log(`${sha256(ruleBlock)}  RULE block, ${ruleBlock.length} characters`); process.exit(0) }
if (argv.includes('--print-rule')) { console.log(ruleBlock); process.exit(0) }
console.error('This commit holds only the rule: nothing is fetched, fitted or scored yet. Use --print-rule-hash or --print-rule.')
process.exit(2)
export { RULE, decide }
