// The 51 MLS pairs say `indistinguishable`. Is that the data, or the instrument?
//
// `classifyPair` answers `duplicate` only on evidence — two rows sharing an
// espn_event_id, or two rows sharing a start_time — and the 51 MLS clusters
// carry neither. That is the honest verdict from the four fields
// `probe-fixture-identity-duplicates.mjs` reads. It is NOT a statement that no
// discriminator exists; it is a statement that none of those four is one.
//
// So this asks two further questions, cheapest first:
//
//   1. DOES ANY OTHER COLUMN SEPARATE THE TWO ROWS? The identity probe reads
//      home, away, espn_event_id, start_time. The table has more. A pair whose
//      venues differ, or whose scores differ, is two games; a pair agreeing on
//      every populated field is one row written twice.
//
//   2. WHAT DOES THE SOURCE SAY? Two MLS clubs playing each other twice on one
//      date is not a thing the league schedules, but asserting that from
//      knowledge is exactly the move this project keeps deleting. The relay
//      serves the slate. Ask it how many fixtures it lists between those clubs
//      on that date, and let the answer be the discriminator.
//
// MERGING IS NOT IN SCOPE HERE AND MUST NOT BE. This probe writes nothing to D1.
// A merge deletes a row, and `Do not delete archive rows without explicit human
// approval` is standing. What it produces is the evidence a merge would need.
//
// Usage:  node scripts/probe-mls-pair-discriminators.mjs --recon   shapes first
//         node scripts/probe-mls-pair-discriminators.mjs
//         node scripts/probe-mls-pair-discriminators.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { schemeOf } from './game-id-scheme.mjs'
import { clustersByDay, mixedScheme } from './probe-archive-scheme-duplicates.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || ''
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * How two rows compare on one column.
 *
 * FOUR STATES, and the two middle ones are the reason this is a function rather
 * than `a === b`. `both-null` and `one-null` are not agreement: a column absent
 * from both rows discriminates nothing, and a column present on one side only is
 * the stub pattern this whole defect is made of. Only `differ` is evidence of
 * two games, and only `agree` is evidence of one row twice.
 */
export const compareField = (a, b) => {
  const na = a === null || a === undefined || a === ''
  const nb = b === null || b === undefined || b === ''
  if (na && nb) return 'both-null'
  if (na || nb) return 'one-null'
  return String(a) === String(b) ? 'agree' : 'differ'
}

/**
 * What a pair's field comparison proves, if anything.
 *
 * `two-games` needs a column that DIFFERS on a field two rows of one fixture
 * could not disagree about. `one-row-twice` needs agreement on something
 * substantive — a shared score, a shared venue — not merely on the date and the
 * sport, which every row in the cluster shares by construction.
 */
export const fieldVerdict = (comparisons, substantive) => {
  const differing = substantive.filter(f => comparisons[f] === 'differ')
  if (differing.length) return { verdict: 'two-games', because: differing }
  const agreeing = substantive.filter(f => comparisons[f] === 'agree')
  if (agreeing.length) return { verdict: 'one-row-twice', because: agreeing }
  return { verdict: 'no-discriminator', because: [] }
}

/**
 * The slate's answer: how many fixtures between these two clubs on this date?
 *
 * Returns a state, never a guess. `not-observable` when the slate could not be
 * read at all — which must never be reported as "no duplicate found", the
 * failure this repo keeps deleting.
 */
