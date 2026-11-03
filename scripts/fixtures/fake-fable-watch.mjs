// A stand-in for `dotnet fable watch`, for the self-test of scripts/mutation-lib.mjs. It speaks the protocol measured on Fable 5.13.0 on 2026-11-03
// (Started -> finished -> [error lines] -> Watching), writes an output file that depends on its one watched source file, and can misbehave on request:
//   FAKE_LATE_ERROR=1  the error line follows "finished" by a few ms (as the real one does)
//   FAKE_DOUBLE=1      a change causes two cycles
//   FAKE_NO_CYCLE=1    changes are ignored: the stale-build case
//   FAKE_DIE_MID=1     on the first change after the initial compile: print Started, then exit 3 before "Watching" (a watcher that dies mid-cycle)
//   FAKE_FAIL_THEN_GOOD=1  a TYPE_ERROR cycle is followed, 150 ms after it closes, by a cycle that compiles (a half-written file, then the whole one)
// A source containing TYPE_ERROR "does not compile": the output is left half-written, as Fable's was in the measurement.
//
// Usage: node fake-fable-watch.mjs <watched file> <out dir>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [src, out] = process.argv.slice(2)
const E = String.fromCharCode(27)
const say = s => process.stdout.write(`${E}[39m${E}[22m${E}[37m${s}\n`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(out, { recursive: true })

const cycle = async ({ healed = false } = {}) => {
  const text = readFileSync(src, 'utf8')
  say('Started Fable compilation...')
  await sleep(150)
  const bad = !healed && text.includes('TYPE_ERROR')
  writeFileSync(join(out, 'Out.js'), bad ? `partial:${text}` : `compiled:${text}`)
  say('Fable compilation finished in 150ms')
  if (bad) {
    if (process.env.FAKE_LATE_ERROR) await sleep(60)
    say("./src/X.fs(1,1): (1,2) error FSHARP: The type 'int' does not match the type 'bool' (code 1)")
  }
  say('Watching src')
  if (bad && process.env.FAKE_FAIL_THEN_GOOD) { await sleep(150); await cycle({ healed: true }) }
}

say('Parsing src/Laboratory.fsproj...')
await cycle()
let last = readFileSync(src, 'utf8')
for (;;) {
  await sleep(50)
  const now = readFileSync(src, 'utf8')
  if (now === last) continue
  last = now
  if (process.env.FAKE_NO_CYCLE) continue
  if (process.env.FAKE_DIE_MID) { say('Started Fable compilation...'); await sleep(50); say('./src/X.fs: the watcher is about to die'); process.exit(3) }
  await sleep(100)
  last = readFileSync(src, 'utf8')
  await cycle()
  if (process.env.FAKE_DOUBLE) { await sleep(200); await cycle() }
}
