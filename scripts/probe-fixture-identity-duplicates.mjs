// Duplicates the existing watcher CANNOT SEE.
//
// THE BLIND SPOT, WHICH THE FIX AND THE INSTRUMENT SHARE
//
// `relay-duplicate-fixture-watch.mjs` is what closes field-relay-nba#1, and its
// grouping begins:
//
//     const k = g?.espn_event_id
//     if (k === null || k === undefined || k === '') continue
//
// A row with no event id is skipped. The numeric-id upsert key shipped for that
// issue (relay d253209) is numeric-only. BOTH SKIP THE SAME 197 ROWS — 18.2% of
// a 30-day window, 177 of them MLS.
//
// So after that deploy the watcher sweeps, finds no duplicated event id, and
// closes the issue, while every duplicate among those 197 stays invisible to the
// thing that just declared victory. The fix succeeding and the instrument being
// blind produce the same output.
//
// The class is not hypothetical: CC-CMD-2026-08-08 measured 55 duplicate groups,
// 110 rows, all MLS — found by querying D1 directly, which is the one method the
// watcher does not use.
//
// So this groups by FIXTURE IDENTITY (date + team names, under the same subset
// matching that knows `Dream` and `Atlanta Dream` are one club) rather than by
// event id. It sees every row.
//
// AND IT MUST NOT REPORT DOUBLEHEADERS AS BUGS. Two real games between the same
// teams on one date are not a duplicate. Two discriminators exist —
// `start_time`, and two differing non-null event ids — and on the rows that
// matter most, BOTH ARE ABSENT: `start_time` is null on exactly the 15 rows that
// carry no event id in the committed capture. A pair with no discriminator is
// neither a duplicate nor two games; it is INDISTINGUISHABLE, and calling it
// either would be inventing the answer this probe exists to find.
//
// Usage:  node scripts/probe-fixture-identity-duplicates.mjs [--days 30]
//         node scripts/probe-fixture-identity-duplicates.mjs --self-test

import { writeFileSync, mkdirSync } from 'node:fs'
import { sameFixture, isEspnId } from './probe-espn-id-collisions.mjs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY || 'https://field-relay-nba.jeffunglesbee.workers.dev'

const eid = g => (g?.espn_event_id == null || g.espn_event_id === '') ? null : String(g.espn_event_id)

/**
 * Two rows that are the same fixture: one row written twice, two real games, or
 * not answerable from what is served.
 */
export const classifyPair = (a, b) => {
  const ea = eid(a), eb = eid(b)
  if (ea && eb && ea !== eb) return 'distinct'          // two event ids, two games
  if (ea && eb && ea === eb) return 'duplicate'         // the known bug
  if (a?.start_time && b?.start_time)
    return a.start_time === b.start_time ? 'duplicate' : 'distinct'
  // No event id on at least one side and no pair of start times. A doubleheader
  // and a duplicated row look identical from here.
  return 'indistinguishable'
}

/** Clusters of same-fixture rows on one date, with the watcher's reach noted. */
export const groupsFor = (games) => {
  const rows = games ?? []
  const used = new Set()
  const out = []
  for (let i = 0; i < rows.length; i++) {
    if (used.has(i)) continue
    const cluster = [rows[i]]
    for (let j = i + 1; j < rows.length; j++) {
      if (used.has(j)) continue
      if (sameFixture(rows[i], rows[j])) { cluster.push(rows[j]); used.add(j) }
    }
    if (cluster.length < 2) continue
    used.add(i)
    // The watcher groups on espn_event_id and skips rows without one, so it can
    // only ever see a cluster where EVERY row carries one.
    const watcherSees = cluster.every(r => eid(r) !== null)
    const verdicts = []
    for (let a = 0; a < cluster.length; a++)
      for (let b = a + 1; b < cluster.length; b++)
        verdicts.push(classifyPair(cluster[a], cluster[b]))
    const kind = verdicts.includes('duplicate') ? 'duplicate'
      : verdicts.includes('indistinguishable') ? 'indistinguishable'
      : 'distinct'
    out.push({ rows: cluster, kind, watcherSees, numeric: cluster.every(r => isEspnId(eid(r))) })
  }
  return out
}

