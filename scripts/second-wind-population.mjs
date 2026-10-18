#!/usr/bin/env node
// Second Wind's reference population, read through the F# and nothing else.
//
// WHY. src/Stamina.fs reads a skater's last third of regulation ice against
// his band's expected last-third share, and that share is a property of a
// season, not of a game. This script fetches one: the 2025-26 regular season,
// every 4th game id (2025020001 + 4k, k = 0..327), play-by-play from
// api-web.nhle.com and shift charts from api.nhle.com/stats/rest/en/shiftcharts,
// the route Task 0 proved in run 38881438378. ~150 MB of payload, so nothing
// raw is committed: each payload's sha256 is recorded instead, so a rerun can
// tell a vendor revision from a code change.
//
// THE F# IS THE ONLY IMPLEMENTATION OF THE METRIC. This file fetches, counts,
// sums what build/Stamina.js returns, and serialises. The band ratio, the
// expected share and the fewest readable attempts are READ from
// `staminaBands`; every state count is the first word of `staminaLabel`, read
// through the witness exactly as a page would. The few numbers computed here
// (a standard error, two half-sample ratios, a dispersion index) sit under
// `js_diagnostics` and are labelled as diagnostics, never as the metric.
//
// THE PREMISE IT RE-MEASURES. field-relay-nba run 38962367310 (its
// outbox/empowerment-premises-latest.json, key `nhl`) counted the same 328
// games with an independent JS implementation of the same windows. When every
// game decodes, the F# band counts and exclusion counts must equal that run's
// exactly; a disagreement is a gate, because two implementations agreeing is
// the only evidence either is right.
//
// NO PLAYER ID IS PAIRED WITH A READING anywhere in the artifact. States are
// counts. The witness is a finished game's, so these are post-game readings,
// and they are in-sample: the curve is built from the same player-games.
//
// The artifact is outbox/second-wind-population-latest.json, written whether or
// not the gates pass, because a refusal is a result. It writes data/ only under
// `--capture-population` (owner, 2026-10-18, option 1 of
// docs/CC-CMD-2026-10-18-second-wind-population-capture.md): then every game's
// two payloads are written VERBATIM, the very text the census decoded, to
// data/nhl-second-wind-population/, with a manifest of their sha256s. The
// Metrics tab forms its curve from those bytes and nothing else.
//
// CI-only: the sandbox cannot reach the NHL hosts. `--self-test` runs the whole
// pipeline through build/Stamina.js against a fake fetch.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain, toArray } from './checks.mjs'
import { ofArray } from '../build/fable_modules/fable-library-js.5.13.0/List.js'
import {
  staminaBand, staminaBandCounts, staminaBands, staminaCoverage, staminaCurve, staminaLabel,
  staminaPlayByPlay, staminaPlayerGames, staminaRule, staminaShifts, staminaWitness,
} from '../build/Stamina.js'

const NHL_WEB = 'https://api-web.nhle.com'
const NHL_STATS = 'https://api.nhle.com'
const FIRST_ID = 2025020001
const STRIDE = 4
const GAMES = 328
const OUT = 'outbox/second-wind-population-latest.json'
const FIXTURE = { pbp: 'data/nhl-second-wind-pbp.json', shifts: 'data/nhl-second-wind-shifts.json' }
const TIMEOUT_MS = 30000
const TRIES = 3
const CONCURRENCY = 4
/** The instant this run started, captured once. */
const RAN_AT = new Date()

/** The independent count this run must reproduce when every game decodes. */
const PREMISE = {
  source: 'field-relay-nba outbox/empowerment-premises-latest.json, key nhl',
  run_id: 38962367310,
  bands: {
    'under 720 s': { skater_games: 1971, first: 1061, last: 1122 },
    '720 to 1079 s': { skater_games: 5505, first: 5308, last: 5286 },
    '1080 s and over': { skater_games: 4331, first: 5791, last: 5999 },
  },
  beyond_regulation: 737,
  credited_to_non_skater: 5,
  no_shift_data: 0,
  attempts_without_credit: 0,
  penalties_not_credited: 2429,
  non_shift_rows: 2125,
}

