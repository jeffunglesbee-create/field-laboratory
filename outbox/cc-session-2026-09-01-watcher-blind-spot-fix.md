# The watcher can now see the class it was closing over

2026-09-01. Follows the fixture-identity sweep, which found 51 duplicate groups
this watcher could not see.

## What it was doing

`relay-duplicate-fixture-watch.mjs` groups on `espn_event_id` and skips rows
without one. It is also what auto-closes field-relay-nba#1. So it could report
clean and close the ticket while 51 pairs a day persisted — the fix succeeding
and the instrument being blind produce the same output.

`scanIdentityOnly` adds the missing class, importing `groupsFor` from the probe
rather than reimplementing `sameFixture`. A second copy would drift from the one
the collision probe is mutation-proven against, and a scope it could not see is
this file's whole defect.

The close path now takes `offendersFor(games)` — both groupings. Closing on the
event-id list alone is the behaviour being fixed.

## Three claims in the issue body were false and are corrected

The body it posts said:

- *"Each pair shares one `espn_event_id`"* — not true of the MLS pairs, where one
  row carries an id and the other carries none. Now "These pairs", with a
  section naming the ones it cannot group.
- *"Not seen before 2026-08-30 … 88 game rows with zero duplicated event ids"* —
  the sweep finds collisions from 2026-08-02. One of the four cited captures
  holds **two rows**, and a two-row file was never evidence about that day.
- *"Closes itself on the first run where the payload carries no duplicated event
  id"* — the blind criterion, now both groupings.

Every one of these was posted fresh on each firing, so the correction is to the
generator, not to a past comment.

## Two of my own assertions had no teeth, and mutation found both

| mutation | first run | after the fix |
|---|---|---|
| revert the decision to `dupes` alone | **15/15** | 14/16 |
| drop the `distinct` filter | **15/15** | 15/16 |

**The first was structurally unreachable.** `const offenders = [...dupes, ...blind]`
lived inline in the runner, which the self-test never executes — the one line
deciding whether a real ticket closes was the one line no check could reach.
Exported as `offendersFor`.

**The second was a fixture that dodged the clause.** The doubleheader I wrote
carried two event ids, so `watcherSees` filtered it and `kind !== 'distinct'`
never ran. The case the filter is actually for is two start times and NO event
ids: visible to the identity grouping, and a real doubleheader, so without the
clause it would be reported as an offender and hold the ticket open forever.
Replaced, with its complement — the same pair at one start time must BE an
offender, so the exemption is the differing time and not the missing ids.

## And one written from memory

The closing assertion checked `=== 'comment'`. The imported `decideIssueAction`
returns `'update'`. Replaced with the discriminating pair — the same payload
through both groupings must not produce the same action — which cannot be
satisfied by guessing a name.

16/16.
