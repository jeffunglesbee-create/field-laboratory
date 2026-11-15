// Scout's Gate E, the coin-flip market, against the real 2026-11-14 lines.
//
// WHAT IT IS
//
// Gate E qualifies a game whose pre-game market had it level: the de-vigged
// home probability (`Desk.winProbability`, closing preferred over opening) in
// 47% to 53% inclusive. Added 2026-11-15 on the owner's approval of the
// win-probability input; /context/date carries the moneylines it needs.
//
// WHAT THIS HOLDS
//
//   1. a table of real games, each with its expected answer, chosen so a wrong
//      band, a transposed side or a skipped opening line gives a wrong answer.
//      The expected percentages were computed by hand (implied = -ml/(-ml+100)
//      or 100/(ml+100), home / (home + away)), not by the code under test:
//        Ducks 49.57  Blues 50.43  Marshall 47.83  Bruins 45.73
//        Cavaliers 25.55  Texas A&M 49.57  Oklahoma (opening) 56.35
//      and, for the closing-first claim, Bruins' OPENING line: 47.39
//   2. a level game on a national-only broadcast is still vetoed by Gate 0,
//      so Gate E cannot bring back what Gate 0 exists to remove
//   3. the reason names both sides, in the sport's matchup order
//   4. the "cannot tell" summary counts the gates it asked, not a literal 5
//
// Usage:  node scripts/scout-coinflip-check.mjs   (needs build/)

import { readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import { decodePayload } from '../build/Desk.js'
import { gateCoinFlip, scoutVerdict, verdictSummary, gatesFor } from '../build/Scout.js'

const { check, summarize } = createChecks()
const ANSWER = ['Qualifies', 'DoesNotQualify', 'Unanswerable']
const VERDICT = ['Disqualified', 'Qualifying', 'NotQualifying', 'Indeterminate']

const { rows } = JSON.parse(readFileSync('data/scout-coinflip-2026-11-14.json', 'utf8'))
const odds = ml => (ml ? JSON.stringify({ source: 'draftkings', moneyline: { home: ml[0], away: ml[1] } }) : null)
const asGame = (r, i) => ({
  id: `${r.sport}_2026-11-14_row${i}`, sport: r.sport, league: r.sport, date: '2026-11-14',
  home: r.home, away: r.away, home_score: null, away_score: null, venue: null,
  streams: r.streams, note: null, tags: null, crew: null, local_note: null,
  created_at: '2026-11-14 10:00:00', opening_odds: odds(r.opening), closing_odds: odds(r.closing),
  drama_peak: null, drama_arc: null, espn_event_id: null, went_to_ot: null,
  finalized_at: null, start_time: '2026-11-15T00:00Z',
})
const decoded = decodePayload(JSON.stringify({
  ok: true, date: '2026-11-14', games: { regular: rows.map(asGame), postseason: [] },
  briefs: [], series: [], standings: [],
}))
check('the fixture decodes', decoded.tag === 0, decoded.tag === 0 ? '' : String(decoded.fields[0]))
const games = Array.from(decoded.fields[0].Regular)
const byHome = name => games.find(g => g.Home === name)
const gateE = name => { const a = gateCoinFlip(byHome(name)).Answer; return { kind: ANSWER[a.tag], text: a.fields[0] } }

const TABLE = [
  ['Ducks', 'Qualifies', 'inside the band (49.57)'],
  ['Blues', 'Qualifies', 'inside the band (50.43)'],
  ['Marshall', 'Qualifies', 'just inside the low edge (47.83)'],
  ['Bruins', 'DoesNotQualify', 'just outside on the closing line (45.73) while its OPENING line (47.39) is inside, so closing is read first; the proposal said 54/46 qualifies, and under its own band it does not'],
  ['Cavaliers', 'DoesNotQualify', 'a long favourite (25.55)'],
  ['Texas A&M', 'Qualifies', 'level (49.57); Gate 0 is asserted separately below'],
  ['Oklahoma', 'DoesNotQualify', 'no closing line: the opening line (56.35) is read'],
  ['golf-row-a', 'Unanswerable', 'no line served at all'],
]
for (const [home, expect, why] of TABLE) {
  const got = gateE(home)
  check(`${home}: ${expect} — ${why}`, got.kind === expect, `got ${got.kind}: ${got.text}`)
}

const ducks = gateE('Ducks').text
check('the reason names both sides in matchup order (NHL reads away @ home: Islanders first)',
  /Islanders 50%, Ducks 50%/.test(ducks), `reason: ${ducks}`)
check('the reason carries no bare decimal', !/\d\.\d/.test(ducks), `reason: ${ducks}`)

const am = scoutVerdict(byHome('Texas A&M'), 0)
check('a level game on a national-only broadcast is still vetoed by Gate 0',
  VERDICT[am.tag] === 'Disqualified', `verdict ${VERDICT[am.tag]}: ${verdictSummary(am)}`)
const ducksV = scoutVerdict(byHome('Ducks'), 0)
check('a level game with a local option is a Scout qualifier',
  VERDICT[ducksV.tag] === 'Qualifying', `verdict ${VERDICT[ducksV.tag]}: ${verdictSummary(ducksV)}`)

const golfV = scoutVerdict(byHome('golf-row-a'), 0)
const asked = Array.from(gatesFor(byHome('golf-row-a'), 0)).length
check(`the "cannot tell" summary counts the gates it asked (${asked})`,
  VERDICT[golfV.tag] === 'Indeterminate' && verdictSummary(golfV).includes(`of ${asked} gates`),
  `verdict ${VERDICT[golfV.tag]}: ${verdictSummary(golfV)}`)

finish(summarize())