const pbpUrl = id => `${NHL_WEB}/v1/gamecenter/${id}/play-by-play`
const shiftsUrl = id => `${NHL_STATS}/stats/rest/en/shiftcharts?cayenneExp=gameId=${id}`
const sha256 = text => createHash('sha256').update(text).digest('hex')
const isOk = r => r && r.tag === 0
const valueOf = r => r.fields[0]
const reasonOf = r => String(r.fields[0]).slice(0, 200)

/** The live fetch: a timeout, and backoff on 429 and 5xx. */
const fetchText = async url => {
  let last = { ok: false, status: 0, error: 'not attempted' }
  for (let i = 0; i < TRIES; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'FIELD-laboratory/second-wind' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      const text = await r.text()
      if (r.status === 429 || r.status >= 500) { last = { ok: false, status: r.status }; await new Promise(res => setTimeout(res, 1000 * 2 ** i)); continue }
      return { ok: r.ok, status: r.status, text }
    } catch (e) { last = { ok: false, status: 0, error: String(e?.message || e).slice(0, 120) } }
  }
  return last
}

const pool = async (items, n, fn) => {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}

const sumCoverage = (into, c) => {
  for (const cls of ['Goals', 'OtherAttempts', 'Penalties']) {
    const o = into[cls] ??= { bearing: 0, start_inclusive: 0, end_inclusive: 0, instant_in_no_interval: 0 }
    o.bearing += c[cls].Bearing
    o.start_inclusive += c[cls].StartInclusive
    o.end_inclusive += c[cls].EndInclusive
    o.instant_in_no_interval += c[cls].InstantInNoInterval
  }
  return into
}

const rawState = text => { try { return String(JSON.parse(text)?.gameState) } catch { return 'unparseable' } }

/** One game: fetch both payloads, decode and window through the F#. */
const readGame = async (id, get) => {
  const [p, s] = await Promise.all([get(pbpUrl(id)), get(shiftsUrl(id))])
  const g = { id, pbp_status: p.status, shifts_status: s.status }
  if (!p.ok || !s.ok) return { ...g, outcome: 'not-served' }
  g.pbp_sha256 = sha256(p.text); g.shifts_sha256 = sha256(s.text)
  g.pbp_bytes = Buffer.byteLength(p.text); g.shifts_bytes = Buffer.byteLength(s.text)
  g.vendor_state = rawState(p.text)
  const pbp = staminaPlayByPlay(p.text)
  const chart = staminaShifts(s.text)
  if (!isOk(pbp)) return { ...g, outcome: 'refused', refusal: `play-by-play: ${reasonOf(pbp)}` }
  if (!isOk(chart)) return { ...g, outcome: 'refused', refusal: `shift chart: ${reasonOf(chart)}` }
  const w = staminaPlayerGames(valueOf(pbp), valueOf(chart))
  if (!isOk(w)) return { ...g, outcome: 'refused', refusal: `windows: ${reasonOf(w)}` }
  const windowed = valueOf(w)
  return {
    ...g, outcome: 'decoded',
    windowed,
    players: toArray(windowed.Players),
    real: staminaCoverage(0, valueOf(pbp), valueOf(chart)),
    control: staminaCoverage(600, valueOf(pbp), valueOf(chart)),
    witness: staminaWitness(valueOf(pbp), valueOf(chart)),
  }
}

/** Counts of the four state names, read through the witness as a page would. */
const statesOf = (curve, games) => {
  const states = {}
  let unread = 0
  for (const g of games) {
    if (g.witness === undefined || g.witness === null) continue
    for (const p of g.players) {
      const label = staminaLabel(curve, g.witness, p.Player)
      if (typeof label !== 'string') { unread++; continue }
      const state = label.split(' ')[0]
      states[state] = (states[state] ?? 0) + 1
    }
  }
  return { counts: states, player_games_without_a_label: unread }
}

const share = (num, den) => (den ? +(num / den).toFixed(4) : null)

/**
 * The whole measurement, as data. `get` is the fetch, injectable so the
 * self-test runs this exact function. Returns the artifact and its gates.
 */
