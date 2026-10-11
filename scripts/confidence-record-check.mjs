// A confidence score in an outbox entry must be a measurement, not a claim.
//
// WHY THIS EXISTS
//
// `scripts/confidence.mjs` says, about its rows: "a self-reported number is not
// evidence of anything: a model asked to score its own work will produce a
// number, and the number is free. So this rubric is not a form to fill in —
// every row runs a real command and takes its score from the exit code."
//
// The rows obey that. The SCORE did not. It left the gate as console output and
// was re-typed into markdown by hand, at which point it was free again — the
// exact property the gate was built to remove, reintroduced one layer up.
//
// On 2026-08-17 four entries were written carrying scores of 85, 95, 95 and 100.
// No gate run produced any of them. Two were 95 with the missing five points
// described as "the runner has not confirmed yet" — an unfinished task priced
// at precisely the distance to the bar. That is scoring to the bar, and nothing
// in the repository could tell the difference.
//
// THE FOUR WAYS A PROSE SCORE ROTS, from FIELD's own record, and what stops each
//
//   1. A NUMBER NOBODY COMPUTED. Stopped by requiring the entry to cite a run in
//      docs/confidence-log.jsonl, and by matching the stated number to it.
//
//   2. THE `tail -1` BYPASS. cc-session-2026-08-10-grouping-datenav-and-amnesty-gate.md
//      records an entry carrying two `## Confidence Score` headings — 75/100,
//      then 100/100 — where the detector took the last match, and the record
//      concluded the file "now self-resolves the gate on its own merits."
//      Appending a higher number cleared the gate. Stopped by requiring EVERY
//      score stated in an entry to be identical: a second heading is a conflict,
//      not an override.
//
//   3. A PASSING AVERAGE OVER A FAILING ROW. The gate is a conjunction, so a run
//      with any failing row cannot back a passing claim however high the total.
//      Stopped by refusing a score >= the bar when the cited run lists failures.
//
//   4. THE MOVING DENOMINATOR. Deleting a failing row raises `earned/possible` —
//      measured at 86 with the row present, 100 with it removed. Stopped by
//      requiring the cited run's `possible` to equal the declared weight in
//      docs/gate-rows.txt.
//
// WHAT THE NUMBER MEANS, WHICH IS NOT WHAT I HAD BEEN WRITING
//
// The scale matters and it is easy to slide between two of them. The rows carry
// WEIGHTS summing to 530; the reported total is a PERCENTAGE of that. So the
// 95 bar is 95% of 530 = 503.5 points, not "95 points". Under a conjunction the
// bar is vestigial — any failing row exits before the score is read, and a run
// where every row passes scores exactly 100 — which is why an entry citing a
// passing run states 100 and never 95.
//
// More importantly, this number measures THE SUITE, not a feeling about one
// change: "all 23 invariants held at the cited commit". The entries written on
// 2026-08-17 carried per-change rubrics invented for the occasion — 25/25 for
// one thing, 10/15 for another, summing to 95 — which measured nothing and were
// answerable to nothing. Laboratory had already decided this question when it
// built `gate-checks.mjs` repo-wide; those per-change rubrics were the anomaly.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It does not require an entry to carry a score. Most outbox entries are reports
// rather than commits of source, and forcing a number onto them would
// manufacture exactly the free numbers this file exists to refuse.
//
// It therefore needs no boundary commit, no exemption list and no amnesty: the
// rule is "if you state a score, it must be real", which every existing entry
// can satisfy today by citing a run or by not stating one. A rule that needs an
// exemption the day it ships is a rule that will be moved later — that happened
// to docs/history-boundary.txt this morning and once was enough.
//
// It is also not tamper-proof, and nothing self-hosted is. What it does is make
// the number cross a directory boundary: to state 100 you must have a line in
// docs/ produced by a process that ran 23 real commands. That is the same
// guarantee docs/history-boundary.txt claims, and it is stated no wider.
//
// Usage:  node scripts/confidence-record-check.mjs [--self-test]

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createChecks, isMain, finish } from './checks.mjs'

const SELF_TEST = isMain(import.meta.url) && process.argv.includes('--self-test')
const { check, summarize } = createChecks()

const RECORD_PATH = 'docs/confidence-log.jsonl'
const ROWS_PATH = 'docs/gate-rows.txt'
const BAR = 95

