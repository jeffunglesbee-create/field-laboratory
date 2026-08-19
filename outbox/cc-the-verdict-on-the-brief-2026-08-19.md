# Outbox — stage 2: the scoreline verdict on the brief, and the flip CSS that never shipped

**Date:** 2026-08-19
**Ships:** the extractor moved into `src/Scoreline.fs`, `scoreline-check.mjs`
consumes it, a verdict badge on the brief face in `src/Scoreboard.fs`, the flip
+ verdict CSS in the **source** `index.html`, a computed-style guard and verdict
assertions in `scripts/brief-flip-check.mjs`, one mutation

## A live bug stage 1 shipped, caught by looking at the deployed page

The flip's CSS never shipped. Stage 1 added it to `public/index.html` — which is
**gitignored build output** that `scripts/build-site.mjs` overwrites from the
real source (`index.html` at the repo root) on every build. So the flip shipped
behaviourally correct and visually dead: the classes, the `role=button`, the
`aria-expanded` toggle all worked, and none of the 3D flip, the faces, or the
brief styling existed on the deployed site.

Every behavioural check passed the whole time. That is exactly why it slipped —
a class-and-attribute assertion cannot see a missing stylesheet. The fix is a
**computed-style** check:

```
transform-style is <x> — the flip CSS is missing from the source index.html
```

It reads `getComputedStyle(.desk-card__flip).transformStyle` and fails on
anything but `preserve-3d`. If the CSS is edited into the copy again, this fails
in the browser rather than shipping dead a second time.

The lesson is one line: **the source is `index.html` at the repo root; `public/`
is generated.** Editing the copy is editing nothing that ships.

## Stage 2: the verdict, where the claim was made

A scoreline in the prose is now checked on the card that shows it. Green
"scoreline checks out", red "scoreline exceeds the final", amber "scoreline —
final not in yet". The relation is dominance, not equality — a mid-game "leads
4-2" is consistent with a final of 8-6 because scores do not decrease — and the
badge says nothing at all when the brief makes no scoreline claim.

`Unsettled` is the honest state for a game with no final yet, which is the common
case on a live scheduled slate, and it is amber rather than dressed up as a pass.
The verdict reads the immutable final from the game row, not the reactive score
signal, so it does not flicker with live updates.

## The move that made it possible, and killed a duplication

The verdict has to be computed at render time, in F#. The extractor was
JavaScript, in `scoreline-check.mjs`, while the relation was F#. Two definitions
of "what counts as a scoreline" is the F#/JS split this repo keeps finding rots,
so the extractor **moved into `src/Scoreline.fs`** and the check now imports it.
One definition, in the language the UI compiles from, consumed by both.

It is Fable-safe by construction. The JS version used a lookbehind to keep `5-5`
out of `5-5-7`; Fable emits regexes with the `u` flag, under which lookaround is
the fragile kind, so there is none. A maximal run of hyphen-joined numbers is
matched whole and only a run of exactly two numbers is a candidate — a three-part
run is a record, dropped by having three parts, the same outcome the lookbehind
gave with none of its risk.

Parity was measured across the move, not assumed: **358 joined / 147 claims / 0
impossible**, unchanged, and the 19-case self-test still green.

## The verdict badge has teeth, after the first attempt had none

The mutation `verdict-consistent-beats-impossible` swaps the precedence so a
consistent claim wins over an impossible one. It **survived** the first time,
because the impossible probe made only one claim — precedence only matters when a
brief carries both. Fixed by giving the probe a consistent `2-1` and an
impossible `40-0` in one sentence: unmutated the brief reads `Impossible` (one
bad claim taints it), mutated it reads `Consistent`, and the check catches the
difference. One bad scoreline badged as checked-out is precisely the failure the
verdict exists to prevent.

## Verified

`brief-flip-check` 14/14 in a real browser — the four flippable cards, the two
plain ones, three verdicts `ok` and one `bad`, and the computed-style guard.
`scoreline-check` 19/19 self-test and 3/3 corpus after the extractor move. All
three flip/verdict mutations caught, tree clean after. `check:unused`,
`check:workflows`, `check:docs` pass. Build clean, zero F# warnings.

## What is not in stage 2

No provenance or anchoring line yet (stage 3: `AnsweringModel` — every archived
brief is `ProxySilent` — and the unanchored-sentence count). No aggregate Briefs
tab (stage 4). And the badge is only as visible as the briefs are: on a live
scheduled slate most games carry no brief and no badge, which is the honest
current state.
