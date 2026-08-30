# A red main now reaches someone

**Date:** 2026-08-30
**Scope:** `scripts/red-main-issue.mjs` (new), `.github/workflows/status.yml`

## What yesterday's entry left open

`outbox/cc-status-went-quiet-when-it-had-something-to-say-2026-08-29.md` ends:

> It does not notify anyone. It keeps the file that answers the question honest,
> which is the same contract the workflow already had — the file is the surface,
> not a message. Whether a red main should also reach a phone is a separate
> decision with a separate cost, and it is not being made here by implication.

This is that decision, made explicitly.

A red main opens a GitHub issue. A green main closes it.

## Why an issue and not a webhook

A notification needs a channel. This repo's secrets are Cloudflare, the relay,
and a sibling-repo token — none of them a notification endpoint. Adding Slack or
a push service means a new credential to store, rotate and leak, and this
session opened with a PAT sitting in a Drive document.

`GITHUB_TOKEN` already exists in every workflow run. GitHub's own delivery —
watch email, and the mobile app's push where installed — is the channel the
maintainer is already subscribed to. The notification costs no new secret.

The issue is also **stateful**, which a fire-and-forget alert is not. `verify`
ran twelve times on main on 2026-08-29 and was red on three consecutive commits.
Twelve webhook posts would have been three separate messages for one broken
state. An issue is opened once, commented on while the state persists, and
closed when main recovers: one notification per transition, not per push.

### The relay's push channel is deliberately not used

`field-relay-nba` has real web-push infrastructure — `PUSH_SUBS` KV, cron-driven
sends. It would work. Its subscribers are FIELD's readers, who signed up for
sport. Routing a build failure to them would be a category error dressed as
reuse.

## Cost: zero additional runs

`status.yml` already fires on a red `verify` (added yesterday, `10f6187`) and on
`deploy`, which fires only on a green one. Both transitions were already
reaching this job. The sentinel is a step inside it — a few seconds of API
calls, no new workflow, no new schedule, no billable minute that was not already
being spent.

That matters against a budget recorded in the workflow's own header as 90%
consumed with two weeks of the month left.

## Three defects, caught before shipping, each now a fixture

### 1. The trigger is not the verdict

The first wiring derived green-ness from the workflow event: green unless a
failing `verify` triggered the run.

That is correct for the two paths it was written for and wrong for every other
one. On the daily 06:33 backstop, on a manual dispatch, and on a `pages` or
`drift-sentinel` completion the expression reads **true regardless of main's
real state** — so a still-red main would have been reported green and its issue
**closed**. A false recovery is worse than a missing alert: the missing alert
leaves you uninformed, the false one leaves you wrong.

The fix reads verify's real conclusion from `status.mjs`'s `readVerify`, the same
function `STATUS.md`'s first line comes from, so the issue and the file cannot
disagree.

```
PASS  THE TRIGGER IS NOT THE VERDICT: the daily schedule reads as green
PASS  ...and so does a manual dispatch, and a pages completion
```

### 2. `readVerify` returns prose, not a conclusion

Having decided to read the real verdict, the next line written was:

```js
const green = verify.conclusion === 'success'
```

written from memory of what such a function *should* return. `readVerify`
returns `{ text, problem }`. There is no `conclusion` key, so that expression was
`undefined === 'success'` — **false on every run**. It would have opened a
red-main issue on a perfectly green main and then commented on it forever.

This is the repo's own probe-first rule, hit inside the commit that cites it:
the function is the source, and what a function "should" return is a copy.

The replacement matches `readVerify`'s four rendered shapes and keeps three
states, because `!green` collapses two of them:

| text | verdict | why it matters |
|---|---|---|
| `**green** on …` | green | close an open issue |
| `**FAILURE** on …` | red | open or comment |
| `**running** on …` | unreadable | an in-progress run is not a red to report |
| `**STALLED** on …` | unreadable | a stall is not a green to close on |
| any `problem` set | unreadable | a failed read is not a state |

Unreadable does nothing and says so. It is not a pass.

### 3. The search index lags the write that this depends on

The lookup that finds "is there already an open sentinel?" was
`GET /search/issues` with `in:body "<marker>"`. It reads naturally. It is served
from an **index that lags writes**.

The open path and the comment path can fire seconds apart — twelve verify runs
in a day is the measured rate. A lookup that has not yet seen the issue it
opened one run ago returns nothing, and the run opens a **second** issue.
Duplicate alerts for one broken state is precisely the failure the stateful
design exists to avoid, reintroduced by the mechanism meant to prevent it.

`GET /repos/{repo}/issues?state=open` is read-after-write consistent. Probed
before switching: this repo has **0 open issues**, so the scan is one page. It is
paged to a hard cap of 10 rather than an unbounded loop.

That endpoint returns **pull requests too** — every PR is an issue to the REST
API — so a PR quoting this file's marker would have been "closed" as a recovery.
`findSentinel` excludes anything carrying a `pull_request` key.

## Teeth

Both new guards were proven by mutation, not asserted:

```
findSentinel without the pull_request guard   -> 19/20, FAIL on the PR fixture
findSentinel without the `?? null` normaliser -> 17/20, FAIL on three
restored                                      -> 20/20
```

The `?? null` result is the interesting one: dropping it fails *three* checks,
because `undefined` and `null` diverge at `action(green, openIssue)` and an
`undefined` there is a truthy-check away from commenting on an issue that does
not exist.

## The decision table

```
        red  + no open issue  -> open
        red  + open issue     -> comment      (not a twelfth issue)
        green + open issue    -> close
        green + no open issue -> none         (no API call on a normal deploy)
        unreadable            -> none, loudly
```

## Verified

```
node scripts/red-main-issue.mjs --self-test   20/20
npm run check:workflows                        6/6
npm run check:script-orphans                   3/3
npm run check:import-purity                    2/2
npm run check:status                          27/27
```

`red-main-issue.mjs` is reachable from `status.yml`, so it does not enter
`docs/unreachable-scripts.txt`.

## What this does not do

It does not page anyone at 3am, and it has no escalation. GitHub decides how the
issue reaches you, which means the delivery is as loud as your own notification
settings and no louder. That is the right default for a repo whose failure mode
is a stale page, not an outage.

It also does not report *why* main is red — the issue carries the commit, the run
URL, and the failing step name where the workflow provides one. Diagnosis is
still a click into the run log. Making the issue carry the failing assertion
would mean parsing verify's output, which is a second decision with a second
cost, and it is not being made here by implication either.
