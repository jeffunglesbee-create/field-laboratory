// Does the relay route serve the bytes Gravity Well was built on?
//
// data/bdb-event-frames-2022-w2.json was COPIED from jubilant-bassoon's builder
// artifact, not captured from the route: this sandbox cannot reach
// *.workers.dev. data/PROVENANCE.md says what that left open: the relay's own
// verify "counted the served bytes; it did not hash them, so 'the served body
// equals this file' rests on the byte count plus the R2 read-back hash."
//
// A byte count is a copy of the claim, not the claim. This fetches the deployed
// route on a runner and hashes what it serves against the committed file. It is
// also the point at which Gravity Well first reads the route, which is what
// field-relay-nba's STAGED marker on `bdb_event_frames.json` waits for.
//
// X-SOURCE IS RECORDED, NOT REQUIRED. The route reads R2 first and falls back
// to raw GitHub (jubilant-bassoon outbox/nfl/). Either is the builder's
// artifact; what this asserts is the bytes. The header is in the artifact so a
// fallback serve is visible rather than silently equal.
//
// COVERAGE (SAMPLE-COVERAGE-A, field-relay-nba/CLAUDE.md): one route, one file,
// every byte. It says nothing about the other allow-listed nflverse files.
//
// Usage:  node scripts/frames-route-check.mjs --self-test
//         node scripts/frames-route-check.mjs                 (fetches the route)
//         node scripts/frames-route-check.mjs --served <path> (compares a local file)

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createChecks, finish, isMain, runIdentity } from './checks.mjs'

const RELAY = process.env.RELAY_URL || 'https://field-relay-nba.jeffunglesbee.workers.dev'
const ROUTE = '/nflverse/bdb_event_frames.json'
const COMMITTED = 'data/bdb-event-frames-2022-w2.json'
const OUT = 'outbox/frames-route-latest.json'

const sha256 = buf => createHash('sha256').update(buf).digest('hex')

/**
 * The comparison, pure. `served` and `committed` are Buffers; `status` is the
 * HTTP status, or null when the bytes came from a local file.
 */
export function compareFrames({ served, committed, status }) {
  const servedSha = sha256(served)
  const committedSha = sha256(committed)
  return {
    status,
    servedBytes: served.length,
    committedBytes: committed.length,
    servedSha,
    committedSha,
    checks: [
      { name: 'the route answered 200', pass: status === null || status === 200, detail: `status ${status}` },
      { name: 'the served byte count is the committed one', pass: served.length === committed.length,
        detail: `served ${served.length}, committed ${committed.length}` },
      { name: 'the served sha256 is the committed file\'s', pass: servedSha === committedSha,
        detail: `served ${servedSha}, committed ${committedSha}` },
    ],
  }
}

function report(result, extra) {
  const { check, summarize } = createChecks()
  for (const c of result.checks) check(c.name, c.pass, c.detail)
  const failures = summarize()
  console.log(`coverage: 1 of 1 route (${ROUTE}), ${result.servedBytes} bytes hashed`)
  writeFileSync(OUT, JSON.stringify({
    check: 'frames-route',
    generated: new Date().toISOString(),
    run: runIdentity(),
    ...extra,
    committed: COMMITTED,
    status: result.status,
    servedBytes: result.servedBytes,
    committedBytes: result.committedBytes,
    servedSha256: result.servedSha,
    committedSha256: result.committedSha,
    match: failures === 0,
    coverage: `1 of 1 route (${ROUTE}); no other nflverse file`,
    checks: result.checks.map(c => (c.pass ? { name: c.name, pass: true } : c)),
  }, null, 2) + '\n')
  console.log(`wrote ${OUT}`)
  return failures
}

function selfTest() {
  const { check, summarize } = createChecks()
  const pass = r => r.checks.every(c => c.pass)
  const failing = r => r.checks.filter(c => !c.pass).map(c => c.name)
  const file = Buffer.from('{"season":2022,"week":2,"rows":[1,2,3]}\n')

  check('identical bytes with a 200 pass', pass(compareFrames({ served: Buffer.from(file), committed: file, status: 200 })), 'identical refused')
  check('a local comparison (no status) passes on identical bytes', pass(compareFrames({ served: Buffer.from(file), committed: file, status: null })), 'local refused')

  // ONE BYTE, SAME LENGTH: the case a byte count cannot see and the reason this
  // script exists. Only the hash check may fail.
  const flipped = Buffer.from(file); flipped[10] = flipped[10] ^ 1
  const f = compareFrames({ served: flipped, committed: file, status: 200 })
  check('one flipped byte at the same length fails on the hash alone',
    !pass(f) && failing(f).length === 1 && failing(f)[0].includes('sha256'), JSON.stringify(failing(f)))

  const cut = compareFrames({ served: file.subarray(0, file.length - 1), committed: file, status: 200 })
  check('a truncated body fails on both count and hash', failing(cut).length === 2, JSON.stringify(failing(cut)))

  const err = compareFrames({ served: Buffer.from(file), committed: file, status: 404 })
  check('a non-200 fails even when the bytes happen to match', !pass(err) && failing(err)[0].includes('200'), JSON.stringify(failing(err)))

  // Re-encoding is the realistic way the route could differ: the handler
  // returns `await r2obj.text()`, which round-trips through a JS string.
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), file])
  check('a body with a BOM prepended is not the committed file', !pass(compareFrames({ served: bom, committed: file, status: 200 })), 'BOM accepted')

  finish(summarize())
}

async function live() {
  const committed = readFileSync(COMMITTED)
  const servedArg = process.argv.indexOf('--served')
  if (servedArg > -1) {
    const path = process.argv[servedArg + 1]
    const result = compareFrames({ served: readFileSync(path), committed, status: null })
    finish(report(result, { source: { kind: 'local', path } }))
    return
  }
  const url = RELAY + ROUTE
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) })
  const served = Buffer.from(await r.arrayBuffer())
  const result = compareFrames({ served, committed, status: r.status })
  finish(report(result, { source: { kind: 'route', url, xSource: r.headers.get('x-source') } }))
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--self-test')) selfTest()
  else await live()
}