/**
 * `<!-- confidence: run=<12hex>-<12hex> -->` — the run an entry cites.
 *
 * A RUN ID, not a sha. The gate scores the working tree, and HEAD does not
 * change when uncommitted work does, so a sha does not identify what was
 * measured — see `parseLog` for the collision that proved it.
 */
const CITE_RE = /<!--\s*confidence:\s*run=([0-9a-f]{12}-[0-9a-f]{12})\s*-->/g

/** `**Score: N/100**`, the stated total. */
const SCORE_RE = /\*\*Score:\s*(\d+)\/100\*\*/g

/**
 * Strip fenced code blocks before looking for anything.
 *
 * Entries quote gate output verbatim — `510/530 points = 96/100` appears inside
 * a fence in cc-gate-explains-itself-2026-08-16.md — and a scanner that counted
 * quoted output as a claim would fail an entry for accurately reporting what it
 * saw. That file is exactly why this is the first thing that happens.
 */
export const stripFences = text => text.replace(/^```[\s\S]*?^```/gm, '')

/** Every score and citation an entry states outside its code blocks. */
export function scoreClaimsIn(text) {
  const bare = stripFences(text)
  return {
    scores: [...bare.matchAll(SCORE_RE)].map(m => Number(m[1])),
    cites: [...bare.matchAll(CITE_RE)].map(m => m[1]),
  }
}

/** The declared total weight — the denominator a run is allowed to have. */
export function declaredWeight(rowsText) {
  return rowsText
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .reduce((n, l) => {
      const m = /^(\d+)\s+\S/.exec(l)
      return m ? n + Number(m[1]) : n
    }, 0)
}

/**
 * Verdicts for one entry against the run log. Returns [] when the entry is
 * clean — including when it states no score at all.
 */
export function verdictsFor({ file, scores, cites }, runsBySha, weight) {
  const p = []
  if (scores.length === 0) {
    // A citation without a score is a dangling reference, not a free pass.
    if (cites.length > 0) p.push(`${file}: cites a gate run but states no score`)
    return p
  }

  const distinct = [...new Set(scores)]
  if (distinct.length > 1) {
    p.push(`${file}: states ${distinct.length} different scores (${distinct.join(', ')}) — a second score is a conflict, not an override`)
    return p
  }
  const stated = distinct[0]

  if (cites.length === 0) {
    p.push(`${file}: states ${stated}/100 but cites no gate run — add <!-- confidence: run=<id> --> naming a run in ${RECORD_PATH}`)
    return p
  }
  if (new Set(cites).size > 1) {
    p.push(`${file}: cites ${new Set(cites).size} different runs`)
    return p
  }

  const run = runsBySha.get(cites[0])
  if (!run) {
    p.push(`${file}: cites run ${cites[0]}, which is not in ${RECORD_PATH}`)
    return p
  }
  // A DIRTY RUN DESCRIBES A TREE NO COMMIT CONTAINS.
  //
  // The gate scores the working tree. If that tree had uncommitted changes, the
  // thing measured is not the thing anyone can check out, and a citation would
  // point at a state that exists only in the log. Worse, it makes "run the gate,
  // then edit, then cite" indistinguishable from "run the gate on what shipped".
  //
  // So the workflow a citable score requires is: commit, run the gate on the
  // clean tree, cite that run from the next entry. That is also what the
  // standing instruction describes — score the thing you are shipping.
  if (run.dirty) {
    p.push(`${file}: cites a run taken against a DIRTY tree — it measured a state no commit contains`)
  }
  if (run.mode !== 'full') {
    p.push(`${file}: cites a '${run.mode}' run, which skipped ${run.skipped.length} row(s) — only a full run can back a score`)
  }
  if (run.total !== stated) {
    p.push(`${file}: states ${stated}/100, the cited run measured ${run.total}/100`)
  }
  if (stated >= BAR && run.failing.length > 0) {
    p.push(`${file}: claims ${stated} with ${run.failing.length} failing row(s): ${run.failing.join(', ')}`)
  }
  // The bar is a PERCENTAGE; the rows are weighted points. 95% of 530 is 503.5,
  // and `confidence.mjs` reports `Math.round(earned / possible * 100)`, so
  // 503/530 is 94.906% and displays as 95. A run half a point below the bar
  // presents as meeting it.
  //
  // Unreachable while the gate is a conjunction — any failing row exits 1 before
  // the score is consulted. Asserted anyway, in integer arithmetic, because the
  // gate WAS an average until 2026-08-10 and the thing that made it dangerous
  // was that nothing objected while it drifted.
  if (stated >= BAR && run.earned * 100 < BAR * run.possible) {
    p.push(`${file}: claims ${stated}, but ${run.earned}/${run.possible} is ${(run.earned / run.possible * 100).toFixed(3)}% — below ${BAR}, rounded up to meet it`)
  }
  if (run.possible !== weight) {
    p.push(`${file}: cited run scored out of ${run.possible}, but ${ROWS_PATH} declares ${weight} — the denominator moved`)
  }
  return p
}

