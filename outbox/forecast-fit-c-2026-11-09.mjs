// A ONE-OFF MEASUREMENT THAT DECIDES WHETHER table-v1 IS REPLACED BY CANDIDATE C (home edge, logistic scale, ONE constant draw share). Written 2026-11-09 for
// docs/CC-CMD-2026-09-11-epl-forecaster-phase1.md, on the owner's "Go" (Mon 2026-11-09 06:43 ET) after outbox/forecast-fit-2026-11-08.txt ended DO NOT SHIP (candidate B's
// draw decay was unidentified). It fits C on last season, scores it on a season it has never seen (2024-25) and on the 100 matches of this one, and prints a mechanical
// VERDICT. It changes nothing in src/. Its output is outbox/forecast-fit-c-2026-11-09.txt.
//
// DATA.  Training  2025-26: the four files outbox/forecast-backtest-prior-season-2026-11-08.mjs pins (its header has the fetch commands), read by the same strict parser (copied
//                  below; that script is also RUN as a precondition and must exit 0).
//        Test      2024-25: a bundle, outbox/forecast-season-2024-25-2026-11-09.json, written by outbox/forecast-season-2024-25-2026-11-09.mjs from four raw files pinned below by
//                  bytes and sha256 (openfootball scores, FPL's fixtures and teams, ESPN's final table through the relay). The bundle carries the matches and the two other
//                  sources' facts, so every cross-source check is re-run here from it.
//        This season 2026-27: outbox/forecast-fit-holdout-2026-11-08.json, frozen on 2026-11-08 and pinned below by bytes and sha256.
// RUN.   npm run build && node outbox/forecast-fit-c-2026-11-09.mjs <sources-dir> outbox/forecast-season-2024-25-2026-11-09.json outbox/forecast-fit-holdout-2026-11-08.json
//        [--bundle-only: data checks only, stops before C is fitted or scored] [--dump-features=<path>]
// Exit 0 only if every integrity check holds; the VERDICT line is separate from the exit code. Coverage is printed where each number is.
// LICENCE of the sources is NOT assessed here (STANDARDS Rule 45): flagged for a human, recorded in the session document.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { makeRow, forecastFor, triple } from '../build/Forecast.js'
import { fromString } from '../build/Standings.js'

const argv = process.argv.slice(2)
const dumpPath = (argv.find(a => a.startsWith('--dump-features=')) ?? '').replace('--dump-features=', '') || null
const bundleOnly = argv.includes('--bundle-only')
const [srcDir, freshArg, holdArg] = argv.filter(a => !a.startsWith('--'))
if (!srcDir || !freshArg || !holdArg) { console.error('usage: node outbox/forecast-fit-c-2026-11-09.mjs <sources-dir> <2024-25 bundle .json> <2026-27 bundle .json> [--bundle-only] [--dump-features=<path>]'); process.exit(2) }
const SELF_PATH = fileURLToPath(import.meta.url)
const here = path.dirname(SELF_PATH)
const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }) }
const sha256 = b => createHash('sha256').update(b).digest('hex')

// ==== RULE BEGIN
// THE SHIP RULE FOR CANDIDATE C. FIXED BEFORE ANY 2024-25 MODEL NUMBER WAS COMPUTED, and committed before the 2024-25 bundle was committed or this script was run on it.
// (outbox/cc-session-2026-11-09-fit-c.md names the commit and prints this block's sha256 taken from that commit; the script prints its own block's sha256 on every run.)
//
// THE CANDIDATE.  C keeps table-v1's rating (ppg + 0.25*gdpg + 0.10*gfpg) and refits THREE constants: the home edge, the logistic scale, and ONE draw share used for every match:
//     d = rh - ra + home;  pDraw = share;  pHome = (1 - share) * logistic(d / scale);  pAway = the remainder.
//   The draw share no longer depends on the gap between the clubs. C is fitted by maximum likelihood on 2025-26's forecasts with both clubs on >= 5 games (the 330 the earlier
//   records measured) and its constants are ROUNDED TO TWO DECIMALS before C is scored on anything but its own fit, because the rounded values are what would ship.
//   The fit never sees 2024-25 or 2026-27.
// WHY THIS CANDIDATE.  It was NOT one of the two pre-registered in outbox/forecast-fit-2026-11-08.mjs. Its evidence was found POST HOC on 2025-26: table-v1 predicted a draw 15% of
//   the time and one happened 27%; draws did not fall as the gap widened (25%, 30%, 26% across thirds of the gap); the likelihood was flat in B's draw decay above about 10.
//   A structure chosen after looking at a season can only be tested fairly on a season it has not looked at, which is what this is.
// ALREADY KNOWN WHEN THE RULE WAS FIXED, so the reader can see what is not blind:
//   2025-26, the fit season: table-v1's Brier 0.689 on the 330 and slope 0.41 (earlier records), the earlier fit, and, computed minutes before this rule was written, C's 5-fold
//     cross-validated numbers on the same 330 (quoted in DISCLOSED below and reproduced by this script as an integrity check): Brier 0.6292 against table-v1's 0.6890, a constant
//     base-rate forecast's 0.6614 and a uniform guess's 0.6667; paired z -3.45 against table-v1 and -2.94 against the base-rate forecast; home-win slope 1.01 +/- 0.22.
//     The thresholds below were chosen with those in view: N2 sits at the one-sided 5% line because the cross-validated z against the base rate was about -2.9, which gives a fresh
//     season of the same size roughly two chances in three (if the true skill is 70% of that estimate) to nine in ten (if it is all of it) of clearing it.
//   2026-27, the frozen 100-match bundle (50 with both clubs on >= 5 games): table-v1 is worse than a uniform guess there (earlier record). With C's rounded constants, also computed
//     before this rule was written: Brier 0.6502 against table-v1's 0.7392 (z -1.98) and a base-rate forecast's 0.6375 (z +0.32); slope 0.25 +/- 0.39; 22% of the 50 were draws.
//     So N5 is a tripwire for a broken pipeline, not a test: its outcome was known when it was written. Its z against the base rate is positive and n is 50, early in a season;
//     that is why no rule is placed on it.
//   2024-25, the test season: NO model number, home-win or draw share, tally of results or score has been computed or read. The raw files were fetched and a few fixture lines
//     were printed to settle the parser: the opening-day fixture, and the 16 lines that carry no half-time score (the ones shown were 0-0, so some goalless draws are known); the ESPN
//     payload was decoded to confirm 20 clubs x 38 played with no deductions and goals for and against each totalling 1115; the files' sha256 were taken and are pinned below.
//     The author also knows, from general knowledge, who won that season's title and who went down; none of that enters a number.
//
// THE SETS.  RULE SET = a season's matches with both clubs on >= 5 games before kickoff (2025-26: 330; 2024-25: expected about the same). OPENING WEEKS = both clubs on 1-4 games.
//   BASE-RATE FORECAST = the home / draw / away shares of the 330 training matches (printed), the same three numbers for every match. It is the forecast anyone could make without a table,
//   and it is the benchmark for whether the table adds anything.
// C SHIPS as table-v2 ONLY IF ALL of these hold:
//   N1  2024-25 rule set: C's Brier is below table-v1's, paired per match, z <= -2.0
//   N2  2024-25 rule set: C's Brier is below the base-rate forecast's, paired per match, z <= -1.645 (one-sided 5%: the direction was predicted)
//   N3  2024-25 rule set: C's home-win calibration slope (logistic regression of a home win on logit of the forecast) is within 1.96 standard errors of 1
//   N4  opening weeks, 2024-25 and 2026-27 each on its own: C's mean Brier is no worse than table-v1's
//   N5  2026-27 rule set (the frozen bundle): C's Brier is below table-v1's, paired z < 0 (direction only; a tripwire, see above)
//   N6  the fit on 2025-26 is well posed: two unrelated solvers agree, the gradient vanishes, the Hessian is positive definite, and none of the THREE fitted constants sits on a bound
//   N7  every integrity check in this script holds (well-posedness is N6 and is not counted again here)
//   z = mean paired difference / (sd / sqrt n); negative favours C. Any rule failing is "DO NOT SHIP", and the output names the rule.
// NO FURTHER LOOK.  If any rule fails there is no second pass over 2024-25, no refit on it and no alternative candidate on it: the verdict stands and the model stays table-v1. Any
//   revision after that is a new decision with new matches to read. If every rule passes, the constants shipped are exactly the rounded 2025-26 values this script prints, nothing re-tuned.
// REPORTED, NOT GATING: log loss; C against a uniform guess; 2024-25's draw rate against C's share; every forecastable 2024-25 match; the reverse fold (C fitted on 2024-25 and scored on
//   2025-26); the pooled constants; C against the base rate on 2026-27.
const RULE = { z1: -2.0, z2: -1.645, slopeSigma: 1.96, uniform: 2 / 3 }
const DISCLOSED = {
  fit: { home: 0.42, scale: 1.14, drawBase: 0.27 },
  cv: { brierC: '0.6292', brierV1: '0.6890', brierBase: '0.6614', zV1: '-3.45', zBase: '-2.94', slope: '1.01', slopeSE: '0.22' },
  hold: { n: 50, brierC: '0.6502', brierV1: '0.7392', brierBase: '0.6375', zV1: '-1.98', zBase: '0.32', slope: '0.25', slopeSE: '0.39', draws: '0.220' },
}
function decide(m) {
  const failed = []
  if (!(m.z1 <= RULE.z1)) failed.push(`N1 2024-25 paired z against table-v1 ${m.z1?.toFixed?.(2)} is not <= ${RULE.z1}`)
  if (!(m.z2 <= RULE.z2)) failed.push(`N2 2024-25 paired z against the base-rate forecast ${m.z2?.toFixed?.(2)} is not <= ${RULE.z2}`)
  if (!(Math.abs(m.slope - 1) <= RULE.slopeSigma * m.slopeSE)) failed.push(`N3 2024-25 home-win slope ${m.slope?.toFixed?.(2)} (SE ${m.slopeSE?.toFixed?.(2)}) differs from 1 by more than ${RULE.slopeSigma} SE`)
  if (!(m.openFreshC <= m.openFreshV1 && m.openHoldC <= m.openHoldV1)) failed.push('N4 an opening-weeks Brier is worse than table-v1\'s')
  if (!(m.z5 < 0)) failed.push(`N5 2026-27 paired z against table-v1 ${m.z5?.toFixed?.(2)} is not < 0`)
  if (!m.wellPosed) failed.push('N6 the fit is not well posed')
  if (!m.checksOk) failed.push('N7 an integrity check failed')
  return { ship: failed.length === 0, failed }
}
{
  const good = { z1: -3, z2: -2.5, slope: 1.0, slopeSE: 0.2, openFreshC: 0.68, openFreshV1: 0.86, openHoldC: 0.68, openHoldV1: 0.90, z5: -1.5, wellPosed: true, checksOk: true }
  const veto = (name, patch, tag) => {
    const r = decide({ ...good, ...patch })
    check(`verdict logic: ${name} alone vetoes, and says so`, !r.ship && r.failed.length === 1 && r.failed[0].startsWith(tag), r.failed.join(' | '))
  }
  const ships = (name, patch) => check(`verdict logic: ${name} still ships`, decide({ ...good, ...patch }).ship)
  check('verdict logic: a candidate that meets every rule ships', decide(good).ship && decide(good).failed.length === 0)
  // Every threshold is pinned from both sides by LITERAL values, so loosening or tightening RULE changes a result here (a test that ships "at RULE.z1" passes whatever RULE.z1 is).
  veto('N1 (z -1.99)', { z1: -1.99 }, 'N1'); ships('N1 at z -2.0', { z1: -2.0 })
  veto('N2 (z -1.64)', { z2: -1.64 }, 'N2'); ships('N2 at z -1.645', { z2: -1.645 })
  veto('N3 (slope 0.55, SE 0.2)', { slope: 0.55 }, 'N3'); veto('N3 (slope 0.60, SE 0.2)', { slope: 0.60 }, 'N3'); ships('N3 just inside its lower edge (slope 0.61, SE 0.2)', { slope: 0.61 })
  veto('N3 (slope 1.45, SE 0.2)', { slope: 1.45 }, 'N3'); veto('N3 (slope 1.40, SE 0.2)', { slope: 1.40 }, 'N3'); ships('N3 just inside its upper edge (slope 1.39, SE 0.2)', { slope: 1.39 })
  veto('N4 (opening weeks worse in 2024-25)', { openFreshC: 0.87 }, 'N4'); veto('N4 (opening weeks worse in 2026-27)', { openHoldC: 0.91 }, 'N4'); ships('N4 with equal opening-week Briers', { openFreshC: 0.86, openHoldC: 0.90 })
  veto('N5 (z 0)', { z5: 0 }, 'N5'); veto('N5 (z +0.5)', { z5: 0.5 }, 'N5'); ships('N5 just below zero', { z5: -1e-9 })
  veto('N6', { wellPosed: false }, 'N6'); veto('N7', { checksOk: false }, 'N7')
  veto('a NaN N1 z', { z1: NaN }, 'N1'); veto('a NaN N2 z', { z2: NaN }, 'N2'); veto('a NaN slope', { slope: NaN }, 'N3'); veto('a NaN opening-weeks Brier', { openFreshC: NaN }, 'N4'); veto('a NaN N5 z', { z5: NaN }, 'N5')
}
// ==== RULE END

