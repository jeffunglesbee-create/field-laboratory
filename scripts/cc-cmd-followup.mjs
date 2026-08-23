// Did the CC-CMDs this repo filed actually land?
//
// WHY THIS EXISTS
//
// Five CC-CMDs have been filed into `field-relay-nba/docs/` from here. Two are
// open asks. Nothing checked whether any of them were acted on — the filing was
// the end of the process, which makes a CC-CMD a wish with a commit sha.
//
// This probes for the OBSERVABLE CONSEQUENCE of each ask, not for the document.
// A document can be read, agreed with, and never implemented; a route either
// projects a field or it does not.
//
// It is deliberately NON-FATAL. An ask that has not landed is not a defect in
// this repository, and turning someone else's backlog into a red build here
// would be the kind of pressure that gets a check deleted. It reports, and the
// reporting is the follow-up.
//
// Exit is non-zero only if the PROBE itself could not run — an unreachable relay
// means "not verified", and reporting that as "not landed" would be a claim from
// no data, which is the failure this repo keeps finding.

import { soccerBriefDefect } from './soccer-brief-defect.mjs'

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const TOLERATE = process.argv.includes('--tolerate-unreachable')
const SELF_TEST = process.argv.includes('--self-test')

// The soccer three-way ask (CC-CMD-2026-08-23) must look at CURRENT data, not a
// frozen date. The odds-api adapter change it asks for applies to newly captured
// odds going forward, so a historical date would never show it landing. Yesterday
// (UTC) is used because opening odds are captured ~10:01Z on the game date, so
// yesterday's slate is always fully populated whatever time the sentinel runs.
const yesterdayUTC = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

// The sports the laboratory marks `IsSoccer = true` in `src/Desk.fs` sportMeta,
// by the label /context/date serves. It bounds only the DENOMINATOR of the draw
// probe: a soccer league missing here makes that game "not observable", never a
// false "landed" — the safe direction. Keep in sync as new soccer leagues are
// modelled desk-side.
const SOCCER_SPORTS = new Set(['MLS', 'EPL', 'La Liga', 'EFL Cup'])

// The soccer moneylines on a /context/date payload, parsed from opening_odds.
// Shared by the live predicate and the self-test so both read the shape one way.
const soccerMoneylines = j => {
  const games = Array.isArray(j?.games?.regular) ? j.games.regular : []
  const lines = []
  for (const g of games) {
    if (!SOCCER_SPORTS.has(g?.sport) || !g?.opening_odds) continue
    let ml
    try { ml = JSON.parse(g.opening_odds).moneyline } catch { continue }
    if (ml && typeof ml === 'object') lines.push(ml)
  }
  return lines
}

/// Soccer games in a /context/date payload, split by whether they carry an
/// OPENING line. Distinct from soccerMoneylines above, which reads the shape of
/// a line that exists; this counts whether one exists at all.
///
/// Added 2026-08-23 for the closing-odds ask, and the reason is worth stating:
/// that ask sat "staged, blocked by a soccer slate running after bb04fc8" for
/// two days AFTER soccer had played. A staged item whose unblock condition is a
/// FUTURE EVENT goes stale silently, because nothing re-evaluates whether the
/// event happened — a human has to notice. Everything in this file re-evaluates
/// every sentinel run, which is the property that ask was missing.
const soccerOpeningCoverage = j => {
  const games = Array.isArray(j?.games?.regular) ? j.games.regular : []
  const soccer = games.filter(g => SOCCER_SPORTS.has(g?.sport))
  const withOpen = soccer.filter(g => {
    if (!g?.opening_odds) return false
    try { return !!JSON.parse(g.opening_odds) } catch { return false }
  })
  return { soccer: soccer.length, withOpen: withOpen.length }
}

// The soccer-brief defect scanner (cross-sport vocabulary, a vacuous 0-0-0
// record, a stalemate beside a stated lead) lives in ./soccer-brief-defect.mjs
// so the CC-CMD follow-up and the cross-repo evidence runner share one copy.
// `CC-CMD-2026-08-22-brief-sport-contamination` is a STOP-GENERATING ask: its
// observable consequence is those defects DISAPPEARING from the relay's soccer
// briefs, so the predicate below scans returned briefs and reports `still gen`
// until every one is clean.

