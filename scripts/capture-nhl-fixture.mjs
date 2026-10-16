#!/usr/bin/env node
// Capture ONE finished NHL game, verbatim, for Second Wind's real-bytes checks.
//
// WHY. src/Stamina.fs decodes two vendor payloads: api-web.nhle.com's
// play-by-play and api.nhle.com's shift chart. The Suite's "Second Wind" rows
// run on inline shapes, which are the contract; a committed capture is what
// shows the decoders accept the real bytes. The repo's rule is that a fixture
// is CAPTURED, never written by hand (data/PROVENANCE.md opens with it).
//
// WHICH GAME, BY RULE, NEVER BY ID. From /v1/scoreboard/now, the games the
// board marks FINAL or OFF, newest first. The first whose own play-by-play has
// gameType 2 (regular season), gameState FINAL or OFF, both final scores, and a
// play in period 4 or later, so the capture exercises the overtime exclusion on
// real bytes. Its shift chart is then refused if it carries no rows, if its
// `total` disagrees with its rows, or if any row names another game. A refused
// game is skipped and the next one tried, within a budget.
//
// Both payloads are written as the response TEXT, byte for byte, never parsed
// and re-serialised. The provenance entry is written here too, between markers
// this script rewrites, because a hand-written provenance note is the one part
// of a capture that can be wrong while everything it describes is right.
//
// The vendor hosts directly, not the relay's /nhl and /nhl-stats routes: the
// same route Task 0 proved in run 38881438378. CI-only, because the sandbox
// cannot reach either host. `--self-test` runs the selection and refusals
// against a fake fetch and writes nothing.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

const NHL_WEB = 'https://api-web.nhle.com'
const NHL_STATS = 'https://api.nhle.com'
const OUT = { pbp: 'data/nhl-second-wind-pbp.json', shifts: 'data/nhl-second-wind-shifts.json' }
const PROVENANCE = 'data/PROVENANCE.md'
const START = '<!-- nhl-second-wind:start -->'
const END = '<!-- nhl-second-wind:end -->'
const BUDGET = 16
const TIMEOUT_MS = 30000

const boardUrl = () => `${NHL_WEB}/v1/scoreboard/now`
const pbpUrl = id => `${NHL_WEB}/v1/gamecenter/${id}/play-by-play`
const shiftsUrl = id => `${NHL_STATS}/stats/rest/en/shiftcharts?cayenneExp=gameId=${id}`
const sha256 = text => createHash('sha256').update(text).digest('hex')
const parse = text => { try { return JSON.parse(text) } catch { return null } }

const fetchText = async url => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'FIELD-laboratory/capture' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      const text = await r.text()
      if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1000 * 2 ** i)); continue }
      return { ok: r.ok, status: r.status, text }
    } catch (e) { if (i === 2) return { ok: false, status: 0, error: String(e?.message || e).slice(0, 120) } }
  }
  return { ok: false, status: 429 }
}

