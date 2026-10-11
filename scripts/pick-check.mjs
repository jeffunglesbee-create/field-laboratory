// Decoder checks for FIELD's Pick, against the recorded live response.
//
// The interesting assertion is not "it parses". It is that the live data
// contains a three-way tie at the top — ranked[0..2] all score 3.5 — and that
// production resolves it by taking `scored[0]` after a sort, which makes
// "tonight's pick" a function of input order rather than of anything editorial.
// The decoder is required to notice.
//
// Usage:  node scripts/pick-check.mjs

import { readFileSync } from 'node:fs'
import { createChecks, toArray, finish } from './checks.mjs'
import { decodePick, decodeBundle, leadershipNote, entryMatchup, compareRank,
         passReasonCarriesNumber, passReasonText } from '../build/Pick.js'

const { check, summarize } = createChecks()

/** Fable compiles `Result` to a two-case union; tag 0 is Ok. */
const ok = r => r.tag === 0
const value = r => r.fields[0]

// Union tags, in declaration order, so a comparison is readable.
const OUTCOME = { NoPickSection: 0, Passed: 1, Picked: 2 }
const LEADERSHIP = { Unrivalled: 0, SharedBy: 1 }

const fixture = readFileSync('data/pick-2026-07-07.json', 'utf8')
const decoded = decodePick(fixture)

check('the recorded live response decodes', ok(decoded),
  ok(decoded) ? '' : String(value(decoded)))

if (ok(decoded)) {
  const outcome = value(decoded)
  check('it is a Picked outcome', outcome.tag === OUTCOME.Picked,
    `tag ${outcome.tag}, expected ${OUTCOME.Picked}`)

  const board = outcome.fields[0]
  const chasers = toArray(board.Chasers)

  check('all five ranked entries survive', chasers.length === 4,
    `leader + ${chasers.length} chasers, expected leader + 4`)

  check('the leader is the game production picked',
    board.Leader.GameId === 'MLB_2026-07-07_reds_phillies',
    `got ${board.Leader.GameId}`)

  // The point of the exercise.
  check('the three-way tie at the top is detected',
    board.Leadership.tag === LEADERSHIP.SharedBy && board.Leadership.fields[0] === 3,
    `Leadership tag ${board.Leadership.tag}, contenders ${board.Leadership.fields?.[0]}`)

  check('the tie is stated in words, not swallowed',
    (leadershipNote(board.Leadership)?.includes('level with 2 others')) === true,
    `note was: ${leadershipNote(board.Leadership)}`)

  check('the brief rides on the board, not on every entry',
    board.Brief != null && chasers.every(c => c.Brief === undefined),
    'a chaser carried its own brief — that would imply an AI call per entry')

  check('reasons are kept, since they are the displayable half',
    toArray(board.Leader.Reasons).length === 3,
    `${toArray(board.Leader.Reasons).length} reasons on the leader`)

  check('the matchup renders through the sport registry',
    entryMatchup(board.Leader).includes('Reds') && entryMatchup(board.Leader).includes('Phillies'),
    `got "${entryMatchup(board.Leader)}"`)

  // Sorting is exposed; the number is not. If `compareRank` ever stopped
  // ordering, the leader would still look right on a pre-sorted response, so
  // this drives it directly on a deliberately reversed pair.
  const [a, b] = [board.Leader, chasers[chasers.length - 1]]
  check('compareRank orders descending', compareRank(a.Rank, b.Rank) < 0,
    'a higher-ranked entry did not sort before a lower-ranked one')
  check('compareRank is symmetric the other way', compareRank(b.Rank, a.Rank) > 0,
    'reversing the arguments did not reverse the ordering')
}

// --- the other two outcomes, which are not in the fixture --------------------

const passed = decodePick(JSON.stringify({ type: 'pass', reason: 'no qualifying games' }))
check('the pass branch decodes as Passed, not an empty board',
  ok(passed) && value(passed).tag === OUTCOME.Passed,
  `got tag ${ok(passed) ? value(passed).tag : 'decode error'}`)
// THE LIVE STRING, verbatim from the deployed page on 2026-08-10. The relay's
// pass reason carries a composite score AND its threshold, and this rendered
// verbatim until live-tabs-check caught it.
const leaky = decodePick(JSON.stringify({
  type: 'pass', reason: 'top game scored 1.0 — under the 3.0 watch-bar',
}))
check('a pass reason carrying a composite is detectable',
  ok(leaky) && passReasonCarriesNumber(value(leaky).fields[0]),
  'the drift signal is gone — nothing could report that upstream is emitting a score')

check('...and NOTHING of that sentence is renderable',
  ok(leaky) && !/\d/.test(passReasonText(value(leaky).fields[0])),
  `renderable text was: "${ok(leaky) ? passReasonText(value(leaky).fields[0]) : '?'}"`)

check('a harmless pass reason is equally unrenderable',
  ok(passed) && passReasonText(value(passed).fields[0]) === passReasonText(value(leaky).fields[0]),
  'the safe path must not depend on judging which free text is safe')

// A pick object predating the `ranked` field. Real: `ranked` was added
// 2026-07-07, and stored bundles from before that date do not have it.
const older = decodePick(JSON.stringify({ game_id: 'x', home: 'A', away: 'B', score: 2 }))
check('a pick with no ranked list is NoPickSection, not a fake board',
  ok(older) && value(older).tag === OUTCOME.NoPickSection,
  `got tag ${ok(older) ? value(older).tag : 'decode error'}`)

// The whole-bundle path: a newspaper response with no pick field at all.
const emptyBundle = decodeBundle(JSON.stringify({ date: '2026-07-07', briefs: [] }))
check('a bundle with no pick field is NoPickSection',
  ok(emptyBundle) && value(emptyBundle).tag === OUTCOME.NoPickSection,
  `got tag ${ok(emptyBundle) ? value(emptyBundle).tag : 'decode error'}`)

// Ordering must be computed, not inherited. The fixture arrives sorted, so a
// decoder that simply trusted the input order would pass every check above.
const shuffled = JSON.parse(fixture)
shuffled.ranked = [shuffled.ranked[4], shuffled.ranked[1], shuffled.ranked[0],
                   shuffled.ranked[3], shuffled.ranked[2]]
const reordered = decodePick(JSON.stringify(shuffled))
check('a shuffled response still ranks a 3.5 game first',
  ok(reordered) && toArray(value(reordered).fields[0].Leader.Reasons).length === 3,
  'the decoder trusted the arrival order instead of sorting')
check('a shuffled response still finds the same three-way tie',
  ok(reordered) && value(reordered).fields[0].Leadership.fields?.[0] === 3,
  'tie detection depended on arrival order')

finish(summarize())
