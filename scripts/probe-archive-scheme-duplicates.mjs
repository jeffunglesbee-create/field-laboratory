// The dual-writer duplicate, measured over the WHOLE archive rather than a window.
//
// WHY THIS EXISTS. `CC-CMD-2026-09-01-mls-dual-writer-duplicate` reports "51 MLS
// fixtures each served as two rows" and "every one MLS", from a 30-day sweep of
// public `/context/date` — 1064 rows. On 2026-09-03 the relay's provenance census
// read the tables themselves: **2750 rows, 591 of them dash-scheme, and the
// examples include EPL** (`2026-05-09-epl-bright-wolver`).
//
// Those two numbers do not contradict each other; they have different scopes. But
// the CC-CMD's scoping decisions rest on the smaller one, and "every one MLS" is a
// claim about a 30-day window being read as a claim about the archive. This probe
// answers the archive-wide version, and it is deliberately built to be able to
// come back saying the CC-CMD was right.
//
// NOTHING HERE IS A SECOND COPY OF THE CLASSIFICATION. `schemeOf`, `sameFixture`,
// `classifyPair` and `groupsFor` are imported from the modules that already own
// them. A copy would drift, and the drift would be invisible: this probe and the
// CC-CMD would disagree without either being obviously wrong.
//
// THE ONE THING IT MUST NOT DO is call a doubleheader a duplicate. `classifyPair`
// already refuses to: a pair with no discriminator — no two event ids, no two
// start times — is `indistinguishable`, which is neither answer. Read the
// indistinguishable count as a question, not a bug count.
//
// Usage:  node scripts/probe-archive-scheme-duplicates.mjs
//         node scripts/probe-archive-scheme-duplicates.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { schemeOf } from './game-id-scheme.mjs'
import { classifyPair, groupsFor } from './probe-fixture-identity-duplicates.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const RELAY_SECRET = process.env.RELAY_SHARED_SECRET || ''
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * The signature of the dual writer: one fixture, two rows, written under two
 * DIFFERENT id schemes.
 *
 * Two rows of the SAME scheme are a different defect — one writer running twice
 * — and lumping them together would let a fix for either look like a fix for
 * both. That distinction is the whole point of this function, so it is exported
 * and asserted rather than inlined.
 */
export const mixedScheme = (rows) => new Set((rows ?? []).map(r => schemeOf(r.id))).size > 1

/** Every scheme present in a cluster, sorted, as a stable label. */
export const schemesOf = (rows) => [...new Set((rows ?? []).map(r => schemeOf(r.id)))].sort().join(' + ')

/**
 * Clusters, computed per (sport, date).
 *
 * SCOPED, and not only for speed. `sameFixture` matches on token subsets, and
 * over 2750 rows spanning every league a global sweep would pair teams that
 * merely share a word. Two rows are only candidates for the same fixture if they
 * are the same sport on the same day, which is also the only way the defect can
 * actually occur.
 */
