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

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const TOLERATE = process.argv.includes('--tolerate-unreachable')
const SELF_TEST = process.argv.includes('--self-test')

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

for (const a of ASKS) {
  try {
    const r = await fetch(`${RELAY}${a.route}`, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) { rows.push({ ...a, state: `HTTP ${r.status}` }); unreachable++; continue }
    const j = await r.json()
    rows.push({ ...a, state: a.landed(j) ? 'LANDED' : 'not yet' })
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
const pending = rows.filter(r => r.state === 'not yet')

console.log(`  ${landed.length} landed, ${pending.length} pending, ${unreachable} unverifiable\n`)

if (landed.length) {
  console.log('::notice::A filed CC-CMD has landed — the laboratory-side work it unblocks is now available.')
  for (const r of landed) console.log(`::notice::LANDED ${r.cmd}: ${r.ask}`)
  console.log('::notice::Move it to LANDED in this file so it stops being reported as news.')
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
