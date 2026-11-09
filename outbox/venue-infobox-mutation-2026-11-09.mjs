// Rule 90 for scripts/venue-infobox.mjs: each registered mutation, applied to a COPY of the script, is run against the
// script's own self-test and the checks that go red are printed by name. docs/CC-CMD-2026-11-09-venue-review-remainder.md,
// Task 2, option 3. Run from the repository root:  node outbox/venue-infobox-mutation-2026-11-09.mjs
//
// Why this exists beside `node scripts/mutation-check.mjs --ids ...`: that run says a mutation failed the expectation
// (`--self-test` exited non-zero). A crash exits non-zero too, so two of the 15 first "passed" there by crashing with a
// TypeError instead of failing a named check. This reads the registry's own entries, asserts each anchor occurs exactly
// once (a mutation that did not apply is reported, never counted), and prints the FAIL lines the self-test wrote.
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const reg = readFileSync('scripts/mutation-check.mjs', 'utf8')
const src = readFileSync('scripts/venue-infobox.mjs', 'utf8')
const TMP = 'scripts/venue-infobox.whyred.tmp.mjs'
const entries = [...reg.matchAll(/\{\s*id: '(venue-infobox-[a-z0-9-]+)',\s*file: '[^']+',\s*claim: (".*"|'.*'),\s*find: (".*"),\s*replace: (".*"),/g)]
let bad = 0
for (const [, id, , f, r] of entries) {
  const find = JSON.parse(f), replace = JSON.parse(r)
  const n = src.split(find).length - 1
  if (n !== 1) { console.log(`${id}: ANCHOR COUNT ${n}`); bad++; continue }
  writeFileSync(TMP, src.replace(find, () => replace))
  const out = spawnSync('node', [TMP, '--self-test'], { encoding: 'utf8' })
  rmSync(TMP, { force: true })
  const text = out.stdout + out.stderr
  const failed = [...text.matchAll(/^FAIL  (.*)$/gm)].map(m => m[1].slice(0, 95))
  const crashed = /TypeError|ReferenceError|SyntaxError/.test(text) && !failed.length
  console.log(`${id.replace('venue-infobox-', '').padEnd(28)} exit ${out.status}  ${failed.length ? failed.length + ' FAIL: ' + failed.join(' || ') : crashed ? 'CRASH (no FAIL line): ' + text.split('\n').find(l => /Error/.test(l))?.slice(0, 100) : 'NO FAILURE'}`)
  if (!failed.length) bad++
}
console.log(`\n${entries.length} mutations read from the registry; ${bad} not red by a named check`)
