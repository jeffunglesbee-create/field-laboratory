// The join a scoreline check would be built on, checked before anything is
// built on it.
//
// `brief-join-capture.mjs` reported a 6.2% join rate on its first successful
// run. The capture was fine; the join was wrong — it looked up `brief.game_id`
// in `game.id` while the column holds seven key spaces. The true rate over the
// same committed data is 69.4%.
//
// That mistake was cheap to make and expensive to notice: one aggregate number,
// no per-scheme breakdown, and a warning that only fires at ZERO. Everything
// here exists so the next version of it fails a check instead of shipping.
//
// WHAT THIS PINS AND WHY EACH PIN IS THE VALUE IT IS
//
// The counts are pinned to the committed capture, not to a tolerance. This file
// and `data/brief-join-corpus.json` move together or the build stops — which is
// the point, because a resolver silently losing a scheme looks exactly like a
// data refresh unless something is holding the old numbers.

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import {
  SCHEMES, schemeOf, indexGames, resolveGame, joinCensus, formatCensus,
} from './game-id-scheme.mjs'

const SELF_TEST = process.argv.includes('--self-test')
const { check, summarize } = createChecks()

// ── the self-test: can the resolver be wrong at all? ────────────────────────
//
// Runs against hand-written rows, never the capture, so it still passes if the
// capture is absent and still fails if `schemeOf` starts classifying by luck.

