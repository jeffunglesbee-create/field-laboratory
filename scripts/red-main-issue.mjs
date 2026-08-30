// A red main opens an issue; a green main closes it.
//
// WHY AN ISSUE AND NOT A WEBHOOK
//
// A notification needs a channel, and this repo has no notification secret --
// its secrets are Cloudflare, the relay, and a sibling-repo token. Adding one
// means a new credential to store, rotate and leak.
//
// A GitHub issue needs none. `GITHUB_TOKEN` already exists in every workflow
// run, and GitHub's own delivery -- email, and the mobile app's push if it is
// installed -- is the notification. The channel is the one the maintainer is
// already subscribed to.
//
// It is also STATEFUL, which a webhook is not. `verify` ran twelve times on main
// on 2026-08-29; a fire-and-forget alert on each red push would have sent three
// separate messages for one broken state. An issue is opened once, updated while
// the state persists, and closed when main recovers. One notification per
// transition, not per push.
//
// THE RELAY'S PUSH CHANNEL IS DELIBERATELY NOT USED
//
// field-relay-nba has real web-push infrastructure (`PUSH_SUBS` KV, cron-driven
// DRAMA_THRESHOLD sends). It would work. Its subscribers are FIELD's readers,
// who signed up for sport, and routing a build failure to them would be a
// category error dressed as reuse.
//
// COST
//
// None beyond what already runs. status.yml fires on a red verify (added the
// same day) and on `deploy`, which fires only on a green verify -- so both the
// open and the close paths ride triggers that already exist. No new workflow, no
// new schedule, no extra minutes.
//
// Usage:  node scripts/red-main-issue.mjs            (in CI, needs GITHUB_TOKEN)
//         node scripts/red-main-issue.mjs --self-test

import { createChecks, isMain } from './checks.mjs'
import { readVerify } from './status.mjs'

/// The marker that makes the issue findable again next time. A title can be
/// edited by a human; this is in the body and is what the lookup matches on.
export const MARKER = '<!-- red-main-sentinel -->'

/**
 * The open sentinel issue among a repo's open issues, or null.
 *
 * IT IS A LIST, NOT A SEARCH. The first version called `/search/issues` with
 * `in:body "<marker>"`, which reads naturally and has a failure mode this
 * design cannot tolerate: GitHub's code/issue search is served from an INDEX
 * that lags writes. The open path and the comment path can fire seconds apart
 * -- `verify` ran twelve times on main on 2026-08-29 -- and a lookup that has
 * not yet seen the issue it opened one run ago returns nothing, so the run
 * opens a SECOND issue. Duplicate alerts for one broken state is the exact
 * failure the stateful design exists to avoid.
 *
 * `GET /repos/{repo}/issues` is read-after-write consistent, so the issue
 * opened by the previous run is always visible to this one. The repo had zero
 * open issues when this was written, so the scan is a single page.
 *
 * PULL REQUESTS COME BACK FROM THAT ENDPOINT TOO. Every PR is an issue to the
 * REST API, and one carrying the marker in its body -- a PR that quotes this
 * file, say -- would be "closed" as a recovery. Anything with a
 * `pull_request` key is not a candidate.
 */
export const findSentinel = (items) =>
  (items ?? []).find(i => !i.pull_request && (i.body ?? '').includes(MARKER)) ?? null

/**
 * What to do, given the suite's verdict and whether a sentinel issue is open.
 *
 * Pure, and separated from every API call, because the decision is the part
 * that can be wrong in a way nobody notices: an "open" that should have been a
 * "comment" spams, and a "close" that should have been a "none" reopens noise
 * on every unrelated deploy.
 */
export const action = (green, openIssue) => {
  if (green) return openIssue ? 'close' : 'none'
  return openIssue ? 'comment' : 'open'
}

/**
 * Green / red / unreadable, from `readVerify`'s return.
 *
 * IT RETURNS PROSE, NOT A CONCLUSION. The first version of this file wrote
 * `verify.conclusion === 'success'` from memory of what such a function
 * "should" return. `readVerify` returns `{ text, problem }`, so that comparison
 * was `undefined === 'success'` -- false on every run, which would have opened
 * a red-main issue on a perfectly green main and then commented on it forever.
 *
 * The text is status.mjs's single verdict rendering and is what STATUS.md's
 * first line shows, so matching it is reading the same source rather than a
 * second opinion. Its four shapes are `**green**`, `**running**`, `**STALLED**`
 * and `**<CONCLUSION>**` for anything else.
 *
 * THREE STATES. Anything not clearly green and not clearly a completed failure
 * is `unreadable`, and unreadable does nothing: a running suite is not a red to
 * report, and a stalled one is not a green to close on.
 */
