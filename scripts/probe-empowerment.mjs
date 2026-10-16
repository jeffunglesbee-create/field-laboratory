// Task 0 of docs/CC-CMD-2026-10-15-empowerment-metrics.md: four probes, each
// with a stop condition, run before a single type is written.
//
// WHY A RUNNER. The agent sandbox reaches neither *.workers.dev nor the NHL
// APIs (HTTP 000 on both, measured again 2026-10-16). So this runs in Actions
// and commits what it read, the same shape as probe-epl-substrate.mjs.
//
// WHAT CHANGED FROM THE FIRST PASS (docs/TASK0-RESULTS-2026-10-15-*.md, chat,
// 2026-10-15). That pass read ONE event (wc26 8348) and concluded "R2 holds
// wc26 only". /bsd/r2/list returns at most 100 keys, takes no cursor, and
// (measured below, `r2_list_mechanism`) answers a request with no prefix from
// `bsd/wc26/`. So this probe WALKS the store by prefix until no page is
// truncated, and every verdict states how many captures it was taken over
// (Rule 91).
//
// SECOND REVISION, 2026-10-16. The first run of this probe (run 38853536166)
// was attacked by nine reviewers before its verdicts were reported, and four
// of its claims did not survive (workflow wf_43e72702-3a5):
//   - 0.1 printed MET from a condition the probe ADDED (no possession event
//     type), not from the two the spec states; and its scan skipped
//     incidents[].sequence[], which carries `pass`.
//   - 0.4 printed NOT MET from momentum's SIGN agreeing with shots, which a
//     momentum that merely echoes the shotmap also passes. The spec's stop
//     condition is exactly that echo ("reduces to the opponent did not
//     shoot"), so the test could not fail for the reason it existed.
//   - 0.2's absence verdict came from a detector never made to fail: it saw
//     only {x:number,y:number} objects, and read two of the writer's files.
//   - 0.3's denominator was counted after the cap, and the join's chance rate
//     was never measured.
// Each now has the test the reviewers named, and each test has a negative
// control in --self-test that must come out the other way.
//
// RULE 99 everywhere: a fetch lands in one of five states, and `empty` is not
// `present`. RULE 90: `--self-test` drives every analyser against fixtures,
// including the negative controls that must come out the other way.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { isMain } from './checks.mjs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const NHL_WEB = process.env.NHL_WEB_URL || 'https://api-web.nhle.com'
const NHL_STATS = process.env.NHL_STATS_URL || 'https://api.nhle.com'
const CC_CMD = 'docs/CC-CMD-2026-10-15-empowerment-metrics.md'
const LIST_CALL_CAP = 12000    // /bsd/r2/list pages, slug walk + event walk; reported if reached
const PER_COMP_READS = 15      // newest non-shell events whose stats.json is read, per competition
const READ_CAP = 1600          // every /bsd/r2/read in total; reported if reached
const READ_CONCURRENCY = 6
const NHL_GAME_CAP = 16
const TIMEOUT_MS = 30_000

// ── fetch, classified ──────────────────────────────────────────────────────
export const classify = (r) => {
  if (r.threw) return 'unreachable'
  if (!r.ok) return 'http-error'
  if (r.json === undefined) return 'unparseable'
  return r.contentful ? 'present' : 'empty'
}

async function getJson(url, contentful = (j) => j != null) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'FIELD-laboratory/1.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch (e) { json = undefined }
    const r = { ok: res.ok, status: res.status, json, contentful: json !== undefined && contentful(json) }
    return { ...r, state: classify(r) }
  } catch (e) {
    return { threw: true, state: 'unreachable', error: String(e).slice(0, 160) }
  }
}

/** Run `fn` over `items`, `n` at a time, keeping input order in the result. */
export async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}

const sum = (arr, f) => arr.reduce((n, x) => n + (f(x) || 0), 0)
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }
const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : 'n/a'

// ── R2 census ──────────────────────────────────────────────────────────────
// No cursor exists, so the store is walked by PREFIX. A page is the first 100
// keys in code-point order, so when it is truncated every child prefix whose
// next character sorts BEFORE the last key's is already complete on the page;
// only the last key's own child and the ones after it are listed again.
export const DIGITS = '0123456789'
// Slug characters in code-point order. '/' (47) sorts between '-' (45) and
// '0' (48), which is why the slug walk treats it as "this slug is complete".
export const SLUG_CHARS = '-0123456789_abcdefghijklmnopqrstuvwxyz'
// The same, with '/' in its place: a sibling '/' after '-' is how the walk
// reaches slug `ligue` when a crowded `ligue-1` fills the `bsd/ligue` page.
export const WALK_CHARS = '-/0123456789_abcdefghijklmnopqrstuvwxyz'

export async function enumerate(listPage, root, cap = LIST_CALL_CAP, alphabet = WALK_CHARS, budget = { calls: 0 }) {
  const keys = new Map(); let capped = false
  const queue = [root]
  while (queue.length) {
    const prefix = queue.shift()
    if (budget.calls >= cap) { capped = true; break }
    budget.calls++
    const page = await listPage(prefix)
    if (!page) continue
    for (const k of page.keys) keys.set(k.key, k)
    if (page.truncated && page.keys.length) {
      const last = page.keys[page.keys.length - 1].key
      const cLast = last[prefix.length]
      if (cLast === undefined) continue
      queue.push(prefix + cLast)
      for (const c of alphabet) if (c > cLast) queue.push(prefix + c)
    }
  }
  return { keys: [...keys.values()], calls: budget.calls, capped, unvisited: queue.length }
}

/**
 * Every competition slug under bsd/, found by walking the store rather than
 * trusting a list of expected names. The first revision took slugs from the
 * relay's V2_LEAGUES plus the first page under each letter, which by its own
 * artifact could not see `europa` or `ligue1` (eflchamp and laliga filled
 * those pages), and could never see a slug older code wrote and HEAD no longer
 * names. This descends a truncated page along its last key's next character
 * and re-lists every sibling that sorts after it, until no page is truncated.
 */
export async function slugWalk(listPage, cap = LIST_CALL_CAP, budget = { calls: 0 }, alphabet = WALK_CHARS) {
  const slugs = new Set(); const queue = ['bsd/']; let capped = false
  while (queue.length) {
    if (budget.calls >= cap) { capped = true; break }
    const prefix = queue.shift(); budget.calls++
    const page = await listPage(prefix)
    if (!page) continue
    for (const k of page.keys) { const m = /^bsd\/([^/]+)\//.exec(k.key); if (m) slugs.add(m[1]) }
    if (prefix !== 'bsd/' && prefix.endsWith('/')) continue   // a complete slug: harvested, not descended
    if (!page.truncated || !page.keys.length) continue
    const c = page.keys[page.keys.length - 1].key[prefix.length]
    if (c === undefined) continue
    if (c !== '/') queue.push(prefix + c)          // '/' means the slug is complete: its events are not slug discovery
    for (const x of alphabet) if (x > c) queue.push(prefix + x)
  }
  return { slugs: [...slugs].sort(), capped, unvisited: queue.length }
}

/**
 * The slugs the capture writer can produce, read from field-relay-nba's own
 * source: V2_LEAGUES rows carrying bsdLeagueId, FIRST slug per league id (the
 * writer's map keeps the first), in file order. Kept as a CROSS-CHECK against
 * the walk, not as the census's source.
 */
export function writerSlugs(indexSource) {
  const firstByLid = new Map()
  for (const m of String(indexSource).matchAll(/^\s*'([a-z0-9]+)':\s*\{[^\n}]*\bbsdLeagueId:\s*(\d+)/gm)) {
    if (!firstByLid.has(m[2])) firstByLid.set(m[2], m[1])
  }
  return [...firstByLid.values()]
}

export function groupCaptures(keys) {
  const comps = {}
  for (const k of keys) {
    const m = /^bsd\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(k.key)
    if (!m) continue
    const [, comp, event, file] = m
    const c = comps[comp] ??= { events: {}, first: null, last: null }
    const e = c.events[event] ??= { files: [], uploaded: null }
    e.files.push(file)
    if (!e.uploaded || k.uploaded > e.uploaded) e.uploaded = k.uploaded
    if (!c.first || k.uploaded < c.first) c.first = k.uploaded
    if (!c.last || k.uploaded > c.last) c.last = k.uploaded
  }
  return comps
}

/** Whether a capture's incidents say the match had FINISHED, was IN PLAY, or neither. */
export const FINISHED_TEXT = /^(FT|AET|AP|PEN|Ended|Full[ -]?time|After extra time|After penalties)$/i
export function captureStage(incidents) {
  const periods = (incidents?.incidents ?? []).filter(i => i.type === 'period')
  const finished = periods.some(i => FINISHED_TEXT.test(String(i.text ?? '').trim()))
  const inPlay = periods.some(i => i.is_live === true)
  return finished ? 'finished' : inPlay ? 'in-play' : 'unmarked'
}

// ── 0.1 Flow: is order and interleaving reconstructible? ───────────────────
const SHOT_EVENTS = new Set(['miss', 'save', 'block', 'post', 'goal'])
const t = (s) => (s.min ?? NaN) + (s.added ?? 0) / 100   // added sorts inside its minute
export const TIME_KEY = /^(t|ts|uts|time|timestamp|frame|frameid|frame_id|minute|min|sec|second|period_second|added|added_time)$/i
// Incident types that carry no team: they cannot interleave as an OPPONENT event.
const TEAMLESS = new Set(['period', 'injuryTime'])

/**
 * Runs of 3+ consecutive own-team shots with no opposing shot between, which is
 * the narrowed Flow the owner adopted. Shots share a (min, added) bucket 26% of
 * the time, and inside a MIXED-team bucket nothing orders the two teams' shots.
 * So every arrangement of every mixed bucket is tried (a shot of unknown side
 * is tried as both), and the count of maximal runs is reported as the range it
 * spans: at least `minRuns` under every order, at most `maxRuns` under the most
 * favourable. The first version tried two global orders and counted runs that
 * no single order contains together; a reviewer reproduced both.
 */
export const ARRANGEMENT_CAP = 4096
export const periodOf = (tm) => (tm < 46 ? 1 : tm < 91 ? 2 : tm < 106 ? 3 : 4)   // t = min + added/100, so 45+3 = 45.03 is period 1
const uniquePerms = (labels) => {
  const out = new Set()
  const rec = (rest, acc) => {
    if (!rest.length) { out.add(acc); return }
    const seen = new Set()
    rest.forEach((l, i) => { if (seen.has(l)) return; seen.add(l); rec([...rest.slice(0, i), ...rest.slice(i + 1)], acc + l) })
  }
  rec(labels, ''); return [...out]
}
const bucketOptions = (labels) => {
  const k = labels.filter(l => l === 'x').length
  if (k === 0 && new Set(labels).size === 1) return [labels.join('')]
  const out = new Set()
  for (let mask = 0; mask < 2 ** k; mask++) {
    let j = 0; const assigned = labels.map(l => (l === 'x' ? ((mask >> j++) & 1 ? 'h' : 'a') : l))
    for (const p of uniquePerms(assigned)) out.add(p)
  }
  return [...out]
}
export const countRuns = (seq) => {
  let runs = 0, cur = '', len = 0
  for (const c of seq) { if (c === cur) len++; else { if (len >= 3) runs++; cur = c; len = 1 } }
  if (len >= 3) runs++
  return runs
}
export function flowRuns(shots) {
  const lab = (s) => (s.home === true ? 'h' : s.home === false ? 'a' : 'x')
  const timedShots = shots.filter(s => Number.isFinite(s.min))
  const buckets = new Map()
  for (const s of timedShots) { const k = `${s.min}+${s.added ?? 0}`; (buckets.get(k) ?? buckets.set(k, { t: t(s), labels: [] }).get(k)).labels.push(lab(s)) }
  // A run never crosses a period break: a '|' between halves is a label no
  // team shares, so it ends whatever run is open (45+N stays in the first half).
  const sorted = [...buckets.values()].sort((a, b) => a.t - b.t)
  const options = sorted.flatMap((b, i) => (i > 0 && periodOf(b.t) !== periodOf(sorted[i - 1].t) ? [['|'], bucketOptions(b.labels)] : [bucketOptions(b.labels)]))
  const total = options.reduce((n, o) => n * o.length, 1)
  const limit = Math.min(total, ARRANGEMENT_CAP)
  let minRuns = Infinity, maxRuns = -Infinity
  const idx = options.map(() => 0)
  for (let n = 0; n < limit; n++) {
    const r = countRuns(options.map((o, i) => o[idx[i]]).join(''))
    if (r < minRuns) minRuns = r; if (r > maxRuns) maxRuns = r
    for (let i = idx.length - 1; i >= 0; i--) { if (++idx[i] < options[i].length) break; idx[i] = 0 }
  }
  return { minRuns: Number.isFinite(minRuns) ? minRuns : 0, maxRuns: Number.isFinite(maxRuns) ? maxRuns : 0, arrangements: total, capped: total > ARRANGEMENT_CAP,
    mixedBuckets: options.filter(o => o.length > 1).length, periodBreaks: options.filter(o => o[0] === '|').length, unknownSide: timedShots.filter(s => lab(s) === 'x').length, untimed: shots.length - timedShots.length }
}

/** One capture's shotmap, judged for what Flow needs. */
export function flowOf(stats, incidents) {
  const shots = Array.isArray(stats?.shotmap) ? stats.shotmap : null
  if (!shots) return { state: 'no-shotmap' }
  if (shots.length === 0) return { state: 'empty-shotmap' }
  const incs = incidents?.incidents ?? []
  const withMin = shots.filter(s => Number.isFinite(s.min)).length
  const withXg = shots.filter(s => typeof s.xg === 'number').length
  const teams = new Set(shots.map(s => s.home).filter(h => typeof h === 'boolean'))
  // Array order against (min, added): non-increasing = newest first.
  let desc = 0, asc = 0, eq = 0
  for (let i = 1; i < shots.length; i++) {
    const a = t(shots[i - 1]), b = t(shots[i])
    if (a > b) desc++; else if (a < b) asc++; else eq++
  }
  const order = asc === 0 && desc > 0 ? 'newest-first' : desc === 0 && asc > 0 ? 'oldest-first' : (asc === 0 && desc === 0 ? 'all-tied' : 'mixed')
  const buckets = new Map()
  for (const s of shots) { const k = `${s.min}+${s.added ?? 0}`; buckets.set(k, [...(buckets.get(k) ?? []), s]) }
  const tiedShots = [...buckets.values()].filter(b => b.length > 1).reduce((n, b) => n + b.length, 0)
  const mixedTies = [...buckets.values()].filter(b => b.length > 1 && new Set(b.map(s => s.home)).size > 1).length
  // INDEPENDENT ORDER CHECK. A goal's sequence[] lists, in order, the events
  // that led to it; when an earlier shot by a named player sits in the SAME
  // minute as the goal, the shotmap's array order either agrees with the
  // sequence or it does not.
  let agree = 0, disagree = 0
  for (const inc of incs) {
    if (inc.type !== 'goal' || !Array.isArray(inc.sequence)) continue
    const seq = inc.sequence
    const goalIdx = seq.findIndex(e => e.event === 'goal')
    if (goalIdx < 0) continue
    const goalPid = seq[goalIdx].pid
    const sameMinute = shots.map((s, i) => ({ s, i })).filter(({ s }) => s.min === inc.minute && (s.added ?? null) === (inc.added_time ?? null))
    const gi = sameMinute.find(({ s }) => s.player_id === goalPid && s.type === 'goal')
    if (!gi) continue
    const used = new Set()
    for (let j = 0; j < goalIdx; j++) {
      const prior = seq[j]
      if (!SHOT_EVENTS.has(prior.event) || prior.event === 'goal' || prior.pid == null) continue
      const pi = sameMinute.find(({ s, i }) => !used.has(i) && s.player_id === prior.pid && s.type === prior.event)
      if (!pi) continue
      used.add(pi.i)
      if (gi.i < pi.i) agree++; else disagree++
    }
  }
  // Is the shotmap's `min` the incident's minute? A declared field, so it is
  // checked against the one independent record of the same event: the goal.
  // One row per goal: same-minute pairs first, then the nearest unused row, so
  // a player's earlier goal cannot stand in for a later one that has no row.
  const goalJoin = { goals: 0, sameMinute: 0, otherMinute: 0, missing: 0, deltaMinutes: {} }
  const usedG = new Set(), pending = []
  const isGoalOf = (s, i, pid) => !usedG.has(i) && s.type === 'goal' && s.player_id === pid
  for (const inc of incs) {
    if (inc.type !== 'goal' || /own/i.test(String(inc.goal_type ?? ''))) continue
    goalJoin.goals++
    const pid = inc.player_id ?? inc.sequence?.find?.(e => e.event === 'goal')?.pid
    const i = shots.findIndex((s, j) => isGoalOf(s, j, pid) && s.min === inc.minute && (s.added ?? null) === (inc.added_time ?? null))
    if (i >= 0) { usedG.add(i); goalJoin.sameMinute++ } else pending.push({ inc, pid })
  }
  for (const { inc, pid } of pending) {
    let best = -1, bd = Infinity
    shots.forEach((s, j) => { if (isGoalOf(s, j, pid)) { const d = Math.abs(s.min - inc.minute); if (d < bd) { bd = d; best = j } } })
    if (best < 0) goalJoin.missing++
    else { usedG.add(best); goalJoin.otherMinute++; goalJoin.deltaMinutes[bd] = (goalJoin.deltaMinutes[bd] ?? 0) + 1 }
  }
  // WHAT AN INTERLEAVED OPPONENT EVENT CAN BE. Between two adjacent shots by
  // one team, the only other record with a minute and a team is an incident.
  const pidSide = new Map()
  for (const s of shots) if (s.player_id != null && typeof s.home === 'boolean') pidSide.set(String(s.player_id), s.home)
  for (const side of ['home', 'away']) for (const p of stats?.average_positions?.[side] ?? []) if (p?.player_id != null) pidSide.set(String(p.player_id), side === 'home')
  const timed = incs.filter(i => !TEAMLESS.has(i.type) && Number.isFinite(i.minute) && typeof i.is_home === 'boolean')
  const timedTypes = [...new Set(timed.map(i => i.type))]
  const ordered = shots.filter(s => Number.isFinite(s.min) && typeof s.home === 'boolean').sort((a, b) => t(a) - t(b))
  let sameTeamPairs = 0, pairsWithOpponentIncident = 0
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1], b = ordered[i]
    if (a.home !== b.home) continue
    sameTeamPairs++
    const ta = t(a), tb = t(b)
    if (timed.some(x => x.is_home !== a.home && (x.minute + (x.added_time ?? 0) / 100) > ta && (x.minute + (x.added_time ?? 0) / 100) < tb)) pairsWithOpponentIncident++
  }
  // incidents[].sequence[] is the only place a `pass` appears. It hangs off
  // goals, so it is counted for what it is: which events, which keys (does any
  // carry a clock?), and whether one build-up ever names both teams.
  const seq = { goalsWithSequence: 0, types: {}, keys: [], bothTeams: 0, sided: 0, unsided: 0 }
  const seqKeys = new Set()
  for (const inc of incs) {
    if (inc.type !== 'goal' || !Array.isArray(inc.sequence) || !inc.sequence.length) continue
    seq.goalsWithSequence++
    const sides = new Set()
    for (const e of inc.sequence) {
      if (e?.event) seq.types[e.event] = (seq.types[e.event] ?? 0) + 1
      for (const k of Object.keys(e ?? {})) seqKeys.add(k)
      const sd = e?.pid != null ? pidSide.get(String(e.pid)) : undefined
      if (sd === undefined) seq.unsided++; else { seq.sided++; sides.add(sd) }
    }
    if (sides.size > 1) seq.bothTeams++
  }
  seq.keys = [...seqKeys].sort()
  // A shot's own `sit` can name a turnover the event list never records: a
  // fast-break shot that follows its own team's shot implies the opponent had
  // the ball in between. Counted, because the narrowing calls that pair "uninterrupted".
  const sits = {}; let fastBreakAfterOwnShot = 0
  for (const x of shots) if (x.sit != null) sits[x.sit] = (sits[x.sit] ?? 0) + 1
  for (let i = 1; i < ordered.length; i++) if (ordered[i].sit === 'fast-break' && ordered[i].home === ordered[i - 1].home) fastBreakAfterOwnShot++
  return { state: 'present', sits, fastBreakAfterOwnShot, xgEstimated: shots.filter(x => x.xg_estimated === true).length, shots: shots.length, withMin, withXg, teams: teams.size, order, desc, asc, eq, tiedShots, mixedTies,
    seqAgree: agree, seqDisagree: disagree, goalJoin, runs: flowRuns(shots),
    interleave: { sameTeamPairs, pairsWithOpponentIncident, timedTypes }, seq }
}

