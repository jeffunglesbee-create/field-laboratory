// Rule 90 for outbox/venue-manadon-evidence-2026-11-11.mjs: an assertion is not trusted until it has failed on purpose.
// That script's --self-test doctors the EVIDENCE and checks that its checks go red. This one doctors the SCRIPT: it copies it with one
// line broken, runs the copy's --self-test, and requires the self-test to go red by the NAMED check, not by a crash (a syntax error
// exits 1 too and proves nothing: it was exactly that mistake that this runner's first draft made). Every anchor must occur once in the
// script, and the mutation must change it, or the run stops (mutate() in the script is the guard, and the script's self-test proves it fires).
//
// Run from the repository root:  node outbox/venue-manadon-evidence-mutations-2026-11-11.mjs   (exits 1 unless every mutation went red by its named check)

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { mutate } from './venue-manadon-evidence-2026-11-11.mjs'
import { finish } from '../scripts/checks.mjs'

const SCRIPT = 'outbox/venue-manadon-evidence-2026-11-11.mjs'
const TMP = 'outbox/zz-mut-manadon.mjs'

export const MUTATIONS = [
  { name: 'the harness stops asserting that an anchor is unique',
    find: 'if (n !== 1) throw new Error(`HARNESS: the anchor occurs ${n} times, not once: ${JSON.stringify(find).slice(0, 100)}`)', to: '',
    expect: 'A NON-UNIQUE ANCHOR STOPS THE HARNESS' },
  { name: 'the harness stops asserting that a mutation changed something',
    find: "if (out === text) throw new Error('HARNESS: the mutation changed nothing')", to: '',
    expect: 'A MUTATION THAT CHANGES NOTHING STOPS THE HARNESS' },
  { name: "the zone check passes whatever Open-Meteo says",
    find: "check(`Open-Meteo reports ${ZONE} at the row's point`, zone === ZONE,", to: "check(`Open-Meteo reports ${ZONE} at the row's point`, true,",
    expect: 'A DIFFERENT ZONE FROM OPEN-METEO IS CAUGHT' },
  { name: 'once() accepts a second match',
    find: 'if (all.length !== 1) throw new Error(`${what}: expected exactly one match, found ${all.length}`)', to: 'if (all.length < 1) throw new Error(`${what}: expected exactly one match, found ${all.length}`)',
    expect: 'A DUPLICATED ANCHOR IN THE PAGES FILE IS CAUGHT' },
  { name: 'blocks() accepts a URL twice',
    find: 'if (out.has(url)) throw new Error(`the URL occurs twice in the probe file: ${url.slice(0, 90)}`)', to: '',
    expect: 'A URL THAT OCCURS TWICE IS CAUGHT' },
  { name: 'the degree box is 1000 times too wide',
    find: 'const inBoxDeg = p => Math.abs(p.lat - point.lat) <= BOX && Math.abs(p.lon - point.lon) <= BOX',
    to: 'const inBoxDeg = p => Math.abs(p.lat - point.lat) <= BOX * 1000 && Math.abs(p.lon - point.lon) <= BOX * 1000',
    expect: 'A SECOND POSTCODE 22 KM AWAY IS CAUGHT BY THE BOX' },
  { name: 'the Active Places box test ignores north-south',
    find: 'Math.abs(apOffset.n) <= boxM.n && Math.abs(apOffset.e) <= boxM.e', to: 'Math.abs(apOffset.e) <= boxM.e',
    expect: 'AN ACTIVE PLACES POINT 3 KM NORTH IS CAUGHT BY THE BOX' },
  { name: 'the OpenStreetMap check ignores the name search',
    find: "nameSearch === '[]' && revHub.name === '' && revSite.name === ''", to: "revHub.name === '' && revSite.name === ''",
    expect: 'A NAMED OPENSTREETMAP OBJECT UNDER THE HUB NAME IS CAUGHT' },
  { name: 'the quality check accepts any quality',
    find: 'hub.quality === 1 && site.quality === 1', to: 'true',
    expect: 'A LOW POSITIONAL QUALITY IS CAUGHT' },
]

const src = readFileSync(SCRIPT, 'utf8')
let red = 0
for (const m of MUTATIONS) {
  writeFileSync(TMP, mutate(src, m.find, m.to))
  let r
  try { r = spawnSync(process.execPath, [TMP, '--self-test'], { encoding: 'utf8' }) } finally { unlinkSync(TMP) }
  const failed = r.stdout.split('\n').filter(l => l.startsWith('FAIL')).map(l => l.slice(6))
  const crashed = failed.length === 0 && /SyntaxError|Error:/.test(r.stderr)
  const caught = r.status === 1 && !crashed && failed.some(l => l.includes(m.expect))
  console.log(`${caught ? 'RED BY THE NAMED CHECK' : 'NOT CAUGHT           '}  ${m.name}  (exit ${r.status}; failed: ${failed.join('; ') || (crashed ? 'a crash, not a check' : 'none')})`)
  if (caught) red++
}
console.log(`\nchecked ${MUTATIONS.length} of ${MUTATIONS.length} script mutations; ${red} went red by the named check`)
finish(red === MUTATIONS.length ? 0 : 1)
