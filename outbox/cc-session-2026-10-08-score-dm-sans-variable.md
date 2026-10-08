# 2026-10-08 — the score moves to DM Sans Variable, and gets a weight axis

**HEAD:** `c4f4763` → `d2205eb`
**Commit:** `d2205eb` — feat: the score moves to DM Sans Variable, and gets a weight axis
**Proof run:** verify.yml run 37855919950 on `d2205eb`
**Credits spent at any vendor:** 0

---

## What was asked, and what it turned out to be

The owner pitched a "Tension Typography Engine": bind a Live Leverage Index and
a Win Probability Volatility signal to a variable font's `wght`, `wdth` and
`slnt` axes so the score physically swells at peak tension, and supplied an F#
component for it.

An 11-agent verification of every premise it rests on returned PARTIAL or FALSE
on four of seven, with one reader adversarially refuted by its own verifier. The
findings that mattered:

| premise | verdict |
|---|---|
| leverage is a prohibited proprietary composite | **FALSE — and this was MY error, published to the owner.** `src/PlayFrame.fs:82`: *"LeverageIndex is commodity (Tango's index is published) but nothing in any FIELD repository computes it. The field is in the layout because the layout came with it; its producer does not exist."* Permission was never the problem; a producer is. |
| Win Probability Volatility exists | FALSE. The only `getVolatilityIndex` (jubilant-bassoon `src/legacy/field.js:7263`) computes the standard deviation of the DRAMA score — so volatility-as-built is a drama derivative, sealed by `AmnestyZone`. |
| the mapping is permissible | PARTIAL. ADR-002 PROHIBITED #4 is *"system-determined recommendation without user personalization"*, and a continuous system-set mapping from a number to visual urgency lands there whatever the input is. Rule A (push vs pull) does NOT decide a bulging font on the owner's own desk; the DISPLAY axis does, and `docs/ADR-002-CONTEXT.md:457` settles that non-text encodings are in scope: *"the polyline is in scope, not only the text label... Stripping the number and keeping the chart live is not a fix."* |
| there is no client-side tension series | FALSE, and the refutation is this repo's own documented trap. `drama_arc` is a JSON **string**, never an array — `{null: 87, string: 39}` across 126 games — so `Array.isArray(...).length` reads every real arc as empty. 30 of 208 games in committed captures carry a real series, 4 to 504 samples. `src/Desk.fs:928-941` warns about exactly this; `Desk.fs:1046` already decodes it into a typed `SealedArc`. |

The pitched F# also would not have run: `[<Component>]`, `Html.div` and
`Attr.style` are Feliz.JSX.Solid, which is not in the compile graph
(`Scoreboard.fs:14` records why); `Attr.style [ ("…", fontSettings()) ]` calls
the memo during construction and bakes a static string, defeating the one
advantage claimed for it; the four Tailwind classes have no Tailwind; and the
curve propagates NaN — measured, `max 100.0 (min 900.0 nan)` is `nan` because
comparisons against NaN are false, and `'wght' NaN` is discarded by the browser,
so a broken leverage renders identically to a calm game.

## What shipped

The owner's decision, asked and answered: **move the score to DM Sans Variable.**

```
fonts/  dm-sans-300.woff2 + dm-sans-400.woff2   27,908 B, two instances
     →  dm-sans-variable.woff2                  36,932 B, wght 100..1000
        net +9,024
```

Chakra Petch ships static instances only — one file per weight on Google Fonts,
ten discrete styles on Adobe, no `fvar` axis — so a score set in it cannot vary
its weight at all. DM Sans ships a variable release carrying `wght 100 1000`
(v17, read from the css2 API for this exact subset URL, which declares
`font-weight: 100 1000`).

**"Two fonts only. No Playfair, no Barlow." is unbroken, and that is why this
shape was chosen.** Inter Variable or Roboto Flex would have made `Font` a union
of three. Swapping DM Sans's own file for its variable cut keeps the union at
two and leaves `fontFamily` byte-identical.

`Score` is a NEW `Role` rather than a change to `Data`'s font. The v2 prose lumps
"data" and "scores" together; percentages and standings numbers are still
identity data and still static. Only the game score moved.

### The seam was not where the types are

`.desk-card__score` never got its face from `Typography.cssFont`. `index.html`
grouped it with `--font-identity` alongside h1 and the section titles, and set
`font-weight: 700` as a literal. Both are gone: a `--font-score` token generated
from the role, and the weight now travels on `font-variation-settings` so that
the one declaration a future driver would write is the one the base weight is
already on — rather than a driver's axis silently losing to a `font-weight`
further down the cascade.

### No driver is wired, deliberately

`scoreAxisCss : float option -> string option` is the one door, waiting on a
user-set threshold. Both options are load-bearing: `None` in is "no reading";
`None` out means the caller REMOVES the property rather than writing a default,
because an unreadable input rendering at the base weight is indistinguishable
from a calm game (Rule 99). NaN and Infinity are rejected explicitly, because
that is the measured failure above and not a hypothetical.

## The proof, in a real browser

`dotnet` is absent from the sandbox, so the F# does not compile there and every
check importing `build/*.js` is CI-only. verify.yml run 37855919950:

```
  22 success   The typography system holds
  23 success   The page's design tokens match the modules
  26 success   The chrome, measured on the rendered page
     Build (F# -> JS, then assemble public/)  success
```

