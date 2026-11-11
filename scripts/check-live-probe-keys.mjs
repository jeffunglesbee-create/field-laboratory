// The live-score probe asks the relay for the feed of every sport key a soccer card maps to, and it keeps that mapping as a table of its own
// (`LABEL_TO_KEY` in scripts/live-score-probe.mjs) because the probe runs on a runner that builds nothing. A hand copy drifts: a seventeenth soccer
// sport added to src/Desk.fs is forced to have a feed key by src/LiveScore.fs, and would silently be left out of the probe's cards and of its
// runner view (review 2026-11-11, glue S19: the only guard was a count of sixteen against the literal sixteen).
//
// This reads the COMPILED registry (build/Desk.js, build/LiveScore.js) and holds the probe's table to it, both ways: every soccer sport has an
// entry with the registry's key, and the table has nothing the registry does not. It runs where `build/` exists (verify.yml), never on the probe's
// runner.
//
// It ALSO holds the probe's COPY of the feed decoder (`decodeFeed` in the probe) to the page's own (`decodeFeed` in build/LiveFeed.js) on one battery of bodies
// (review 2026-11-11, decoder S7 and S11: the probe's own self-test and mutation table asserted a rejection the page did not make, and the page rejected
// bodies the probe accepted). Both read the same bodies; the check fails on any disagreement about whether the feed decodes, and about every game it decodes to.
//
// Usage: node scripts/check-live-probe-keys.mjs

import { createChecks, finish } from './checks.mjs'
import { allSports, sportMeta } from '../build/Desk.js'
import { liveSportKey } from '../build/LiveScore.js'
import { decodeFeed as pageDecodeFeed } from '../build/LiveFeed.js'
import { LABEL_TO_KEY, SOCCER, decodeFeed as probeDecodeFeed } from './live-score-probe.mjs'

const { check, summarize } = createChecks()
const soccer = [...allSports].filter(s => sportMeta(s).IsSoccer)
const labels = soccer.map(s => sportMeta(s).Label)

check(`the registry has soccer sports to compare (${soccer.length})`, soccer.length > 0)
for (const s of soccer) {
  const label = sportMeta(s).Label
  check(`${label}: the probe's table has the registry's feed key (${liveSportKey(s)})`, LABEL_TO_KEY[label] === liveSportKey(s) && typeof liveSportKey(s) === 'string',
    `table says ${JSON.stringify(LABEL_TO_KEY[label])}, registry says ${JSON.stringify(liveSportKey(s))}`)
}
const extra = SOCCER.filter(l => !labels.includes(l))
check('the probe\'s table names no sport the registry does not have as soccer', extra.length === 0, extra.join(', '))
check('every key in the table is distinct', new Set(Object.values(LABEL_TO_KEY)).size === Object.keys(LABEL_TO_KEY).length)
console.log(`compared ${soccer.length} registry soccer sports with ${SOCCER.length} table entries`)