/**
 * Asks that have LANDED, and the same predicate that showed they did.
 *
 * WHY THESE ARE NOT SIMPLY DELETED
 *
 * `quality-bar-scale` landed on 2026-08-18, confirmed by run 32094556326. Left
 * in the open list it would print `::notice::LANDED` on every sentinel run
 * forever — an alarm that can never be cleared, which the sentinel's own
 * issue-closing step argues against in its own words: "an issue that outlives
 * its cause trains people to ignore the next one."
 *
 * Deleting it is the other wrong answer. The ask landed because a field appeared
 * on a route, and a field that appeared can disappear. Laboratory now depends on
 * it — `Ceiling.relayReachable` is 245 and production finally reports the scale
 * it is measuring against.
 *
 * So the asymmetry is deliberate and is the whole point of this split:
 *
 *   AN OPEN ASK THAT HAS NOT LANDED IS NOT FATAL. It is someone else's backlog,
 *   and turning it into a red build here is the pressure that gets a check
 *   deleted.
 *
 *   A LANDED ASK THAT STOPS HOLDING IS FATAL. It is a regression against a fact
 *   this repository was told it could rely on.
 */
const LANDED = [
  {
    cmd: 'CC-CMD-2026-08-15-quality-bar-scale',
    ask: 'name the scale wherever the flat 240 bar is reported',
    route: '/quality/report',
    landedOn: '2026-08-18',
    landedIn: 'drift-sentinel run 32094556326',
    holds: j => {
      const s = JSON.stringify(j)
      return /reachable_ceiling|of_300|_of_245/.test(s)
    },
    note: 'a denominator on below_240 / above_240 / below_flat_240_pct — the 240 bar is 80% of the nominal 300 but 97.96% of the 245 the relay can reach',
  },
]

