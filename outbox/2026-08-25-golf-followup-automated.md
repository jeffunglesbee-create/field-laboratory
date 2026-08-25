# The golf/tour ask, and the probe that will close it

**2026-08-25.** Companion to `outbox/cc-session-2026-08-25-non-contest.md`.

## Relay side — BUILT, `218ede4`

`docs/CC-CMD-2026-08-25-golf-sport-label.md` steps 1–3 are done. The archive
catch-up no longer writes `sport='PGA Tour'`: `individual:true` on the LEAGUES
entry, carried into `gameMeta`, gated at the write. Guard is
`scripts/check-individual-sports-not-archived.mjs`, a deploy gate.

Step 4 — deleting the historical bad rows — is **untouched and needs human
approval**. It is not being done unasked.

## Laboratory side — the follow-up is automated, not carried forward

A new entry in `scripts/cc-cmd-followup.mjs`, which the drift sentinel runs
twice daily. It reads `/context/date/{yesterday}` and reports `stopped` the day
the ask holds.

**The denominator is the whole design.** "No `sport='PGA Tour'` row today"
proves nothing on a week with no tournament, which is most weeks. A
`sport='golf'` row on the same date is the evidence that a tournament ran and
the walker had something to mislabel. Without it this ask would read green from
absence through the entire off-season — the claim-from-no-data this file was
written against.

## My predicate had a hole, and its own self-test found it

First version:

```js
const { golf, tour } = golfRowCounts(j)
if (golf === 0) return null
return tour === 0
```

A payload carrying the walker's row and **no golf row beside it** returns
`null` — the defect hiding behind its own missing denominator. A mislabelled row
is itself proof a tournament ran, so it has to be read before the denominator:

```js
if (tour > 0) return false
if (golf === 0) return null
return true
```

The self-test case that caught it exists because that is the shape nobody would
think to check by hand. `cc-cmd-followup --self-test` is 48/48, up from 44.

## Verify

```
node scripts/cc-cmd-followup.mjs --self-test     # 48/48, no network
node scripts/cc-cmd-followup.mjs                 # HTTP 403 in a sandbox; CI has egress
```

The 403 is the documented sandbox condition (`*.workers.dev` blocked at the
proxy), and the script exits non-zero on it deliberately: "could not tell" is a
broken probe, and a probe nobody notices is broken is how a follow-up quietly
stops following up.

## Unblock criteria (Rule 74)

- **Blocked on:** one journalism cycle past a date carrying a `sport='golf'`
  row, after `218ede4` deployed.
- **Verify:** the drift-sentinel log prints
  `::notice::CLEAN THIS RUN CC-CMD-2026-08-25-golf-sport-label`.
- **Then:** `Sport.PGATour` can be deleted from `src/Desk.fs` and
  `Program.fs:195`'s "sides not named" wording revisited — both gated on the
  rows actually stopping, both named in that case's own `Omission` text.

---

## The archive DELETE: recommendation is against

Step 4 of the filed CC-CMD proposed deleting the historical
`sport='PGA Tour'` rows and waited for approval. Recommending **no**.

The rows are inert. They carry `home = null`, so `gameDecoder`'s
`Required.Field "home"` refuses them and they land in `DeskPayload.Unnamed` —
counted on the page, never rendered as a game. They are the reason `Unnamed`
exists at all: `Desk.fs`'s own comment cites the 2026-08-13 live-check failure
where one of these rows took a nineteen-game slate down, and the counter built
in response is doing its job.

Against that: a DELETE on `regular_season_games` is irreversible, has no dry-run
in that path, and its only benefit is a tidier `Unnamed` figure. The archive is
the record of what the relay actually did, and these rows are part of that
record — including the record of the defect. Deleting them removes the evidence
that the CC-CMD was ever needed.

The proposal stays in the document with the exact narrow predicate, in case the
call goes the other way. Note it must be `sport = 'PGA Tour'` and not
`LIKE '%PGA%'`: the `league` column carries a legitimate `'PGA Tour'` on every
correct golf row, so the loose form would delete the good data and leave the bad.
