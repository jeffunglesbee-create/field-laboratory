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
// entry claims. `orderByMatchup`'s own comment records why: fixing the matchup
// text alone once produced "Sydney v Collingwood 75-81" where 75 was
// Collingwood's — names in one order, numbers in the other.
//
// It also pins the one deliberate omission. `golf` stays `Unrecognised`, and a
// check that only asserted "everything is modelled" would push someone to model
// it wrongly to get green.

import { sportOfString, sportMeta, matchupText, orderByMatchup } from '../build/Desk.js'
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
// `orderByMatchup` must agree, because they are the two halves that once
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

// The other half. `orderByMatchup` feeds the SCORES; if it disagrees with the
// text, the names and the numbers come out in opposite orders.
const wrongOrder = CONVENTION.filter(([s, kind]) => {
  const [first] = orderByMatchup(sportOfString(s), 'HOME', 'AWAY')
  return kind === 'away-at-home' ? first !== 'AWAY' : first !== 'HOME'
})
check('score ordering agrees with the matchup text for every sport',
  wrongOrder.length === 0,
  wrongOrder.map(([s]) => `${s}: first=${orderByMatchup(sportOfString(s), 'HOME', 'AWAY')[0]}`).join('; ') || 'all seven')

// Soccer is a flag Rule 50 names explicitly, and gridiron must not inherit it.
const soccer = SEEN.filter(s => sportMeta(sportOfString(s)).IsSoccer)
check('only the association-football competitions are flagged as soccer',
  soccer.length === 2 && soccer.includes('MLS') && soccer.includes('EFL Cup'),
  `flagged: ${soccer.join(', ') || 'none'}`)

// The deliberate omission, pinned so it cannot be "fixed" quietly.
//
// The relay packs a tournament and a round into home/away —
// golf_2026-08-14_fedexstjudechampionship_r2 rendered "FedEx St. Jude
// Championship vs R2". Every Matchup case asserts a contest between two sides,
// so modelling golf under one would have the desk state that a tournament
// played a round. Unmodelled is the true answer until a non-contest Matchup
// case exists.
const golf = sportMeta(sportOfString('golf'))
check('golf is still unmodelled, deliberately, and says so',
  golf.Modelled === false && golf.Label === 'golf',
  `Modelled=${golf.Modelled}, Label=${golf.Label}`)

// And an unknown sport must still degrade honestly rather than pick a side.
const unknown = sportMeta(sportOfString('kabaddi'))
check('an unrecognised sport is reported unmodelled, not guessed',
  unknown.Modelled === false && unknown.Label === 'kabaddi' &&
  matchupText(sportOfString('kabaddi'), 'Cowboys', 'Eagles') === 'Cowboys vs Eagles',
  `Modelled=${unknown.Modelled}, text=${matchupText(sportOfString('kabaddi'), 'Cowboys', 'Eagles')}`)

process.exit(summarize() === 0 ? 0 : 1)
