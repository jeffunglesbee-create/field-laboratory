# Outbox — stage 1 of journalism in the UI: the card turns to the brief

**Date:** 2026-08-19
**Ships:** `Desk.briefKeyMatches` / `briefsByGame`, a flip on the desk card in
`src/Scoreboard.fs`, flip CSS, `data/context-briefs-fixture.json`,
`scripts/brief-flip-check.mjs`, two mutations

## What this is

The first place any of the journalism work becomes visible on the page. A game
card whose game has a joined brief turns, on tap, to reveal the prose production
wrote for it. Everything else in the plan — the scoreline verdict, provenance,
anchoring, the aggregate tab — builds on this join.

## The finding that made it small

The live `/context/date` payload **already decodes a `Briefs` section**
(`Desk.fs`, the decoder at line ~724). Every brief carries `Text`,
`QualityScore`, `Model`, `GameId`, `BriefType`, `WordCount`. It was parsed and
thrown away — `payload.Briefs` was referenced exactly once, in the decoder.

So stage 1 fetches nothing and generates nothing. It renders a decode that was
already happening and joins it to the cards already on screen.

## The join is the seven-scheme problem again

`brief.game_id` is not one identifier. `game.Id` is a slug
(`MLB_2026-08-01_athletics_tigers`); `brief.game_id` on the same game is the
ESPN number (`761703`), which matches `game.EspnEventId`. This is exactly the
column `scripts/game-id-scheme.mjs` found holds seven key spaces.

`briefKeyMatches` resolves the two that address a game row on this desk — the
game's own id and its ESPN id, stripping an `espn:` prefix. The ordinals (`g32`)
and external provider ids (`afl_38670`) address nothing here and correctly
return no match, which is the honest "no brief on this card" state rather than a
wrong pairing. The full census stays in the JS script; a comment on each side is
the only link the F#/JS boundary allows.

## The flip is a disclosure, not an effect

The card is a WAI-ARIA disclosure `button` with `aria-expanded`, `aria-controls`
naming the brief region, and Enter/Space activation. A screen reader hears
"expanded/collapsed", not "flipped". The `rotateY` is how it looks; the ARIA is
what it means.

Height: the two faces share one CSS grid cell, so the container is always as
tall as the taller face and a multi-sentence brief is never clipped. A
fixed-height 3D flip would have had to crop the prose or pad every scoreline; the
grid-stack sizes to content and still flips in 3D.

Only a card with a joined, non-empty brief becomes flippable. A card with no
brief is not a button and offers no affordance — the honest empty state, not a
dead control.

## What the fixture had to be

Both committed render fixtures carry `briefs: []`, so neither could ever exercise
this. `data/context-briefs-fixture.json` is built from **real captured briefs**
in `brief-join-corpus.json` — three MLB games with joined prose, one game whose
brief is empty whitespace, and one game with no brief at all. The last two are
both non-flippable, for reasons the join collapses to one outcome: a card only
turns when there is something to read.

Built by cloning a known-good fixture game and swapping only the fields that
change — the first attempt hand-wrote the game shape and every game decoded as
"sides not named", because a field the decoder needs was subtly off. Cloning the
known-good shape removed the guesswork.

## The gate caught a redundant guard

The first cut had **two** guards deciding flippability: `briefsByGame` filtered
empty text, and `render` re-checked `brief.Text`. The mutation
`brief-flip-ignores-empty-text` broke the join's filter and **survived**, because
`render`'s second guard still held.

Two guards defending one claim is precisely what lets a mutation break one and
pass on the other — the failure this repo files against suites that look green
while proving nothing. Fixed by making the join the single authority:
`briefsByGame` only ever yields a text-bearing brief, so `render` trusts it
(`flippable = briefOpt.IsSome`). One place decides; the mutation now has teeth.

## Verified

`brief-flip-check` 11/11 in a real browser — disclosure semantics, keyboard,
exactly-three-flippable, the empty-text and no-brief cards both plain, and that
the flip wrapper does not hide the `.desk-card__score`/`.desk-card__teams` nodes
the weather fill and score setters query. Both mutations caught, tree clean
after. `check` and `check:hard` (the existing render checks), `check:tabs`,
`check:nav` all still pass — the wrapper is one level deeper but every
`.desk-card__*` descendant query still resolves. Build clean, zero F# warnings.
`check:unused`, `check:workflows`, `check:secrets`, `check:import-purity`,
`check:docs` pass.

## What is not in stage 1

No scoreline verdict on the card yet (stage 2 feeds the brief + final through
`Scoreline.judge`), no provenance or anchoring line (stage 3), no aggregate
Briefs tab (stage 4). And on a live *scheduled* slate most games carry no brief
yet, so the flip appears only where production has written one — which is the
honest current state, not a gap to fill with invented text.
