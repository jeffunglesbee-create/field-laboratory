// Drives the sentinel's three WRITE paths against the real GitHub API.
//
// WHY THIS EXISTS
//
// `red-main-issue.mjs` has four branches. Exactly one of them -- `none` -- ran
// on a real runner within minutes of shipping (run 33323829305: "verify: green
// on 919e92f | sentinel issue: none | action: none"). The other three write:
// they open an issue, comment on it, and close it. Main has to be RED for any
// of them to execute.
//
// So as shipped, `open`, `comment` and `close` would first run during the
// incident they exist to report, with nobody watching, and a 403 from a missing
// `issues: write` or a `state_reason` GitHub rejects would surface as silence at
// exactly the wrong moment. "It will be proven the next time main breaks" is a
// carry-forward, and Rule 87 calls that a spec failure.
//
// The self-test in red-main-issue.mjs covers these branches against a recording
// fake, which proves the calls are ISSUED. It cannot prove GitHub ACCEPTS them.
// That is a cross-boundary fact, and this repo's own rule says a cross-boundary
// fact is not verified by reading: the fake is a copy of the API, and a copy is
// almost always locally true.
//
// WHAT IT DOES
//
// Three calls to the same `run()` the workflow calls, on a REHEARSAL_MARKER
// that no live sentinel can carry:
//
//   1. red,   nothing open  -> open     then reads the issue back: state open
//   2. red,   that issue    -> comment  then reads it back: still open, +1 comment
//   3. green, that issue    -> close    then reads it back: state closed
//
// Each step asserts against the API's own view, not against `run`'s return
// value -- a function reporting what it believes it did is the thing under test.
//
// It leaves the rehearsal issue CLOSED, and titled so nobody mistakes it for a
// real alert. It never touches the live marker, so a genuinely red main during
// a rehearsal is unaffected.
//
// Usage:  GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node scripts/red-main-rehearsal.mjs

import { createChecks, isMain } from './checks.mjs'
import { MARKER, gh, run, findOpen } from './red-main-issue.mjs'

/// Deliberately NOT a superstring of MARKER. If it contained the live marker,
/// `findOpen(MARKER)` would match the rehearsal issue and a real red main would
/// comment on a rehearsal instead of opening its own alert.
export const REHEARSAL_MARKER = '<!-- red-main-rehearsal -->'

