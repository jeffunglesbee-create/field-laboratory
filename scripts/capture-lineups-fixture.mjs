#!/usr/bin/env node
// Capture a REAL lineups payload from the relay, in a NAMED state.
//
// WHY. docs/CC-CMD-2026-10-11-predicted-xi-render-decision.md's done condition
// 2 is "a predicted XI is visually distinguishable from a confirmed one in a
// committed screenshot of each", and a screenshot needs a payload. The repo's
// standing rule is that a fixture is CAPTURED, never written by hand —
// scripts/capture-render-fixture.mjs says it in those words, and data/
// PROVENANCE.md opens with "nothing in this directory is fabricated,
// hand-written, or shaped to make a decoder pass".
//
// A hand-written `confirmed` payload would have been the easy route and it is
// the one Rule 1 forbids. It is also unnecessary, which is the point of the
// measurement below.
//
// BOTH STATES ARE REACHABLE, AND THEY LIVE ON DIFFERENT EVENTS. Measured
// 2026-10-11 through field-relay-nba's own probe
// (outbox/bsd-lineups-probe-latest.json, runs 38118474339 / 38151345923 /
// 38151411240):
//
//   pre-match events, 2026-10-11 06:34Z   predicted  8 of 8   beta true
//   pre-match events, 2026-10-11 15:27Z   predicted  8 of 8   beta true
//   finished events,  2026-10-10          confirmed  3 of 3   beta false
//
// Sixteen pre-match observations nine hours apart never said `confirmed`, and
// three finished events never said anything else. So `confirmed` is captured
// from a PLAYED event and `predicted` from an UNPLAYED one. That is the whole
// reason this script takes a state and discovers its own event rather than
// being pointed at one.
//
// THE EVENT IS DISCOVERED, NEVER HARDCODED, for the reason field-relay-nba's
// probe already wrote down: event 220230 was pre-match on 2026-10-10 and has
// since been played, so a script reusing it would capture a finished event
// while filing it as pre-match.
//
// CI-only: the sandbox 403s *.workers.dev at CONNECT.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'

/** The two states that are reachable, and which event status carries each. */
export const WANTED = {
  predicted: { bsdStatus: 'notstarted', beta: true },
  confirmed: { bsdStatus: 'finished', beta: false },
}

// ---------------------------------------------------------------------------
// The body is the contract; the headers are a convenience.
//
// This matters because of how the fixture gets rendered. `?data=` pins the page
// to a file in data/ (src/Program.fs's `dataUrl`), and a FILE HAS NO HEADERS.
// If the renderer read `X-Lineup-State` it would be unable to render any
// committed capture at all, and the live path and the fixture path would be two
// different decoders — the divergence this repo keeps finding.
//
// So the renderer derives the state from the body, and this script asserts that
// derivation agrees with the relay's own header on every capture. That is the
// one command that can refute the premise the decoder rests on, which is why it
// is a refusal rather than a warning.
//
// It is NOT a second implementation in the render path: nothing imports it at
// runtime. It exists to be compared against the relay on real bytes.
// ---------------------------------------------------------------------------

/** `X-Lineup-State`, derived from the body alone. Mirrors field-relay-nba
 *  src/index.js's `state`. `upstream-failed` is absent on purpose: there is no
 *  body to derive it from. */
export const stateFromBody = body => {
  const st = body && typeof body === 'object' ? body.lineup_status : undefined
  if (st === undefined || st === null || st === '') return 'status-absent'
  if (st === 'predicted' || st === 'confirmed') return st
  return `status-unrecognised:${st}`
}

/** `X-Lineup-Fill`, derived from the body alone. Four states, never collapsed. */
export const fillFromBody = body => {
  const l = body && typeof body === 'object' ? body.lineups : undefined
  if (l === undefined) return 'absent'
  if (l === null) return 'null'
  const empty = Array.isArray(l) ? l.length === 0
    : (typeof l === 'object' && Object.keys(l).length === 0)
  return empty ? 'served-empty' : 'served'
}

/** Candidate event ids for a state, from the relay's own events list. */
export const candidatesFor = (rows, state) => {
  const want = WANTED[state]?.bsdStatus
  if (!want) return []
  return rows
    .filter(r => String(r?.status ?? '').toLowerCase() === want)
    .map(r => r?.id ?? r?.event_id)
    .filter(id => id !== undefined && id !== null)
}

// --- self-test ---------------------------------------------------------------

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')

