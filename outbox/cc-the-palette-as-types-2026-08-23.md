# Outbox — the palette as types, not prose

**Date:** 2026-08-23
**Ships:** `src/Palette.fs`, `Desk.dramaSemantic`, `docs/PALETTE-PROOF.md`,
`scripts/palette-check.mjs`, wired into `verify` (runtime) and `verify-full`
(compiler proofs).

## The ask

"What's the best way for the laboratory to have more visual identity — colour
wise? And remember, the laboratory exists to be better. Can the F# improve it?"

FIELD's Semantic Design System v2 is the identity: a five-word vocabulary
(MUST / WATCH / DISCOVERY / CAUTION / QUIET), one colour each, on a dark
foundation. It states its rules as prose enforced by review — "gold = MUST
everywhere", "no raw hex in component code", "drama-keyed", "silence is honest
for QUIET". Production keeps colour in several string-keyed maps that have drifted
apart before, the same class the `Sport` union already removed here.

So "better", colour-wise, is not a nicer palette. It is the same move the desk
made for sports, drama, dates and odds: turn each prose rule into an invariant
the compiler and `verify` enforce.

## What shipped

`Palette.fs` — the colour system as types:

- **One `Semantic` union, one `tokenOf` registry, exhaustive.** "Gold = MUST
  everywhere" is true by construction — one function, not five maps. Adding a
  sixth word without a token does not compile (FS0025 is an error here).
- **`Token` seals the hex.** The constructor is private; a component holds a
  `Token` and renders it through `cssValue`, but cannot read or spell a hex
  literal. "No raw hex in component code" is a type error, the same seal
  `SealedDrama` puts on the drama peak.
- **Two unit-typed scales.** `dramaScale : float<drama> -> Semantic` and
  `advancementScale : float<pct> -> Semantic` share three colours and use
  different thresholds — the exact place a person applies the wrong bands to the
  wrong quantity. The unit makes crossing them a compile error (FS0001), the same
  guard that caught the production win-probability scale bug.
- **`NoAccent` is a real case.** QUIET has no left border; "silence is honest" is
  modelled, not defaulted.

`Desk.dramaSemantic (zone: AmnestyZone) (SealedDrama peak)` — the card-facing
drama→colour bridge, carrying the same amnesty witness `formatDramaPeak` and
`barHeightStyle` require. A live game cannot produce the witness, so a live card
can never be coloured by a drama level the desk otherwise seals — the ADR-002
line, held by the type system rather than by care. This is why `dramaScale` is
safe to be public: the only real `float<drama>` in the program is the one
unsealed right here, under amnesty.

## Proven, both halves

- **Compiler claims** (`docs/PALETTE-PROOF.md`, run by `check:proof` in
  verify-full): the sealed hex, the exhaustive registry, and the un-crossable
  scales, each injected into a real source file and rejected with its stated
  code. Verified this session in one build: FS1093, FS0025 and FS0001 all raised.
- **Runtime facts a compiler cannot state** (`scripts/palette-check.mjs`, in
  `verify`): `tokenOf` total and injective; the drama and advancement scales
  partition 0–100 at the spec boundaries (80/60, 70/40) with no gap or overlap;
  QUIET has no accent; every accent and the body text clears a WCAG 3:1 contrast
  ratio on the background; the surfaces are dark and distinct; dim text is dimmer
  than body text but above a 2:1 floor. 22/22, self-test first so the contrast
  math is shown to discriminate.

## Verified

Build clean, zero F# warnings. `check:palette` 22/22, `check:unused` 10/10
(every foundation token now has a consumer and an assertion matched to its role —
a surface is tested for darkness, an accent for contrast, dim for a floor, not
one blanket bar), `check:workflows` 6/6, `check:clean-source` passes. The three
proof cases reject with the codes the doc claims.

## Not done — deliberately

- **Rendering is not wired.** The desk does not yet colour cards from `Palette`;
  this ships the typed source of truth and its proofs first, so the rendering
  change is a separate, small diff that consumes a proven module rather than
  inventing colour at the view. Live cards will key on state and access; only
  post-game cards take drama colour, through the amnesty bridge.
- **Typography is next** (Chakra Petch + DM Sans), tracked separately.
