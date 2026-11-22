// The live-score probe asks the relay for the feed of every sport key a card maps to (soccer, and from 2026-11-22 NBA, WNBA, NHL, MLB, NFL, CFB and AFL), and it keeps that mapping as tables of its own
// (`LABEL_TO_KEY`, `AWAY_FIRST` and `WINDOW_H` in scripts/live-score-probe.mjs) because the probe runs on a runner that builds nothing. A hand copy drifts: a seventeenth soccer sport added to
// src/Desk.fs is forced to have a feed key by src/LiveScore.fs, and would silently be left out of the probe's cards and of its runner view (review 2026-11-11, glue S19: the only guard was a count
// of sixteen against the literal sixteen); a sport given a different window or a different score order on the page would be judged wrongly by the probe.
//
// This reads the COMPILED registry (build/Desk.js, build/LiveScore.js) and holds the probe's tables to it, both ways: every sport the page asks the feed about has an entry with the registry's key,
// the table has nothing the registry does not, the labels the probe draws the AWAY score first for are the registry's `AwayAtHome` sports among them, and every window is the registry's. It runs where
// `build/` exists (verify.yml), never on the probe's runner.
//
// It ALSO holds the probe's COPY of the feed decoder (`decodeFeed` in the probe) to the page's own (`decodeFeed` in build/LiveFeed.js) on one battery of bodies
// (review 2026-11-11, decoder S7 and S11: the probe's own self-test and mutation table asserted a rejection the page did not make, and the page rejected
// bodies the probe accepted). Both read the same bodies; the check fails on any disagreement about whether the feed decodes, and about every game it decodes to.
//
// Usage: node scripts/check-live-probe-keys.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { createChecks, finish } from './checks.mjs'
import { allSports, sportMeta } from '../build/Desk.js'
import { liveSportKey, liveWindowFor } from '../build/LiveScore.js'
import { decodeFeed as pageDecodeFeed } from '../build/LiveFeed.js'
import { LABEL_TO_KEY, SOCCER, OTHER_LIVE, AWAY_FIRST, WINDOW_H, windowMsOf, decodeFeed as probeDecodeFeed } from './live-score-probe.mjs'

const { check, summarize } = createChecks()
const labelOf = s => sportMeta(s).Label
const soccer = [...allSports].filter(s => sportMeta(s).IsSoccer)
const labels = soccer.map(labelOf)
// Every sport the page asks the feed about: a sport with a key (`liveSportKey` is `string option`, so `undefined` is no key). Soccer must ALL have one; the rest are the ones the relay serves.
const keyed = [...allSports].filter(s => typeof liveSportKey(s) === 'string')
const others = keyed.filter(s => !sportMeta(s).IsSoccer)
const otherLabels = others.map(labelOf)

check(`the registry has soccer sports to compare (${soccer.length}) and other sports with a feed key (${others.length})`, soccer.length > 0 && others.length > 0)
for (const s of keyed) {
  const label = labelOf(s)
  check(`${label}: the probe's table has the registry's feed key (${liveSportKey(s)})`, LABEL_TO_KEY[label] === liveSportKey(s) && typeof liveSportKey(s) === 'string',
    `table says ${JSON.stringify(LABEL_TO_KEY[label])}, registry says ${JSON.stringify(liveSportKey(s))}`)
}
check('every soccer sport of the registry has a feed key (the page asks about all of them)', soccer.every(s => typeof liveSportKey(s) === 'string'), soccer.filter(s => typeof liveSportKey(s) !== 'string').map(labelOf).join(', '))
const extra = SOCCER.filter(l => !labels.includes(l))
const missing = labels.filter(l => !SOCCER.includes(l))
check('the probe\'s soccer list is the registry\'s soccer sports, both ways', extra.length === 0 && missing.length === 0, `not in the registry: ${extra.join(', ')}; not in the probe: ${missing.join(', ')}`)
const extraOther = OTHER_LIVE.filter(l => !otherLabels.includes(l))
const missingOther = otherLabels.filter(l => !OTHER_LIVE.includes(l))
check('the probe\'s other-sports list is the registry\'s non-soccer sports with a feed key, both ways', extraOther.length === 0 && missingOther.length === 0, `not in the registry: ${extraOther.join(', ')}; not in the probe: ${missingOther.join(', ')}`)
const stray = Object.keys(LABEL_TO_KEY).filter(l => !keyed.map(labelOf).includes(l))
check('the probe\'s table names no sport the registry does not ask the feed about', stray.length === 0, stray.join(', '))
check('every key in the table is distinct', new Set(Object.values(LABEL_TO_KEY)).size === Object.keys(LABEL_TO_KEY).length)