export const isolated = (rehearsal, live) =>
  !rehearsal.includes(live) && !live.includes(rehearsal) && rehearsal !== live

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('THE REHEARSAL MARKER CANNOT BE MISTAKEN FOR THE LIVE ONE',
    isolated(REHEARSAL_MARKER, MARKER),
    'a marker containing the live one would make a real red main comment on a rehearsal')
  check('the detector would catch a superstring',
    isolated(`${MARKER} rehearsal`, MARKER) === false)
  check('...and an identical marker', isolated(MARKER, MARKER) === false)
  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) {
    console.error('needs GITHUB_TOKEN and GITHUB_REPOSITORY')
    process.exit(1)
  }
  check('the rehearsal marker is isolated from the live one', isolated(REHEARSAL_MARKER, MARKER))

  const api = gh(token)
  const opts = { api, repo, marker: REHEARSAL_MARKER, titlePrefix: '[rehearsal, ignore] ',
                 runUrl: 'https://example.invalid/rehearsal' }

  // A leftover from an interrupted rehearsal would make step 1 comment instead
  // of open, and the run would report a pass for the wrong reason.
  const stale = await findOpen(api, repo, REHEARSAL_MARKER)
  if (stale) {
    console.log(`  closing a leftover rehearsal issue #${stale.number} first`)
    await api(`/repos/${repo}/issues/${stale.number}`,
      { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) })
  }

  const read = n => api(`/repos/${repo}/issues/${n}`)

  console.log('\n  1. RED, nothing open')
  const first = await run({ ...opts, green: false, sha: 'rehears1' })
  check('a red main OPENS an issue', first.verdict === 'open' && !!first.issue?.number)
  const n = first.issue.number
  const afterOpen = await read(n)
  check(`GitHub accepted the open — #${n} is state:open`, afterOpen.state === 'open',
    `state is ${afterOpen.state}`)
  check('the body GitHub stored carries the rehearsal marker',
    (afterOpen.body ?? '').includes(REHEARSAL_MARKER))
  check('and it does NOT carry the live marker',
    !(afterOpen.body ?? '').includes(MARKER),
    'a rehearsal that the live sentinel can find is not isolated')

  // THE MEASUREMENT THAT THIS RUN EXISTS TO PRODUCE.
  //
  // Rehearsal 33325017952 opened #6 and then, 400ms later, opened #7 -- the
  // list endpoint had not yet caught up. 33325161310's diagnostic pinned it:
  // three reads at +0/+1000/+2000ms all returned `len:0`, and the issue became
  // visible between +4s and +5s.
  //
  // `run`'s open path now waits for its own write, and this prints how long
  // that took. It is a number, not a "looks right": if the lag ever grows past
  // the 20s bound, `settled` goes false and the assertion below fails.
  console.log(`  the open became visible to the lookup after ${first.settleMs}ms`)
  check('the open settled within the bound', first.settled === true,
    `settleMs ${first.settleMs} — an unsettled open is a duplicate issue on the next run`)

  console.log('\n  2. STILL RED, that issue open')
  const second = await run({ ...opts, green: false, sha: 'rehears2' })
  check('a still-red main COMMENTS rather than opening a second issue',
    second.verdict === 'comment' && second.issue.number === n)
  const afterComment = await read(n)
  check(`GitHub accepted the comment — #${n} has ${afterComment.comments} comment(s)`,
    afterComment.comments >= 1, `comments: ${afterComment.comments}`)
  check('the issue is still open after a comment', afterComment.state === 'open')

  console.log('\n  3. GREEN, that issue open')
  const third = await run({ ...opts, green: true, sha: 'rehears3' })
  check('a recovered main CLOSES it', third.verdict === 'close')
  const afterClose = await read(n)
  check(`GitHub accepted the close — #${n} is state:closed`, afterClose.state === 'closed',
    `state is ${afterClose.state}`)
  check('it carries the recovery comment as well as the still-red one',
    afterClose.comments >= 2, `comments: ${afterClose.comments}`)

  console.log('\n  4. GREEN, nothing open')
  const fourth = await run({ ...opts, green: true, sha: 'rehears4' })
  check('a green main with no open issue does nothing', fourth.verdict === 'none')
  check('the closed rehearsal issue is NOT found again',
    (await findOpen(api, repo, REHEARSAL_MARKER)) === null,
    'a close that the lookup still matches would comment on a closed issue forever')

  console.log(`  the close became invisible to the lookup after ${third.settleMs}ms`)
  check('the close settled within the bound', third.settled === true,
    `settleMs ${third.settleMs} — an unsettled close makes the next run comment on a closed issue`)

  // SWEEP. Not just the issue this run tracked: 33325017952 left #6 AND #7
  // open, because the duplicate it opened was never in a variable to clean up.
  // A rehearsal that leaves its own debris behind is one more thing to do by
  // hand, which is what this whole line of work is removing.
  let swept = 0
  for (;;) {
    const stray = await findOpen(api, repo, REHEARSAL_MARKER)
    if (!stray) break
    await api(`/repos/${repo}/issues/${stray.number}`,
      { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) })
    swept++
    if (swept > 20) break
    await new Promise(r => setTimeout(r, 1500))
  }
  check('the rehearsal leaves no open issue behind',
    (await findOpen(api, repo, REHEARSAL_MARKER)) === null,
    `swept ${swept} stray issue(s)`)

  console.log(`\n  rehearsal issue: ${afterClose.html_url} (closed), ${swept} stray closed\n`)
  process.exit(summarize() === 0 ? 0 : 1)
}
