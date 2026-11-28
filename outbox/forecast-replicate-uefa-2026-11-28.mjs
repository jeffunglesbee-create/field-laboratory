// A REPLICATION OF A FROZEN CANDIDATE (U) ON MATCHES NO MODEL HAS BEEN SCORED ON, WITH A TWO-LOOK SEQUENTIAL TEST. Written 2026-11-28 for docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md ("Replication 2026-11-28"), on the
// owner's "Meant ideas 1 and 2" (the 2024-25 backward holdout and the sequential test of outbox/cc-session-2026-11-28-uefa-prior-exploration.md's list). It changes nothing in src/.
//
// THIS FILE, AT THE COMMIT THAT FIXES EACH VERSION OF THE RULE, HOLDS ONLY THE RULE. No 2024-25 match result has been collected or read, nothing has been scored, and no model number on any new data exists when a version is written. This is VERSION 2 (see VERSION in the block). The data bundles, the scoring code and the runs are separate commits
// made AFTER the commit that fixes the version, each leaving the RULE block below byte-identical (its sha256 is printed by `--print-rule-hash` and recorded in the commit message of the commit that fixes the version). ONE tooling file was committed earlier, in ef94a1ad: scripts/uefa-replication-data.mjs
// (the ESPN collector) and its mutation harness; they fetch and score nothing by existing, were tested on synthetic payloads only, and the rule below specifies what the collector must do (any later change to it is a change toward this text).
//
//   Today:  node outbox/forecast-replicate-uefa-2026-11-28.mjs --print-rule-hash     (prints the sha256 of the RULE block)
//           node outbox/forecast-replicate-uefa-2026-11-28.mjs --print-rule          (prints the RULE block)
// LICENCE of the match data (ESPN's public scoreboard) is NOT assessed here (STANDARDS Rule 45): flagged for a human.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const SELF_PATH = fileURLToPath(import.meta.url)
const sha256 = b => createHash('sha256').update(b).digest('hex')

