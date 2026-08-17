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
import { createChecks } from './checks.mjs'

const SELF_TEST = process.argv.includes('--self-test')
const { check, summarize } = createChecks()

const RECORD_PATH = 'docs/confidence-log.jsonl'
const ROWS_PATH = 'docs/gate-rows.txt'
const BAR = 95

/** `<!-- confidence: run=<40-char sha> -->` — the run an entry cites. */
const CITE_RE = /<!--\s*confidence:\s*run=([0-9a-f]{40})\s*-->/g

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
    p.push(`${file}: states ${stated}/100 but cites no gate run — add <!-- confidence: run=<sha> --> naming a run in ${RECORD_PATH}`)
    return p
  }
  if (new Set(cites).size > 1) {
    p.push(`${file}: cites ${new Set(cites).size} different runs`)
    return p
  }

  const run = runsBySha.get(cites[0])
  if (!run) {
    p.push(`${file}: cites run ${cites[0].slice(0, 7)}, which is not in ${RECORD_PATH}`)
    return p
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

const parseLog = text =>
  new Map(text.split('\n').filter(Boolean).map(l => {
    const r = JSON.parse(l)
    return [r.sha, r]
  }))

// ── the self-test: can this refuse anything? ────────────────────────────────

if (SELF_TEST) {
  const SHA = 'a'.repeat(40)
  const OTHER = 'b'.repeat(40)
  const runs = parseLog([
    JSON.stringify({ sha: SHA, mode: 'full', earned: 530, possible: 530, total: 100, failing: [], skipped: [] }),
    JSON.stringify({ sha: OTHER, mode: 'full', earned: 500, possible: 530, total: 94, failing: ['a row'], skipped: [] }),
    JSON.stringify({ sha: 'c'.repeat(40), mode: 'quick', earned: 300, possible: 300, total: 100, failing: [], skipped: ['x', 'y'] }),
    JSON.stringify({ sha: 'd'.repeat(40), mode: 'full', earned: 400, possible: 400, total: 100, failing: [], skipped: [] }),
    // 503/530 = 94.906%, which Math.round displays as 95. The rounding case.
    JSON.stringify({ sha: 'e'.repeat(40), mode: 'full', earned: 503, possible: 530, total: 95, failing: [], skipped: [] }),
    // 504/530 = 95.094%, genuinely at the bar.
    JSON.stringify({ sha: 'f'.repeat(40), mode: 'full', earned: 504, possible: 530, total: 95, failing: [], skipped: [] }),
  ].join('\n'))

  const v = (body, w = 530) =>
    verdictsFor({ file: 'f.md', ...scoreClaimsIn(body) }, runs, w)

  check('an entry stating no score at all is fine',
    v('A report with no number in it.\n').length === 0,
    JSON.stringify(v('A report with no number in it.\n')))

  check('a correct citation passes',
    v(`<!-- confidence: run=${SHA} -->\n**Score: 100/100**\n`).length === 0,
    JSON.stringify(v(`<!-- confidence: run=${SHA} -->\n**Score: 100/100**\n`)))

  // 1. a number nobody computed
  check('a score with NO citation is refused',
    v('**Score: 95/100**\n').length === 1,
    JSON.stringify(v('**Score: 95/100**\n')))

  check('a score citing an unknown run is refused',
    v(`<!-- confidence: run=${'9'.repeat(40)} -->\n**Score: 100/100**\n`).length === 1,
    JSON.stringify(v(`<!-- confidence: run=${'9'.repeat(40)} -->\n**Score: 100/100**\n`)))

  check('a score that disagrees with the cited run is refused',
    v(`<!-- confidence: run=${SHA} -->\n**Score: 95/100**\n`)
      .some(x => x.includes('measured 100/100')),
    JSON.stringify(v(`<!-- confidence: run=${SHA} -->\n**Score: 95/100**\n`)))

  // 2. the tail -1 bypass, replayed exactly
  check('TWO scores in one entry is a conflict, not an override',
    v(`<!-- confidence: run=${SHA} -->\n**Score: 75/100**\nlater\n**Score: 100/100**\n`)
      .some(x => x.includes('conflict')),
    JSON.stringify(v(`<!-- confidence: run=${SHA} -->\n**Score: 75/100**\nlater\n**Score: 100/100**\n`)))

  // 3. a passing average over a failing row
  check('a passing claim over a FAILING row is refused',
    v(`<!-- confidence: run=${OTHER} -->\n**Score: 94/100**\n`).length === 0 &&
    v(`<!-- confidence: run=${OTHER} -->\n**Score: 95/100**\n`).length > 0,
    'a run with failures backed a claim at the bar')

  // 4. the moving denominator
  check('a run scored out of a SHRUNKEN denominator is refused',
    v(`<!-- confidence: run=${'d'.repeat(40)} -->\n**Score: 100/100**\n`)
      .some(x => x.includes('denominator moved')),
    JSON.stringify(v(`<!-- confidence: run=${'d'.repeat(40)} -->\n**Score: 100/100**\n`)))

  check('a QUICK run cannot back a score',
    v(`<!-- confidence: run=${'c'.repeat(40)} -->\n**Score: 100/100**\n`)
      .some(x => x.includes('quick')),
    JSON.stringify(v(`<!-- confidence: run=${'c'.repeat(40)} -->\n**Score: 100/100**\n`)))

  // The bar is a percentage of a 530-point scale, not a point count.
  check('a score ROUNDED UP to the bar is refused (503/530 = 94.906%)',
    v(`<!-- confidence: run=${'e'.repeat(40)} -->\n**Score: 95/100**\n`)
      .some(x => x.includes('rounded up')),
    JSON.stringify(v(`<!-- confidence: run=${'e'.repeat(40)} -->\n**Score: 95/100**\n`)))

  check('one point higher genuinely meets it (504/530 = 95.094%)',
    v(`<!-- confidence: run=${'f'.repeat(40)} -->\n**Score: 95/100**\n`).length === 0,
    JSON.stringify(v(`<!-- confidence: run=${'f'.repeat(40)} -->\n**Score: 95/100**\n`)))

  // The reason stripFences is the first thing that happens.
  check('gate output quoted in a code fence is not read as a claim',
    v('```\n  510/530 points = 96/100\n**Score: 96/100**\n```\n').length === 0,
    JSON.stringify(v('```\n  510/530 points = 96/100\n**Score: 96/100**\n```\n')))

  check('a citation with no score is refused as a dangling reference',
    v(`<!-- confidence: run=${SHA} -->\nno score here\n`).length === 1,
    JSON.stringify(v(`<!-- confidence: run=${SHA} -->\nno score here\n`)))

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

let runs
try {
  runs = parseLog(readFileSync(RECORD_PATH, 'utf8'))
} catch {
  runs = new Map()
}

const weight = declaredWeight(readFileSync(ROWS_PATH, 'utf8'))

const entries = readdirSync('outbox')
  .filter(f => f.endsWith('.md'))
  .map(f => ({ file: `outbox/${f}`, ...scoreClaimsIn(readFileSync(join('outbox', f), 'utf8')) }))

const scored = entries.filter(e => e.scores.length > 0)

console.log(`\n${scored.length} of ${entries.length} outbox entries state a confidence score`)
console.log(`${runs.size} gate run(s) recorded in ${RECORD_PATH}, denominator ${weight}\n`)

const problems = entries.flatMap(e => verdictsFor(e, runs, weight))

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

process.exit(summarize() === 0 ? 0 : 1)
