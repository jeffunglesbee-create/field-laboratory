// The sport registry, against the sports production actually serves.
//
// WHY
//
// `drift-sentinel` reported `unmodelled: NFL, CFL, golf` on 2026-08-14 and
// again on 2026-08-15. An unmodelled sport is not a cosmetic gap: `sportMeta`
// gives it `UnknownConvention`, and `matchupText` then renders "Home vs Away"
// regardless of which side the relay calls home. For NFL — a sport
// client/relay treats as first-class — the desk was naming the visiting side
// second on every card.
//
// This asserts the registry's CONTENT, not just its shape: that the sports
// production serves are modelled, and that each renders in the convention its
// entry claims. `presentByMatchup`'s own comment records why: fixing the matchup
// text alone once produced "Sydney v Collingwood 75-81" where 75 was
// Collingwood's — names in one order, numbers in the other.
//
// It also pins golf, which is a NON-CONTEST and must never render as a fixture.
// Until 2026-08-25 this file pinned golf as deliberately UNMODELLED; the
// `NotAContest` Matchup case is what changed that, and the assertion moved with
// it rather than being deleted -- a check that only asserted "everything is
// modelled" would still pass while the desk said a tournament played a round.

import { sportOfString, sportMeta, matchupText, presentByMatchup } from '../build/Desk.js'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()

// Every sport string observed in production's /context/date payloads, from the
// drift-sentinel log lines of 2026-08-14 and 2026-08-15:
//   MLB:14 MLS:3 NFL*:3 WNBA:2 CFL*:1 golf*:1   (* = unmodelled at the time)
const SEEN = ['MLB', 'MLS', 'WNBA', 'EFL Cup', 'NFL', 'CFL', 'AFL']

check('the observed-sport list is non-empty',
  SEEN.length > 0, `${SEEN.length} sport string(s)`)

const unmodelled = SEEN.filter(s => !sportMeta(sportOfString(s)).Modelled)
check('every sport production serves is modelled',
  unmodelled.length === 0,
  unmodelled.length ? `still unmodelled: ${unmodelled.join(', ')}` : SEEN.join(', '))

// Each entry's label must be the string it came from — a registry that renames
// a sport is a registry two systems disagree about.
const mislabelled = SEEN.filter(s => sportMeta(sportOfString(s)).Label !== s)
check('each modelled sport keeps the label production uses',
  mislabelled.length === 0,
  mislabelled.map(s => `${s} -> ${sportMeta(sportOfString(s)).Label}`).join(', ') || 'all match')

// The convention, exercised rather than read off the record. `matchupText` and
// `presentByMatchup` must agree, because they are the two halves that once
// disagreed and transposed a scoreline.
const CONVENTION = [
  ['NFL', 'away-at-home', 'Eagles @ Cowboys'],
  ['CFL', 'away-at-home', 'Eagles @ Cowboys'],
  ['MLB', 'away-at-home', 'Eagles @ Cowboys'],
  ['WNBA', 'away-at-home', 'Eagles @ Cowboys'],
  ['AFL', 'home-first', 'Cowboys v Eagles'],
  ['MLS', 'home-first', 'Cowboys v Eagles'],
  ['EFL Cup', 'home-first', 'Cowboys v Eagles'],
]

const wrongText = CONVENTION.filter(([s, , want]) => matchupText(sportOfString(s), 'Cowboys', 'Eagles') !== want)
check('every sport renders in the convention its entry claims',
  wrongText.length === 0,
  wrongText.map(([s, , want]) =>
    `${s}: ${matchupText(sportOfString(s), 'Cowboys', 'Eagles')} (want ${want})`).join('; ') || 'all seven')

// The other half. `presentByMatchup` feeds the SCORES; if it disagrees with the
// text, the names and the numbers come out in opposite orders.
//
// `.fields[0]` is Fable's encoding of a union case's first field: a Contest
// carries (first, second), an Event carries the EventShape. Read positionally
// because the case NAME is what distinguishes them, asserted just below.
const firstOf = s => presentByMatchup(sportOfString(s), 'HOME', 'AWAY').fields[0]
const wrongOrder = CONVENTION.filter(([s, kind]) => {
  const first = firstOf(s)
  return kind === 'away-at-home' ? first !== 'AWAY' : first !== 'HOME'
})
check('score ordering agrees with the matchup text for every sport',
  wrongOrder.length === 0,
  wrongOrder.map(([s]) => `${s}: first=${firstOf(s)}`).join('; ') || 'all seven')