/** Each OPEN ask, and the observable fact that would show it landed. */
const ASKS = [
  {
    cmd: 'CC-CMD-2026-08-16-quality-coverage-route',
    ask: 'expose jq-scoring-coverage on a GET route',
    route: '/quality/coverage?days=7',
    landed: j => j && j.ok === true && ('byDay' in j || 'era3ByType' in j),
    note: 'the route itself existing is the whole ask',
  },
  {
    cmd: 'CC-CMD-2026-08-16-quality-coverage-route (second ask)',
    ask: 'add scoring_version to the /archive/query projection',
    route: '/archive/query?date=2026-08-14&limit=1',
    landed: j => Array.isArray(j?.results) && j.results.length > 0 &&
      'scoring_version' in j.results[0],
    note: 'Phase 2 unblocks the day this is true — every stored score gains a rubric',
  },
  {
    cmd: 'CC-CMD-2026-08-21-closing-odds-capture (surviving ask)',
    ask: 'capture opening_odds for EPL and La Liga, so the open/close pair is a real sequence',
    route: `/context/date/${yesterdayUTC()}`,
    // Three states, same discipline as the three-way ask below.
    //
    // `null` = no soccer game in the payload at all. An off-day proves nothing,
    // and reporting it as `false` would read as "the fix regressed" every
    // Monday.
    //
    // `true`  = at least one soccer game carries an opening line. That IS the
    // surviving ask: the relay's own probe measured EPL 4/5 and La Liga 2/3 on
    // 2026-08-23 against a 23.1% / 11.8% pre-fix baseline.
    //
    // `false` = soccer games are served and NONE carries an opening line, which
    // is the pre-fix condition returning.
    //
    // WHY THIS ROUTE AND NOT A NEW SPLIT IN drift-check.mjs. The first plan was
    // to break the sentinel's `both/notseq/moved/unmoved` aggregate down by
    // sport. That would have measured ONE DAY'S SLATE — the same limitation the
    // sport-vocabulary check was built this morning to escape, reintroduced one
    // item later. Coverage is a property of a population, and the relay already
    // measures it properly: verify-staged-items.mjs check 2 is past-dates-only,
    // per-sport, against the measured baseline, with a min-games floor that
    // flags "La Liga (2/3)" rather than reporting 66.7% as settled. Duplicating
    // that here would be a second measurement free to disagree with it. This
    // predicate answers the narrower daily question — is the relay still doing
    // it — and the relay's own probe remains authoritative for the rate.
    landed: j => {
      const { soccer, withOpen } = soccerOpeningCoverage(j)
      if (soccer === 0) return null
      return withOpen > 0
    },
    note: 'the rate lives in the relay\'s own staged-verification probe (EPL 4/5, La Liga 2/3 on 2026-08-23, baselines 23.1% / 11.8%); this reads LANDED while any soccer game still carries an opening line, and turns false if that stops',
  },
  {
    cmd: 'CC-CMD-2026-08-23-soccer-three-way-odds',
    ask: 'project the draw price into opening_odds.moneyline for soccer markets',
    route: `/context/date/${yesterdayUTC()}`,
    // Three states. `null` = no soccer game carried a moneyline this run
    // (off-day / not yet captured) — observable-but-empty, neither confirmation
    // nor defect. `true` = at least one soccer moneyline now carries a `draw`
    // key — the ask landed. `false` = soccer moneylines are served but every one
    // is still two-way {home, away}. A draw key is unambiguous: only three-way
    // (soccer) markets have one, so its appearance IS the landed signal.
    landed: j => {
      const lines = soccerMoneylines(j)
      if (lines.length === 0) return null
      return lines.some(ml => 'draw' in ml)
    },
    note: 'as of filing (2026-08-23) every MLS moneyline is {home, away} with no draw, so winProbability yields ThreeWayDrawMissing and the card says "no draw price served". Reads LANDED the day a soccer moneyline carries a draw — no laboratory change needed, the three-way render is shipped',
  },
  {
    // A STOP-GENERATING ask — see `cessation` below and the scanner above.
    cmd: 'CC-CMD-2026-08-22-brief-sport-contamination',
    ask: 'soccer briefs carry no cross-sport vocabulary, no 0-0-0 record cited as season context, and no stalemate beside a stated lead',
    route: '/archive/query?sport=EPL&limit=40',
    cessation: true,
    // Three states, not two. `null` means "no EPL briefs came back this run" —
    // observable-but-empty, which is neither confirmation nor a defect and must
    // not read as "still generating". `true` = every returned brief is clean;
    // `false` = at least one still carries a flagged defect.
    landed: j => {
      const rows = Array.isArray(j?.results) ? j.results : []
      const withText = rows.filter(r => (r.brief_text || '').trim() !== '')
      if (withText.length === 0) return null
      return withText.every(r => soccerBriefDefect(r.brief_text) === null)
    },
    note: 'route assumes /archive/query?sport=EPL returns recent EPL briefs; if the relay pins a date, adjust the route. As of filing (2026-08-22) the defect is live — Everton/Brentford cards — so this reads "still generating" until the relay grounds soccer briefs in soccer stats and the table',
  },
]

// ── the self-test: do the predicates discriminate? ──────────────────────────
//
// These predicates have only ever run against the live relay, where a pass and
// a broken predicate look identical — `landed: () => true` would have reported
// every ask landed and nothing would have objected. Exercised here against
// fixtures, with no network, so the discrimination is the thing being tested.