// The rule block's own hash: read from this file, between the two marker lines (each must appear exactly once, or the hash is of nothing in particular).
const SELF = fs.readFileSync(SELF_PATH, 'utf8')
const MARK = w => `// ${'='.repeat(4)} RULE ${w}`
const ruleBlock = SELF.slice(SELF.indexOf(MARK('BEGIN')), SELF.indexOf(MARK('END')) + MARK('END').length)
check('the rule block is delimited by exactly one begin and one end marker, in that order', SELF.split(MARK('BEGIN')).length === 2 && SELF.split(MARK('END')).length === 2 && SELF.indexOf(MARK('BEGIN')) < SELF.indexOf(MARK('END')))
console.log(`rule block (from its begin marker to its end marker, ${ruleBlock.split('\n').length} lines) sha256 ${sha256(ruleBlock)}`)

// ------------------------------------------------------------------------------------------------------------ the model, as a function of its constants
const TH0 = { home: 0.30, scale: 0.55, drawBase: 0.28, drawDecay: 1.10 }      // table-v1, src/Forecast.fs
const TC = { ...TH0, drawDecay: Infinity }                                      // C: exp(-|d| / Infinity) is exactly 1, so the draw share is exactly drawBase, a constant
const FREE_C = ['home', 'scale', 'drawBase']
const BOUNDS = { home: [-1.5, 1.5], scale: [0.1, 5], drawBase: [0.05, 0.6] }    // a FREE constant outside these is "on a bound"; the fixed draw decay is not a fitted constant
const rating = t => t.p <= 0 ? null : t.pts / t.p + 0.25 * ((t.gf - t.ga) / t.p) + 0.10 * (t.gf / t.p)
const probs = (rh, ra, th) => {
  const d = rh - ra + th.home
  const pD = th.drawBase * Math.exp(-Math.abs(d) / th.drawDecay)
  const pH = (1 - pD) * (1 / (1 + Math.exp(-d / th.scale)))
  return [pH, pD, 1 - pD - pH]
}
const brier = (p, o) => p.reduce((s, x, i) => s + (x - (i === o ? 1 : 0)) ** 2, 0)
const logloss = (p, o) => -Math.log(Math.max(1e-12, p[o]))
const mean = xs => xs.reduce((s, v) => s + v, 0) / xs.length
const sd = xs => { const m = mean(xs); return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)) }
const f4 = x => x.toFixed(4), f3 = x => x.toFixed(3), f2 = x => x.toFixed(2), pct = x => (x * 100).toFixed(0) + '%'
const paired = (a, b) => { const d = a.map((v, i) => v - b[i]); return { mean: mean(d), se: sd(d) / Math.sqrt(d.length), z: mean(d) / (sd(d) / Math.sqrt(d.length)) } }
const signed = x => (x >= 0 ? '+' : '') + f3(x)
const r2 = v => Math.round(v * 100) / 100

