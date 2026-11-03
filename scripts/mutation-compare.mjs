#!/usr/bin/env node
// Compare a whole mutation table run under the incremental compiler against the same table run under the reference compiler.
// docs/CC-CMD-2026-11-03-gate-speed.md, Task 5.
//
//   node scripts/mutation-compare.mjs <watchDir> <fullDir> --of N [--out outbox/mutation-equivalence-latest.json]
//   node scripts/mutation-compare.mjs --self-test
//
// THE CLAIM IT TESTS. `--build watch` is only worth running if it is the same compile as `--build full`, the definition of
// correct. "The same" is two things, and both are compared per mutation, not averaged:
//   - the VERDICT (caught, refused by the compiler, survived), which is what the gate reads;
//   - the compiled DIGEST of every mutation that rebuilds, which is what the expectation ran against. Equal verdicts on
//     different builds would be a coincidence of the table; equal digests are why the verdicts have to agree.
// It also refuses a comparison that cannot fail: both directories must be complete runs of the same commit, the left one
// in `watch` mode and the right one in `full`. Comparing a mode with itself is equal by construction.
//
// IT ALSO ANSWERS THE QUESTION THE OLD ORDER LEFT OPEN. Until 2026-11-03 only a mutation of `src/` or `index.html` rebuilt,
// and nothing rebuilt after it, so the 94 mutations of scripts, workflows and the world ran on whatever compiled mutation
// had come before them. Both modes here start every mutation from a clean build, so a script mutation that was only
// "caught" by a leftover compiled one is a SURVIVOR in this run. Every non-rebuild mutation is listed with its verdict, and
// the count that survive on a clean build is the number the CC-CMD asked for.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createChecks, finish, isMain } from './checks.mjs'
import { mergeShards, readShardSet, shardFileName } from './mutation-merge.mjs'
import { shardOf } from './mutation-lib.mjs'

// ONE CLOCK READ, CAPTURED (row-confidence.mjs reads every script a gate row names; this one is not, but the shape is the repo's).
const COMPARED_AT = new Date()

const REBUILDS = new Set(['src', 'html'])

/** Pure. `watch` and `full` are { files, readProblems }; returns the report and every problem found. */
export const compareRuns = ({ watch, full, allIds, sha, n }) => {
  const problems = []
  const side = (label, set, mode) => {
    const merged = mergeShards({ files: set.files, allIds, sha, n, readProblems: set.readProblems ?? [] })
    for (const p of merged.structural) problems.push(`${label}: ${p}`)
    // The verdict findings too: a run whose baseline was already red, or that held a broken mutation, makes every "caught" below it meaningless, and a comparison
    // that reads only the structure would report equal verdicts and a legacy count of caught mutations over a red baseline.
    for (const p of merged.verdict) problems.push(`${label}: ${p}`)
    const modes = new Set(set.files.map(f => f.data.mode))
    if (set.files.length && !(modes.size === 1 && modes.has(mode))) problems.push(`${label}: was run in mode ${[...modes].join('/')}, and this side has to be ${mode}`)
    return { merged, byId: new Map(merged.records.map(r => [r.id, r])), cleanDigests: new Set(set.files.map(f => f.data.cleanDigest).filter(Boolean)), files: set.files }
  }
  const w = side('watch', watch, 'watch')
  const f = side('full', full, 'full')

  const verdictDiffs = []
  const digestDiffs = []
  const perId = []
  for (const id of allIds) {
    const a = w.byId.get(id), b = f.byId.get(id)
    if (!a || !b) continue
    perId.push({ id, kind: a.kind, shard: a.shard, watch: a.verdict, full: b.verdict, watchDigest: a.digest ?? null, fullDigest: b.digest ?? null, watchMs: (a.buildMs ?? 0) + (a.restoreMs ?? 0), fullMs: (b.buildMs ?? 0) + (b.restoreMs ?? 0) })
    if (a.kind !== b.kind) problems.push(`[${id}] is a ${a.kind} mutation under watch and a ${b.kind} one under full`)
    if (a.verdict !== b.verdict) verdictDiffs.push({ id, kind: a.kind, watch: a.verdict, full: b.verdict })
    if (REBUILDS.has(a.kind) && a.verdict !== 'n/a' && (a.digest ?? null) !== (b.digest ?? null)) digestDiffs.push({ id, kind: a.kind, watch: a.digest ?? null, full: b.digest ?? null })
    if (REBUILDS.has(a.kind) && a.verdict !== 'n/a' && (!a.digest || !b.digest)) problems.push(`[${id}] has no compiled digest on one side (watch ${a.digest ?? 'none'}, full ${b.digest ?? 'none'}): there is nothing to compare`)
  }

  const clean = { watch: [...w.cleanDigests], full: [...f.cleanDigests] }
  const cleanEqual = clean.watch.length === 1 && clean.full.length === 1 && clean.watch[0] === clean.full[0]
  if (!cleanEqual) problems.push(`the clean build is not one digest on both sides (watch ${clean.watch.join('/') || 'none'}, full ${clean.full.join('/') || 'none'})`)

  const rebuilding = perId.filter(r => REBUILDS.has(r.kind) && r.watch !== 'n/a')
  const nonRebuild = perId.filter(r => !REBUILDS.has(r.kind))
  const legacy = {
    nonRebuild: nonRebuild.length,
    caughtOnCleanBuild: nonRebuild.filter(r => r.watch === 'caught' && r.full === 'caught').length,
    survivedOnCleanBuild: nonRebuild.filter(r => r.watch === 'survived' || r.full === 'survived').map(r => r.id),
    notApplicable: nonRebuild.filter(r => r.watch === 'n/a').length,
  }
  const wall = mode => {
    const ms = (mode === 'watch' ? w : f).files.map(x => x.data.wallMs ?? 0)
    return { longestMs: Math.max(0, ...ms), sumMs: ms.reduce((p, q) => p + q, 0) }
  }
  return {
    problems, verdictDiffs, digestDiffs,
    report: {
      at: COMPARED_AT.toISOString(), sha, of: n,
      compared: perId.length, table: allIds.length, rebuildingCompared: rebuilding.length,
      verdictDiffs, digestDiffs, cleanDigest: { ...clean, equal: cleanEqual },
      legacy, wall: { watch: wall('watch'), full: wall('full') }, crashRetries: { watch: w.merged.counts.crashRetries, full: f.merged.counts.crashRetries }, perId,
    },
  }
}

