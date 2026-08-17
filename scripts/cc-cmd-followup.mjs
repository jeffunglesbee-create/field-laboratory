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

/** Each open ask, and the observable fact that would show it landed. */
const ASKS = [
  {
    cmd: 'CC-CMD-2026-08-15-quality-bar-scale',
    ask: 'name the scale wherever the flat 240 bar is reported',
    route: '/quality/report',
    landed: j => {
      const s = JSON.stringify(j)
      return /reachable_ceiling|of_300|_of_245/.test(s)
    },
    note: 'looking for a denominator on below_240 / above_240 / below_flat_240_pct',
  },
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

let unreachable = 0
const rows = []

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

console.log('\nCC-CMD follow-up — the observable consequence of each open ask\n')
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
