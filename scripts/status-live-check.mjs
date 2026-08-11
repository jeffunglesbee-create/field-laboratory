// The GitHub-API read, executed for real, on a runner, in BOTH directions.
//
// WHY THIS FILE EXISTS
//
// Commit 5d41454 shipped the read and I docked it to 95 with this reason: "the
// HTTP call in status.mjs has never executed anywhere. Everything downstream of
// it is exercised and the fetch is standard, but that is reasoning, not an
// artifact." The standing instruction is that "cannot be tested" is not a valid
// excuse when a runner exists — a runner has the token and the egress this
// sandbox does not, so the call runs here.
//
// WHY IT ASSERTS THE FAILING DIRECTION TOO
//
// A happy-path-only version would repeat this repo's most persistent bug: a
// check that answers in one direction. `outboxToday` passed on any dated file;
// `zone-check` passed on a broken build; the status read itself said "unknown"
// for a missing token, a 401, a DNS failure and an empty repo alike. So this
// sends a KNOWN-BAD token as well as the real one, and requires the two answers
// to differ in the way the classification says they will.
//
// The bad-token case is the one that could not be simulated: an injected fetch
// proves the code branches on `res.ok`, and proves nothing about what
// api.github.com actually returns for a malformed bearer token. That is the gap
// between a fixture and the world, and it is where this session's mistakes have
// lived.
//
// NOT part of the confidence gate, by the same rule as the other LIVE checks:
// the gate must be deterministic, and this reaches the network. It runs as a
// verify.yml step beside `check:live`, `check:pick-live` and `check:pick-shape`.
//
// Usage:  node scripts/status-live-check.mjs      (requires GITHUB_TOKEN)

import { readVerify } from './status.mjs'
import { createChecks } from './checks.mjs'

const { check, summarize } = createChecks()

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY

// Absent credentials are a FAILURE here, not a skip. A skip is how a check that
// never runs goes on reporting green — and this one exists precisely because the
// step it covers ran once without a token and said nothing.
if (!token || !repo) {
  console.error('\n  status-live-check needs GITHUB_TOKEN and GITHUB_REPOSITORY.')
  console.error('  It is meant to run on a GitHub Actions runner; there is no offline mode.')
  console.error('  The offline half of this coverage is scripts/status-verdict-check.mjs.\n')
  process.exit(1)
}

console.log(`\n  Reading verify history for ${repo} from api.github.com\n`)

// 1. The real thing. This is the call that had never executed.
const real = await readVerify({ token, repo, head: process.env.GITHUB_SHA || '', inCI: true })
console.log(`  real token   -> ${real.text}`)
check('the live read succeeds against api.github.com', real.problem === null, JSON.stringify(real))
check('...and returns a verdict, not a placeholder',
  /\*\*(green|running|FAILURE|CANCELLED|TIMED_OUT|STARTUP_FAILURE|ACTION_REQUIRED|NEUTRAL|SKIPPED)\*\*/.test(real.text)
  || /no verify run/.test(real.text), real.text)

// 2. A token the API will reject. Proves the failing branch on the real service
//    rather than on a fixture that agrees with my reading of the docs.
const bad = await readVerify({ token: `${token}-not-a-real-token`, repo, head: '', inCI: true })
console.log(`  bad token    -> ${bad.text}`)
check('a rejected token is reported as a problem', bad.problem !== null, JSON.stringify(bad))
check('...and says unreadable rather than reading as green',
  /unreadable/.test(bad.text) && !/green/i.test(bad.text), bad.text)
check('...and names the HTTP status the API really returned', /\b(401|403|404)\b/.test(bad.text), bad.text)

// 3. A repository that does not exist. GitHub answers 404 for both "absent" and
//    "not visible to this token", and either way the point holds: the read fails
//    loudly instead of falling through to a blank verdict.
const missing = await readVerify({ token, repo: `${repo}-does-not-exist`, head: '', inCI: true })
console.log(`  missing repo -> ${missing.text}`)
check('an unreachable repository is a problem', missing.problem !== null, JSON.stringify(missing))

// 4. No token at all, on a runner. The exact condition status run 31505791630
//    hit, which produced "unknown" and no explanation.
const none = await readVerify({ token: '', repo, head: '', inCI: true })
console.log(`  no token     -> ${none.text}`)
check('a runner with no token blames the step, not the history',
  none.problem !== null && /GITHUB_TOKEN/.test(none.text), none.text)

// The property, stated once: the good read and the bad read must not agree.
check('the successful and rejected reads say different things', real.text !== bad.text,
  `both said: ${real.text}`)

process.exit(summarize() === 0 ? 0 : 1)
