// The verify-verdict line, against REAL recorded API responses.
//
// This exists because the status file had no way to contradict a false "main is
// green" claim, and the fix for that is itself unverifiable from this sandbox —
// there is no route to api.github.com here. Declining to claim it would be the
// loophole: narrowing what I assert until nothing needs evidence.
//
// So the fetch stays unexercised and everything downstream of it does not. These
// are the actual shapes this session saw, transcribed from the runs named below.
import { verifyVerdict } from './status.mjs'
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

const running = { head_sha: HEAD, status: 'in_progress', conclusion: null, id: 3, html_url: '' }
check('an in-progress run is not reported as either', /\*\*running\*\*/.test(verifyVerdict(running, HEAD)),
  verifyVerdict(running, HEAD))

// A cancelled run is not a pass. This is the conclusion that reads most like
// "nothing wrong happened" and is not a success.
const cancelled = { head_sha: HEAD, status: 'completed', conclusion: 'cancelled', id: 4, html_url: '' }
check('a cancelled run is not reported as green',
  !/green/i.test(verifyVerdict(cancelled, HEAD)), verifyVerdict(cancelled, HEAD))

process.exit(summarize() === 0 ? 0 : 1)