if (SELF_TEST) {
  const games = [
    { id: '2026-08-01-mls-van-lafc', espn_event_id: '761703' },
    { id: 'MLS_MLS-COM-000006_MLS-MAT-000A30_phaseone_2026-08-04', espn_event_id: null },
    { id: '2026-08-02-mlb-nyy-bos', espn_event_id: '' },
    // Rows whose ids collide with the four schemes that must resolve to
    // NOTHING. Without these the "addresses nothing" cases pass by accident —
    // `g32` is absent from the real games table, so a resolver that started
    // looking it up in games.id would still return null and no check would
    // notice. Here the lookup would succeed, so the refusal has to be real.
    { id: 'g32', espn_event_id: null },
    { id: 's_engleague_cup_burtonalbion_blackburnrovers', espn_event_id: null },
    { id: 'afl_38670', espn_event_id: null },
    { id: 'golf_401811960_R4', espn_event_id: null },
    { id: 'pl-verify-game', espn_event_id: null },
    { id: '~~ nothing like an id ~~', espn_event_id: null },
  ]
  const index = indexGames(games)

  const cases = [
    ['761703', 'bare-espn-numeric', true],
    ['espn:761703', 'espn-prefixed', true],
    ['MLS_MLS-COM-000006_MLS-MAT-000A30_phaseone_2026-08-04', 'provider-composite', true],
    ['g32', 'mlb-slate-ordinal', false],
    ['s_engleague_cup_burtonalbion_blackburnrovers', 'efl-team-composite', false],
    ['afl_38670', 'sport-prefixed-external', false],
    ['golf_401811960_R4', 'sport-prefixed-external', false],
    ['pl-verify-game', 'test-fixture', false],
    ['~~ nothing like an id ~~', 'unrecognised', false],
    ['', 'unrecognised', false],
    [null, 'unrecognised', false],
  ]

  const wrongScheme = cases.filter(([v, want]) => schemeOf(v) !== want)
  check('every shape is classified as the scheme it belongs to',
    wrongScheme.length === 0,
    wrongScheme.map(([v, want]) => `${JSON.stringify(v)}: want ${want}, got ${schemeOf(v)}`).join('; ') ||
    `${cases.length} shapes classified`)

  const wrongJoin = cases.filter(([v, , shouldJoin]) => Boolean(resolveGame(v, index)) !== shouldJoin)
  check('every id resolves to a game exactly when one exists',
    wrongJoin.length === 0,
    wrongJoin.map(([v, , s]) => `${JSON.stringify(v)}: expected ${s ? 'a game' : 'null'}`).join('; ') ||
    `${cases.length} ids resolved`)

  // The bug this file exists for: a resolver that ignores espn_event_id.
  check('an ESPN-keyed id does NOT resolve through games.id',
    resolveGame('761703', indexGames([{ id: '761703', espn_event_id: null }])) === null,
    'a bare numeric matched games.id — the two key spaces are being conflated')

  // An empty espn_event_id must not become a key that empty-string ids match.
  check('a blank espn_event_id is not indexed',
    resolveGame('', index) === null && indexGames(games).byEspn.has('') === false,
    'blank ids entered the index')

  check('SCHEMES lists every scheme schemeOf can return',
    cases.every(([, want]) => SCHEMES.includes(want)),
    cases.map(([, w]) => w).filter(w => !SCHEMES.includes(w)).join('; '))

  const t = joinCensus(
    [{ game_id: '761703' }, { game_id: 'g1' }, { game_id: null }, { game_id: '' }],
    games)
  check('the census counts only briefs that carry a game_id',
    t.withGameId === 2 && t.joined === 1,
    `withGameId ${t.withGameId} (want 2), joined ${t.joined} (want 1)`)

  check('every scheme appears in the census even at zero',
    t.census.length === SCHEMES.length,
    `${t.census.length} row(s), ${SCHEMES.length} scheme(s)`)

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── the committed capture ───────────────────────────────────────────────────

const CAPTURE = JSON.parse(readFileSync('data/brief-join-corpus.json', 'utf8'))
const result = joinCensus(CAPTURE.briefs, CAPTURE.games)
const bySchemeName = Object.fromEntries(result.census.map(r => [r.scheme, r]))

console.log(formatCensus(result))
console.log('')

check('the capture carries both halves of the join',
  CAPTURE.briefs.length === 542 && CAPTURE.games.length === 469,
  `${CAPTURE.briefs.length} brief(s), ${CAPTURE.games.length} game(s)`)

// Non-vacuity first. Every rate below is free if the column is empty.
check('briefs carry a game_id at all',
  result.withGameId === 516,
  `${result.withGameId} of ${CAPTURE.briefs.length} carry one`)

// The regression this file was written for. The committed script scored 32.
check('the join does not collapse to the games.id key space alone',
  result.joined === 358,
  `${result.joined} joined; 32 means the resolver is back to matching games.id only`)

check('no game_id falls outside every known scheme',
  bySchemeName.unrecognised.briefs === 0,
  `${bySchemeName.unrecognised.briefs} unrecognised — game-id-scheme.mjs needs a new case`)

// Per scheme, pinned. A resolver that loses ESPN keying drops 326 of these to
// zero while the aggregate still reads as "most of them joined".
const PINNED = {
  'bare-espn-numeric': { briefs: 327, joined: 302 },
  'mlb-slate-ordinal': { briefs: 90, joined: 0 },
  'provider-composite': { briefs: 32, joined: 32 },
  'efl-team-composite': { briefs: 30, joined: 0 },
  'espn-prefixed': { briefs: 24, joined: 24 },
  'sport-prefixed-external': { briefs: 8, joined: 0 },
  'test-fixture': { briefs: 5, joined: 0 },
  'unrecognised': { briefs: 0, joined: 0 },
}

const drifted = Object.entries(PINNED).filter(([s, want]) =>
  bySchemeName[s].briefs !== want.briefs || bySchemeName[s].joined !== want.joined)

check('every scheme joins at the rate the capture measured',
  drifted.length === 0,
  drifted.map(([s, w]) =>
    `${s}: ${bySchemeName[s].briefs}/${bySchemeName[s].joined}, pinned ${w.briefs}/${w.joined}`).join('; ') ||
  `${Object.keys(PINNED).length} scheme(s) matching`)

// Stated as a check so it cannot quietly stop being true. Every row in the
// fresh capture is unattributed, same as the 592-row corpus — independent
// corroboration of Corpus.fs's finding on data captured 16 days later.
check('not one captured brief carries a scoring_version',
  CAPTURE.briefs.filter(b => b.scoring_version !== null && b.scoring_version !== undefined).length === 0,
  `${CAPTURE.briefs.filter(b => b.scoring_version != null).length} carry one`)

// The 25 bare-espn-numeric briefs that do not join are not a resolver fault:
// 97 of 469 game rows carry no espn_event_id, so there is no key to match.
// Asserted so the day that changes, this says so.
check('unjoined ESPN-keyed briefs are explained by game rows lacking the key',
  CAPTURE.games.filter(g => g.espn_event_id == null || g.espn_event_id === '').length === 97,
  `${CAPTURE.games.filter(g => g.espn_event_id == null || g.espn_event_id === '').length} game row(s) lack espn_event_id`)

// Phase 4 needs joined rows to compare a scoreline against. 358 is the size of
// the base it can actually be built on.
check('the joinable base is large enough to build a scoreline check on',
  result.joined >= 300,
  `${result.joined} joined brief(s)`)

finish(summarize())