const measure = async ({ ids, get, fixture = null, comparePremise = true }) => {
  const games = await pool(ids, CONCURRENCY, id => readGame(id, get))
  const decoded = games.filter(g => g.outcome === 'decoded')
  const refused = games.filter(g => g.outcome === 'refused')
  const notServed = games.filter(g => g.outcome === 'not-served')
  const allPlayers = decoded.flatMap(g => g.players)
  const fsList = ofArray(allPlayers)
  const sumOf = key => decoded.reduce((n, g) => n + g.windowed[key], 0)

  const vendorStates = {}
  for (const g of games) if (g.vendor_state !== undefined) vendorStates[g.vendor_state] = (vendorStates[g.vendor_state] ?? 0) + 1
  const real = decoded.reduce((o, g) => sumCoverage(o, g.real), {})
  const control = decoded.reduce((o, g) => sumCoverage(o, g.control), {})
  const unwitnessed = decoded.filter(g => g.witness === undefined || g.witness === null).length

  const exclusions = {
    beyond_regulation: sumOf('BeyondRegulation'),
    credited_to_non_skater: sumOf('CreditedToNonSkater'),
    no_shift_data: sumOf('NoShiftData'),
    attempts_without_credit: sumOf('AttemptsWithoutCredit'),
    penalties_not_credited: sumOf('PenaltiesNotCredited'),
    non_shift_rows: sumOf('NonShiftRows'),
  }

  // Band sums from the F#, whether or not the curve is accepted.
  const bandCounts = toArray(staminaBandCounts(fsList)).map(([name, k]) =>
    ({ band: name, player_games: k.PlayerGames, first: k.FirstThirds, last: k.LastThirds }))

  const curveResult = staminaCurve(fsList)
  const curve = isOk(curveResult) ? valueOf(curveResult) : null
  const readings = curve ? toArray(staminaBands(curve)) : []
  const states = curve ? statesOf(curve, decoded) : null

  // n = first + last per skater-game: a histogram of F# outputs.
  const histogram = {}
  for (const p of allPlayers) {
    const n = p.FirstThird + p.LastThird
    const key = n >= 20 ? '20+' : String(n)
    histogram[key] = (histogram[key] ?? 0) + 1
  }

  // --- JS diagnostics: labelled, never the metric ---------------------------
  const half = parity => {
    const players = decoded.filter((_, i) => i % 2 === parity).flatMap(g => g.players)
    return toArray(staminaBandCounts(ofArray(players))).map(([name, k]) =>
      ({ band: name, first: k.FirstThirds, last: k.LastThirds, last_over_first: share(k.LastThirds, k.FirstThirds) }))
  }
  const dispersion = (() => {
    if (!curve) return null
    let total = 0, count = 0
    for (const p of allPlayers) {
      const n = p.FirstThird + p.LastThird
      const r = readings[staminaBand(p.RegulationToi).tag]
      if (!r || n < r.EligibleFrom) continue
      const pi = r.ExpectedShare
      total += (p.LastThird - n * pi) ** 2 / (n * pi * (1 - pi))
      count++
    }
    return { player_games: count, index: count ? +(total / count).toFixed(4) : null }
  })()

  // --- the premise, re-measured ---------------------------------------------
  const complete = decoded.length === ids.length
  const premise = (() => {
    if (!comparePremise) return { status: 'not compared (self-test)' }
    if (!complete) return { status: `not comparable: decoded ${decoded.length} of ${ids.length}` }
    const diffs = []
    for (const b of bandCounts) {
      const want = PREMISE.bands[b.band]
      if (!want || want.skater_games !== b.player_games || want.first !== b.first || want.last !== b.last) {
        diffs.push(`${b.band}: F# ${b.player_games}/${b.first}/${b.last}, premise ${want ? `${want.skater_games}/${want.first}/${want.last}` : 'absent'}`)
      }
    }
    for (const [k, v] of Object.entries(exclusions)) if (PREMISE[k] !== v) diffs.push(`${k}: F# ${v}, premise ${PREMISE[k]}`)
    return { status: diffs.length ? 'disagrees' : 'agrees', differences: diffs, premise: PREMISE }
  })()

  // --- the fixture, if the capture ran first in the same job ----------------
  const fixtureReading = (() => {
    if (!fixture) return { present: false }
    const pbp = staminaPlayByPlay(fixture.pbp), chart = staminaShifts(fixture.shifts)
    if (!isOk(pbp) || !isOk(chart)) return { present: true, decoded: false, refusal: !isOk(pbp) ? reasonOf(pbp) : reasonOf(chart) }
    const w = staminaPlayerGames(valueOf(pbp), valueOf(chart))
    const witness = staminaWitness(valueOf(pbp), valueOf(chart))
    const players = isOk(w) ? toArray(valueOf(w).Players) : []
    return {
      present: true, decoded: isOk(w), id: isOk(w) ? players[0]?.OfGame ?? null : null,
      vendor_state: rawState(fixture.pbp), witness: witness !== undefined && witness !== null,
      skater_games: players.length, beyond_regulation: isOk(w) ? valueOf(w).BeyondRegulation : null,
      states_under_this_curve: curve && isOk(w) ? statesOf(curve, [{ witness, players }]).counts : null,
    }
  })()

  const otherReal = real.OtherAttempts ?? { bearing: 0, instant_in_no_interval: 0 }
  const otherControl = control.OtherAttempts ?? { bearing: 0, instant_in_no_interval: 0 }
  const realMiss = share(otherReal.instant_in_no_interval, otherReal.bearing)
  const controlMiss = share(otherControl.instant_in_no_interval, otherControl.bearing)

  const gates = [
    { name: 'decoded at least 95% of the games requested', pass: decoded.length >= 0.95 * ids.length,
      detail: `decoded ${decoded.length} of ${ids.length}; not served ${notServed.length}; refused ${refused.length}` },
    { name: 'the decoders refused at most 1% of the games requested (the premise pass measured 0)', pass: refused.length <= 0.01 * ids.length,
      detail: `${refused.length} refused: ${refused.slice(0, 5).map(g => `${g.id} ${g.refusal}`).join(' | ')}` },
    { name: 'every decoded game is witnessed: FINAL or OFF with both scores', pass: unwitnessed === 0,
      detail: `${unwitnessed} decoded game(s) without a witness; vendor states ${JSON.stringify(vendorStates)}` },
    { name: 'the population curve clears its floor in every band', pass: curve !== null,
      detail: curve ? 'accepted' : reasonOf(curveResult) },
    { name: 'named credit sits inside the shooter\'s own shifts (other attempts, at most 5% in no interval)', pass: realMiss !== null && realMiss <= 0.05,
      detail: `${otherReal.instant_in_no_interval} of ${otherReal.bearing} in no interval` },
    { name: '...and the moved-clock control does not (at least 50% in no interval)', pass: controlMiss !== null && controlMiss >= 0.5,
      detail: `${otherControl.instant_in_no_interval} of ${otherControl.bearing} in no interval at +600 s` },
    { name: 'the F# reproduces the independent premise count', pass: premise.status !== 'disagrees',
      detail: premise.status === 'disagrees' ? premise.differences.join('; ') : premise.status },
  ]

  const coverage = `decoded ${decoded.length} of ${ids.length} requested (2025-26 regular season, every ${STRIDE}th id); ` +
    `${allPlayers.length} skater-games; ${states ? allPlayers.length - (states.counts.Insufficient ?? 0) - states.player_games_without_a_label : 'no'} readable beyond Insufficient`

  return {
    artifact: {
      cc_cmd: 'docs/CC-CMD-2026-10-15-empowerment-metrics.md, Task 3 (Second Wind)',
      coverage,
      population: {
        requested: ids.length, first_id: ids[0], last_id: ids[ids.length - 1], stride: STRIDE,
        decoded: decoded.length, not_served: notServed.map(g => ({ id: g.id, pbp: g.pbp_status, shifts: g.shifts_status })),
        refused: refused.map(g => ({ id: g.id, reason: g.refusal })),
      },
      premises: {
        vendor_game_state: vendorStates,
        decoded_without_witness: unwitnessed,
        exclusions,
        credited_coverage: { how: 'staminaCoverage: named credit against the credited player\'s own shifts, same period, regulation only', real, control_600s: control,
          other_attempts_in_no_interval_share: realMiss, control_other_attempts_in_no_interval_share: controlMiss },
        reproduces_premise_run: premise,
      },
      curve: {
        accepted: curve !== null,
        refusal: curve ? null : reasonOf(curveResult),
        band_counts: bandCounts,
        bands: readings.map(r => ({ band: r.Name, player_games: r.Counts.PlayerGames, first: r.Counts.FirstThirds, last: r.Counts.LastThirds,
          expected_last_share: r.ExpectedShare, last_over_first: r.PopulationRatio, fewest_readable_attempts: r.EligibleFrom })),
        rule: { tail: staminaRule.Tail, support_floor: staminaRule.SupportFloor },
      },
      per_player_game: { skater_games: allPlayers.length, attempts_in_first_and_last_thirds: histogram },
      states: states ? { ...states, in_sample: true, note: 'counts only; read through staminaLabel over each game\'s own witness' } : null,
      js_diagnostics: {
        note: 'computed in JS from F# outputs; diagnostics, not metric values',
        se_log_ratio: bandCounts.map(b => ({ band: b.band, value: b.first && b.last ? +Math.sqrt(1 / b.first + 1 / b.last).toFixed(4) : null })),
        odd_games: half(1), even_games: half(0),
        dispersion,
      },
      fixture: fixtureReading,
      payloads: decoded.concat(refused).map(g => ({ id: g.id, pbp_sha256: g.pbp_sha256, shifts_sha256: g.shifts_sha256, pbp_bytes: g.pbp_bytes, shifts_bytes: g.shifts_bytes })),
    },
    gates,
  }
}