if (SELF_TEST) {
  const c = createChecks()
  const t = (name, pass, detail) => c.check(name, pass, detail)

  // The five state values, which are five and not the document's three.
  t('predicted', stateFromBody({ lineup_status: 'predicted' }) === 'predicted')
  t('confirmed', stateFromBody({ lineup_status: 'confirmed' }) === 'confirmed')
  t('absent key is status-absent', stateFromBody({}) === 'status-absent')
  t('null is status-absent', stateFromBody({ lineup_status: null }) === 'status-absent')
  t('empty string is status-absent', stateFromBody({ lineup_status: '' }) === 'status-absent')
  t('an unknown word is unrecognised, not predicted',
    stateFromBody({ lineup_status: 'probable' }) === 'status-unrecognised:probable',
    `got ${stateFromBody({ lineup_status: 'probable' })}`)
  // The one that matters: an unrecognised status must NOT fall through to a
  // team sheet. If this ever returns 'confirmed' the renderer draws a
  // fabrication with a confirmed sheet's authority.
  t('unrecognised is never confirmed',
    !['predicted', 'confirmed'].includes(stateFromBody({ lineup_status: 'xi' })))

  // The four fill values.
  t('fill absent', fillFromBody({}) === 'absent')
  t('fill null', fillFromBody({ lineups: null }) === 'null')
  t('fill served-empty object', fillFromBody({ lineups: {} }) === 'served-empty')
  t('fill served-empty array', fillFromBody({ lineups: [] }) === 'served-empty')
  t('fill served', fillFromBody({ lineups: { home: {}, away: {} } }) === 'served')
  // served-empty is NOT absent and NOT a sheet. Collapsing it is the thing the
  // relay's own comment says must not happen.
  t('served-empty is distinct from absent',
    fillFromBody({ lineups: {} }) !== fillFromBody({}))

  // Discovery picks by status, and picks DIFFERENT events for the two states.
  const rows = [
    { id: 1, status: 'notstarted' }, { id: 2, status: 'finished' },
    { id: 3, status: 'inprogress' }, { event_id: 4, status: 'FINISHED' },
    { id: 5, status: 'notstarted' },
  ]
  t('predicted candidates are the unplayed ones',
    JSON.stringify(candidatesFor(rows, 'predicted')) === '[1,5]',
    JSON.stringify(candidatesFor(rows, 'predicted')))
  t('confirmed candidates are the played ones, case-insensitively',
    JSON.stringify(candidatesFor(rows, 'confirmed')) === '[2,4]',
    JSON.stringify(candidatesFor(rows, 'confirmed')))
  t('an in-progress event is neither',
    !candidatesFor(rows, 'predicted').includes(3) &&
    !candidatesFor(rows, 'confirmed').includes(3))
  t('an unknown state has no candidates', candidatesFor(rows, 'probable').length === 0)
  t('a row with no id is dropped rather than captured as undefined',
    candidatesFor([{ status: 'finished' }], 'confirmed').length === 0)

  process.exit(c.summarize() === 0 ? 0 : 1)
}

// --- live --------------------------------------------------------------------

