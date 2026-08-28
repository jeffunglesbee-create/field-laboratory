# CFB modelled, two days before it can be observed

**2026-08-27** · `src/Desk.fs` · pairs with field-relay-nba `c52f496`

## What changed

Three lines of substance: a `CFB` case in the `Sport` DU, its registry entry
(`Label = "CFB"`, `Matchup = AwayAtHome`, `IsSoccer = false`, `Modelled = true`),
and `| "CFB" -> Sport.CFB` in `sportOfString`.

`npm run check:proof` — **71/71 against the real F# compiler**, including case 71,
*"adding a Sport case without the registry does not compile"*. That assertion is
why this is three lines and not a hunt: the compiler forced the registry entry.
`npm run check` — 17/17.

## This breaks the repository's own rule, deliberately, and here is the argument

Every other entry in that registry refuses to model a competition it has not
seen. UFL's `Omission` states it plainly: modelling from a family resemblance
"would be an inference about a competition this repo has no observation of — the
same move CC-CMD-2026-08-20-uefa-club-competitions declined for the UEFA labels
while their archive count was zero." EPL's own case comment records the opposite
path: *"First observed live on 2026-08-21 — Arsenal v Coventry at the Emirates
rendered on the desk under 'EPL · UNMODELLED SPORT'."*

CFB has been observed by nothing here, because it could not be. It sat in
`V2_LEAGUES` since 2026-07-03 with no `LEAGUES` row, so `/context/date` never
carried a college game and never would have. **The rule "model on first
observation" and the absence of any path to a first observation formed a closed
loop.** The relay row (`c52f496`) breaks the loop; this entry is the other half.

The difference from UFL is not that CFB feels safer. It is that the observation
is **scheduled** rather than hypothetical:

| | CFB | UFL |
|---|---|---|
| seeded | yes, `c52f496`, label declared before any row | no |
| first slate | **2026-08-29**, 8 FBS games, already counted on ESPN by `scripts/cfb-volume-probe.mjs` | none scheduled |
| convention evidence | the client renders CFB through the same generic path as NFL; the relay's `adaptESPNFootball` handles both leagues with one adapter | none — the NFL/CFL family resemblance is the whole case |

Waiting for 2026-08-29 would mean rendering a real slate as "CFB · UNMODELLED
SPORT" for a rule whose purpose — do not invent a convention for a competition
nobody has seen — is already met.

## The check that makes this falsifiable rather than a claim

The label. `Matchup = AwayAtHome` is well-evidenced; `Label = "CFB"` is a
contract with the relay, and contracts are where this project's failures live.

If the archive serves anything but `"CFB"`, the drift sentinel reports
`unmodelled: CFB` within a day — exactly as it reported `unmodelled: NFL, CFL,
golf` on 2026-08-14 and 08-15. No case fold and no `"College Football"` alias:
that string is a section **heading** in jubilant-bassoon, never a sport key (its
`_sport` is the lowercase slug `cfb`), and accepting a spelling the archive has
never served is how a normaliser starts.

## An error worth recording: three overlapping `check:proof` runs

`scripts/proof-check.mjs` injects proof code into sources and restores them
after. I backgrounded one run, then started a second while the first was live,
then a third. The first was still running twenty minutes later with
`src/Scoreboard.fs` moved aside mid-injection; the second refused to start
(*"contains injected proof code and no backup exists"*), and I twice "restored"
the file while the first run re-injected behind me.

Compounding it, three diagnostic commands ran in `field-relay-nba` because the
shell's cwd had not moved — so I read the relay's `git status` and concluded
things about the laboratory, including briefly believing this edit had been
wiped. It had not.

**`check:proof` and `check:mutation` mutate the working tree and must never be
backgrounded or overlapped.** The same lesson was already recorded earlier today
for `check:mutation`, which stranded `__proof18` in `Scoreboard.fs`. Recording it
again because I did not apply it.
