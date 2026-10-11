// The verify-verdict line, against REAL recorded API responses.
//
// This exists because the status file had no way to contradict a false "main is
// green" claim, and the fix for that is itself unverifiable from this sandbox —
// there is no route to api.github.com here. Declining to claim it would be the
// loophole: narrowing what I assert until nothing needs evidence.
//
// So the fetch stays unexercised and everything downstream of it does not. These
// are the actual shapes this session saw, transcribed from the runs named below.
import { verifyVerdict, stepClause, readVerify, readLiveCheck, verifyRunsUrl, liveCheckRunsUrl } from './status.mjs'
import { createChecks, finish } from './checks.mjs'

const { check, summarize } = createChecks()
const HEAD = '03063ff0000000000000000000000000000000aa'

// Run 31456294086 — the red one I reported as green.
const failed = {
  head_sha: '73ffdd0000000000000000000000000000000bb', status: 'completed',
  conclusion: 'failure', id: 31456294086,
  html_url: 'https://github.com/x/y/actions/runs/31456294086',
}
const green0 = { head_sha: HEAD, status: 'completed', conclusion: 'success', id: 1, html_url: '' }
const v1 = verifyVerdict(failed, HEAD)
check('a failed run is named in capitals, not softened', /\*\*FAILURE\*\*/.test(v1), v1)
check('...and links the run so it can be opened', /31456294086/.test(v1), v1)
check('...and does not read as green', !/green/i.test(v1), v1)

// ── the failing step, and the three states of knowing it ────────────────────
//
// The measurement existed and could not be read: `run-steps.mjs` computed the
// failing step and its skip tail, and the only importer was `red-main-issue`,
// so it landed in a private issue and never in STATUS.md. Twice in two days a
// session hit a red main, confirmed the cascade was correct, and could not name
// the step.
//
// Each state is asserted for what it SAYS, not just that it differs — a check
// that only compares renderings passes when both are wrong.

const summary = { total: 30, ran: 3, skipped: 27, failedStep: 'Doc citations are anchored', failedNumber: 3 }
const known = verifyVerdict(failed, HEAD, null, summary)
check('a red verdict names the failing step', /Doc citations are anchored/.test(known), known)
check('...and says how much is hidden behind it', /27 of 30 steps did not run/.test(known), known)
check('...and still links the run', /31456294086/.test(known), known)

// STATE 2 — looked up, unreadable. The one the mutation targets.
const unknown = verifyVerdict(failed, HEAD, null, null)
check('an unreadable step list SAYS so', /failing step unknown/.test(unknown), unknown)
check('...and NEVER prints a zero skip count', !/\b0 of\b|\b0 steps\b|0 skipped/.test(unknown), unknown)
check('...and is not silently identical to a known-clean run',
  unknown !== verifyVerdict(failed, HEAD, null, { ...summary, skipped: 0 }), unknown)

// STATE 3 — no lookup attempted. A green run has no step to not-know, and the
// daily backstop has no triggering run to read.
const nolookup = verifyVerdict(failed, HEAD, undefined, undefined)
check('no lookup attempted omits the clause entirely',
  !/failing step/.test(nolookup) && !/did not run/.test(nolookup), nolookup)
check('a green run carries no step clause', !/failing step/.test(verifyVerdict(green0, HEAD)), '')

// STATE 4 — the mixed case: a job that failed with no step marked failure
// (cancellation, runner loss) still has a real tail.
const mixed = verifyVerdict(failed, HEAD, null, { total: 44, ran: 0, skipped: 44, failedStep: null, failedNumber: null })
check('a failed job with no named step still reports its tail',
  /failing step unknown/.test(mixed) && /44 of 44 steps did not run/.test(mixed), mixed)

// And the clause in isolation, so a template change cannot hide a state change.
check('clause: nothing skipped says so rather than going silent',
  / — nothing was skipped behind it/.test(stepClause({ total: 5, ran: 5, skipped: 0, failedStep: 'X', failedNumber: 1 })),
  stepClause({ total: 5, ran: 5, skipped: 0, failedStep: 'X', failedNumber: 1 }))