/**
 * The run log, keyed by RUN ID — never by sha.
 *
 * This was `new Map(lines.map(r => [r.sha, r]))`, and it was wrong in the most
 * embarrassing way available: the first two records written both carried sha
 * `1264e6f` — one scoring 91 with three failing rows, one scoring 100 — because
 * HEAD did not move while the working tree was fixed between them. A Map keyed
 * by sha lets the LAST record win, so a failing run followed by a passing run
 * silently resolved to the passing one.
 *
 * That is the `tail -1` bypass this file was written to refuse, rebuilt inside
 * it, in under three hours. Keying on an id that includes a digest of the
 * uncommitted tree removes the collision; `duplicateIds` below refuses the
 * remaining case rather than picking a winner.
 */
export function parseLog(text) {
  const rows = text.split('\n').filter(Boolean).map(l => JSON.parse(l))
  const byId = new Map()
  const conflicts = []
  const corroborated = []
  const legacy = []
  for (const r of rows) {
    if (!r.id) { legacy.push(r.sha ?? '(no sha)'); continue }
    const prior = byId.get(r.id)
    if (prior) {
      // A CLEAN RUN'S ID IS A FUNCTION OF THE TREE, so two runs of the same
      // committed tree — mine and CI's, say — produce the SAME id. That is not
      // a collision to refuse; it is the only chance this project has to check
      // that the gate is deterministic with respect to what it scores.
      //
      // Agreeing: corroboration, and worth more than either run alone, because
      // the second was a different machine with a different build directory.
      //
      // Disagreeing: the gate is not a function of the tree. Something outside
      // it — a stale build/, a cached artifact, the network, the clock — moved
      // the score. That is a worse finding than any single failing row, because
      // every other guarantee here assumes the score describes the tree.
      if (sameResult(prior, r)) corroborated.push(r.id)
      else conflicts.push({ id: r.id, a: summarise(prior), b: summarise(r) })
      continue
    }
    byId.set(r.id, r)
  }
  return { byId, conflicts, corroborated, legacy }
}

/** Two records of the same run agree if every measured field agrees. */
export const sameResult = (a, b) =>
  a.earned === b.earned &&
  a.possible === b.possible &&
  a.total === b.total &&
  a.mode === b.mode &&
  a.dirty === b.dirty &&
  [...a.failing].sort().join('|') === [...b.failing].sort().join('|')

const summarise = r =>
  `${r.earned}/${r.possible}=${r.total}${r.failing.length ? ` failing:[${r.failing.join(', ')}]` : ''}`

// ── the self-test: can this refuse anything? ────────────────────────────────