// --- self-test: the same `measure`, a fake fetch --------------------------------

/** A synthetic finished game. Three skaters, one per band, each with `first`
 *  attempts in his first third and `last` in his last, placed so the +600 s
 *  control lands outside every shift; a goalie, a 505 row, a penalty and an
 *  overtime attempt, each of which must be counted and never windowed. */
const syntheticGame = (id, { state = 'OFF', first = 60, last = 60, total = null, offShift = false } = {}) => {
  const play = (key, details, period, at) => ({ typeDescKey: key, periodDescriptor: { number: period }, timeInPeriod: at, details })
  const shot = (who, period, at) => play('shot-on-goal', { shootingPlayerId: who }, period, at)
  const plays = []
  const add = (n, p) => { for (let i = 0; i < n; i++) plays.push(p) }
  add(first, shot(100, 1, '00:01')); add(last, shot(100, 1, offShift ? '15:00' : '09:59'))   // 600 s: P1 00:00-10:00
  add(first, shot(200, 2, '00:01')); add(last, shot(200, 3, '07:29'))   // 900 s: P2 and P3 00:00-07:30
  add(first, shot(300, 1, '10:01')); add(last, shot(300, 3, '19:59'))   // 1200 s: P1 and P3 10:00-20:00
  plays.push(play('penalty', { committedByPlayerId: 100 }, 2, '03:00'))
  plays.push(shot(300, 4, '01:00'))
  plays.push(play('faceoff', {}, 1, '00:00'))
  const pbp = { id, gameType: 2, gameState: state, homeTeam: { score: 3 }, awayTeam: { score: 2 },
    rosterSpots: [{ playerId: 100, positionCode: 'C' }, { playerId: 200, positionCode: 'D' }, { playerId: 300, positionCode: 'L' }, { playerId: 1, positionCode: 'G' }],
    plays }
  const row = (who, period, a, b, typeCode = 517) => ({ gameId: id, typeCode, playerId: who, period, startTime: a, endTime: b })
  const data = [row(100, 1, '00:00', '10:00'), row(200, 2, '00:00', '07:30'), row(200, 3, '00:00', '07:30'),
    row(300, 1, '10:00', '20:00'), row(300, 3, '10:00', '20:00'), row(1, 1, '00:00', '20:00'), row(300, 4, '00:00', '01:30'),
    row(100, 2, '03:00', '03:00', 505)]
  return { pbp: JSON.stringify(pbp), shifts: JSON.stringify({ data, total: total ?? data.length }) }
}