/**
 * `clean` | `covered` | `blind-spot` | `not-observable`.
 *
 * `covered` means duplicates exist and the watcher sees every one — the numeric
 * key reaches them and closing #1 on the watcher is honest. `blind-spot` means
 * at least one is invisible to it, and closing #1 would be an artifact of where
 * we were looking.
 */
export const verdictFor = ({ rowsSeen, groups }) => {
  if (rowsSeen === 0) return 'not-observable'
  const real = groups.filter(g => g.kind !== 'distinct')
  if (real.length === 0) return 'clean'
  return real.every(g => g.watcherSees) ? 'covered' : 'blind-spot'
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const r = (home, away, o = {}) => ({ home, away, ...o })

  check('two event ids on one fixture are two games, not a duplicate',
    classifyPair(r('Dodgers', 'Padres', { espn_event_id: '1' }),
                 r('Dodgers', 'Padres', { espn_event_id: '2' })) === 'distinct',
    'this is a doubleheader, and reporting it would be a false alarm')
  check('ONE event id on two rows is the known bug',
    classifyPair(r('Dream', 'Lynx', { espn_event_id: '9' }),
                 r('Atlanta Dream', 'Minnesota Lynx', { espn_event_id: '9' })) === 'duplicate')
  check('differing start times separate a doubleheader with no event ids',
    classifyPair(r('A', 'B', { start_time: '17:05' }), r('A', 'B', { start_time: '20:10' })) === 'distinct')
  check('one start time on both rows is a duplicate',
    classifyPair(r('A', 'B', { start_time: '17:05' }), r('A', 'B', { start_time: '17:05' })) === 'duplicate')
  check('NO DISCRIMINATOR IS INDISTINGUISHABLE, NEITHER ANSWER',
    classifyPair(r('St. Louis', 'Dallas'), r('St. Louis CITY SC', 'FC Dallas')) === 'indistinguishable',
    'calling it duplicate invents a bug; calling it distinct invents a doubleheader')
  check('an id on one side only is still indistinguishable',
    classifyPair(r('A', 'B', { espn_event_id: '1' }), r('A', 'B')) === 'indistinguishable')

  const blind = groupsFor([r('St. Louis', 'Dallas'), r('St. Louis CITY SC', 'FC Dallas')])
  check('a cluster with an id-less row is NOT visible to the watcher',
    blind.length === 1 && blind[0].watcherSees === false && blind[0].kind === 'indistinguishable')
  const seen = groupsFor([r('Dream', 'Lynx', { espn_event_id: '9' }),
                          r('Atlanta Dream', 'Minnesota Lynx', { espn_event_id: '9' })])
  check('a cluster where every row has an id IS visible to it',
    seen.length === 1 && seen[0].watcherSees === true && seen[0].kind === 'duplicate')
  check('unrelated fixtures do not cluster',
    groupsFor([r('Chelsea', 'Brighton'), r('Leeds', 'Brentford')]).length === 0)
  check('a doubleheader clusters but is classified distinct',
    (g => g.length === 1 && g[0].kind === 'distinct')(
      groupsFor([r('Dodgers', 'Padres', { espn_event_id: '1' }),
                 r('Dodgers', 'Padres', { espn_event_id: '2' })])))

  check('no rows is not a pass', verdictFor({ rowsSeen: 0, groups: [] }) === 'not-observable')
  check('no real groups is clean', verdictFor({ rowsSeen: 500, groups: [] }) === 'clean')
  check('a doubleheader alone is still clean',
    verdictFor({ rowsSeen: 500, groups: [{ kind: 'distinct', watcherSees: false }] }) === 'clean',
    'distinct groups are not defects and must not fail the sweep')
  check('duplicates the watcher sees are COVERED',
    verdictFor({ rowsSeen: 500, groups: [{ kind: 'duplicate', watcherSees: true }] }) === 'covered')
  check('ONE GROUP THE WATCHER CANNOT SEE IS A BLIND SPOT',
    verdictFor({ rowsSeen: 500, groups: [{ kind: 'duplicate', watcherSees: true },
                                         { kind: 'indistinguishable', watcherSees: false }] }) === 'blind-spot',
    'this is the whole question — one invisible group makes closing #1 an artifact')
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--days')
  const days = i >= 0 ? Number(process.argv[i + 1]) : 30
  mkdirSync('outbox', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = `outbox/fixture-identity-duplicates-${stamp}.txt`
  const out = []
  const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

  log(`probe_at: ${new Date().toISOString()}`)
  log(`question: are there duplicate fixtures the espn_event_id watcher cannot see?`)
  log(`method:   public GET /context/date, ${days} day(s) back. Grouped by FIXTURE`)
  log(`          IDENTITY (date + team names), never by event id.`)
  log('')

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  let rowsSeen = 0, idless = 0
  const groups = []
  for (let d = 1; d <= days; d++) {
    const day = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10)
    let games
    try {
      const r = await fetch(`${RELAY}/context/date/${day}`, { signal: AbortSignal.timeout(25000) })
      if (!r.ok) { log(`  ${day}  HTTP ${r.status} — not observed`); continue }
      const p = await r.json()
      games = [...(p.games?.regular ?? []), ...(p.games?.postseason ?? [])]
    } catch (e) { log(`  ${day}  ${String(e).slice(0, 40)} — not observed`); continue }

    rowsSeen += games.length
    idless += games.filter(g => eid(g) === null).length
    const g = groupsFor(games).filter(x => x.kind !== 'distinct')
    for (const x of g) groups.push({ ...x, date: day })
    if (!g.length) { log(`  ${day}  ${String(games.length).padStart(3)} row(s)  —`); continue }
    log(`  ${day}  ${String(games.length).padStart(3)} row(s)  ${g.length} group(s)`)
    for (const x of g) {
      log(`      ${x.kind.toUpperCase()}  ${x.watcherSees ? 'watcher SEES it' : '*** WATCHER IS BLIND ***'}`)
      for (const row of x.rows)
        log(`        ${row.id}  ${row.away} @ ${row.home}  eid=${eid(row) ?? '(none)'} start=${row.start_time ?? '(none)'}`)
    }
  }

  const verdict = verdictFor({ rowsSeen, groups })
  const blind = groups.filter(g => !g.watcherSees)
  log('')
  log(`${rowsSeen} row(s), ${idless} with no event id (${rowsSeen ? (100 * idless / rowsSeen).toFixed(1) : 'n/a'}%)`)
  log(`${groups.length} non-distinct group(s), ${blind.length} INVISIBLE to the event-id watcher`)
  log('')
  log(`VERDICT: ${verdict}`)
  log('')
  log({
    clean:
      'No duplicate fixtures at all, by identity, including among the rows with no\n' +
      'event id. The watcher and the numeric key share a blind spot and there is\n' +
      'nothing in it. Closing field-relay-nba#1 on the watcher is honest.',
    covered:
      'Duplicates exist and the event-id watcher sees every one of them, so the\n' +
      'numeric key reaches them all. Its blind spot is empty over this window.\n' +
      'Closing #1 on the watcher is honest.',
    'blind-spot':
      `${blind.length} group(s) the watcher cannot see, because at least one row in each\n` +
      'carries no event id. The numeric key cannot reach them either — it is scoped\n' +
      'to exactly the rows the watcher can group. Closing #1 on a clean watcher run\n' +
      'would be an artifact of where we were looking. Per Rule 87 (4) this needs a\n' +
      'SECOND CC-CMD written before the first is closed; the rows are listed above.\n' +
      'INDISTINGUISHABLE means neither a duplicate nor a doubleheader can be ruled\n' +
      'out from what is served — those rows carry no event id AND no start_time.',
    'not-observable':
      'No date returned a payload. Nothing was checked.',
  }[verdict])
  log('')
  log(`artifact: ${outPath}`)
  process.exit(verdict === 'blind-spot' ? 1 : 0)
}
