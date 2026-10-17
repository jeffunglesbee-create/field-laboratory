#!/usr/bin/env node
// docs/CC-CMD-2026-10-10-schedule-path-respects-verify.md — the hourly deploy
// must respect verify, as the push path already does.
//
// THE DEFECT, measured 2026-10-10. deploy.yml's job gate reads
// `github.event_name != 'workflow_run' || …conclusion == 'success'`, so on a
// `schedule` event the first clause is true and the job runs unconditionally:
//
//   verify      FAILURE on 2000641, run 37931213343
//   deploy      success on 7a9f48f, trigger schedule, 20:08:44Z
//   live-check  failure on 7a9f48f, 20:09:54Z
//
// The day before, main equally red, deploy SKIPPED — because that day's trigger
// was workflow_run from a failed verify, and the site sat five commits stale.
// Same red main, opposite outcomes, decided by which trigger happened to fire.
//
// WHICH COMMIT'S VERDICT. Not verify's latest run: a docs commit on top of a
// deployable one does not trigger verify, so the newest run can be about older
// code than GITHUB_SHA. The gate asks about the newest DEPLOYABLE commit, which
// is exactly the code about to be published — and that question is answerable
// because `isIgnored` and verify.yml's `paths-ignore` describe the same set.
// check-ignore-parity.mjs defends that equivalence; without it this gate
// silently starts asking about a commit verify never ran on.
//
// SKIP, DO NOT FAIL. deploy.yml's header: "An unconfigured deploy is not a
// broken build, and a workflow that goes red on every push until someone pastes
// a secret trains you to ignore red." A verify-red deploy is the same shape —
// the red already exists, on verify, where it belongs.

import { appendFileSync } from 'node:fs'
import { readVerify, readStepSummary } from './status.mjs'
import { newestDeployableCommit, carriesSkipDirective } from './deployable.mjs'
import { execFileSync } from 'node:child_process'
import { costLine } from './run-steps.mjs'
import { createChecks, isMain } from './checks.mjs'

/**
 * HELD is the fifth outcome, added by docs/CC-CMD-2026-10-17-deploy-gate-
 * unverified-tree.md (owner ruling: option 1, words not behaviour). A census
 * commit lands under data/ with the skip directive, so verify never runs on
 * it, and until the next verified commit every hourly run used to say "could
 * NOT BE READ" — the heading meant for a verdict nobody can fetch. The cause
 * is known and correct, so it gets its own words. What ships is unchanged:
 * held does not proceed, exactly as unknown did not.
 *
 * Only an `unknown` verdict is reinterpreted. If verify DID record a verdict
 * on that commit (a dispatch, say), the real verdict stands.
 */
export const reinterpret = (decision, skipDirective) =>
  decision === 'unknown' && skipDirective ? 'held' : decision

/**
 * FOUR outcomes, and the fourth is not "go".
 *
 * `in-flight` and `unknown` are both skips and they are NOT the same skip. An
 * unreadable verdict rendered as a quiet skip looks like a healthy site
 * forever; "verify is still running, retrying next hour" is a system working.
 * Rule 99: absence is a sibling of the value, and here it is a sibling that
 * must survive all the way into the step summary a human reads.
 */
