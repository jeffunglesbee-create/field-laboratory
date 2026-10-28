// Put the relay's bsd_event_id on a past date, then say how many soccer rows of a
// captured context carry one.
//
// docs/CC-CMD-2026-10-27-lineups-on-game-cards.md, Task 3: "recapture one context
// with ids through the existing capture workflow". The relay joins a game to a
// BSD event for a rolling window of dates around the cron's date key, one date per
// 15-minute tick; a date outside it is joined only by an authenticated call to
// `POST /admin/bsd-game-join` (field-relay-nba CONTRACTS.md, "`bsd_event_id` on
// `/context/date` game rows"). The date the lineup captures belong to,
// 2026-10-10 (event 5327, Charlotte FC v FC Dallas), is outside it. So a capture
// of that day carries no ids until it is joined, and this is the step that does
// that, from a runner, where the shared secret is.
//
// THE CALL WRITES TO THE RELAY'S ARCHIVE. It is the route's designed use: scoped
// to rows where `bsd_event_id IS NULL`, idempotent (the relay's own proof reran it
// and the second call wrote 0), logged to change_log with source `bsd_game_join`.
// It runs only when a person pushes the trigger file or dispatches the workflow.
//
// `coverage` is the half that stops a capture without ids from being committed as
// though it had them: it counts, prints the denominator (Rule 91), and fails below
// the floor the relay's own proof used (90% of the day's soccer rows) or on zero
// soccer rows or on an id on a row that is not soccer.
//
// Usage:  node scripts/context-ids.mjs --self-test
//         RELAY_SHARED_SECRET=... node scripts/context-ids.mjs join 2026-10-10
//         node scripts/context-ids.mjs coverage data/context-2026-10-10.json [--min 0.9]

import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

export const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** The six labels the relay joins. A row of any other sport must carry no id. */
export const SOCCER = ['MLS', 'EPL', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1']

/** The floor the relay's own live proof used, per date. */
export const FLOOR = 0.9

/** Count a captured context. Pure. An id is a non-empty string; a number, a null
 *  or an empty string is not one. */
export const coverageOf = payload => {
  const rows = [...(payload?.games?.regular ?? []), ...(payload?.games?.postseason ?? [])]
  const hasId = r => typeof r.bsd_event_id === 'string' && r.bsd_event_id.trim() !== ''
  const soccer = rows.filter(r => SOCCER.includes(r.sport))
  const other = rows.filter(r => !SOCCER.includes(r.sport))
  const without = soccer.filter(r => !hasId(r))
  return {
    rows: rows.length,
    soccerRows: soccer.length,
    soccerWithId: soccer.length - without.length,
    nonSoccerRows: other.length,
    nonSoccerWithId: other.filter(hasId).length,
    without: without.map(r => `${r.id} (${r.home} v ${r.away})`),
  }
}

/** The verdict on a count. Zero soccer rows is a failure: 0 of 0 says nothing. */
export const coverageVerdict = (c, min = FLOOR) => ({
  ...c,
  fraction: c.soccerRows === 0 ? null : c.soccerWithId / c.soccerRows,
  ok: c.soccerRows > 0 && c.soccerWithId / c.soccerRows >= min && c.nonSoccerWithId === 0,
})

/** What the admin route answered. Pure. `body` is the text, parsed here so a
 *  non-JSON answer is a failure and not a throw. */
export const joinVerdict = (status, bodyText) => {
  let body = null
  try { body = JSON.parse(bodyText) } catch { /* reported below */ }
  if (status !== 200) return { ok: false, why: `HTTP ${status}${body?.error ? `: ${body.error}` : ''}`, body }
  if (body === null || typeof body !== 'object') return { ok: false, why: 'the route answered 200 with a body that is not JSON', body }
  if (body.ok !== true) return { ok: false, why: `the route answered ok:${JSON.stringify(body.ok)}${body.reason ? ` (${body.reason})` : ''}`, body }
  return { ok: true, why: '', body }
}

// --- self-test ---------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const row = (sport, id, extra = {}) => ({ id, sport, home: 'H', away: 'A', ...extra })
  const payload = (...rows) => ({ games: { regular: rows, postseason: [] } })

  const full = payload(row('MLS', 'a', { bsd_event_id: '5327' }), row('EPL', 'b', { bsd_event_id: '5000' }), row('NBA', 'c'))
  check('a context whose every soccer row has an id passes',
    coverageVerdict(coverageOf(full)).ok === true, JSON.stringify(coverageVerdict(coverageOf(full))))
  check('...and prints its denominator', coverageOf(full).soccerRows === 2 && coverageOf(full).nonSoccerRows === 1)

  const none = payload(row('MLS', 'a'), row('EPL', 'b'))
  check('MUTATION: a context with no ids fails — the capture the relay had not joined',
    coverageVerdict(coverageOf(none)).ok === false)
  check('MUTATION: a null id is not an id',
    coverageVerdict(coverageOf(payload(row('MLS', 'a', { bsd_event_id: null })))).ok === false)
  check('MUTATION: an empty or blank id is not an id',
    coverageVerdict(coverageOf(payload(row('MLS', 'a', { bsd_event_id: '' }), row('MLS', 'b', { bsd_event_id: '  ' })))).ok === false)
  check('MUTATION: a number is not an id (the contract is a string)',
    coverageVerdict(coverageOf(payload(row('MLS', 'a', { bsd_event_id: 5327 })))).ok === false)
  check('MUTATION: zero soccer rows is not a pass — zero of zero says nothing',
    coverageVerdict(coverageOf(payload(row('NBA', 'a')))).ok === false)
  const nine = payload(...Array.from({ length: 9 }, (_, i) => row('MLS', `m${i}`, { bsd_event_id: String(i + 1) })), row('MLS', 'x'))
  check('9 of 10 is at the floor and passes', coverageVerdict(coverageOf(nine)).ok === true)
  const eight = payload(...Array.from({ length: 8 }, (_, i) => row('MLS', `m${i}`, { bsd_event_id: String(i + 1) })), row('MLS', 'x'), row('MLS', 'y'))
  check('MUTATION: 8 of 10 is under the floor and fails', coverageVerdict(coverageOf(eight)).ok === false)
  check('MUTATION: an id on a row that is not soccer fails',
    coverageVerdict(coverageOf(payload(row('MLS', 'a', { bsd_event_id: '1' }), row('NBA', 'b', { bsd_event_id: '2' })))).ok === false)
  check('the rows without an id are NAMED', coverageOf(none).without.length === 2 && /a \(H v A\)/.test(coverageOf(none).without[0]))
  check('a payload with no games reads as zero rows, not as a throw', coverageOf({}).rows === 0 && coverageOf(null).rows === 0)

  check('join: 200 with ok:true passes', joinVerdict(200, '{"ok":true,"written":53}').ok === true)
  check('MUTATION: 401 fails and says so', joinVerdict(401, 'Unauthorized').ok === false && /401/.test(joinVerdict(401, 'Unauthorized').why))
  check('MUTATION: 200 with ok:false fails', joinVerdict(200, '{"ok":false,"reason":"events not fully read; nothing written"}').ok === false)
  check('MUTATION: 200 with a body that is not JSON fails', joinVerdict(200, '<html>').ok === false)
  check('MUTATION: 400 carries the route\'s own error', /body must be/.test(joinVerdict(400, '{"ok":false,"error":"body must be {}"}').why))
  check('MUTATION: 200 without an ok field fails — absent is not true', joinVerdict(200, '{"written":1}').ok === false)

  process.exit(summarize() === 0 ? 0 : 1)
}

