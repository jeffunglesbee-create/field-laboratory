// Task 0 of docs/CC-CMD-2026-10-15-empowerment-metrics.md: four probes, each
// with a stop condition, run before a single type is written.
//
// WHY A RUNNER. The agent sandbox reaches neither *.workers.dev nor the NHL
// APIs (HTTP 000 on both, measured again 2026-10-16). So this runs in Actions
// and commits what it read, the same shape as probe-epl-substrate.mjs.
//
// WHAT CHANGED FROM THE FIRST PASS (docs/TASK0-RESULTS-2026-10-15-*.md, chat,
// 2026-10-15). That pass read ONE event (wc26 8348) and concluded "R2 holds
// wc26 only". /bsd/r2/list returns at most 100 keys and takes no cursor, so a
// first page cannot carry a population claim, and listing `bsd/` on
// 2026-10-16 already showed bundesliga captures uploaded up to 2026-10-11. So
// this probe ENUMERATES the store by prefix until no page is truncated, and
// every verdict below states how many captures it was taken over (Rule 91).
//
// It also runs the one check the first pass skipped: 0.3's stop condition is
// about the interval JOIN from shift to event, and "confirmed by prior work"
// was one game and 125 shots. Here it is every timed play across every final
// game on the NHL scoreboard, through field-relay-nba's own src/nhl-onice.js
// (fetched, not copied: a second copy would measure the copy).
//
// RULE 99 everywhere: a fetch lands in one of five states, and `empty` is not
// `present`. RULE 90: `--self-test` drives every analyser against fixtures,
// including the negative controls that must come out the other way.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isMain } from './checks.mjs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const NHL_WEB = process.env.NHL_WEB_URL || 'https://api-web.nhle.com'
const NHL_STATS = process.env.NHL_STATS_URL || 'https://api.nhle.com'
const CC_CMD = 'docs/CC-CMD-2026-10-15-empowerment-metrics.md'
const LIST_CALL_CAP = 600      // /bsd/r2/list pages; reported if reached
const PER_COMP_READS = 15      // newest events read per competition
const READ_CAP = 300           // stats.json + incidents.json reads in total
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

// ── R2 census ──────────────────────────────────────────────────────────────
// No cursor exists, so the store is walked by PREFIX. A page is the first 100
// keys in lexicographic order, so when it is truncated every child prefix
// whose next character sorts BEFORE the last key's is already complete on the
// page; only the last key's own child and the ones after it are re-listed.
// That pruning is what keeps a 6-digit event walk at <= 10 calls per level.
export const DIGITS = '0123456789'
export const NAME_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'   // code-point order