// Play-order features: both clubs' ratings from the table BEFORE the match, and the match's outcome (0 home, 1 draw, 2 away).
function featuresOf(results) {
  const T = new Map(); const g = n => { if (!T.has(n)) T.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return T.get(n) }
  return results.map(r => {
    const th = g(r.home), ta = g(r.away)
    const f = { home: r.home, away: r.away, pre: Math.min(th.p, ta.p), rh: rating(th), ra: rating(ta), o: r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2, tH: { ...th }, tA: { ...ta } }
    th.p++; ta.p++; th.gf += r.hg; th.ga += r.ag; ta.gf += r.ag; ta.ga += r.hg
    if (r.hg > r.ag) th.pts += 3; else if (r.hg === r.ag) { th.pts++; ta.pts++ } else ta.pts += 3
    return f
  })
}
const tableOf = ms => {
  const t = new Map(); const g = n => { if (!t.has(n)) t.set(n, { p: 0, pts: 0, gf: 0, ga: 0 }); return t.get(n) }
  for (const m of ms) {
    const h = g(m.home), a = g(m.away)
    h.p++; a.p++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg
    if (m.hg > m.ag) h.pts += 3; else if (m.hg === m.ag) { h.pts++; a.pts++ } else a.pts += 3
  }
  return t
}
const tup = (p, pts, gf, ga) => `${p}|${pts}|${gf}|${ga}`
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const iso = (y, mo, d) => new Date(Date.UTC(y, mo, d)).toISOString().slice(0, 10)

// pairFixtures: copied from outbox/forecast-fit-2026-11-08.mjs (generic: As has home/away names, Bs has h/a ids). Joins by date and score, never by name.
function pairFixtures(As, Bs) {
  const key = x => `${x.date}|${x.hg}|${x.ag}`
  const bucket = xs => { const m = new Map(); xs.forEach((x, i) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(i) }); return m }
  const bA = bucket(As), bB = bucket(Bs), keys = new Set([...bA.keys(), ...bB.keys()])
  const sizeMismatch = [...keys].filter(k => (bA.get(k)?.length ?? 0) !== (bB.get(k)?.length ?? 0))
  const map = new Map(), rev = new Map(), pairs = [], conflicts = [], usedA = new Set(), usedB = new Set()
  const fits = (a, b) => (!map.has(a.home) || map.get(a.home) === b.h) && (!map.has(a.away) || map.get(a.away) === b.a) && (!rev.has(b.h) || rev.get(b.h) === a.home) && (!rev.has(b.a) || rev.get(b.a) === a.away)
  const learn = (a, b) => { for (const [club, id] of [[a.home, b.h], [a.away, b.a]]) { if (map.has(club) && map.get(club) !== id) conflicts.push(club); if (rev.has(id) && rev.get(id) !== club) conflicts.push(String(id)); map.set(club, id); rev.set(id, club) } }
  for (let progress = true; progress;) {
    progress = false
    for (const k of keys) {
      const as = (bA.get(k) ?? []).filter(i => !usedA.has(i)), bs = (bB.get(k) ?? []).filter(j => !usedB.has(j))
      for (const i of as) {
        if (usedA.has(i)) continue
        const cands = bs.filter(j => !usedB.has(j) && fits(As[i], Bs[j]))
        if (cands.length !== 1) continue
        const j = cands[0]
        if (as.some(i2 => i2 !== i && !usedA.has(i2) && fits(As[i2], Bs[j]))) continue
        usedA.add(i); usedB.add(j); learn(As[i], Bs[j]); pairs.push([i, j]); progress = true
      }
    }
  }
  return { sizeMismatch, pairs, leftA: As.length - usedA.size, leftB: Bs.length - usedB.size, map, rev, conflicts }
}