// Event types that would say who had the ball between two shots.
export const POSSESSION_EVENT = /\b(pass|possession|turnover|dispossess|interception|recovery|clearance|tackle|carry|dribble)\b/i

/**
 * The stop condition AS WRITTEN has two disjuncts: shots carry no within-match
 * ordering key, or carry no opponent-event interleaving. The first revision
 * added a third (no possession event type seen) and printed MET from it alone.
 * The possession-level question is real and is answered, under its own name,
 * in `readings`; it does not decide the verdict.
 */
export function verdictFlow(rows) {
  const present = rows.filter(r => r.state === 'present')
  if (present.length === 0) return { met: null, verdict: 'UNMEASURED', reason: `no capture with a shotmap was read (${rows.length} rows); nothing was measured` }
  const keyed = present.filter(r => r.withMin === r.shots).length
  const bothTeams = present.filter(r => r.teams === 2).length
  const oppIncidentPairs = sum(present, r => r.interleave.pairsWithOpponentIncident)
  const disjuncts = { no_ordering_key: keyed < present.length, no_opponent_event_interleaving: bothTeams === 0 && oppIncidentPairs === 0 }
  const met = disjuncts.no_ordering_key || disjuncts.no_opponent_event_interleaving
  const agree = sum(present, r => r.seqAgree), disagree = sum(present, r => r.seqDisagree)
  const orders = {}; for (const r of present) orders[r.order] = (orders[r.order] ?? 0) + 1
  const timedTypes = [...new Set(present.flatMap(r => r.interleave.timedTypes))].sort()
  const seqTypes = {}; for (const r of present) for (const [k, n] of Object.entries(r.seq.types)) seqTypes[k] = (seqTypes[k] ?? 0) + n
  const seqKeys = [...new Set(present.flatMap(r => r.seq.keys))].sort()
  const seqClock = seqKeys.filter(k => TIME_KEY.test(k))
  const possTimed = timedTypes.filter(ty => POSSESSION_EVENT.test(ty))
  const runs = { at_least_under_every_order: sum(present, r => r.runs.minRuns), at_most_under_any_order: sum(present, r => r.runs.maxRuns),
    captures_where_order_changes_the_count: present.filter(r => r.runs.maxRuns > r.runs.minRuns).length,
    mixed_team_buckets: sum(present, r => r.runs.mixedBuckets), captures_over_arrangement_cap: present.filter(r => r.runs.capped).length,
    unknown_side_shots: sum(present, r => r.runs.unknownSide), untimed_shots: sum(present, r => r.runs.untimed), period_breaks: sum(present, r => r.runs.periodBreaks) }
  const sitTotals = {}; for (const r of present) for (const [k, n] of Object.entries(r.sits)) sitTotals[k] = (sitTotals[k] ?? 0) + n
  const gj = present.reduce((o, r) => { for (const k of ['goals', 'sameMinute', 'otherMinute', 'missing']) o[k] += r.goalJoin[k]; for (const [d, n] of Object.entries(r.goalJoin.deltaMinutes)) o.deltaMinutes[d] = (o.deltaMinutes[d] ?? 0) + n; return o }, { goals: 0, sameMinute: 0, otherMinute: 0, missing: 0, deltaMinutes: {} })
  const verdict = met ? 'MET' : 'NOT MET'
  return {
    met, verdict, disjuncts,
    reason: met ? (disjuncts.no_ordering_key ? `shots lack min in ${present.length - keyed}/${present.length} captures` : `no capture shows an opponent event between two shots (both teams' shots in ${bothTeams}/${present.length})`)
      : `every shot carries min (+added) in ${keyed}/${present.length} captures, and the opponent interleaves in ${bothTeams}/${present.length} (its shots) and in ${oppIncidentPairs} same-team shot pairs (a timed incident). What interleaves is SHOTS and timed incidents only (${timedTypes.join(', ')}): no event with a minute and a team says who had the ball. Flow is reconstructible only as the shots-only narrowing docs/TASK0-RESULTS-2026-10-15 proposed: at least ${runs.at_least_under_every_order} runs of 3+ own-team shots under every within-minute order, up to ${runs.at_most_under_any_order} under the most favourable (the order changes the count in ${runs.captures_where_order_changes_the_count} captures).`,
    readings: {
      as_written: verdict,
      possession_level: possTimed.length === 0
        ? `MET: no incident with a minute and a team is a possession event; \`pass\` occurs only inside goal build-ups (incidents[].sequence[], ${sum(present, r => r.seq.goalsWithSequence)} goals), whose elements carry ${seqClock.length ? `clock keys ${seqClock.join(', ')}` : 'no clock key'} and ${sum(present, r => r.seq.bothTeams)} of which name both teams`
        : `NOT MET: timed possession events ${possTimed.join(', ')}`,
      decides: 'as_written. The possession-level reading is recorded because it is the question behind the spec, and it is why the narrowing exists.',
    },
    narrowed_variant: {
      definition: 'three consecutive own-team SHOTS with no opposing SHOT between, never across a period break: the narrowing docs/TASK0-RESULTS-2026-10-15 proposed, which the CC-CMD\'s "Task 0 outcome" cites; Task 1 in the CC-CMD still states the un-narrowed rule, so the narrowing is an owner decision',
      runs,
      own_team_within_minute_order: `array order ${Object.keys(orders).length === 1 ? Object.keys(orders)[0] : JSON.stringify(orders)}; goal build-up sequences agree ${agree}, disagree ${disagree}`,
      cross_team_within_minute_order: `UNORDERED: nothing orders two teams' shots inside one minute (${runs.mixed_team_buckets} mixed-team buckets), so every arrangement is tried and runs are reported as a range`,
      shotmap_minute_vs_goal_incident: gj,
    },
    within_minute_order: { array_order_by_capture: orders, goal_sequence_checks_agree: agree, disagree },
    ties: { tied_shots: sum(present, r => r.tiedShots), mixed_team_tied_minutes: sum(present, r => r.mixedTies), shots: sum(present, r => r.shots) },
    shot_situation: { sit_values: sitTotals, fast_break_shots_following_an_own_team_shot: sum(present, r => r.fastBreakAfterOwnShot), same_team_adjacent_pairs: sum(present, r => r.interleave.sameTeamPairs),
      meaning: 'each such shot implies an opponent possession between two own-team shots that the event list does not record; the shots-only narrowing counts that pair as uninterrupted' },
    xg_coverage: { shots: sum(present, r => r.shots), with_xg: sum(present, r => r.withXg), xg_estimated: sum(present, r => r.xgEstimated) },
    sequence_census: { event_types: seqTypes, element_keys: seqKeys, goals_with_sequence: sum(present, r => r.seq.goalsWithSequence), naming_both_teams: sum(present, r => r.seq.bothTeams), elements_sided: sum(present, r => r.seq.sided), elements_unsided: sum(present, r => r.seq.unsided) },
  }
}

// ── 0.2 Gravity: every coordinate path, classified ─────────────────────────
// A path is ON-BALL if it is a property of one event (a shot origin, a block, a
// keeper at a shot), MATCH-AVERAGE if it is one point per player for the whole
// match, and OFF-BALL-INSTANT if several identified players carry coordinates
// under one time key. Only the last could feed Gravity Well.
//
// The first revision's detector saw only {x:number, y:number}. A coordinate
// sent as a tuple or as numeric strings was invisible to it, so it could not
// block MET: an absence verdict from a detector that cannot see. It now
// reports tuples and string pairs, and the timed multi-player SHAPE whatever
// the path is named.
const num = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
const hasXY = (o) => o != null && typeof o === 'object' && !Array.isArray(o) && num(o.x) && num(o.y)
const ID_KEY = /^(player_?id|pid|nflid|athlete_?id|id)$/i
const idOf = (o) => { for (const k of Object.keys(o)) if (ID_KEY.test(k) && o[k] != null) return String(o[k]); return null }
const timeOf = (o) => { for (const k of Object.keys(o)) if (TIME_KEY.test(k) && o[k] != null) return String(o[k]); return null }

export function coordinatePaths(obj, path = '', out = new Map(), parentTimed = false) {
  if (obj == null || typeof obj !== 'object') return out
  const bump = (p) => out.set(p, (out.get(p) ?? 0) + 1)
  if (Array.isArray(obj)) {
    if (obj.length >= 2 && obj.length <= 3 && obj.every(n => typeof n === 'number')) { bump(`${path}(tuple)`); return out }
    // Several identified points under one time key. Directly ({x,y} on the
    // element) or nested one level ({pos:{x,y}}); a nested array whose
    // elements each carry an ACTION key is a sequence of successive on-ball
    // actions (a goal build-up), not a snapshot of players at one instant.
    const nestedXY = (el) => el && typeof el === 'object' && !Array.isArray(el) && Object.values(el).some(hasXY)
    for (const [pts, nested] of [[obj.filter(hasXY), false], [obj.filter(el => !hasXY(el) && nestedXY(el)), true]]) {
      const ids = new Set(pts.map(idOf).filter(v => v != null))
      if (ids.size < 2) continue
      const t0 = pts.length ? timeOf(pts[0]) : null
      if (!(parentTimed || (t0 != null && pts.every(p => timeOf(p) === t0)))) continue
      const actions = nested && pts.every(el => ['event', 'type', 'action'].some(k => typeof el[k] === 'string'))
      bump(`${path}[](${actions ? 'action-sequence' : 'timed-multi-player'})`)
    }
    for (const el of obj.slice(0, 60)) coordinatePaths(el, path + '[]', out, parentTimed)
    return out
  }
  if (hasXY(obj)) bump(typeof obj.x === 'number' && typeof obj.y === 'number' ? path : `${path}(string-xy)`)
  const timedHere = Object.keys(obj).some(k => TIME_KEY.test(k))
  for (const [k, v] of Object.entries(obj)) coordinatePaths(v, path ? `${path}.${k}` : k, out, timedHere)
  return out
}

export function classifyCoordPath(p) {
  if (/\(timed-multi-player\)$/.test(p)) return 'off-ball-instant'
  if (/\(action-sequence\)$/.test(p)) return 'on-ball (action sequence)'
  if (/\b(frames?|tracking|positions_at|snapshots?)\b/.test(p)) return 'off-ball-instant'
  if (/^average_positions\.(home|away)\[\]$/.test(p) || /^(home|away)\[\]$/.test(p)) return 'match-average'
  if (/^shotmap\[\]\.(pos|gm|block)$/.test(p)) return 'on-ball (shot)'
  if (/^incidents\[\]\.sequence\[\]\.(pos|end|gk|gm)$/.test(p)) return 'on-ball (goal build-up)'
  return 'unclassified'
}

/** In each non-own goal: the scorer, the keeper, and the build-up, side by side. */
export function goalFrameOf(incidents) {
  const out = []
  for (const inc of incidents?.incidents ?? []) {
    if (inc.type !== 'goal' || !Array.isArray(inc.sequence)) continue
    const g = inc.sequence.find(e => e.event === 'goal')
    if (!g?.pos || !g?.gk) continue
    const own = /own/i.test(String(inc.goal_type ?? ''))
    const firstPos = inc.sequence.find(e => e !== g && e?.pos && num(e.pos.x))
    const lastPass = [...inc.sequence].reverse().find(e => e?.event === 'pass' && e?.pos && e?.end)
    out.push({ home: !!inc.is_home, own, sameEnd: Math.abs(g.pos.x - g.gk.x) < 50, shooterHalf: g.pos.x >= 50 ? 'high-x' : 'low-x',
      gkHigh: g.gk.x >= 50, advancedFromFirst: firstPos ? g.pos.x - Number(firstPos.pos.x) : null,
      buildUpX: inc.sequence.filter(e => e !== g && e?.pos && num(e.pos.x)).map(e => Number(e.pos.x)),
      lastPassEndX: lastPass ? Number(lastPass.end.x) : null })
  }
  return out
}

export function verdictGravity(paths, withCoords, population = '') {
  const offBall = paths.filter(p => p.kind === 'off-ball-instant'), unclassified = paths.filter(p => p.kind === 'unclassified')
  const met = withCoords === 0 ? null : offBall.length ? false : unclassified.length ? null : true
  const reason = withCoords === 0 ? 'no capture with any coordinate was read; nothing was measured'
    : offBall.length ? `off-ball-instant paths found: ${offBall.map(p => p.path).join(', ')}`
    : unclassified.length ? `UNCLASSIFIED coordinate paths were not examined: ${unclassified.map(p => p.path).join(', ')}`
    : `every coordinate path found in ${withCoords} captures is on-ball (one event, or a goal build-up whose elements are successive actions) or a match average (one point per player per match); no snapshot of 2+ identified players at one instant, in any shape the detector reads (direct or nested {x,y}, numeric strings, number tuples)${population ? `. POPULATION: ${population}` : ''}`
  return { met, reason }
}

