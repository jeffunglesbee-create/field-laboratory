// What a red step COST, measured in the steps that never ran behind it.
//
// WRITTEN FROM A MEASUREMENT, 2026-09-20. `verify` step 25 was red for seven
// consecutive runs on one ungated `:hover`. Forty-four steps were skipped behind
// it every time. Two of those forty-four were real defects that had shipped —
// `ceiling-check.mjs` carrying numbers the source no longer held, and a clock
// read costing two gate rows their determinism score. Both went unseen for the
// whole window.
//
// GitHub reports a skipped step and a step that does not exist identically: as
// absence. The run summary said "one red" seven times and never said "and 44
// unexamined", so each session read the red as a standing condition rather than
// as a bill coming due.
//
// The skip count is that bill, and it belongs in the notification a human
// actually opens — the red-main sentinel issue — rather than in a log nobody
// re-reads.
//
// THREE STATES, NOT TWO. A run whose steps cannot be read reports `null`, never
// zero. "Nothing was skipped" and "I could not tell" are different claims, and
// collapsing them is the substitution this repo keeps finding.
//
// Usage:  node scripts/run-steps.mjs --self-test

import { createChecks, isMain, finish } from './checks.mjs'

/**
 * The first failing step and what it cost, from one job's `steps` array.
 *
 * `conclusion` is what GitHub fills in: success, failure, skipped, cancelled.
 * A step still running has none, and is counted as neither run nor skipped —
 * the job is not over, so its bill is not yet due.
 */
export function stepSummary(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return null
  const real = steps.filter(s => s && !/^(Set up job|Complete job|Post Run )/.test(s.name ?? ''))
  const failed = real.find(s => s.conclusion === 'failure')
  return {
    total: real.length,
    ran: real.filter(s => s.conclusion === 'success' || s.conclusion === 'failure').length,
    skipped: real.filter(s => s.conclusion === 'skipped').length,
    failedStep: failed ? `${failed.name}` : null,
    failedNumber: failed ? failed.number ?? null : null,
  }
}

/**
 * The summary for whichever job in a run failed.
 *
 * A run has several jobs; only the one that failed has a skip tail worth
 * reporting. When more than one failed, the one with the largest tail is the
 * one that hid the most.
 */
export function worstFailure(jobs) {
  if (!Array.isArray(jobs)) return null
  const summaries = jobs
    .filter(j => j?.conclusion === 'failure')
    .map(j => ({ job: j.name, ...(stepSummary(j.steps) ?? {}) }))
    .filter(s => s.failedStep)
  if (summaries.length === 0) return null
  return summaries.sort((a, b) => b.skipped - a.skipped)[0]
}

/** One sentence, or nothing. Never "0 skipped" from an unread run. */
export function costLine(summary) {
  if (!summary || !summary.failedStep) return ''
  const where = summary.failedNumber ? `step ${summary.failedNumber}` : 'a step'
  if (summary.skipped === 0) {
    return `**First failing step:** ${summary.failedStep} (${where}). ` +
      `Nothing was skipped behind it — the other ${summary.total - 1} steps ran.`
  }
  return `**First failing step:** ${summary.failedStep} (${where}).\n\n` +
    `**${summary.skipped} of ${summary.total} steps did not run behind it.** ` +
    `A skipped check and a check that does not exist look identical from the ` +
    `outside; this red is hiding ${summary.skipped} unknowns, not ${summary.skipped} passes.`
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const s = (name, conclusion, number) => ({ name, conclusion, number })

  check('an empty or absent steps array is UNKNOWN, not zero',
    stepSummary([]) === null && stepSummary(undefined) === null,
    'reporting "0 skipped" from a run nobody could read is a claim from no data')

  const real = [
    s('Set up job', 'success', 1),
    s('Build', 'success', 2),
    s('The chrome, measured on the rendered page', 'failure', 3),
    s('Tabs', 'skipped', 4),
    s('Team tints', 'skipped', 5),
    s('Post Run actions/checkout@v4', 'success', 90),
    s('Complete job', 'success', 91),
  ]
  const sum = stepSummary(real)
  check('THE HOUSEKEEPING STEPS ARE NOT COUNTED',
    sum.total === 4,
    `${sum.total} — Set up job, Complete job and Post Run * are the runner's, not the suite's`)
  check('the first failing step is named',
    sum.failedStep === 'The chrome, measured on the rendered page' && sum.failedNumber === 3)
  check('THE SKIP TAIL IS COUNTED', sum.skipped === 2, `${sum.skipped}`)
  check('ran counts successes and the failure, not the skips',
    sum.ran === 2, `${sum.ran}`)

  const running = stepSummary([s('Build', 'success', 1), s('Render', null, 2)])
  check('a step still running is neither run nor skipped',
    running.ran === 1 && running.skipped === 0 && running.failedStep === null,
    'the job is not over, so its bill is not yet due')

  check('a green job yields no failing step',
    stepSummary([s('Build', 'success', 1), s('Render', 'success', 2)]).failedStep === null)

  // worstFailure
  check('no failed job yields nothing',
    worstFailure([{ name: 'verify', conclusion: 'success', steps: real }]) === null)
  const two = worstFailure([
    { name: 'small', conclusion: 'failure', steps: [s('a', 'failure', 1), s('b', 'skipped', 2)] },
    { name: 'big', conclusion: 'failure', steps: [s('a', 'failure', 1), s('b', 'skipped', 2), s('c', 'skipped', 3)] },
  ])
  check('THE JOB THAT HID THE MOST IS THE ONE REPORTED',
    two.job === 'big' && two.skipped === 2, JSON.stringify(two))
  check('a failed job with no failing step is not reported',
    worstFailure([{ name: 'cancelled', conclusion: 'failure', steps: [s('a', 'cancelled', 1)] }]) === null,
    'a cancelled job has no first failing step to name')

  // costLine
  check('no summary yields no line, not a misleading one',
    costLine(null) === '' && costLine({ failedStep: null }) === '')
  check('A ZERO TAIL SAYS SO EXPLICITLY, rather than going quiet',
    /Nothing was skipped behind it/.test(costLine(stepSummary([s('a', 'failure', 1), s('b', 'success', 2)]))),
    'silence would read as "this tool did not run"')
  const line = costLine(sum)
  check('THE COUNT AND THE DENOMINATOR ARE BOTH IN THE LINE',
    /\b2 of 4 steps did not run\b/.test(line), line)
  check('the line says what a skip is, not just how many',
    /look identical from the outside/.test(line))

  finish(summarize())
}