// ------------------------------------------------------------------------------------------------------------ TRAINING 2025-26, as the earlier records read it
const PINNED = {
  openfootball: { file: 'openfootball-2025-26.txt', bytes: 51782, sha256: '38c1de56c9e9b6662c7efc1420b7e1fe00dddbb502fe72d8f759e773ba3c093b' },
  espnFinal: { file: 'espn-final-2025.json', bytes: 69451, sha256: '53b071579c20676356434f511ac376a2cf5e19851acead1ba25567dd5f6c41c4' },
}
const loadPinned = key => {
  const s = PINNED[key], buf = fs.readFileSync(path.join(srcDir, s.file))
  check(`source ${key} is the pinned file (${s.bytes} bytes, sha256)`, buf.length === s.bytes && sha256(buf) === s.sha256, `${buf.length} B, ${sha256(buf).slice(0, 16)}`)
  return buf.toString('utf8')
}
{
  const r = spawnSync(process.execPath, [path.join(here, 'forecast-backtest-prior-season-2026-11-08.mjs'), srcDir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const red = (r.stdout ?? '').split('\n').filter(l => l.startsWith('FAIL '))
  const last = (r.stdout ?? '').trim().split('\n').pop() ?? ''
  check('precondition: the prior-season script, run on these sources, exits 0 with no red check', r.status === 0 && red.length === 0 && /checks hold/.test(last), last.slice(0, 60))
}
// Copied verbatim from outbox/forecast-fit-2026-11-08.mjs, which copied it from outbox/forecast-backtest-prior-season-2026-11-08.mjs (the precondition above checks this parser's output).
function parseOpenfootball(text) {
  const problems = [], matches = [], head = {}
  let year = null, month = null, date = null, round = null
  text.split('\n').forEach((raw, idx) => {
    const ln = idx + 1, line = raw.replace(/\r$/, '')
    if (line.trim() === '') return
    let m
    if ((m = /^# Matches\s+(\d+)\s*$/.exec(line))) { head.matches = +m[1]; return }
    if ((m = /^# Teams\s+(\d+)\s*$/.exec(line))) { head.teams = +m[1]; return }
    if ((m = /^# Dates\s+\w{3} (\w{3}) (\d+) (\d{4}) - \w{3} (\w{3}) (\d+) (\d{4})/.exec(line))) { head.first = iso(+m[3], MONTHS.indexOf(m[1]), +m[2]); head.last = iso(+m[6], MONTHS.indexOf(m[4]), +m[5]); return }
    if (line.startsWith('#') || line.startsWith('=')) return
    if ((m = /^▪ Regular Season - (\d+)\s*$/.exec(line))) { round = +m[1]; return }
    if ((m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?: (\d{4}))?\s*$/.exec(line))) {
      const mo = MONTHS.indexOf(m[2]); let y = m[4] ? +m[4] : year
      if (y === null) { problems.push(`line ${ln}: a date with no year`); return }
      if (!m[4] && month !== null && mo < month) y = year + 1
      year = y; month = mo
      if (WEEKDAYS[new Date(Date.UTC(y, mo, +m[3])).getUTCDay()] !== m[1]) problems.push(`line ${ln}: ${m[1]} ${m[2]} ${m[3]} ${y} is not a ${m[1]}`)
      date = iso(y, mo, +m[3]); return
    }
    if ((m = /^  (\d{2}:\d{2})\s+(.+?)\s+(\d+)-(\d+)\s+\((\d+)-(\d+)\)\s+(.+?)\s*$/.exec(line))) {
      if (date === null || round === null) { problems.push(`line ${ln}: a match before any date or round`); return }
      matches.push({ ln, round, date, time: m[1], home: m[2], away: m[7], hg: +m[3], ag: +m[4] }); return
    }
    if (/^\s{8,}\S/.test(line)) return
    problems.push(`line ${ln}: not recognised: ${line.slice(0, 70)}`)
  })
  return { matches, head, problems }
}
const of = parseOpenfootball(loadPinned('openfootball'))
const M = of.matches
check(`training: the file parses clean, 380 matches, dates ${of.head.first}..${of.head.last}`, of.problems.length === 0 && M.length === 380 && M[0].date === of.head.first && M.at(-1).date === of.head.last, of.problems.slice(0, 2).join(' | '))
{
  const espn = fromString(loadPinned('espnFinal'))
  const E = espn.tag === 0 ? Array.from(espn.fields[0]) : []
  const eT = new Set(E.map(r => tup(r.Played, r.Points, r.GoalsFor, r.GoalsAgainst)))
  const mine = [...tableOf(M).values()]
  check(`training: the final table the results make equals ESPN's, club by club (${mine.filter(t => eT.has(tup(t.p, t.pts, t.gf, t.ga))).length} of 20 on played, points, GF, GA)`, E.length === 20 && eT.size === 20 && mine.length === 20 && mine.every(t => eT.has(tup(t.p, t.pts, t.gf, t.ga))))
  check('training: no club carries a deduction', E.length === 20 && E.every(r => r.Deductions === 0))
}
const trainOrder = M.map((m, i) => ({ ...m, i })).sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time) || x.i - y.i)
const trainAll = featuresOf(trainOrder)

// ------------------------------------------------------------------------------------------------------------ TEST SEASON 2024-25, from its bundle
const RAW_2425 = {      // the four raw files the bundle is made from; the fetch commands and these hashes are in outbox/forecast-season-2024-25-2026-11-09.mjs
  openfootball: { bytes: 30316, sha256: 'e39716b01af0c8654a9fae7b5555e6b02f506ea05239e0d0eef41936ba80e1e3' },
  fplFixtures: { bytes: 751413, sha256: 'ce696e187569ca7c45da2562811d3c38f525b58e65575531be37bebd0769ee28' },
  fplTeams: { bytes: 1717, sha256: 'd10a6db8feca6db9e44a3ba50b15168396667ea387fee9235d6b211c7f598c3b' },
  espnFinal: { bytes: 69462, sha256: 'e31a22e253917ea4cd42b728ce66d52f531c37044d0936abbd36431893624a42' },
}
const freshBuf = fs.readFileSync(freshArg), freshSha = sha256(freshBuf), FB = JSON.parse(freshBuf.toString('utf8'))
const FM = FB.matches
const freshOrder = FM.map(m => ({ ...m })).sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time) || x.i - y.i)
const freshAll = featuresOf(freshOrder)
{
  const clubs = [...new Set(FM.flatMap(m => [m.home, m.away]))].sort()
  const R = FM.map(m => ({ date: m.date, home: m.home, away: m.away, hg: m.hg, ag: m.ag }))
  check('2024-25: the bundle records the four pinned raw files, by bytes and sha256', Object.entries(RAW_2425).every(([k, v]) => FB.raw?.[k]?.bytes === v.bytes && FB.raw?.[k]?.sha256 === v.sha256))
  check('2024-25: the ESPN payload is the 2024-25 season (season 2024, "English Premier League 2024-2025")', FB.espn?.season === 2024 && FB.espn?.name === 'English Premier League 2024-2025')
  check(`2024-25: the bundle holds ${FM.length} matches among ${clubs.length} clubs, 38 each (19 home, 19 away), every ordered pair once`,
    FM.length === 380 && clubs.length === 20 && clubs.every(c => FM.filter(m => m.home === c).length === 19 && FM.filter(m => m.away === c).length === 19) && new Set(FM.map(m => m.home + '|' + m.away)).size === 380 && FM.every(m => m.home !== m.away))
  const dates = FM.map(m => m.date).sort()
  check(`2024-25: the file's header (${FB.header?.matches} matches, ${FB.header?.teams} teams, ${FB.header?.first}..${FB.header?.last}) is what the bundle holds (${FM.length}, ${clubs.length}, ${dates[0]}..${dates.at(-1)})`,
    FB.header?.matches === FM.length && FB.header?.teams === clubs.length && FB.header?.first === dates[0] && FB.header?.last === dates.at(-1))
  const wk = FM.filter(m => WEEKDAYS[new Date(m.date + 'T00:00:00Z').getUTCDay()] === m.dow).length
  check(`2024-25: every match's date names its own weekday (${wk} of ${FM.length}), so a wrong year anywhere fails`, wk === FM.length)
  check('2024-25: the matchday headings are exactly 1..38, each used', JSON.stringify([...new Set(FM.map(m => m.matchday))].sort((a, b) => a - b)) === JSON.stringify(Array.from({ length: 38 }, (_, i) => i + 1)))
  check('2024-25: no club plays twice on one date, so order within a day cannot change a table', new Set(FM.flatMap(m => [m.date + m.home, m.date + m.away])).size === 2 * FM.length)
  check('2024-25: it ends before the training season begins (the seasons do not overlap)', dates.at(-1) < of.head.first)
  const tb = tableOf(R), S = FB.standings ?? []
  const eT = new Map(S.map(r => [tup(r.played, r.points, r.gf, r.ga), r]))
  const mine = [...tb.values()]
  check(`2024-25: the final table the results make equals ESPN's, club by club (${mine.filter(t => eT.has(tup(t.p, t.pts, t.gf, t.ga))).length} of 20 on played, points, GF, GA), 20 distinct tuples, no deductions`,
    S.length === 20 && eT.size === 20 && mine.length === 20 && mine.every(t => eT.has(tup(t.p, t.pts, t.gf, t.ga))) && S.every(r => r.deductions === 0))
  const pf = pairFixtures(R, (FB.fpl ?? []).map(f => ({ ...f })))
  const agree = pf.pairs.filter(([i, j]) => R[i].date === FB.fpl[j].date && R[i].hg === FB.fpl[j].hg && R[i].ag === FB.fpl[j].ag && pf.map.get(R[i].home) === FB.fpl[j].h && pf.map.get(R[i].away) === FB.fpl[j].a).length
  check(`2024-25: FPL's ${FB.fpl?.length} fixtures hold the same matches by date and score (${pf.sizeMismatch.length} unequal groups), pairing one-to-one (${pf.pairs.length} pairs; ${pf.leftA} openfootball and ${pf.leftB} FPL left over), clubs mapping ${pf.map.size} of 20 with ${pf.conflicts.length} conflicts, and agreeing on date, scores and clubs (${agree} of ${FM.length})`,
    FB.fpl?.length === 380 && pf.sizeMismatch.length === 0 && pf.pairs.length === 380 && pf.leftA === 0 && pf.leftB === 0 && pf.map.size === 20 && pf.rev.size === 20 && pf.conflicts.length === 0 && agree === 380)
  const fn = FB.fplNames ?? {}
  check('2024-25: FPL\'s team list names the same 20 teams the fixtures use', Object.keys(fn).length === 20 && [...pf.rev.keys()].every(id => fn[id] !== undefined))
}

// ------------------------------------------------------------------------------------------------------------ THIS SEASON 2026-27, from the frozen bundle
const HOLD_PIN = { bytes: 28914, sha256: '074a2512965761773bca2448b2437f94866b9a684b0ec023072d45539bae60c7' }
const holdBuf = fs.readFileSync(holdArg), bundle = JSON.parse(holdBuf.toString('utf8'))
check(`2026-27: the bundle is the frozen file (${HOLD_PIN.bytes} bytes, sha256)`, holdBuf.length === HOLD_PIN.bytes && sha256(holdBuf) === HOLD_PIN.sha256, `${holdBuf.length} B, ${sha256(holdBuf).slice(0, 16)}`)
const A = bundle.archive
const holdOrder = A.map((m, i) => ({ ...m, i })).sort((x, y) => x.start.localeCompare(y.start) || x.id.localeCompare(y.id) || x.i - y.i)
const holdAll = featuresOf(holdOrder)
{
  const R = A.map(m => ({ date: m.start.slice(0, 10), home: m.home, away: m.away, hg: m.hg, ag: m.ag }))
  const clubs = [...new Set(R.flatMap(r => [r.home, r.away]))]
  const tb = tableOf(R), S = bundle.standings
  const sT = new Map(S.map(r => [r.team, r]))
  const played = clubs.filter(c => sT.has(c) && sT.get(c).played === tb.get(c).p).length
  check(`2026-27: ${A.length} finished matches, ${bundle.eplRows} EPL rows in the archive, none unfinished`, A.length === bundle.eplRows && A.length > 0)
  check(`2026-27: the archive's finished count equals ESPN's played count for ${played} of ${S.length} clubs, and the clubs are the same ${clubs.length}`, S.length === 20 && clubs.length === 20 && played === 20)
  const tupleOk = clubs.filter(c => sT.has(c) && tup(sT.get(c).played, sT.get(c).points, sT.get(c).gf, sT.get(c).ga) === tup(tb.get(c).p, tb.get(c).pts, tb.get(c).gf, tb.get(c).ga)).length
  check(`2026-27: the table the results make equals ESPN's current table (${tupleOk} of 20 clubs on played, points, GF, GA); no deductions`, tupleOk === 20 && S.every(r => r.deductions === 0))
  const pf = pairFixtures(R, bundle.fplFinished.map(f => ({ ...f })))
  const fc = bundle.fplCounts
  check(`2026-27: FPL's played fixtures are exactly its scored ones (${fc.finishedProvisional} provisional-or-final, ${fc.bothScores} with both scores; ${fc.finished} of them final, the rest in the latest matchweek)`, fc.finishedProvisional === fc.bothScores && fc.bothScores === bundle.fplFinished.length && fc.finished <= fc.finishedProvisional)
  check(`2026-27: the relay's FPL fixtures hold the same ${bundle.fplFinished.length} played matches by date and score (${pf.sizeMismatch.length} unequal groups), pairing one-to-one (${pf.pairs.length} pairs; ${pf.leftA} archive and ${pf.leftB} FPL left over), clubs mapping 20 of 20 with ${pf.conflicts.length} conflicts`,
    pf.sizeMismatch.length === 0 && pf.pairs.length === R.length && R.length === bundle.fplFinished.length && pf.leftA === 0 && pf.leftB === 0 && pf.map.size === 20 && pf.rev.size === 20 && pf.conflicts.length === 0)
  const bag = new Map(); for (const r of R) bag.set(`${r.date}|${r.hg}|${r.ag}`, (bag.get(`${r.date}|${r.hg}|${r.ag}`) ?? 0) + 1)
  let found = 0; for (const o of bundle.openfootballScored) { const k = `${o.date}|${o.hg}|${o.ag}`; if ((bag.get(k) ?? 0) > 0) { bag.set(k, bag.get(k) - 1); found++ } }
  check(`2026-27: openfootball's ${bundle.openfootballScored.length} scored lines are each an archive match on date and score (${found} of ${bundle.openfootballScored.length}); it has no later results to check`, bundle.openfootballScored.length > 0 && found === bundle.openfootballScored.length)
  check('2026-27: it begins after the training season ended (the seasons do not overlap)', R.every(r => r.date > of.head.last))
  check('2026-27: no club plays twice on one date, so order within a day cannot change a table', new Set(R.flatMap(r => [r.date + r.home, r.date + r.away])).size === 2 * R.length)
  check(`2026-27: before normalising, the only archive name the ESPN table does not carry is "Man United" (${JSON.stringify(bundle.unmatchedNames)}); after it, every archive club is one of the table's ${S.length}`,
    JSON.stringify(Object.keys(bundle.unmatchedNames)) === '["Man United"]' && clubs.every(c => sT.has(c)))
}

// ------------------------------------------------------------------------------------------------------------ the sets
const usable = fs => fs.filter(f => f.rh !== null && f.ra !== null)
const setsOf = all => ({ rule: usable(all).filter(f => f.pre >= 5), open: usable(all).filter(f => f.pre >= 1 && f.pre <= 4) })
const trainS = setsOf(trainAll), freshS = setsOf(freshAll), holdS = setsOf(holdAll)
const trainFit = trainS.rule, freshFit = freshS.rule, holdFit = holdS.rule
console.log(`training 2025-26: ${trainAll.length} matches, ${usable(trainAll).length} forecastable, ${trainFit.length} with both clubs on >= 5 games (fit set), ${trainS.open.length} opening-week`)
console.log(`test 2024-25: ${freshAll.length} matches, ${usable(freshAll).length} forecastable, ${freshFit.length} with both clubs on >= 5 games (rule set), ${freshS.open.length} opening-week; bundle sha256 ${freshSha}`)
console.log(`this season 2026-27: ${holdAll.length} matches, ${usable(holdAll).length} forecastable, ${holdFit.length} with both clubs on >= 5 games (rule set), ${holdS.open.length} opening-week; bundle sha256 ${sha256(holdBuf)}`)
{
  const both = (fs, lo, hi) => fs.filter(f => f.rh !== null && f.ra !== null && f.tH.p >= lo && f.tH.p <= hi && f.tA.p >= lo && f.tA.p <= hi)
  const sets = []
  for (const [n, all, s] of [['2025-26', trainAll, trainS], ['2024-25', freshAll, freshS], ['2026-27', holdAll, holdS]]) { sets.push([`${n} rule set`, s.rule, both(all, 5, 99)]); sets.push([`${n} opening weeks`, s.open, both(all, 1, 4)]) }
  check('the six match sets are exactly the matches with both clubs on >= 5 games, or on 1-4 games, recounted from the clubs\' own games played', sets.every(([, a, b]) => a.length === b.length && a.every(f => b.includes(f))), sets.map(([n, a, b]) => `${n} ${a.length}/${b.length}`).join('; '))
}
// The model-as-function equals the compiled model, on every forecastable match of all three seasons.
{
  let maxdiff = 0, n = 0
  for (const f of [...usable(trainAll), ...usable(freshAll), ...usable(holdAll)]) {
    const comp = Array.from(triple(forecastFor(1, makeRow(f.home, f.home, f.tH.p, f.tH.pts, f.tH.gf, f.tH.ga, 0), makeRow(f.away, f.away, f.tA.p, f.tA.pts, f.tA.gf, f.tA.ga, 0))))
    const mine = probs(f.rh, f.ra, TH0)
    for (let i = 0; i < 3; i++) maxdiff = Math.max(maxdiff, Math.abs(comp[i] - mine[i])); n++
  }
  console.log(`the parametrised model at table-v1's constants vs the compiled model: ${n} forecasts, max abs difference ${maxdiff.toExponential(2)}`)
  check(`the parametrised model at the declared constants equals the compiled model on all ${n} forecasts of the three seasons`, n === usable(trainAll).length + usable(freshAll).length + usable(holdAll).length && maxdiff < 1e-12)
}
{
  // C's draw share is exactly constant: infinite decay makes exp(-|d| / decay) exactly 1, so probs() returns the same draw probability for every gap.
  const ds = [0, 0.4, -3, 12].map(d => probs(d, 0, { ...TC, home: 0 })[1])
  check('the parametrised model with infinite decay gives the same draw probability at every gap, equal to the share', ds.every(x => x === TC.drawBase), ds.join(', '))
}
// The earlier records' numbers, reproduced: ties this script's training pipeline to records that were checked 29 ways.
{
  const v = trainFit.map(f => brier(probs(f.rh, f.ra, TH0), f.o)), vl = trainFit.map(f => logloss(probs(f.rh, f.ra, TH0), f.o))
  const o = trainS.open.map(f => brier(probs(f.rh, f.ra, TH0), f.o)), ol = trainS.open.map(f => logloss(probs(f.rh, f.ra, TH0), f.o))
  const got = `n ${trainFit.length} Brier ${f3(mean(v))} logloss ${f3(mean(vl))}; opening n ${trainS.open.length} Brier ${f3(mean(o))} logloss ${f3(mean(ol))}`
  check('table-v1 on the training set reproduces the earlier record: n 330 Brier 0.689 logloss 1.153; opening weeks n 40 Brier 0.860 logloss 1.715', got === 'n 330 Brier 0.689 logloss 1.153; opening n 40 Brier 0.860 logloss 1.715', got)
}
{
  const first99 = usable(holdAll.slice(0, 99)).filter(f => f.pre >= 5)
  const BINS = [[0, .2], [.2, .4], [.4, .6], [.6, .8], [.8, 1.01]]
  const line = ([lo, hi]) => { const s = first99.filter(f => { const p = probs(f.rh, f.ra, TH0)[0]; return p >= lo && p < hi }); return `n ${s.length} | ${(s.reduce((x, f) => x + probs(f.rh, f.ra, TH0)[0], 0) / s.length * 100).toFixed(0)}% | ${(s.filter(f => f.o === 0).length / s.length * 100).toFixed(0)}%` }
  const mine = BINS.map(line), want = ['n 12 | 7% | 50%', 'n 9 | 34% | 33%', 'n 7 | 50% | 43%', 'n 11 | 71% | 36%', 'n 10 | 88% | 80%']
  check('table-v1 on the first 99 2026-27 matches reproduces the 2026-27 record\'s five bins to the digit', holdAll.length >= 99 && mine.every((l, i) => l === want[i]), mine.filter((l, i) => l !== want[i]).join(' / '))
}

if (bundleOnly) {
  console.log('\nCHECKS (data only: C has not been fitted or scored)')
  for (const c of checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ? `[${c.detail}]` : '')
  const bad = checks.filter(c => !c.ok).length
  console.log(`\n${checks.length - bad} of ${checks.length} checks hold; coverage: 3 seasons loaded (${trainAll.length} + ${freshAll.length} + ${holdAll.length} matches), 2024-25 cross-checked against 3 sources (openfootball, FPL, ESPN)`)
  process.exit(bad === 0 ? 0 : 1)
}

// ------------------------------------------------------------------------------------------------------------ optimisers: two unrelated ones, on the same likelihood, in transformed coordinates
const logit = p => Math.log(p / (1 - p))
const toU = (th, free) => free.map(k => k === 'home' ? th.home : k === 'scale' ? Math.log(th.scale) : logit(th.drawBase / 0.9))
const fromU = (u, free, base) => { const th = { ...base }; free.forEach((k, i) => { th[k] = k === 'home' ? u[i] : k === 'scale' ? Math.exp(u[i]) : 0.9 / (1 + Math.exp(-u[i])) }); return th }
const nll = (fs, th) => { let s = 0; for (const f of fs) s += logloss(probs(f.rh, f.ra, th), f.o); return s }
function nelderMead(fn, x0, step = 0.3) {
  const n = x0.length
  let S = [x0.slice(), ...x0.map((_, i) => x0.map((v, j) => j === i ? v + step : v))], F = S.map(fn)
  for (let it = 0; it < 6000; it++) {
    const idx = F.map((_, i) => i).sort((a, b) => F[a] - F[b]); S = idx.map(i => S[i]); F = idx.map(i => F[i])
    if (Math.abs(F[n] - F[0]) < 1e-13 && S.every(s => Math.hypot(...s.map((v, j) => v - S[0][j])) < 1e-8)) break
    const c = S[0].map((_, j) => S.slice(0, n).reduce((a, s) => a + s[j], 0) / n)
    const pt = t => c.map((v, j) => v + t * (S[n][j] - v))
    const xr = pt(-1), fr = fn(xr)
    if (fr < F[0]) { const xe = pt(-2), fe = fn(xe); if (fe < fr) { S[n] = xe; F[n] = fe } else { S[n] = xr; F[n] = fr } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr }
    else { const xc = fr < F[n] ? pt(-0.5) : pt(0.5), fc = fn(xc); if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc } else for (let i = 1; i <= n; i++) { S[i] = S[0].map((v, j) => v + 0.5 * (S[i][j] - v)); F[i] = fn(S[i]) } }
  }
  const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] }
}
function coordinateDescent(fn, x0, span = 3) {
  let x = x0.slice(), f = fn(x); const gr = (Math.sqrt(5) - 1) / 2
  for (let cycle = 0; cycle < 400; cycle++) {
    const before = f
    for (let i = 0; i < x.length; i++) {
      let lo = x[i] - span, hi = x[i] + span; const at = v => { const y = x.slice(); y[i] = v; return fn(y) }
      for (let k = 0; k < 90; k++) { const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo); if (at(c) < at(d)) hi = d; else lo = c }
      const v = (lo + hi) / 2, fv = at(v); if (fv < f) { x[i] = v; f = fv }
    }
    if (before - f < 1e-14) break
  }
  return { x, f }
}
function invert(Mx) {         // Gauss-Jordan with partial pivoting; null if singular
  const n = Mx.length, A2 = Mx.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A2[r][c]) > Math.abs(A2[p][c])) p = r
    if (Math.abs(A2[p][c]) < 1e-12) return null
    ;[A2[c], A2[p]] = [A2[p], A2[c]]; const d = A2[c][c]; A2[c] = A2[c].map(v => v / d)
    for (let r = 0; r < n; r++) if (r !== c) { const k = A2[r][c]; A2[r] = A2[r].map((v, j) => v - k * A2[c][j]) }
  }
  return A2.map(r => r.slice(n))
}
// fit: as in outbox/forecast-fit-2026-11-08.mjs, except that "on a bound" is judged on the constants being FITTED. (The first version here inherited the old test, which also bounded the draw
// decay; C fixes the decay at infinity, so that test was red by construction. Found by running it on 2025-26 before the rule was committed.)
function fit(fs, free, baseTh) {
  const obj = u => nll(fs, fromU(u, free, baseTh))
  const u0 = toU(baseTh, free)
  const a = nelderMead(obj, u0), b = coordinateDescent(obj, u0.map(v => v + 0.2))
  const th = fromU(a.x, free, baseTh), thB = fromU(b.x, free, baseTh)
  const grad = a.x.map((_, i) => { const h = 1e-6, up = a.x.slice(), dn = a.x.slice(); up[i] += h; dn[i] -= h; return (obj(up) - obj(dn)) / (2 * h) })
  const nat = free.map(k => th[k]), natNll = v => { const t = { ...baseTh }; free.forEach((k, i) => { t[k] = v[i] }); return nll(fs, t) }
  const H = nat.map((_, i) => nat.map((_, j) => {
    const hi = 1e-3 * Math.max(1, Math.abs(nat[i])), hj = 1e-3 * Math.max(1, Math.abs(nat[j]))
    const at = (di, dj) => { const v = nat.slice(); v[i] += di; v[j] += dj; return natNll(v) }
    return i === j ? (at(hi, 0) - 2 * natNll(nat) + at(-hi, 0)) / (hi * hi) : (at(hi, hj) - at(hi, -hj) - at(-hi, hj) + at(-hi, -hj)) / (4 * hi * hj)
  }))
  const inv = invert(H), pd = inv !== null && H.every((_, i) => { const m = H.slice(0, i + 1).map(r => r.slice(0, i + 1)); const iv = invert(m); return iv !== null && iv[i][i] > 0 })
  const se = inv ? inv.map((r, i) => Math.sqrt(Math.max(0, r[i]))) : free.map(() => NaN)
  const onBound = free.some(k => th[k] < BOUNDS[k][0] || th[k] > BOUNDS[k][1])
  const agree = Math.abs(a.f - b.f) < 1e-6 && free.every(k => Math.abs(th[k] - thB[k]) < 1e-3 * Math.max(1, Math.abs(th[k])))
  return { th, thB, f: a.f, fB: b.f, grad, se, free, pd, onBound, agree, wellPosed: agree && pd && !onBound && grad.every(g => Math.abs(g) < 1e-3) }
}
const cvFolds = 5
function cvPredict(fs, free, baseTh) {
  const preds = new Array(fs.length), seen = new Array(fs.length).fill(0)
  let disjoint = true
  for (let k = 0; k < cvFolds; k++) {
    const tr = fs.filter((_, i) => i % cvFolds !== k)
    const testRows = new Set(fs.filter((_, i) => i % cvFolds === k))
    if (tr.some(f => testRows.has(f)) || tr.length + testRows.size !== fs.length) disjoint = false
    const u = nelderMead(v => nll(tr, fromU(v, free, baseTh)), toU(baseTh, free)).x
    const th = fromU(u, free, baseTh)
    fs.forEach((f, i) => { if (i % cvFolds === k) { preds[i] = probs(f.rh, f.ra, th); seen[i]++ } })
  }
  return { preds, partition: seen.every(s => s === 1), disjoint }
}
const logisticSlopeFns = (() => {
  function logisticNewton(xs, ys) {
    const nllL = (a, b) => { let s = 0; for (let i = 0; i < xs.length; i++) { const z = a + b * xs[i]; s += Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z))) - ys[i] * z } return s }
    const moments = (a, b) => { let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0; for (let i = 0; i < xs.length; i++) { const p = 1 / (1 + Math.exp(-(a + b * xs[i]))), r = ys[i] - p, w = p * (1 - p); g0 += r; g1 += r * xs[i]; h00 += w; h01 += w * xs[i]; h11 += w * xs[i] * xs[i] } return { g0, g1, h00, h01, h11, det: h00 * h11 - h01 * h01 } }
    let a = 0, b = 0
    for (let it = 0; it < 500; it++) {
      const m = moments(a, b), da = (m.h11 * m.g0 - m.h01 * m.g1) / m.det, db = (m.h00 * m.g1 - m.h01 * m.g0) / m.det
      let t = 1; const f0 = nllL(a, b); while (t > 1e-12 && !(nllL(a + t * da, b + t * db) <= f0 + 1e-12)) t /= 2
      a += t * da; b += t * db; if (Math.abs(t * da) + Math.abs(t * db) < 1e-13) break
    }
    const m = moments(a, b); return { a, b, seA: Math.sqrt(m.h11 / m.det), seB: Math.sqrt(m.h00 / m.det) }
  }
  function logisticProfile(xs, ys) {
    const nllL = (a, b) => { let s = 0; for (let i = 0; i < xs.length; i++) { const z = a + b * xs[i]; s += Math.log(1 + Math.exp(z)) - ys[i] * z } return s }
    const bestA = b => { let lo = -30, hi = 30; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; let d = 0; for (let i = 0; i < xs.length; i++) d += 1 / (1 + Math.exp(-(mid + b * xs[i]))) - ys[i]; if (d > 0) hi = mid; else lo = mid } return (lo + hi) / 2 }
    let lo = -5, hi = 8; const gr = (Math.sqrt(5) - 1) / 2
    for (let k = 0; k < 200; k++) { const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo); if (nllL(bestA(c), c) < nllL(bestA(d), d)) hi = d; else lo = c }
    const b = (lo + hi) / 2; return { a: bestA(b), b }
  }
  return { logisticNewton, logisticProfile }
})()
const slopeFrom = (pHome, fs) => { const xs = pHome.map(p => Math.log(p / (1 - p))), ys = fs.map(f => f.o === 0 ? 1 : 0); return { n: xs.length, newton: logisticSlopeFns.logisticNewton(xs, ys), profile: logisticSlopeFns.logisticProfile(xs, ys) } }
const slopeLine = (label, s) => console.log(`${label.padEnd(58)} n ${String(s.n).padStart(3)}: slope ${f2(s.newton.b)} +/- ${f2(s.newton.seB)}, intercept ${f2(s.newton.a)} +/- ${f2(s.newton.seA)}`)
const rates = fs => [0, 1, 2].map(k => fs.filter(f => f.o === k).length / fs.length)