export async function enumerate(listPage, root, cap = LIST_CALL_CAP, alphabet = DIGITS, budget = { calls: 0 }) {
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
 * The slugs the capture writer can produce, read from field-relay-nba's own
 * source: V2_LEAGUES rows carrying bsdLeagueId, FIRST slug per league id (the
 * writer's map keeps the first), in file order. wc26 is written separately.
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

// ── 0.1 Flow: is order and interleaving reconstructible? ───────────────────
const SHOT_EVENTS = new Set(['miss', 'save', 'block', 'post', 'goal'])
const t = (s) => (s.min ?? NaN) + (s.added ?? 0) / 100   // added sorts inside its minute

/** One capture's shotmap, judged for the three things Flow needs. */
export function flowOf(stats, incidents) {
  const shots = Array.isArray(stats?.shotmap) ? stats.shotmap : null
  if (!shots) return { state: 'no-shotmap' }
  if (shots.length === 0) return { state: 'empty-shotmap' }
  const withMin = shots.filter(s => Number.isFinite(s.min)).length
  const withXg = shots.filter(s => typeof s.xg === 'number').length
  const teams = new Set(shots.map(s => s.home))
  // Array order against (min, added): non-increasing = newest first.
  let desc = 0, asc = 0, eq = 0
  for (let i = 1; i < shots.length; i++) {
    const a = t(shots[i - 1]), b = t(shots[i])
    if (a > b) desc++; else if (a < b) asc++; else eq++
  }
  const order = asc === 0 && desc > 0 ? 'newest-first' : desc === 0 && asc > 0 ? 'oldest-first' : (asc === 0 && desc === 0 ? 'all-tied' : 'mixed')
  // Ties: shots sharing (min, added), and the ones that mix teams. A mixed-team
  // tie is the only place interleaving depends on within-minute order.
  const buckets = new Map()
  for (const s of shots) { const k = `${s.min}+${s.added ?? 0}`; buckets.set(k, [...(buckets.get(k) ?? []), s]) }
  const tiedShots = [...buckets.values()].filter(b => b.length > 1).reduce((n, b) => n + b.length, 0)
  const mixedTies = [...buckets.values()].filter(b => b.length > 1 && new Set(b.map(s => s.home)).size > 1).length
  // INDEPENDENT ORDER CHECK. A goal's sequence[] lists, in order, the events
  // that led to it; when an earlier shot by a named player sits in the SAME
  // minute as the goal, the shotmap's array order either agrees with the
  // sequence or it does not. This is the proof the CC-CMD asks for before any
  // order is trusted.
  let agree = 0, disagree = 0
  for (const inc of incidents?.incidents ?? []) {
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
      // Same player AND same type, each shotmap row used once: two earlier
      // shots by one player must be two comparisons, not one counted twice.
      const pi = sameMinute.find(({ s, i }) => !used.has(i) && s.player_id === prior.pid && s.type === prior.event)
      if (!pi) continue
      used.add(pi.i)
      // newest-first means the goal (later) must sit at a SMALLER index.
      if (gi.i < pi.i) agree++; else disagree++
    }
  }
  return { state: 'present', shots: shots.length, withMin, withXg, teams: teams.size, order, desc, asc, eq, tiedShots, mixedTies, seqAgree: agree, seqDisagree: disagree }
}

// ── 0.2 Gravity: every coordinate path, classified ─────────────────────────
// A path is ON-BALL if it is a property of one event (a shot origin, a block, a
// keeper at a shot), MATCH-AVERAGE if it is one point per player for the whole
// match, and OFF-BALL-INSTANT only if many players carry coordinates under one
// time key. Only the last could feed Gravity Well.
export function coordinatePaths(obj, path = '', out = new Map()) {
  if (obj == null || typeof obj !== 'object') return out
  if (Array.isArray(obj)) { for (const el of obj.slice(0, 50)) coordinatePaths(el, path + '[]', out); return out }
  if (typeof obj.x === 'number' && typeof obj.y === 'number') out.set(path, (out.get(path) ?? 0) + 1)
  for (const [k, v] of Object.entries(obj)) coordinatePaths(v, path ? `${path}.${k}` : k, out)
  return out
}

export function classifyCoordPath(p) {
  if (/^average_positions\./.test(p) || /^(home|away)\[\]$/.test(p)) return 'match-average'
  if (/^shotmap\[\]\.(pos|gm|block)$/.test(p)) return 'on-ball (shot)'
  if (/^incidents\[\]\.sequence\[\]\.(pos|end|gk|gm)$/.test(p)) return 'on-ball (goal build-up)'
  if (/\b(frames?|tracking|positions_at|snapshots?)\b/.test(p)) return 'off-ball-instant'
  return 'unclassified'
}

/** In a goal's last sequence event: is the keeper at the shooter's end? */
export function goalFrameOf(incidents) {
  const out = []
  for (const inc of incidents?.incidents ?? []) {
    if (inc.type !== 'goal' || !Array.isArray(inc.sequence)) continue
    const g = inc.sequence.find(e => e.event === 'goal')
    if (!g?.pos || !g?.gk) continue
    const own = /own/i.test(String(inc.goal_type ?? ''))
    out.push({ home: !!inc.is_home, own, sameEnd: Math.abs(g.pos.x - g.gk.x) < 50, shooterHalf: g.pos.x >= 50 ? 'high-x' : 'low-x' })
  }
  return out
}

// ── 0.3 Second Wind: the interval join, over every timed play ──────────────
const BOUNDARY = new Set(['period-start', 'period-end', 'game-end', 'shootout-complete'])
export const elapsedOf = (period, mmss) => {
  const m = /^(\d{1,3}):(\d{2})$/.exec(String(mmss ?? ''))
  return Number.isFinite(period) && m ? (period - 1) * 1200 + Number(m[1]) * 60 + Number(m[2]) : null
}

/** Tally onIceAt's four states over a game's plays. `onIceAt` is injected. */
// The player a play is ABOUT, in priority order. A 'resolved' on-ice set is a
// body COUNT that agrees with situationCode; it is only an identity when the
// play's own actor is in it. At a goal the scorer's shift ends on the goal
// second and the end is exclusive, so the count can match with the scorer
// already gone: measured by the 2026-10-16 review, reproduced with the real
// onIceAt. So the verdict is taken over plays that NAME a player.
export const ACTOR_KEYS = ['scoringPlayerId', 'shootingPlayerId', 'hittingPlayerId', 'blockingPlayerId', 'winningPlayerId', 'committedByPlayerId', 'playerId']
export const actorOf = (p) => { for (const k of ACTOR_KEYS) if (p?.details?.[k] != null) return String(p.details[k]); return null }

/** Tally onIceAt's four states over a game's plays. `onIceAt` is injected. */
export function joinTally(onIceAt, pbp, shifts) {
  const home = pbp?.homeTeam?.id
  const tally = { all: {}, events: {}, byType: {}, actor: { bearing: 0, confirmed: 0, resolvedActorAbsent: 0, notResolved: 0 }, shootoutExcluded: 0, actorless: 0 }
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
  for (const p of pbp?.plays ?? []) {
    const period = p.periodDescriptor?.number
    if (period >= 5 && pbp?.gameType !== 3) { tally.shootoutExcluded++; continue }   // regular-season shootout: no shifts by design
    const el = elapsedOf(period, p.timeInPeriod)
    const r = onIceAt({ shifts, period, elapsedSeconds: el, homeTeamId: home, situationCode: p.situationCode ?? null })
    bump(tally.all, r.state)
    if (BOUNDARY.has(p.typeDescKey)) continue
    bump(tally.events, r.state)
    const bt = tally.byType[p.typeDescKey] ??= {}; bump(bt, r.state)
    const actor = actorOf(p)
    if (actor === null) { tally.actorless++; continue }
    tally.actor.bearing++
    if (r.state !== 'resolved') { tally.actor.notResolved++; continue }
    const on = new Set([...(r.home ?? []), ...(r.away ?? [])].map(String))
    if (on.has(actor)) tally.actor.confirmed++; else tally.actor.resolvedActorAbsent++
  }
  return tally
}

/** Sum of shift durations per player, against the boxscore's toi. */
export function toiCheck(shifts, box) {
  const secs = (mmss) => { const m = /^(\d{1,3}):(\d{2})$/.exec(String(mmss ?? '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
  const sum = new Map()
  for (const s of shifts ?? []) {
    const a = secs(s.startTime), b = secs(s.endTime)
    if (a === null || b === null || b < a) continue
    sum.set(String(s.playerId), (sum.get(String(s.playerId)) ?? 0) + (b - a))
  }
  const players = []; let dressedNotPlayed = 0
  for (const side of ['homeTeam', 'awayTeam']) {
    const g = box?.playerByGameStats?.[side]
    if (!g) continue
    for (const grp of ['forwards', 'defense', 'goalies']) for (const p of g[grp] ?? []) {
      const official = secs(p.toi)
      if (official === null) continue
      const fromShifts = sum.get(String(p.playerId)) ?? null
      // A dressed backup goalie: toi 00:00 and, correctly, no shift rows. That
      // is agreement, not a player the shift charts dropped.
      if (official === 0 && fromShifts === null) { dressedNotPlayed++; continue }
      players.push({ official, fromShifts })
    }
  }
  if (!players.length) return { state: 'unreadable', keys: Object.keys(box?.playerByGameStats ?? {}) }
  const within5 = players.filter(p => p.fromShifts !== null && Math.abs(p.fromShifts - p.official) <= 5).length
  const missing = players.filter(p => p.fromShifts === null).length
  return { state: 'present', players: players.length, within5s: within5, missingFromShifts: missing, dressedNotPlayed }
}

// ── 0.4 Tactical Lock: window and territory ────────────────────────────────
export function lockOf(stats, incidents) {
  const xpm = Array.isArray(stats?.xg_per_minute) ? stats.xg_per_minute : null
  const mom = Array.isArray(stats?.momentum) ? stats.momentum : null
  const out = {
    xgPerMinute: xpm ? (xpm.length ? 'present' : 'empty') : 'absent',
    momentum: mom ? (mom.length ? 'present' : 'empty') : 'absent',
  }
  if (xpm?.length) {
    const ms = xpm.map(r => r.m).filter(Number.isFinite)
    out.xpm = { rows: xpm.length, mMin: Math.min(...ms), mMax: Math.max(...ms), dupMinutes: ms.length - new Set(ms).size,
      hasCumAway: xpm.every(r => typeof r.cum_away === 'number'), hasCumHome: xpm.every(r => typeof r.cum_home === 'number') }
    // ADDED TIME: does a shot at 45+N / 90+N fold into row m=45 / m=90? If so a
    // window of 4 rows can span more than 4 minutes of play, and the artifact
    // must say so rather than call the window "4 minutes".
    const shotmap = stats?.shotmap ?? []
    const addedShots = shotmap.filter(s => (s.min === 45 || s.min === 90) && (s.added ?? 0) > 0 && typeof s.xg === 'number')
    out.xpm.addedTimeShots = addedShots.length
    out.xpm.maxAdded = Math.max(0, ...shotmap.map(s => s.added ?? 0))
    // Reconcile in BOTH directions, over non-trivial comparisons only. A shot
    // bucket with no xg_per_minute row is a miss; 0 === 0 on the side that did
    // not shoot is not evidence of anything and is not counted.
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
    out.xpm.addedFoldsIntoRow = addedShots.length === 0 ? null
      : addedShots.every(s => rowByM.has(s.min))
  }
  if (mom?.length) {
    const ms = mom.map(r => r.m).filter(Number.isFinite)
    const vs = mom.map(r => r.v).filter(Number.isFinite)
    out.mom = { rows: mom.length, mMin: Math.min(...ms), mMax: Math.max(...ms), vMin: Math.min(...vs), vMax: Math.max(...vs),
      fractionalRows: ms.filter(m => !Number.isInteger(m)).length }
    // SIGN, established from the data rather than assumed: in a minute where
    // only one team shot, does momentum's sign point at that team? A shot in
    // added time is keyed to the 45.5 / 90.5 row when that row exists.
    const momMs = new Set(ms)
    const keyOf = (s) => ((s.added ?? 0) > 0 && momMs.has(s.min + 0.5)) ? s.min + 0.5 : s.min
    const shotsBy = new Map()
    for (const s of stats?.shotmap ?? []) if (Number.isFinite(s.min)) {
      const k = keyOf(s); const e = shotsBy.get(k) ?? { h: 0, a: 0 }; s.home ? e.h++ : e.a++; shotsBy.set(k, e)
    }
    let homePos = 0, homeNeg = 0
    for (const r of mom) {
      const e = shotsBy.get(r.m); if (!e || !Number.isFinite(r.v) || r.v === 0) continue
      if (e.h > 0 && e.a === 0) { r.v > 0 ? homePos++ : homeNeg++ }
      if (e.a > 0 && e.h === 0) { r.v < 0 ? homePos++ : homeNeg++ }
    }
    out.mom.signAgreesHomePositive = homePos; out.mom.signDisagrees = homeNeg
  }
  // Period boundary: recoverable if incidents mark half time.
  const ht = (incidents?.incidents ?? []).find(i => i.type === 'period' && /^HT$/i.test(String(i.text ?? '')))
  out.halfTimeMarked = !!ht
  return out
}

export function verdictGravity(paths, withCoords) {
  const offBall = paths.filter(p => p.kind === 'off-ball-instant'), unclassified = paths.filter(p => p.kind === 'unclassified')
  const met = withCoords === 0 ? null : offBall.length ? false : unclassified.length ? null : true
  const reason = withCoords === 0 ? 'no capture with any coordinate was read; nothing was measured'
    : offBall.length ? `off-ball-instant paths found: ${offBall.map(p => p.path).join(', ')}`
    : unclassified.length ? `UNCLASSIFIED coordinate paths were not examined: ${unclassified.map(p => p.path).join(', ')}`
    : `every coordinate path in ${withCoords} captures is on-ball (one event) or a match average (one point per player per match); none carries several players at one instant`
  return { met, reason }
}

/** Which frame goal build-ups are in, from the counts, against the contract's claim. */
export function frameReading({ hs, hHigh, as, aLow, declared }) {
  if (hs < 5 || as < 5) return { shared: null, reading: `unmeasured: needs >= 5 non-own goals per side (home ${hs}, away ${as})` }
  const shared = hHigh / hs >= 0.9 && aLow / as >= 0.9
  const targetRel = hHigh / hs <= 0.1 && aLow / as >= 0.9   // both sides near x=0
  if (shared) return { shared: true, reading: `ONE SHARED frame, home attacks high x (home ${hHigh}/${hs} high-x, away ${aLow}/${as} low-x)` + (declared === 'target-goal-relative' ? '; CONTRADICTS /bsd/contract, which declares target-goal-relative (under that frame BOTH sides would score near x=0). Its confirming example is an AWAY goal, which reads the same under both frames.' : '') }
  if (targetRel) return { shared: false, reading: `target-goal-relative, as /bsd/contract declares (home ${hHigh}/${hs} high-x, away ${aLow}/${as} low-x)` }
  return { shared: false, reading: `no single frame fits (home ${hHigh}/${hs} high-x, away ${aLow}/${as} low-x)` }
}

// ── verdicts ───────────────────────────────────────────────────────────────
const sum = (arr, f) => arr.reduce((n, x) => n + (f(x) || 0), 0)

// Event types that can sit BETWEEN two shots and tell us the opponent had the
// ball. The spec asks for "event order AND possession attribution"; Task 1
// defines Flow as "no opponent event interleaved". A shot list can only show
// opponent SHOTS, so these are what would have to exist for Flow as specified.
export const POSSESSION_EVENT = /\b(pass|possession|turnover|dispossess|interception|recovery|clearance|tackle|carry|dribble)\b/i

export function verdictFlow(rows, possessionEventsSeen = []) {
  const present = rows.filter(r => r.state === 'present')
  if (present.length === 0) return { met: null, verdict: 'UNMEASURED', reason: `no capture with a shotmap was read (${rows.length} rows); nothing was measured` }
  const orderKey = present.filter(r => r.withMin === r.shots).length
  const bothTeams = present.filter(r => r.teams === 2).length
  const agree = sum(present, r => r.seqAgree), disagree = sum(present, r => r.seqDisagree)
  const orders = {}; for (const r of present) orders[r.order] = (orders[r.order] ?? 0) + 1
  const allNewestFirst = present.every(r => r.order === 'newest-first' || r.order === 'all-tied')
  const noOrderKey = orderKey < present.length * 0.95
  const noOpponentShots = bothTeams === 0
  const noPossession = possessionEventsSeen.length === 0
  const met = noOrderKey || noOpponentShots || noPossession
  const ownOrder = allNewestFirst && disagree === 0 && agree > 0
  return {
    met, verdict: met ? 'MET' : 'NOT MET',
    reading: 'as SPECIFIED: three xG events with no opponent EVENT interleaved, which needs possession attribution',
    reason: noOrderKey ? `shots lack min in ${present.length - orderKey}/${present.length} captures`
      : noOpponentShots ? 'no capture carries both teams\' shots'
      : noPossession ? `the payload carries no per-event possession: between two shots only opponent SHOTS are visible (shotmap) and incidents carry goals, cards, substitutions and periods; no pass, turnover or possession event in ${present.length} captures`
      : `ordering key in ${orderKey}/${present.length}, both teams in ${bothTeams}/${present.length}, possession events seen: ${possessionEventsSeen.join(', ')}`,
    narrowed_variant: {
      definition: 'three consecutive own-team SHOTS with no opposing SHOT between (the narrowing docs/TASK0-RESULTS-2026-10-15 proposed); an owner decision, not this probe\'s',
      reconstructible: !noOrderKey && !noOpponentShots,
      ordering_key: `min (+added) on every shot in ${orderKey}/${present.length} captures`,
      both_teams: `${bothTeams}/${present.length} captures`,
      own_team_within_minute_order: ownOrder
        ? `array order newest-first in every capture, and agrees with goal build-up sequences ${agree}/${agree + disagree} (own-team only: a sequence lists one team)`
        : `NOT proven: ${allNewestFirst ? '' : 'some captures are not newest-first; '}sequence checks agree ${agree}, disagree ${disagree}`,
      cross_team_within_minute_order: `UNORDERED: no independent source orders two teams' shots inside one minute; ${sum(present, r => r.mixedTies)} mixed-team tied minutes across ${sum(present, r => r.shots)} shots`,
    },
    within_minute_order: { array_order_by_capture: orders, goal_sequence_checks_agree: agree, disagree },
    ties: { tied_shots: sum(present, r => r.tiedShots), mixed_team_tied_minutes: sum(present, r => r.mixedTies), shots: sum(present, r => r.shots) },
  }
}

// A territory proxy is only a denominator once its DIRECTION is known: a signed
// number that cannot be tied to a team says nothing about which side is on top.
export const SIGN_MIN_MINUTES = 30
export const SIGN_MIN_SHARE = 0.6

export function verdictLock(rows) {
  const n = rows.length
  if (n === 0) return { met: null, verdict: 'UNMEASURED', reason: 'no capture was read; nothing was measured' }
  const mom = rows.filter(r => r.momentum === 'present').length
  const xpm = rows.filter(r => r.xgPerMinute === 'present').length
  const signAgree = sum(rows, r => r.mom?.signAgreesHomePositive), signDis = sum(rows, r => r.mom?.signDisagrees)
  const signN = signAgree + signDis
  const share = signN ? Math.max(signAgree, signDis) / signN : 0
  const established = signN >= SIGN_MIN_MINUTES && share >= SIGN_MIN_SHARE
  const direction = !established ? 'UNPROVEN' : signAgree >= signDis ? 'positive = home on top' : 'positive = away on top'
  const met = mom === 0 ? true : established ? false : null
  return {
    met, verdict: met === true ? 'MET' : met === false ? 'NOT MET' : 'UNMEASURED',
    reason: mom === 0 ? 'no per-minute territory proxy (momentum) in any capture: Tactical Lock would reduce to "the opponent did not shoot"'
      : established ? `momentum present in ${mom}/${n} captures (xg_per_minute ${xpm}/${n}), and its sign points at the shooting team in ${Math.max(signAgree, signDis)}/${signN} one-team minutes (${(100 * share).toFixed(0)}%): ${direction}`
      : `momentum present in ${mom}/${n} captures but its DIRECTION is not established (${signAgree} vs ${signDis} over ${signN} one-team minutes; needs >= ${SIGN_MIN_MINUTES} at >= ${100 * SIGN_MIN_SHARE}%)`,
    momentum_sign: { agree_if_positive_is_home: signAgree, against: signDis, minutes: signN, direction },
    half_time_marked: rows.filter(r => r.halfTimeMarked).length,
    added_time: { shots_in_45plus_or_90plus: sum(rows, r => r.xpm?.addedTimeShots), captures_where_they_fold_into_the_45_or_90_row: rows.filter(r => r.xpm?.addedFoldsIntoRow === true).length,
      captures_with_fractional_momentum_rows: rows.filter(r => (r.mom?.fractionalRows ?? 0) > 0).length, max_added_minutes_seen: Math.max(0, ...rows.map(r => r.xpm?.maxAdded ?? 0)),
      consequence: 'xg_per_minute folds 45+N into m=45 and 90+N into m=90, so a window of 4 rows ending at 45 or 90 can cover 4 + N minutes of play. A 4-minute active-play window has to be built from the shotmap\'s (min, added), not from row counts.' },
    reconcile_shotmap_vs_xg_per_minute: { match: sum(rows, r => r.xpm?.reconcileMatch), miss: sum(rows, r => r.xpm?.reconcileMiss), shot_minute_without_row: sum(rows, r => r.xpm?.shotMinuteWithoutRow) },
  }
}

// ── self-test ──────────────────────────────────────────────────────────────
function selfTest() {
  let fail = 0
  const ok = (name, c) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${name}`); if (!c) fail++ }
  ok('empty envelope is empty, not present', classify({ ok: true, json: {}, contentful: false }) === 'empty')
  ok('a thrown fetch is unreachable', classify({ threw: true }) === 'unreachable')

  // Census: a truncated page is split, pruned at the last key, and nothing is lost.
  const store = []
  for (let i = 0; i < 260; i++) for (const f of ['incidents.json', 'stats.json']) store.push({ key: `bsd/x/${213600 + i * 7}/${f}`, uploaded: '2026-10-01' })
  store.sort((a, b) => (a.key < b.key ? -1 : 1))
  const fakeList = async (p) => { const ks = store.filter(k => k.key.startsWith(p)); return { keys: ks.slice(0, 100), truncated: ks.length > 100 } }
  ok('writer slugs: first slug per league id, in file order',
    JSON.stringify(writerSlugs("    'ucl':  { bsdLeagueId: 7 },\n    'uclqual': { bsdLeagueId: 7 },\n    'mls': { x: 1, bsdLeagueId: 18 },\n    'nba': { espn: 'x' },")) === '["ucl","mls"]')
  return enumerate(fakeList, 'bsd/x/', 500).then(({ keys, capped, calls }) => {
    ok(`enumeration recovers all ${store.length} keys past truncated pages (${calls} calls)`, keys.length === store.length && !capped)
    return enumerate(fakeList, 'bsd/x/', 1)
  }).then(({ capped }) => {
    ok('a call cap is reported, not silent', capped === true)

    // Flow: newest-first array, goal sequence in the same minute.
    const stats = { shotmap: [
      { min: 12, home: false, type: 'goal', player_id: 2, xg: 0.3 },
      { min: 12, home: false, type: 'miss', player_id: 1, xg: 0.02 },
      { min: 5, home: true, type: 'save', player_id: 9, xg: 0.1 },
    ] }
    const inc = { incidents: [{ type: 'goal', minute: 12, added_time: null, sequence: [{ event: 'miss', pid: 1 }, { event: 'goal', pid: 2 }] }] }
    const f = flowOf(stats, inc)
    ok('newest-first order is read as newest-first', f.order === 'newest-first')
    ok('the goal sequence agrees with newest-first order', f.seqAgree === 1 && f.seqDisagree === 0)
    const flipped = { shotmap: [stats.shotmap[1], stats.shotmap[0], stats.shotmap[2]] }
    ok('NEGATIVE CONTROL: a swapped pair disagrees with the sequence', flowOf(flipped, inc).seqDisagree === 1)
    ok('both teams counted', f.teams === 2)
    ok('an absent shotmap is its own state', flowOf({}, inc).state === 'no-shotmap')
    ok('NEGATIVE CONTROL: one-team shotmaps meet the Flow stop condition',
      verdictFlow([flowOf({ shotmap: [{ min: 1, home: true }, { min: 2, home: true }] }, {})], ['incidents:pass']).met === true)
    ok('no capture read is UNMEASURED, never MET', verdictFlow([]).met === null)
    ok('Flow as specified needs possession events: none seen is MET', verdictFlow([f]).met === true)
    ok('...and a possession event type seen makes it NOT MET', verdictFlow([f], ['incidents:pass']).met === false)
    ok('the shots-only narrowing is reported as reconstructible', verdictFlow([f]).narrowed_variant.reconstructible === true)
    const twoPriors = { shotmap: [{ min: 7, home: true, type: 'goal', player_id: 30 }, { min: 7, home: true, type: 'save', player_id: 10 }, { min: 7, home: true, type: 'post', player_id: 10 }] }
    ok('two earlier shots by one player are two comparisons, one row each',
      flowOf(twoPriors, { incidents: [{ type: 'goal', minute: 7, added_time: null, sequence: [{ event: 'save', pid: 10 }, { event: 'post', pid: 10 }, { event: 'goal', pid: 30 }] }] }).seqAgree === 2)
    // Two SAVES by one player, one row on each side of the goal: each prior must
    // take its own row (1 agree, 1 disagree), not both land on the first.
    const reuse = flowOf({ shotmap: [{ min: 9, home: true, type: 'save', player_id: 10 }, { min: 9, home: true, type: 'goal', player_id: 30 }, { min: 9, home: true, type: 'save', player_id: 10 }] },
      { incidents: [{ type: 'goal', minute: 9, added_time: null, sequence: [{ event: 'save', pid: 10 }, { event: 'save', pid: 10 }, { event: 'goal', pid: 30 }] }] })
    ok('NEGATIVE CONTROL: a shotmap row is used once per goal', reuse.seqAgree === 1 && reuse.seqDisagree === 1)

    // Gravity: classifications.
    const paths = coordinatePaths({ shotmap: [{ pos: { x: 1, y: 2 }, gm: { x: 0, y: 3 } }], average_positions: { home: [{ x: 5, y: 6 }] } })
    ok('shot origin is on-ball', classifyCoordPath('shotmap[].pos') === 'on-ball (shot)' && paths.has('shotmap[].pos'))
    ok('average positions are match-average, not instants', classifyCoordPath('average_positions.home[]') === 'match-average')
    ok('a tracking-frame path would be off-ball', classifyCoordPath('frames[].players[]') === 'off-ball-instant')
    ok('goal frame: keeper at the shooter end', goalFrameOf({ incidents: [{ type: 'goal', is_home: true, sequence: [{ event: 'goal', pos: { x: 80, y: 50 }, gk: { x: 98, y: 50 } }] }] })[0].sameEnd === true)

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
    const idJoin = joinTally(() => ({ state: 'resolved', home: [7], away: [] }), { homeTeam: { id: 1 }, gameType: 2, plays: [
      { typeDescKey: 'shot-on-goal', periodDescriptor: { number: 1 }, timeInPeriod: '01:00', details: { shootingPlayerId: 7 } },
      { typeDescKey: 'goal', periodDescriptor: { number: 1 }, timeInPeriod: '02:00', details: { scoringPlayerId: 8 } },
      { typeDescKey: 'hit', periodDescriptor: { number: 1 }, timeInPeriod: '02:30', details: { hittingPlayerId: 7, hitteePlayerId: 9 } },
      { typeDescKey: 'stoppage', periodDescriptor: { number: 1 }, timeInPeriod: '03:00', details: { reason: 'icing' } } ] }, [{}])
    ok('an actor in the resolved set is confirmed', idJoin.actor.confirmed === 2)
    ok('NEGATIVE CONTROL: a resolved count WITHOUT the actor is not confirmed', idJoin.actor.resolvedActorAbsent === 1)
    ok('a play naming nobody is outside the identity denominator', idJoin.actor.bearing === 3 && idJoin.actorless === 1)
    ok('elapsed seconds use the period offset', elapsedOf(2, '01:05') === 1265)
    const toi = toiCheck([{ playerId: 7, startTime: '00:00', endTime: '00:45' }], { playerByGameStats: { homeTeam: { forwards: [{ playerId: 7, toi: '00:45' }] } } })
    ok('shift-summed TOI matches the boxscore', toi.within5s === 1)
    ok('an unreadable boxscore says so', toiCheck([], {}).state === 'unreadable')
    const backup = toiCheck([{ playerId: 7, startTime: '00:00', endTime: '00:45' }], { playerByGameStats: { homeTeam: { forwards: [{ playerId: 7, toi: '00:45' }], goalies: [{ playerId: 31, toi: '00:00' }] } } })
    ok('a dressed backup goalie is not a player the shift charts dropped', backup.missingFromShifts === 0 && backup.dressedNotPlayed === 1)

    // Tactical Lock.
    const lk = lockOf({ xg_per_minute: [{ m: 5, xg_home: 0.1, xg_away: 0, cum_home: 0.1, cum_away: 0 }, { m: 12, xg_home: 0, xg_away: 0.32, cum_home: 0.1, cum_away: 0.32 }], momentum: [{ m: 5, v: 20 }, { m: 12, v: -30 }], shotmap: stats.shotmap }, { incidents: [{ type: 'period', text: 'HT' }] })
    ok('per-minute xG reconciles with the shotmap (non-trivial comparisons only)', lk.xpm.reconcileMatch === 2 && lk.xpm.reconcileMiss === 0)
    const dropped = lockOf({ xg_per_minute: [{ m: 5, xg_home: 0.1, xg_away: 0, cum_home: 0.1, cum_away: 0 }], momentum: [{ m: 5, v: 20 }], shotmap: stats.shotmap }, {})
    ok('NEGATIVE CONTROL: a shot minute with no xg_per_minute row is caught', dropped.xpm.shotMinuteWithoutRow === 1)
    ok('added time is keyed to the .5 momentum row when it exists',
      lockOf({ xg_per_minute: [{ m: 45, xg_home: 0, xg_away: 0.2 }], momentum: [{ m: 45, v: 30 }, { m: 45.5, v: -10 }], shotmap: [{ min: 45, added: 3, home: false, xg: 0.2 }] }, {}).mom.signAgreesHomePositive === 1)
    ok('momentum sign read in BOTH directions: home-only +, away-only -', lk.mom.signAgreesHomePositive === 2 && lk.mom.signDisagrees === 0)
    ok('NEGATIVE CONTROL: no momentum anywhere meets the Lock stop condition', verdictLock([lockOf({ xg_per_minute: [] }, {})]).met === true)
    ok('no capture read is UNMEASURED', verdictLock([]).met === null)
    const signRows = (a, d) => [{ momentum: 'present', xgPerMinute: 'present', mom: { signAgreesHomePositive: a, signDisagrees: d } }]
    ok('momentum present but direction unproven is UNMEASURED, not NOT MET', verdictLock(signRows(10, 9)).met === null)
    ok('momentum present with an established direction is NOT MET', verdictLock(signRows(40, 10)).met === false)
    ok('keyCensus finds shot and xg keys', keyCensus({ games: [{ xg_home: 1, odds: 2 }] }, /shot|xg/i).has('games[].xg_home'))
    ok('gravity: nothing read is UNMEASURED', verdictGravity([], 0).met === null)
    ok('gravity: only on-ball and match-average paths is MET', verdictGravity([{ path: 'shotmap[].pos', kind: 'on-ball (shot)' }], 3).met === true)
    ok('NEGATIVE CONTROL: an unclassified path blocks MET', verdictGravity([{ path: 'lineups[].players[]', kind: 'unclassified' }], 3).met === null)
    ok('frame: home high-x and away low-x is one shared frame', frameReading({ hs: 18, hHigh: 18, as: 6, aLow: 6, declared: 'target-goal-relative' }).shared === true)
    ok('frame: both sides near zero is target-goal-relative', frameReading({ hs: 10, hHigh: 0, as: 10, aLow: 10 }).shared === false)
    ok('frame: too few goals is unmeasured', frameReading({ hs: 2, hHigh: 2, as: 9, aLow: 9 }).shared === null)
    ok('half time is recoverable from incidents', lk.halfTimeMarked === true)

    console.log(fail ? `self-test: ${fail} FAILED` : 'self-test: all passed')
    return fail ? 1 : 0
  })
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

/** Keys matching /shot|xg/i anywhere in an object, with the paths they sit at. */
export function keyCensus(obj, re, path = '', out = new Set(), depth = 0) {
  if (obj == null || typeof obj !== 'object' || depth > 6) return out
  if (Array.isArray(obj)) { for (const el of obj.slice(0, 5)) keyCensus(el, re, path + '[]', out, depth + 1); return out }
  for (const [k, v] of Object.entries(obj)) { const p = path ? `${path}.${k}` : k; if (re.test(k)) out.add(p); keyCensus(v, re, p, out, depth + 1) }
  return out
}

export const SHELL_BYTES = 1000   // a stats.json this small has an empty shotmap (ucl/europa shells, measured 2026-10-16)

async function live() {
  const at = new Date().toISOString()
  const base = { cc_cmd: CC_CMD, ran_at: at, relay: RELAY }
  const failedPages = []

  // R2 census. One retry per page; a page that still fails is NAMED, and the
  // census is not called complete while any page failed (a dropped root page
  // would otherwise remove a whole competition silently).
  const listPage = async (prefix) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await getJson(`${RELAY}/bsd/r2/list?prefix=${encodeURIComponent(prefix)}`, j => Array.isArray(j?.keys))
      if (r.state === 'present' || r.state === 'empty') return r.json
    }
    failedPages.push(prefix); return null
  }
  const budget = { calls: 0 }
  let derived = [], derivedFrom = process.env.RELAY_INDEX_PATH || 'RELAY_INDEX_PATH unset'
  if (process.env.RELAY_INDEX_PATH) { try { derived = writerSlugs(readFileSync(process.env.RELAY_INDEX_PATH, 'utf8')) } catch (e) { derivedFrom = `unreadable: ${String(e).slice(0, 100)}` } }
  if (derived.length === 0) derivedFrom += ' (parsed 0 slugs)'
  const swept = new Set()
  for (const c of NAME_CHARS) {
    budget.calls++
    const page = await listPage(`bsd/${c}`)
    for (const k of page?.keys ?? []) { const m = /^bsd\/([^/]+)\//.exec(k.key); if (m) swept.add(m[1]) }
  }
  const slugs = [...new Set([...derived, 'wc26', ...swept])]
  const allKeys = []; let capped = false
  for (const sl of slugs) {
    const r = await enumerate(listPage, `bsd/${sl}/`, LIST_CALL_CAP, DIGITS, budget)
    allKeys.push(...r.keys); capped = capped || r.capped
  }
  const censusComplete = !capped && failedPages.length === 0 && derived.length > 0
  const comps = groupCaptures(allKeys)
  const sizeOf = new Map(allKeys.map(k => [k.key, k.size]))
  const compSummary = Object.fromEntries(Object.entries(comps).map(([c, v]) => {
    const evs = Object.entries(v.events)
    const statsSize = ([ev]) => sizeOf.get(`bsd/${c}/${ev}/stats.json`) ?? 0
    return [c, { events: evs.length, first_upload: v.first, last_upload: v.last,
      with_stats: evs.filter(([, e]) => e.files.includes('stats.json')).length,
      shell_stats_under_1000_bytes: evs.filter(e => e[1].files.includes('stats.json') && statsSize(e) < SHELL_BYTES).length,
      avg_positions_file_populated: evs.filter(([ev]) => (sizeOf.get(`bsd/${c}/${ev}/average-positions.json`) ?? 0) > 2).length,
      avg_positions_file_empty: evs.filter(([ev, e]) => e.files.includes('average-positions.json') && (sizeOf.get(`bsd/${c}/${ev}/average-positions.json`) ?? 0) <= 2).length }]
  }))
  const censusLine = `census ${censusComplete ? 'COMPLETE' : 'INCOMPLETE'} for ${slugs.length} slugs, ${budget.calls} list calls`
    + (capped ? ', CAPPED' : '') + (failedPages.length ? `, ${failedPages.length} page(s) failed after a retry: ${failedPages.slice(0, 5).join(', ')}` : '')
    + (derived.length ? '' : ', relay slug source parsed 0 slugs')
  console.log(`R2 ${censusLine}: ${allKeys.length} keys, ${Object.keys(comps).length} competitions`)
  for (const [c, s] of Object.entries(compSummary)) console.log(`  ${c.padEnd(14)} events ${String(s.events).padStart(4)}  shells ${String(s.shell_stats_under_1000_bytes).padStart(3)}  ${s.first_upload?.slice(0, 10)} -> ${s.last_upload?.slice(0, 10)}`)

  // Sample: the newest PER_COMP_READS NON-SHELL events per competition.
  const sample = []
  for (const [c, v] of Object.entries(comps)) {
    const evs = Object.entries(v.events).filter(([ev, e]) => e.files.includes('stats.json') && (sizeOf.get(`bsd/${c}/${ev}/stats.json`) ?? 0) >= SHELL_BYTES)
      .sort((a, b) => String(b[1].uploaded).localeCompare(String(a[1].uploaded))).slice(0, PER_COMP_READS)
    for (const [ev, e] of evs) sample.push({ comp: c, event: ev, hasIncidents: e.files.includes('incidents.json') })
  }
  const readable = []; let reads = 0, readFailures = 0
  for (const sm of sample) {
    if (reads + 2 > READ_CAP) break
    const st = await getJson(`${RELAY}/bsd/r2/read?key=${encodeURIComponent(`bsd/${sm.comp}/${sm.event}/stats.json`)}`, j => j && typeof j === 'object'); reads++
    const inc = sm.hasIncidents ? (reads++, await getJson(`${RELAY}/bsd/r2/read?key=${encodeURIComponent(`bsd/${sm.comp}/${sm.event}/incidents.json`)}`, j => Array.isArray(j?.incidents))) : null
    if (st.state !== 'present') readFailures++
    readable.push({ ...sm, stats: st.state === 'present' ? st.json : null, incidents: inc?.state === 'present' ? inc.json : null })
  }
  const capturesTotal = Object.values(compSummary).reduce((n, c) => n + c.with_stats - c.shell_stats_under_1000_bytes, 0)
  const read = readable.filter(r => r.stats)
  // CAPTURE TIMING: the club-endgame writer fires at minute 80-120, often in
  // play, so a capture can stop short of full time. Counted, not assumed.
  const inPlay = read.filter(r => (r.incidents?.incidents ?? []).some(i => i.type === 'period' && i.is_live === true)).length
  const coverage = `${read.length} of ${capturesTotal} non-shell R2 captures read; ${inPlay} of them were captured IN PLAY (a period marker reads is_live true), so their last minutes can be missing  (newest ${PER_COMP_READS} per competition, ${Object.keys(comps).length} competitions${readFailures ? `, ${readFailures} read(s) failed` : ''}); ${censusLine}. Slugs come from the relay writer's V2_LEAGUES map + wc26 + the first competition under each letter.`

  const verdicts = []

  // 0.1 Flow
  const flowRows = read.map(r => ({ comp: r.comp, event: r.event, ...flowOf(r.stats, r.incidents) }))
  const topTypes = new Set()
  for (const r of read) {
    for (const sh of r.stats.shotmap ?? []) if (sh.type) topTypes.add(`shotmap:${sh.type}`)
    for (const i of r.incidents?.incidents ?? []) if (i.type) topTypes.add(`incidents:${i.type}`)
  }
  const possessionSeen = [...topTypes].filter(ty => POSSESSION_EVENT.test(ty.split(':')[1]))
  const ctxDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const ctx = await getJson(`${RELAY}/context/date/${ctxDate}`, j => j && typeof j === 'object')
  const vf = verdictFlow(flowRows, possessionSeen)
  verdicts.push(artifact('flow', { ...base, task: '0.1 Flow',
    stop_condition: { text: 'shots carry no within-match ordering key, or carry no opponent-event interleaving', met: vf.met, reason: vf.reason },
    coverage: `${flowRows.filter(r => r.state === 'present').length} captures with a non-empty shotmap; ${coverage}`, verdict: vf,
    event_types_between_shots: [...topTypes].sort(),
    context_date: { date: ctxDate, state: ctx.state, shot_or_xg_keys: ctx.state === 'present' ? [...keyCensus(ctx.json, /shot|xg/i)].slice(0, 40) : null,
      note: '/context/date is the laboratory\'s own input; the spec asks what it serves. Flow can only come from /bsd/r2/read stats.json.' },
    by_competition: Object.fromEntries(Object.keys(comps).map(c => [c, flowRows.filter(r => r.comp === c).reduce((o, r) => { o[r.state] = (o[r.state] ?? 0) + 1; return o }, {})])),
    r2_census: compSummary,
    r2_census_meta: { complete: censusComplete, list_calls: budget.calls, capped, failed_pages: failedPages, slugs_from_relay_source: derived, source_file: derivedFrom, first_letter_sweep: [...swept], swept_but_not_in_source: [...swept].filter(x => !derived.includes(x) && x !== 'wc26') } }))

  // 0.2 Gravity
  const pathCounts = new Map(); let withCoords = 0
  for (const r of read) {
    const ps = new Map([...coordinatePaths(r.stats), ...(r.incidents ? coordinatePaths(r.incidents) : [])])
    if (ps.size) withCoords++
    for (const [p] of ps) pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1)
  }
  const paths = [...pathCounts].map(([p, n]) => ({ path: p, captures: n, kind: classifyCoordPath(p) })).sort((a, b) => b.captures - a.captures)
  const vg = verdictGravity(paths, withCoords)
  const frames = read.flatMap(r => goalFrameOf(r.incidents).map(g => ({ ...g, comp: r.comp })))
  const nonOwn = frames.filter(g => !g.own)
  const hs = nonOwn.filter(g => g.home), as = nonOwn.filter(g => !g.home)
  const hHigh = hs.filter(g => g.shooterHalf === 'high-x').length, aLow = as.filter(g => g.shooterHalf === 'low-x').length
  const contract = await getJson(`${RELAY}/bsd/contract`, j => j?.frames)
  const declared = contract.state === 'present' ? contract.json.frames?.['incidents[].sequence[].pos']?.frame ?? null : null
  const fr = frameReading({ hs: hs.length, hHigh, as: as.length, aLow, declared })
  verdicts.push(artifact('gravity', { ...base, task: '0.2 Gravity Well',
    stop_condition: { text: 'soccer provides on-ball data only -> Gravity Well rejected for soccer, built for NFL', met: vg.met, reason: vg.reason },
    coverage: `${withCoords} captures carrying coordinates; ${coverage}`, coordinate_paths: paths,
    goal_frame_check: { goals_with_pos_and_gk: frames.length, non_own: nonOwn.length, home_scorers: hs.length, home_scorer_high_x: hHigh, away_scorers: as.length, away_scorer_low_x: aLow,
      contract_declares: declared, shared_frame: fr.shared, reading: fr.reading },
    nfl: { status: 'INHERITED, not re-measured here', evidence: [
      'jubilant-bassoon outbox/bdb-schema-probe.txt (2026-08-15): tracking cols gameId, playId, nflId, displayName, frameId, frameType, time, jerseyNumber, club, playDirection, x, y, s, a, dis, o, dir, event; 400,000 rows sampled',
      'jubilant-bassoon outbox/cc-session-2026-08-15-p3-bdb-sep-route.md: avgSepYds built from receiver-to-defender distance at pass_arrived, which needs off-ball defender XY at that frame',
      'archived dataset alexandermeau/nfl-big-data-bowl-archived-data-2025 is the 2022 SEASON; Kaggle credentials live in jubilant-bassoon, not here' ] } }))

  // 0.3 Second Wind
  let onIceAt = null, onIceSrc = process.env.NHL_ONICE_PATH || 'NHL_ONICE_PATH unset'
  if (process.env.NHL_ONICE_PATH) { try { ({ onIceAt } = await import(pathToFileURL(process.env.NHL_ONICE_PATH).href)) } catch (e) { onIceSrc = `import failed: ${String(e).slice(0, 120)}` } }
  const board = await getJson(`${NHL_WEB}/v1/scoreboard/now`, j => Array.isArray(j?.gamesByDate))
  const finals = board.state === 'present' ? board.json.gamesByDate.flatMap(d => d.games ?? []).filter(g => ['FINAL', 'OFF'].includes(g.gameState)).slice(-NHL_GAME_CAP) : []
  const games = []
  if (typeof onIceAt === 'function') {
    for (const g of finals) {
      const pbp = await getJson(`${NHL_WEB}/v1/gamecenter/${g.id}/play-by-play`, j => Array.isArray(j?.plays) && j.plays.length > 0)
      const sc = await getJson(`${NHL_STATS}/stats/rest/en/shiftcharts?cayenneExp=gameId=${g.id}`, j => Array.isArray(j?.data) && j.data.length > 0)
      const box = await getJson(`${NHL_WEB}/v1/gamecenter/${g.id}/boxscore`, j => j && typeof j === 'object')
      const joined = pbp.state === 'present' && sc.state === 'present'
      games.push({ id: g.id, pbp: pbp.state, shifts: sc.state, shiftRows: sc.state === 'present' ? sc.json.data.length : 0, joined,
        tally: joined ? joinTally(onIceAt, pbp.json, sc.json.data) : null,
        toi: joined && box.state === 'present' ? toiCheck(sc.json.data, box.json) : { state: joined ? box.state : 'not-joined' } })
    }
  }
  const joinedGames = games.filter(g => g.joined)
  const aggT = (k) => joinedGames.reduce((o, g) => { for (const [st, n] of Object.entries(g.tally[k] ?? {})) o[st] = (o[st] ?? 0) + n; return o }, {})
  const actor = joinedGames.reduce((o, g) => { for (const [k, n] of Object.entries(g.tally.actor)) o[k] += n; return o }, { bearing: 0, confirmed: 0, resolvedActorAbsent: 0, notResolved: 0 })
  const confirmedShare = actor.bearing ? actor.confirmed / actor.bearing : 0
  const byType = {}
  for (const g of joinedGames) for (const [ty, st] of Object.entries(g.tally.byType)) { const o = byType[ty] ??= {}; for (const [k, n] of Object.entries(st)) o[k] = (o[k] ?? 0) + n }
  const swMet = actor.bearing === 0 ? null : confirmedShare <= 0.5
  verdicts.push(artifact('second-wind', { ...base, task: '0.3 Second Wind (NHL)',
    stop_condition: { text: 'the interval join cannot resolve a majority of events', met: swMet,
      reason: actor.bearing === 0 ? `no actor-bearing play was joined: onIceAt ${typeof onIceAt === 'function' ? 'loaded' : 'NOT loaded (' + onIceSrc + ')'}, scoreboard ${board.state}, ${finals.length} finals, ${joinedGames.length} with play-by-play AND shift rows`
        : `${actor.confirmed} of ${actor.bearing} plays that name a player resolve to an on-ice set CONTAINING that player (${(100 * confirmedShare).toFixed(1)}%), across ${joinedGames.length} of ${finals.length} finals with play-by-play and shift rows` },
    coverage: `${joinedGames.length} of ${finals.length} final games on /v1/scoreboard/now joined (cap ${NHL_GAME_CAP}); ${games.length - joinedGames.length} lacked play-by-play or shift rows and are availability, not join failures; every timed play in the joined games`,
    identity: { actor_bearing_plays: actor.bearing, resolved_with_actor_on_ice: actor.confirmed, resolved_but_actor_absent: actor.resolvedActorAbsent, not_resolved: actor.notResolved,
      actor_keys_in_priority: ACTOR_KEYS, why: 'a resolved set is a body count that agrees with situationCode; it is an identity only when the play\'s own actor is in it' },
    excluded: { boundary_markers: [...BOUNDARY], actorless_plays: joinedGames.reduce((n, g) => n + g.tally.actorless, 0), regular_season_shootout_plays: joinedGames.reduce((n, g) => n + g.tally.shootoutExcluded, 0) },
    onice_module: onIceSrc, states_events_body_count: aggT('events'), states_all_plays: aggT('all'), states_by_type: byType,
    toi_from_shifts_vs_boxscore: { players: joinedGames.reduce((n, g) => n + (g.toi?.players ?? 0), 0), within_5s: joinedGames.reduce((n, g) => n + (g.toi?.within5s ?? 0), 0),
      missing_from_shifts_with_ice_time: joinedGames.reduce((n, g) => n + (g.toi?.missingFromShifts ?? 0), 0), dressed_not_played_excluded: joinedGames.reduce((n, g) => n + (g.toi?.dressedNotPlayed ?? 0), 0) },
    games: games.map(({ tally, ...g }) => ({ ...g, actor: tally?.actor ?? null })) }))

  // 0.4 Tactical Lock
  const lockRows = read.map(r => ({ comp: r.comp, event: r.event, ...lockOf(r.stats, r.incidents) }))
  const vl = verdictLock(lockRows)
  verdicts.push(artifact('tactical-lock', { ...base, task: '0.4 Tactical Lock',
    stop_condition: { text: 'no territory proxy exists in the payload', met: vl.met, reason: vl.reason }, coverage, verdict: vl,
    by_competition: Object.fromEntries(Object.keys(comps).map(c => { const rs = lockRows.filter(r => r.comp === c); return [c, { read: rs.length, momentum: rs.filter(r => r.momentum === 'present').length, xg_per_minute: rs.filter(r => r.xgPerMinute === 'present').length }] })),
    xg_per_minute_shapes_first10: lockRows.filter(r => r.xpm).slice(0, 10).map(r => ({ comp: r.comp, event: r.event, ...r.xpm })),
    active_play: 'xg_per_minute and momentum are per MINUTE, with added time folded (see verdict.added_time). A window stays inside one half by splitting at the HT period marker; dead ball inside a minute is not observable at this grain.' }))

  console.log(`\nCOVERAGE: ${coverage}`)
  console.log(`NHL: ${joinedGames.length} of ${finals.length} finals joined, ${actor.bearing} actor-bearing plays`)
  const unmeasured = verdicts.filter(m => m === null).length
  if (unmeasured || !censusComplete) { console.log(`FAIL: ${unmeasured} verdict(s) UNMEASURED${censusComplete ? '' : '; R2 census INCOMPLETE'}`); return 1 }
  return 0
}

if (isMain(import.meta.url)) {
  const code = process.argv.includes('--self-test') ? await selfTest() : await live()
  process.exitCode = code
}
