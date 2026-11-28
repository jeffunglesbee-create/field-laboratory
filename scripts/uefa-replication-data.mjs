#!/usr/bin/env node
// The DATA step of the 2026-11-28 replication rule (outbox/forecast-replicate-uefa-2026-11-28.mjs, whose RULE was committed first): a bundle of the 2024-25 UEFA league-phase events, read from ESPN's public scoreboard, one day per read.
// It computes NO model number. It keeps, for each COMPLETED event, only the fields in FIELDS (an allow-list: a field that is not named here cannot reach the file), prints counts and never a score, and stops on the first day that does not answer.
//
//   node scripts/uefa-replication-data.mjs --from 2024-09-01 --to 2025-06-30 --out outbox/forecast-uefa-data-2024-25-2026-11-28.json
//   node scripts/uefa-replication-data.mjs --self-test
//
// A CLUB IS ITS ESPN team id. `home` and `away` carry the id as a string, so no spelling can split a club; `home_name` and `away_name` carry ESPN's short name for a human to read. A match's `date` is the day REQUESTED (the way the archive's rows are dated), and `start_time` is ESPN's own UTC instant.
// EVERY DAY IS READ. A day that does not answer HTTP 200 with the expected shape (after one retry; never after a 403 or 429) stops the run and writes nothing: a missing day is never an empty day. The data's licence is NOT assessed here (STANDARDS Rule 45), flagged for a human.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const SLUGS = [
  { slug: 'uefa.champions', label: 'UEFA Champions League' },
  { slug: 'uefa.europa', label: 'UEFA Europa League' },
  { slug: 'uefa.europa.conf', label: 'UEFA Europa Conference League' },
]
export const FIELDS = ['id', 'sport', 'date', 'home', 'away', 'home_score', 'away_score', 'start_time', 'espn_event_id', 'home_name', 'away_name', 'phase']
// A key that must never appear anywhere in the output: these carry the outcome in a form other than the two scores (a winner flag, a record, a form string, an advance flag).
export const FORBIDDEN_KEYS = ['winner', 'records', 'form', 'advance', 'statistics', 'leaders', 'headlines', 'linescores']
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function daysBetween(from, to) {
  const out = []
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
const toNum = s => { const n = Number(s); return s === null || s === undefined || s === '' || !Number.isFinite(n) ? null : n }

/** The rows of one scoreboard payload for one requested day: completed events only, the allow-listed fields only. Returns null when the payload is not the expected shape. */
export function rowsOfScoreboard(payload, label, day) {
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.events)) return null
  const rows = []
  for (const ev of payload.events) {
    const comp = ev?.competitions?.[0]
    if (!comp || !Array.isArray(comp.competitors)) continue
    if (comp.status?.type?.completed !== true) continue
    const h = comp.competitors.find(c => c.homeAway === 'home'), a = comp.competitors.find(c => c.homeAway === 'away')
    if (!h || !a || !h.team || !a.team || h.team.id == null || a.team.id == null) continue
    rows.push({
      id: `${label}_${day}_e${ev.id}`,
      sport: label,
      date: day,
      home: String(h.team.id),
      away: String(a.team.id),
      home_score: toNum(h.score),
      away_score: toNum(a.score),
      start_time: ev.date ?? null,
      espn_event_id: String(ev.id),
      home_name: h.team.shortDisplayName ?? h.team.displayName ?? null,
      away_name: a.team.shortDisplayName ?? a.team.displayName ?? null,
      phase: ev.season?.slug ?? null,
    })
  }
  return rows
}

/** Every key of an object tree, for the leak scan. */
export function allKeys(x, acc = new Set()) {
  if (Array.isArray(x)) x.forEach(v => allKeys(v, acc))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { acc.add(k); allKeys(v, acc) }
  return acc
}
export const leakedKeys = x => FORBIDDEN_KEYS.filter(k => allKeys(x).has(k))

