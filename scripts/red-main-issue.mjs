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
export const findSentinel = (items, marker = MARKER) =>
  (items ?? []).find(i => !i.pull_request && (i.body ?? '').includes(marker)) ?? null

/** A bound GitHub REST caller. Throws on any non-2xx so a silent 403 cannot read as "no issue". */
export const gh = (token) => async (path, init = {}) => {
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

/**
 * Open issues, paged, until the marker is found.
 *
 * Paged with a HARD CAP rather than `while (true)`: an unbounded loop over a
 * paginated API is a way to burn a rate limit on one bad response, and 1000
 * open issues in this repo would be a bigger problem than a missed sentinel.
 */
export const findOpen = async (api, repo, marker = MARKER) => {
  for (let page = 1; page <= 10; page++) {
    const batch = await api(`/repos/${repo}/issues?state=open&per_page=100&page=${page}`)
    const hit = findSentinel(batch, marker)
    if (hit) return hit
    if (!Array.isArray(batch) || batch.length < 100) return null
  }
  return null
}

/**
 * Wait until the issue list agrees with a write that has already been accepted.
 *
 * MEASURED, NOT ASSUMED. `GET /repos/{owner}/{repo}/issues` is EVENTUALLY
 * CONSISTENT. Rehearsal run 33325161310 opened an issue and then read the list
 * three times over three seconds:
 *
 *     [diag +0ms]    array:true len:0 (empty)
 *     [diag +1000ms] array:true len:0 (empty)
 *     [diag +2000ms] array:true len:0 (empty)
 *
 * The issue appeared between +4s and +5s. The run before it (33325017952) had
 * opened a DUPLICATE because of exactly this: #6, then 400ms later "sentinel
 * issue: none", then #7.
 *
 * That is the same defect that put `/search/issues` here in the first place. I
 * moved off search because its index lags writes, and then asserted -- from
 * memory, not from a probe -- that the list endpoint is read-after-write
 * consistent. It is not.
 *
 * WHY NOT JUST RELY ON THE GAP BETWEEN RUNS. status.yml has
 * `concurrency: group: status, cancel-in-progress: true`, and its jobs measured
 * 13-16s, so two sentinel executions cannot land inside a 5s window today. That
 * is a 2.6x margin resting on one measurement of someone else's replication
 * lag, and it silently disappears if the job ever gets faster. Closing the
 * window where the write happens costs seconds on the rare open/close
 * transition and does not depend on the argument holding.
 */
export const settle = async (api, repo, marker, want, boundMs = 20000, sleep = ms => new Promise(r => setTimeout(r, ms))) => {
  const t0 = Date.now()
  for (;;) {
    const hit = await findOpen(api, repo, marker)
    if ((want === 'present') === (hit !== null)) return { ms: Date.now() - t0, settled: true, hit }
    if (Date.now() - t0 >= boundMs) return { ms: Date.now() - t0, settled: false, hit }
    await sleep(400)
  }
}

/**
 * Decide and act. Returns `{ verdict, issue }`.
 *
 * EXTRACTED SO THE WRITE PATHS CAN BE EXERCISED. As first shipped this was
 * straight-line code inside the `isMain` block, which meant `open`, `comment`
 * and `close` could only ever run when main was genuinely red -- three
 * branches that would first execute in the incident they exist to report, with
 * nobody watching. The green path was proven on a real runner within minutes
 * (run 33323829305: "action: none"); the other three were a carry-forward.
 *
 * `api` is injected rather than constructed here for the same reason.
 */
export const run = async ({ api, repo, green, sha, runUrl, failedStep,
                            marker = MARKER, titlePrefix = '', log = console.log,
                            sleep = ms => new Promise(r => setTimeout(r, ms)) }) => {
  const openIssue = await findOpen(api, repo, marker)
  const verdict = action(green, openIssue)
  log(`\n  verify: ${green ? 'green' : 'RED'} on ${sha.slice(0, 7) || '(unknown)'}` +
      ` | sentinel issue: ${openIssue ? `#${openIssue.number} open` : 'none'}` +
      ` | action: ${verdict}\n`)

  if (verdict === 'open') {
    const made = await api(`/repos/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: `${titlePrefix}main is red — verify failed on ${sha.slice(0, 7)}`,
                             body: body({ sha, runUrl, failedStep, marker }) }),
    })
    log(`  opened #${made.number}`)
    // See `settle`: without this the NEXT run reads a list that does not yet
    // contain this issue and opens another one.
    const seen = await settle(api, repo, marker, 'present', 20000, sleep)
    log(`  visible to the lookup after ${seen.ms}ms${seen.settled ? '' : ' — NOT SETTLED, a duplicate is possible'}`)
    return { verdict, issue: made, settleMs: seen.ms, settled: seen.settled }
  }
  if (verdict === 'comment') {
    await api(`/repos/${repo}/issues/${openIssue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Still red on \`${sha.slice(0, 7)}\`.\n\n${runUrl}` }),
    })
    log(`  commented on #${openIssue.number}`)
    return { verdict, issue: openIssue }
  }
  if (verdict === 'close') {
    await api(`/repos/${repo}/issues/${openIssue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Green again on \`${sha.slice(0, 7)}\`. Closing.` }),
    })
    await api(`/repos/${repo}/issues/${openIssue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    })
    log(`  closed #${openIssue.number}`)
    // The mirror image: a close that the list still reports as open makes the
    // next run comment on a closed issue.
    const gone = await settle(api, repo, marker, 'absent', 20000, sleep)
    log(`  gone from the lookup after ${gone.ms}ms${gone.settled ? '' : ' — NOT SETTLED, a stale comment is possible'}`)
    return { verdict, issue: openIssue, settleMs: gone.ms, settled: gone.settled }
  }
  log('  nothing to do')
  return { verdict, issue: null }
}

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
export const body = ({ sha, runUrl, failedStep, marker = MARKER }) =>
  `${marker}\n\n` +
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

  // THE FOUR BRANCHES, against a RECORDING FAKE.
  //
  // These assert the HTTP calls each verdict issues, which the pure `action`
  // test above cannot: `action` returning 'close' and the close path actually
  // sending a PATCH are two different claims, and the second one is the one
  // that reopens noise or leaves an issue open forever when it is wrong.
  //
  // A fake proves the calls are ISSUED. It cannot prove GitHub accepts them --
  // a missing `issues: write`, a body GitHub rejects, a state_reason it does
  // not know. scripts/red-main-rehearsal.mjs drives the same `run` against the
  // real API for that.
  // The fake models the API's EVENTUAL CONSISTENCY, because a fake that is
  // instantly consistent is a fake of an API that does not exist -- and the
  // duplicate-issue bug lived precisely in the gap between the two. `lagPolls`
  // is how many list reads happen before a write becomes visible.
  const recorder = (openIssues = [], lagPolls = 0) => {
    const calls = []
    let visible = [...openIssues]
    let pending = null, countdown = 0
    const api = async (path, init = {}) => {
      const method = init.method || 'GET'
      calls.push(`${method} ${path.split('?')[0]}`)
      if (method === 'GET' && path.includes('/issues?state=open')) {
        if (pending !== null && countdown-- <= 0) { visible = pending; pending = null }
        return visible
      }
      if (method === 'POST' && /\/issues$/.test(path)) {
        const made = { number: 42, body: JSON.parse(init.body).body }
        pending = [...visible, made]; countdown = lagPolls
        return made
      }
      if (method === 'PATCH') { pending = []; countdown = lagPolls; return { number: 42 } }
      return { number: 42 }
    }
    return { api, calls }
  }
  const drive = async (green, openIssues, lagPolls = 0) => {
    const r = recorder(openIssues, lagPolls)
    const out = await run({ api: r.api, repo: 'o/r', green, sha: 'abc1234def',
                            runUrl: 'https://x/1', log: () => {}, sleep: async () => {} })
    return { ...out, calls: r.calls }
  }
  const sentinelIssue = { number: 7, body: sentinel.body }

  const opened = await drive(false, [])
  check('RED with nothing open POSTs a new issue',
    opened.verdict === 'open' && opened.calls.includes('POST /repos/o/r/issues'))
  check('...and the issue it POSTs carries the marker',
    opened.issue.number === 42 && body({ sha: 'x', runUrl: 'y' }).includes(MARKER))

  const commented = await drive(false, [sentinelIssue])
  check('RED with one open POSTs a COMMENT and no second issue',
    commented.calls.includes('POST /repos/o/r/issues/7/comments') &&
    !commented.calls.includes('POST /repos/o/r/issues'),
    'the twelve-runs-in-a-day case: one issue, not twelve')

  const closed = await drive(true, [sentinelIssue])
  check('GREEN with one open comments THEN patches it closed',
    closed.calls.includes('POST /repos/o/r/issues/7/comments') &&
    closed.calls.includes('PATCH /repos/o/r/issues/7') &&
    closed.calls.indexOf('POST /repos/o/r/issues/7/comments') <
      closed.calls.indexOf('PATCH /repos/o/r/issues/7'),
    'commenting after the close would land on a closed issue and read as a reopening')

  const quiet = await drive(true, [])
  check('GREEN with nothing open WRITES NOTHING',
    quiet.verdict === 'none' && quiet.calls.every(c => c.startsWith('GET ')),
    'every green deploy runs this; a write on that path would be noise per deploy')

  // THE DUPLICATE, as a fixture. Under a lagging list the open path must not
  // return until the issue it just created is visible to the same lookup the
  // next run will use.
  const lagged = await drive(false, [], 3)
  check('THE OPEN PATH WAITS FOR ITS OWN WRITE TO BECOME VISIBLE',
    lagged.settled === true,
    'run 33325017952 opened #6 and then #7 because it did not')
  check('...and it polled the list more than once to establish that',
    lagged.calls.filter(c => c === 'GET /repos/o/r/issues').length >= 4,
    `polled ${lagged.calls.filter(c => c === 'GET /repos/o/r/issues').length} time(s)`)

  // ASSERTED ON THE POLL COUNT, not on `settled`.
  //
  // The first version of this check read `laggedClose.settled === true` alone,
  // and a mutant that deleted the close path's settle entirely -- replacing it
  // with a hardcoded `{ settled: true }` -- passed 29/29. The check was
  // vacuous: it read a field the mutation supplies. The polls are the evidence
  // that a wait actually happened.
  const laggedClose = await drive(true, [sentinelIssue], 3)
  const closePolls = laggedClose.calls.filter(c => c === 'GET /repos/o/r/issues').length
  check('THE CLOSE PATH WAITS FOR THE ISSUE TO DISAPPEAR',
    laggedClose.settled === true && closePolls >= 4,
    `polled ${closePolls} time(s) — a close the list still reports as open makes the next run comment on a closed issue`)

  // Three states again: an unsettled write is REPORTED, not silently accepted.
  const stuck = await settle(async () => [], 'o/r', MARKER, 'present', 0, async () => {})
  check('a write that never becomes visible is reported as unsettled, not as settled',
    stuck.settled === false && stuck.hit === null)

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const sha = process.env.RED_MAIN_SHA || process.env.GITHUB_SHA || ''
  const runUrl = process.env.RED_MAIN_RUN_URL || ''
  const failedStep = process.env.RED_MAIN_STEP || ''

  if (!token || !repo) {
    console.log('  no GITHUB_TOKEN or GITHUB_REPOSITORY — nothing to do')
    process.exit(0)
  }

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
  const verify = await readVerify({ repo, token, head: sha }).catch(e => ({ problem: String(e) }))
  const suite = verdictOf(verify)
  if (suite === 'unreadable') {
    console.log(`  verify's verdict is unreadable: ${verify?.text ?? verify?.problem ?? '(no text)'}`)
    console.log('  doing nothing — an unread verdict is neither a red to report nor a green to close on')
    process.exit(0)
  }

  await run({ api: gh(token), repo, green: suite === 'green', sha, runUrl, failedStep })
}