const mins = ms => `${(ms / 60000).toFixed(1)} min`

export const denominator = ({ report }) =>
  `${report.compared} of ${report.table} mutations compared, ${report.verdictDiffs.length} verdict(s) differing; ` +
  `${report.rebuildingCompared} that rebuild compared by compiled digest, ${report.digestDiffs.length} differing; ` +
  `of ${report.legacy.nonRebuild} that do not rebuild, ${report.legacy.caughtOnCleanBuild} caught on a clean build and ${report.legacy.survivedOnCleanBuild.length} survive; ` +
  `compiler crashes repeated: watch ${report.crashRetries.watch}, full ${report.crashRetries.full}; ` +
  `watch ${mins(report.wall.watch.sumMs)} of shard time against full ${mins(report.wall.full.sumMs)}`

// --- self-test ---------------------------------------------------------------------

const selfTest = () => {
  const { check, summarize } = createChecks()
  const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
  const IDS = ['s1', 's2', 's3', 'h1', 'x1', 'x2', 'w1']
  const KIND = { s1: 'src', s2: 'src', s3: 'src', h1: 'html', x1: 'script', x2: 'script', w1: 'world' }
  const N = 2
  const make = mode => {
    const files = [1, 2].map(i => {
      const ids = shardOf(IDS, i, N)
      return {
        i, name: shardFileName(i, N),
        data: {
          sha: SHA, mode, shard: `${i}/${N}`, ids, tableSize: IDS.length, cleanDigest: 'clean0', wallMs: 1000 * i,
          baseline: { ran: 1, failing: 0, notApplicable: [], results: [{ cmd: 'e', passed: true }] },
          records: ids.map(id => ({ id, kind: KIND[id], verdict: id === 's3' ? 'compiler' : 'caught', expect: 'e', digest: REBUILDS.has(KIND[id]) ? `d-${id}` : null, buildMs: 10, restoreMs: 5 })),
        },
      }
    })
    return { files, readProblems: [] }
  }
  const cmp = (watch = make('watch'), full = make('full'), extra = {}) => compareRuns({ watch, full, allIds: IDS, sha: SHA, n: N, ...extra })
  const clone = x => JSON.parse(JSON.stringify(x))
  const has = (list, re) => list.some(p => re.test(typeof p === 'string' ? p : JSON.stringify(p)))

  const good = cmp()
  check('two matching runs compare with no problem', good.problems.length === 0 && good.verdictDiffs.length === 0 && good.digestDiffs.length === 0, JSON.stringify([good.problems, good.verdictDiffs, good.digestDiffs]))
  check('the denominator is the whole table', denominator(good).startsWith('7 of 7 mutations compared, 0 verdict(s) differing; 4 that rebuild compared by compiled digest, 0 differing; of 3 that do not rebuild, 3 caught on a clean build and 0 survive'), denominator(good))

  const refuses = (label, edit, where, re) => {
    const watch = make('watch'), full = make('full')
    edit({ watch, full })
    const r = cmp(watch, full)
    check(`MUTATION: ${label}`, has(r[where], re), `${where} was ${JSON.stringify(r[where])}`)
  }
  refuses('a verdict that differs is listed by id', ({ full }) => { full.files[0].data.records[0].verdict = 'survived' }, 'verdictDiffs', /"id":"s1".*"watch":"caught".*"full":"survived"/)
  refuses('a compiled digest that differs is listed by id', ({ watch }) => { watch.files[1].data.records[0].digest = 'other' }, 'digestDiffs', /"id":"s2"/)
  refuses('an html mutation is compared by digest too', ({ full }) => { full.files[1].data.records.find(r => r.id === 'h1').digest = 'other' }, 'digestDiffs', /"id":"h1"/)
  refuses('a rebuilding mutation with no digest on either side is refused', ({ watch, full }) => { for (const s of [watch, full]) s.files[0].data.records[0].digest = null }, 'problems', /\[s1\] has no compiled digest on one side/)
  refuses('two watch runs compared with each other are refused', ({ full }) => { for (const f of full.files) f.data.mode = 'watch' }, 'problems', /full: was run in mode watch, and this side has to be full/)
  refuses('a run of another commit is refused', ({ full }) => { full.files[0].data.sha = 'f'.repeat(40) }, 'problems', /full: shard 1\/2: ran ffffffffffff/)
  refuses('a missing shard on one side is refused', ({ watch }) => { watch.files.pop() }, 'problems', /watch: .*no shard ran it/)
  refuses('a clean build that differs between the sides is refused', ({ full }) => { for (const f of full.files) f.data.cleanDigest = 'clean1' }, 'problems', /the clean build is not one digest on both sides/)
  refuses('MUTATION: a baseline expectation already failing on both sides is a problem, not a clean comparison', ({ watch, full }) => { for (const side of [watch, full]) { side.files[0].data.baseline.results[0].passed = false; side.files[0].data.baseline.failing = 1 } }, 'problems', /watch: shard 1\/2: 1 baseline expectation\(s\) already failing/)
  refuses('MUTATION: a mutation that did not apply on both sides is a problem, not a caught one', ({ watch, full }) => { for (const side of [watch, full]) side.files[0].data.records.find(r => r.id === 'w1').verdict = 'not-applied' }, 'problems', /watch: \[w1\] is a broken mutation \(not-applied/)
  refuses('a mutation that changes kind between the sides is refused', ({ full }) => { full.files[0].data.records[0].kind = 'script' }, 'problems', /\[s1\] is a src mutation under watch and a script one under full/)

  const legacy = (() => { const watch = make('watch'), full = make('full'); watch.files[1].data.records.find(r => r.id === 'x2').verdict = 'survived'; return cmp(watch, full).report.legacy })()
  check('MUTATION: a script mutation that survives on a clean build is counted and named', legacy.survivedOnCleanBuild.join() === 'x2' && legacy.caughtOnCleanBuild === 2, JSON.stringify(legacy))
  check('MUTATION: repeated compiler crashes are counted per side', (() => {
    const watch = make('watch'), full = make('full'); full.files[0].data.records[0].crashRetries = 2
    const r = cmp(watch, full); return r.report.crashRetries.full === 2 && r.report.crashRetries.watch === 0 && /watch 0, full 2/.test(denominator(r))
  })())
  check('the wall time of each side is its longest and its sum', good.report.wall.watch.longestMs === 2000 && good.report.wall.full.sumMs === 3000, JSON.stringify(good.report.wall))

  return summarize()
}

// --- the command -------------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  finish(selfTest())
} else if (isMain(import.meta.url)) {
  const arg = name => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : undefined }
  const [watchDir, fullDir] = [process.argv[2], process.argv[3]]
  const n = Number(arg('--of'))
  const out = arg('--out')
  if (!watchDir || !fullDir || watchDir.startsWith('--') || fullDir.startsWith('--') || !Number.isInteger(n) || n < 1) {
    console.error('usage: node scripts/mutation-compare.mjs <watchDir> <fullDir> --of N [--out FILE]')
    process.exit(2)
  }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const allIds = JSON.parse(execFileSync(process.execPath, ['scripts/mutation-check.mjs', '--list-ids'], { encoding: 'utf8' }).trim().split('\n').pop())
  const a = readShardSet(watchDir, n), b = readShardSet(fullDir, n)
  const r = compareRuns({ watch: { files: a.files, readProblems: a.problems }, full: { files: b.files, readProblems: b.problems }, allIds, sha, n })

  const { check, summarize } = createChecks()
  console.log(`\nComparing ${n} watch shard(s) in ${watchDir} with ${n} full shard(s) in ${fullDir}\n`)
  check('both sides are complete runs of this tree, one in each mode', r.problems.length === 0, '\n' + r.problems.map(p => `            ${p}`).join('\n'))
  check(`every verdict is the same under both drivers (${r.report.compared} of ${r.report.table})`, r.problems.length === 0 && r.verdictDiffs.length === 0,
    '\n' + r.verdictDiffs.map(d => `            [${d.id}] ${d.kind}: watch ${d.watch}, full ${d.full}`).join('\n'))
  check(`every compiled digest is the same under both drivers (${r.report.rebuildingCompared} that rebuild)`, r.problems.length === 0 && r.digestDiffs.length === 0,
    '\n' + r.digestDiffs.map(d => `            [${d.id}] ${d.kind}: watch ${d.watch}, full ${d.full}`).join('\n'))
  check(`no mutation that does not rebuild survives on a clean build (${r.report.legacy.nonRebuild} of them)`, r.report.legacy.survivedOnCleanBuild.length === 0,
    r.report.legacy.survivedOnCleanBuild.join(', '))
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(r.report, null, 1) + '\n')
    console.log(`  wrote ${out}`)
  }
  console.log(`\n  ${denominator(r)}`)
  finish(summarize())
}