// The score order: the page draws the AWAY score first for a sport whose `Matchup` is `AwayAtHome`. The compiled union is `{ tag }` (AwayAtHome is the first case), so the tag of one sport the page
// writes as `Away @ Home` and one it writes `Home v Away` are pinned first: if the union were reordered, an empty set on both sides would otherwise agree.
const tagOf = label => sportMeta([...allSports].find(s => labelOf(s) === label)).Matchup.tag
check('the compiled Matchup tags tell the two conventions apart: NBA (`Away @ Home`) and EPL (`Home v Away`) differ', tagOf('NBA') !== tagOf('EPL'), `NBA ${tagOf('NBA')}, EPL ${tagOf('EPL')}`)
const awayTag = tagOf('NBA')
const registryAwayFirst = keyed.filter(s => sportMeta(s).Matchup.tag === awayTag).map(labelOf).sort()
check(`the probe draws the away score first for exactly the registry's AwayAtHome sports (${registryAwayFirst.join(', ')})`, JSON.stringify([...AWAY_FIRST].sort()) === JSON.stringify(registryAwayFirst),
  `probe ${JSON.stringify([...AWAY_FIRST].sort())}, registry ${JSON.stringify(registryAwayFirst)}`)

// The windows, in milliseconds (the compiled TimeSpan is a number): every sport the page asks the feed about, the probe's window against `LiveScore.liveWindowFor`.
const windowDiffs = keyed.filter(s => windowMsOf(labelOf(s)) !== liveWindowFor(s)).map(s => `${labelOf(s)}: probe ${windowMsOf(labelOf(s))}, registry ${liveWindowFor(s)}`)
check(`the probe's poll window is the registry's for all ${keyed.length} sports the page asks the feed about`, windowDiffs.length === 0, windowDiffs.join('; '))
const windowStray = Object.keys(WINDOW_H).filter(l => !otherLabels.includes(l))
check('the probe\'s window table names only non-soccer sports the registry asks the feed about (soccer has the default)', windowStray.length === 0, windowStray.join(', '))
console.log(`compared ${keyed.length} registry sports that have a feed key (${soccer.length} soccer, ${others.length} other) with ${Object.keys(LABEL_TO_KEY).length} table entries; away-first ${AWAY_FIRST.size}, windows ${Object.keys(WINDOW_H).length} non-default`)

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
  // Fix-review round 3 (defence F3, F6): added time in play is not half time, and the falsy values a truthiness test would let through.
  'added time in play, stoppage true and half time false': { games: [game({ clock: "45'+2'", situation: { isStoppage: true, isHalftime: false } })] },
  'added time at the break, stoppage true and half time true': { games: [game({ clock: "45'+3'", situation: { isStoppage: true, isHalftime: true } })] },
  'a false situation': { games: [game({ situation: false })] },
  'a zero situation': { games: [game({ situation: 0 })] },
  'an empty-string situation': { games: [game({ situation: '' })] },
  'a zero half-time flag': { games: [game({ situation: { isHalftime: 0 } })] },
  'an empty-string half-time flag': { games: [game({ situation: { isHalftime: '' } })] },
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
  // The other sports (owner, 2026-11-22). NHL: no ESPN id, joined by the two club names; the final state word of NBA's siblings is `post`; a game the page can join to nothing is refused.
  'an NHL game: no espnEventId, both club names, a period label': { games: [game({ espnEventId: undefined, home: { name: 'Buffalo Sabres', score: 2 }, away: { name: 'Tampa Bay Lightning', score: 4 }, clock: '02:42', periodLabel: 'P2' })] },
  'a null espnEventId with both club names': { games: [game({ espnEventId: null, home: { name: 'Buffalo Sabres', score: 2 }, away: { name: 'Tampa Bay Lightning', score: 4 } })] },
  'no espnEventId and no club names': { games: [game({ espnEventId: undefined })] },
  'no espnEventId and one club name': { games: [game({ espnEventId: undefined, home: { name: 'Buffalo Sabres', score: 2 }, away: { score: 4 } })] },
  'a numeric espnEventId': { games: [game({ espnEventId: 401879233 })] },
  'a numeric club name beside a string id': { games: [game({ home: { name: 5, score: 1 } })] },
  'a post state word': { games: [game({ state: 'post', home: { name: 'South Carolina Gamecocks', score: 6 }, away: { name: 'Georgia Bulldogs', score: 34 }, periodLabel: 'F', clock: '0:00' })] },
  'a numeric period label': { games: [game({ periodLabel: 2 })] },
  'a null period label': { games: [game({ periodLabel: null })] },
}
// The page's Result is Fable's (tag 0 = Ok, fields[0] = a list of records, None = undefined); the probe's is { ok, games }. Both reduced to the same shape, with `null` for no score and
// `''` for no clock (the probe's own reading of an absent clock; the page keeps `None` and `readingFor` drops an empty one, which is the same reading).
const pageShape = r => (r.tag === 0 ? { ok: true, games: [...r.fields[0]].map(g => ({ id: g.EspnEventId ?? null, homeName: g.HomeName ?? null, awayName: g.AwayName ?? null, periodLabel: g.PeriodLabel ?? null, state: g.State, home: g.HomeScore ?? null, away: g.AwayScore ?? null, clock: g.Clock ?? '', halftime: g.IsHalftime })) } : { ok: false })
const probeShape = r => (r.ok ? { ok: true, games: r.games.map(g => ({ id: g.espnId, homeName: g.homeName, awayName: g.awayName, periodLabel: g.periodLabel, state: g.state, home: g.home, away: g.away, clock: g.clock, halftime: g.halftime })) } : { ok: false })

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