// ------------------------------------------------------------------------------------------------------------ the fit of C, on 2025-26
const BASE = rates(trainFit)
console.log(`\nBASE-RATE FORECAST (home / draw / away shares of the ${trainFit.length} training matches, the same for every match): ${BASE.map(x => f3(x)).join(' / ')}`)
const baseNll = nll(trainFit, TH0)
console.log(`\nFIT (maximum likelihood on the ${trainFit.length} training forecasts; log loss summed over the matches):`)
console.log(`  table-v1 (home ${f2(TH0.home)}, scale ${f2(TH0.scale)}, draw ${f2(TH0.drawBase)}*exp(-|gap|/${f2(TH0.drawDecay)})): total log loss ${f2(baseNll)}, per match ${f3(baseNll / trainFit.length)}`)
const fitC = fit(trainFit, FREE_C, TC)
const thC = { ...TC, home: r2(fitC.th.home), scale: r2(fitC.th.scale), drawBase: r2(fitC.th.drawBase) }
console.log(`  C: ${FREE_C.map((k, i) => `${k === 'drawBase' ? 'draw share' : k} ${f3(fitC.th[k])} +/- ${f3(fitC.se[i])}`).join(', ')}; total log loss ${f2(fitC.f)} (${f2(baseNll - fitC.f)} below table-v1's); per match ${f3(fitC.f / trainFit.length)}`)
console.log(`     solvers: Nelder-Mead and golden-section coordinate descent end ${Math.abs(fitC.f - fitC.fB).toExponential(1)} apart in log loss${fitC.agree ? '' : ' and DISAGREE'}; |gradient| max ${Math.max(...fitC.grad.map(Math.abs)).toExponential(1)}; Hessian positive definite: ${fitC.pd}; a fitted constant on a bound: ${fitC.onBound}`)
console.log(`  ROUNDED TO TWO DECIMALS (what would ship as table-v2): home +${f2(thC.home)}, scale ${f2(thC.scale)}, draw share ${f2(thC.drawBase)} for every match`)
check('C fit: the fitted constants rounded to two decimals are the ones quoted in the rule block (home 0.42, scale 1.14, draw share 0.27)', thC.home === DISCLOSED.fit.home && thC.scale === DISCLOSED.fit.scale && thC.drawBase === DISCLOSED.fit.drawBase, `${thC.home}, ${thC.scale}, ${thC.drawBase}`)