if (SELF_TEST) {
  const ID = 'a'.repeat(12) + '-' + 'a'.repeat(12)
  const FAILING = 'b'.repeat(12) + '-' + 'b'.repeat(12)
  const QUICKRUN = 'c'.repeat(12) + '-' + 'c'.repeat(12)
  const SHRUNK = 'd'.repeat(12) + '-' + 'd'.repeat(12)
  const ROUNDED = 'e'.repeat(12) + '-' + 'e'.repeat(12)
  const ATBAR = 'f'.repeat(12) + '-' + 'f'.repeat(12)
  const SHA = '9'.repeat(40)

  const line = o => JSON.stringify(o)
  const log = parseLog([
    line({ id: ID, sha: SHA, dirty: false, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }),
    line({ id: FAILING, sha: SHA, dirty: false, mode: 'full', earned: 500, possible: 530, total: 94, failing: ['a row'], skipped: [] }),
    line({ id: QUICKRUN, sha: SHA, dirty: false, mode: 'quick', earned: 300, possible: 300, total: 100, failing: [], skipped: ['x', 'y'] }),
    line({ id: SHRUNK, sha: SHA, dirty: false, mode: 'full', earned: 400, possible: 400, total: 100, failing: [], skipped: [] }),
    // 503/530 = 94.906%, which Math.round displays as 95.
    line({ id: ROUNDED, sha: SHA, dirty: false, mode: 'full', earned: 503, possible: 530, total: 95, failing: [], skipped: [] }),
    // 504/530 = 95.094%, genuinely at the bar.
    line({ id: ATBAR, sha: SHA, dirty: false, mode: 'full', earned: 504, possible: 530, total: 95, failing: [], skipped: [] }),
  ].join('\n'))
  const runs = log.byId

  // THE COLLISION THAT ACTUALLY HAPPENED, replayed.
  //
  // Two records, same sha, different totals — 91 with three failing rows, then
  // 100 — because HEAD did not move while the working tree was fixed. Keyed by
  // sha, the later record won and a failing run resolved to a passing one.
  const collided = parseLog([
    line({ id: 'aaaaaaaaaaaa-111111111111', sha: SHA, dirty: true, mode: 'full', earned: 480, possible: 530, total: 91, failing: ['x'], skipped: [] }),
    line({ id: 'aaaaaaaaaaaa-222222222222', sha: SHA, dirty: true, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }),
  ].join('\n'))
  check('two runs on the SAME sha stay distinct records',
    collided.byId.size === 2 && collided.conflicts.length === 0,
    `${collided.byId.size} record(s), ${collided.conflicts.length} conflict(s) — a sha-keyed map collapsed these to 1`)

  check('a failing run on that sha is still reachable and still failing',
    collided.byId.get('aaaaaaaaaaaa-111111111111').total === 91,
    'the failing run was overwritten by the passing one')

  // Same id, DISAGREEING: the gate is not a function of the tree.
  const conflicting = parseLog([
    line({ id: ID, sha: SHA, dirty: false, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }),
    line({ id: ID, sha: SHA, dirty: false, mode: 'full', earned: 400, possible: 530, total: 75, failing: ['y'], skipped: [] }),
  ].join('\n'))
  check('two records of one run that DISAGREE are a conflict, not resolved',
    conflicting.conflicts.length === 1 && conflicting.corroborated.length === 0,
    `${conflicting.conflicts.length} conflict(s) — picking a winner is the bypass`)

  check('the conflict names both measurements, not just that one exists',
    conflicting.conflicts[0].a.includes('530/530') && conflicting.conflicts[0].b.includes('400/530'),
    JSON.stringify(conflicting.conflicts[0]))

  // Same id, AGREEING: an independent re-measurement. Evidence, not a fault.
  const agreeing = parseLog([
    line({ id: ID, sha: SHA, dirty: false, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }),
    line({ id: ID, sha: SHA, dirty: false, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }),
  ].join('\n'))
  check('two records of one run that AGREE are corroboration, not a fault',
    agreeing.conflicts.length === 0 && agreeing.corroborated.length === 1 && agreeing.byId.size === 1,
    `conflicts ${agreeing.conflicts.length}, corroborated ${agreeing.corroborated.length}`)

  // Failing-row sets are compared as sets, so ordering is not a conflict.
  const reordered = parseLog([
    line({ id: FAILING, sha: SHA, dirty: false, mode: 'full', earned: 500, possible: 530, total: 94, failing: ['a', 'b'], skipped: [] }),
    line({ id: FAILING, sha: SHA, dirty: false, mode: 'full', earned: 500, possible: 530, total: 94, failing: ['b', 'a'], skipped: [] }),
  ].join('\n'))
  check('the same failing rows in a different order is corroboration',
    reordered.conflicts.length === 0 && reordered.corroborated.length === 1,
    `conflicts ${reordered.conflicts.length}`)

  const legacy = parseLog(line({ sha: SHA, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }))
  check('a pre-id record is retained but NOT citable',
    legacy.byId.size === 0 && legacy.legacy.length === 1,
    `byId ${legacy.byId.size}, legacy ${legacy.legacy.length}`)

  const v = (body, w = 530) =>
    verdictsFor({ file: 'f.md', ...scoreClaimsIn(body) }, runs, w)

  check('an entry stating no score at all is fine',
    v('A report with no number in it.\n').length === 0,
    JSON.stringify(v('A report with no number in it.\n')))

  check('a correct citation passes',
    v(`<!-- confidence: run=${ID} -->\n**Score: 100/100**\n`).length === 0,
    JSON.stringify(v(`<!-- confidence: run=${ID} -->\n**Score: 100/100**\n`)))

  // 1. a number nobody computed
  check('a score with NO citation is refused',
    v('**Score: 95/100**\n').length === 1,
    JSON.stringify(v('**Score: 95/100**\n')))

  check('a score citing an unknown run is refused',
    v(`<!-- confidence: run=${'0'.repeat(12)}-${'0'.repeat(12)} -->\n**Score: 100/100**\n`).length === 1,
    JSON.stringify(v(`<!-- confidence: run=${'0'.repeat(12)}-${'0'.repeat(12)} -->\n**Score: 100/100**\n`)))

  check('a score that disagrees with the cited run is refused',
    v(`<!-- confidence: run=${ID} -->\n**Score: 95/100**\n`)
      .some(x => x.includes('measured 100/100')),
    JSON.stringify(v(`<!-- confidence: run=${ID} -->\n**Score: 95/100**\n`)))

  // 2. the tail -1 bypass, replayed exactly
  check('TWO scores in one entry is a conflict, not an override',
    v(`<!-- confidence: run=${ID} -->\n**Score: 75/100**\nlater\n**Score: 100/100**\n`)
      .some(x => x.includes('conflict')),
    JSON.stringify(v(`<!-- confidence: run=${ID} -->\n**Score: 75/100**\nlater\n**Score: 100/100**\n`)))

  // 3. a passing average over a failing row
  check('a passing claim over a FAILING row is refused',
    v(`<!-- confidence: run=${FAILING} -->\n**Score: 94/100**\n`).length === 0 &&
    v(`<!-- confidence: run=${FAILING} -->\n**Score: 95/100**\n`).length > 0,
    'a run with failures backed a claim at the bar')

  // 4. the moving denominator
  check('a run scored out of a SHRUNKEN denominator is refused',
    v(`<!-- confidence: run=${SHRUNK} -->\n**Score: 100/100**\n`)
      .some(x => x.includes('denominator moved')),
    JSON.stringify(v(`<!-- confidence: run=${SHRUNK} -->\n**Score: 100/100**\n`)))

  const dirtyLog = parseLog(JSON.stringify(
    { id: '1'.repeat(12) + '-' + '1'.repeat(12), sha: SHA, dirty: true, mode: 'full',
      earned: 530, possible: 530, total: 100, failing: [], skipped: [] }))
  check('a run taken against a DIRTY tree cannot back a score',
    verdictsFor({ file: 'f.md', ...scoreClaimsIn(
      `<!-- confidence: run=${'1'.repeat(12)}-${'1'.repeat(12)} --></br>\n**Score: 100/100**\n`) },
      dirtyLog.byId, 530).some(x => x.includes('DIRTY')),
    'a dirty run backed a score')

  check('a QUICK run cannot back a score',
    v(`<!-- confidence: run=${QUICKRUN} -->\n**Score: 100/100**\n`)
      .some(x => x.includes('quick')),
    JSON.stringify(v(`<!-- confidence: run=${QUICKRUN} -->\n**Score: 100/100**\n`)))

  // The bar is a percentage of a 530-point scale, not a point count.
  check('a score ROUNDED UP to the bar is refused (503/530 = 94.906%)',
    v(`<!-- confidence: run=${ROUNDED} -->\n**Score: 95/100**\n`)
      .some(x => x.includes('rounded up')),
    JSON.stringify(v(`<!-- confidence: run=${ROUNDED} -->\n**Score: 95/100**\n`)))

  check('one point higher genuinely meets it (504/530 = 95.094%)',
    v(`<!-- confidence: run=${ATBAR} -->\n**Score: 95/100**\n`).length === 0,
    JSON.stringify(v(`<!-- confidence: run=${ATBAR} -->\n**Score: 95/100**\n`)))

  // The reason stripFences is the first thing that happens.
  check('gate output quoted in a code fence is not read as a claim',
    v('```\n  510/530 points = 96/100\n**Score: 96/100**\n```\n').length === 0,
    JSON.stringify(v('```\n  510/530 points = 96/100\n**Score: 96/100**\n```\n')))

  check('a citation with no score is refused as a dangling reference',
    v(`<!-- confidence: run=${ID} -->\nno score here\n`).length === 1,
    JSON.stringify(v(`<!-- confidence: run=${ID} -->\nno score here\n`)))

  // The denominator reader, against the real file's shape.
  const dir = join(tmpdir(), `conf-rec-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    writeFileSync(join(dir, 'rows.txt'), '# a comment 999 not a row\n\n30  one\n20  two\n10  three\n')
    check('declared weight sums rows and ignores comments',
      declaredWeight(readFileSync(join(dir, 'rows.txt'), 'utf8')) === 60,
      `${declaredWeight(readFileSync(join(dir, 'rows.txt'), 'utf8'))}, want 60`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── the real outbox ─────────────────────────────────────────────────────────
//
// Guarded, so importing this module for its exported helpers does not run the
// check and exit the importing process. See `isMain` in checks.mjs.
if (isMain(import.meta.url)) {

let log
try {
  log = parseLog(readFileSync(RECORD_PATH, 'utf8'))
} catch {
  log = { byId: new Map(), conflicts: [], corroborated: [], legacy: [] }
}
const runs = log.byId

const weight = declaredWeight(readFileSync(ROWS_PATH, 'utf8'))

const entries = readdirSync('outbox')
  .filter(f => f.endsWith('.md'))
  .map(f => ({ file: `outbox/${f}`, ...scoreClaimsIn(readFileSync(join('outbox', f), 'utf8')) }))

const scored = entries.filter(e => e.scores.length > 0)

console.log(`\n${scored.length} of ${entries.length} outbox entries state a confidence score`)
console.log(`${runs.size} citable gate run(s) recorded in ${RECORD_PATH}, denominator ${weight}`)
if (log.legacy.length > 0) {
  // Records written before run ids existed. Not citable, and not deleted: they
  // are the evidence for why the id exists.
  console.log(`${log.legacy.length} pre-id record(s) retained and NOT citable: ${log.legacy.map(s => String(s).slice(0, 7)).join(', ')}`)
}
console.log('')

const problems = entries.flatMap(e => verdictsFor(e, runs, weight))

// Never resolved by picking a winner — that is what made the sha-keyed version
// a bypass. Two records of one run either agree, in which case the second is
// evidence, or they do not, in which case the score is not a property of the
// tree and nothing else here means what it says.
check('the gate is a function of the tree it scores',
  log.conflicts.length === 0,
  log.conflicts.map(c => `run ${c.id} was measured twice and disagreed: ${c.a} vs ${c.b}`).join('\n      → '))

if (log.corroborated.length > 0) {
  console.log(`${log.corroborated.length} run(s) independently re-measured and agreeing:`)
  for (const id of [...new Set(log.corroborated)]) console.log(`  ${id}`)
  console.log('')
}

check('every stated confidence score is backed by a recorded gate run',
  problems.length === 0,
  problems.join('\n      → '))

// NON-VACUITY, and why it is not "at least one entry states a score".
//
// The usual guard would fail when nothing is scored, since "every score is
// real" is free over an empty set. That guard would be wrong here. Zero scored
// entries is a legitimate and honest state — it is what the outbox looks like
// the moment four unbacked numbers are withdrawn — and a check that forbids it
// pressures the next entry into stating a number to satisfy the checker. That
// is the failure this file exists to prevent, arriving through the front door.
//
// The thing genuinely worth guarding is that the DETECTOR still works, and the
// self-test proves that against fixtures: it refuses eleven distinct bad
// claims, so a SCORE_RE that stopped matching fails there rather than passing
// silently here.
const naive = entries.filter(e => /\*\*Score:/.test(readFileSync(e.file, 'utf8'))).length
check('the parser agrees with a dumber scan about which entries claim a score',
  naive === scored.length || naive >= scored.length,
  `naive grep found ${naive} file(s) containing "**Score:", the parser scored ${scored.length}`)

if (scored.length === 0) {
  console.log('\n  No entry states a confidence score. That is not a failure —')
  console.log('  an unmeasured number is worse than no number.\n')
}

finish(summarize())
}
