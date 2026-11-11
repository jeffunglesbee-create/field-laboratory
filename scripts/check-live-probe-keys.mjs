// The live-score probe asks the relay for the feed of every sport key a soccer card maps to, and it keeps that mapping as a table of its own
// (`LABEL_TO_KEY` in scripts/live-score-probe.mjs) because the probe runs on a runner that builds nothing. A hand copy drifts: a seventeenth soccer
// sport added to src/Desk.fs is forced to have a feed key by src/LiveScore.fs, and would silently be left out of the probe's cards and of its
// runner view (review 2026-11-11, glue S19: the only guard was a count of sixteen against the literal sixteen).
//
// This reads the COMPILED registry (build/Desk.js, build/LiveScore.js) and holds the probe's table to it, both ways: every soccer sport has an
// entry with the registry's key, and the table has nothing the registry does not. It runs where `build/` exists (verify.yml), never on the probe's
// runner.
//
// Usage: node scripts/check-live-probe-keys.mjs

import { createChecks, finish } from './checks.mjs'
import { allSports, sportMeta } from '../build/Desk.js'
import { liveSportKey } from '../build/LiveScore.js'
import { LABEL_TO_KEY, SOCCER } from './live-score-probe.mjs'

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
finish(summarize())
