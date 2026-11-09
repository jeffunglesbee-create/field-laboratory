// Rule 90 for scripts/venue-infobox.mjs and scripts/venue-infobox-read.mjs: each registered mutation, applied to a COPY of the file
// it names, is run against the probe's own self-test and the checks that go red are printed by name.
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3. Run from the repository root:
//   node outbox/venue-infobox-mutation-2026-11-09.mjs
//
// Why this exists beside `node scripts/mutation-check.mjs --ids ...`: that run says a mutation failed the expectation
// (`--self-test` exited non-zero). A crash exits non-zero too, so two of the 15 first "passed" there by crashing with a
// TypeError instead of failing a named check. This reads the registry's own entries, asserts each anchor occurs exactly
// once in the file the entry names (a mutation that did not apply is reported, never counted), and prints the FAIL lines
// the self-test wrote.
//
// The reader (scripts/venue-infobox-read.mjs) was moved out of the probe on 2026-11-09 so that the roof rule can import it
// without an import cycle. An entry that cuts the reader is applied to a twin of the reader, and the twin of the probe is
// rewired to import that twin, so the self-test that runs is the probe's own, reading the mutated reader.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const reg = readFileSync('scripts/mutation-check.mjs', 'utf8')
const PROBE = 'scripts/venue-infobox.mjs', READER = 'scripts/venue-infobox-read.mjs'
const TWIN_PROBE = 'scripts/venue-infobox.whyred.tmp.mjs', TWIN_READER = 'scripts/venue-infobox-read.whyred.tmp.mjs'
const entries = [...reg.matchAll(/\{\s*id: '(venue-infobox-[a-z0-9-]+)',\s*file: '([^']+)',\s*claim: (".*"|'.*'),\s*find: (".*"),\s*replace: (".*"),/g)]
let bad = 0
for (const [, id, file, , f, r] of entries) {
  if (file !== PROBE && file !== READER) { console.log(`${id}: names ${file}, which this harness does not mutate`); bad++; continue }
  const find = JSON.parse(f), replace = JSON.parse(r)
  const src = readFileSync(file, 'utf8')
  const n = src.split(find).length - 1
  if (n !== 1) { console.log(`${id}: ANCHOR COUNT ${n} in ${file}`); bad++; continue }
  const mutated = src.replace(find, () => replace)
  const probeSrc = readFileSync(PROBE, 'utf8')
  if (file === READER) {
    const wire = "from './venue-infobox-read.mjs'"
    if (probeSrc.split(wire).length - 1 !== 1) { console.log(`${id}: the probe does not import the reader exactly once`); bad++; continue }
    writeFileSync(TWIN_READER, mutated)
    writeFileSync(TWIN_PROBE, probeSrc.replace(wire, () => "from './venue-infobox-read.whyred.tmp.mjs'"))
  } else writeFileSync(TWIN_PROBE, mutated)
  const out = spawnSync('node', [TWIN_PROBE, '--self-test'], { encoding: 'utf8' })
  rmSync(TWIN_PROBE, { force: true }); rmSync(TWIN_READER, { force: true })
  const text = out.stdout + out.stderr
  const failed = [...text.matchAll(/^FAIL  (.*)$/gm)].map(m => m[1].slice(0, 95))
  const crashed = /TypeError|ReferenceError|SyntaxError/.test(text) && !failed.length
  console.log(`${id.replace('venue-infobox-', '').padEnd(28)} ${file === READER ? 'reader' : 'probe '} exit ${out.status}  ${failed.length ? failed.length + ' FAIL: ' + failed.join(' || ') : crashed ? 'CRASH (no FAIL line): ' + text.split('\n').find(l => /Error/.test(l)) : 'NOT CAUGHT (the self-test stayed green)'}`)
  if (!failed.length) bad++
}
console.log(`\n${entries.length} mutations read from the registry; ${bad} not red by a named check`)
process.exitCode = bad ? 1 : 0