// ---- the COMMITTED captures of real games, through both decoders ------------------------------------------------------------------------------------------------
// Fix-review round 3 (Rule 89): the notes said both decoders read the real bodies "unchanged", and no committed check ran them. Every `outbox/live-capture-*.json` of a sport key the page asks about
// carries the relay's real `/v2/games` body as `v2.body`; both decoders read it, and must decode it, to the same games. Read from the working directory, as the other scripts read `data/`.
const feedKeys = new Set(Object.values(LABEL_TO_KEY))
const captureFiles = readdirSync('outbox').filter(f => /^live-capture-.+\.json$/.test(f)).sort()
let readFromCaptures = 0
let notCompared = 0
for (const f of captureFiles) {
  const j = JSON.parse(readFileSync(`outbox/${f}`, 'utf8'))
  const body = j.v2?.body
  if (!feedKeys.has(j.sport) || body === undefined || body === null) { notCompared++; continue }
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const page = pageShape(pageDecodeFeed(text))
  const probe = probeShape(probeDecodeFeed(JSON.parse(text)))
  readFromCaptures++
  check(`the committed capture ${f} (${j.capturedAt}) decodes with the page's decoder and the probe's, to the same games`,
    page.ok && probe.ok && page.games.length > 0 && JSON.stringify(page) === JSON.stringify(probe), `page ${JSON.stringify(page)}, probe ${JSON.stringify(probe)}`)
}
check('there is at least one committed capture of a sport the page asks the feed about, so the loop above compared something', readFromCaptures > 0)
console.log(`compared both decoders on ${readFromCaptures} committed capture bod${readFromCaptures === 1 ? 'y' : 'ies'} (outbox/live-capture-*.json: ${captureFiles.length} files, ${notCompared} of a sport with no feed key or with no body)`)
finish(summarize())