// --- cli ---------------------------------------------------------------------

if (isMain(import.meta.url) && !process.argv.includes('--self-test')) {
  const [cmd, arg] = process.argv.slice(2)

  if (cmd === 'join') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg ?? '')) { console.error('usage: context-ids.mjs join YYYY-MM-DD'); process.exit(2) }
    // A missing secret is a failure to run, not a reason to skip the join and
    // capture a context without ids.
    const secret = process.env.RELAY_SHARED_SECRET
    if (!secret) { console.error('REFUSED — RELAY_SHARED_SECRET is not set. Nothing was called.'); process.exit(2) }
    let status = 0, text = ''
    try {
      const r = await fetch(`${RELAY}/admin/bsd-game-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-FIELD-Relay': secret },
        body: JSON.stringify({ date: arg }),
      })
      status = r.status
      text = await r.text()
    } catch (e) { console.error(`UNREACHABLE — ${e.message}. Nothing was joined.`); process.exit(1) }
    const v = joinVerdict(status, text)
    const b = v.body ?? {}
    // The route's own counters, as it names them, so a reader can see what was
    // asked and what was written.
    for (const k of ['date', 'soccerRows', 'pending', 'written', 'ambiguous', 'refusedKickoff', 'unjudgedKickoff', 'upstreamPages', 'cacheHits'])
      if (k in b) console.log(`  ${k.padEnd(16)} ${b[k]}`)
    if (Array.isArray(b.unmatched)) console.log(`  unmatched        ${b.unmatched.length}${b.unmatched.length ? `: ${b.unmatched.join(' | ')}` : ''}`)
    console.log(v.ok ? `\n  joined ${arg}` : `\n  FAIL — ${v.why}`)
    process.exit(v.ok ? 0 : 1)
  }

  if (cmd === 'coverage') {
    const minAt = process.argv.indexOf('--min')
    const min = minAt > 0 ? Number(process.argv[minAt + 1]) : FLOOR
    const payload = JSON.parse(readFileSync(arg, 'utf8'))
    const c = coverageOf(payload)
    const v = coverageVerdict(c, min)
    console.log(`  ${arg}: ${c.rows} rows`)
    console.log(`  soccer rows ${c.soccerRows}, carrying bsd_event_id ${c.soccerWithId}` +
      `${v.fraction === null ? '' : ` (${(v.fraction * 100).toFixed(1)}%, floor ${(min * 100).toFixed(0)}%)`}`)
    console.log(`  rows that are not soccer: ${c.nonSoccerRows}, carrying an id: ${c.nonSoccerWithId}`)
    if (c.without.length) console.log(`  soccer rows with no id (${c.without.length}): ${c.without.slice(0, 12).join(' | ')}${c.without.length > 12 ? ' | ...' : ''}`)
    console.log(v.ok ? '\n  PASS' : '\n  FAIL')
    process.exit(v.ok ? 0 : 1)
  }

  console.error('usage: context-ids.mjs join YYYY-MM-DD | coverage FILE [--min 0.9] | --self-test')
  process.exit(2)
}