check('clause: a non-numeric skip count is unknown, not zero',
  /skip tail could not be read/.test(stepClause({ total: 5, failedStep: 'X', skipped: undefined })),
  stepClause({ total: 5, failedStep: 'X', skipped: undefined }))
check('clause: undefined and null are DIFFERENT renderings',
  stepClause(undefined) !== stepClause(null), `${JSON.stringify(stepClause(undefined))} vs ${JSON.stringify(stepClause(null))}`)

// Run 31501321990 — green, and it IS head.
const green = { head_sha: HEAD, status: 'completed', conclusion: 'success', id: 1, html_url: '' }
const v2 = verifyVerdict(green, HEAD)
check('a green run on HEAD says green', /\*\*green\*\*/.test(v2), v2)
check('...without a stale warning', !/not `main` HEAD/.test(v2), v2)

// Green, but for an older commit — the case that would let a stale pass stand in
// for the current one.
const stale = { head_sha: '20cee99000000000000000000000000000000cc', status: 'completed',
                conclusion: 'success', id: 2, html_url: '' }
const v3 = verifyVerdict(stale, HEAD)
check('a green run on an OLDER commit says so', /not `main` HEAD/.test(v3), v3)

const running = { head_sha: HEAD, status: 'in_progress', conclusion: null, id: 3, html_url: '',
                  updated_at: '2026-08-11T15:12:53Z' }
check('an in-progress run is not reported as either', /\*\*running\*\*/.test(verifyVerdict(running, HEAD)),
  verifyVerdict(running, HEAD))

// A run still "in_progress" an hour after its last update is not news, and
// "running" reads as neutral — the softening this row exists to prevent, through
// the one branch that looked harmless.
//
// Run 31501321990 is the real instance, and not for the reason I first gave. It
// COMPLETED SUCCESSFULLY at 14:40:55; the runs endpoint reported it in_progress
// with updated_at frozen at 14:24:25 for ninety minutes after that. The stale
// answer is on the endpoint this section reads, so the file would have withheld
// a true green rather than masked a red — both are the reader being told
// something untrue.
const fresh = verifyVerdict(running, HEAD, new Date('2026-08-11T15:20:00Z'))
check('a run that started minutes ago still reads as running', /\*\*running\*\*/.test(fresh), fresh)

const stalled = verifyVerdict(running, HEAD, new Date('2026-08-11T16:20:00Z'))
check('a run stuck for an hour is called stalled, not running',
  /\*\*STALLED\*\*/.test(stalled) && !/\*\*running\*\*/.test(stalled), stalled)
check('...and says how long, and names the run', /67 minutes/.test(stalled) && /run 3/.test(stalled),
  stalled)

// A cancelled run is not a pass. This is the conclusion that reads most like
// "nothing wrong happened" and is not a success.
const cancelled = { head_sha: HEAD, status: 'completed', conclusion: 'cancelled', id: 4, html_url: '' }
check('a cancelled run is not reported as green',
  !/green/i.test(verifyVerdict(cancelled, HEAD)), verifyVerdict(cancelled, HEAD))

// --- and WHY it could not be read -------------------------------------------
//
// Everything above assumes the read succeeded. The read failing used to produce
// one sentence for every cause there is, and that sentence then appeared on main
// for real — commit 363dd93, with nothing anywhere saying which cause it was.
//
// Each of these is a shape the API can actually hand back. `fetchImpl` is
// injected, so this stays offline and deterministic; scripts/status-live-check.mjs
// runs the same function against api.github.com on a runner.
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})
const never = async () => { throw new Error('the injected fetch must not be called') }

const r1 = await readVerify({ token: '', repo: 'x/y', head: HEAD, inCI: true, fetchImpl: never })
check('a runner with no token says the STEP is misconfigured', /GITHUB_TOKEN/.test(r1.text), r1.text)
check('...and reports it as a problem', r1.problem !== null, JSON.stringify(r1))

