# Outbox — wiring the desk to the typed palette and type system

**Date:** 2026-08-23
**Ships:** the desk now renders in FIELD's identity — colours from `Palette.fs`,
faces from `Typography.fs`, generated into the page at build time, with a drift
guard and self-hosted fonts. Follows the two "as types" commits; this is the
application half both of them deferred.

## What changed

- **`scripts/build-site.mjs`** imports the compiled `Palette` and `Typography`
  and injects a `#design-tokens` block — the `:root` colour variables and the
  `@font-face` rules — into `index.html` at a `<!--DESIGN-TOKENS-->` marker. The
  page's `--must`, `--bg`, `--font-identity` etc. ARE `Palette.tokenOf(...)` and
  `Typography.fontFamily(...)`; nothing is a hand-copied hex.
- **`index.html`** dropped every hardcoded hex (the generic `#0f1115` / `#4a9d7e`
  theme) for `var(--…)`, and assigns the identity face to data, labels, badges,
  headers while team names and prose stay DM Sans. All structure — borders,
  radii, gaps, sticky offsets, the flip's display semantics — is untouched.
- **`fonts/`** carries the four self-hosted woff2 (Chakra Petch 600/700, DM Sans
  300/400, latin subset), copied to `public/fonts/`. No CDN hotlink, so the desk
  stays offline-honest.

## Better than a restyle: the page cannot drift from the source

`scripts/design-tokens-check.mjs` (in `verify`, 21/21) asserts every injected
token equals the module it came from — the five semantics against `tokenOf`, the
foundation against the exported tokens, the two stacks against `fontFamily` — and
that all four fonts ship and no font CDN is referenced. So a colour on screen is
provably the registry's, the page-level end of the guarantee `Palette` gives
inside the F#. A hex typed into the CSS by hand would now fail the check.

## Verified

Build clean. Render suite green on the restyled page: `check` 13/13, `check:hard`
13/13, `check:separation` 10/10, `check:brief-flip` 20/20, `check:nav` 25/25 —
no structural regression, no console errors, fonts load. `check:design-tokens`
21/21, `check:palette` 22/22, `check:typography` 11/11, `check:workflows` 6/6.

## Notes / not done

- The colour mapping keys the active UI accent (tabs, focus, chosen) to teal
  (DISCOVERY), verdicts/chips to the vocabulary (teal ok, red wrong, amber
  wait/pending, blue live, smoke quiet), and the drama sparkline to gold. Card
  tiering (FEATURED / STANDARD / COMPACT) and applying `Desk.dramaSemantic` to
  post-game cards are a further diff — this commit establishes the tokens and
  faces on the existing card shape.
- Next: optimize the laboratory against the cross-repo comparison — the client's
  deploy-landed proof, its pre-commit gate, and its assertion against the shipped
  artifact, which the laboratory currently lacks.