// ---- the cross-validated numbers the rule block quotes, reproduced
const cvC = cvPredict(trainFit, FREE_C, TC)
check('C fit: the cross-validation folds partition the matches and train on none of their own test rows', cvC.partition && cvC.disjoint)
const cvClim = trainFit.map((_, i) => rates(trainFit.filter((_, j) => j % cvFolds !== i % cvFolds)))
const cvBc = cvC.preds.map((p, i) => brier(p, trainFit[i].o)), cvBv = trainFit.map(f => brier(probs(f.rh, f.ra, TH0), f.o)), cvBb = cvClim.map((p, i) => brier(p, trainFit[i].o))
const cvZv = paired(cvBc, cvBv), cvZb = paired(cvBc, cvBb), slCV = slopeFrom(cvC.preds.map(p => p[0]), trainFit)
console.log(`\n2025-26, 5-fold cross-validated (n ${trainFit.length}; quoted in the rule block): Brier C ${f4(mean(cvBc))}, table-v1 ${f4(mean(cvBv))}, base rate ${f4(mean(cvBb))}, uniform ${f4(RULE.uniform)}; paired z against table-v1 ${f2(cvZv.z)}, against the base rate ${f2(cvZb.z)}; home-win slope ${f2(slCV.newton.b)} +/- ${f2(slCV.newton.seB)}`)
{
  const got = { brierC: f4(mean(cvBc)), brierV1: f4(mean(cvBv)), brierBase: f4(mean(cvBb)), zV1: f2(cvZv.z), zBase: f2(cvZb.z), slope: f2(slCV.newton.b), slopeSE: f2(slCV.newton.seB) }
  check('the 2025-26 cross-validated numbers equal those the rule block quotes', JSON.stringify(got) === JSON.stringify(DISCLOSED.cv), JSON.stringify(got))
}