const r2 = await readVerify({ token: '', repo: '', head: HEAD, inCI: false, fetchImpl: never })
check('outside CI it says so and is NOT a problem', r2.problem === null && /outside CI/.test(r2.text),
  JSON.stringify(r2))

const r3 = await readVerify({ token: 't', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com') } })
check('a network failure names the error', /ENOTFOUND/.test(r3.text), r3.text)
check('...and is a problem', r3.problem !== null, JSON.stringify(r3))

const r4 = await readVerify({ token: 'bad', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => reply(401, {}) })
check('a rejected token names the status code', /401/.test(r4.text), r4.text)
check('...and is a problem, not an absence of news', r4.problem !== null, JSON.stringify(r4))

const r5 = await readVerify({ token: 't', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => reply(403, {}) })
check('a permissions failure is distinguishable from a rejected token',
  /403/.test(r5.text) && !/401/.test(r5.text), r5.text)

const r6 = await readVerify({ token: 't', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => reply(200, { workflow_runs: [] }) })
check('an empty run list is an ANSWER, not a failure', r6.problem === null && /no verify run/.test(r6.text),
  JSON.stringify(r6))

const r7 = await readVerify({ token: 't', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => reply(200, { workflow_runs: [failed] }) })
check('a successful read of a FAILED run still reads as failed',
  /\*\*FAILURE\*\*/.test(r7.text) && r7.problem === null, JSON.stringify(r7))

// The distinctness assertion, stated as one thing rather than left implicit in
// the seven above: no two causes may render the same line. That is the property
// the old single `catch` broke, and the one a future edit would break again by
// reaching for a shared fallback string.
const texts = [r1, r3, r4, r5, r6, r7].map(r => r.text)
check('no two outcomes render the same line', new Set(texts).size === texts.length,
  texts.join('\n      '))

// And none of them may be silent about failing. A problem that renders prose
// without the word the reader scans for is the softening this row exists to
// prevent.
check('every problem line says it is unreadable',
  [r1, r3, r4, r5].every(r => /unreadable/.test(r.text)),
  [r1, r3, r4, r5].map(r => r.text).join('\n      '))

// --- live-check reads the same way, on its own workflow ---------------------
//
// The surfacing that was missing while live-check sat red for a day. It shares
// readVerify's classification (via readWorkflowConclusion), so the only things
// that need their own evidence are: it reads the live-check workflow, not
// verify's; and its "no run yet" line names live-check, not verify.
check('live-check reads a different workflow than verify',
  verifyRunsUrl('x/y').includes('verify.yml') &&
  liveCheckRunsUrl('x/y').includes('live-check.yml') &&
  verifyRunsUrl('x/y') !== liveCheckRunsUrl('x/y'),
  `${verifyRunsUrl('x/y')} vs ${liveCheckRunsUrl('x/y')}`)

const lc1 = await readLiveCheck({ token: 't', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => reply(200, { workflow_runs: [failed] }) })
check('a FAILED live-check run reads as failed, named and linked',
  /\*\*FAILURE\*\*/.test(lc1.text) && /31456294086/.test(lc1.text) && lc1.problem === null,
  JSON.stringify(lc1))

const lc2 = await readLiveCheck({ token: 't', repo: 'x/y', head: HEAD, inCI: true,
  fetchImpl: async () => reply(200, { workflow_runs: [] }) })
check('an empty live-check list says live-check, not verify',
  /no live-check run/.test(lc2.text) && lc2.problem === null,
  JSON.stringify(lc2))

const lc3 = await readLiveCheck({ token: '', repo: '', head: HEAD, inCI: false, fetchImpl: never })
check('live-check outside CI is not a problem, same as verify',
  lc3.problem === null && /outside CI/.test(lc3.text), JSON.stringify(lc3))

finish(summarize())
