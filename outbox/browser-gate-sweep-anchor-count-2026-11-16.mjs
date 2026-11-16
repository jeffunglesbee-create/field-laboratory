// usage: node outbox/browser-gate-sweep-anchor-count-2026-11-16.mjs GUARD.py   (run from the repo root). Evaluates ONLY the CODE array literal of the sweep (a list of [name, find, replace] strings) in an empty vm context.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const sweep = readFileSync('outbox/browser-gate-sweep-2026-11-12.mjs', 'utf8').split('\n')
const s = sweep.findIndex(l => l.startsWith('const CODE = ['))
const e = sweep.findIndex((l, i) => i > s && l === ']')
const CODE = vm.runInNewContext(sweep.slice(s, e + 1).join('\n').replace('const CODE =', '(') + ')', {})
const src = readFileSync(process.argv[2], 'utf8')
const count = (hay, needle) => needle === '' ? -1 : hay.split(needle).length - 1
const broken = CODE.filter(([n, f]) => count(src, f) !== 1)
console.log(`CODE entries: ${CODE.length}; find text not exactly once in ${process.argv[2]}: ${broken.length}`)
for (const [n, f] of broken) console.log(`  ${count(src, f)}x  ${n}`)