// ---- the feed decoder, page versus probe -------------------------------------------------------------------------------------------------------------------
const game = over => ({ espnEventId: '7', state: 'live', home: { score: 1 }, away: { score: 0 }, ...over })
const without = key => { const { [key]: _gone, ...rest } = game(); return rest }
/** Bodies of `/v2/games`, each one decision the decoder makes. None is a capture of a game in play: they are shaped to the keys the relay emits (`adaptESPNWCSoccer`). */
const BATTERY = {
  'a live game with a clock': { games: [game({ clock: "34'" })] },
  'no games at all': { games: [] },
  'games is an object': { games: {} },
  'no games key': {},
  'a game that is a number': { games: [5] },
  'a game that is null': { games: [null] },
  'a numeric espnEventId': { games: [game({ espnEventId: 7 })] },
  'a null espnEventId': { games: [game({ espnEventId: null })] },
  'a numeric state': { games: [game({ state: 3 })] },
  'no state': { games: [without('state')] },
  'a numeric-string score': { games: [game({ home: { score: '1' } })] },
  'a numeric-string score with a space': { games: [game({ home: { score: ' 1' } })] },
  'a non-numeric string score': { games: [game({ home: { score: 'x' } })] },
  'a fractional score': { games: [game({ home: { score: 1.5 } })] },
  'the largest int32 score': { games: [game({ home: { score: 2147483647 } })] },
  'a score over int32': { games: [game({ home: { score: 2147483648 } })] },
  'a negative score': { games: [game({ home: { score: -1 } })] },
  'a score below int32': { games: [game({ home: { score: -2147483649 } })] },
  'a zero score on the home side': { games: [game({ home: { score: 0 } })] },
  'a boolean score': { games: [game({ home: { score: true } })] },
  'an object score': { games: [game({ home: { score: {} } })] },
  'a null score': { games: [game({ home: { score: null } })] },
  // The AWAY side is a separate call site in the page's decoder (`AwayScore`) and in the probe's (`g.away?.score`): every bad value above is held against it as well (fix-review 2026-11-11, decoder F5).
  'a numeric-string away score': { games: [game({ away: { score: '0' } })] },
  'a fractional away score': { games: [game({ away: { score: 1.5 } })] },
  'an away score over int32': { games: [game({ away: { score: 2147483648 } })] },
  'the largest int32 away score': { games: [game({ away: { score: 2147483647 } })] },
  'a negative away score': { games: [game({ away: { score: -1 } })] },
  'a boolean away score': { games: [game({ away: { score: true } })] },
  'a null away score': { games: [game({ away: { score: null } })] },
  'an away team with no score': { games: [game({ away: {} })] },
  // The half-time flag (src/LiveFeed.fs `IsHalftime`, the probe's `halftimeOf`): where the relay puts it, and every shape of it a body could carry.
  'a half-time flag true': { games: [game({ situation: { isHalftime: true } })] },
  'a half-time flag false': { games: [game({ situation: { isHalftime: false } })] },
  'a null half-time flag': { games: [game({ situation: { isHalftime: null } })] },
  'a situation with no half-time flag': { games: [game({ situation: { elapsed: 34 } })] },
  'a null situation': { games: [game({ situation: null })] },
  'a string half-time flag': { games: [game({ situation: { isHalftime: 'true' } })] },
  'a numeric half-time flag': { games: [game({ situation: { isHalftime: 1 } })] },
  'a string situation': { games: [game({ situation: 'x' })] },
  'a numeric situation': { games: [game({ situation: 5 })] },
  'a list for the situation': { games: [game({ situation: [] })] },
  'no home team': { games: [without('home')] },
  'a null home team': { games: [game({ home: null })] },
  'a string home team': { games: [game({ home: 'x' })] },
  'a list for the away team': { games: [game({ away: [] })] },
  'a number for the home team': { games: [game({ home: 5 })] },
  'an empty clock': { games: [game({ clock: '' })] },
  'a null clock': { games: [game({ clock: null })] },
  'a numeric clock': { games: [game({ clock: 34 })] },
  'keys the decoder does not read': { games: [game({ foo: 1, home: { score: 1, name: 'A' } })] },
  'one bad game of two': { games: [game(), game({ espnEventId: 9, state: undefined })] },
}
// The page's Result is Fable's (tag 0 = Ok, fields[0] = a list of records, None = undefined); the probe's is { ok, games }. Both reduced to the same shape, with `null` for no score and
// `''` for no clock (the probe's own reading of an absent clock; the page keeps `None` and `readingFor` drops an empty one, which is the same reading).
const pageShape = r => (r.tag === 0 ? { ok: true, games: [...r.fields[0]].map(g => ({ id: g.EspnEventId, state: g.State, home: g.HomeScore ?? null, away: g.AwayScore ?? null, clock: g.Clock ?? '', halftime: g.IsHalftime })) } : { ok: false })
const probeShape = r => (r.ok ? { ok: true, games: r.games.map(g => ({ id: g.espnId, state: g.state, home: g.home, away: g.away, clock: g.clock, halftime: g.halftime })) } : { ok: false })

const verdicts = Object.entries(BATTERY).map(([name, body]) => {
  const page = pageShape(pageDecodeFeed(JSON.stringify(body)))
  const probe = probeShape(probeDecodeFeed(JSON.parse(JSON.stringify(body))))
  return { name, page, probe, same: JSON.stringify(page) === JSON.stringify(probe) }
})
for (const v of verdicts) check(`the probe's decoder and the page's agree: ${v.name} (${v.page.ok ? 'decodes' : 'fails the feed'})`, v.same, `page ${JSON.stringify(v.page)}, probe ${JSON.stringify(v.probe)}`)
check('the battery has both outcomes, so agreement on it is not agreement on nothing (at least 8 decode and at least 8 fail)', verdicts.filter(v => v.page.ok).length >= 8 && verdicts.filter(v => !v.page.ok).length >= 8,
  `${verdicts.filter(v => v.page.ok).length} decode, ${verdicts.filter(v => !v.page.ok).length} fail`)
check('a decoded game carries its fields, so the comparison above compared something', verdicts.find(v => v.name === 'a live game with a clock').page.games[0].clock === "34'")
check('...and the half-time flag, so a decoder that ignored it would be seen', verdicts.find(v => v.name === 'a half-time flag true').page.games[0].halftime === true && verdicts.find(v => v.name === 'a half-time flag false').page.games[0].halftime === false)
console.log(`compared the page's and the probe's feed decoders on ${verdicts.length} bodies: ${verdicts.filter(v => v.same).length} agree (${verdicts.filter(v => v.page.ok).length} decode, ${verdicts.filter(v => !v.page.ok).length} fail the feed). Not covered: bodies outside this list. The two real bodies of games in play (2026-11-11) are decoded by the Suite, not by this battery.`)
finish(summarize())