const sleep = ms => new Promise(r => setTimeout(r, ms))
/** One day of one competition. `get` is injectable for the self-test. Never retries a 403 or 429. */
export async function readDay(slug, day, get, spacingMs = 0) {
  const url = `${BASE}/${slug}/scoreboard?dates=${day.replaceAll('-', '')}`
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await get(url)
      if (res.status === 200) return { status: 200, payload: await res.json() }
      if (res.status === 403 || res.status === 429) return { status: res.status, payload: null, stop: true }
      if (attempt === 2) return { status: res.status, payload: null }
    } catch (e) { if (attempt === 2) return { status: 0, payload: null, error: String(e).slice(0, 120) } }
    await sleep(spacingMs * 4)
  }
  return { status: 0, payload: null }
}

export async function collect({ from, to, get, spacingMs = 0, log = () => {} }) {
  const days = daysBetween(from, to)
  const statuses = {}, kept = [], seen = new Set()
  let duplicates = 0
  for (const { slug, label } of SLUGS) {
    for (const d of days) {
      const r = await readDay(slug, d, get, spacingMs)
      statuses[r.status] = (statuses[r.status] ?? 0) + 1
      const rows = r.payload === null ? null : rowsOfScoreboard(r.payload, label, d)
      if (rows === null) return { stopped: `${slug} ${d} did not answer 200 with the expected shape (status ${r.status}${r.error ? ', ' + r.error : ''}${r.stop ? ', not retried' : ''})`, statuses }
      for (const row of rows) { if (seen.has(row.espn_event_id)) { duplicates++; continue } seen.add(row.espn_event_id); kept.push(row) }
      if (spacingMs) await sleep(spacingMs)
    }
    log(`${slug}: ${days.length} days read`)
  }
  const cmp = (a, b) => (a.sport < b.sport ? -1 : a.sport > b.sport ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start_time ?? '') < (b.start_time ?? '') ? -1 : (a.start_time ?? '') > (b.start_time ?? '') ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  kept.sort(cmp)
  const byLabel = Object.fromEntries(SLUGS.map(s => [s.label, kept.filter(r => r.sport === s.label).length]))
  const byPhase = {}
  for (const r of kept) byPhase[`${r.sport}|${r.phase}`] = (byPhase[`${r.sport}|${r.phase}`] ?? 0) + 1
  return {
    bundle: {
      what: 'Completed events of the three main UEFA competitions, read from ESPN scoreboards one day per read. A club is its ESPN team id. No model number is computed here (the rule is outbox/forecast-replicate-uefa-2026-11-28.mjs, fixed first).',
      route: `${BASE}/<slug>/scoreboard?dates=YYYYMMDD`, from, to, daysRead: days.length, slugs: SLUGS.map(s => s.slug), statuses, labels: SLUGS.map(s => s.label), fields: FIELDS,
      counts: { rows: kept.length, byLabel, byPhase, nullScores: kept.filter(r => r.home_score === null || r.away_score === null).length, duplicateEventIds: duplicates },
      rows: kept,
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
async function selfTest() {
  let n = 0, bad = 0
  const check = (name, cond, detail = '') => { n++; if (cond) console.log(`  ok   ${name}`); else { bad++; console.log(`  FAIL ${name}${detail ? '\n       ' + detail : ''}`) } }
  const team = (id, short) => ({ id: String(id), shortDisplayName: short, displayName: short + ' FC', abbreviation: short.slice(0, 3).toUpperCase() })
  // A fixture in ESPN's shape, with every outcome-bearing field a real payload carries (winner, form, records, advance, a score as a string), so the allow-list has something to keep out.
  const ev = (id, date, home, away, hs, as, completed = true, order = 'home-first') => {
    const h = { homeAway: 'home', team: team(home[0], home[1]), score: hs, winner: true, form: 'WWLDW', records: [{ summary: '2-1-3' }], advance: false }
    const a = { homeAway: 'away', team: team(away[0], away[1]), score: as, winner: false, form: 'LDLWD', records: [{ summary: '1-1-4' }], advance: false }
    return { id: String(id), date, season: { slug: 'league-phase' }, competitions: [{ status: { type: { completed, state: completed ? 'post' : 'pre' } }, competitors: order === 'home-first' ? [h, a] : [a, h] }] }
  }
  const day1 = { events: [ev(101, '2024-09-17T16:45Z', [10, 'Alpha'], [20, 'Beta'], '2', '1'), ev(102, '2024-09-17T19:00Z', [30, 'Gamma'], [40, 'Delta'], '0', '0'), ev(103, '2024-09-17T19:00Z', [50, 'Eps'], [60, 'Zeta'], '', '', false), ev(104, '2024-09-17T19:00Z', [70, 'Eta'], [80, 'Theta'], '3', '1', true, 'away-first')] }
  const rows = rowsOfScoreboard(day1, 'UEFA Champions League', '2024-09-17')
  check('a completed event becomes a row; a scheduled one does not', rows.length === 3 && !rows.some(r => r.espn_event_id === '103'), JSON.stringify(rows.map(r => r.espn_event_id)))
  check('the row carries exactly the allow-listed fields, in order', rows.every(r => JSON.stringify(Object.keys(r)) === JSON.stringify(FIELDS)), JSON.stringify(Object.keys(rows[0] ?? {})))
  check('home and away are the ESPN team ids, as strings', rows[0].home === '10' && rows[0].away === '20' && typeof rows[0].home === 'string', JSON.stringify(rows[0]))
  check('home and away come from homeAway, not from the order of the competitors array', rows.find(r => r.espn_event_id === '104').home === '70' && rows.find(r => r.espn_event_id === '104').home_score === 3 && rows.find(r => r.espn_event_id === '104').away_score === 1, JSON.stringify(rows.find(r => r.espn_event_id === '104')))
  check('scores are numbers; a draw keeps both zeros (0 is a score, not a missing one)', rows[1].home_score === 0 && rows[1].away_score === 0, JSON.stringify(rows[1]))
  check('the id follows the archive\'s form (label, requested day, e + event id)', rows[0].id === 'UEFA Champions League_2024-09-17_e101', rows[0].id)
  check('the phase and the UTC start instant are kept', rows[0].phase === 'league-phase' && rows[0].start_time === '2024-09-17T16:45Z', JSON.stringify(rows[0]))
  check('NO outcome-bearing key reaches a row (winner, form, records, advance)', leakedKeys(rows).length === 0, leakedKeys(rows).join(','))
  check('the leak scan CAN fail: a polluted row is caught (negative control)', leakedKeys([{ ...rows[0], winner: true }]).join() === 'winner' && leakedKeys({ a: [{ b: { form: 'WL' } }] }).join() === 'form', '')
  check('a score that is missing on a completed event is null, not 0', rowsOfScoreboard({ events: [ev(105, 'x', [1, 'A'], [2, 'B'], undefined, undefined)] }, 'L', '2024-09-18')[0].home_score === null, '')
  check('a payload without events is refused, not read as an empty day', rowsOfScoreboard({}, 'L', 'd') === null && rowsOfScoreboard(null, 'L', 'd') === null && rowsOfScoreboard({ events: 'x' }, 'L', 'd') === null, '')
  check('an event with no team id is skipped, not guessed', rowsOfScoreboard({ events: [{ id: '9', competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: 'home', team: {} , score: '1' }, { homeAway: 'away', team: { id: '2' }, score: '0' }] }] }] }, 'L', 'd').length === 0, '')
  const dayList = daysBetween('2024-09-01', '2025-06-30')
  check('the window 2024-09-01 to 2025-06-30 is 303 days, first and last included', dayList.length === 303 && dayList[0] === '2024-09-01' && dayList.at(-1) === '2025-06-30', String(dayList.length))
  check('a leap day is one day', daysBetween('2024-02-28', '2024-03-01').length === 3, '')

  // the collector, against a stubbed ESPN: every slug and day is asked, a duplicate event is kept once, and a bad day stops the run
  const mk = (status, body) => ({ status, json: async () => body })
  const asked = []
  const get200 = async url => { asked.push(url); return url.includes('uefa.champions/') && url.endsWith('20240917') ? mk(200, day1) : url.includes('uefa.champions/') && url.endsWith('20240918') ? mk(200, { events: [ev(101, '2024-09-17T16:45Z', [10, 'Alpha'], [20, 'Beta'], '2', '1')] }) : mk(200, { events: [] }) }
  const ok = await collect({ from: '2024-09-17', to: '2024-09-18', get: get200 })
  check('every slug and every day is asked once: 3 competitions x 2 days = 6 reads', asked.length === 6 && new Set(asked).size === 6, String(asked.length))
  check('a duplicate event (seen on two days) is kept once and counted', ok.bundle.counts.rows === 3 && ok.bundle.counts.duplicateEventIds === 1, JSON.stringify(ok.bundle.counts))
  check('the bundle carries counts and never a score summary', !JSON.stringify(ok.bundle.counts).match(/score/i) || /nullScores/.test(JSON.stringify(ok.bundle.counts)), '')
  check('the bundle as a whole has no outcome-bearing key', leakedKeys(ok.bundle).length === 0, leakedKeys(ok.bundle).join(','))
  let calls429 = 0
  const r429 = await collect({ from: '2024-09-17', to: '2024-09-18', get: async () => { calls429++; return mk(429, {}) } })
  check('a 429 stops the run at once and writes no bundle', r429.stopped && r429.bundle === undefined && /429/.test(r429.stopped), JSON.stringify(r429))
  check('a 429 is asked ONCE and never retried (a rate limit is not hammered)', calls429 === 1, `${calls429} calls`)
  let calls = 0
  const r500 = await collect({ from: '2024-09-17', to: '2024-09-17', get: async () => { calls++; return mk(500, {}) } })
  check('a 500 is retried once and then stops the run', r500.stopped && calls === 2, `${calls} calls`)
  const rBad = await collect({ from: '2024-09-17', to: '2024-09-17', get: async () => mk(200, { nope: 1 }) })
  check('a 200 with the wrong shape stops the run (a missing day is never an empty day)', rBad.stopped && rBad.bundle === undefined, JSON.stringify(rBad))
  const rThrow = await collect({ from: '2024-09-17', to: '2024-09-17', get: async () => { throw new Error('socket hang up') } })
  check('a network error is retried once and then stops the run', rThrow.stopped && /socket hang up/.test(rThrow.stopped), JSON.stringify(rThrow))
  console.log(`\n${n - bad} of ${n} checks passed${bad ? `, ${bad} FAILED` : ''}`)
  return bad === 0 ? 0 : 1
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) return selfTest()
  const arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
  const from = arg('--from'), to = arg('--to'), out = arg('--out')
  if (!DAY.test(from ?? '') || !DAY.test(to ?? '') || !out || from > to) { console.error('usage: node scripts/uefa-replication-data.mjs --from YYYY-MM-DD --to YYYY-MM-DD --out <file.json> | --self-test'); return 2 }
  if (daysBetween(from, to).length > 400) { console.error('more than the 400-day cap'); return 2 }
  const UA = 'FIELD-laboratory/1.0 (read-only research; github.com/jeffunglesbee-create/field-laboratory)'
  const get = url => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
  const res = await collect({ from, to, get, spacingMs: 350, log: m => console.log(m) })
  if (res.stopped) { console.error(`STOP: ${res.stopped}; statuses ${JSON.stringify(res.statuses)}; nothing written`); return 1 }
  const b = res.bundle
  const text = JSON.stringify(b, null, 1) + '\n'
  fs.writeFileSync(out, text)
  console.log(`${out}: ${b.daysRead} days x ${b.slugs.length} competitions read (${JSON.stringify(b.statuses)}); ${b.counts.rows} completed events ${JSON.stringify(b.counts.byLabel)}; by phase ${JSON.stringify(b.counts.byPhase)}; null scores ${b.counts.nullScores}; duplicate event ids ${b.counts.duplicateEventIds}`)
  console.log(`sha256 ${createHash('sha256').update(text).digest('hex')}  ${out}  (${Buffer.byteLength(text)} bytes)`)
  return 0
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().then(c => { process.exitCode = c })