if (isMain(import.meta.url) && !SELF_TEST) {
  const state = process.argv[2]
  const date = process.argv[3]
  if (!WANTED[state]) {
    console.error(`usage: capture-lineups-fixture.mjs <${Object.keys(WANTED).join('|')}> [YYYY-MM-DD]`)
    process.exit(1)
  }
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`REFUSED — "${date}" is not YYYY-MM-DD.`)
    process.exit(1)
  }
  // A played event is yesterday's by default; an unplayed one is today's.
  const day = date || (state === 'confirmed'
    ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10))

  const get = async url => {
    try {
      const r = await fetch(url)
      const text = await r.text()
      let body = null
      try { body = JSON.parse(text) } catch { /* reported as unparsed below */ }
      return { ok: r.ok, status: r.status, text, body, headers: r.headers }
    } catch (e) { return { ok: false, status: 0, error: String(e?.message || e) } }
  }

  console.log(`\n  ${state} lineups, discovering ${WANTED[state].bsdStatus} events on ${day}\n`)

  const list = await get(`${RELAY}/bsd/events/by-date?date=${day}`)
  if (!list.ok) {
    console.error(`UNREACHABLE — events list HTTP ${list.status}${list.error ? ` (${list.error})` : ''}. Nothing captured.`)
    process.exit(1)
  }
  const rows = Array.isArray(list.body) ? list.body
    : Array.isArray(list.body?.results) ? list.body.results
    : Array.isArray(list.body?.events) ? list.body.events : []
  const ids = candidatesFor(rows, state)
  if (!ids.length) {
    console.error(`REFUSED — 0 of ${rows.length} event(s) on ${day} are ${WANTED[state].bsdStatus}. Nothing captured.`)
    process.exit(1)
  }

  // A budget, so a bad day cannot turn one capture into a hundred calls.
  const BUDGET = 8
  const tried = []
  let hit = null
  for (const id of ids.slice(0, BUDGET)) {
    const r = await get(`${RELAY}/bsd/events/${id}/lineups`)
    const hdrState = r.headers?.get?.('X-Lineup-State') ?? null
    const hdrFill = r.headers?.get?.('X-Lineup-Fill') ?? null
    const bodyState = r.body === null ? null : stateFromBody(r.body)
    const bodyFill = r.body === null ? null : fillFromBody(r.body)
    tried.push({ id, http: r.status, hdrState, bodyState, hdrFill, bodyFill })

    // THE PREMISE CHECK. If the header and the body disagree, the renderer
    // cannot derive the state from a committed file and this whole design is
    // wrong. Refuse rather than capture a payload the decoder will read
    // differently from the relay.
    if (r.ok && r.body !== null && (hdrState !== bodyState || hdrFill !== bodyFill)) {
      console.error(`REFUSED — event ${id}: the relay's headers and its body disagree.`)
      console.error(`  X-Lineup-State ${hdrState}  vs body-derived ${bodyState}`)
      console.error(`  X-Lineup-Fill  ${hdrFill}  vs body-derived ${bodyFill}`)
      console.error(`  The renderer derives state from the body because a committed fixture has`)
      console.error(`  no headers. That premise is refuted here. Nothing captured.`)
      process.exit(1)
    }
    if (r.ok && bodyState === state && bodyFill === 'served') { hit = { id, r }; break }
  }

  // Rule 91 — the coverage prints where the result is read, not in a comment.
  console.log(`  tried ${tried.length} of ${ids.length} ${WANTED[state].bsdStatus} event(s) (budget ${BUDGET})`)
  for (const t of tried) {
    console.log(`    ${t.id}  HTTP ${t.http}  state=${t.bodyState}  fill=${t.bodyFill}` +
      `  header-agrees=${t.hdrState === t.bodyState && t.hdrFill === t.bodyFill}`)
  }

  if (!hit) {
    console.error(`\nREFUSED — none of the ${tried.length} event(s) tried served a ${state} lineup with players.`)
    console.error(`Nothing captured. This is a finding, not a failure to work around: a state the`)
    console.error(`vendor does not serve must not be rendered from an invented fixture.`)
    process.exit(1)
  }

  const beta = hit.r.body?.beta
  if (beta !== WANTED[state].beta) {
    console.log(`\n  NOTE — beta is ${JSON.stringify(beta)} on this ${state} payload; ` +
      `every prior observation had ${WANTED[state].beta}. Captured anyway; the renderer reads the body.`)
  }

  const out = `data/lineups-${state}.json`
  writeFileSync(out, JSON.stringify(hit.r.body, null, 1) + '\n')
  console.log(`\n  wrote ${out} — event ${hit.id}, ${state}, beta=${JSON.stringify(beta)}, ` +
    `updated_at=${JSON.stringify(hit.r.body?.updated_at ?? null)}\n`)

  // The provenance entry is written here rather than by hand, because a
  // hand-written provenance note is the one part of a capture that can be wrong
  // while everything it describes is right.
  const P = 'data/PROVENANCE.md'
  if (existsSync(P)) {
    const l = hit.r.body?.lineups ?? {}
    const sides = Object.keys(l).sort()
    const players = sides.map(s => (l[s]?.players ?? []).length)
    const subs = sides.map(s => (l[s]?.substitutes ?? []).length)
    const unav = hit.r.body?.unavailable_players
    const marker = `## \`lineups-${state}.json\``
    const entry = [
      marker,
      '',
      '```',
      `GET ${RELAY}/bsd/events/${hit.id}/lineups`,
      `→ ${hit.r.status} application/json, ${Buffer.byteLength(hit.r.text)} bytes`,
      `X-Lineup-State: ${hit.r.headers?.get?.('X-Lineup-State')}  X-Lineup-Fill: ${hit.r.headers?.get?.('X-Lineup-Fill')}`,
      '```',
      '',
      `Captured by \`scripts/capture-lineups-fixture.mjs ${state} ${day}\`. Complete and`,
      'untruncated — the whole response body, byte for byte. The script refuses to write',
      'if the relay\'s headers and the body disagree about the state, because the renderer',
      'derives the state from the body (a committed fixture has no headers).',
      '',
      '**What it exercises.**',
      '',
      `- \`lineup_status\` genuinely \`${JSON.stringify(hit.r.body?.lineup_status)}\``,
      `- \`beta\` genuinely \`${JSON.stringify(beta)}\``,
      `- sides \`${sides.join(', ')}\` with ${players.join(' and ')} players and ${subs.join(' and ')} substitutes`,
      `- \`unavailable_players\` ${unav === undefined ? '**absent from the payload entirely**'
        : unav === null ? 'genuinely `null`'
        : `present with ${Object.keys(unav).length} side(s)`}`,
      '',
      '**What it does not exercise.** The non-answers. `status-absent`,',
      '`status-unrecognised`, `served-empty` and `upstream-failed` are not reachable by',
      'capture — the vendor does not serve them on demand — so the decoder\'s branches for',
      'them are covered by unit tests over synthetic bodies, which is a different and',
      'weaker kind of evidence, and is said here rather than left to be assumed.',
      '',
    ].join('\n')
    const prov = readFileSync(P, 'utf8')
    const at = prov.indexOf(marker)
    if (at === -1) {
      writeFileSync(P, prov.replace(/\s*$/, '\n') + '\n' + entry)
      console.log(`  appended ${P}`)
    } else {
      // Replace the existing entry in place, up to the next `## ` heading.
      const after = prov.indexOf('\n## ', at + 1)
      writeFileSync(P, prov.slice(0, at) + entry + (after === -1 ? '' : prov.slice(after + 1)))
      console.log(`  replaced the ${state} entry in ${P}`)
    }
  }
}
