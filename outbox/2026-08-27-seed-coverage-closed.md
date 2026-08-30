# The seed-coverage ask, built — and the check's own first live run was wrong

**2026-08-27** · closes `CC-CMD-2026-08-21-archive-seed-coverage` (asks 1 and 2)
· files `CC-CMD-2026-08-27-integrity-leagues-drift`

Built in field-relay-nba: `d026968` (the manifest and both check halves),
`71c56f2` (a shape bug in the live half, found by running it). Full detail in
that repo's `outbox/2026-08-27-seed-coverage-manifest.md`.

## What was open, and why the audit found it

This ask spent four weeks reading as closed. Its status line opened `ASK 3
WITHDRAWN` — true of ask 3, false of the document, with two unbuilt asks in the
same sentence underneath. The CC-CMD status audit earlier today
(`eb016ee`) found it and `scripts/cc-cmd-status-check.mjs` now enforces that a
multi-ask document's status is the status of the DOCUMENT.

## Asks 1 and 2, built

Seven competitions were fetchable, unseeded and undeclared. `atp` and `wta` are
now **excluded** with the golf `-6/-6` archive corruption as in-repo evidence;
`cfb`, `afl` and the three EFL tiers are **undecided**, each with the question
written down and the decision named as a human's.

The offline half is blocking in `deploy.yml`. The live half runs daily against a
**past** date, which is this ask's own correction — its original artifact ("on
2026-08-22 the check flags EPL") encoded a false positive that would have fired
every day forever.

## The check's first live run reported six gaps. All six were false.

Run 33134550309 flagged MLB, WNBA, La Liga, EFL Cup, EFL Trophy and UCL
Qualifying as seeded-but-absent on 2026-08-25. Every one had rows.

`/context/date` returns `games` as an **object** of two arrays — `{regular,
postseason}` — and the check read:

```js
const games = Array.isArray(ctx.games) ? ctx.games : (Array.isArray(ctx) ? ctx : [])
```

which takes the else branch every time. Zero games parsed; every competition
with ESPN fixtures looked like a gap.

**Written from assumption, never probed.** Rule 68 — and committed inside the
check built to catch exactly this defect class. The failure mode is the
dangerous one: a check that misreads its input reports a *universal* failure,
which reads as a discovery rather than a bug. Had the run gone unexamined, the
next session would have inherited "six competitions are not being archived" as a
fact.

Two things fixed it. The shape is now read from two existing consumers rather
than guessed a second time. `scripts/brief-join-capture.mjs:127` reads
`const rows = [...(j.games?.regular ?? []), ...(j.games?.postseason ?? [])]` and
`scripts/drift-check.mjs:100` reads
`return n(j?.games?.regular) + n(j?.games?.postseason)` — both destructure
`games.regular` / `games.postseason`. And the shape is now **asserted**, before
the gap list, so a
payload change fails by name instead of arriving as every competition
simultaneously going missing.

The pattern is this session's third instance of the same thing: the `.ep` unwrap
that made the EPA route "agree" on a field of zeros, the status grep that
measured a marker convention rather than a state, and now a payload read against
a shape nobody checked.

## Found on the way: the gap-detector had the gap

`/integrity/games` carries `LEAGUES_LOCAL`, commented "Mirror
handleJournalismCycle's LEAGUES list". It covers **7 of 21** — blind to all six
UEFA competitions, all four second-tier leagues, and NFL mid-season. Filed as
`CC-CMD-2026-08-27-integrity-leagues-drift` rather than carried forward
(Rule 87 #4). The new check reports the drift and does not fail on it; that
CC-CMD's done condition ends the leniency.

## Residual

The five `UNDECIDED` competitions need a human coverage decision. Not blocked on
code — seeding any of them is one row in the cron's `LEAGUES` table. Until then
the check names them every run, which is the state this ask existed to create.
