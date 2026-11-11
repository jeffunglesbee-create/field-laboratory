# Live-score decoder: contracts defended, numeric strings refused, probe decoder held to the page's (2026-11-11)

From review `wf_584a08a5-824` (decoder lens S6, S7, S11, S19; see `outbox/live-score-poll-review-2026-11-11.md` for the review as a whole). Nothing here ran against
a real match: the keys are the ones `adaptESPNWCSoccer` emits (read at relay `origin/main` `9f666e05`, 2026-11-11): `Number(x)` or null for a score, `displayClock`
text for the clock. The real live body is tonight's capture.

## 1. What was undefended (S6, S19)

The Suite's checks that said "no score" built `FeedGame` values by hand, so the decoder was off their path. Behaviour was correct (measured on the compiled
`build/LiveFeed.js`, 19 bodies, 2026-11-11), but these edits passed every check:

| edit to `src/LiveFeed.fs` | what the card would have shown |
|---|---|
| a null or absent score decodes as 0 | `0-0 In progress` for a score nobody served |
| `final` with no score reads `FullTime(0, 0)` | `In progress`, `0-0`, `Full time` |
| home and away paths swapped | `0-1` for `1-0` (only the browser check noticed) |
| `Optional` score or clock becomes `Required` | one game with no clock blanks every in-window, archive-unfinalised card of that sport key |
| `state` becomes optional with a default | a game with no state read as `pre` |
| one malformed game dropped instead of failing the feed | that card says "the feed has no game for this card", a wrong reason |

Fifteen Suite cases now run served-shaped bodies through `decodeFeed` then `readingFor`, each a pair (a body the claim holds for, one it does not).
Twelve entries in `scripts/mutation-check.mjs` (`feed-decoder-swaps-home-and-away` ... `feed-score-range-is-not-checked`) break one contract each: 12 of 12 caught.

Pinned as the current contract, not argued for: one malformed game fails the whole feed, and every in-window, archive-unfinalised card of that sport key says `live score unavailable` (`answersTo` and `liveNoteFor` choose which cards are told; one not yet started, past its window or finalised is not).

## 2. The probe's decoder disagreed with the page's (S7, S11)

The probe keeps its own JS copy of the decoder (it runs on a runner that builds nothing). A battery of 30 bodies through both (compiled `build/LiveFeed.js`
and the probe's `decodeFeed`) disagreed on 6:

| body | page | probe |
|---|---|---|
| score `"1"` (numeric string) | decodes (Thoth's `Decode.int` accepts it) | fails the feed |
| score `" 1"` | decodes | fails the feed |
| score 2147483648 | fails (not an int32) | decodes |
| `home` is a string | fails | decodes |
| `home` is a list | fails | decodes |
| `home` is a number | fails | decodes |

The probe's own self-test and a table entry asserted the string-score rejection "as the page does", which was false. Fixed toward the relay's contract
(a score is `Number(x)` or null), not toward the looser behaviour: the page gets `wholeScore` (a JSON number, whole, inside int32; a string is the relay's shape
changing and is named, not coerced, as `Decode.string` already is for the clock, the state and the id), and the probe gets the same range and the rule that a team
is absent, null or an object.

`scripts/check-live-probe-keys.mjs` now runs the battery through both and fails on any disagreement. Its printed coverage (Rule 91): 30 bodies, 30 agree, 10 decode,
20 fail the feed; not covered: bodies outside the list, a game in play. Two table entries break each side's int32 range alone (`live-probe-parity-*`) and are caught
by that check, because neither the Suite nor the probe's self-test checks a negative score.

## 3. Behaviour change worth knowing about

A relay that started serving scores as strings would now make every in-window, archive-unfinalised card of that sport key read `live score unavailable`, where before
it would have drawn the score. That is the intended direction (no coercion). Where the decoder's message (`Expecting a float but instead got: "1"`) is visible: in the
card's `data-why` attribute (devtools), since 5415065 and nowhere before it; and in the probe's manifest as `outcomes[].decoded.why`, in the PROBE decoder's own wording
("a score is not a whole number from 0 to the int32 maximum"), not Thoth's. It is not on the card as text and not in the probe's `#decode-status`, which is the page's
slate-decode line and never carries the feed decoder's failure (corrected by the fix-review 2026-11-11, card F10). This relay's `Number()` makes a string score unreachable
today (`adaptESPNWCSoccer`, relay origin/main `src/index.js` 2369-2370).

## 4. Process incident, recorded (Rule 77)

While adding the entries above I syntax-checked `scripts/mutation-check.mjs` with `node -e "import(...)"`. That file runs its harness when imported. It started the
proof-check phase, which injected `__proof0` into `src/Scoreboard.fs`, and I stopped the run, leaving the injection. `mutation-check --stranded` and `--heal` both said
nothing was stranded (the marker is proof-check's own, in `.proof-state/`). `node scripts/proof-check.mjs` healed it on its next run ("HEALED ... Restored it before
measuring anything", 140 of 140 checks), and `git status` showed `src/Scoreboard.fs` clean before anything was staged. No commit carried the injection. A tracked
screenshot (`outbox/metrics-tab-latest.png`) was rewritten by the same run and restored with `git checkout`. Rule for next time: check a `.mjs` that has a `main`
with `node --check`, never by importing it.
