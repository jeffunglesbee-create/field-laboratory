#!/usr/bin/env node
// Merge the shards of a sharded mutation run into the one answer the gate row needs.
// docs/CC-CMD-2026-11-03-gate-speed.md, Task 3.
//
//   node scripts/mutation-merge.mjs <dir> --of N     merge <dir>/mutation-shard-<i>-of-<N>.json, write the baseline artifact
//   node scripts/mutation-merge.mjs --self-test      prove it refuses what it must refuse
//
// WHAT "THE SUITE PASSED" HAS TO MEAN WHEN IT IS EIGHT RUNS. One run used to be one claim: every mutation in the table was
// applied and every one was caught. Eight shard runs make that claim only if the eight together cover the table exactly:
// a shard that never uploaded, one that ran an older commit, an id run twice, an id run by nobody, each leaves a green
// answer about a smaller or a different suite. So this script does not add up passes. It starts from the table (the ids
// `mutation-check.mjs --list-ids` prints for THIS tree), derives what each shard was supposed to run, and refuses on the
// first difference. The denominator is printed with the verdict (Rule 91): `235 of 235 mutations across 8 shards`.
//
// TWO KINDS OF PROBLEM, kept apart on purpose. A STRUCTURAL problem means the shard set is not the full run of this tree,
// so the baseline artifact is not written (it would describe a different suite). A VERDICT problem (a survivor, a
// baseline expectation already failing) means the set is complete and the answer is no, so the artifact IS written, pass
// or fail, as `mutation-check.mjs` has always done: a green run records the baseline it was green against, and a red one
// records the baseline it was red against.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createChecks, finish, isMain } from './checks.mjs'
import { shardOf } from './mutation-lib.mjs'

// ONE CLOCK READ, CAPTURED (row-confidence.mjs): this script is named in the gate's mutation row.
const MERGED_AT = new Date()

export const BASELINE_PATH = 'outbox/mutation-baseline-latest.json'
export const shardFileName = (i, n) => `mutation-shard-${i}-of-${n}.json`

const NAME_RE = /^mutation-shard-(\d+)-of-(\d+)\.json$/