/** Which frame goal build-ups are in, from the counts, against the contract's claim. */
export function frameReading({ hs, hHigh, as, aLow, declared }) {
  if (hs < 5 || as < 5) return { shared: null, reading: `unmeasured: needs >= 5 non-own goals per side (home ${hs}, away ${as})` }
  const shared = hHigh / hs >= 0.9 && aLow / as >= 0.9
  const targetRel = hHigh / hs <= 0.1 && aLow / as >= 0.9   // both sides near x=0
  if (shared) return { shared: true, reading: `ONE SHARED frame, home attacks high x (home ${hHigh}/${hs} high-x, away ${aLow}/${as} low-x)` + (declared === 'target-goal-relative' ? '; CONTRADICTS /bsd/contract, which declares target-goal-relative (under that frame BOTH sides would score near x=0).' : '') }
  if (targetRel) return { shared: false, reading: `target-goal-relative, as /bsd/contract declares (home ${hHigh}/${hs} high-x, away ${aLow}/${as} low-x)` }
  return { shared: false, reading: `no single frame fits (home ${hHigh}/${hs} high-x, away ${aLow}/${as} low-x)` }
}

// ── 0.3 Second Wind: the interval join, over every timed play ──────────────
const BOUNDARY = new Set(['period-start', 'period-end', 'game-end', 'shootout-complete'])
export const elapsedOf = (period, mmss) => {
  const m = /^(\d{1,3}):(\d{2})$/.exec(String(mmss ?? ''))
  return Number.isFinite(period) && m ? (period - 1) * 1200 + Number(m[1]) * 60 + Number(m[2]) : null
}

// The player a play is ABOUT, in priority order. A 'resolved' on-ice set is a
// body COUNT that agrees with situationCode; it is only an identity when the
// play's own actor is in it. At a goal the scorer's shift ends on the goal
// second and the end is exclusive, so the count can match with the scorer
// already gone. So the verdict is taken over plays that NAME a player.
export const ACTOR_KEYS = ['scoringPlayerId', 'shootingPlayerId', 'hittingPlayerId', 'blockingPlayerId', 'winningPlayerId', 'committedByPlayerId', 'playerId']
export const actorOf = (p) => { for (const k of ACTOR_KEYS) if (p?.details?.[k] != null) return String(p.details[k]); return null }
const newActor = () => ({ bearing: 0, confirmed: 0, resolvedActorAbsent: 0, notResolved: 0 })

/** Tally onIceAt's four states over a game's plays. `onIceAt` is injected. */
export function joinTally(onIceAt, pbp, shifts) {
  const home = pbp?.homeTeam?.id
  const tally = { all: {}, events: {}, byType: {}, actor: newActor(), actorByType: {}, actorByPeriod: {}, notResolvedByState: {}, shootoutExcluded: 0, actorless: 0, excludedFromControl: 0, actorAtPeriodEnd: 0 }
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
  for (const p of pbp?.plays ?? []) {
    const period = p.periodDescriptor?.number
    if (period >= 5 && pbp?.gameType !== 3) { tally.shootoutExcluded++; continue }   // regular-season shootout: no shifts by design
    const el = elapsedOf(period, p.timeInPeriod)
    const r = onIceAt({ shifts, period, elapsedSeconds: el, homeTeamId: home, situationCode: p.situationCode ?? null })
    if (r.state === 'excluded-from-control') { tally.excludedFromControl++; continue }   // out of the control's denominator, counted
    bump(tally.all, r.state)
    if (BOUNDARY.has(p.typeDescKey)) continue
    bump(tally.events, r.state)
    const bt = tally.byType[p.typeDescKey] ??= {}; bump(bt, r.state)
    const actor = actorOf(p)
    if (actor === null) { tally.actorless++; continue }
    if (p.timeInPeriod === '20:00' && period <= 3) tally.actorAtPeriodEnd++   // onIceAt has no period filter: this second can read the next period's line
    const buckets = [tally.actor, tally.actorByType[p.typeDescKey] ??= newActor(), tally.actorByPeriod[period >= 4 ? 'OT' : String(period)] ??= newActor()]
    for (const b of buckets) b.bearing++
    if (r.state !== 'resolved') { for (const b of buckets) b.notResolved++; bump(tally.notResolvedByState, r.state); continue }
    const on = new Set([...(r.home ?? []), ...(r.away ?? [])].map(String))
    const k = on.has(actor) ? 'confirmed' : 'resolvedActorAbsent'
    for (const b of buckets) b[k]++
  }
  return tally
}

/**
 * The same join with its clock moved 600 s inside the same period: the shift
 * charts and plays are real, only their alignment is broken. Whatever share
 * this still "confirms" is the actor test's chance rate, and 94% means nothing
 * unless it sits far above it. Overtime (300 s) is excluded rather than wrapped.
 */
export const decorrelated = (onIceAt) => (a) => {
  if (!Number.isFinite(a.elapsedSeconds) || !(a.period >= 1 && a.period <= 3)) return { state: 'excluded-from-control' }
  const base = (a.period - 1) * 1200
  return onIceAt({ ...a, elapsedSeconds: base + ((a.elapsedSeconds - base + 600) % 1200) })
}

/** "Cannot resolve a majority": a share at or under one half is MET. Needs its chance rate. */
export function verdictSecondWind(actor, control) {
  if (!actor || actor.bearing === 0) return { met: null, share: null, controlShare: null, reason: 'no actor-bearing play was joined; nothing was measured' }
  const share = actor.confirmed / actor.bearing
  const controlShare = control?.bearing ? control.confirmed / control.bearing : null
  // At or under one half is MET whatever the chance rate: the control exists to
  // stop a MAJORITY being credited when chance could explain it.
  if (share <= 0.5) return { met: true, share, controlShare, reason: `${actor.confirmed} of ${actor.bearing} plays that name a player resolve to an on-ice set CONTAINING that player (${pct(actor.confirmed, actor.bearing)}): not a majority` }
  if (controlShare === null) return { met: null, share, controlShare, reason: 'no decorrelated control was run, so the share cannot be told from chance' }
  if (controlShare > 0.5) return { met: null, share, controlShare, reason: `the decorrelated control still confirms ${pct(control?.confirmed, control?.bearing)}, so a majority here proves nothing` }
  return { met: false, share, controlShare,
    reason: `${actor.confirmed} of ${actor.bearing} plays that name a player resolve to an on-ice set CONTAINING that player (${pct(actor.confirmed, actor.bearing)}); with the clock moved 600 s the same test confirms ${pct(control?.confirmed, control?.bearing)}, so the join resolves a majority, and not by chance` }
}

/** Sum of shift durations per player, against the boxscore's toi. */
export function toiCheck(shifts, box) {
  const secs = (mmss) => { const m = /^(\d{1,3}):(\d{2})$/.exec(String(mmss ?? '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
  const sumBy = new Map()
  for (const s of shifts ?? []) {
    const a = secs(s.startTime), b = secs(s.endTime)
    if (a === null || b === null || b < a) continue
    sumBy.set(String(s.playerId), (sumBy.get(String(s.playerId)) ?? 0) + (b - a))
  }
  const players = []; let dressedNotPlayed = 0
  for (const side of ['homeTeam', 'awayTeam']) for (const grp of ['forwards', 'defense', 'goalies']) {
    for (const p of box?.playerByGameStats?.[side]?.[grp] ?? []) {
      const official = secs(p.toi); const got = sumBy.get(String(p.playerId))
      // A dressed player who never took the ice (backup goalie: toi "00:00")
      // has no shift row, and that is agreement, not a player the shift charts dropped.
      if (official === 0 && got === undefined) { dressedNotPlayed++; continue }
      players.push({ id: p.playerId, official, fromShifts: got ?? null, delta: official != null && got != null ? got - official : null })
    }
  }
  if (players.length === 0) return { state: 'unreadable', players: 0, dressedNotPlayed }
  const within5 = players.filter(p => p.delta !== null && Math.abs(p.delta) <= 5).length
  const missingFromShifts = players.filter(p => p.fromShifts === null && (p.official ?? 0) > 0).length
  const worst = [...players].filter(p => p.delta !== null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3)
  return { state: 'present', players: players.length, within5s: within5, missingFromShifts, dressedNotPlayed, worst }
}

// ── 0.4 Tactical Lock: per-minute xG, and is momentum a territory proxy? ────
export function lockOf(stats, incidents) {
  const xpm = Array.isArray(stats?.xg_per_minute) ? stats.xg_per_minute : null
  const mom = Array.isArray(stats?.momentum) ? stats.momentum : null
  const out = {
    xgPerMinute: xpm ? (xpm.length ? 'present' : 'empty') : 'absent',
    momentum: mom ? (mom.length ? 'present' : 'empty') : 'absent',
  }
  const shotmap = stats?.shotmap ?? []
  if (xpm?.length) {
    const ms = xpm.map(r => r.m).filter(Number.isFinite)
    out.xpm = { rows: xpm.length, mMin: Math.min(...ms), mMax: Math.max(...ms), dupMinutes: ms.length - new Set(ms).size,
      hasCumAway: xpm.every(r => typeof r.cum_away === 'number'), hasCumHome: xpm.every(r => typeof r.cum_home === 'number') }
    // ADDED TIME: does a shot at 45+N / 90+N fold into row m=45 / m=90?
    const addedShots = shotmap.filter(s => (s.min === 45 || s.min === 90) && (s.added ?? 0) > 0 && typeof s.xg === 'number')
    out.xpm.addedTimeShots = addedShots.length
    out.xpm.maxAdded = Math.max(0, ...shotmap.map(s => s.added ?? 0))
    // Reconcile in BOTH directions, over non-trivial comparisons only.
    let match = 0, miss = 0, missingRow = 0
    const byMin = new Map()
    for (const s of shotmap) if (typeof s.xg === 'number' && Number.isFinite(s.min)) {
      const k = `${s.min}|${s.home ? 'h' : 'a'}`; byMin.set(k, (byMin.get(k) ?? 0) + s.xg)
    }
    const rowByM = new Map(xpm.map(r => [r.m, r]))
    for (const [k, want] of byMin) {
      const [m, side] = k.split('|'); const r = rowByM.get(Number(m))
      if (!r) { missingRow++; continue }
      const got = side === 'h' ? r.xg_home : r.xg_away
      if (typeof got === 'number' && Math.abs(want - got) < 0.002) match++; else miss++
    }
    for (const r of xpm) for (const side of ['h', 'a']) {
      const got = side === 'h' ? r.xg_home : r.xg_away
      if (typeof got === 'number' && got > 0 && !byMin.has(`${r.m}|${side}`)) miss++   // xG with no shot behind it
    }
    out.xpm.reconcileMatch = match; out.xpm.reconcileMiss = miss; out.xpm.shotMinuteWithoutRow = missingRow
    out.xpm.addedFoldsIntoRow = addedShots.length === 0 ? null : addedShots.every(s => rowByM.has(s.min))
    // xg_per_minute has a row only where someone shot: its density is measured, not assumed.
    out.xpm.density = +(ms.length / (Math.max(...ms) - Math.min(...ms) + 1)).toFixed(3)
  }
  if (mom?.length) {
    const ms = mom.map(r => r.m).filter(Number.isFinite)
    const vs = mom.map(r => r.v).filter(Number.isFinite)
    const ints = ms.filter(m => Number.isInteger(m))
    const top = Math.min(Math.max(...ints), 90), bottom = Math.min(...ints)
    let missing = 0; const have = new Set(ints); for (let m = bottom; m <= top; m++) if (!have.has(m)) missing++
    out.mom = { rows: mom.length, mMin: Math.min(...ms), mMax: Math.max(...ms), vMin: Math.min(...vs), vMax: Math.max(...vs),
      fractionalRows: ms.filter(m => !Number.isInteger(m)).length, fractionalValues: [...new Set(ms.filter(m => !Number.isInteger(m)))].sort((a, b) => a - b),
      dupMinutes: ms.length - new Set(ms).size, missingIntegerMinutes: missing }
    // SIGN, four ways: in a minute where only one team shot, does momentum's
    // sign point at that team? Split by direction, because a pooled share can
    // hide one direction carrying the other.
    const momMs = new Set(ms)
    const keyOf = (s) => ((s.added ?? 0) > 0 && momMs.has(s.min + 0.5)) ? s.min + 0.5 : s.min
    const shotsBy = new Map()
    for (const s of shotmap) if (Number.isFinite(s.min)) {
      const k = keyOf(s); const e = shotsBy.get(k) ?? { h: 0, a: 0 }; s.home ? e.h++ : e.a++; shotsBy.set(k, e)
    }
    const sign = { homeOnlyPos: 0, homeOnlyNeg: 0, awayOnlyNeg: 0, awayOnlyPos: 0 }
    for (const r of mom) {
      const e = shotsBy.get(r.m); if (!e || !Number.isFinite(r.v) || r.v === 0) continue
      if (e.h > 0 && e.a === 0) r.v > 0 ? sign.homeOnlyPos++ : sign.homeOnlyNeg++
      if (e.a > 0 && e.h === 0) r.v < 0 ? sign.awayOnlyNeg++ : sign.awayOnlyPos++
    }
    out.mom.sign = sign
    out.mom.signAgreesHomePositive = sign.homeOnlyPos + sign.awayOnlyNeg
    out.mom.signDisagrees = sign.homeOnlyNeg + sign.awayOnlyPos
    // LAG: does momentum LEAD shots (pressure building) or only FOLLOW them (an
    // echo)? Shot at minute s keyed to momentum row s + k, integer rows only.
    const vAt = new Map(mom.filter(r => Number.isInteger(r.m) && Number.isFinite(r.v)).map(r => [r.m, r.v]))
    out.mom.lag = {}
    for (const k of [-3, -2, -1, 0, 1, 2, 3]) {
      let a = 0, d = 0
      for (const [m, e] of shotsBy) {
        if (!Number.isInteger(m) || (e.h > 0) === (e.a > 0)) continue
        const v = vAt.get(m + k); if (!v) continue
        ;(e.h > 0) === (v > 0) ? a++ : d++
      }
      out.mom.lag[k] = { agree: a, against: d }
    }
    // The raw series the pooled territory test needs: integer minutes only,
    // shots at their base minute, sides as 'h' / 'a'.
    out.series = { v: [...vAt], shots: shotmap.filter(s => Number.isFinite(s.min) && typeof s.home === 'boolean').map(s => [s.min, s.home ? 'h' : 'a']),
      xgDiff: (xpm ?? []).filter(r => Number.isInteger(r.m) && vAt.has(r.m)).map(r => [(r.xg_home ?? 0) - (r.xg_away ?? 0), vAt.get(r.m)]) }
  }
  // TERRITORY AT HALF GRAIN. The spec's own named denominators (final-third
  // entries, possession share) are in the payload only per half. Momentum's
  // half mean is set beside them, with the half's shot and xG difference, so
  // the pooled test can ask whether momentum tracks territory beyond shots.
  const halfStats = (h) => stats?.stats?.[h === 1 ? 'first_half' : 'second_half']
  const numOf = (v) => (typeof v === 'number' ? v : typeof v?.value === 'number' ? v.value : null)
  out.halves = []
  if (mom?.length) for (const h of [1, 2]) {
    const inHalf = (m) => (h === 1 ? m >= 1 && m <= 45 : m >= 46 && m <= 90)
    const vs = mom.filter(r => Number.isInteger(r.m) && inHalf(r.m) && Number.isFinite(r.v)).map(r => r.v)
    const hs = shotmap.filter(x => Number.isFinite(x.min) && inHalf(x.min) && typeof x.home === 'boolean')
    const st = halfStats(h)
    const fte = [numOf(st?.home?.final_third_entries), numOf(st?.away?.final_third_entries)]
    const pos = [numOf(st?.home?.ball_possession), numOf(st?.away?.ball_possession)]
    if (vs.length < 10) continue
    out.halves.push({ momMean: vs.reduce((a, b) => a + b, 0) / vs.length,
      shotDiff: hs.filter(x => x.home).length - hs.filter(x => !x.home).length,
      xgDiff: hs.reduce((a, x) => a + (typeof x.xg === 'number' ? (x.home ? x.xg : -x.xg) : 0), 0),
      fteDiff: fte.every(v => v !== null) ? fte[0] - fte[1] : null, possDiff: pos.every(v => v !== null) ? pos[0] - pos[1] : null })
  }
  // ACTIVE PLAY. Which minutes hold a stoppage-type incident, and does any
  // incident carry a clock finer than the minute?
  const STOP = new Set(['goal', 'card', 'substitution', 'varDecision', 'injuryTime'])
  const stopMinutes = new Set((incidents?.incidents ?? []).filter(i => STOP.has(i.type) && Number.isFinite(i.minute)).map(i => i.minute))
  let windows = 0, withStop = 0
  for (let m = 4; m <= 90; m++) {
    if (m - 3 <= 45 && m > 45) continue                     // a window stays inside one half
    windows++
    if ([0, 1, 2, 3].some(k => stopMinutes.has(m - k))) withStop++
  }
  out.activePlay = { windows, withStoppageIncident: withStop }
  const ht = (incidents?.incidents ?? []).find(i => i.type === 'period' && /^HT$/i.test(String(i.text ?? '')))
  out.halfTimeMarked = !!ht
  return out
}

/**
 * IS MOMENTUM A TERRITORY PROXY, OR AN ECHO OF THE SHOTS? The stop condition
 * says what a proxy is for: without one, Tactical Lock "reduces to 'the
 * opponent did not shoot'". So the question is whether momentum moves for
 * reasons other than shots, and the place to look is where nobody shoots.
 *
 * A QUIET STRETCH is a run of minutes m with no shot by either team in m-3..m
 * (same half). Inside one, a series computed from the shots alone has no new
 * input, and two of its shapes are then provably constrained:
 *   (a) any mix of up to two decay rates plus a constant (a fast echo, an
 *       EWMA, a cumulative difference, or a sum of those) changes direction
 *       at most ONCE per stretch. Reversals beyond the first are EXCESS, and
 *       such an echo has none.
 *   (0) a cumulative count does not move at all; a series that barely moves
 *       where nobody shoots carries nothing there (`moving_share` under 10%).
 *   (b) a fixed shot-window count changes only when a shot leaves the window,
 *       so every change sits at one shot AGE. `best_age_share` is the largest
 *       share of in-stretch changes explained by a single age; such an echo
 *       scores 1.0.
 * A series fed by something other than shots does neither. Neither test uses
 * momentum's SIGN, so an inverted capture cannot flip it.
 *
 * The first two versions of this test both failed under review: v1 checked
 * only that the sign agreed with shots (an echo passes), v2 measured distance
 * from the favoured team's last shot (a slow echo passed, a busy territory
 * index failed, an inverted subset flipped it). Each failure is a fixture below.
 */
export const TERRITORY_MIN_STRETCHES = 30     // quiet stretches of 3+ transitions
export const TERRITORY_MIN_CHANGES = 30       // in-stretch minutes where v moved
export const TERRITORY_MIN_MOVING = 0.10      // share of in-stretch minutes where v moved at all
export const TERRITORY_MIN_EXCESS = 0.02      // excess reversals per possible one: an echo of <= 2 decay rates scores exactly 0
export const TERRITORY_MAX_AGE_SHARE = 0.6    // changes explained by one shot age

export function territoryTest(seriesList) {
  const half = (m) => (m <= 45 ? 1 : 2)
  let stretches = 0, eligible = 0, transitions = 0, eligibleTransitions = 0, excess = 0, possible = 0, changes = 0, flatTransitions = 0
  const ageHits = {}
  const shotAbs = [], freeAbs = []
  for (const S of seriesList) {
    if (!S?.v?.length) continue
    const vAt = new Map(S.v)
    const shotMins = S.shots.map(x => x[0])
    const any = new Set(shotMins)
    const quiet = (m) => vAt.has(m) && vAt.has(m - 1) && [0, 1, 2, 3].every(k => m - k >= 1 && half(m - k) === half(m) && !any.has(m - k))
    for (const [m, v] of S.v) { if (any.has(m)) shotAbs.push(Math.abs(v)); else if (quiet(m)) freeAbs.push(Math.abs(v)) }
    const ms = [...vAt.keys()].sort((a, b) => a - b)
    let run = []
    const close = () => {
      if (run.length) {
        stretches++; transitions += run.length
        const ds = run.map(m => vAt.get(m) - vAt.get(m - 1))
        flatTransitions += ds.filter(d => d === 0).length
        if (run.length >= 3) {
          eligible++; eligibleTransitions += run.length
          const signs = ds.filter(d => d !== 0).map(Math.sign)
          let rev = 0; for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) rev++
          excess += Math.max(0, rev - 1); possible += run.length - 2
          run.forEach((m, i) => {
            if (ds[i] === 0) return
            changes++
            const ages = new Set(shotMins.filter(sm => half(sm) === half(m) && m - sm >= 4 && m - sm <= 30).map(sm => m - sm))
            for (const a of ages) ageHits[a] = (ageHits[a] ?? 0) + 1
          })
        }
      }
      run = []
    }
    for (const m of ms) { if (quiet(m) && (run.length === 0 || run[run.length - 1] === m - 1)) run.push(m); else { close(); if (quiet(m)) run.push(m) } }
    close()
  }
  const [bestAge, bestHits] = Object.entries(ageHits).sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const xs = seriesList.flatMap(S => S?.xgDiff ?? [])
  const r = (() => { const n = xs.length; if (n < 3) return null; const mx = xs.reduce((q, p) => q + p[0], 0) / n, my = xs.reduce((q, p) => q + p[1], 0) / n
    let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of xs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2 }
    return sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null })()
  return {
    quiet_stretches: stretches, stretches_of_3_plus: eligible, quiet_transitions: transitions, flat_transitions: flatTransitions,
    excess_reversals: excess, possible_excess: possible, excess_rate: possible ? +(excess / possible).toFixed(3) : null,
    transitions_in_stretches_of_3_plus: eligibleTransitions, changes_in_stretches: changes,
    moving_share: eligibleTransitions ? +(changes / eligibleTransitions).toFixed(3) : null, best_single_shot_age: bestAge === null ? null : Number(bestAge), best_age_share: changes ? +(bestHits / changes).toFixed(3) : null,
    definition: 'quiet = no shot by either team in m-3..m, same half; excess = direction changes of v beyond the first per stretch of 3+ transitions; age share = in-stretch changes with a shot exactly that many minutes earlier, best single age 4..30',
    shot_minutes: { n: shotAbs.length, median_abs_v: median(shotAbs) }, quiet_minutes: { n: freeAbs.length, median_abs_v: median(freeAbs) },
    pearson_v_vs_xg_diff_in_shot_minutes: r, xg_pairs: xs.length,
  }
}

/**
 * NOT AN ECHO IS NOT YET TERRITORY. A series that is shots plus noise also
 * moves where nobody shoots, so the quiet-stretch tests above can only rule an
 * echo IN, never territory in. The payload carries the spec's own named
 * territory measures at half grain (final-third entries, possession share), so
 * momentum's half mean is regressed on them with the half's shot and xG
 * difference partialled out. Momentum is a territory proxy only if it still
 * tracks one of them once shots are accounted for.
 */
export const TERRITORY_MIN_HALVES = 100
export const TERRITORY_MIN_PARTIAL_R = 0.2
export const TERRITORY_MIN_T = 3

/** Residuals of y after an OLS fit on intercept + the given columns. */
function residuals(y, cols) {
  const n = y.length, X = y.map((_, i) => [1, ...cols.map(c => c[i])]), k = X[0].length
  const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((q, r) => q + r[a] * r[b], 0)))
  const v = Array.from({ length: k }, (_, a) => X.reduce((q, r, i) => q + r[a] * y[i], 0))
  for (let i = 0; i < k; i++) {                                   // Gauss-Jordan, tiny k
    let piv = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r
    ;[A[i], A[piv]] = [A[piv], A[i]]; [v[i], v[piv]] = [v[piv], v[i]]
    if (Math.abs(A[i][i]) < 1e-12) return null
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = 0; c < k; c++) A[r][c] -= f * A[i][c]; v[r] -= f * v[i] }
  }
  const beta = v.map((x, i) => x / A[i][i])
  return y.map((yi, i) => yi - X[i].reduce((q, xv, j) => q + xv * beta[j], 0))
}
const corr = (a, b) => { const n = a.length; if (n < 3) return null; const ma = a.reduce((q, x) => q + x, 0) / n, mb = b.reduce((q, x) => q + x, 0) / n
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2 }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null }