/** The board's finished games, newest first. */
const finishedOnBoard = board =>
  (Array.isArray(board?.gamesByDate) ? board.gamesByDate : [])
    .flatMap(d => (Array.isArray(d?.games) ? d.games : []).map(g => ({ id: g?.id, date: String(d?.date ?? ''), state: g?.gameState })))
    .filter(g => Number.isInteger(g.id) && (g.state === 'FINAL' || g.state === 'OFF'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

/** Why a play-by-play is not the fixture, or null when it is. */
const pbpRefusal = (pbp, id) => {
  if (!pbp || typeof pbp !== 'object') return 'the play-by-play is not JSON'
  if (pbp.id !== id) return `its own id is ${JSON.stringify(pbp.id)}`
  if (pbp.gameType !== 2) return `gameType ${JSON.stringify(pbp.gameType)}, not 2`
  if (pbp.gameState !== 'FINAL' && pbp.gameState !== 'OFF') return `its own gameState is ${JSON.stringify(pbp.gameState)}, not FINAL or OFF`
  if (typeof pbp.homeTeam?.score !== 'number' || typeof pbp.awayTeam?.score !== 'number') return 'no final score on both sides'
  if (!Array.isArray(pbp.plays) || !pbp.plays.some(p => (p?.periodDescriptor?.number ?? 0) >= 4)) return 'no play past regulation'
  return null
}

/** Why a shift chart is refused, or null. */
const shiftsRefusal = (chart, id) => {
  if (!chart || !Array.isArray(chart.data)) return 'the shift chart has no data array'
  if (chart.data.length === 0) return 'no-shift-data: the chart carries no rows'
  if (chart.total !== chart.data.length) return `the chart says total ${JSON.stringify(chart.total)} and carries ${chart.data.length} rows`
  const foreign = chart.data.filter(r => r?.gameId !== id).length
  if (foreign) return `${foreign} row(s) name another game`
  return null
}

/** Pick and fetch the fixture. Pure apart from `get`; writes nothing. */
const capture = async get => {
  const board = await get(boardUrl())
  if (!board.ok) return { outcome: 'unreachable', detail: `scoreboard HTTP ${board.status}${board.error ? ` (${board.error})` : ''}`, tried: [] }
  const candidates = finishedOnBoard(parse(board.text))
  const tried = []
  for (const c of candidates.slice(0, BUDGET)) {
    const p = await get(pbpUrl(c.id))
    const pbp = p.ok ? parse(p.text) : null
    const pr = p.ok ? pbpRefusal(pbp, c.id) : `play-by-play HTTP ${p.status}`
    if (pr) { tried.push({ id: c.id, date: c.date, refused: pr }); continue }
    const s = await get(shiftsUrl(c.id))
    const sr = s.ok ? shiftsRefusal(parse(s.text), c.id) : `shift chart HTTP ${s.status}`
    if (sr) { tried.push({ id: c.id, date: c.date, refused: sr }); continue }
    tried.push({ id: c.id, date: c.date, refused: null })
    return { outcome: 'captured', id: c.id, date: c.date, pbp: { status: p.status, text: p.text }, shifts: { status: s.status, text: s.text }, tried, candidates: candidates.length }
  }
  return { outcome: 'refused', detail: `none of ${tried.length} tried (of ${candidates.length} FINAL/OFF on the board, budget ${BUDGET}) qualified`, tried, candidates: candidates.length }
}

/** The provenance entry, from the bytes that were written. */
const provenanceEntry = cap => {
  const pbp = JSON.parse(cap.pbp.text)
  const chart = JSON.parse(cap.shifts.text)
  const plays = pbp.plays
  const count = key => plays.filter(p => p?.typeDescKey === key).length
  const beyond = plays.filter(p => (p?.periodDescriptor?.number ?? 0) >= 4).length
  const byType = {}
  for (const r of chart.data) byType[r?.typeCode] = (byType[r?.typeCode] ?? 0) + 1
  return [
    START,
    '## `nhl-second-wind-pbp.json` and `nhl-second-wind-shifts.json`',
    '',
    '```',
    `GET ${pbpUrl(cap.id)}`,
    `→ ${cap.pbp.status} application/json, ${Buffer.byteLength(cap.pbp.text)} bytes, sha256 ${sha256(cap.pbp.text)}`,
    `GET ${shiftsUrl(cap.id)}`,
    `→ ${cap.shifts.status} application/json, ${Buffer.byteLength(cap.shifts.text)} bytes, sha256 ${sha256(cap.shifts.text)}`,
    '```',
    '',
    `Captured by \`scripts/capture-nhl-fixture.mjs\`: game ${cap.id}, dated ${cap.date} on`,
    '`/v1/scoreboard/now`, the newest game on the board whose own play-by-play is',
    'regular season (gameType 2), FINAL or OFF with both scores, and has a play past',
    'regulation. Both response bodies are written as received, byte for byte.',
    '',
    '**What it exercises.**',
    '',
    `- gameState \`${pbp.gameState}\`, final score ${pbp.homeTeam?.score}-${pbp.awayTeam?.score}`,
    `- ${plays.length} plays: ${count('goal')} goals, ${count('shot-on-goal')} shots on goal, ${count('missed-shot')} missed, ${count('blocked-shot')} blocked, ${count('penalty')} penalties`,
    `- ${beyond} play(s) in period 4 or later, which the windows count apart and never window`,
    `- ${chart.data.length} shift-chart rows by typeCode: ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '',
    '**What it does not exercise.** A game in play: the witness refusals for LIVE,',
    'CRIT, PRE, FUT and an unseen word are covered by inline bodies in the Suite. Nor',
    'the relay\'s `/nhl` and `/nhl-stats` routes, which this capture bypasses. The',
    'reference population (328 games of 2025-26) is not committed; its per-payload',
    'hashes are in `outbox/second-wind-population-latest.json`.',
    END,
  ].join('\n')
}

/** Replace the marked section, or append it. */
const withEntry = (prov, entry) => {
  const a = prov.indexOf(START), b = prov.indexOf(END)
  if (a !== -1 && b > a) return prov.slice(0, a) + entry + prov.slice(b + END.length)
  return prov.replace(/\s*$/, '\n') + '\n' + entry + '\n'
}

// --- self-test --------------------------------------------------------------------

const selfTest = async check => {
  const play = (period, key = 'shot-on-goal') => ({ typeDescKey: key, periodDescriptor: { number: period } })
  const pbpFor = (id, over = {}) => JSON.stringify({ id, gameType: 2, gameState: 'OFF', homeTeam: { score: 3 }, awayTeam: { score: 2 },
    plays: [play(1), play(4), play(2, 'goal'), play(3, 'penalty')], ...over })
  const chartFor = (id, over = {}) => {
    const data = [{ gameId: id, typeCode: 517 }, { gameId: id, typeCode: 505 }]
    return JSON.stringify({ data, total: data.length, ...over })
  }
  const board = { gamesByDate: [
    { date: '2026-10-14', games: [{ id: 11, gameState: 'OFF' }] },
    { date: '2026-10-15', games: [{ id: 21, gameState: 'OFF' }, { id: 22, gameState: 'LIVE' }, { id: 23, gameState: 'FINAL' }, { id: 24, gameState: 'OFF' }] },
  ] }
  // 24 newest: regulation only. 23: overtime, but its chart is short. 22: LIVE on
  // the board, never fetched. 21: its own play-by-play says CRIT. 11: the one.
  const bodies = {
    [pbpUrl(24)]: pbpFor(24, { plays: [play(1), play(3)] }),
    [pbpUrl(23)]: pbpFor(23), [shiftsUrl(23)]: chartFor(23, { total: 7 }),
    [pbpUrl(21)]: pbpFor(21, { gameState: 'CRIT' }),
    [pbpUrl(11)]: '{ "id":11,  "gameType":2, "gameState":"FINAL", "homeTeam":{"score":1},"awayTeam":{"score":2}, "plays":[{"periodDescriptor":{"number":5}}] }',
    [shiftsUrl(11)]: chartFor(11),
  }
  const fetched = []
  const fake = (map, boardBody) => async url => {
    fetched.push(url)
    if (url === boardUrl()) return { ok: true, status: 200, text: JSON.stringify(boardBody) }
    return url in map ? { ok: true, status: 200, text: map[url] } : { ok: false, status: 404 }
  }
  const cap = await capture(fake(bodies, board))
  check('the newest qualifying game is chosen: finished, regular season, past regulation, a clean chart',
    cap.outcome === 'captured' && cap.id === 11, JSON.stringify({ outcome: cap.outcome, id: cap.id, tried: cap.tried }))
  check('a regulation-only final is skipped, naming why', cap.tried.some(t => t.id === 24 && /past regulation/.test(t.refused)), JSON.stringify(cap.tried))
  check('a chart shorter than its own total is refused', cap.tried.some(t => t.id === 23 && /total 7/.test(t.refused)), JSON.stringify(cap.tried))
  check('A GAME WHOSE OWN PLAY-BY-PLAY IS NOT OVER IS REFUSED, whatever the board said', cap.tried.some(t => t.id === 21 && /CRIT/.test(t.refused)), JSON.stringify(cap.tried))
  check('a game the board marks LIVE is never fetched', !fetched.some(u => u.includes('/22/') || u.includes('gameId=22')), fetched.join(' '))
  check('the bytes are the response text, not a re-serialisation', cap.pbp?.text === bodies[pbpUrl(11)] && cap.shifts?.text === bodies[shiftsUrl(11)])

  const foreign = await capture(fake({ [pbpUrl(11)]: bodies[pbpUrl(11)], [shiftsUrl(11)]: JSON.stringify({ data: [{ gameId: 12, typeCode: 517 }], total: 1 }) },
    { gamesByDate: [{ date: '2026-10-14', games: [{ id: 11, gameState: 'OFF' }] }] }))
  check('a chart carrying another game\'s rows is refused, and nothing is captured',
    foreign.outcome === 'refused' && /another game/.test(foreign.tried[0]?.refused ?? ''), JSON.stringify(foreign))
  const empty = await capture(fake({ [pbpUrl(11)]: bodies[pbpUrl(11)], [shiftsUrl(11)]: JSON.stringify({ data: [], total: 0 }) },
    { gamesByDate: [{ date: '2026-10-14', games: [{ id: 11, gameState: 'OFF' }] }] }))
  check('an empty chart is no-shift-data, refused', empty.outcome === 'refused' && /no-shift-data/.test(empty.tried[0]?.refused ?? ''), JSON.stringify(empty))
  const down = await capture(async () => ({ ok: false, status: 503 }))
  check('an unreachable board captures nothing', down.outcome === 'unreachable', JSON.stringify(down))

  const entry = provenanceEntry(cap)
  check('the provenance entry records the hash of the bytes written', entry.includes(sha256(bodies[pbpUrl(11)])) && entry.includes('1 play(s) in period 4 or later'), entry)
  const once = withEntry('# Data provenance\n\nintro\n', entry)
  const twice = withEntry(once, entry)
  check('rewriting the provenance replaces the marked entry rather than stacking a second', once === twice && once.split(START).length === 2, twice)
}

const live = async check => {
  const cap = await capture(fetchText)
  console.log(`\n  ${cap.candidates ?? 0} FINAL/OFF game(s) on the board; tried ${cap.tried.length} (budget ${BUDGET})`)
  for (const t of cap.tried) console.log(`    ${t.id}  ${t.date}  ${t.refused ? `refused: ${t.refused}` : 'captured'}`)
  check('a finished regular-season game past regulation was captured, its chart whole', cap.outcome === 'captured', cap.detail)
  if (cap.outcome !== 'captured') return
  writeFileSync(OUT.pbp, cap.pbp.text)
  writeFileSync(OUT.shifts, cap.shifts.text)
  console.log(`  wrote ${OUT.pbp} (${Buffer.byteLength(cap.pbp.text)} B) and ${OUT.shifts} (${Buffer.byteLength(cap.shifts.text)} B), game ${cap.id}`)
  if (existsSync(PROVENANCE)) {
    writeFileSync(PROVENANCE, withEntry(readFileSync(PROVENANCE, 'utf8'), provenanceEntry(cap)))
    console.log(`  rewrote the Second Wind entry in ${PROVENANCE}`)
  }
  check('the written bytes are the response bytes', readFileSync(OUT.pbp, 'utf8') === cap.pbp.text && readFileSync(OUT.shifts, 'utf8') === cap.shifts.text)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  if (process.argv.includes('--self-test')) await selfTest(check)
  else await live(check)
  finish(summarize())
}