// ------------------------------------------------------------------------------------------------------------ scoring on the seasons C has not seen
const score = (fs, th) => fs.map(f => { const p = probs(f.rh, f.ra, th); return { b: brier(p, f.o), l: logloss(p, f.o), p } })
const scoreBase = fs => fs.map(f => ({ b: brier(BASE, f.o), l: logloss(BASE, f.o), p: BASE }))
function row(label, fs) {
  if (fs.length < 2) { console.log(label.padEnd(46), 'n', fs.length); return null }
  const c = score(fs, thC), v = score(fs, TH0), b = scoreBase(fs)
  const pv = paired(c.map(x => x.b), v.map(x => x.b)), pb = paired(c.map(x => x.b), b.map(x => x.b)), pu = paired(c.map(x => x.b), c.map(() => RULE.uniform))
  const lv = paired(c.map(x => x.l), v.map(x => x.l)), lb = paired(c.map(x => x.l), b.map(x => x.l))
  console.log(label.padEnd(46), 'n', String(fs.length).padStart(3), '| Brier C', f4(mean(c.map(x => x.b))), 'v1', f4(mean(v.map(x => x.b))), 'base', f4(mean(b.map(x => x.b))), 'uniform', f4(RULE.uniform),
    '| C-v1', signed(pv.mean), '+/-', f3(pv.se), 'z', f2(pv.z), '| C-base', signed(pb.mean), '+/-', f3(pb.se), 'z', f2(pb.z), '| C-uniform z', f2(pu.z))
  console.log(' '.repeat(46), '   log loss C', f3(mean(c.map(x => x.l))), 'v1', f3(mean(v.map(x => x.l))), 'base', f3(mean(b.map(x => x.l))), '| C-v1 z', f2(lv.z), '| C-base z', f2(lb.z))
  return { c, v, b, pv, pb, pu, brierC: mean(c.map(x => x.b)), brierV: mean(v.map(x => x.b)), brierB: mean(b.map(x => x.b)) }
}
console.log('\nSCORES, C (rounded) against table-v1, the base-rate forecast and a uniform guess; "z" = paired mean difference / its standard error, negative favours C:')
const rFresh = row('2024-25 RULE SET, both clubs >= 5 games', freshFit)
const rFreshOpen = row('2024-25 opening weeks (1-4 games)', freshS.open)
const rHold = row('2026-27 RULE SET, both clubs >= 5 games', holdFit)
const rHoldOpen = row('2026-27 opening weeks (1-4 games)', holdS.open)
const rTrainIn = row('2025-26 in-sample, both clubs >= 5 games', trainFit)

console.log('\nCALIBRATION of the home-win probability (calibrated = slope 1.00, intercept 0.00):')
const slFresh = slopeFrom(freshFit.map(f => probs(f.rh, f.ra, thC)[0]), freshFit)
const slFreshV1 = slopeFrom(freshFit.map(f => probs(f.rh, f.ra, TH0)[0]), freshFit)
const slHold = slopeFrom(holdFit.map(f => probs(f.rh, f.ra, thC)[0]), holdFit)
const slTrainIn = slopeFrom(trainFit.map(f => probs(f.rh, f.ra, thC)[0]), trainFit)
slopeLine('C, 2024-25 (the rule set)', slFresh); slopeLine('table-v1, 2024-25', slFreshV1); slopeLine('C, 2026-27', slHold); slopeLine('C, 2025-26 in-sample (rounded constants)', slTrainIn)
check('slope: the two unrelated solvers agree to 1e-4, all finite, on all five fits', [slCV, slFresh, slFreshV1, slHold, slTrainIn].every(x => [x.newton.a, x.newton.b, x.newton.seA, x.newton.seB, x.profile.a, x.profile.b].every(Number.isFinite) && Math.abs(x.newton.b - x.profile.b) < 1e-4 && Math.abs(x.newton.a - x.profile.a) < 1e-4))
{
  const got = { n: holdFit.length, brierC: f4(rHold.brierC), brierV1: f4(rHold.brierV), brierBase: f4(rHold.brierB), zV1: f2(rHold.pv.z), zBase: f2(rHold.pb.z), slope: f2(slHold.newton.b), slopeSE: f2(slHold.newton.seB), draws: f3(holdFit.filter(f => f.o === 1).length / holdFit.length) }
  check('the 2026-27 numbers equal those the rule block quotes', JSON.stringify(got) === JSON.stringify(DISCLOSED.hold), JSON.stringify(got))
}

