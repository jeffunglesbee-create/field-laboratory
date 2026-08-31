# "(no card / no kind)" was two failures wearing one string

**Date:** 2026-08-31
**Scope:** `scripts/brief-phase-live-check.mjs`

`live-check` has been RED since `af7483d`, and I did not notice for two commits.
I checked CI after `e3ec02e`, saw green, and did not re-check after the next two
pushes. `deploy`, `verify` and `guards` were green throughout, so the run list
read as healthy at a glance.

```
FAIL  every final game with both phases shows its after-play brief (36 testable)
      → Dallas @ St. Louis: expected game_recap, shown (no card / no kind)
```

35 of 36 pass. One row fails, and **the message cannot say why.**

## The collapse, in a check written to catch collapses

`(no card / no kind)` is one string for two different failures:

- **the desk did not render that game** — a bug in the app
- **the desk rendered it and this matcher did not find it** — a bug in this file

Opposite fixes. The run reported neither, and I could not tell them apart from
the log. That is the sixth instance of this shape this session, and this time it
is in a check I wrote three days ago specifically to test a rendering claim
end-to-end.

## Split, with the row carrying its own evidence

Three states now:

```
(card found, NO KIND rendered)
(NO EXACT MATCH; page has: "…", "…")
(NOT RENDERED — no card on the page shares a word with either team)
```

When nothing matches exactly, the row prints the closest team lines the page
actually rendered. The next run diagnoses itself without anyone opening a
browser.

**The verdict still uses exact substring matching.** Loosening it would make the
check agree with the page more often without anyone learning why it disagreed,
which is how a red turns into a shrug. Normalisation is for the diagnostic only.

## A second finding, counted and not asserted on

The 2026-08-30 payload carried the same fixture **twice**, under two naming
conventions:

```
Lynx @ Dream                          game_recap    game_recap
Minnesota Lynx @ Atlanta Dream        game_recap    game_recap
Sparks @ Storm                        game_recap    game_recap
Los Angeles Sparks @ Seattle Storm    game_recap    game_recap
```

47 games, 281 briefs, 47 cards — and four of the 36 testable rows are two
fixtures counted twice. A duplicate inflates the population and lets one card
satisfy two rows.

That is relay-side, not this repo's bug, so it is **counted and printed, never
asserted on**. Failing here for the relay's naming would be the same mistake as
failing a sibling repo for installing a skill.

## What is not being done

I am not guessing the fix for `Dallas @ St. Louis`. The sandbox cannot reach
`*.workers.dev`, so the payload is not readable from here, and choosing between
"MLS is not rendered" and "my matcher misses `FC Dallas` / `St. Louis City`" by
plausibility is the rationalisation Rule 77 forbids. The next `live-check` run
prints which it is.

## Verified

```
node scripts/brief-phase-live-check.mjs --self-test   11/11
npm run check:import-purity                            2/2
```

Five of those eleven are new, on the helpers the diagnostic uses — including
that `FC` is not a token, because a two-letter token would make every club match
every club and print confident nonsense as the nearest card.

---

## Round two: the split answered it, and eliminated both hypotheses

Run `33354621508`, on the deployed `8b647bd`:

```
Dallas @ St. Louis: expected game_recap, shown (card found, NO KIND rendered)
```

Not "the desk did not render it" and not "this matcher missed the card."
**Both are wrong.** The desk renders the game, this file finds its card, and the
card carries no brief — while the payload carries a `game_recap` that
`expectedKind` resolved to that same game.

So the divergence is between **two implementations of one rule**: this file's
`briefMatches`, transcribed independently, and `briefKeyMatches` in
`src/Desk.fs`. That is exactly what this check's own header says it exists to
catch:

> the expectation is written independently and a divergence between the two is a
> real finding.

The duplicate-fixture note also fired, confirming the second observation:

```
NOTE: 2 fixture(s) appear more than once in the payload under
different naming conventions: lynx|dream x2, sparks|storm x2
```

## Reading the two matchers side by side did not find it

They look equivalent. The `espn:` prefix strip is the same operation in both.
`usable = briefs |> List.filter hasText` is the same non-empty-text filter this
file applies. Nothing in either explains a brief that resolves here and not
there.

Continuing to read source until a difference appears is the guessing Rule 77
forbids, and the sandbox cannot reach `*.workers.dev` to look at the payload.

## So the row prints the keys instead

On any failing row: `game.id`, `espn_event_id`, `finalized_at`, `sport`, every
brief this file resolved to that game with its `game_id` and type, and the
card's own `teams` / `status` / `kind`.

One `live-check` run returns the keys both sides are matching on. That is the
third round of the same discipline — narrow the state, print the evidence, do
not name a cause the data has not named.
