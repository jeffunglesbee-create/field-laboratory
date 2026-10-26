# BSD join probe (2026-10-26)

Question: lineups attach to a game through a BSD event id, and a lab game row carries none.
What joins them? The owner asked whether lineups can attach to every game; the blocker found
on 2026-10-25 is this missing key.

## Premises, and the one command that tests each

| premise | command | status |
|---|---|---|
| Matching names exactly fails on real club names | normalise "Bayern" and "FC Bayern München" | measured: `bayern` against `fcbayernmunchen`, no match |
| The relay serves BSD events by date | read `/bsd/events/by-date` in the relay source | read: pages at 50, `date`, `league_id`, `offset`, `limit` |
| The route returns events for the lab's six soccer leagues on a committed date | the probe, on a runner | UNTESTED until the run below |
| Each event carries both team ids | the probe prints the event's field names and counts events with both ids | UNTESTED until the run below |
| A loose name pair plus kickoff identifies one event | the probe counts strict, loose+kickoff, loose-only, ambiguous, none | UNTESTED until the run below |

## What was built

`scripts/bsd-join-probe.mjs`: a join rule with a self-test (8 cases) and a live measurement over
the two committed dates that hold soccer games (`data/context-2026-08-29.json`,
`data/context-2026-09-05.json`). `.github/workflows/bsd-join-probe.yml`: runs it on a runner
(the authoring sandbox's egress proxy does not reach the relay), triggered by a push to
`outbox/.trigger-bsd-join-probe` so it runs from this branch without being on main first.

The self-test was mutated before it was trusted: making `kickoffNear` always true fails 2 cases;
dropping the four-letter floor on containment fails 1. A third mutation (an `ambiguous` branch)
survived because the branch was redundant (a later check returned the same answer), so the
branch was deleted rather than defended.

## Coverage is printed with every verdict

The probe prints `N of M lab soccer games` for each key and a final `COVERAGE:` line, so a
partial measurement cannot read as complete. It measures two dates; it says so.

## Result

Appended below once the run finishes (`outbox/bsd-join-probe-latest.json` and `.txt` are written
by the runner).