export const slateVerdict = (matches) => {
  if (matches === null || matches === undefined) return 'not-observable'
  if (matches === 0) return 'absent-from-slate'
  if (matches === 1) return 'one-fixture'
  return 'doubleheader'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('two values that differ are evidence', compareField('a', 'b') === 'differ')
  check('two equal values agree', compareField('7', 7) === 'agree', 'compared as strings')
  check('BOTH NULL IS NOT AGREEMENT', compareField(null, null) === 'both-null',
    'a column absent from both rows discriminates nothing, and counting it as '
    + 'agreement would let 20 empty columns "prove" a duplicate')
  check('ONE NULL IS NOT AGREEMENT EITHER', compareField('x', null) === 'one-null',
    'a value on one side only is the stub pattern this defect is made of')
  check('empty string counts as null', compareField('', '') === 'both-null')

  check('a differing substantive field means two games',
    fieldVerdict({ venue: 'differ', home_score: 'both-null' }, ['venue', 'home_score']).verdict === 'two-games')
  check('agreement on a substantive field means one row twice',
    fieldVerdict({ venue: 'agree' }, ['venue']).verdict === 'one-row-twice')
  check('NULLS EVERYWHERE PROVE NOTHING',
    fieldVerdict({ venue: 'both-null', home_score: 'one-null' }, ['venue', 'home_score']).verdict === 'no-discriminator',
    'this is the state the 51 are in until something else answers')
  check('one differing field outranks several agreeing ones',
    fieldVerdict({ venue: 'differ', note: 'agree' }, ['venue', 'note']).verdict === 'two-games',
    'two rows of ONE fixture cannot disagree about the venue')

  check('one listed fixture means the pair is one game', slateVerdict(1) === 'one-fixture')
  check('two listed fixtures is a real doubleheader', slateVerdict(2) === 'doubleheader')
  check('THE SLATE FAILING TO LOAD IS ITS OWN STATE', slateVerdict(null) === 'not-observable',
    'reporting an unread slate as "no duplicate" is the silence this repo deletes')
  check('a fixture the slate does not list is not "one fixture"',
    slateVerdict(0) === 'absent-from-slate',
    'zero means the slate cannot answer for this pair, not that the pair is fine')

  process.exit(summarize() === 0 ? 0 : 1)
}

// ─── the sweep ────────────────────────────────────────────────────────────────
if (isMain(import.meta.url)) {
  const d1 = async (sql) => {
    if (!RELAY_SECRET) throw new Error(
      'RELAY_SHARED_SECRET is not set. This probe reads the relay\'s games tables through '
      + 'POST /d1/execute. Pass it from the workflow.')
    const r = await fetch(`${RELAY}/d1/execute`, {
      method: 'POST',
      headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ sql }),
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
    const j = JSON.parse(t)
    if (j.ok === false) throw new Error(`relay error: ${j.error}`)
    return j.results || []
  }

  // ── RECON: read the shapes before writing anything against them ────────────
  if (process.argv.includes('--recon')) {
    console.log('=== columns regular_season_games actually has ===')
    const cols = await d1(`PRAGMA table_info(regular_season_games)`)
    console.log(cols.map(c => `${c.name}:${c.type}`).join('  '))

    console.log('\n=== one MLS pair, every column ===')
    const rows = await d1(
      `SELECT * FROM regular_season_games WHERE sport = 'MLS' AND date = '2026-08-29' ORDER BY id`)
    for (const r of rows.slice(0, 4)) console.log(JSON.stringify(r))

    console.log('\n=== does the relay serve an MLS slate, and in what shape? ===')
    for (const d of ['2026-08-29', '20260829']) {
      try {
        const r = await fetch(`${RELAY}/v2/games?sport=mls&date=${d}`, { headers: { 'User-Agent': UA } })
        const t = (await r.text()).slice(0, 400)
        console.log(`  date=${d} -> HTTP ${r.status}  ${t}`)
      } catch (e) { console.log(`  date=${d} -> ${e.message}`) }
    }
    console.log('\n=== and what /context/date serves for that day ===')
    try {
      const r = await fetch(`${RELAY}/context/date?date=2026-08-29`, { headers: { 'User-Agent': UA } })
      const j = await r.json()
      console.log(`  HTTP ${r.status}  top-level keys: ${Object.keys(j).join(', ')}`)
    } catch (e) { console.log(`  ${e.message}`) }
    process.exit(0)
  }

  console.log('the full sweep is written after --recon reports the shapes.')
  process.exit(0)
}