if (SELF_TEST) {
  const { createChecks } = await import('./checks.mjs')
  const { check, summarize } = createChecks()

  const bar = LANDED.find(a => a.cmd.includes('quality-bar-scale'))
  check('the bar-scale predicate accepts a payload naming the scale',
    bar.holds({ below_240_of_245: 25, above_240: 0 }),
    'the shape that actually landed is rejected')
  check('and rejects one that reports the bar with no denominator',
    !bar.holds({ below_240: 25, above_240: 0, below_flat_240_pct: 100 }),
    'a bare count passes as though the scale were named — the ask is the denominator')

  // The closing-odds surviving ask. Its three states matter more than most:
  // this predicate replaced a staged note whose unblock condition was a future
  // event, and the whole point is that an off-day must not read as a regression.
  const co = ASKS.find(a => a.cmd.includes('closing-odds-capture'))
  const gm = (sport, opening) => ({ sport, opening_odds: opening })
  const payload = games => ({ games: { regular: games } })

  check('closing-odds: a soccer game with an opening line reads LANDED',
    co.landed(payload([gm('EPL', '{"moneyline":{"home":-142}}')])) === true,
    'the condition the relay measured at EPL 4/5 does not read as landed')

  check('closing-odds: soccer served with NO opening line reads not-landed',
    co.landed(payload([gm('EPL', null), gm('La Liga', null)])) === false,
    'the pre-fix condition returning would pass unnoticed')

  check('closing-odds: an off-day is null, not a regression',
    co.landed(payload([gm('MLB', '{"moneyline":{"home":-110}}')])) === null,
    'a Monday with no soccer would report the fix as broken every week')

  check('closing-odds: an empty payload is null, not a regression',
    co.landed(payload([])) === null && co.landed({}) === null,
    'an unobservable run reads as a defect')

  check('closing-odds: unparseable opening_odds does not count as coverage',
    co.landed(payload([gm('EPL', 'not json')])) === false,
    'a corrupt column passes as a captured line')

  check('closing-odds: one covered soccer game among uncovered ones is enough',
    co.landed(payload([gm('EPL', null), gm('La Liga', '{"moneyline":{}}')])) === true,
    'partial coverage reads as total failure — EPL measured 4 of 5, not 5 of 5')

  const cov = ASKS.find(a => a.route.startsWith('/quality/coverage'))
  check('the coverage predicate needs the route to actually answer',
    cov.landed({ ok: true, byDay: [] }) && !cov.landed({ ok: false }) && !cov.landed(null),
    'an error body or a null passes as the route existing')

  const sv = ASKS.find(a => a.ask.includes('scoring_version'))
  check('the scoring_version predicate needs the FIELD, not a non-empty result',
    sv.landed({ results: [{ id: 1, scoring_version: null }] }) &&
    !sv.landed({ results: [{ id: 1 }] }) && !sv.landed({ results: [] }),
    'presence of rows is being mistaken for presence of the column')

  // The column may legitimately be null on old rows; the ask is that it is
  // PROJECTED. Stated so the looser reading is not adopted by accident later.
  check('a projected-but-null scoring_version counts as landed',
    sv.landed({ results: [{ scoring_version: null }] }),
    'requiring a non-null value would keep the ask open forever on historical rows')

  check('no ask appears in both the open and landed lists',
    !ASKS.some(a => LANDED.some(l => l.cmd === a.cmd)),
    'an ask is being reported twice, in two different states')

  // ── the soccer three-way draw probe discriminates ──────────────────────────
  //
  // The ask lands when a soccer moneyline carries a `draw` key. A predicate that
  // returned `true` on the two-way {home, away} the relay serves today would
  // report the ask landed while soccer win probability is still un-renderable —
  // the false confidence this file exists to refuse. Exercised against the real
  // MLS shape, a with-draw shape, and an MLB-only slate that must read "no rows".
  const draw = ASKS.find(a => a.cmd.includes('soccer-three-way-odds'))
  const soccerGame = (sport, moneyline) =>
    ({ sport, opening_odds: JSON.stringify({ moneyline }) })
  const MLS_TWO_WAY = { games: { regular: [soccerGame('MLS', { home: 125, away: 180 })] } }
  const MLS_THREE_WAY = { games: { regular: [soccerGame('MLS', { home: 125, draw: 240, away: 180 })] } }
  const MLB_ONLY = { games: { regular: [soccerGame('MLB', { home: -104, away: -103 })] } }

  check('the draw probe reads the live two-way MLS moneyline as NOT landed',
    draw.landed(MLS_TWO_WAY) === false,
    'a {home, away} soccer line passes as though a draw were served')
  check('it reads a soccer moneyline carrying a draw key as landed',
    draw.landed(MLS_THREE_WAY) === true,
    'the with-draw shape the ask is for is not recognised as landed')
  check('an MLB-only slate is "no rows", not "not landed"',
    draw.landed(MLB_ONLY) === null,
    "a two-way sport that cannot draw drags the ask to 'not yet' from nothing to observe")
  check('an empty slate reports null (not observable), never a false not-landed',
    draw.landed({ games: { regular: [] } }) === null && draw.landed(null) === null,
    'an empty or missing payload reads as a defect instead of nothing to observe')
  check('one soccer game with a draw among two-way lines counts as landed',
    draw.landed({ games: { regular: [
      soccerGame('MLS', { home: 125, away: 180 }),
      soccerGame('La Liga', { home: -110, draw: 240, away: 260 }),
    ] } }) === true,
    'a single with-draw line is masked by the two-way ones around it')

  // ── the contamination scanner discriminates ───────────────────────────────
  //
  // A stop-generating predicate that returned `true` on the defect would confirm
  // the ask landed while the relay still ships the falsehood — the exact
  // false-confidence this file exists to refuse. Exercised against the two real
  // cards the CC-CMD was filed on, plus clean prose that must not be flagged.
  const contam = ASKS.find(a => a.cmd.includes('brief-sport-contamination'))
  const EVERTON = 'Everton secured a 2-0 win, maintaining a 107.7 DRTG, best in the NBA, despite playing soccer tonight.'
  const BRENTFORD = 'Brentford leads Spurs 3-0 in the 58th minute. Both teams hold 0-0-0 records this season. The game remains a 0-0-0 stalemate in league standings.'
  const CLEAN = 'Arsenal beat Coventry 3-0 at the Emirates, Saka scoring in the 34th; Arsenal sit top of the table on goal difference.'
  const MID_SEASON = 'City are 5-2-1 and sit second, chasing the Champions League places.'

  check('the contamination probe flags a soccer brief naming NBA/DRTG (not landed)',
    contam.landed({ results: [{ brief_text: EVERTON }] }) === false,
    'cross-sport vocabulary passes as clean')
  check('it flags a stated lead called a stalemate, and reads 0-0-0 as a record not a 0-0 score',
    contam.landed({ results: [{ brief_text: BRENTFORD }] }) === false,
    'the Brentford card passes, or 0-0-0 is misread as a level score')
  check('it is silent on a clean soccer brief that leads with table position',
    contam.landed({ results: [{ brief_text: CLEAN }] }) === true,
    'a clean brief is flagged — the check would nag the relay over nothing')
  check('a discriminating mid-season record (5-2-1) is NOT flagged — only the vacuous 0-0-0 is',
    contam.landed({ results: [{ brief_text: MID_SEASON }] }) === true,
    'the probe flags records generally rather than the wrong-stat 0-0-0 line')
  check('no EPL briefs this run reports null (not observable), never "still generating"',
    contam.landed({ results: [] }) === null,
    'an empty slate reads as a defect instead of as nothing to observe')
  check('a mixed batch with one contaminated brief is not landed',
    contam.landed({ results: [{ brief_text: CLEAN }, { brief_text: EVERTON }] }) === false,
    'one clean brief masks a contaminated one')

  process.exit(summarize() === 0 ? 0 : 1)
}

