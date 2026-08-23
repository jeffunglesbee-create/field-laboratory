# Outbox — typography as types

**Date:** 2026-08-23
**Ships:** `src/Typography.fs`, `docs/TYPOGRAPHY-PROOF.md`,
`scripts/typography-check.mjs`, wired into `verify` (runtime) and `verify-full`
(compiler proofs). Follows `cc-the-palette-as-types-2026-08-23.md` — same
treatment, the other half of FIELD's visual identity.

## The rule set, and why it wants types

FIELD's Semantic Design System v2 makes typography the identity: "Chakra Petch —
labels, data, badges, headers, scores. Technical. THE identity. DM Sans — body,
editorial context." Plus a hard limit: "Two fonts only. No Playfair, no Barlow,"
and a per-role spec (weight, size, tracking, case, tabular numerals).

Those are prose enforced by review. Review is where "two fonts only" becomes
three because someone imported a face for one screen, and where a score loses its
tabular numerals and a column starts to jitter. The laboratory encodes the rules.

## What shipped

`Typography.fs`:

- **`Font` is a closed union of two.** A third face does not compile until every
  match handles it — "two fonts only" as an invariant, not a spec line.
- **`Role` + one exhaustive `styleOf` registry.** Every surface (label, data,
  badge, header, body, context) has exactly one style; a role with none does not
  compile (FS0025 is an error here).
- **`TypeStyle` seals its fields.** A component asks a role for its style and
  renders it through `cssFont`; it cannot read a size off a style or build one
  from a raw font string. Same seal `Palette.Token` puts on a hex.
- **`fontFamily` carries a real fallback** for each face, so a missing web font
  degrades to a sane system face, never to a serif the design never chose.

## Proven, both halves

- **Compiler claims** (`docs/TYPOGRAPHY-PROOF.md`, `check:proof` in verify-full):
  the sealed style, the exhaustive role registry, and the two-font limit, each
  injected into a real source file and rejected. Verified this session in one
  build: FS1093 (sealed field) and FS0025 (both exhaustiveness cases) raised.
- **Runtime facts** (`scripts/typography-check.mjs`, in `verify`, 11/11): exactly
  two faces and both used; every role resolves to one of them; four roles set in
  Chakra Petch and two in DM Sans; exactly one role (Data) carries tabular
  numerals and renders them, and it is the identity face; every font stack ends
  in a real generic fallback; label/badge emit an uppercase transform. Self-test
  first, so the fallback detector is shown to discriminate.

## Verified

Build clean, zero F# warnings. `check:typography` 11/11, `check:unused` 10/10
(every Typography export has a consumer), `check:workflows` 6/6,
`check:clean-source` passes. The three proof cases reject.

## Not done — deliberately

- **Rendering and the woff2 assets are not wired.** This ships the typed source
  of truth and its proofs; the desk does not yet set text from `Typography`, and
  Chakra Petch / DM Sans are not yet self-hosted. That is the next diff: apply the
  roles at the view and ship the two fonts as local `@font-face` (no hotlink, so
  the desk stays offline-honest), consuming a proven module rather than spelling
  fonts inline.
- With `Palette` (color) and `Typography` now both typed, the remaining
  visual-identity work is application, not more type layers.
