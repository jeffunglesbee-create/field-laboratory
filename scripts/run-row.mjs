// Run ONE gate row by name, and exit with its verdict.
//
// This exists so a mutation's expectation can be the row itself rather than a
// command that resembles it. Before, mutations named a script — which meant a
// row's "teeth" were inferred from a shared script path, and a row whose logic
// lives in gate-checks.mjs (the outbox and history rows) could not be covered at
// all.
//
// Usage:  node scripts/run-row.mjs "this session wrote its outbox"
import { rows } from './gate-checks.mjs'

const wanted = process.argv[2]
const row = rows.find(r => r.name === wanted)
if (!row) {
  console.error(`no such gate row: ${wanted}`)
  console.error(`known rows:\n  ${rows.map(r => r.name).join('\n  ')}`)
  process.exit(2)
}
let passed = false
try { passed = row.run() } catch (e) { console.error(String(e.message ?? e)) }
console.log(`${passed ? 'PASS' : 'FAIL'}  ${row.name}`)
process.exit(passed ? 0 : 1)