// Soccer is a flag Rule 50 names explicitly, and gridiron must not inherit it.
const soccer = SEEN.filter(s => sportMeta(sportOfString(s)).IsSoccer)
check('only the association-football competitions are flagged as soccer',
  soccer.length === 2 && soccer.includes('MLS') && soccer.includes('EFL Cup'),
  `flagged: ${soccer.join(', ') || 'none'}`)

// Golf, pinned as a NON-CONTEST so it cannot quietly become a fixture again.
//
// The relay packs an event and a round into home/away --
// golf_2026-08-24_bmwchampionship_r4 carries "BMW Championship" and "R4" --
// so the desk once rendered "BMW Championship vs R4" and stated that a
// tournament played a round. Modelled 2026-08-25 under `NotAContest`.
const golf = sportMeta(sportOfString('golf'))
check('golf is modelled, and as a non-contest',
  golf.Modelled === true && golf.Label === 'golf' && golf.Omission == null,
  `Modelled=${golf.Modelled}, Label=${golf.Label}, Omission=${golf.Omission ?? 'none'}`)

const GOLF_TEXT = matchupText(sportOfString('golf'), 'BMW Championship', 'R4')
check('golf renders the event and its round, never a versus',
  GOLF_TEXT === 'BMW Championship \u00b7 R4',
  `rendered ${JSON.stringify(GOLF_TEXT)}`)

// The separator, asserted as a NEGATIVE as well. The line above pins one exact
// string; this pins the whole class the case exists to refuse, so a future
// reformat cannot reintroduce a fixture by changing the spacing.
check('no contest separator survives anywhere in the golf line',
  !/(^|\s)(v|vs|@|versus)(\s|$)/i.test(GOLF_TEXT),
  `rendered ${JSON.stringify(GOLF_TEXT)}`)

// A non-contest yields NO PAIR. This is the whole reason `presentByMatchup`
// returns a decision instead of two values -- see its comment in Desk.fs.
//
// The case is read BY NAME, not by field count. Fable encodes a union case as
// `{tag, fields}` with `cases()` listing the names in tag order, so
// `cases()[tag]` is the real case identity -- and a field count would pass for
// any future one-field case, which is precisely what this must not accept.
const caseOf = u => u.cases()[u.tag]
const golfPres = presentByMatchup(sportOfString('golf'), 'BMW Championship', 'R4')
// The payload is itself a union (an `EventShape`), not a string -- it only
// LOOKS like one through String(). Read its case the same way.
check('golf yields an Event, not a pair to order',
  caseOf(golfPres) === 'Event' && caseOf(golfPres.fields[0]) === 'LeaderboardSnapshot',
  `${caseOf(golfPres)}(${golfPres.fields.map(caseOf).join(', ')})`)

// Every OTHER modelled sport must still be a contest. Enumerated, not sampled:
// one entry silently flipping to `NotAContest` would blank its scorelines.
const CONTEST_SPORTS = [
  'AFL', 'MLB', 'MLS', 'EFL Cup', 'WNBA', 'NFL', 'CFL', 'La Liga', 'EPL',
  'Ligue 1', 'Serie A', 'UEFA Champions League', 'UEFA Champions League Qualifying',
  'UEFA Europa League', 'UEFA Europa League Qualifying',
  'UEFA Europa Conference League', 'UEFA Europa Conference League Qualifying',
  'FIFA World Cup', 'EFL Trophy', 'NBA', 'NHL',
]
const notContest = CONTEST_SPORTS.filter(s =>
  caseOf(presentByMatchup(sportOfString(s), 'HOME', 'AWAY')) !== 'Contest')
check('every other modelled sport is still a contest with two sides',
  notContest.length === 0 && CONTEST_SPORTS.length === 21,
  notContest.length ? `not a contest: ${notContest.join(', ')}` : `${CONTEST_SPORTS.length} sports, all pairs`)

// And an unknown sport must still degrade honestly rather than pick a side.
const unknown = sportMeta(sportOfString('kabaddi'))
check('an unrecognised sport is reported unmodelled, not guessed',
  unknown.Modelled === false && unknown.Label === 'kabaddi' &&
  matchupText(sportOfString('kabaddi'), 'Cowboys', 'Eagles') === 'Cowboys vs Eagles',
  `Modelled=${unknown.Modelled}, text=${matchupText(sportOfString('kabaddi'), 'Cowboys', 'Eagles')}`)

process.exit(summarize() === 0 ? 0 : 1)