export const clustersByDay = (rows) => {
  const byDay = new Map()
  for (const r of rows ?? []) {
    const k = `${r.sport ?? '?'}|${r.date ?? '?'}`
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k).push(r)
  }
  const out = []
  for (const [k, group] of byDay) {
    const [sport, date] = k.split('|')
    for (const g of groupsFor(group)) out.push({ ...g, sport, date })
  }
  return out
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const row = (id, o = {}) => ({ id, sport: 'MLS', date: '2026-08-30', ...o })

  check('two schemes on one fixture is the dual-writer signature',
    mixedScheme([row('MLS_2026-08-30_stlouis_dallas'), row('2026-08-30-mls-stl-dal')]),
    'provider-composite + unrecognised — the exact pair the CC-CMD reports')
  check('ONE scheme twice is NOT — it is a different defect',
    !mixedScheme([row('MLS_2026-08-30_stlouis_dallas'), row('MLS_2026-08-30_stl_dal')]),
    'one writer running twice; a fix for that is not a fix for the dual writer, '
    + 'and counting them together would let either look like both')
  check('a single row is not mixed', !mixedScheme([row('MLS_a')]))
  check('an empty cluster is not mixed', !mixedScheme([]) && !mixedScheme(null))

  check('the label names both schemes, in a stable order',
    schemesOf([row('2026-08-30-mls-stl-dal'), row('MLS_2026-08-30_stlouis_dallas')])
      === 'provider-composite + unrecognised')

  // THE IMPORT IS THE POINT. If game-id-scheme.mjs ever stopped calling the dash
  // shape `unrecognised`, this probe would silently measure something else.
  check('the dash shape still classifies as unrecognised at HEAD',
    schemeOf('2026-08-30-mls-stl-dal') === 'unrecognised',
    'imported, not copied — if this fails, the registry moved and this probe '
    + 'is measuring a different question than the CC-CMD asked')
  check('...and ours still classifies as provider-composite',
    schemeOf('MLS_2026-08-30_stlouis_dallas') === 'provider-composite')
  check('an EPL dash id classifies the same way',
    schemeOf('2026-05-09-epl-bright-wolver') === 'unrecognised',
    'the census example that took this past MLS')

  // Clustering is scoped, and a cross-day pair must NOT cluster.
  const crossDay = clustersByDay([
    row('MLS_2026-08-30_stlouis_dallas', { home: 'St. Louis CITY SC', away: 'FC Dallas' }),
    row('2026-08-31-mls-stl-dal', { date: '2026-08-31', home: 'St. Louis', away: 'Dallas' }),
  ])
  check('THE SAME TEAMS ON TWO DATES ARE TWO FIXTURES, NOT A DUPLICATE',
    crossDay.length === 0,
    'a probe that clustered across dates would report every recurring matchup as a bug')

  const crossSport = clustersByDay([
    row('MLS_2026-08-30_a_b', { home: 'Athletic', away: 'Boca' }),
    row('2026-08-30-epl-a-b', { sport: 'EPL', home: 'Athletic', away: 'Boca' }),
  ])
  check('the same names in two sports are two fixtures', crossSport.length === 0)

  const sameDay = clustersByDay([
    row('MLS_2026-08-30_stlouis_dallas', { home: 'St. Louis CITY SC', away: 'FC Dallas' }),
    row('2026-08-30-mls-stl-dal', { home: 'St. Louis', away: 'Dallas' }),
  ])
  check('one sport, one date, one fixture, two schemes — clustered and flagged',
    sameDay.length === 1 && mixedScheme(sameDay[0].rows) && sameDay[0].kind === 'indistinguishable',
    JSON.stringify(sameDay.map(c => ({ kind: c.kind, n: c.rows.length }))))
  check('...and INDISTINGUISHABLE is the honest verdict there, not `duplicate`',
    sameDay[0]?.kind === 'indistinguishable',
    'neither row carries an event id or a start time; calling it a duplicate '
    + 'invents a bug and calling it distinct invents a doubleheader')

  // summarize() returns the FAILED COUNT, not a boolean — the two sibling probes
  // both write it this way, and writing it the other way passed 12/12 and exited 1.
  process.exit(summarize() === 0 ? 0 : 1)
}