export function territoryValidation(halves, positiveIsHome = true) {
  const out = { halves: halves.length, definition: 'per half: momentum mean (home-positive) against the home-minus-away difference in final-third entries and in possession, each with the half\'s shot and xG difference partialled out' }
  for (const [name, key] of [['final_third_entries', 'fteDiff'], ['ball_possession', 'possDiff']]) {
    const hs = halves.filter(h => h[key] !== null && Number.isFinite(h[key]))
    const m = hs.map(h => (positiveIsHome ? 1 : -1) * h.momMean), y = hs.map(h => h[key])
    // Shots and xG together; if they are collinear the fit is singular, and
    // shots alone are used instead (named in the output) rather than no answer.
    let ctrl = [hs.map(h => h.shotDiff), hs.map(h => h.xgDiff)], used = 'shots and xG'
    let rm = hs.length >= 5 ? residuals(m, ctrl) : null, ry = hs.length >= 5 ? residuals(y, ctrl) : null
    if (hs.length >= 5 && (!rm || !ry)) { ctrl = [ctrl[0]]; used = 'shots only (xG collinear)'; rm = residuals(m, ctrl); ry = residuals(y, ctrl) }
    const pr = rm && ry ? corr(rm, ry) : null
    const df = hs.length - 2 - ctrl.length
    const tStat = pr !== null && df > 0 && Math.abs(pr) < 1 ? pr * Math.sqrt(df / (1 - pr * pr)) : null
    out[name] = { n: hs.length, raw_r: corr(m, y) === null ? null : +corr(m, y).toFixed(3), partial_r_given_shots_and_xg: pr === null ? null : +pr.toFixed(3),
      t: tStat === null ? null : +tStat.toFixed(2), partialled_out: used, shots_vs_measure_r: corr(ctrl[0], y) === null ? null : +corr(ctrl[0], y).toFixed(3) }
  }
  const pass = (o) => o.n >= TERRITORY_MIN_HALVES && o.partial_r_given_shots_and_xg !== null && o.partial_r_given_shots_and_xg >= TERRITORY_MIN_PARTIAL_R && o.t >= TERRITORY_MIN_T
  const enough = [out.final_third_entries, out.ball_possession].some(o => o.n >= TERRITORY_MIN_HALVES && o.partial_r_given_shots_and_xg !== null)
  out.tracks = enough ? [['final_third_entries', out.final_third_entries], ['ball_possession', out.ball_possession]].filter(([, o]) => pass(o)).map(([k]) => k) : null
  return out
}

// A territory proxy is only a denominator once its DIRECTION is known.
export const SIGN_MIN_MINUTES = 30
export const SIGN_MIN_SHARE = 0.6

