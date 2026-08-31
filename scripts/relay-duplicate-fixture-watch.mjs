// File a self-closing bug ticket ON field-relay-nba when /context/date serves the
// SAME fixture twice — automated, cross-repo, no PR.
//
// THE FINDING
//
// On 2026-08-30 the live payload carried two rows for one fixture, three times:
//
//   espn:401857186  Lynx @ Dream              |  Minnesota Lynx @ Atlanta Dream
//   espn:401857187  Sparks @ Storm            |  Los Angeles Sparks @ Seattle Storm
//   MLS             Dallas @ St. Louis (final)|  a "Scheduled — no start time" stub
//
// Each pair shares one `espn_event_id`. The relay HAS a unique fixture key on
// both rows and wrote two anyway, because the archive id is composed
// SPORT_DATE_HOME_AWAY and the team-name form differs between write paths. The
// relay's own source says this out loud one field over (src/index.js ~7736):
//
//     the archive-write sites send `sport: gm.league`, so this label both lands
//     in the archive `sport` column and forms the archive id prefix. A drifting
//     label splits one competition across two id namespaces.
//
// A drifting TEAM NAME splits one fixture the same way.
//
// IT IS NEW, WHICH IS WHY IT IS WORTH A TICKET
//
// Every committed capture in this repo was scanned: 4 days, 88 game rows across
// 2026-05-15, 2026-08-09, 2026-08-29 and the briefs fixture. ZERO duplicated
// event ids. This repo's own drift log dates the change:
//
//     2026-08-29 16:35 | 78 games | WNBA:2     <- 2 fixtures, 2 rows
//     2026-08-30 16:30 | 43 games | WNBA:4     <- 2 fixtures, 4 rows
//
// WHY A TICKET AND NOT A FIX
//
// The fix is in the relay's archive-WRITE path, and field-relay-nba's own Rule 39
// requires mapping every dependency and auditing every consumer of a table before
// touching it. A blind de-dup committed to their main from here is exactly what
// their confidence bar forbids. This writes the one thing it can author
// correctly: an evidence-carrying, self-closing bug report.
//
// `decideIssueAction` is IMPORTED from relay-brief-watch.mjs rather than
// reimplemented — one rule, one implementation, which is the same reason the
// relay keeps `drawPriceFrom` in src/odds-shape.js instead of copying it.
//
// CONFIG (env)
//   GH_TOKEN  issues:write on TARGET. Absent → SKIP (warn, exit 0), so this is
//             safe to wire in before the secret exists.
//   TARGET    owner/repo. Default: the relay.
//   RELAY     relay base URL.  RUN_URL  link back to the runner.
//
// MODES: (default) scan live and act | --dry-run | --self-test

import { decideIssueAction } from './relay-brief-watch.mjs'
import { createChecks, isMain } from './checks.mjs'

const TARGET = process.env.TARGET || 'jeffunglesbee-create/field-relay-nba'
const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const MARKER = '<!-- relay-duplicate-fixture -->'
const TITLE = '/context/date serves the same fixture twice'

/**
 * Fixtures appearing more than once under one `espn_event_id`.
 *
 * KEYED ON THE EVENT ID, NEVER ON NAMES. Names are the thing that drifted — a
 * name-based key gave `Dallas @ St. Louis` and `FC Dallas @ St. Louis CITY SC`
 * two different keys and reported no duplicate at all. The event id is the
 * relay's own unique fixture identifier and needs no convention to agree with
 * itself.
 *
 * A row with NO event id is skipped rather than grouped: several rows sharing
 * "no id" are not thereby the same fixture, and grouping them would manufacture
 * duplicates out of missing data.
 */
export const scanDuplicates = (games) => {
  const by = new Map()
  for (const g of games ?? []) {
    const k = g?.espn_event_id
    if (k === null || k === undefined || k === '') continue
    const key = String(k)
    if (!by.has(key)) by.set(key, [])
    by.get(key).push(g)
  }
  return [...by.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([id, rows]) => ({
      id,
      rows: rows.map(r => ({
        archiveId: r.id ?? null,
        label: `${r.away} @ ${r.home}`,
        final: r.finalized_at != null,
      })),
    }))
}

