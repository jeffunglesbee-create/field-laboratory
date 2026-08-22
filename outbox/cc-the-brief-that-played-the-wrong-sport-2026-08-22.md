# Outbox — the brief that played the wrong sport

**Date:** 2026-08-22
**Ships:** `Journalism.crossSportTokens` + a fourth brief verdict in
`src/Scoreboard.fs`

## What the card said

EPL · 5, 2026-08-22. Everton v Crystal Palace, a `game_live` brief:

> Everton secured a 2-0 win at Hill Dickinson Stadium, moving to 1-0-0 this season
> while holding Crystal Palace to 0 points through this match. Palace fell to
> 0-0-1 this season after failing to convert 3 shots tonight. **Everton maintains
> a 107.7 DRTG, best in the NBA, despite playing soccer tonight.**

DRTG is Defensive Rating — points allowed per 100 possessions, a basketball
metric. The NBA is a basketball league. The game is association football. The
model wrote its own confusion into the last clause and the desk rendered it
straight.

## Why every existing verdict passed it

The card already carries three verdicts on a brief, and all three were green:

- **scoreline checks out** — "2-0" is consistent with the final. True.
- **answering model not recorded** — provenance, as always. True.
- **1 of 1 stat sentence(s) carry a time window** — "107.7 DRTG … tonight" has a
  time window. True.

Every dimension the desk measured was satisfied by a sentence that claims a
basketball rating for a football club. Nothing was asking whether the brief was
about the right sport at all. That was the gap.

## The fix

A fourth verdict. `Journalism.crossSportTokens (isSoccer) text` returns the
foreign-sport tokens a brief names — non-soccer league labels (NBA, NHL, NFL, MLB,
WNBA, AFL, CFL) and basketball-only rating metrics (DRTG, ORTG). `Scoreboard.fs`
reads the game's own `IsSoccer` from the `Sport` registry — so the check moves
with the model, not a hard-coded list — and renders a red chip when the list is
non-empty:

```
cross-sport reference — this soccer brief names NBA, DRTG
```

Word-boundary matched, so `MLB` does not fire on `MLS` and no acronym is caught
inside a longer word.

## Grounded, not invented

The token list is the desk's own non-soccer league labels plus the two majors the
borrowed vocabulary comes from (NBA, NHL) and the two basketball rating metrics.
A soccer recap has no legitimate reason to name any of them, so a match is
contamination, not a false positive — asserted three ways in
`scripts/journalism-check.mjs`: the Everton brief is caught (NBA + DRTG), a clean
Arsenal recap flags nothing, and an "MLS" mention is not mistaken for "MLB".

Only the soccer direction is modelled, because it is the only one observed. A
basketball brief naming a soccer league is a real possibility, but writing that
case before seeing it would be the invention this repository exists to catch — it
follows `BriefType.Unmodelled` and `Sport.Unrecognised`, added when a brief
exhibits it.

## This is the trust wedge, made concrete

The differentiation note (`outbox/cc-differentiating-on-trust-2026-08-20.md`)
argues the desk's edge over ESPN is that it refuses to render false content as
true. This is that argument as one chip. ESPN would have shown the DRTG sentence
as prose; the desk shows it as **caught**. The relay should also stop generating
it — filed as `docs/CC-CMD-2026-08-22-brief-sport-contamination.md`, which also
names the two sibling defects on the same slate (a live 3-0 called a "0-0-0
stalemate", and a shots-this-match vs goals-this-season comparison). Catching is
not curing; both ship.

## Verified

Build clean, zero F# warnings. `journalism-check` 31/31 (the four new checks
plus the 27 that were already there). `unused-check` passes — `crossSportTokens`
is read by `Scoreboard.fs`. Site assembles (index.html 19,956 bytes). The
render-check weather assertions still fail on `ERR_TUNNEL_CONNECTION_FAILED`
(Open-Meteo is proxy-blocked in this sandbox), unrelated to this change.

## Not changed

- The contradiction defects (2) and (3) above are relay-side and filed, not
  guarded here — a "0-0-0 stalemate" beside a real scoreline is a W-L-D-record vs
  scoreline conflict that would risk false positives to detect generically, and a
  two-window stat comparison is a `FIELD_PROSE_STYLE` question. Modelled when the
  detector for each can be made as clean as this one.
- The inverse direction (a non-soccer brief naming a soccer league). Unobserved.