const fakeFetch = (gameFor, broken = new Set()) => async url => {
  const id = Number(/gamecenter\/(\d+)\//.exec(url)?.[1] ?? /gameId=(\d+)/.exec(url)?.[1])
  if (broken.has(id)) return { ok: false, status: 503 }
  const g = gameFor(id)
  return { ok: true, status: 200, text: url.includes('play-by-play') ? g.pbp : g.shifts }
}

const selfTest = async check => {
  const ids = Array.from({ length: 20 }, (_, k) => 9000 + k)
  const good = await measure({ ids, get: fakeFetch(id => syntheticGame(id)), comparePremise: false,
    fixture: syntheticGame(1) })
  const a = good.artifact
  const gate = (m, name) => m.gates.find(x => x.name.startsWith(name))
  check('the whole fake population decodes through build/Stamina.js', a.population.decoded === 20, JSON.stringify(a.population))
  check('one skater-game per band per game, the goalie left out', a.per_player_game.skater_games === 60, String(a.per_player_game.skater_games))
  check('band sums come from the F#: 1200 first and 1200 last per band',
    a.curve.band_counts.every(b => b.player_games === 20 && b.first === 1200 && b.last === 1200), JSON.stringify(a.curve.band_counts))
  check('the curve is accepted and its ratio is READ from staminaBands', a.curve.accepted && a.curve.bands.length === 3
    && a.curve.bands.every(b => b.last_over_first === 1 && b.expected_last_share === 0.5 && b.fewest_readable_attempts === 6), JSON.stringify(a.curve.bands))
  check('the exclusions are counted, not dropped: OT 20, penalties 20, 505 rows 20, the goalie credited nothing',
    a.premises.exclusions.beyond_regulation === 20 && a.premises.exclusions.penalties_not_credited === 20
    && a.premises.exclusions.non_shift_rows === 20 && a.premises.exclusions.credited_to_non_skater === 0, JSON.stringify(a.premises.exclusions))
  check('every skater-game has a state, and level thirds against a level band read PopulationRate',
    a.states && a.states.counts.PopulationRate === 60 && a.states.player_games_without_a_label === 0, JSON.stringify(a.states))
  check('named credit is inside the shifts and the control is not', a.premises.credited_coverage.other_attempts_in_no_interval_share === 0
    && a.premises.credited_coverage.control_other_attempts_in_no_interval_share === 1, JSON.stringify(a.premises.credited_coverage))
  check('every gate passes on the clean population', good.gates.every(g => g.pass), JSON.stringify(good.gates.filter(g => !g.pass)))
  check('the fixture is read through the witness', a.fixture.present && a.fixture.witness && a.fixture.skater_games === 3
    && a.fixture.beyond_regulation === 1, JSON.stringify(a.fixture))
  check('no player id sits beside a state anywhere in the artifact',
    !/"(Player|player|player_id)"\s*:/.test(JSON.stringify(a)), 'a player key was serialised')
  check('every payload is hashed', a.payloads.length === 20 && a.payloads.every(p => /^[0-9a-f]{64}$/.test(p.pbp_sha256) && /^[0-9a-f]{64}$/.test(p.shifts_sha256)))

  const live = await measure({ ids, get: fakeFetch(id => syntheticGame(id, { state: 'LIVE' })), comparePremise: false })
  check('A POPULATION CAPTURED IN PLAY GETS NO WITNESS, and the gate says so',
    !gate(live, 'every decoded game is witnessed').pass && live.artifact.premises.decoded_without_witness === 20,
    JSON.stringify(gate(live, 'every decoded game is witnessed')))
  check('...and no state is counted for it', Object.keys(live.artifact.states?.counts ?? {}).length === 0, JSON.stringify(live.artifact.states))

  const gappy = await measure({ ids, get: fakeFetch(id => syntheticGame(id), new Set(ids.slice(0, 2))), comparePremise: false })
  check('two games not served of twenty fails the 95% gate', !gate(gappy, 'decoded at least 95%').pass, JSON.stringify(gate(gappy, 'decoded at least 95%')))

  const truncated = await measure({ ids, get: fakeFetch(id => syntheticGame(id, { total: id === ids[0] ? 99 : null })), comparePremise: false })
  check('a chart shorter than its total is REFUSED and counted, never windowed',
    truncated.artifact.population.refused.length === 1 && /shift chart/.test(truncated.artifact.population.refused[0].reason)
    && !gate(truncated, 'the decoders refused at most 1%').pass, JSON.stringify(truncated.artifact.population.refused))

  const offShift = await measure({ ids, get: fakeFetch(id => syntheticGame(id, { offShift: true })), comparePremise: false })
  check('credit named at an instant outside the shooter\'s own shifts fails the integrity gate',
    !gate(offShift, 'named credit sits inside').pass && offShift.artifact.premises.credited_coverage.other_attempts_in_no_interval_share > 0.05,
    JSON.stringify(gate(offShift, 'named credit sits inside')))

  const thin = await measure({ ids: ids.slice(0, 5), get: fakeFetch(id => syntheticGame(id)), comparePremise: false })
  check('a population under the floor is refused, with the F# naming the bands',
    !thin.artifact.curve.accepted && /under 1000 attempts/.test(thin.artifact.curve.refusal) && thin.artifact.states === null,
    JSON.stringify(thin.artifact.curve))

  const moved = await measure({ ids, get: fakeFetch(id => syntheticGame(id)), comparePremise: true })
  check('the premise comparison refuses a complete population that does not match the recorded counts',
    moved.artifact.premises.reproduces_premise_run.status === 'disagrees' && !gate(moved, 'the F# reproduces').pass,
    JSON.stringify(moved.artifact.premises.reproduces_premise_run))
}

export const POPULATION_DIR = 'data/nhl-second-wind-population'

/** A fetch that also keeps every successful body, keyed by URL. */
const keeping = (get, kept) => async url => {
  const r = await get(url)
  if (r.ok) kept.set(url, r.text)
  return r
}

/** Writes each decoded game's two payloads verbatim, and a sha256 manifest. */
const writePopulation = (kept, ids, artifact) => {
  mkdirSync(POPULATION_DIR, { recursive: true })
  const notDecoded = new Set([...(artifact.population?.refused || []), ...(artifact.population?.not_served || [])].map(g => g.id ?? g))
  const measured = new Map((artifact.payloads || []).map(g => [g.id, g]))
  const games = []
  for (const id of ids) {
    const pbp = kept.get(pbpUrl(id)), shifts = kept.get(shiftsUrl(id))
    if (pbp == null || shifts == null) continue
    writeFileSync(`${POPULATION_DIR}/${id}-pbp.json`, pbp)
    writeFileSync(`${POPULATION_DIR}/${id}-shifts.json`, shifts)
    // The bytes written are the bytes the census measured, or the capture is a
    // second, unmeasured fetch wearing the census's name.
    if (measured.get(id)?.pbp_sha256 !== sha256(pbp) || measured.get(id)?.shifts_sha256 !== sha256(shifts))
      throw new Error(`capture ${id}: the written bytes are not the bytes the census decoded`)
    games.push({ id, decoded: !notDecoded.has(id),
      pbp_sha256: sha256(pbp), pbp_bytes: Buffer.byteLength(pbp),
      shifts_sha256: sha256(shifts), shifts_bytes: Buffer.byteLength(shifts) })
  }
  const manifest = { captured_at: RAN_AT.toISOString(), run_id: process.env.GITHUB_RUN_ID ?? null,
    source: { pbp: `${NHL_WEB}/v1/gamecenter/<id>/play-by-play`, shifts: `${NHL_STATS}/stats/rest/en/shiftcharts?cayenneExp=gameId=<id>` },
    first_id: FIRST_ID, stride: STRIDE, requested: ids.length, written: games.length,
    total_bytes: games.reduce((n, g) => n + g.pbp_bytes + g.shifts_bytes, 0), games }
  writeFileSync(`${POPULATION_DIR}/MANIFEST.json`, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`  wrote ${games.length} games (${manifest.total_bytes} bytes) to ${POPULATION_DIR}`)
}

const live = async check => {
  const ids = Array.from({ length: GAMES }, (_, k) => FIRST_ID + STRIDE * k)
  const fixture = existsSync(FIXTURE.pbp) && existsSync(FIXTURE.shifts)
    ? { pbp: readFileSync(FIXTURE.pbp, 'utf8'), shifts: readFileSync(FIXTURE.shifts, 'utf8') } : null
  const capture = process.argv.includes('--capture-population')
  const kept = new Map()
  const { artifact, gates } = await measure({ ids, get: capture ? keeping(fetchText, kept) : fetchText, fixture })
  if (capture) writePopulation(kept, ids, artifact)
  const out = { ran_at: RAN_AT.toISOString(), run_id: process.env.GITHUB_RUN_ID ?? null, ...artifact, gates }
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
  console.log(`\n  ${artifact.coverage}`)
  console.log(`  wrote ${OUT}\n`)
  for (const g of gates) check(g.name, g.pass, g.detail)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  if (process.argv.includes('--self-test')) await selfTest(check)
  else await live(check)
  finish(summarize())
}