export const issueBody = (dupes, date, runUrl) => [
  MARKER,
  '',
  `On **${date}**, \`GET /context/date/${date}\` returned ${dupes.length} fixture(s) as two rows each.`,
  '',
  'Each pair shares one `espn_event_id`, so the relay already holds a unique key',
  'for the fixture and wrote two rows anyway. The archive id is composed',
  '`SPORT_DATE_HOME_AWAY`, and the team-name form differs between write paths —',
  'the same split this repo already documents for a drifting sport label',
  '(`src/index.js`, "A drifting label splits one competition across two id namespaces").',
  '',
  ...dupes.flatMap(d => [
    `- **espn:${d.id}**`,
    ...d.rows.map(r => `  - \`${r.archiveId}\` — ${r.label}${r.final ? ' (final)' : ' (not final)'}`),
  ]),
  '',
  '**Why it matters downstream.** field-laboratory renders one card per row, so a',
  'duplicated fixture appears twice on the desk — and where the two rows disagree',
  'about state (one final, one an unplayed stub), one card carries the recap and',
  'the other carries nothing.',
  '',
  '**Not seen before 2026-08-30.** Four committed captures in field-laboratory',
  '(2026-05-15, 2026-08-09, 2026-08-29, plus the briefs fixture) hold 88 game rows',
  'with zero duplicated event ids, and its drift log records WNBA going from 2 rows',
  'on 2026-08-29 to 4 on 2026-08-30 for the same two fixtures.',
  '',
  'Closes itself on the first run where the payload carries no duplicated event id.',
  '',
  runUrl ? `_Filed by field-laboratory's relay-duplicate-fixture-watch. Run: ${runUrl}_` : '',
].join('\n')

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const row = (id, espn, away, home, final) =>
    ({ id, espn_event_id: espn, away, home, finalized_at: final ? '2026-08-30 20:00:00' : null })

  const wnba = [row('WNBA_a', 401857186, 'Lynx', 'Dream', true),
                row('WNBA_b', 401857186, 'Minnesota Lynx', 'Atlanta Dream', true)]
  check('two rows under one event id is a duplicate',
    scanDuplicates(wnba).length === 1)
  check('THE NAMES DIFFER AND IT IS STILL ONE FIXTURE',
    scanDuplicates(wnba)[0].rows.map(r => r.label).join(' | ')
      === 'Lynx @ Dream | Minnesota Lynx @ Atlanta Dream',
    'a name-based key gave these two keys and found no duplicate at all')
  check('a final row and a stub under one id is still one duplicate',
    scanDuplicates([row('MLS_x', 761769, 'Dallas', 'St. Louis', true),
                    row('MLS_y', 761769, 'FC Dallas', 'St. Louis CITY SC', false)])[0]
      .rows.filter(r => r.final).length === 1)
  check('distinct fixtures are not duplicates',
    scanDuplicates([row('a', 1, 'A', 'B', true), row('b', 2, 'C', 'D', true)]).length === 0)
  check('ROWS WITH NO EVENT ID ARE SKIPPED, NOT GROUPED',
    scanDuplicates([row('a', null, 'A', 'B', true), row('b', null, 'C', 'D', true)]).length === 0,
    'grouping them would manufacture duplicates out of missing data')
  check('an empty slate yields nothing', scanDuplicates([]).length === 0 && scanDuplicates(null).length === 0)
  check('the body carries the marker the lookup matches on',
    issueBody(scanDuplicates(wnba), '2026-08-30', 'https://x/1').includes(MARKER))
  check('the body names both archive ids, which is the actionable part',
    issueBody(scanDuplicates(wnba), '2026-08-30', '').includes('WNBA_a') &&
    issueBody(scanDuplicates(wnba), '2026-08-30', '').includes('WNBA_b'))
  check('decideIssueAction is the imported one, not a second copy',
    decideIssueAction({ rowsPresent: true, offenders: [1], openIssueNumber: null }) === 'create' &&
    decideIssueAction({ rowsPresent: true, offenders: [], openIssueNumber: 5 }) === 'close' &&
    decideIssueAction({ rowsPresent: false, offenders: [], openIssueNumber: 5 }) === 'skip')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const token = process.env.GH_TOKEN
  const runUrl = process.env.RUN_URL || ''
  const dry = process.argv.includes('--dry-run')
  if (!token && !dry) {
    console.log('GH_TOKEN not set — cross-repo reporter not configured; skipping.')
    process.exit(0)
  }

  const date = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    .toISOString().slice(0, 10)
  const res = await fetch(`${RELAY}/context/date/${date}`, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) { console.log(`relay HTTP ${res.status} — nothing observed, skipping.`); process.exit(0) }
  const payload = await res.json()
  const games = [...(payload.games?.regular ?? []), ...(payload.games?.postseason ?? [])]
  const dupes = scanDuplicates(games)

  console.log(`\n  ${date}: ${games.length} game row(s), ${dupes.length} duplicated fixture(s)`)
  for (const d of dupes) {
    console.log(`    espn:${d.id}`)
    for (const r of d.rows) console.log(`      ${r.archiveId}  ${r.label}${r.final ? '  (final)' : ''}`)
  }

  // rowsPresent guards the close path: an empty slate must never close a real
  // ticket, the same three-state discipline the rest of this repo now uses.
  const api = async (path, init = {}) => {
    const r = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
                 'content-type': 'application/json', ...(init.headers || {}) },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status} ${init.method || 'GET'} ${path}`)
    return r.json()
  }

  let open = null
  if (!dry) {
    for (let page = 1; page <= 10 && !open; page++) {
      const batch = await api(`/repos/${TARGET}/issues?state=open&per_page=100&page=${page}`)
      open = (batch ?? []).find(i => !i.pull_request && (i.body ?? '').includes(MARKER)) ?? null
      if (!Array.isArray(batch) || batch.length < 100) break
    }
  }

  const action = decideIssueAction({ rowsPresent: games.length > 0, offenders: dupes,
                                     openIssueNumber: open?.number ?? null })
  console.log(`\n  action: ${action}${open ? ` (open #${open.number})` : ''}\n`)
  if (dry) process.exit(0)

  const body = issueBody(dupes, date, runUrl)
  if (action === 'create') {
    const made = await api(`/repos/${TARGET}/issues`, { method: 'POST',
      body: JSON.stringify({ title: TITLE, body }) })
    console.log(`  opened ${TARGET}#${made.number}`)
  } else if (action === 'update') {
    await api(`/repos/${TARGET}/issues/${open.number}/comments`, { method: 'POST',
      body: JSON.stringify({ body }) })
    console.log(`  updated ${TARGET}#${open.number}`)
  } else if (action === 'close') {
    await api(`/repos/${TARGET}/issues/${open.number}/comments`, { method: 'POST',
      body: JSON.stringify({ body: `No duplicated \`espn_event_id\` in \`/context/date/${date}\` (${games.length} row(s)). Closing; reopened automatically if it returns.` }) })
    await api(`/repos/${TARGET}/issues/${open.number}`, { method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) })
    console.log(`  closed ${TARGET}#${open.number}`)
  } else {
    console.log('  nothing to do')
  }
}