export const verdictOf = (v) => {
  const text = v?.text
  if (!text || v?.problem) return 'unreadable'
  if (/^\*\*green\*\*/.test(text)) return 'green'
  if (/^\*\*(running|STALLED)\*\*/.test(text)) return 'unreadable'
  if (/^\*\*[A-Z_]+\*\*/.test(text)) return 'red'
  return 'unreadable'
}

/** The issue body, kept to what makes the notification actionable. */
export const body = ({ sha, runUrl, failedStep }) =>
  `${MARKER}\n\n` +
  `\`verify\` failed on \`${sha.slice(0, 7)}\`.\n\n` +
  (failedStep ? `**First failing step:** ${failedStep}\n\n` : '') +
  `${runUrl}\n\n` +
  `This issue closes itself when \`verify\` next passes on main. ` +
  `It is opened and closed by \`scripts/red-main-issue.mjs\`; ` +
  `closing it by hand does not fix main.`

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  check('red main with nothing open -> open', action(false, null) === 'open')
  check('red main with one already open -> comment, not a second issue',
    action(false, { number: 7 }) === 'comment',
    'twelve verify runs on one bad day would otherwise be twelve issues')
  check('green main with one open -> close', action(true, { number: 7 }) === 'close')
  check('green main with nothing open -> nothing',
    action(true, null) === 'none',
    'every green deploy would otherwise touch the API for no reason')

  // THE TRAP THAT WAS ALMOST SHIPPED, as a fixture.
  //
  // `green` was first derived from the workflow event: true unless a failing
  // `verify` triggered the run. On the daily backstop, a manual dispatch, or a
  // `pages`/`drift-sentinel` completion that expression is true regardless of
  // main's real state -- so a still-red main would have been reported green and
  // its issue CLOSED. A false recovery is worse than a missing alert.
  const fromTrigger = (eventName, workflowName) =>
    eventName !== 'workflow_run' || workflowName !== 'verify'
  check('THE TRIGGER IS NOT THE VERDICT: the daily schedule reads as green',
    fromTrigger('schedule', null) === true,
    'which would have closed an open issue on a still-red main, every morning')
  check('...and so does a manual dispatch, and a pages completion',
    fromTrigger('workflow_dispatch', null) === true &&
    fromTrigger('workflow_run', 'pages') === true)

  // THE RETURN SHAPE, pinned. This is the bug that was almost shipped.
  check('a green verdict reads green',
    verdictOf({ text: '**green** on `42e793d`', problem: null }) === 'green')
  check('a completed FAILURE reads red',
    verdictOf({ text: '**FAILURE** on `c338742`', problem: null }) === 'red')
  check('a RUNNING suite is unreadable, not red',
    verdictOf({ text: '**running** on `abc1234`', problem: null }) === 'unreadable',
    'reporting an in-progress run as red would open an issue on every push')
  check('a STALLED suite is unreadable, not green',
    verdictOf({ text: '**STALLED** on `abc1234`', problem: null }) === 'unreadable',
    'and closing an open issue on a stall would read as a recovery')
  check('a problem field is unreadable whatever the text says',
    verdictOf({ text: '**green** on `x`', problem: 'HTTP 500' }) === 'unreadable')
  check('THE SHAPE BUG: readVerify has no `conclusion`, so the old test was always false',
    verdictOf({ text: '**green** on `x`', problem: null }) === 'green' &&
    ({ text: '', problem: null }).conclusion === undefined,
    'undefined === "success" is false, so every green main would have been reported red')

  // THE LOOKUP, which is where a duplicate alert would come from.
  const sentinel = { number: 7, body: `${MARKER}\n\nverify failed on abc1234.` }
  check('the sentinel is found among unrelated open issues',
    findSentinel([{ number: 1, body: 'unrelated' }, sentinel])?.number === 7)
  check('no sentinel among unrelated issues is null, not undefined',
    findSentinel([{ number: 1, body: 'unrelated' }]) === null)
  check('an empty repo is null',
    findSentinel([]) === null && findSentinel(undefined) === null)
  check('an issue with a NULL body does not throw',
    findSentinel([{ number: 1, body: null }, sentinel])?.number === 7,
    'the REST API returns body: null for an issue opened with no body')
  check('A PULL REQUEST CARRYING THE MARKER IS NOT THE SENTINEL',
    findSentinel([{ number: 9, body: sentinel.body, pull_request: { url: 'x' } }]) === null,
    'every PR is an issue to the REST API; closing one as a recovery is not a recovery')

  // The marker has to survive a round trip through the body, or the next run
  // cannot find the issue it just opened and opens another.
  check('the body carries the marker the search looks for',
    body({ sha: 'abc1234def', runUrl: 'https://x/1', failedStep: 'S' }).includes(MARKER))
  check('the body names the commit and the run',
    body({ sha: 'abc1234def', runUrl: 'https://x/1' }).includes('abc1234') &&
    body({ sha: 'abc1234def', runUrl: 'https://x/1' }).includes('https://x/1'))
  check('a missing failing step does not render an empty heading',
    !body({ sha: 'abc1234def', runUrl: 'https://x/1' }).includes('First failing step'))

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const sha = process.env.RED_MAIN_SHA || process.env.GITHUB_SHA || ''
  // GREEN IS READ, NOT INFERRED FROM THE TRIGGER.
  //
  // The first wiring set this from the workflow event: "green unless a failing
  // verify triggered me". That is right for the two event paths it was written
  // for and WRONG for every other one -- the daily 06:33 backstop, a manual
  // dispatch, a `pages` or `drift-sentinel` completion. All of those would have
  // reported green and CLOSED a legitimately open issue while main was still
  // red, which is worse than never opening it: it would look like a recovery.
  //
  // status.mjs already reads verify's real conclusion for main; STATUS.md's
  // first line comes from it. The sentinel reads the same source, so the issue
  // and the file can never disagree.
  const runUrl = process.env.RED_MAIN_RUN_URL || ''
  const failedStep = process.env.RED_MAIN_STEP || ''

  if (!token || !repo) {
    console.log('  no GITHUB_TOKEN or GITHUB_REPOSITORY — nothing to do')
    process.exit(0)
  }

  const verify = await readVerify({ repo, token, head: sha }).catch(e => ({ problem: String(e) }))
  const suite = verdictOf(verify)
  if (suite === 'unreadable') {
    console.log(`  verify's verdict is unreadable: ${verify?.text ?? verify?.problem ?? '(no text)'}`)
    console.log('  doing nothing — an unread verdict is neither a red to report nor a green to close on')
    process.exit(0)
  }
  const green = suite === 'green'

  const api = async (path, init = {}) => {
    const r = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status} ${init.method || 'GET'} ${path}: ${(await r.text()).slice(0, 200)}`)
    return r.json()
  }

  // Match on the MARKER in the body rather than on the title. A title is
  // editable and a label can be removed; the marker is invisible and survives
  // both. Listed rather than searched -- see findSentinel for why the search
  // index is the wrong source for a decision made twice within a minute.
  //
  // Paged with a hard cap: an unbounded `while (true)` over a paginated API is
  // a way to burn a rate limit on a bad response, and 1000 open issues in this
  // repo would be a bigger problem than a missed sentinel.
  let openIssue = null
  for (let page = 1; page <= 10 && !openIssue; page++) {
    const batch = await api(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`)
    openIssue = findSentinel(batch)
    if (!Array.isArray(batch) || batch.length < 100) break
  }

  const verdict = action(green, openIssue)
  console.log(`\n  verify: ${green ? 'green' : 'RED'} on ${sha.slice(0, 7) || '(unknown)'}` +
              ` | sentinel issue: ${openIssue ? `#${openIssue.number} open` : 'none'}` +
              ` | action: ${verdict}\n`)

  if (verdict === 'open') {
    const made = await api(`/repos/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: `main is red — verify failed on ${sha.slice(0, 7)}`,
                             body: body({ sha, runUrl, failedStep }) }),
    })
    console.log(`  opened #${made.number}`)
  } else if (verdict === 'comment') {
    await api(`/repos/${repo}/issues/${openIssue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Still red on \`${sha.slice(0, 7)}\`.\n\n${runUrl}` }),
    })
    console.log(`  commented on #${openIssue.number}`)
  } else if (verdict === 'close') {
    await api(`/repos/${repo}/issues/${openIssue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Green again on \`${sha.slice(0, 7)}\`. Closing.` }),
    })
    await api(`/repos/${repo}/issues/${openIssue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    })
    console.log(`  closed #${openIssue.number}`)
  } else {
    console.log('  nothing to do')
  }
}