let unreachable = 0
const rows = []

// Landed asks first: a regression is more urgent than a pending ask.
const regressed = []
let landedUnverified = 0
for (const a of LANDED) {
  try {
    const r = await fetch(`${RELAY}${a.route}`, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) { landedUnverified++; continue }
    if (!a.holds(await r.json())) regressed.push(a)
  } catch { landedUnverified++ }
}

// Field-appearance asks read LANDED / not yet. A cessation ask reads stopped /
// still gen, and has a third truth its predicate returns as `null`: the route
// answered but carried nothing to observe this run — not a confirmation and not
// a defect, so it must never masquerade as either.
const stateFor = (a, ok) => {
  if (ok === null || ok === undefined) return 'no rows'
  if (a.cessation) return ok ? 'stopped' : 'still gen'
  return ok ? 'LANDED' : 'not yet'
}

for (const a of ASKS) {
  try {
    const r = await fetch(`${RELAY}${a.route}`, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) { rows.push({ ...a, state: `HTTP ${r.status}` }); unreachable++; continue }
    const j = await r.json()
    rows.push({ ...a, state: stateFor(a, a.landed(j)) })
  } catch (e) {
    rows.push({ ...a, state: `unreachable: ${String(e).slice(0, 50)}` })
    unreachable++
  }
}

