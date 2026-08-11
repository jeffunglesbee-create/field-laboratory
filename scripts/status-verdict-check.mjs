// The verify-verdict line, against REAL recorded API responses.
//
// This exists because the status file had no way to contradict a false "main is
// green" claim, and the fix for that is itself unverifiable from this sandbox —
// there is no route to api.github.com here. Declining to claim it would be the
// loophole: narrowing what I assert until nothing needs evidence.
//
// So the fetch stays unexercised and everything downstream of it does not. These
// are the actual shapes this session saw, transcribed from the runs named below.
import { verifyVerdict, readVerify } from './status.mjs'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()
const HEAD = '03063ff0000000000000000000000000000000aa'

// Run 31456294086 — the red one I reported as green.
const failed = {
  head_sha: '73ffdd0000000000000000000000000000000bb', status: 'completed',
  conclusion: 'failure', id: 31456294086,
  html_url: 'https://github.com/x/y/actions/runs/31456294086',
}
const v1 = verifyVerdict(failed, HEAD)
check('a failed run is named in capitals, not softened', /\*\*FAILURE\*\*/.test(v1), v1)
check('...and links the run so it can be opened', /31456294086/.test(v1), v1)
check('...and does not read as green', !/green/i.test(v1), v1)

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

// A run that is still "in_progress" an hour after its last update is stuck, and
// "running" reads as neutral — the softening this row exists to prevent, through
// the one branch that looked harmless. Run 31501321990 is the real instance:
// in_progress since 14:24, updated_at frozen at 14:24:25, still live at 15:22.
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

process.exit(summarize() === 0 ? 0 : 1)
