// Rule 90 for the infobox's Roof field as the roof rule's fourth witness: each registered mutation, applied to a COPY of the file it names,
// is run against the rule's own self-test, and the checks that go red are printed by name.
// docs/CC-CMD-2026-11-09-venue-review-remainder.md, Task 2, option 3, Step B. Run from the repository root:
//   node outbox/venue-source-roof-field-mutation-2026-11-09.mjs
//
// Same idea as outbox/venue-infobox-mutation-2026-11-09.mjs, for the entries whose id begins `venue-source-roof-field-` (the two answer-reader
// entries that the probe's self-test catches begin `venue-infobox-answer-` and are run by that script). `node scripts/mutation-check.mjs --ids ...`
// says only that a mutated run exited non-zero, and a crash exits non-zero too; this reads the registry's own entries, asserts that each anchor occurs
// exactly once in the file it names (a mutation that did not apply is reported, never counted), runs the UNMUTATED copy first as the control (a
// copy that cannot pass proves nothing about the ones that fail), and prints the FAIL lines the self-test wrote.
//
// An entry that cuts the reader (scripts/venue-infobox-read.mjs) is applied to a twin of the reader, and the twin of the rule is rewired to
// import that twin, so the self-test that runs is the rule's own, reading the mutated reader.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const reg = readFileSync('scripts/mutation-check.mjs', 'utf8')
const RULE = 'scripts/venue-source.mjs', READER = 'scripts/venue-infobox-read.mjs'
const TWIN_RULE = 'scripts/venue-source.whyred.tmp.mjs', TWIN_READER = 'scripts/venue-infobox-read.whyred.tmp.mjs'
const WIRE = "from './venue-infobox-read.mjs'"
const PREFIX = 'venue-source-roof-field-'
const entries = [...reg.matchAll(/\{\s*id: '(venue-source-roof-field-[a-z0-9-]+)',\s*file: '([^']+)',\s*claim: (".*"|'.*'),\s*find: (".*"),\s*replace: (".*"),/g)]
const declared = (reg.match(new RegExp(`id: '${PREFIX}`, 'g')) ?? []).length
let bad = 0

const ruleSrc = readFileSync(RULE, 'utf8')
if (ruleSrc.split(WIRE).length - 1 !== 1) { console.log(`the rule does not import the reader exactly once (${ruleSrc.split(WIRE).length - 1})`); process.exit(1) }

/** Write the twins (the rule, and the reader when `readerText` is given), run the rule's self-test on them, remove them, and say what happened. */
const runTwin = (ruleText, readerText = null) => {
  writeFileSync(TWIN_RULE, readerText === null ? ruleText : ruleText.replace(WIRE, () => "from './venue-infobox-read.whyred.tmp.mjs'"))
  if (readerText !== null) writeFileSync(TWIN_READER, readerText)
  const out = spawnSync('node', [TWIN_RULE, '--self-test'], { encoding: 'utf8' })
  rmSync(TWIN_RULE, { force: true }); rmSync(TWIN_READER, { force: true })
  const text = out.stdout + out.stderr
  return { status: out.status, text, failed: [...text.matchAll(/^FAIL  (.*)$/gm)].map(m => m[1].slice(0, 95)), passed: (text.match(/^PASS  /gm) ?? []).length }
}

const control = runTwin(ruleSrc)
const controlOk = control.status === 0 && control.failed.length === 0 && control.passed > 0
console.log(`control: the unmutated twin of the rule, exit ${control.status}, ${control.passed} PASS, ${control.failed.length} FAIL`)
if (!controlOk) { console.log('the control did not pass, so no mutation below means anything'); process.exit(1) }

for (const [, id, file, , f, r] of entries) {
  if (file !== RULE && file !== READER) { console.log(`${id}: names ${file}, which this harness does not mutate`); bad++; continue }
  const find = JSON.parse(f), replace = JSON.parse(r)
  const src = readFileSync(file, 'utf8')
  const n = src.split(find).length - 1
  if (n !== 1) { console.log(`${id}: ANCHOR COUNT ${n} in ${file}`); bad++; continue }
  const mutated = src.replace(find, () => replace)
  if (mutated === src) { console.log(`${id}: the replacement is the text it replaces, so nothing was mutated`); bad++; continue }
  const res = file === RULE ? runTwin(mutated) : runTwin(ruleSrc, mutated)
  const crashed = /TypeError|ReferenceError|SyntaxError/.test(res.text) && !res.failed.length
  console.log(`${id.slice(PREFIX.length).padEnd(30)} ${file === READER ? 'reader' : 'rule  '} exit ${res.status}  ${res.failed.length ? res.failed.length + ' FAIL: ' + res.failed.join(' || ') : crashed ? 'CRASH (no FAIL line): ' + res.text.split('\n').find(l => /Error/.test(l)) : 'NOT CAUGHT (the self-test stayed green)'}`)
  if (!res.failed.length) bad++
}
if (entries.length !== declared) { console.log(`\nthe registry declares ${declared} entries with this prefix and ${entries.length} were read`); bad++ }
console.log(`\n${entries.length} of ${declared} mutations read from the registry; ${bad} not red by a named check`)
process.exitCode = bad ? 1 : 0