Step 26 is the one that matters. The axis is measured by its **consequence** —
the rendered width of `104 - 104` across `wght` 100/400/700/1000, required
strictly rising — because `computed-chrome-check.mjs`'s own header records why a
property is not enough: *"a check that asserted `preserve-3d` was SET and passed
while the render did nothing."* A variable woff2 whose `@font-face` declares a
single `font-weight` loads, renders every weight by SYNTHESISING off one
instance, interpolates nothing, and still shows the axis in computed style.

With a negative control on the identical sweep over Chakra Petch, which must NOT
rise — otherwise a rising width is evidence of nothing. Both passed.

Also proven by that green: Fable represents `string option`'s `None` as
`undefined` at the JS boundary, which the check asserts directly
(`scoreAxisCss(undefined) === undefined`). That was the one real unknown at
commit time and it is now measured rather than assumed.

## Four checks moved with the design

- **typography-check** — `dmDecls` 2 → 3; two tabular roles rather than one; and
  `"the tabular role is set in Chakra Petch (scores are identity data)"`
  **deleted**, because that assertion WAS the design decision. Chakra keeps all
  four roles it had, so a reader seeing `chakraDecls === 4` unchanged must not
  conclude nothing moved.
- **design-tokens-check** — the `@font-face` must declare a RANGE, read from
  `Typography.SCORE_WGHT_MIN/MAX` rather than two literals, because they were
  separate numbers in the first draft of this change.
- **computed-chrome-check** — the consequence sweep and its control, above.
- **TYPOGRAPHY-PROOF.md** — amended, not rewritten. All three compile proofs hold
  unchanged, and not by luck: adding a `Role` case makes proof 2's incomplete
  match *more* incomplete, and `Font` is still closed at two.

Impact analysis before committing, since `FS0025` is an error here: the only
exhaustive `match` over `Role` in the repo is `styleOf` itself. The two
proof-doc snippets still fail for the codes they assert (FS1093, FS0025).
`src/Program.fs:250` is a DOM selector, not the union — the line is a `document.querySelector` call against the tab strip. The earlier rendering of it here quoted the selector with unescaped quotes, which appears nowhere in the F# source (it escapes them), so the citation anchored to nothing and the ratchet counted it.

## My own defects this session

1. **I published a wrong premise to the owner** — that leverage is a prohibited
   composite — and `PlayFrame.fs:82` had already classified it as commodity.
   Corrected in the next message. The verification workflow found it; reading did
   not.
2. **Four shell-quoting faults**, all chaining `gh api | node -e '...'` or
   `python3 -c`. One reported `"anchor not unique, nothing mutated"` for two
   mutations whose anchor sits plainly at `index.html:501`; another threw
   `missing ) after argument list`. Every one was my quoting through two layers,
   none was the data. The fix is writing the harness to a file, which I recorded
   in a commit message and then did not apply twice more.
3. **This commit pushed source with no outbox entry**, which is what this
   document is. `check:history` cannot run its real audit in the sandbox — the
   clone is shallow and the script's own error names that cause first — so the
   omission surfaced only in CI.

## Open, and not mine

Both failing for every verify/guards run since 2026-10-03, confirmed against
`901f00e` (10-05) and `f28913d` (10-04):

- **`check:rows` — "breaking each invariant makes a check fail" at 70/100.**
  22 of 23 gate rows are at or above 95; this one is the gate's own mutation row.
  `outbox/mutation-baseline-latest.json`, the artifact built to name its failures,
  reads `at 2026-10-05T14:01:36, ran 1, from_mutations 1, failing 0` — ONE
  expectation, three days stale, so it does not yet name anything. verify-full
  writes it and runs weekly.
- **`claim-check.mjs --self-test` at 22/24, and `mutate-claim-check.mjs`
  correctly refuses to mutate a red baseline.** The two failures are a CONTROL
  that can no longer find its subject: *"THE CONTROL: src/Desk.fs:1369 is found
  as a present-tense premise"* and *"...and it is UNDATED, which is the
  finding"*. Citation drift in the harness's own anchor — the fragment it looks
  for is `1 - homeWP`, and that line is now at `src/Desk.fs:1468`
  (*"FIELD app computes a win-probability away side as `1 - homeWP` — the
  two-way"*), while 1369 today holds
  `| Some mh, Some ma, Some (Balanced h) ->`.

## Still open on the concept itself

The axis exists and interpolates; nothing drives it. Three things are needed
before anything should:

1. A **producer** for a commodity driver. WP margin `|0.5 - p|` is cleared by
   name (`ADR-002-CONTEXT.md:286`, PERMITTED #4, *"Win probability display ...
   Explicitly cleared"*), and the laboratory renders only pre-game odds today
   (`Desk.fs:1512` reads `ClosingOdds`/`OpeningOdds`).
2. A **user-set threshold**, or the discrete named-tier form that already ships
   live in jubilant-bassoon (`field.js:41645`, 85/65/45, gated NOT-amnesty).
   PROHIBITED #4 is not cleared by a commodity input alone.
3. A **clock**. There is none: zero hits for
   `setInterval|setTimeout|EventSource|WebSocket|requestAnimationFrame` across
   all 37 `.fs` files and `index.html`.