export function verdictLock(rows, territory = null, signByComp = {}, validation = null) {
  const n = rows.length
  if (n === 0) return { met: null, verdict: 'UNMEASURED', reason: 'no capture was read; nothing was measured' }
  const mom = rows.filter(r => r.momentum === 'present').length
  const xpm = rows.filter(r => r.xgPerMinute === 'present').length
  const signAgree = sum(rows, r => r.mom?.signAgreesHomePositive), signDis = sum(rows, r => r.mom?.signDisagrees)
  const signN = signAgree + signDis
  const share = signN ? Math.max(signAgree, signDis) / signN : 0
  const established = signN >= SIGN_MIN_MINUTES && share >= SIGN_MIN_SHARE
  const direction = !established ? 'UNPROVEN' : signAgree >= signDis ? 'positive = home on top' : 'positive = away on top'
  const pooledHome = signAgree >= signDis
  const compsAgainst = Object.entries(signByComp).filter(([, o]) => { const a = o.homeOnlyPos + o.awayOnlyNeg, d = o.homeOnlyNeg + o.awayOnlyPos; return a + d >= SIGN_MIN_MINUTES && (a >= d) !== pooledHome }).map(([c]) => c)
  const T = territory ?? {}
  const stretchesOk = (T.stretches_of_3_plus ?? 0) >= TERRITORY_MIN_STRETCHES
  const staticEcho = stretchesOk && T.moving_share < TERRITORY_MIN_MOVING
  const enough = stretchesOk && (staticEcho || (T.changes_in_stretches ?? 0) >= TERRITORY_MIN_CHANGES)
  const smoothEcho = enough && !staticEcho && T.excess_rate < TERRITORY_MIN_EXCESS
  const windowEcho = enough && !staticEcho && T.best_age_share > TERRITORY_MAX_AGE_SHARE
  let met, reason
  if (mom === 0) { met = true; reason = 'no per-minute territory proxy (momentum) in any capture: Tactical Lock would reduce to "the opponent did not shoot"' }
  else if (!enough) { met = null; reason = `only ${T.stretches_of_3_plus ?? 0} shot-free stretches of 3+ minutes and ${T.changes_in_stretches ?? 0} momentum changes inside them (need ${TERRITORY_MIN_STRETCHES} and ${TERRITORY_MIN_CHANGES}): too little quiet play to tell territory from an echo of the shots` }
  else if (staticEcho) { met = true; reason = `momentum does not move where nobody shoots: it changes in ${T.changes_in_stretches} of ${T.transitions_in_stretches_of_3_plus} minutes of ${T.stretches_of_3_plus} shot-free stretches (${pct(T.changes_in_stretches, T.transitions_in_stretches_of_3_plus)}), as a running count of shots would. So Tactical Lock reduces to "the opponent did not shoot"` }
  else if (smoothEcho || windowEcho) { met = true; reason = `momentum behaves like an ECHO of the shots where nobody shoots: ${smoothEcho ? `excess direction changes ${T.excess_reversals}/${T.possible_excess} (${pct(T.excess_reversals, T.possible_excess)}), which a decaying or cumulative function of shots also gives` : ''}${smoothEcho && windowEcho ? '; and ' : ''}${windowEcho ? `${pct(T.best_age_share * 100, 100)} of its changes sit exactly ${T.best_single_shot_age} minutes after a shot, as a shot-window count's would` : ''}. So Tactical Lock reduces to "the opponent did not shoot"` }
  else if (!established) { met = null; reason = `momentum moves on its own where nobody shoots (excess direction changes ${pct(T.excess_reversals, T.possible_excess)}, best single shot age explains ${pct(T.best_age_share * 100, 100)} of changes) but its DIRECTION is not established (${signAgree} vs ${signDis} over ${signN} one-team minutes)` }
  else if (!validation || validation.tracks === null) { met = null; reason = `momentum is not an echo of the shots, but whether it measures TERRITORY is untested: fewer than ${TERRITORY_MIN_HALVES} halves carry the payload's own final-third or possession figures (${validation?.halves ?? 0} halves read)` }
  else if ((validation.tracks ?? []).length === 0) { met = true; reason = `momentum is not an echo of the shots, but it does not track territory either: with each half's shot and xG difference partialled out, its half mean against final-third entries gives r = ${validation.final_third_entries.partial_r_given_shots_and_xg} (t ${validation.final_third_entries.t}, ${validation.final_third_entries.n} halves) and against possession r = ${validation.ball_possession.partial_r_given_shots_and_xg} (t ${validation.ball_possession.t}). The payload's territory measures exist only per half, so at window grain Tactical Lock reduces to "the opponent did not shoot"` }
  else { met = false; const vt = (k) => `${k.replace(/_/g, ' ')} r = ${validation[k].partial_r_given_shots_and_xg} (t ${validation[k].t}, ${validation[k].n} halves)`
    reason = `momentum is a per-minute territory proxy: it is not an echo of the shots (in ${T.stretches_of_3_plus} shot-free stretches, excess direction changes ${T.excess_reversals}/${T.possible_excess}, ${pct(T.excess_reversals, T.possible_excess)}; best single shot age ${pct(T.best_age_share * 100, 100)}), and with each half's shot and xG difference partialled out its half mean still tracks the payload's own territory measures: ${validation.tracks.map(vt).join('; ')}. Direction ${direction} (${Math.max(signAgree, signDis)}/${signN} one-team shot minutes)${compsAgainst.length ? `, EXCEPT ${compsAgainst.join(', ')}, whose own minutes point the other way` : ''}. Present in ${mom}/${n} captures (xg_per_minute ${xpm}/${n})` }
  return {
    met, verdict: met === true ? 'MET' : met === false ? 'NOT MET' : 'UNMEASURED', reason,
    thresholds: { sign: `>= ${SIGN_MIN_MINUTES} one-team minutes at >= ${100 * SIGN_MIN_SHARE}%`,
      territory: `>= ${TERRITORY_MIN_STRETCHES} quiet stretches of 3+; echo if it moves in < ${100 * TERRITORY_MIN_MOVING}% of their minutes, or (with >= ${TERRITORY_MIN_CHANGES} changes) its excess-reversal rate is < ${TERRITORY_MIN_EXCESS}, or one shot age explains > ${100 * TERRITORY_MAX_AGE_SHARE}% of its changes`,
      validation: `>= ${TERRITORY_MIN_HALVES} halves; partial r >= ${TERRITORY_MIN_PARTIAL_R} with t >= ${TERRITORY_MIN_T} against final-third entries or possession`,
      origin: 'this probe\'s bars, not the spec\'s; the counts are printed so a reader can apply another' },
    territory, territory_validation: validation,
    momentum_sign: { agree_if_positive_is_home: signAgree, against: signDis, minutes: signN, direction, competitions_pointing_the_other_way: compsAgainst,
      by_direction: rows.reduce((o, r) => { for (const [k, v] of Object.entries(r.mom?.sign ?? {})) o[k] = (o[k] ?? 0) + v; return o }, {}) },
    lag_profile: rows.reduce((o, r) => { for (const [k, v] of Object.entries(r.mom?.lag ?? {})) { const e = o[k] ??= { agree: 0, against: 0 }; e.agree += v.agree; e.against += v.against } return o }, {}),
    half_time_marked: rows.filter(r => r.halfTimeMarked).length,
    added_time: { shots_in_45plus_or_90plus: sum(rows, r => r.xpm?.addedTimeShots), captures_where_they_fold_into_the_45_or_90_row: rows.filter(r => r.xpm?.addedFoldsIntoRow === true).length,
      captures_with_fractional_momentum_rows: rows.filter(r => (r.mom?.fractionalRows ?? 0) > 0).length, max_added_minutes_seen: Math.max(0, ...rows.map(r => r.xpm?.maxAdded ?? 0)),
      consequence: 'xg_per_minute folds 45+N into m=45 and 90+N into m=90, and momentum has ONE row (45.5, 90.5) for the whole added period. A 4-minute window has to take its xG from the shotmap\'s (min, added); inside added time there is no per-minute territory figure at all.' },
    alignment: 'momentum agrees with the shooting team most at the row ONE minute after the shot (see lag_profile k=+1): a window pairing per-minute xG with momentum should read momentum one row later',
    reconcile_shotmap_vs_xg_per_minute: { match: sum(rows, r => r.xpm?.reconcileMatch), miss: sum(rows, r => r.xpm?.reconcileMiss), shot_minute_without_row: sum(rows, r => r.xpm?.shotMinuteWithoutRow) },
  }
}

/** Keys matching `re` anywhere in an object, with the paths they sit at. */
export function keyCensus(obj, re, path = '', out = new Set(), depth = 0, opts = { slice: 5, depth: 6 }) {
  if (obj == null || typeof obj !== 'object' || depth > opts.depth) return out
  if (Array.isArray(obj)) { for (const el of obj.slice(0, opts.slice)) keyCensus(el, re, path + '[]', out, depth + 1, opts); return out }
  for (const [k, v] of Object.entries(obj)) { const p = path ? `${path}.${k}` : k; if (re.test(k)) out.add(p); keyCensus(v, re, p, out, depth + 1, opts) }
  return out
}

// ── self-test ──────────────────────────────────────────────────────────────
async function selfTest() {
  let fail = 0
  const ok = (name, c) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${name}`); if (!c) fail++ }
  ok('empty envelope is empty, not present', classify({ ok: true, json: {}, contentful: false }) === 'empty')
  ok('a thrown fetch is unreachable', classify({ threw: true }) === 'unreachable')
  const pooled = await pool([3, 1, 2], 2, async (x) => x * 10)
  ok('pool keeps input order', JSON.stringify(pooled) === '[30,10,20]')

  // Census: a truncated page is split, pruned at the last key, and nothing is lost.
  const store = []
  for (let i = 0; i < 260; i++) for (const f of ['incidents.json', 'stats.json']) store.push({ key: `bsd/x/${213600 + i * 7}/${f}`, uploaded: '2026-10-01' })
  store.sort((a, b) => (a.key < b.key ? -1 : 1))
  const listOf = (st) => async (p) => { const ks = st.filter(k => k.key.startsWith(p)); return { keys: ks.slice(0, 100), truncated: ks.length > 100 } }
  ok('writer slugs: first slug per league id, in file order',
    JSON.stringify(writerSlugs("    'ucl':  { bsdLeagueId: 7 },\n    'uclqual': { bsdLeagueId: 7 },\n    'mls': { x: 1, bsdLeagueId: 18 },\n    'nba': { espn: 'x' },")) === '["ucl","mls"]')
  const en = await enumerate(listOf(store), 'bsd/x/', 500)
  ok(`enumeration recovers all ${store.length} keys past truncated pages (${en.calls} calls)`, en.keys.length === store.length && !en.capped)
  ok('a call cap is reported, not silent', (await enumerate(listOf(store), 'bsd/x/', 1)).capped === true)

  // Slug walk: every slug, including ones no list names and ones that share a
  // first letter with a crowded competition, behind 100-key pages.
  const many = (slug, n) => Array.from({ length: n }, (_, i) => ({ key: `bsd/${slug}/${200000 + i}/stats.json`, uploaded: '2026-10-01' }))
  const slugStore = [...many('bundesliga', 300), ...many('bundesliga2', 3), ...many('eflchamp', 150), ...many('epl', 120), ...many('europa', 5),
    ...many('ucl', 200), ...many('undefined', 2), ...many('wc26', 110), ...many('ligue-1', 150), ...many('ligue', 3)].sort((a, b) => (a.key < b.key ? -1 : 1))
  const sw = await slugWalk(listOf(slugStore), 3000)
  ok(`slug walk finds all 10 slugs behind truncated pages, including one hidden behind a crowded hyphenated sibling (${sw.slugs.join(',')})`,
    JSON.stringify(sw.slugs) === JSON.stringify(['bundesliga', 'bundesliga2', 'eflchamp', 'epl', 'europa', 'ligue', 'ligue-1', 'ucl', 'undefined', 'wc26']) && !sw.capped)
  const evStore = [...many('mls', 60).flatMap(k => [k, { ...k, key: k.key.replace('stats.json', 'incidents.json') }]), { key: 'bsd/mls/undefined/stats.json', uploaded: '2026-10-01' }].sort((a, b) => (a.key < b.key ? -1 : 1))
  ok('the event walk reaches an id that sorts after every number', (await enumerate(listOf(evStore), 'bsd/mls/', 3000)).keys.length === evStore.length)
  ok('a slug walk cap is reported, not silent', (await slugWalk(listOf(slugStore), 2)).capped === true)

  // Stage of a capture.
  ok('FT period marker is a finished capture', captureStage({ incidents: [{ type: 'period', text: 'FT', is_live: false }] }) === 'finished')
  ok('a live second half is in play', captureStage({ incidents: [{ type: 'period', text: 'Second half', is_live: true }] }) === 'in-play')
  ok('HT alone is neither', captureStage({ incidents: [{ type: 'period', text: 'HT', is_live: false }] }) === 'unmarked')

  // Flow: newest-first array, goal sequence in the same minute.
  const stats = { shotmap: [
    { min: 12, home: false, type: 'goal', player_id: 2, xg: 0.3 },
    { min: 12, home: false, type: 'miss', player_id: 1, xg: 0.02 },
    { min: 5, home: true, type: 'save', player_id: 9, xg: 0.1 },
  ] }
  const inc = { incidents: [{ type: 'goal', minute: 12, added_time: null, player_id: 2, is_home: false, sequence: [{ event: 'pass', pid: 1 }, { event: 'miss', pid: 1 }, { event: 'goal', pid: 2 }] }] }
  const f = flowOf(stats, inc)
  ok('newest-first order is read as newest-first', f.order === 'newest-first')
  ok('the goal sequence agrees with newest-first order', f.seqAgree === 1 && f.seqDisagree === 0)
  ok('NEGATIVE CONTROL: a swapped pair disagrees with the sequence', flowOf({ shotmap: [stats.shotmap[1], stats.shotmap[0], stats.shotmap[2]] }, inc).seqDisagree === 1)
  ok('both teams counted', f.teams === 2)
  ok('an absent shotmap is its own state', flowOf({}, inc).state === 'no-shotmap')
  ok('sequence events are censused, pass included', f.seq.types.pass === 1 && f.seq.goalsWithSequence === 1)
  ok('a goal row at the incident minute is joined', f.goalJoin.sameMinute === 1 && f.goalJoin.missing === 0)
  ok('NEGATIVE CONTROL: a goal row at another minute is not "same"',
    flowOf({ shotmap: [{ min: 13, home: false, type: 'goal', player_id: 2 }] }, inc).goalJoin.otherMinute === 1)
  ok('NEGATIVE CONTROL: one-team shotmaps with no timed opponent incident meet the stop condition',
    verdictFlow([flowOf({ shotmap: [{ min: 1, home: true }, { min: 2, home: true }] }, {})]).met === true)
  ok('NEGATIVE CONTROL: shots with no minute meet the stop condition',
    verdictFlow([flowOf({ shotmap: [{ home: true }, { min: 2, home: false }] }, {})]).met === true)
  ok('no capture read is UNMEASURED, never MET', verdictFlow([]).met === null)
  ok('ordered shots of both teams are NOT MET as written, whatever possession events exist', verdictFlow([f]).met === false)
  ok('...and the possession-level reading is reported separately', /^MET/.test(verdictFlow([f]).readings.possession_level))
  const oneTeam = flowOf({ shotmap: [{ min: 30, home: true }, { min: 20, home: true }] }, { incidents: [{ type: 'card', minute: 25, is_home: false }] })
  ok('a timed opponent incident between two same-team shots is interleaving', oneTeam.interleave.pairsWithOpponentIncident === 1 && verdictFlow([oneTeam]).met === false)
  ok('NEGATIVE CONTROL: the SAME team\'s incident between its own shots is not interleaving',
    flowOf({ shotmap: [{ min: 30, home: true }, { min: 20, home: true }] }, { incidents: [{ type: 'substitution', minute: 25, is_home: true }] }).interleave.pairsWithOpponentIncident === 0)
  const twoPriors = { shotmap: [{ min: 7, home: true, type: 'goal', player_id: 30 }, { min: 7, home: true, type: 'save', player_id: 10 }, { min: 7, home: true, type: 'post', player_id: 10 }] }
  ok('two earlier shots by one player are two comparisons, one row each',
    flowOf(twoPriors, { incidents: [{ type: 'goal', minute: 7, added_time: null, sequence: [{ event: 'save', pid: 10 }, { event: 'post', pid: 10 }, { event: 'goal', pid: 30 }] }] }).seqAgree === 2)
  // Two SAVES by one player, one row on each side of the goal: each prior must
  // take its own row (1 agree, 1 disagree), not both land on the first.
  const reuse = flowOf({ shotmap: [{ min: 9, home: true, type: 'save', player_id: 10 }, { min: 9, home: true, type: 'goal', player_id: 30 }, { min: 9, home: true, type: 'save', player_id: 10 }] },
    { incidents: [{ type: 'goal', minute: 9, added_time: null, sequence: [{ event: 'save', pid: 10 }, { event: 'save', pid: 10 }, { event: 'goal', pid: 30 }] }] })
  ok('NEGATIVE CONTROL: a shotmap row is used once per goal', reuse.seqAgree === 1 && reuse.seqDisagree === 1)
  // Runs, as a range over every arrangement of the mixed-team minutes.
  const S = (spec) => spec.map(([min, h]) => ({ min, home: h === 'H' ? true : h === 'A' ? false : null }))
  const rr = flowRuns(S([[1, 'H'], [2, 'H'], [3, 'H'], [4, 'A'], [10, 'H'], [11, 'H'], [12, 'H'], [12, 'A'], [13, 'H']]))
  ok('a run clear of mixed minutes counts under every order; one that needs an order counts only in the maximum', rr.minRuns === 1 && rr.maxRuns === 2 && rr.mixedBuckets === 1)
  const one = flowRuns(S([[5, 'H'], [4, 'H'], [3, 'A'], [3, 'H'], [2, 'H'], [1, 'H']]))
  ok('NEGATIVE CONTROL: two alternatives no order holds together are ONE run, under every order', one.minRuns === 1 && one.maxRuns === 1)
  const split = flowRuns(S([[12, 'A'], [12, 'H'], [11, 'H'], [10, 'A'], [10, 'H']]))
  ok('NEGATIVE CONTROL: a run needing two mixed minutes resolved opposite ways is found', split.minRuns === 0 && split.maxRuns === 1)
  const unk = flowRuns(S([[1, 'H'], [2, 'H'], [3, '?'], [4, 'H']]))
  ok('a shot of unknown side is tried as both teams', unk.minRuns === 0 && unk.maxRuns === 1 && unk.unknownSide === 1)
  ok('two teams alternating make no run', flowRuns(S([[1, 'H'], [2, 'A'], [3, 'H'], [4, 'A']])).maxRuns === 0)
  ok('NEGATIVE CONTROL: a run does not cross half time', flowRuns([{ min: 44, home: true }, { min: 45, added: 2, home: true }, { min: 46, home: true }]).maxRuns === 0
    && flowRuns([{ min: 43, home: true }, { min: 44, home: true }, { min: 45, added: 2, home: true }]).maxRuns === 1)
  ok('a fast-break shot after an own-team shot is counted as an unseen opponent possession',
    flowOf({ shotmap: [{ min: 30, home: true, sit: 'fast-break' }, { min: 20, home: true, sit: 'fast-break' }, { min: 10, home: false, sit: 'regular' }] }, {}).fastBreakAfterOwnShot === 1)
  ok('NEGATIVE CONTROL: a shot with no boolean side does not hide the other team',
    verdictFlow([flowOf({ shotmap: [{ min: 1, home: true }, { min: 2, home: false }, { min: 3, home: null }] }, { incidents: [] })]).met === false)
  const gj2 = flowOf({ shotmap: [{ min: 20, home: true, type: 'goal', player_id: 7 }, { min: 5, home: false, type: 'miss', player_id: 9 }] },
    { incidents: [{ type: 'goal', minute: 20, player_id: 7, is_home: true }, { type: 'goal', minute: 70, player_id: 7, is_home: true }] }).goalJoin
  ok('NEGATIVE CONTROL: an earlier goal\'s row does not stand in for a later goal with none', gj2.sameMinute === 1 && gj2.missing === 1 && gj2.otherMinute === 0)

  // Gravity: classifications, and the detector made to fail.
  const paths = coordinatePaths({ shotmap: [{ pos: { x: 1, y: 2 }, gm: { x: 0, y: 3 }, min: 4 }], average_positions: { home: [{ x: 5, y: 6, player_id: 1 }, { x: 7, y: 8, player_id: 2 }] } })
  ok('shot origin is on-ball', classifyCoordPath('shotmap[].pos') === 'on-ball (shot)' && paths.has('shotmap[].pos'))
  ok('average positions are match-average, not instants', classifyCoordPath('average_positions.home[]') === 'match-average' && ![...paths.keys()].some(p => /timed/.test(p)))
  const asPaths = (o) => [...coordinatePaths(o)].map(([p, n]) => ({ path: p, captures: n, kind: classifyCoordPath(p) }))
  ok('NEGATIVE CONTROL: a TUPLE coordinate is seen and blocks MET', verdictGravity(asPaths({ players: [{ pid: 1, coord: [10, 20] }] }), 1).met !== true)
  ok('NEGATIVE CONTROL: numeric-STRING coordinates are seen and block MET', verdictGravity(asPaths({ dots: [{ x: '1.5', y: '2' }] }), 1).met !== true)
  ok('NEGATIVE CONTROL: frames of tuple coordinates are off-ball', verdictGravity(asPaths({ frames: [{ uts: 1, coordinates: [[1, 2], [3, 4]] }] }), 1).met === false)
  ok('NEGATIVE CONTROL: a timed array of identified players is off-ball, whatever it is named',
    verdictGravity(asPaths({ snaps: [{ t: 1, crowd: [{ x: 1, y: 2, player_id: 7 }, { x: 3, y: 4, player_id: 8 }] }] }), 1).met === false)
  ok('a goal build-up (nested pos, an action per element, under a timed incident) is an on-ball action sequence',
    verdictGravity(asPaths({ incidents: [{ type: 'goal', minute: 73, sequence: [{ event: 'pass', pid: 1, pos: { x: 60, y: 40 } }, { event: 'goal', pid: 2, pos: { x: 90, y: 50 } }] }] }), 1).met === true
    && asPaths({ incidents: [{ type: 'goal', minute: 73, sequence: [{ event: 'pass', pid: 1, pos: { x: 60, y: 40 } }, { event: 'goal', pid: 2, pos: { x: 90, y: 50 } }] }] }).some(p => p.kind === 'on-ball (action sequence)'))
  ok('NEGATIVE CONTROL: nested positions of identified players at one instant, with no action, are off-ball',
    verdictGravity(asPaths({ snaps: [{ t: 5, players: [{ pid: 1, pos: { x: 1, y: 2 } }, { pid: 2, pos: { x: 3, y: 4 } }] }] }), 1).met === false)
  ok('goal frame: keeper at the shooter end', goalFrameOf({ incidents: [{ type: 'goal', is_home: true, sequence: [{ event: 'pass', pos: { x: 60, y: 40 }, end: { x: 78, y: 50 } }, { event: 'goal', pos: { x: 80, y: 50 }, gk: { x: 98, y: 50 } }] }] })[0].sameEnd === true)
  ok('goal frame: build-up and last pass are carried', (() => { const g = goalFrameOf({ incidents: [{ type: 'goal', is_home: true, sequence: [{ event: 'pass', pos: { x: 60, y: 40 }, end: { x: 78, y: 50 } }, { event: 'goal', pos: { x: 80, y: 50 }, gk: { x: 98, y: 50 } }] }] })[0]; return g.advancedFromFirst === 20 && g.lastPassEndX === 78 && g.gkHigh })())
  ok('gravity: nothing read is UNMEASURED', verdictGravity([], 0).met === null)
  ok('gravity: only on-ball and match-average paths is MET', verdictGravity([{ path: 'shotmap[].pos', kind: 'on-ball (shot)' }], 3).met === true)
  ok('NEGATIVE CONTROL: an unclassified path blocks MET', verdictGravity([{ path: 'lineups[].players[]', kind: 'unclassified' }], 3).met === null)
  ok('frame: home high-x and away low-x is one shared frame', frameReading({ hs: 18, hHigh: 18, as: 6, aLow: 6, declared: 'target-goal-relative' }).shared === true)
  ok('frame: both sides near zero is target-goal-relative', frameReading({ hs: 10, hHigh: 0, as: 10, aLow: 10 }).shared === false)
  ok('frame: too few goals is unmeasured', frameReading({ hs: 2, hHigh: 2, as: 9, aLow: 9 }).shared === null)

  // Second Wind: the tally keeps four states apart and drops shootouts.
  const fake = ({ elapsedSeconds }) => ({ state: elapsedSeconds === null ? 'instant-in-no-interval' : elapsedSeconds < 100 ? 'resolved' : 'disagrees-with-situation' })
  const pbp = { homeTeam: { id: 1 }, gameType: 2, plays: [
    { typeDescKey: 'period-start', periodDescriptor: { number: 1 }, timeInPeriod: '00:00' },
    { typeDescKey: 'shot-on-goal', periodDescriptor: { number: 1 }, timeInPeriod: '00:30' },
    { typeDescKey: 'hit', periodDescriptor: { number: 1 }, timeInPeriod: '05:00' },
    { typeDescKey: 'shot-on-goal', periodDescriptor: { number: 5 }, timeInPeriod: '00:00' },
  ] }
  const tl = joinTally(fake, pbp, [{}])
  ok('boundary markers are counted in all, not in events', tl.all.resolved === 2 && tl.events.resolved === 1)
  ok('disagreement is its own state', tl.events['disagrees-with-situation'] === 1)
  ok('regular-season shootout attempts are excluded and counted', (tl.all.resolved ?? 0) + (tl.all['disagrees-with-situation'] ?? 0) === 3 && tl.shootoutExcluded === 1)
  const idPbp = { homeTeam: { id: 1 }, gameType: 2, plays: [
    { typeDescKey: 'shot-on-goal', periodDescriptor: { number: 1 }, timeInPeriod: '01:00', details: { shootingPlayerId: 7 } },
    { typeDescKey: 'goal', periodDescriptor: { number: 3 }, timeInPeriod: '02:00', details: { scoringPlayerId: 8 } },
    { typeDescKey: 'hit', periodDescriptor: { number: 1 }, timeInPeriod: '02:30', details: { hittingPlayerId: 7, hitteePlayerId: 9 } },
    { typeDescKey: 'stoppage', periodDescriptor: { number: 1 }, timeInPeriod: '03:00', details: { reason: 'icing' } } ] }
  const idJoin = joinTally(() => ({ state: 'resolved', home: [7], away: [] }), idPbp, [{}])
  ok('an actor in the resolved set is confirmed', idJoin.actor.confirmed === 2)
  ok('NEGATIVE CONTROL: a resolved count WITHOUT the actor is not confirmed', idJoin.actor.resolvedActorAbsent === 1)
  ok('a play naming nobody is outside the identity denominator', idJoin.actor.bearing === 3 && idJoin.actorless === 1)
  ok('an actor play on a period-end second is counted', joinTally(() => ({ state: 'resolved', home: [7], away: [] }), { homeTeam: { id: 1 }, gameType: 2, plays: [{ typeDescKey: 'hit', periodDescriptor: { number: 1 }, timeInPeriod: '20:00', details: { hittingPlayerId: 7 } }] }, [{}]).actorAtPeriodEnd === 1)
  ok('identity is broken out by type and by period', idJoin.actorByType.goal.resolvedActorAbsent === 1 && idJoin.actorByPeriod['1'].confirmed === 2 && idJoin.actorByPeriod['3'].bearing === 1)
  ok('elapsed seconds use the period offset', elapsedOf(2, '01:05') === 1265)
  let seen = null
  decorrelated((a) => { seen = a.elapsedSeconds; return { state: 'resolved' } })({ period: 2, elapsedSeconds: 1200 + 700 })
  ok('the control moves the clock 600 s inside the same period', seen === 1200 + 100)
  ok('the control leaves overtime out rather than wrapping it', decorrelated(() => ({ state: 'resolved' }))({ period: 4, elapsedSeconds: 3700 }).state === 'excluded-from-control')
  ok('second wind: nothing joined is UNMEASURED', verdictSecondWind({ bearing: 0 }, null).met === null)
  ok('second wind: exactly half is not a majority, so MET', verdictSecondWind({ bearing: 10, confirmed: 5 }, { bearing: 10, confirmed: 2 }).met === true)
  ok('second wind: a majority over a low chance rate is NOT MET', verdictSecondWind({ bearing: 10, confirmed: 6 }, { bearing: 10, confirmed: 2 }).met === false)
  ok('NEGATIVE CONTROL: a majority the control also reaches proves nothing', verdictSecondWind({ bearing: 10, confirmed: 9 }, { bearing: 10, confirmed: 6 }).met === null)
  ok('NEGATIVE CONTROL: no control run is UNMEASURED', verdictSecondWind({ bearing: 10, confirmed: 9 }, null).met === null)
  ok('a minority is MET whatever the control says', verdictSecondWind({ bearing: 10, confirmed: 3 }, { bearing: 10, confirmed: 6 }).met === true)
  const otPbp = { homeTeam: { id: 1 }, gameType: 2, plays: [
    { typeDescKey: 'shot-on-goal', periodDescriptor: { number: 1 }, timeInPeriod: '02:00', details: { shootingPlayerId: 7 } },
    { typeDescKey: 'shot-on-goal', periodDescriptor: { number: 4 }, timeInPeriod: '01:00', details: { shootingPlayerId: 8 } } ] }
  const ctl = joinTally(decorrelated(() => ({ state: 'resolved', home: [7], away: [] })), otPbp, [{}])
  ok('NEGATIVE CONTROL: overtime plays the control leaves out are out of its denominator, and counted', ctl.actor.bearing === 1 && ctl.excludedFromControl === 1)
  const toi = toiCheck([{ playerId: 7, startTime: '00:00', endTime: '00:45' }], { playerByGameStats: { homeTeam: { forwards: [{ playerId: 7, toi: '00:45' }] } } })
  ok('shift-summed TOI matches the boxscore', toi.within5s === 1)
  ok('an unreadable boxscore says so', toiCheck([], {}).state === 'unreadable')
  const backup = toiCheck([{ playerId: 7, startTime: '00:00', endTime: '00:45' }], { playerByGameStats: { homeTeam: { forwards: [{ playerId: 7, toi: '00:45' }], goalies: [{ playerId: 31, toi: '00:00' }] } } })
  ok('a dressed backup goalie is not a player the shift charts dropped', backup.missingFromShifts === 0 && backup.dressedNotPlayed === 1)

  // Tactical Lock.
  const lk = lockOf({ xg_per_minute: [{ m: 5, xg_home: 0.1, xg_away: 0, cum_home: 0.1, cum_away: 0 }, { m: 12, xg_home: 0, xg_away: 0.32, cum_home: 0.1, cum_away: 0.32 }], momentum: [{ m: 5, v: 20 }, { m: 12, v: -30 }], shotmap: stats.shotmap }, { incidents: [{ type: 'period', text: 'HT' }, { type: 'card', minute: 30 }] })
  ok('per-minute xG reconciles with the shotmap (non-trivial comparisons only)', lk.xpm.reconcileMatch === 2 && lk.xpm.reconcileMiss === 0)
  ok('NEGATIVE CONTROL: a shot minute with no xg_per_minute row is caught',
    lockOf({ xg_per_minute: [{ m: 5, xg_home: 0.1, xg_away: 0, cum_home: 0.1, cum_away: 0 }], momentum: [{ m: 5, v: 20 }], shotmap: stats.shotmap }, {}).xpm.shotMinuteWithoutRow === 1)
  ok('added time is keyed to the .5 momentum row when it exists',
    lockOf({ xg_per_minute: [{ m: 45, xg_home: 0, xg_away: 0.2 }], momentum: [{ m: 45, v: 30 }, { m: 45.5, v: -10 }], shotmap: [{ min: 45, added: 3, home: false, xg: 0.2 }] }, {}).mom.signAgreesHomePositive === 1)
  ok('momentum sign read in BOTH directions, kept apart', lk.mom.sign.homeOnlyPos === 1 && lk.mom.sign.awayOnlyNeg === 1 && lk.mom.signDisagrees === 0)
  ok('a stoppage incident marks its 4-minute windows', lk.activePlay.withStoppageIncident === 4)
  ok('xg_per_minute density is measured', lk.xpm.density === +(2 / 8).toFixed(3))
  ok('NEGATIVE CONTROL: no momentum anywhere meets the Lock stop condition', verdictLock([lockOf({ xg_per_minute: [] }, {})]).met === true)
  ok('no capture read is UNMEASURED', verdictLock([]).met === null)
  // The echo question, with every shape a reviewer used to break an earlier
  // version. Shots are spaced so quiet stretches exist; each echo is a pure
  // function of them and must come out MET; each independent series NOT MET.
  const H = [3, 5, 17, 19, 31, 33, 44, 49, 51, 63, 65, 77], A = [8, 24, 38, 56, 70]
  const shotList = [...H.map(x => [x, 'h']), ...A.map(x => [x, 'a'])]
  const kern = (m, f) => shotList.filter(([x]) => x <= m).reduce((v, [x, sd]) => v + (sd === 'h' ? 1 : -1) * f(m - x), 0)
  const clamp = (v) => Math.max(-100, Math.min(100, Math.round(v)))
  const series = (vf, copies = 12, flip = 0) => Array.from({ length: copies }, (_, c) => ({ v: Array.from({ length: 85 }, (_, i) => [i + 1, (c < flip ? -1 : 1) * vf(i + 1)]), shots: shotList, xgDiff: [] }))
  const echoes = {
    'fast decay (tau 1.5)': (m) => clamp(kern(m, d => 100 * Math.exp(-d / 1.5))),
    'EWMA (tau 20)': (m) => clamp(kern(m, d => 30 * Math.exp(-d / 20))),
    'cumulative difference': (m) => clamp(kern(m, () => 10)),
    'fast decay plus cumulative': (m) => clamp(kern(m, d => 80 * Math.exp(-d / 1.5) + 10)),
    'two decay rates': (m) => clamp(kern(m, d => 70 * Math.exp(-d / 1.5) + 30 * Math.exp(-d / 12))),
    'shot-window count (10 min)': (m) => clamp(kern(m, d => (d < 10 ? 25 : 0))),
  }
  const signed = [{ momentum: 'present', xgPerMinute: 'present', mom: { signAgreesHomePositive: 40, signDisagrees: 10 } }]
  for (const [name, vf] of Object.entries(echoes)) ok(`NEGATIVE CONTROL: an echo of the shots (${name}) meets the stop condition, MET`, verdictLock(signed, territoryTest(series(vf))).met === true)
  // A shot-window count whose exits alternate teams reverses inside a quiet
  // stretch, so only the shot-age rule can call it an echo.
  const wShots = [[5, 'h'], [7, 'a'], [9, 'h'], [40, 'h'], [42, 'a'], [44, 'h'], [70, 'h'], [72, 'a'], [74, 'h']]
  const wSeries = Array.from({ length: 12 }, () => ({ v: Array.from({ length: 85 }, (_, i) => [i + 1, clamp(wShots.filter(([x]) => x <= i + 1 && i + 1 - x < 10).reduce((v, [, sd]) => v + (sd === 'h' ? 25 : -25), 0))]), shots: wShots, xgDiff: [] }))
  const wT = territoryTest(wSeries)
  ok('NEGATIVE CONTROL: a shot-window echo that reverses where nobody shoots is still MET, by its shot age', wT.excess_rate >= TERRITORY_MIN_EXCESS && wT.best_age_share > TERRITORY_MAX_AGE_SHARE && verdictLock(signed, wT).met === true)
  ok('NEGATIVE CONTROL: an echo with a sign-inverted subset is still MET (the test does not use the sign)', verdictLock(signed, territoryTest(series(echoes['fast decay (tau 1.5)'], 12, 3))).met === true)
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const walkV = (() => { const out = []; let v = 0; for (let i = 0; i < 85; i++) { v = clamp(v * 0.8 + (rnd() - 0.5) * 60); out.push(v) } return (m) => out[m - 1] })()
  // NOT AN ECHO IS NOT YET TERRITORY: half-grain validation against the
  // payload's own final-third and possession figures, shots partialled out.
  let s2 = 11; const r2 = () => (s2 = (s2 * 1103515245 + 12345) % 2147483648) / 2147483648
  const halvesOf = (momFn) => Array.from({ length: 150 }, () => { const shotDiff = Math.round((r2() - 0.5) * 12), fteDiff = Math.round((r2() - 0.5) * 40), possDiff = Math.round((r2() - 0.5) * 30)
    const xgDiff = shotDiff * 0.1 + (r2() - 0.5) * 0.4; return { momMean: momFn({ shotDiff, fteDiff, possDiff }), shotDiff, xgDiff, fteDiff, possDiff } })
  const tracking = territoryValidation(halvesOf(({ shotDiff, fteDiff }) => 1.5 * fteDiff + 3 * shotDiff + (r2() - 0.5) * 20))
  const shotsOnly = territoryValidation(halvesOf(({ shotDiff }) => 3 * shotDiff + (r2() - 0.5) * 10))
  ok('momentum that tracks final-third entries beyond shots is validated', tracking.tracks.includes('final_third_entries'))
  ok('NEGATIVE CONTROL: shots plus noise tracks no territory measure once shots are partialled out', shotsOnly.tracks.length === 0)
  ok('momentum that moves on its own AND tracks territory is a proxy, NOT MET', verdictLock(signed, territoryTest(series(walkV)), {}, tracking).met === false)
  ok('...even when the team on top shoots often', verdictLock(signed, territoryTest(series((m) => (m <= 45 ? 1 : -1) * (40 + (m % 7)) + kern(m, d => (d === 0 ? 20 : 0)))), {}, tracking).met === false)
  ok('NEGATIVE CONTROL: not an echo but tracking no territory measure is MET (reduces to "did not shoot")', verdictLock(signed, territoryTest(series(walkV)), {}, shotsOnly).met === true)
  ok('NEGATIVE CONTROL: not an echo with no validation run is UNMEASURED, never NOT MET', verdictLock(signed, territoryTest(series(walkV))).met === null)
  const collinear = territoryValidation(Array.from({ length: 300 }, () => { const terr = (r2() - 0.5) * 40, shotDiff = Math.round(terr / 6 + (r2() - 0.5) * 6)
    return { momMean: terr * 0.8 + (r2() - 0.5) * 15, shotDiff, xgDiff: shotDiff * 0.1, fteDiff: Math.round(terr + (r2() - 0.5) * 10), possDiff: Math.round(terr * 0.5 + (r2() - 0.5) * 10) } }))
  ok('NEGATIVE CONTROL: collinear shots and xG still give a partial correlation, not a silent "tracks nothing"', collinear.final_third_entries.partial_r_given_shots_and_xg !== null && collinear.tracks.includes('final_third_entries'))
  const viaShots = territoryValidation(halvesOf(({ shotDiff }) => 3 * shotDiff + (r2() - 0.5) * 10).map(h => ({ ...h, fteDiff: 6 * h.shotDiff + Math.round((r2() - 0.5) * 8) })))
  ok('NEGATIVE CONTROL: momentum that tracks territory only THROUGH shots is not validated', viaShots.final_third_entries.raw_r > 0.5 && viaShots.tracks.length === 0)
  const flat = territoryValidation(Array.from({ length: 150 }, () => ({ momMean: r2(), shotDiff: 0, xgDiff: 0, fteDiff: Math.round(r2() * 10), possDiff: null })))
  ok('NEGATIVE CONTROL: a validation that cannot be computed is UNMEASURED, never "tracks nothing"', flat.tracks === null && verdictLock(signed, territoryTest(series(walkV)), {}, flat).met === null)
  ok('direction unproven on a validated proxy is UNMEASURED', verdictLock([{ momentum: 'present', mom: { signAgreesHomePositive: 10, signDisagrees: 9 } }], territoryTest(series(walkV)), {}, tracking).met === null)
  ok('too few halves to validate is UNMEASURED', verdictLock(signed, territoryTest(series(walkV)), {}, territoryValidation(halvesOf(() => 1).slice(0, 20))).met === null)
  ok('a half row is built from per-half stats, shots and momentum', (() => { const st = { shotmap: [{ min: 10, home: true, xg: 0.2 }, { min: 50, home: false, xg: 0.1 }], momentum: Array.from({ length: 90 }, (_, i) => ({ m: i + 1, v: i < 45 ? 10 : -10 })), xg_per_minute: [],
    stats: { first_half: { home: { final_third_entries: 30, ball_possession: 55 }, away: { final_third_entries: 20, ball_possession: 45 } }, second_half: { home: { final_third_entries: { value: 10 } }, away: { final_third_entries: 25 } } } }
    const h = lockOf(st, {}).halves; return h.length === 2 && h[0].momMean === 10 && h[0].fteDiff === 10 && h[0].possDiff === 10 && h[0].shotDiff === 1 && h[1].fteDiff === -15 && h[1].possDiff === null })())
  const busy = { v: Array.from({ length: 85 }, (_, i) => [i + 1, walkV(i + 1)]), shots: Array.from({ length: 28 }, (_, i) => [3 * i + 1, i % 2 ? 'a' : 'h']), xgDiff: [] }
  ok('too little quiet play is UNMEASURED, never a verdict', verdictLock(signed, territoryTest(Array(12).fill(busy))).met === null)
  ok('a competition whose own minutes point the other way is named', /EXCEPT ucl/.test(verdictLock(signed, territoryTest(series(walkV)), { ucl: { homeOnlyPos: 5, homeOnlyNeg: 30, awayOnlyNeg: 4, awayOnlyPos: 25 } }, tracking).reason))
  ok('NEGATIVE CONTROL: match-stat counters are not coordinate names', keyCensus({ stats: { home: { long_balls: { value: 1 }, blocked_shots: 2 }, location: 'x' } }, COORD_NAME, '', new Set(), 0, { slice: Infinity, depth: Infinity }).size === 1)
  ok('keyCensus finds shot and xg keys', keyCensus({ games: [{ xg_home: 1, odds: 2 }] }, /shot|xg/i).has('games[].xg_home'))
  ok('keyCensus with no slice reaches the 7th element', keyCensus({ g: Array.from({ length: 8 }, (_, i) => (i === 7 ? { shots: 1 } : {})) }, /shot/i, '', new Set(), 0, { slice: Infinity, depth: Infinity }).has('g[].shots'))
  ok('half time is recoverable from incidents', lk.halfTimeMarked === true)

  console.log(fail ? `self-test: ${fail} FAILED` : 'self-test: all passed')
  return fail ? 1 : 0
}

// ── live ───────────────────────────────────────────────────────────────────
const verdictWord = (met) => met === true ? 'MET' : met === false ? 'NOT MET' : 'UNMEASURED'
function artifact(name, body) {
  mkdirSync('outbox', { recursive: true })
  body.stop_condition.verdict = verdictWord(body.stop_condition.met)
  writeFileSync(`outbox/empowerment-${name}-probe-latest.json`, JSON.stringify(body, null, 2) + '\n')
  console.log(`wrote outbox/empowerment-${name}-probe-latest.json  stop condition ${body.stop_condition.verdict}`)
  return body.stop_condition.met
}

export const SHELL_BYTES = 1000   // a stats.json this small has an empty shotmap (ucl/europa shells, measured 2026-10-16)
// Whole name segments: `lon` must not match long_balls, nor `loc` blocked_shots.
export const COORD_NAME = /(^|_)(coords?|coordinates?|positions?|location|loc|xy|track(ing)?|frames?|heat(map)?|lat|lng|lon)($|_)/i

async function live() {
  const at = new Date().toISOString()
  const base = { cc_cmd: CC_CMD, ran_at: at, relay: RELAY, relay_sha: process.env.RELAY_SHA || null }
  const failedPages = []

  // R2 census. One retry per page; a page that still fails is NAMED, and the
  // census is not called complete while any page failed.
  const listPage = async (prefix) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await getJson(`${RELAY}/bsd/r2/list?prefix=${encodeURIComponent(prefix)}`, j => Array.isArray(j?.keys))
      if (r.state === 'present' || r.state === 'empty') return r.json
    }
    failedPages.push(prefix); return null
  }
  // WHY THE FIRST PASS SAW wc26 ONLY: three listings, side by side.
  const mech = {}
  for (const [name, q] of [['no_prefix', ''], ['empty_prefix', '?prefix='], ['prefix_bsd', '?prefix=bsd%2F']]) {
    const r = await getJson(`${RELAY}/bsd/r2/list${q}`, j => Array.isArray(j?.keys))
    const ks = r.json?.keys ?? []
    mech[name] = { state: r.state, keys: ks.length, first: ks[0]?.key ?? null, last: ks[ks.length - 1]?.key ?? null, truncated: r.json?.truncated ?? null }
  }
  const budget = { calls: 0 }
  let derived = [], derivedFrom = process.env.RELAY_INDEX_PATH || 'RELAY_INDEX_PATH unset'
  if (process.env.RELAY_INDEX_PATH) { try { derived = writerSlugs(readFileSync(process.env.RELAY_INDEX_PATH, 'utf8')) } catch (e) { derivedFrom = `unreadable: ${String(e).slice(0, 100)}` } }
  const walk = await slugWalk(listPage, LIST_CALL_CAP, budget)
  const slugCalls = budget.calls
  const allKeys = []; let capped = walk.capped
  // Every character a key can hold, not only digits: a bsd/<slug>/undefined/
  // written by older code sorts after every numeric id and would otherwise be
  // unreachable once the slug's first page is truncated.
  for (const r of await pool(walk.slugs, 4, (sl) => enumerate(listPage, `bsd/${sl}/`, LIST_CALL_CAP, undefined, budget))) { allKeys.push(...r.keys); capped = capped || r.capped }
  // Event ids are numeric by the writer's construction; one that is not is
  // named, because it says the writer did something this probe did not expect.
  const nonDigitEvents = [...new Set(allKeys.map(k => /^bsd\/[^/]+\/([^/]+)\//.exec(k.key)?.[1]).filter(e => e && !/^\d+$/.test(e)))]
  const censusComplete = !capped && failedPages.length === 0 && nonDigitEvents.length === 0
  const comps = groupCaptures(allKeys)
  const sizeOf = new Map(allKeys.map(k => [k.key, k.size]))
  const compSummary = Object.fromEntries(Object.entries(comps).map(([c, v]) => {
    const evs = Object.entries(v.events)
    const statsSize = ([ev]) => sizeOf.get(`bsd/${c}/${ev}/stats.json`) ?? 0
    return [c, { events: evs.length, first_upload: v.first, last_upload: v.last,
      with_stats: evs.filter(([, e]) => e.files.includes('stats.json')).length,
      shell_stats_under_1000_bytes: evs.filter(e => e[1].files.includes('stats.json') && statsSize(e) < SHELL_BYTES).length,
      avg_positions_file_populated: evs.filter(([ev]) => (sizeOf.get(`bsd/${c}/${ev}/average-positions.json`) ?? 0) > 2).length,
      avg_positions_file_empty: evs.filter(([ev, e]) => e.files.includes('average-positions.json') && (sizeOf.get(`bsd/${c}/${ev}/average-positions.json`) ?? 0) <= 2).length,
      file_kinds: [...new Set(evs.flatMap(([, e]) => e.files))].sort() }]
  }))
  const censusLine = `census ${censusComplete ? 'COMPLETE' : 'INCOMPLETE'}: ${walk.slugs.length} slugs found by walking the store (${slugCalls} list calls), ${budget.calls} list calls in all`
    + (capped ? ', CAPPED' : '') + (failedPages.length ? `, ${failedPages.length} page(s) failed after a retry: ${failedPages.slice(0, 5).join(', ')}` : '')
    + (nonDigitEvents.length ? `, non-digit event ids: ${nonDigitEvents.slice(0, 5).join(', ')}` : '')
  console.log(`R2 ${censusLine}: ${allKeys.length} keys`)
  for (const [c, s] of Object.entries(compSummary)) console.log(`  ${c.padEnd(14)} events ${String(s.events).padStart(4)}  shells ${String(s.shell_stats_under_1000_bytes).padStart(3)}  ${s.first_upload?.slice(0, 10)} -> ${s.last_upload?.slice(0, 10)}`)

  // READS. incidents.json for EVERY non-shell capture (is it finished?);
  // stats.json for the newest PER_COMP_READS non-shell per competition;
  // average-positions.json wherever it is populated.
  let reads = 0, readsCapped = false, readFailures = 0
  const read1 = async (key, contentful) => {
    if (reads >= READ_CAP) { readsCapped = true; return null }
    reads++
    const r = await getJson(`${RELAY}/bsd/r2/read?key=${encodeURIComponent(key)}`, contentful)
    if (r.state !== 'present') readFailures++
    return r.state === 'present' ? r.json : null
  }
  const nonShell = []
  for (const [c, v] of Object.entries(comps)) for (const [ev, e] of Object.entries(v.events))
    if (e.files.includes('stats.json') && (sizeOf.get(`bsd/${c}/${ev}/stats.json`) ?? 0) >= SHELL_BYTES) nonShell.push({ comp: c, event: ev, uploaded: e.uploaded, hasIncidents: e.files.includes('incidents.json') })
  const incOf = new Map()
  await pool(nonShell.filter(x => x.hasIncidents), READ_CONCURRENCY, async (x) => { incOf.set(`${x.comp}/${x.event}`, await read1(`bsd/${x.comp}/${x.event}/incidents.json`, j => Array.isArray(j?.incidents))) })
  const stageBy = {}; const periodTexts = {}
  for (const x of nonShell) {
    const inc = incOf.get(`${x.comp}/${x.event}`)
    const st = inc ? captureStage(inc) : (x.hasIncidents ? 'unread' : 'no-incidents-file')
    const o = stageBy[x.comp] ??= {}; o[st] = (o[st] ?? 0) + 1
    for (const p of (inc?.incidents ?? []).filter(i => i.type === 'period')) { const k = `${p.text} (is_live ${p.is_live})`; periodTexts[k] = (periodTexts[k] ?? 0) + 1 }
  }
  const stageTotals = Object.values(stageBy).reduce((o, s) => { for (const [k, n] of Object.entries(s)) o[k] = (o[k] ?? 0) + n; return o }, {})
  const sample = []
  for (const c of Object.keys(comps)) sample.push(...nonShell.filter(x => x.comp === c).sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded))).slice(0, PER_COMP_READS))
  const statsRead = await pool(sample, READ_CONCURRENCY, async (x) => ({ ...x, stats: await read1(`bsd/${x.comp}/${x.event}/stats.json`, j => j && typeof j === 'object'), incidents: incOf.get(`${x.comp}/${x.event}`) ?? null }))
  const read = statsRead.filter(r => r.stats).map(r => ({ ...r, stage: r.incidents ? captureStage(r.incidents) : 'unread' }))
  const avgTargets = []
  for (const [c, v] of Object.entries(comps)) for (const [ev] of Object.entries(v.events)) if ((sizeOf.get(`bsd/${c}/${ev}/average-positions.json`) ?? 0) > 2) avgTargets.push({ comp: c, event: ev })
  const avgRead = (await pool(avgTargets, READ_CONCURRENCY, async (x) => ({ ...x, json: await read1(`bsd/${x.comp}/${x.event}/average-positions.json`, j => j && typeof j === 'object') }))).filter(x => x.json)
  const capturesTotal = nonShell.length
  const byStage = (rows) => rows.reduce((o, r) => { o[r.stage] = (o[r.stage] ?? 0) + 1; return o }, {})
  const coverage = `stats.json read for ${read.length} of ${capturesTotal} non-shell captures (newest ${PER_COMP_READS} per competition, ${Object.keys(comps).length} competitions; by stage ${JSON.stringify(byStage(read))}); incidents.json read for ${[...incOf.values()].filter(Boolean).length} of ${nonShell.filter(x => x.hasIncidents).length} that have one; ${reads} reads${readsCapped ? ', READ CAP REACHED' : ''}${readFailures ? `, ${readFailures} failed` : ''}; ${censusLine}.`

  const verdicts = []

  // 0.1 Flow
  const flowRows = read.map(r => ({ comp: r.comp, event: r.event, stage: r.stage, ...flowOf(r.stats, r.incidents) }))
  const topTypes = new Set()
  for (const r of read) {
    for (const sh of r.stats.shotmap ?? []) if (sh.type) topTypes.add(`shotmap:${sh.type}`)
    for (const i of r.incidents?.incidents ?? []) { if (i.type) topTypes.add(`incidents:${i.type}`); for (const e of i.sequence ?? []) if (e?.event) topTypes.add(`sequence:${e.event}`) }
  }
  const ctxDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const ctx = await getJson(`${RELAY}/context/date/${ctxDate}`, j => j && typeof j === 'object')
  const full = { slice: Infinity, depth: Infinity }
  const ctxGames = ctx.state === 'present' ? [...(ctx.json?.games?.regular ?? []), ...(ctx.json?.games?.postseason ?? [])] : []
  const vf = verdictFlow(flowRows)
  verdicts.push(artifact('flow', { ...base, task: '0.1 Flow',
    stop_condition: { text: 'shots carry no within-match ordering key, or carry no opponent-event interleaving', met: vf.met, reason: vf.reason, disjuncts: vf.disjuncts,
      spec_also_says: 'Do not substitute wall-clock timestamps for possession order without proving they order correctly (see verdict.narrowed_variant: within-minute order is proven for one team only, and mixed-team minutes are split out as order-dependent).' },
    coverage: `${flowRows.filter(r => r.state === 'present').length} captures with a non-empty shotmap; ${coverage}`, verdict: vf,
    event_types_seen: [...topTypes].sort(),
    context_date: { date: ctxDate, state: ctx.state, top_level_keys: ctx.state === 'present' ? Object.keys(ctx.json) : null, games_in_payload: ctxGames.length,
      shot_or_xg_keys: ctx.state === 'present' ? [...keyCensus(ctx.json, /shot|xg/i, '', new Set(), 0, full)] : null,
      walk: 'every element, no depth cap', note: '/context/date is the laboratory\'s own input; the spec asks what it serves. Flow can only come from /bsd/r2/read stats.json.' },
    capture_stage: { definition: `finished = a period incident whose text matches ${FINISHED_TEXT}; in-play = a period incident with is_live true; the club writer fires at minute 80+ and drops finished events, so in-play is expected`,
      totals: stageTotals, by_competition: stageBy, period_texts: periodTexts },
    by_competition: Object.fromEntries(Object.keys(comps).map(c => [c, flowRows.filter(r => r.comp === c).reduce((o, r) => { o[r.state] = (o[r.state] ?? 0) + 1; return o }, {})])),
    r2_census: compSummary,
    r2_census_meta: { complete: censusComplete, list_calls: budget.calls, slug_walk_calls: slugCalls, capped, failed_pages: failedPages, non_digit_event_ids: nonDigitEvents,
      slugs_found: walk.slugs, slugs_in_relay_source: derived, source_file: derivedFrom,
      in_source_not_in_store: derived.filter(s => !walk.slugs.includes(s)), in_store_not_in_source: walk.slugs.filter(s => !derived.includes(s)) },
    r2_list_mechanism: { ...mech, reading: mech.no_prefix.first?.startsWith('bsd/wc26/') && mech.prefix_bsd.first && !mech.prefix_bsd.first.startsWith('bsd/wc26/')
      ? 'a listing with NO prefix answers from bsd/wc26/; with prefix=bsd/ it starts at the first competition. A first page taken without a prefix shows wc26 only, whatever else the store holds.'
      : 'see the three listings' } }))

  // 0.2 Gravity
  const pathCounts = new Map(), pathByStage = {}; let withCoords = 0
  const addPaths = (ps, stage, tag = '') => {
    for (const [p] of ps) { const k = tag + p; pathCounts.set(k, (pathCounts.get(k) ?? 0) + 1); const o = pathByStage[k] ??= {}; o[stage] = (o[stage] ?? 0) + 1 }
  }
  for (const r of read) {
    const ps = new Map([...coordinatePaths(r.stats), ...(r.incidents ? coordinatePaths(r.incidents) : [])])
    if (ps.size) withCoords++
    addPaths(ps, r.stage)
  }
  for (const a of avgRead) addPaths(coordinatePaths(a.json), 'file', '')
  const paths = [...pathCounts].map(([p, n]) => ({ path: p, captures: n, kind: classifyCoordPath(p), by_stage: pathByStage[p] })).sort((a, b) => b.captures - a.captures)
  const named = new Set()
  for (const r of read) { for (const p of keyCensus(r.stats, COORD_NAME, '', new Set(), 0, full)) named.add(p); if (r.incidents) for (const p of keyCensus(r.incidents, COORD_NAME, '', new Set(), 0, full)) named.add(p) }
  const namedWithoutShape = [...named].filter(n => !paths.some(p => p.path === n || p.path.startsWith(n + '.') || p.path.startsWith(n + '[]') || p.path.startsWith(n + '(')))
  const fullPostFinal = read.filter(r => ['home', 'away'].some(k => Array.isArray(r.stats?.average_positions?.[k]) && r.stats.average_positions[k].length)).length
  const population = `R2 captures only: stats.json + incidents.json for ${read.length} captures (${JSON.stringify(byStage(read))}; ${fullPostFinal} of them a full post-final tracking-tier stats payload, i.e. one carrying average_positions), average-positions.json for ${avgRead.length} of ${avgTargets.length} populated files. NOT READ: the BSD WebSocket livedata feed (websocket_plus), which the capture writer never stores; its frame shape has never been captured anywhere in FIELD`
  const vg = verdictGravity(paths, withCoords, population)
  const frames = read.flatMap(r => goalFrameOf(r.incidents).map(g => ({ ...g, comp: r.comp })))
  const nonOwn = frames.filter(g => !g.own)
  const hs = nonOwn.filter(g => g.home), as = nonOwn.filter(g => !g.home)
  const hHigh = hs.filter(g => g.shooterHalf === 'high-x').length, aLow = as.filter(g => g.shooterHalf === 'low-x').length
  const contract = await getJson(`${RELAY}/bsd/contract`, j => j?.frames)
  const declared = contract.state === 'present' ? contract.json.frames?.['incidents[].sequence[].pos']?.frame ?? null : null
  const fr = frameReading({ hs: hs.length, hHigh, as: as.length, aLow, declared })
  const adv = (gs, dir) => { const xs = gs.filter(g => g.advancedFromFirst !== null); return `${xs.filter(g => dir * g.advancedFromFirst > 0).length}/${xs.length}` }
  verdicts.push(artifact('gravity', { ...base, task: '0.2 Gravity Well',
    stop_condition: { text: 'soccer provides on-ball data only', met: vg.met, reason: vg.reason, population,
      consequence_if_met: 'Gravity Well rejected for soccer and built for NFL instead (the spec\'s instruction; the owner locked the soccer rejection 2026-10-15). The NFL half is INHERITED evidence, not measured by this run: see `nfl`.' },
    coverage: `${withCoords} captures carrying coordinates; ${coverage}`, coordinate_paths: paths,
    coordinate_named_keys_without_a_coordinate_shape: namedWithoutShape,
    detector: 'reports {x,y} objects (number or numeric string), 2-3 number tuples, and any timed array of 2+ identified points whatever its name; --self-test makes each of those block MET',
    goal_frame_check: { goals_with_pos_and_gk: frames.length, non_own: nonOwn.length, home_scorers: hs.length, home_scorer_high_x: hHigh, away_scorers: as.length, away_scorer_low_x: aLow,
      home_keeper_high_x: hs.filter(g => g.gkHigh).length, away_keeper_low_x: as.filter(g => !g.gkHigh).length,
      home_goal_further_up_x_than_first_buildup_event: adv(hs, 1), away_goal_further_down_x_than_first_buildup_event: adv(as, -1),
      median_buildup_x: { home: median(hs.flatMap(g => g.buildUpX)), away: median(as.flatMap(g => g.buildUpX)) },
      median_last_pass_end_x: { home: median(hs.map(g => g.lastPassEndX).filter(v => v !== null)), away: median(as.map(g => g.lastPassEndX).filter(v => v !== null)) },
      own_goals_excluded: frames.length - nonOwn.length, contract_declares: declared, shared_frame: fr.shared, reading: fr.reading },
    nfl: { status: 'INHERITED, not re-measured here. Re-measurement belongs to field-relay-nba docs/CC-CMD-2026-10-15-build-bdb-frames.md, which builds the frames.', evidence: [
      'jubilant-bassoon outbox/bdb-schema-probe.txt (2026-08-15): tracking cols gameId, playId, nflId, displayName, frameId, frameType, time, jerseyNumber, club, playDirection, x, y, s, a, dis, o, dir, event; 400,000 rows sampled',
      'jubilant-bassoon outbox/cc-session-2026-08-15-p3-bdb-sep-route.md: avgSepYds built from receiver-to-defender distance at pass_arrived, which needs off-ball defender XY at that frame',
      'archived dataset alexandermeau/nfl-big-data-bowl-archived-data-2025 is the 2022 SEASON; BDB coordinates are yards (0-120 by 0-53.3), so the spec\'s ">4.0 meters" needs a stated conversion there' ] } }))

  // 0.3 Second Wind
  let onIceAt = null, onIceSrc = process.env.NHL_ONICE_PATH || 'NHL_ONICE_PATH unset', onIceSha = null
  if (process.env.NHL_ONICE_PATH) {
    try { onIceSha = createHash('sha256').update(readFileSync(process.env.NHL_ONICE_PATH)).digest('hex'); ({ onIceAt } = await import(pathToFileURL(process.env.NHL_ONICE_PATH).href)) } catch (e) { onIceSrc = `import failed: ${String(e).slice(0, 120)}` }
  }
  const board = await getJson(`${NHL_WEB}/v1/scoreboard/now`, j => Array.isArray(j?.gamesByDate))
  const boardDates = board.state === 'present' ? board.json.gamesByDate.map(d => d.date) : []
  const finalsAll = board.state === 'present' ? board.json.gamesByDate.flatMap(d => (d.games ?? []).map(g => ({ ...g, _date: d.date }))).filter(g => ['FINAL', 'OFF'].includes(g.gameState)) : []
  const finals = finalsAll.slice(-NHL_GAME_CAP)
  const games = []
  if (typeof onIceAt === 'function') {
    const control = decorrelated(onIceAt)
    for (const g of finals) {
      const pbp = await getJson(`${NHL_WEB}/v1/gamecenter/${g.id}/play-by-play`, j => Array.isArray(j?.plays) && j.plays.length > 0)
      const sc = await getJson(`${NHL_STATS}/stats/rest/en/shiftcharts?cayenneExp=gameId=${g.id}`, j => Array.isArray(j?.data) && j.data.length > 0)
      const box = await getJson(`${NHL_WEB}/v1/gamecenter/${g.id}/boxscore`, j => j && typeof j === 'object')
      const joined = pbp.state === 'present' && sc.state === 'present'
      games.push({ id: g.id, gameType: pbp.json?.gameType ?? null, pbp: pbp.state, shifts: sc.state, shiftRows: sc.state === 'present' ? sc.json.data.length : 0, joined,
        tally: joined ? joinTally(onIceAt, pbp.json, sc.json.data) : null,
        controlTally: joined ? joinTally(control, pbp.json, sc.json.data) : null,
        toi: joined && box.state === 'present' ? toiCheck(sc.json.data, box.json) : { state: joined ? box.state : 'not-joined' } })
    }
  }
  const joinedGames = games.filter(g => g.joined)
  const aggT = (k) => joinedGames.reduce((o, g) => { for (const [st, n] of Object.entries(g.tally[k] ?? {})) o[st] = (o[st] ?? 0) + n; return o }, {})
  const addActor = (o, a) => { for (const k of Object.keys(o)) o[k] += a?.[k] ?? 0; return o }
  const actor = joinedGames.reduce((o, g) => addActor(o, g.tally.actor), newActor())
  const controlActor = joinedGames.reduce((o, g) => addActor(o, g.controlTally.actor), newActor())
  const groupActor = (k) => { const out = {}; for (const g of joinedGames) for (const [ty, a] of Object.entries(g.tally[k])) addActor(out[ty] ??= newActor(), a); return out }
  const byType = {}
  for (const g of joinedGames) for (const [ty, st] of Object.entries(g.tally.byType)) { const o = byType[ty] ??= {}; for (const [k, n] of Object.entries(st)) o[k] = (o[k] ?? 0) + n }
  const cleanToi = joinedGames.filter(g => g.toi?.state === 'present' && g.toi.within5s / g.toi.players >= 0.95)
  const cleanActor = cleanToi.reduce((o, g) => addActor(o, g.tally.actor), newActor())
  const vsw = verdictSecondWind(actor, controlActor)
  const sampled = `${joinedGames.length} of ${finals.length} sampled finals joined (newest ${NHL_GAME_CAP} of ${finalsAll.length} FINAL/OFF games on /v1/scoreboard/now; sampled games dated ${finals[0]?._date ?? '?'} to ${finals[finals.length - 1]?._date ?? '?'}, board window ${boardDates[0] ?? '?'} to ${boardDates[boardDates.length - 1] ?? '?'})`
  verdicts.push(artifact('second-wind', { ...base, task: '0.3 Second Wind (NHL)',
    stop_condition: { text: 'the interval join cannot resolve a majority of events', met: vsw.met,
      reason: actor.bearing === 0 ? `no actor-bearing play was joined: onIceAt ${typeof onIceAt === 'function' ? 'loaded' : 'NOT loaded (' + onIceSrc + ')'}, scoreboard ${board.state}; ${sampled}` : `${vsw.reason}; ${sampled}` },
    coverage: `${sampled}; ${games.length - joinedGames.length} lacked play-by-play or shift rows and are availability, not join failures; every timed play in the joined games`,
    identity: { actor_bearing_plays: actor.bearing, resolved_with_actor_on_ice: actor.confirmed, resolved_but_actor_absent: actor.resolvedActorAbsent, not_resolved: actor.notResolved,
      not_resolved_by_state: aggT('notResolvedByState'), by_type: groupActor('actorByType'), by_period: groupActor('actorByPeriod'),
      decorrelated_control: { ...controlActor, share: controlActor.bearing ? +(controlActor.confirmed / controlActor.bearing).toFixed(3) : null,
        overtime_plays_excluded: joinedGames.reduce((n, g) => n + g.controlTally.excludedFromControl, 0), how: 'the same plays and shift charts with the clock moved 600 s inside the same period; overtime left out of the denominator' },
      games_with_toi_95pct_within_5s: { games: cleanToi.length, ...cleanActor, share: cleanActor.bearing ? +(cleanActor.confirmed / cleanActor.bearing).toFixed(3) : null },
      actor_keys_in_priority: ACTOR_KEYS,
      actor_plays_on_a_period_end_second: joinedGames.reduce((n, g) => n + g.tally.actorAtPeriodEnd, 0),
      event_instant_classes: 'goals and penalties are timed at a stoppage second, where the scorer\'s or offender\'s shift may end; see by_type before Task 3 uses either',
      four_state_note: 'resolved_but_actor_absent is a body count that matches situationCode with the actor NOT on ice. Reused as-is, the four-state vocabulary would label these plays `resolved`: an answer-shaped miss Task 3 has to keep apart.' },
    excluded: { boundary_markers: [...BOUNDARY], actorless_plays: joinedGames.reduce((n, g) => n + g.tally.actorless, 0), regular_season_shootout_plays: joinedGames.reduce((n, g) => n + g.tally.shootoutExcluded, 0) },
    onice_module: { path: onIceSrc, sha256: onIceSha, relay_sha: process.env.RELAY_SHA || null },
    states_events_body_count: aggT('events'), states_all_plays: aggT('all'), states_by_type: byType,
    toi_from_shifts_vs_boxscore: { players: joinedGames.reduce((n, g) => n + (g.toi?.players ?? 0), 0), within_5s: joinedGames.reduce((n, g) => n + (g.toi?.within5s ?? 0), 0),
      missing_from_shifts_with_ice_time: joinedGames.reduce((n, g) => n + (g.toi?.missingFromShifts ?? 0), 0), dressed_not_played_excluded: joinedGames.reduce((n, g) => n + (g.toi?.dressedNotPlayed ?? 0), 0) },
    games: games.map(({ tally, controlTally, ...g }) => ({ ...g, actor: tally?.actor ?? null, control: controlTally?.actor ?? null })) }))

  // 0.4 Tactical Lock
  const lockRows = read.map(r => ({ comp: r.comp, event: r.event, stage: r.stage, ...lockOf(r.stats, r.incidents) }))
  const signByComp = {}
  for (const r of lockRows) { const o = signByComp[r.comp] ??= { homeOnlyPos: 0, homeOnlyNeg: 0, awayOnlyNeg: 0, awayOnlyPos: 0 }; for (const [k, v] of Object.entries(r.mom?.sign ?? {})) o[k] += v }
  const territory = territoryTest(lockRows.map(r => r.series).filter(Boolean))
  const validation = territoryValidation(lockRows.flatMap(r => r.halves ?? []), sum(lockRows, r => r.mom?.signAgreesHomePositive) >= sum(lockRows, r => r.mom?.signDisagrees))
  const vl = verdictLock(lockRows, territory, signByComp, validation)
  const territoryKeys = new Set(); for (const r of read) for (const p of keyCensus(r.stats, /possess|territor|third|box|entr|attack|danger|pressure/i, '', new Set(), 0, full)) territoryKeys.add(p)
  const incKeys = {}
  for (const r of read) for (const i of r.incidents?.incidents ?? []) { const o = incKeys[i.type] ??= { rows: 0, keys: new Set(), period_second: 0, length: 0 }; o.rows++; for (const k of Object.keys(i)) o.keys.add(k); if (i.period_second != null) o.period_second++; if (i.length != null) o.length++ }
  const shotKeys = new Set(); for (const r of read) for (const s of r.stats.shotmap ?? []) for (const k of Object.keys(s)) shotKeys.add(k)
  const subMinute = Object.entries(incKeys).filter(([, o]) => o.period_second > 0).map(([ty, o]) => `${ty} ${o.period_second}/${o.rows}`)
  const invertedCaptures = lockRows.filter(r => r.mom && (r.mom.signAgreesHomePositive + r.mom.signDisagrees) >= 10 && r.mom.signDisagrees > r.mom.signAgreesHomePositive).map(r => `${r.comp}/${r.event}`)
  verdicts.push(artifact('tactical-lock', { ...base, task: '0.4 Tactical Lock',
    stop_condition: { text: 'no territory proxy exists in the payload', consequence_text: 'Tactical Lock reduces to "the opponent did not shoot", which is not a lock', met: vl.met, reason: vl.reason },
    active_play_window: { verdict: 'UNMEASURED below the minute',
      reason: `the spec asks for a 4-minute window over ACTIVE play with stoppages excluded. xg_per_minute and momentum are per minute; shots carry no clock finer than (min, added) (shotmap keys: ${[...shotKeys].sort().join(', ')}); incidents with a sub-minute clock: ${subMinute.length ? subMinute.join(', ') : 'none'}. Only ${Object.keys(incKeys).length} incident types exist (${Object.keys(incKeys).join(', ')}): throw-ins, goal kicks, corners and uncarded fouls leave no incident, so most dead ball cannot be excluded even at minute grain, and none can inside a minute. This field is not a stop condition and does not fail the run.`,
      windows_with_a_stoppage_incident: { windows: sum(lockRows, r => r.activePlay.windows), with_stoppage_incident: sum(lockRows, r => r.activePlay.withStoppageIncident), types: ['goal', 'card', 'substitution', 'varDecision', 'injuryTime'] },
      incident_key_census: Object.fromEntries(Object.entries(incKeys).map(([ty, o]) => [ty, { rows: o.rows, keys: [...o.keys].sort(), with_period_second: o.period_second, with_length: o.length }])) },
    territory_named_keys_in_stats: [...territoryKeys].sort(),
    coverage, verdict: vl,
    momentum_sign_by_competition: signByComp, captures_where_momentum_points_the_other_way: invertedCaptures,
    momentum_shape: { captures: lockRows.filter(r => r.mom).length, rows: sum(lockRows, r => r.mom?.rows), duplicate_minutes: sum(lockRows, r => r.mom?.dupMinutes),
      missing_integer_minutes: sum(lockRows, r => r.mom?.missingIntegerMinutes), fractional_values: [...new Set(lockRows.flatMap(r => r.mom?.fractionalValues ?? []))].sort((a, b) => a - b),
      v_range: [Math.min(...lockRows.filter(r => r.mom).map(r => r.mom.vMin)), Math.max(...lockRows.filter(r => r.mom).map(r => r.mom.vMax))] },
    xg_per_minute_density: { captures: lockRows.filter(r => r.xpm).length, median_rows_per_minute_of_span: median(lockRows.filter(r => r.xpm).map(r => r.xpm.density)),
      consequence: 'a row exists only in minutes someone shot, so cum_away(t) - cum_away(t-4) has to read the last row at or before each end, not a row at exactly t-4' },
    by_competition: Object.fromEntries(Object.keys(comps).map(c => { const rs = lockRows.filter(r => r.comp === c); return [c, { read: rs.length, momentum: rs.filter(r => r.momentum === 'present').length, xg_per_minute: rs.filter(r => r.xgPerMinute === 'present').length }] })) }))

  console.log(`\nCOVERAGE: ${coverage}`)
  console.log(`NHL: ${sampled}, ${actor.bearing} actor-bearing plays, control share ${controlActor.bearing ? pct(controlActor.confirmed, controlActor.bearing) : 'n/a'}`)
  const unmeasured = verdicts.filter(m => m === null).length
  if (unmeasured || !censusComplete || readsCapped) { console.log(`FAIL: ${unmeasured} verdict(s) UNMEASURED${censusComplete ? '' : '; R2 census INCOMPLETE'}${readsCapped ? '; READ CAP REACHED' : ''}`); return 1 }
  return 0
}

if (isMain(import.meta.url)) {
  const code = process.argv.includes('--self-test') ? await selfTest() : await live()
  process.exitCode = code
}