console.log('\nCC-CMD follow-up — the observable consequence of each ask\n')

for (const a of LANDED) {
  const state = regressed.includes(a) ? 'REGRESSED' : landedUnverified ? 'unverified' : 'holds'
  console.log(`  ${state.padEnd(10)} ${a.cmd}`)
  console.log(`             landed ${a.landedOn}, ${a.landedIn}`)
  console.log(`             ${a.note}`)
  console.log('')
}

for (const r of rows) {
  console.log(`  ${r.state.padEnd(10)} ${r.cmd}`)
  console.log(`             ask:   ${r.ask}`)
  console.log(`             probe: ${r.route}`)
  console.log(`             ${r.note}`)
  console.log('')
}

const landed = rows.filter(r => r.state === 'LANDED')
const stopped = rows.filter(r => r.state === 'stopped')
const stillGen = rows.filter(r => r.state === 'still gen')
const noRows = rows.filter(r => r.state === 'no rows')
const pending = rows.filter(r => r.state === 'not yet')

console.log(`  ${landed.length} landed, ${stopped.length} stopped, ` +
  `${pending.length + stillGen.length} pending, ${noRows.length} not observable this run, ` +
  `${unreachable} unverifiable\n`)

if (landed.length) {
  console.log('::notice::A filed CC-CMD has landed — the laboratory-side work it unblocks is now available.')
  for (const r of landed) console.log(`::notice::LANDED ${r.cmd}: ${r.ask}`)
  console.log('::notice::Move it to LANDED in this file so it stops being reported as news.')
}

// A cessation ask that now reads clean is reported, but NOT with the "promote to
// the fatal LANDED list" instruction. A field that appeared can be relied on and
// its disappearance is a regression; a defect that stopped appearing on one
// slate is not a fact to build on, and making its return a red build here would
// be turning the relay's backlog into laboratory pressure — the thing this file
// opens by refusing to do. So it stays in the open ASKS list, monitored, either way.
if (stopped.length) {
  for (const r of stopped) {
    console.log(`::notice::CLEAN THIS RUN ${r.cmd}: the returned soccer briefs carried none of the flagged defects.`)
  }
  console.log('::notice::A cessation ask stays in the open ASKS list — one clean slate is not a landed fact. Do NOT promote it to the fatal LANDED list.')
}

// Fatal, and reported before the unreachable case, because a regression is a
// finding and "no probe ran" is only an absence of one.
if (regressed.length) {
  for (const a of regressed) {
    console.log(`::error::REGRESSED ${a.cmd} — landed ${a.landedOn}, no longer holds on ${a.route}`)
    console.log(`          ${a.note}`)
  }
  console.log('\n=== RESULT: FAIL — a landed ask stopped holding ===')
  process.exit(1)
}

// Unverifiable is the only failure. "Not landed" is someone else's backlog;
// "could not tell" is a broken probe, and a probe nobody notices is broken is
// how a follow-up quietly stops following up.
if (unreachable === rows.length) {
  if (TOLERATE) {
    console.log('::warning::every probe was unreachable; follow-up not verified this run')
    process.exit(0)
  }
  console.log('=== RESULT: FAIL — no ask could be checked at all ===')
  process.exit(1)
}

process.exit(0)