export const gateSummary = ({ decision, sha, text, problem, stepCost = '' }) => {
  const at = sha ? `\`${sha.slice(0, 7)}\`` : 'an unknown commit'
  switch (decision) {
    case 'go':
      return { proceed: true, heading: `Deploy proceeding — verify is green on ${at}`, body: '' }
    case 'red':
      return {
        proceed: false,
        heading: `Deploy skipped — verify is RED on ${at}`,
        body: `${text}\n\n${stepCost}\n\nThe red is on verify, where it belongs. `
          + `This deploy will publish again on the next hourly run once main is green.`,
      }
    case 'in-flight':
      return {
        proceed: false,
        heading: `Deploy skipped — verify is still running on ${at}`,
        body: `${text}\n\nNot red: in flight. The hourly cron retries, so this costs at most an hour.`,
      }
    case 'held':
      return {
        proceed: false,
        heading: `Deploy held — ${at} carries the skip directive, so verify never runs on it`,
        body: `${at} is the newest change to the published tree and verify has no verdict on it, by `
          + `design: its commit message asked CI to skip. Its bytes are held back, not lost — the `
          + `next verified commit publishes them, with verify having seen them.\n\n`
          + `Not red, not unreadable. Nothing unverified is published.`,
      }
    default:
      return {
        proceed: false,
        heading: `Deploy skipped — verify's verdict for ${at} could NOT BE READ`,
        body: `${text}\n\n**Cause:** ${problem ?? 'no run recorded for that commit'}\n\n`
          + `THIS IS NOT A GREEN AND IT IS NOT A RED. Nothing is known about the code at `
          + `${at}, so nothing is published. If this repeats every hour, the cause above is `
          + `the thing to fix — a silent skip here would look like a healthy site forever.`,
      }
  }
}

/** Which triggers this gate applies to, and why the other two do not. */
export const gateApplies = (eventName) => eventName === 'schedule'

function selfTest () {
  const { check, summarize } = createChecks()

  check('a green verdict proceeds', gateSummary({ decision: 'go', sha: 'abc1234' }).proceed === true)
  check('a red verdict does NOT proceed', gateSummary({ decision: 'red', sha: 'abc1234', text: 'x' }).proceed === false)
  check('MUTATION: an UNREADABLE verdict does not proceed',
    gateSummary({ decision: 'unknown', sha: 'abc1234', text: 'x' }).proceed === false)
  check('MUTATION: an IN-FLIGHT verdict does not proceed',
    gateSummary({ decision: 'in-flight', sha: 'abc1234', text: 'x' }).proceed === false)

  const red = gateSummary({ decision: 'red', sha: 'abc1234', text: 't' })
  const flight = gateSummary({ decision: 'in-flight', sha: 'abc1234', text: 't' })
  const unknown = gateSummary({ decision: 'unknown', sha: 'abc1234', text: 't', problem: 'HTTP 403' })
  const held = gateSummary({ decision: 'held', sha: 'abc1234', text: 't' })
  check('red, in-flight, unreadable and held are FOUR DISTINCT headings',
    new Set([red.heading, flight.heading, unknown.heading, held.heading]).size === 4)
  check('MUTATION: a HELD tree does not proceed — option 1 changes words, not what ships',
    held.proceed === false)
  check('a held skip names the commit and says why, without the unreadable wording',
    /abc1234/.test(held.heading) && /skip directive/.test(held.heading) && !/NOT BE READ/.test(held.heading), held.heading)
  check('...and says its bytes wait for a verified commit',
    /next verified commit/.test(held.body), held.body)
  check('an unknown verdict on a skip-directive commit is HELD',
    reinterpret('unknown', true) === 'held')
  check('MUTATION: an unknown verdict on an ordinary commit stays UNKNOWN',
    reinterpret('unknown', false) === 'unknown')
  check('MUTATION: a REAL verdict on a skip-directive commit is not overridden',
    reinterpret('red', true) === 'red' && reinterpret('go', true) === 'go' && reinterpret('in-flight', true) === 'in-flight')
  check('an in-flight skip does not read as red', !/RED/.test(flight.heading), flight.heading)
  check('an unreadable skip says so in capitals, not quietly',
    /could NOT BE READ/.test(unknown.heading), unknown.heading)
  check('...and names the cause it was given', /HTTP 403/.test(unknown.body), unknown.body)
  check('...and says explicitly that it is neither green nor red',
    /NOT A GREEN AND IT IS NOT A RED/.test(unknown.body))
  check('a red skip carries the failing-step cost it was handed',
    /step 3/.test(gateSummary({ decision: 'red', sha: 'a', text: 't', stepCost: 'First failing step: X (step 3).' }).body))

  check('MUTATION: a null sha is unknown, and says the history was too shallow',
    gateSummary({ decision: 'unknown', sha: null, text: 't', problem: 'shallow' }).proceed === false)
  check('...and names the commit as unknown rather than printing an empty sha',
    /an unknown commit/.test(gateSummary({ decision: 'unknown', sha: null, text: 't' }).heading))

  check('the gate applies on schedule', gateApplies('schedule') === true)
  check('MUTATION: workflow_dispatch is NOT gated — a human override stays possible',
    gateApplies('workflow_dispatch') === false)
  check('workflow_run is NOT gated here — the job-level if already did it',
    gateApplies('workflow_run') === false)

  return summarize('deploy gate')
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) process.exit(selfTest())