// ─── the sweep ────────────────────────────────────────────────────────────────
//
// GUARDED BY isMain, and the guard is load-bearing: `check:import-purity` in the
// pre-commit hook imports every exporting module in scripts/ and fails any whose
// import runs code or exits the process. The first version of this file ran the
// sweep at module scope, so importing it called process.exit(1) and everything
// after the import never ran.
if (isMain(import.meta.url)) {
  const SQL = `SELECT id, sport, league, date, home, away, espn_event_id, start_time
               FROM regular_season_games
               UNION ALL
               SELECT id, sport, league, date, home, away, espn_event_id, start_time
               FROM postseason_games`

  const out = {
    probed_at: new Date().toISOString(),
    rows_seen: 0, by_scheme: {}, unrecognised_by_sport: {},
    clusters: 0, mixed_scheme_clusters: 0, mixed_by_sport: {}, kind_of_mixed: {},
    examples: [], error: null,
  }

  let fatal = 0
  const say = (ok, name, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) { fatal++; if (detail) console.log(`      ${detail}`) }
  }

  try {
    if (!RELAY_SECRET) throw new Error(
      'RELAY_SHARED_SECRET is not set. This probe reads the relay\'s games tables through '
      + 'POST /d1/execute, which is credentialled. Pass it from the workflow. Until then the '
      + 'duplicate surface is unobserved, which is a failure and not a skip.')

    const r = await fetch(`${RELAY}/d1/execute`, {
      method: 'POST',
      headers: { 'X-FIELD-Relay': RELAY_SECRET, 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ sql: SQL }),
    })
    const t = await r.text()
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
    const j = JSON.parse(t)
    if (j.ok === false) throw new Error(`relay error: ${j.error}`)
    const rows = j.results || []
    out.rows_seen = rows.length

    for (const row of rows) {
      const s = schemeOf(row.id)
      out.by_scheme[s] = (out.by_scheme[s] ?? 0) + 1
      if (s === 'unrecognised')
        out.unrecognised_by_sport[row.sport ?? '?'] = (out.unrecognised_by_sport[row.sport ?? '?'] ?? 0) + 1
    }

    const clusters = clustersByDay(rows)
    out.clusters = clusters.length
    const mixed = clusters.filter(c => mixedScheme(c.rows))
    out.mixed_scheme_clusters = mixed.length
    for (const c of mixed) {
      out.mixed_by_sport[c.sport] = (out.mixed_by_sport[c.sport] ?? 0) + 1
      out.kind_of_mixed[c.kind] = (out.kind_of_mixed[c.kind] ?? 0) + 1
    }
    out.examples = mixed.slice(0, 8).map(c => ({
      sport: c.sport, date: c.date, kind: c.kind, schemes: schemesOf(c.rows),
      ids: c.rows.map(x => x.id),
    }))

    console.log(`\n${out.rows_seen} row(s) across both game tables\n`)
    console.log('  by id scheme:')
    for (const [s, n] of Object.entries(out.by_scheme).sort((a, b) => b[1] - a[1]))
      console.log(`    ${String(n).padStart(5)}  ${s}`)

    console.log('\n  `unrecognised` rows by sport — the dual writer\'s output:')
    for (const [s, n] of Object.entries(out.unrecognised_by_sport).sort((a, b) => b[1] - a[1]))
      console.log(`    ${String(n).padStart(5)}  ${s}`)

    console.log(`\n  same-fixture clusters (per sport+date): ${out.clusters}`)
    console.log(`  of those, MIXED SCHEME — the dual-writer signature: ${out.mixed_scheme_clusters}`)
    console.log('\n  mixed-scheme clusters by sport:')
    for (const [s, n] of Object.entries(out.mixed_by_sport).sort((a, b) => b[1] - a[1]))
      console.log(`    ${String(n).padStart(5)}  ${s}`)
    console.log('\n  and by what can be concluded about each:')
    for (const [k, n] of Object.entries(out.kind_of_mixed).sort((a, b) => b[1] - a[1]))
      console.log(`    ${String(n).padStart(5)}  ${k}`)
    console.log('    (`indistinguishable` is a question, not a bug count: neither row carries')
    console.log('     an event id or a start time, so a duplicate and a doubleheader look alike)')

    if (out.examples.length) {
      console.log('\n  examples:')
      for (const e of out.examples)
        console.log(`    ${e.sport} ${e.date} ${e.kind.padEnd(18)} ${e.schemes}\n        ${e.ids.join('\n        ')}`)
    }

    // ── the assertions ───────────────────────────────────────────────────────
    say(out.rows_seen > 0, 'the probe read rows at all', 'nothing was measured')
    say((out.by_scheme.unrecognised ?? 0) > 0,
      'the `unrecognised` scheme is still present',
      'zero would mean the dual writer stopped or the rows were cleaned — either is news, '
      + 'and neither should be reported by this probe staying silent')

    const sports = Object.keys(out.mixed_by_sport)
    const nonMls = sports.filter(s => s !== 'MLS')
    console.log('')
    if (out.mixed_scheme_clusters === 0) {
      console.log('NOT OBSERVED  no mixed-scheme cluster anywhere in the archive. The CC-CMD\'s 51')
      console.log('              came from a 30-day /context/date window; this reads the tables. If')
      console.log('              both are right, the pairs left the window without leaving the table.')
    } else if (nonMls.length === 0) {
      console.log(`CONFIRMED     the CC-CMD's "every one MLS" holds archive-wide: ${out.mixed_scheme_clusters}`)
      console.log('              mixed-scheme cluster(s), all MLS.')
    } else {
      console.log(`WIDER THAN FILED  the CC-CMD says "every one MLS". Archive-wide there are`)
      console.log(`                  ${out.mixed_scheme_clusters} mixed-scheme cluster(s) across ${sports.length} sport(s):`)
      console.log(`                  ${sports.join(', ')}. The non-MLS ones are ${nonMls.join(', ')}.`)
      console.log('                  A fix scoped to MLS would leave those in place.')
    }
  } catch (e) {
    out.error = String(e.message || e)
    console.log(`\nFAIL  the sweep did not run: ${out.error}`)
    fatal++
  }

  mkdirSync('outbox', { recursive: true })
  writeFileSync('outbox/archive-scheme-duplicates-latest.json', JSON.stringify(out, null, 2))
  console.log('\nwrote outbox/archive-scheme-duplicates-latest.json')
  process.exit(fatal ? 1 : 0)
}