// ==== RULE BEGIN
// THE REPLICATION RULE FOR CANDIDATE U (2026-11-28). It is fixed before any 2024-25 match RESULT was collected from ESPN or read by the author from any bundle. The author HAS read published AGGREGATES of that season (see SEEN). The block's bytes are the text from the
// first character of the line that opens the block (the RULE BEGIN marker line) to the last character of the line that closes it (the RULE END marker line) inclusive, UTF-8, LF line endings, no trailing newline; the file is ASCII only. Its sha256 is in the commit message of the commit that fixes this version of the block, and G3 reads it from there (the scoring tooling names that commit as RULE_COMMIT).
//
// WHY. The pre-registered fit of 2026-11-27 (rule dc9fdce5, RULE sha256 6cf976ba8b895439894346c066c22ff752d2789b208cdccdb563ddae41118cf1, run 46071082308) said DO NOT BUILD because ONE tripwire failed: on the frozen 2026-27 bundle (n 90) U's Brier was 0.0159 above the
//   base rate's (z +0.48). That test could not tell: the standard deviation of the paired difference there was 0.315, so its standard error was 0.033, and a true gain of the cross-validation size (0.032) would have passed it only about 83% of the time. This rule is the NEW DECISION
//   that fit's NO FURTHER LOOK clause reserves ("Any revision after that is a new decision with new matches to read"): the SAME candidate, constants frozen, on new matches, with a sequential test.
//
// THE CANDIDATE.  U exactly as defined in the RULE block of outbox/forecast-fit-uefa-2026-11-27.mjs (sha256 above): rating(club) = ppg + 0.25 * gdpg + 0.10 * gfpg over the club's league-phase matches in THIS competition and season played BEFORE the match;
//   d = rating(home) - rating(away) + home; pDraw = share; pHome = (1 - share) * logistic(d / scale); pAway = 1 - pDraw - pHome. N = 8 / 8 / 6, K = 3 eligibility (both clubs have >= 3 SCORED league-phase matches before the match) and the outcome y (0 home win, 1 draw, 2 away win,
//   from the two scores) are that rule's. CONSTANTS, FROZEN: home 1.34, scale 1.97, share 0.18, the rounded values that run printed. They are not refitted, re-rounded or changed for any reason; no constant is fitted under this rule.
// THE BENCHMARK, FROZEN.  BASE RATE = (122, 43, 69) / 234, the home, draw and away counts of the 234 eligible 2025-26 forecasts of that run, the same three numbers for every forecast at both looks. Reported, not gating: the test's own shares (an oracle), uniform 1/3 each, the EPL constants (0.42, 1.14, 0.27).
//
// THE DATA, AND THE ROW MAPPING (fixed).  Source: ESPN's public scoreboard, https://site.api.espn.com/apis/site/v2/sports/soccer/<slug>/scoreboard?dates=YYYYMMDD, ONE DAY PER READ, slug -> label: uefa.champions -> UEFA Champions League (N 8), uefa.europa -> UEFA Europa League (N 8),
//   uefa.europa.conf -> UEFA Europa Conference League (N 6). Every day of the window is read; a day that does not answer HTTP 200 with a JSON body holding an events array (after one retry; a 403 or 429 is never retried) stops the collection and writes nothing: a missing day is never an empty day.
//   A row is made from an event iff competitions[0].status.type.completed is true. Row: date = the REQUESTED day as YYYY-MM-DD; start_time = the event's date exactly as served; espn_event_id = String(event.id); home = String(team.id) of the competitor with homeAway "home" and
//   away = String(team.id) of the one with "away" (a CLUB IS ITS ESPN team id; there is no spelling and no alias); home_score and away_score = the competitors' score text, valid iff it matches ^[0-9]+$ (else null; no lenient parsing; winner, shootout, aggregate, form, records and advance fields are never read);
//   phase = the event's season.slug. An event with completed true that lacks exactly one home and one away competitor with a team id is COUNTED as skipped and is a G3 failure; it is never silently dropped or guessed. The distinct status.type.name values of the completed events are counted and printed;
//   a completed event that is a league-phase match (by the counting rule below) must have the status name STATUS_FULL_TIME, else G3 fails; a completed event that is not a league-phase match is never scored and its status name is only counted (the census of 2026-11-28 found STATUS_FINAL_AET and STATUS_FINAL_PEN on knockout events). A match is a LEAGUE-PHASE match iff BOTH clubs have played fewer than N earlier events in that competition's rows of that season (earlier = by (date, Date.parse(start_time), Number(espn_event_id));
//   a club never has two events on one date, so the order inside a date changes no number, and two events of one club on one date are a G3 failure). season.slug and altGameNote are NOT used to find the league phase; the count of events with phase "league-phase" per competition is printed as a cross-check only.
//   prepare() of the 2026-11-27 tooling is called once per season and competition set, never on rows of two seasons together.
//   LOOK 1 SET: the 2024-25 competitions, every day 2024-09-01 to 2025-06-30.
//   FORWARD SET: the 2026-27 competitions: every day 2026-08-01 to the day of the run, read by the same collector under the same rules. A 2026-27 league-phase match whose requested day is 2026-11-26 or earlier is a FROZEN match (an INPUT to ratings, never scored under this rule);
//     one whose requested day is 2026-11-27 or later is a FORWARD match (scored). The frozen part of this read must have exactly the espn_event_id set of the pinned frozen bundle outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json (sha256 3ccdad96a359bbdc6f1e0608058dec23f26a04dcc944817d648594f28130735e), compared as sets of ids (counts printed); a difference is a G3 failure.
//
// THE LOOKS (two, and no other).
//   LOOK 1: all ELIGIBLE forecasts of the 2024-25 competitions' league phase, in (date, Date.parse(start_time), Number(espn_event_id)) order. Run once to a completed G3, when the bundle exists.
//   LOOK 2: only if Look 1 returned CONTINUE TO LOOK 2. It scores the eligible forecasts of the FORWARD matches (the frozen matches are not scored) and pools them AFTER the Look 1 forecasts. It runs only when every club of the three 2026-27 competitions has played exactly N league-phase matches in the read (396 league-phase matches
//     exist, 252 of them frozen, so the pooled set is the Look 1 set plus the eligible forecasts of the remaining 144), and on no other basis. It is run by a scheduled check that applies exactly this condition. DEADLINE: 2027-02-15. If the condition does not hold by then, Look 2 is not run and the result is NO VERDICT (the
//     programme is void; any further test of U is a new decision). UEFA's calendar was not read; the deadline is chosen to fall after any plausible final matchday and before the knockout playoffs. At Look 2 the Look 1 part of the pooled z is recomputed from the Look 1 bundle and must equal the committed Look 1 z (to 1e-12); a difference is a G3 failure.
// THE STATISTIC (no rounding anywhere).  Per eligible forecast D = Brier(U) - Brier(base); Brier = the sum over the three outcomes of (forecast - indicator)^2 (a uniform guess scores 0.6667). z = mean(D) / (sd(D) / sqrt(n)) with the sample standard deviation (n - 1). NEGATIVE FAVOURS U.
//   "U has skill", in this rule, means only: mean(D) < 0 against this frozen table-free forecast, at the boundary below.
// THE BOUNDARIES.  One-sided total alpha 0.05 split by Bonferroni: LOOK 1 alpha 0.0125, z1 = -2.241402728; LOOK 2 alpha 0.0375, z2 = -1.780464342 (the exact quantiles; the comparison uses the unrounded z). No correction for the correlation of the two looks is claimed; it only makes the test conservative.
// THE GUARDS, at the look whose boundary is crossed, on the forecasts of that look (at Look 2 the three cells are each competition's Look 1 and forward forecasts pooled).
//   G1  each of the three competitions on its own: U's paired z against the base rate <= +1.0.
//   G2  the home-win slope (the coefficient on logit(pHome) in the logistic regression of "home win" on [1, logit(pHome)] by Newton's method from (0, 1), at most 100 iterations, stopping when the step is < 1e-12; its standard error the square root of the [1][1] element of the inverse observed information) is within 1.96 standard errors of 1.
//   G3  every integrity check holds: every check named under THE DATA (completed events 189 / 189 / 153 for 2024-25 as read by dry runs on 2026-11-28, 144 / 144 / 108 league-phase matches, every club on exactly 8 / 8 / 6 of them, 36 distinct clubs a competition, no duplicate espn_event_id, no skipped completed event, every league-phase match has the status name STATUS_FULL_TIME,
//     no null score in a league-phase match, and for every event the requested day equals the UTC day of its start_time or the day before it), the frozen-set equality, the Look 1 reproduction at Look 2, the bundle files' sha256 as committed with them, and the RULE block's sha256 equal to the one in the commit message of the commit RULE_COMMIT that fixed this version.
// ORDER OF EVALUATION (outcome-blind failure path).  The tooling evaluates every G3 check BEFORE it computes any Brier, D, z, slope, outcome share or log loss. If any G3 check fails it prints only the failed checks and the counts, prints "VERDICT: NO VERDICT", writes no outcome-bearing file and exits non-zero; the scoring code is unreachable when G3 fails
//   (shown by a mutation). A `--integrity-only` mode (G3 only) exists. A repair is allowed only for a defect in the DATA or the COLLECTION (never in this rule, a constant or a boundary), is decided from names, dates, ids and counts alone, is written to the session document before the next run, and the next run is the same Look on the repaired data.
//   "Run once" means once to a completed G3: a run that stopped at G3 is not a look.
// THE VERDICTS (a total table, evaluated in this order).  1. G3 fails at any look -> NO VERDICT.  2. z is not a finite number (n < 2, sd 0, an empty competition) -> NO VERDICT.  3. LOOK 1: z <= z1 -> go to 4; z > z1 -> CONTINUE TO LOOK 2. LOOK 2: z <= z2 -> go to 4; z > z2 -> DO NOT BUILD.
//   4. G1 and G2 both hold -> BUILD; either fails or is not a number -> DO NOT BUILD (there is no Look 2 after a Look 1 crossing).
//   BUILD means only this: Task 3 of docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md may be built with these constants exactly and a method string that carries them and names this rule. The line is pull-only (Rule F) and is shown only for eligible matches (U has no prior). BUILD does not retire the frozen 2026-27 bundle's adverse out-of-fit result
//     (+0.0159 Brier, n 90, z +0.48), which neither look includes and which is reported beside any BUILD.
// WHICH NUMBER GOVERNS.  The run's printed numbers govern. An independent recomputation is a check: if its z differs from the run's by more than 1e-9 or its verdict differs, the verdict is NO VERDICT until the cause is found by running BOTH implementations on a synthetic season committed beforehand; a fix goes to the implementation that
//   disagrees with THIS text on that synthetic case, and the run is repeated on the same data. Neither number is ever chosen because it is the favourable one.
// NO FURTHER LOOK.  Look 1 and Look 2 are the only looks. If Look 1 crosses its boundary Look 2 is not run and the forward matches are NEVER scored under this rule (they stay unspent for any later candidate). No re-run on any set with a changed constant, K, weight, boundary, set or order; no second pass over 2024-25, 2025-26 or the frozen 2026-27 bundle; no alternative candidate
//   scored on any of them under this rule. Any other candidate (for example one with a prior, outbox/cc-session-2026-11-28-uefa-prior-exploration.md) is a NEW decision, and 2024-25 is not blind for it once this rule has scored U on it.
// SPENDING.  This rule spends the 2024-25 league phase on candidate U at Look 1 and, only if Look 1 does not cross, the 144 forward matches at Look 2. Those are the two clean sets the exploration listed for a rating-with-memory candidate. The owner's instruction was "Meant ideas 1 and 2"; the cost to any later candidate is stated here and in the session record so no reader finds it later.
// REPORTED, NOT GATING: log loss; U against uniform and against the EPL constants; per-competition Briers and n; the opening matches (not forecast); the standard deviation of D; the K = 4 sensitivity (on the same set as the look); the draw share U assumes against the observed; the clustered-by-club standard error of mean(D) beside the iid one.
//   No estimate of the gain is quoted from a Look 1 crossing as an effect size: it is biased upward by selection (any crossing at standard deviation 0.212 means a measured gain of at least 0.031).
// VERSION. This is version 2. Version 1 (commit 3cd09a4b, RULE sha256 c37e8b79077bc78494285dbb98841fc5262937c62b69feadd2a62b40f3771407) was superseded BEFORE any data was collected, after a categorical census of the 2024-25 payloads (counts of kinds only: outbox/uefa-replication-census-2024-09-01-2025-06-30.txt, run 46095464139; it printed no row, score or team)
//   showed that version 1's rule that every completed event carry STATUS_FULL_TIME would have voided the run at G3 (knockout events carry STATUS_FINAL_AET or STATUS_FINAL_PEN). Two wording errors of version 1 were corrected with it: the direction of the requested-day allowance (the day BEFORE the UTC day, as the collector implements) and a sentence that claimed the owner had accepted a cost. Nothing else changed.
//   The census also found: 909 reads all HTTP 200; completed events 189 / 189 / 153, none not completed; phase counts league-phase 144 / 144 / 108 (equal to the counting rule's); no skipped event, no invalid score text, no date mismatch, no duplicate event id.
// DISCLOSED: what was known when this rule was fixed, so the reader can see what is not blind.
//   KNOWN. The 2026-11-27 fit's whole result (CV z -2.29, gain 0.0316, standard deviation of D 0.212; frozen bundle z +0.48, standard deviation 0.315); ESPN's completed-event counts by dry run for 2024-25 (189 / 189 / 153) and for 2023-24 (125 for the Champions League, 141 for the Conference League).
//   SEEN BY THE AUTHOR, all before this rule. (1) ONE standings entry of 2024-25: a probe response printed Liverpool's Champions League league-phase line (played 8, won 7, lost 1, 21 points, goal difference +12, 17 goals for, 5 against). (2) Published AGGREGATES of the 2024/25 league phase: home / draw / away shares of 53.47 / 12.50 / 34.03 (Champions League)
//     and 48.61 / 24.31 / 27.08 (Europa League) (arXiv 2508.20075, Table 3; the 2025/26 shares too), and published scores of rating-with-memory models on the 2024/25 and 2025/26 league phases (outbox/uefa-forecaster-prior-literature-2026-11-28.json, outbox/cc-session-2026-11-28-uefa-prior-exploration.md). None is a result for U; the shares say how often the home side won, which is a property
//     of the scored set, so this test is NOT blind to those aggregates. (3) Nothing else of any 2024-25 match.
//   BACKGROUND. The author (an AI assistant whose training reaches June 2026) has general knowledge of parts of the 2024-25 UEFA season from before this session. None of it was read from the data and none enters a number: the inputs are ESPN's events, a script scores them, and the author opens no 2024-25 row before the run (the session record lists every command that touches the bundle).
//   CHOICES MADE WITHOUT DATA. The alpha split and the looks; the two-look form (chosen because the data arrive in two natural blocks and because the statistic uses the sample standard deviation, so its type I error does not depend on an assumed one; a Wald test needs a point alternative); K and the weights (inherited); the guards (inherited; G2 costs power: a perfectly calibrated U fails it 5% of the time at each look);
//     the deadline; the forward cut at 2026-11-27 (no league-phase match is expected on 2026-11-27 or 2026-11-28; the forward count by day is printed).
//   POWER (Monte Carlo, 60000 simulated experiments per row, normal increments, independent, n 234 at Look 1 and 144 more at Look 2). Probability of CROSSING a boundary at either look, standard deviation 0.212 / 0.315: true gain 0 (type I) 0.042 / 0.042; gain 0.0158 0.38 / 0.22; gain 0.0316 (the cross-validation gain) 0.87 / 0.58; gain 0.072 (the size a published rating-with-memory model showed) 1.00 / 1.00.
//     Crossing at Look 1 alone, gain 0.0316: 0.52 / 0.24. BUILD also needs G1 and G2: an independent simulation with the 2025-26 per-competition gains gave 0.87 crossing and 0.78 BUILD at gain 0.0316, standard deviation 0.212. The iid z understates the standard error by roughly 10 to 15% at a gain of 0.03 (an independent simulation of a synthetic league phase), so these are optimistic by that much.
//   WHAT THESE DATA CANNOT SAY. (1) Matches are not independent and clubs recur. (2) U has no prior and forecasts only matches where both clubs have played 3 league-phase matches (234 of 396 in 2025-26): a pass is evidence that the table has skill over a table-free forecast on those matches, not that U is good and not that it is complete. (3) 2024-25 is the first league-phase season;
//     the 2025-26 constants may not transfer. (4) The forward matches are matchdays 6 to 8, where ratings are better than early in the phase, so the two looks do not sample the same conditions. (5) Knockout ties are not forecast. (6) ESPN's nominal home side at a relocated or neutral venue, and any awarded or abandoned result, are taken as ESPN reports them. (7) 2023-24 and earlier seasons are not used because their format is a group stage.
//     (8) U is tested a second time on new data, and the 0.042 type I error is this rule's alone.
const RULE = {
  candidate: 'U, outbox/forecast-fit-uefa-2026-11-27.mjs, RULE sha256 6cf976ba8b895439894346c066c22ff752d2789b208cdccdb563ddae41118cf1',
  constants: { home: 1.34, scale: 1.97, share: 0.18 },
  baseCounts: [122, 43, 69],
  baseN: 234,
  K: 3,
  weights: { gd: 0.25, gf: 0.10 },
  N: { 'UEFA Champions League': 8, 'UEFA Europa League': 8, 'UEFA Europa Conference League': 6 },
  slugs: { 'uefa.champions': 'UEFA Champions League', 'uefa.europa': 'UEFA Europa League', 'uefa.europa.conf': 'UEFA Europa Conference League' },
  look1: { from: '2024-09-01', to: '2025-06-30', alpha: 0.0125, z: -2.241402728 },
  look2: { alpha: 0.0375, z: -1.780464342, seasonFrom: '2026-08-01', frozenThrough: '2026-11-26', forwardFrom: '2026-11-27', deadline: '2027-02-15' },
  frozenBundleSha256: '3ccdad96a359bbdc6f1e0608058dec23f26a04dcc944817d648594f28130735e',
  expected2024: { completed: { 'UEFA Champions League': 189, 'UEFA Europa League': 189, 'UEFA Europa Conference League': 153 }, leaguePhase: { 'UEFA Champions League': 144, 'UEFA Europa League': 144, 'UEFA Europa Conference League': 108 } },
  clubsPerCompetition: 36,
  leaguePhaseStatus: ['STATUS_FULL_TIME'],
  scoreRe: '^[0-9]+$',
  foldMaxZ: 1.0,
  slopeSigma: 1.96,
  slopeStepTol: 1e-12,
  slopeMaxIter: 100,
}
// m = { integrityOk, z, folds: [{ name, z }], slope, slopeSE }: the verdict table above, in its order. No input produces two outputs, and no non-number passes a comparison.
function decide(look, m) {
  if (m.integrityOk !== true) return { verdict: 'NO VERDICT', failed: ['a G3 integrity check failed'] }
  if (typeof m.z !== 'number' || !Number.isFinite(m.z)) return { verdict: 'NO VERDICT', failed: ['z is not a finite number'] }
  const b = look === 1 ? RULE.look1.z : RULE.look2.z
  if (!(m.z <= b)) return { verdict: look === 1 ? 'CONTINUE TO LOOK 2' : 'DO NOT BUILD', failed: [`pooled paired z ${m.z} is not <= ${b}`] }
  const failed = []
  if (!(Array.isArray(m.folds) && m.folds.length === 3)) failed.push('G1 there are not three competition cells')
  else for (const f of m.folds) if (!(typeof f.z === 'number' && f.z <= RULE.foldMaxZ)) failed.push(`G1 ${f.name}: paired z ${f.z} is not <= ${RULE.foldMaxZ}`)
  if (!(typeof m.slope === 'number' && typeof m.slopeSE === 'number' && Math.abs(m.slope - 1) <= RULE.slopeSigma * m.slopeSE)) failed.push(`G2 home-win slope ${m.slope} (SE ${m.slopeSE}) differs from 1 by more than ${RULE.slopeSigma} SE or is not a number`)
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
console.error('This commit holds only the rule: nothing is collected, scored or fitted yet. Use --print-rule-hash or --print-rule.')
process.exit(2)
export { RULE, decide }