/** The shard files of a directory: every one of the N expected, plus a complaint for any file of another split or any that does not parse. */
export const readShardSet = (dir, n) => {
  const problems = []
  const files = []
  if (!existsSync(dir)) return { files, problems: [`${dir} does not exist, so there is no shard to read`] }
  const present = readdirSync(dir).filter(f => NAME_RE.test(f))
  for (const f of present) {
    const other = NAME_RE.exec(f)[2]
    if (Number(other) !== n) problems.push(`${f}: is a shard of a ${other}-way split and this merge is of ${n}, so two runs are mixed in ${dir}`)
  }
  for (let i = 1; i <= n; i++) {
    const name = shardFileName(i, n)
    if (!present.includes(name)) { problems.push(`shard ${i}/${n} is missing: ${name} was never uploaded`); continue }
    try { files.push({ i, name, data: JSON.parse(readFileSync(join(dir, name), 'utf8')) }) }
    catch (e) { problems.push(`${name}: is not valid JSON (${e.message})`) }
  }
  return { files, problems }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const BROKEN = new Set(['anchor-missing', 'not-applied'])

/**
 * Pure. `files` are `readShardSet`'s, `allIds` the table of THIS tree, `sha` its HEAD, `n` the split.
 * Returns { structural, verdict, counts, baseline, records } and never throws on a bad shard: a bad shard is a problem, not a crash.
 */
export const mergeShards = ({ files, allIds, sha, n, readProblems = [] }) => {
  const structural = [...readProblems]
  const verdict = []
  const owner = new Map()
  const records = []
  const modes = new Set()

  for (const { i, data } of files) {
    const where = `shard ${i}/${n}`
    if (data.sha !== sha) structural.push(`${where}: ran ${String(data.sha).slice(0, 12)}, this tree is ${sha.slice(0, 12)}`)
    if (data.shard !== `${i}/${n}`) structural.push(`${where}: the file says it is shard ${JSON.stringify(data.shard)}`)
    if (data.tableSize !== allIds.length) structural.push(`${where}: saw a table of ${data.tableSize} mutations, this tree has ${allIds.length}`)
    modes.add(data.mode)

    const want = shardOf(allIds, i, n)
    const got = Array.isArray(data.ids) ? data.ids : []
    if (!same(got, want)) {
      const missing = want.filter(id => !got.includes(id))
      const extra = got.filter(id => !want.includes(id))
      structural.push(`${where}: did not run its partition of the table (missing ${missing.length ? missing.join(', ') : 'none'}; not its own ${extra.length ? extra.join(', ') : 'none'})`)
    }
    const recorded = (data.records ?? []).map(r => r.id)
    if (!same(recorded, got)) structural.push(`${where}: recorded ${recorded.length} result(s) for the ${got.length} id(s) it was given, or in another order`)

    for (const r of data.records ?? []) {
      if (owner.has(r.id)) structural.push(`[${r.id}] was run by shard ${owner.get(r.id)} and again by shard ${i}`)
      else owner.set(r.id, i)
      records.push({ ...r, shard: i })
    }

    const failing = (data.baseline?.results ?? []).filter(b => !b.passed && !b.notApplicable).length
    if (data.baseline?.failing !== failing) structural.push(`${where}: its baseline says ${data.baseline?.failing} failing and lists ${failing}`)
    if (failing > 0) verdict.push(`${where}: ${failing} baseline expectation(s) already failing on the unmutated tree, so nothing it measured means anything`)
  }

  if (modes.size > 1) structural.push(`the shards were run in different build modes (${[...modes].join(', ')})`)
  for (const id of allIds.filter(id => !owner.has(id))) structural.push(`[${id}] is in the table and no shard ran it`)
  for (const id of [...owner.keys()].filter(id => !allIds.includes(id))) structural.push(`[${id}] was run by shard ${owner.get(id)} and is not in the table`)

  const naExpects = new Set(files.flatMap(f => f.data.baseline?.notApplicable ?? []))
  const counts = { caught: 0, compiler: 0, survived: 0, na: 0, broken: 0 }
  for (const r of records) {
    if (r.verdict === 'caught') counts.caught++
    else if (r.verdict === 'compiler') counts.compiler++
    else if (r.verdict === 'survived') { counts.survived++; verdict.push(`[${r.id}] SURVIVED (shard ${r.shard}): \`${r.expect}\` still passed, nothing defends this claim`) }
    else if (r.verdict === 'n/a') {
      counts.na++
      if (!naExpects.has(r.expect)) structural.push(`[${r.id}] is recorded not applicable, but \`${r.expect}\` is not in any shard's not-applicable list`)
    } else if (BROKEN.has(r.verdict)) { counts.broken++; verdict.push(`[${r.id}] is a broken mutation (${r.verdict}, shard ${r.shard}): it tested nothing`) }
    else structural.push(`[${r.id}] has a verdict this merge does not know: ${JSON.stringify(r.verdict)}`)
  }

  // The baseline of the whole table is the union of the shards' own, and it has to be EXACTLY the expectations the table names.
  const results = new Map()
  for (const { i, data } of files) {
    for (const b of data.baseline?.results ?? []) {
      const had = results.get(b.cmd)
      if (!had) results.set(b.cmd, b)
      else if (had.passed !== b.passed) verdict.push(`\`${b.cmd}\` passed in one shard and failed in shard ${i}: the unmutated tree is not one tree`)
    }
  }
  const byId = new Map(records.map(r => [r.id, r]))
  const named = [...new Set(allIds.map(id => byId.get(id)?.expect).filter(Boolean))]
  for (const cmd of named.filter(c => !results.has(c))) structural.push(`\`${cmd}\` is expected by a mutation and no shard ran it unmutated first`)
  for (const cmd of [...results.keys()].filter(c => !named.includes(c))) structural.push(`\`${cmd}\` was run as a baseline and no mutation expects it`)

  const ordered = named.filter(c => results.has(c)).map(c => results.get(c))
  const wall = files.map(f => f.data.wallMs ?? 0)
  const baseline = {
    at: MERGED_AT.toISOString(),
    scope: 'full',
    ran: ordered.length,
    from_mutations: allIds.length,
    failing: ordered.filter(b => !b.passed && !b.notApplicable).length,
    notApplicable: [...naExpects],
    results: ordered,
    shards: { of: n, mode: [...modes][0] ?? null, wallMs: wall, longestMs: Math.max(0, ...wall), sumMs: wall.reduce((a, b) => a + b, 0) },
  }
  return { structural, verdict, counts, baseline, records }
}

const minutes = ms => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`

export const denominator = ({ counts, baseline, records }, allIds, n) =>
  `${records.length} of ${allIds.length} mutations across ${n} shards (${baseline.shards.mode}): ${counts.caught} caught, ${counts.compiler} refused by the compiler, ` +
  `${counts.survived} survived, ${counts.na} not applicable, ${counts.broken} broken; ${baseline.ran} distinct expectations, ${baseline.failing} failing; ` +
  `longest shard ${minutes(baseline.shards.longestMs)}, shards together ${minutes(baseline.shards.sumMs)}`

// --- self-test ---------------------------------------------------------------------

const selfTest = () => {
  const { check, summarize } = createChecks()
  const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
  const IDS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']
  const EXPECT = { m1: 'x', m2: 'y', m3: 'x', m4: 'z', m5: 'y', m6: 'x', m7: 'z' }
  const N = 3

  // A complete, passing set built from the same partition function the merge checks against, so the baseline case is the real shape.
  const build = () => Array.from({ length: N }, (_, k) => {
    const i = k + 1
    const ids = shardOf(IDS, i, N)
    const cmds = [...new Set(ids.map(id => EXPECT[id]))]
    return {
      i, name: shardFileName(i, N),
      data: {
        at: 't', sha: SHA, mode: 'watch', shard: `${i}/${N}`, ids, tableSize: IDS.length, cleanDigest: 'c',
        baseline: { ran: cmds.length, failing: 0, notApplicable: [], results: cmds.map(cmd => ({ cmd, passed: true })) },
        wallMs: 60000 * i,
        records: ids.map(id => ({ id, kind: 'src', verdict: id === 'm4' ? 'compiler' : 'caught', expect: EXPECT[id] })),
      },
    }
  })
  const merge = (files, extra = {}) => mergeShards({ files, allIds: IDS, sha: SHA, n: N, ...extra })
  const clone = x => JSON.parse(JSON.stringify(x))
  const has = (list, re) => list.some(p => re.test(p))

  const good = merge(build())
  check('a complete set of three shards merges with no problem', good.structural.length === 0 && good.verdict.length === 0,
    JSON.stringify([...good.structural, ...good.verdict]))
  check('the denominator is the whole table: 7 of 7 across 3 shards', denominator(good, IDS, N).startsWith('7 of 7 mutations across 3 shards'), denominator(good, IDS, N))
  check('the counts are the verdicts: 6 caught, 1 refused by the compiler', good.counts.caught === 6 && good.counts.compiler === 1, JSON.stringify(good.counts))
  check('the baseline is the union of the shards: 3 distinct expectations from 7 mutations', good.baseline.ran === 3 && good.baseline.from_mutations === 7 && good.baseline.failing === 0,
    JSON.stringify(good.baseline))
  check('the wall time is the longest shard, and the sum is kept', good.baseline.shards.longestMs === 180000 && good.baseline.shards.sumMs === 360000, JSON.stringify(good.baseline.shards))
  check('the artifact keeps today\'s keys', ['at', 'scope', 'ran', 'from_mutations', 'failing', 'notApplicable', 'results'].every(k => k in good.baseline))

  // Each refusal below must name ITS OWN cause. A set that is refused for some other reason would satisfy a bare "is refused".
  const refuses = (label, mutate, kind, re, extra) => {
    const files = build()
    mutate(files)
    const r = merge(files, extra)
    check(`MUTATION: ${label}`, has(r[kind], re), `${kind} problems were ${JSON.stringify(r[kind])}`)
  }
  refuses('a shard that never uploaded is refused by name', fs => fs.splice(1, 1), 'structural', /\[m2\] is in the table and no shard ran it/)
  refuses('an id run by two shards is refused', fs => { fs[1].data.records.push(clone(fs[0].data.records[0])); fs[1].data.ids.push(fs[0].data.ids[0]) }, 'structural', /\[m1\] was run by shard 1 and again by shard 2/)
  refuses('an id from nowhere is refused', fs => { fs[0].data.records[0].id = 'ghost'; fs[0].data.ids[0] = 'ghost' }, 'structural', /\[ghost\] was run by shard 1 and is not in the table/)
  refuses('a shard of another commit is refused', fs => { fs[2].data.sha = 'f'.repeat(40) }, 'structural', /shard 3\/3: ran ffffffffffff, this tree is a1b2c3d4e5f6/)
  refuses('a shard that ran the wrong partition is refused', fs => { fs[0].data.ids.reverse(); fs[0].data.records.reverse() }, 'structural', /shard 1\/3: did not run its partition/)
  refuses('a shard that says it is another shard is refused', fs => { fs[0].data.shard = '2/3' }, 'structural', /shard 1\/3: the file says it is shard "2\/3"/)
  refuses('a table of another size is refused', fs => { fs[0].data.tableSize = 9 }, 'structural', /saw a table of 9 mutations, this tree has 7/)
  refuses('records that do not match the ids given are refused', fs => { fs[0].data.records.pop() }, 'structural', /shard 1\/3: recorded 2 result\(s\) for the 3 id\(s\)/)
  refuses('shards in two build modes are refused', fs => { fs[1].data.mode = 'full' }, 'structural', /different build modes/)
  refuses('a baseline that disagrees with its own list is refused', fs => { fs[0].data.baseline.failing = 1 }, 'structural', /says 1 failing and lists 0/)
  refuses('an expectation no shard ran unmutated is refused', fs => { for (const f of fs) f.data.baseline.results = f.data.baseline.results.filter(b => b.cmd !== 'z') }, 'structural', /`z` is expected by a mutation and no shard ran it unmutated first/)
  refuses('a baseline nobody expects is refused', fs => { fs[0].data.baseline.results.push({ cmd: 'stray', passed: true }) }, 'structural', /`stray` was run as a baseline and no mutation expects it/)
  refuses('a not-applicable record the baseline does not list is refused', fs => { fs[0].data.records[0].verdict = 'n/a' }, 'structural', /\[m1\] is recorded not applicable/)
  refuses('an unknown verdict is refused', fs => { fs[0].data.records[0].verdict = 'maybe' }, 'structural', /\[m1\] has a verdict this merge does not know/)
  refuses('a read problem is carried through', () => {}, 'structural', /could not read/, { readProblems: ['could not read shard 2'] })
  refuses('a survivor is a verdict problem, by name', fs => { fs[0].data.records[1].verdict = 'survived' }, 'verdict', /\[m4\] SURVIVED \(shard 1\)/)
  refuses('a broken mutation is a verdict problem, by name', fs => { fs[1].data.records[0].verdict = 'anchor-missing' }, 'verdict', /\[m2\] is a broken mutation \(anchor-missing, shard 2\)/)
  refuses('a failing baseline is a verdict problem, by shard', fs => { fs[2].data.baseline.results[0].passed = false; fs[2].data.baseline.failing = 1 }, 'verdict', /shard 3\/3: 1 baseline expectation\(s\) already failing/)
  check('a survivor leaves the structure whole, so the artifact can still be written', (() => {
    const files = build(); files[0].data.records[1].verdict = 'survived'
    const r = merge(files); return r.structural.length === 0 && r.verdict.length === 1
  })())
  check('a not-applicable record the baseline lists is accepted', (() => {
    const files = build(); files[0].data.records[0].verdict = 'n/a'
    for (const f of files) f.data.baseline.notApplicable = ['x']
    const r = merge(files); return r.structural.length === 0 && r.counts.na === 1
  })())

  // readShardSet on a real directory.
  const dir = mkdtempSync(join(tmpdir(), 'merge-selftest-'))
  try {
    for (const f of build()) writeFileSync(join(dir, f.name), JSON.stringify(f.data))
    const ok = readShardSet(dir, N)
    check('readShardSet reads all three files of a clean directory', ok.problems.length === 0 && ok.files.length === 3 && same(ok.files.map(f => f.i), [1, 2, 3]), JSON.stringify(ok.problems))
    writeFileSync(join(dir, 'mutation-shard-1-of-8.json'), '{}')
    check('MUTATION: a shard of another split in the same directory is refused', has(readShardSet(dir, N).problems, /is a shard of a 8-way split and this merge is of 3/))
    rmSync(join(dir, 'mutation-shard-1-of-8.json'))
    writeFileSync(join(dir, shardFileName(2, N)), '{not json')
    check('MUTATION: a shard that does not parse is refused by name', has(readShardSet(dir, N).problems, /mutation-shard-2-of-3\.json: is not valid JSON/))
    rmSync(join(dir, shardFileName(3, N)))
    check('MUTATION: a deleted shard file is refused by name', has(readShardSet(dir, N).problems, /shard 3\/3 is missing/))
    check('MUTATION: a directory that is not there is refused', has(readShardSet(join(dir, 'nowhere'), N).problems, /does not exist/))
  } finally { rmSync(dir, { recursive: true, force: true }) }

  return summarize()
}

// --- the command -------------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  finish(selfTest())
} else if (isMain(import.meta.url)) {
  const dir = process.argv[2]
  const ofAt = process.argv.indexOf('--of')
  const n = ofAt > 0 ? Number(process.argv[ofAt + 1]) : NaN
  if (!dir || dir.startsWith('--') || !Number.isInteger(n) || n < 1) {
    console.error('usage: node scripts/mutation-merge.mjs <dir> --of N')
    process.exit(2)
  }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const listed = execFileSync(process.execPath, ['scripts/mutation-check.mjs', '--list-ids'], { encoding: 'utf8' }).trim().split('\n').pop()
  const allIds = JSON.parse(listed)

  const { files, problems: readProblems } = readShardSet(dir, n)
  const merged = mergeShards({ files, allIds, sha, n, readProblems })

  const { check, summarize } = createChecks()
  console.log(`\nMerging ${n} shard(s) from ${dir}\n`)
  check(`the ${n} shards are exactly the full run of this tree (${allIds.length} mutations, ${sha.slice(0, 12)})`, merged.structural.length === 0,
    '\n' + merged.structural.map(p => `            ${p}`).join('\n'))

  if (merged.structural.length === 0) {
    mkdirSync(dirname(BASELINE_PATH), { recursive: true })
    writeFileSync(BASELINE_PATH, JSON.stringify(merged.baseline, null, 2) + '\n')
    console.log(`  wrote ${BASELINE_PATH}`)
  } else {
    console.log(`  ${BASELINE_PATH} NOT written: the shard set is not the full run, so the artifact would describe another suite`)
  }
  check('no mutation survived, none was broken, and no baseline expectation was already failing', merged.verdict.length === 0,
    '\n' + merged.verdict.map(p => `            ${p}`).join('\n'))
  console.log(`\n  ${denominator(merged, allIds, n)}`)
  finish(summarize())
}