if (isMain(import.meta.url)) {
  const event = process.env.GITHUB_EVENT_NAME ?? ''
  const out = process.env.GITHUB_OUTPUT
  const sum = process.env.GITHUB_STEP_SUMMARY
  const emit = (proceed, heading, body) => {
    if (out) appendFileSync(out, `proceed=${proceed}\n`)
    const block = `### ${heading}\n\n${body}\n`
    if (sum) appendFileSync(sum, block)
    console.log(`${heading}\n${body}`)
  }

  if (!gateApplies(event)) {
    // workflow_run reached here only by passing the job-level `if`, which
    // already required verify success. workflow_dispatch is deliberately
    // ungated: a human asking for a deploy is a human overriding this on
    // purpose, and the dispatch is recorded in the run history. Gating it would
    // remove the only manual route to publishing a known-red commit.
    emit(true, `Gate not applicable on \`${event || '(none)'}\``,
      'Only the hourly `schedule` consults verify here.')
    process.exit(0)
  }

  const sha = newestDeployableCommit()

  // NO SHA IS 'unknown', AND IT MUST NOT FALL THROUGH TO THE NEWEST RUN.
  // `verifyRunsUrl(repo, null)` drops the head_sha filter and answers about
  // whatever ran last, which is precisely the defect this gate exists to fix —
  // a verdict about different code. `newestDeployableCommit` returns null when
  // history is too shallow to reach a deployable commit, so a checkout without
  // fetch-depth: 0 would reintroduce it silently. The workflow sets the depth;
  // this refuses to guess if it ever stops.
  if (!sha) {
    const g0 = gateSummary({
      decision: 'unknown', sha: null,
      text: 'no deployable commit was found in the history available to this checkout',
      problem: 'newestDeployableCommit() returned null — history is probably shallow (needs fetch-depth: 0)',
    })
    emit(g0.proceed, g0.heading, g0.body)
    process.exit(0)
  }

  const res = await readVerify({
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPOSITORY,
    head: sha,
    inCI: true,
    now: new Date().toISOString(),
    headSha: sha,
  })
  // THE FAILING STEP, which is the whole reason this document runs second.
  // CC-CMD-2026-10-10-red-verdict-carries-its-step.md put the step summary
  // behind `readStepSummary`; without it this skip would say "verify is red"
  // and nothing about WHICH check — a gate that stops the site without naming
  // the thing to fix. Only fetched on a red, because only a red has a step.
  const stepCost = res.decision === 'red' && res.run
    ? costLine(await readStepSummary({
        token: process.env.GITHUB_TOKEN,
        repo: process.env.GITHUB_REPOSITORY,
        runId: res.run.id,
      }))
    : ''
  // A git read of one commit message; if it cannot be read the verdict stays
  // `unknown`, never `held` — not knowing is not a reason.
  let skipDirective = false
  try { skipDirective = carriesSkipDirective(execFileSync('git', ['log', '-1', '--format=%B', sha], { encoding: 'utf8' })) }
  catch (e) { console.log(`could not read ${sha.slice(0, 7)}'s message (${String(e.message).slice(0, 80)}); verdict stays as read`) }
  const decision = reinterpret(res.decision, skipDirective)
  const g = gateSummary({ decision, sha, text: res.text, problem: res.problem, stepCost })
  emit(g.proceed, g.heading, g.body)
  process.exit(0)
}
