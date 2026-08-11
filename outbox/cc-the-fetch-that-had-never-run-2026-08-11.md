# The fetch that had never run — 2026-08-11

Jeff, on the docking in the last commit:

> If something can't run use GitHub actions runner. Cannot be tested isn't a
> valid excuse

The docking was this, verbatim from `5d41454`:

> Docked to 95: the HTTP call in status.mjs has never executed anywhere.
> Everything downstream of it is exercised and the fetch is standard, but that is
> reasoning, not an artifact, and under the corrected rule it is a gap whether or
> not I mention it.

He is right that this was not a limit, it was a choice of where to run it. The
dev sandbox has no route to api.github.com. A runner does, and has the token.

## The call ran, and I didn't have to ask it to

While the last commit's CI was still going, `status.yml` fired twice on its own
and wrote its answer to main:

| status run | commit | "Did the suite pass on main?" |
| --- | --- | --- |
| 31505791630 | `363dd93` | `unknown — the workflow history could not be read` |
| 31506346702 | `4152f64` | `**running** on 5d41454` |

The second line is the artifact the docking asked for. The fetch executed on
`ubuntu-latest`, reached api.github.com, got a run object back, and rendered a
verdict from it — a verdict that would have come out differently had the call
failed, because six minutes earlier it *had*.

## Which is the part worth keeping

Two runs of the same code, minutes apart, answering differently. That is not a
flake, and the reason mattered more than the answer.

`workflow_run` jobs use the workflow **file** from the default branch as of the
triggering event. The first status run fired from an event created before
`5d41454` landed, so it ran the new `status.mjs` under the old `status.yml` —
the version that does not pass `GITHUB_TOKEN`. No token, no read, "unknown".

That is correct behaviour and I could only establish it by comparing two runs'
`head_sha` values against the commit history from outside the repo. Nothing in
the run log, and nothing in `STATUS.md`, said which of four causes it was:

- the token was never passed
- the token was rejected
- the API refused the scope
- the request never reached the network

All four rendered the same sentence. That is a check that answers in one
direction — this repo's most durable bug, arriving for something like the eighth
time — and this instance is worse than most, because the sentence it renders is
the one thing standing between a false "main is green" and nobody noticing.

## What changed

**Every outcome names itself.** `readVerify` returns `{ text, problem }`. A
rejected token says `401`; a scope failure says `403`; a network failure carries
the error; a runner with no token blames the *step* rather than the history; an
empty run list is an answer and not a failure; outside CI it says so and is not a
problem at all. Two assertions state the property directly rather than leaving it
implicit in the seven that check individual shapes: **no two outcomes render the
same line**, and **every problem line says "unreadable"**.

**A read that fails now fails the job.** `status.mjs` writes `STATUS.md` first
and exits 1 after, and the two steps behind it are `if: always()`, so the reason
lands on main instead of only in a run log somebody has to go looking for. A
status file that quietly cannot read history is back to being unable to
contradict anything.

**And the fetch is exercised in both directions, on a runner.**
`scripts/status-live-check.mjs` runs as a `verify.yml` step beside the other live
checks. It calls api.github.com four ways: the real token, a deliberately
corrupted token, a repository that does not exist, and no token at all — and
requires the good read and the bad read to disagree.

That last part is the point. An injected fetch proves the code branches on
`res.ok`. It proves nothing about what api.github.com actually returns for a
malformed bearer token, which is the gap between a fixture and the world, and is
where this session's mistakes have lived. A happy-path-only live check would have
been the same bug in a new place.

It is not in the confidence gate, by the same rule as `check:live`,
`check:pick-live` and `check:pick-shape`: the gate must be deterministic and this
reaches the network. It has no offline mode and does not skip — run without
credentials it fails and says where the offline half lives.

## The second thing the live runs showed

Looking at real runs rather than at fixtures turned up a hole in the branch that
looked harmless.

`verifyVerdict` rendered `**running**` for any run not yet completed. Run
31501321990 (`771cf8e`) has been `in_progress` since 14:24 with `updated_at`
frozen at 14:24:25, and was still live an hour later. `concurrency:
cancel-in-progress` should have ended it when the next commit landed; the API
reports it running regardless.

Had that been main's newest run, this section would have said "running" forever,
and "running" reads as neutral. That is the same softening the row is named
after, arriving through the case I did not think needed a case.

So a run whose last update is older than 45 minutes is **STALLED**, with the
idle time and a link. 45 is chosen against measurement, not taste: verify's
longest run today was 9 minutes end to end and its slowest step 6m37s.

The clock read that requires is captured once as a top-level `NOW` and passed
down, which is the shape `gameStateAt` uses and the rule `row-confidence`
enforces — the discipline that exists because CI run 31456294086 straddled
midnight between two lines.

## The score

Two mutations, 29 and 30, both killed:

- `unreadable-history-swallowed` — set `problem: null` on the rejected-read
  branch. Not hypothetical; it is what `363dd93` shipped.
- `stalled-run-reads-as-running` — disable the idle test.

CONFIDENCE: 95.

Artifacts: `STATUS.md` on `4152f64` carrying `**running** on 5d41454`, written by
status run 31506346702 — the fetch, on a runner, that the last commit was docked
for; `check:status` 23/23 with the eleven new assertions; both new mutations
killed; `check:workflows` 6/6 over the edited workflows; `check:rows` 20/20; the
gate at 460/460, twenty rows, nothing skipped.

Docked to 95: `status-live-check.mjs` has not itself run on a runner at the time
of writing. It is a new file and the run that exercises it is the one this commit
triggers. Its four live calls assert things about what api.github.com returns for
a malformed token that I know from documentation rather than from an artifact —
the `401|403|404` alternation is exactly that uncertainty, written down. Same
class of gap as the one this commit was sent to close, one level up, and it is
subtracted rather than talked around. The runner result goes in the next entry.