// ------------------------------------------------------------------------------------------------------------ the verdict
const integrityOk = () => checks.every(c => c.ok)
const m = {
  z1: rFresh?.pv.z, z2: rFresh?.pb.z, slope: slFresh.newton.b, slopeSE: slFresh.newton.seB,
  openFreshC: rFreshOpen?.brierC, openFreshV1: rFreshOpen?.brierV, openHoldC: rHoldOpen?.brierC, openHoldV1: rHoldOpen?.brierV,
  z5: rHold?.pv.z, wellPosed: fitC.wellPosed, checksOk: integrityOk(),
}
const verdict = decide(m)
const METHOD_STATEMENT = `table-v2: ppg + 0.25*gdpg + 0.10*gfpg, home +${f2(thC.home)}, scale ${f2(thC.scale)}, draw ${f2(thC.drawBase)} for every match`
console.log('\nRULE')
const rules = [
  ['N1', `2024-25 rule set: C beats table-v1, paired z <= ${RULE.z1}`, `z ${f2(m.z1)}, n ${freshFit.length}`, m.z1 <= RULE.z1],
  ['N2', `2024-25 rule set: C beats the base-rate forecast, paired z <= ${RULE.z2}`, `z ${f2(m.z2)}, n ${freshFit.length}, Brier C ${f4(rFresh.brierC)} vs base ${f4(rFresh.brierB)}`, m.z2 <= RULE.z2],
  ['N3', `2024-25 rule set: C's home-win slope is within ${RULE.slopeSigma} standard errors of 1`, `slope ${f2(m.slope)} +/- ${f2(m.slopeSE)}`, Math.abs(m.slope - 1) <= RULE.slopeSigma * m.slopeSE],
  ['N4', 'opening weeks, 2024-25 and 2026-27: C is no worse than table-v1', `2024-25 ${f3(m.openFreshC)} vs ${f3(m.openFreshV1)} (n ${freshS.open.length}), 2026-27 ${f3(m.openHoldC)} vs ${f3(m.openHoldV1)} (n ${holdS.open.length})`, m.openFreshC <= m.openFreshV1 && m.openHoldC <= m.openHoldV1],
  ['N5', '2026-27 rule set: C beats table-v1, paired z < 0 (a tripwire)', `z ${f2(m.z5)}, n ${holdFit.length}`, m.z5 < 0],
  ['N6', 'the fit on 2025-26 is well posed', String(m.wellPosed), m.wellPosed],
]
for (const [id, text, val, ok] of rules) console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} ${text} [${val}]`)
console.log('  (N7, every integrity check, is judged after the check list below)')
check('the verdict function and the rule table above agree on N1-N6', rules.every(([id, , , ok]) => ok === !verdict.failed.some(f => f.startsWith(id))))

// ------------------------------------------------------------------------------------------------------------ REPORTED, NOT GATING
console.log('\nREPORTED, NOT GATING:')
{
  const pa = freshFit.map(f => probs(f.rh, f.ra, thC)), act = rates(freshFit), nF = freshFit.length
  console.log(`  2024-25 rule set, C's mean probability vs how often it happened: home ${pct(mean(pa.map(p => p[0])))} vs ${pct(act[0])}, draw ${pct(mean(pa.map(p => p[1])))} vs ${pct(act[1])} (binomial SE ${(Math.sqrt(act[1] * (1 - act[1]) / nF) * 100).toFixed(1)} points), away ${pct(mean(pa.map(p => p[2])))} vs ${pct(act[2])}`)
  console.log(`  2024-25 rule set, table-v1 for comparison: draw ${pct(mean(freshFit.map(f => probs(f.rh, f.ra, TH0)[1])))} vs ${pct(act[1])}`)
  const all = usable(freshAll), c = score(all, thC), v = score(all, TH0), pr = paired(c.map(x => x.b), v.map(x => x.b))
  console.log(`  2024-25, every forecastable match (n ${all.length}): Brier C ${f4(mean(c.map(x => x.b)))} vs table-v1 ${f4(mean(v.map(x => x.b)))}; z ${f2(pr.z)}`)
  const rev = fit(freshFit, FREE_C, TC), revTh = { ...TC, home: r2(rev.th.home), scale: r2(rev.th.scale), drawBase: r2(rev.th.drawBase) }
  const revScore = trainFit.map(f => brier(probs(f.rh, f.ra, revTh), f.o)), revV = trainFit.map(f => brier(probs(f.rh, f.ra, TH0), f.o)), revP = paired(revScore, revV)
  console.log(`  reverse fold: C fitted on 2024-25 alone: ${FREE_C.map((k, i) => `${k === 'drawBase' ? 'draw share' : k} ${f3(rev.th[k])} +/- ${f3(rev.se[i])}`).join(', ')} (well posed: ${rev.wellPosed}); scored on 2025-26's ${trainFit.length} (rounded): Brier ${f4(mean(revScore))} vs table-v1 ${f4(mean(revV))}, z ${f2(revP.z)}`)
  const pool = fit([...trainFit, ...freshFit], FREE_C, TC)
  console.log(`  pooled constants (2025-26 + 2024-25, ${trainFit.length + freshFit.length} forecasts; what a LATER revision would start from, not what ships): ${FREE_C.map((k, i) => `${k === 'drawBase' ? 'draw share' : k} ${f3(pool.th[k])} +/- ${f3(pool.se[i])}`).join(', ')} (well posed: ${pool.wellPosed})`)
}

if (dumpPath) {
  const slim = fs => fs.map(f => ({ rh: f.rh, ra: f.ra, o: f.o }))
  fs.writeFileSync(dumpPath, JSON.stringify({
    TH0, thC: { home: thC.home, scale: thC.scale, drawBase: thC.drawBase }, base: BASE, cvFolds,
    train: slim(trainFit), trainOpen: slim(trainS.open), fresh: slim(freshFit), freshOpen: slim(freshS.open), hold: slim(holdFit), holdOpen: slim(holdS.open), freshAll: slim(usable(freshAll)),
    js: { fit: { th: { home: fitC.th.home, scale: fitC.th.scale, drawBase: fitC.th.drawBase }, nll: fitC.f }, baseNll,
      n1: { brierC: rFresh.brierC, brierV: rFresh.brierV, brierB: rFresh.brierB, zV: rFresh.pv.z, zB: rFresh.pb.z, zU: rFresh.pu.z },
      slope: { b: slFresh.newton.b, se: slFresh.newton.seB }, open: { freshC: rFreshOpen.brierC, freshV: rFreshOpen.brierV, holdC: rHoldOpen.brierC, holdV: rHoldOpen.brierV },
      hold: { brierC: rHold.brierC, brierV: rHold.brierV, brierB: rHold.brierB, zV: rHold.pv.z, zB: rHold.pb.z }, cv: { brierC: mean(cvBc), brierV: mean(cvBv), brierB: mean(cvBb), zV: cvZv.z, zB: cvZb.z, slope: slCV.newton.b, se: slCV.newton.seB } },
  }))
}

console.log('\nCHECKS')
for (const c of checks) console.log(c.ok ? 'PASS' : 'FAIL', c.name, c.detail ? `[${c.detail}]` : '')
const failed = checks.filter(c => !c.ok).length
const final = decide({ ...m, checksOk: failed === 0 })
console.log(`\n${checks.length - failed} of ${checks.length} checks hold; coverage: 3 seasons (${trainAll.length} + ${freshAll.length} + ${holdAll.length} matches), ${trainFit.length} training forecasts fitted, ${freshFit.length} 2024-25 forecasts judged by N1-N3 (${freshS.open.length} opening-week), ${holdFit.length} 2026-27 forecasts judged by N5 (${holdS.open.length} opening-week), 2024-25 cross-checked against 3 sources`)
console.log(`\nVERDICT: ${final.ship ? `SHIP table-v2 (candidate C); constants home +${f2(thC.home)}, scale ${f2(thC.scale)}, draw share ${f2(thC.drawBase)}; method statement "${METHOD_STATEMENT}"` : `DO NOT SHIP. ${final.failed.join('; ')}`}`)
process.exitCode = failed === 0 ? 0 : 1
