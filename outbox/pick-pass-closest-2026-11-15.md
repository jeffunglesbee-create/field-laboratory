# Field's Pick on a pass night: what came closest

**Date:** 2026-11-15. **Repo:** field-laboratory. **Files:** `src/Pick.fs`, `src/PickView.fs`, `scripts/pick-check.mjs`, `data/pick-pass-2026-11-14.json`.
**Trigger:** owner-pasted proposal 4 of 5 ("Passed on Tonight" should show the closest contenders). Proposals 1, 2, 3 and 5 are reported in chat, not built here.

## What was measured

- `/analytics/newspaper/2026-11-14`, read 2026-11-15T02:55Z via the FIELD_Handoff `probe_relay_route` self-fetch (the sandbox's direct `curl` to the relay is refused by the egress proxy, exit 56): `pick.type` is `pass`, and the response still carries `ranked`: five NBA entries, every one `score` 1, `tier` 2, `reasons ["prime time"]`. Its `brief` reads "Not every night has a must-watch. Tonight's one of those." (`must-watch` is on FIELD's banned list).
- The relay source agrees (`field-relay-nba/src/analytics-engine.js`, `runPhase9FieldPick`): the pass object is `{ type, score, reason, ranked }`, and `ranked` is the same top-5 slice a pick carries.
- The laboratory's pass branch decoded `reason` only and dropped `ranked`.

## What changed

- `Passed` carries a `PassBoard`: the ranked entries sorted here (not trusted), plus their `Leadership`.
- The view renders them under "Closest on the board": matchup and reasons, never the rank (`SealedRank` still has no path to a string), with the tie named. The fixed refusal line (`passReasonText`) is unchanged. The relay's pass brief is not decoded.

## Proof

| check | result |
|---|---|
| `node scripts/pick-check.mjs` | 24/24 |
| same, with the pass board mutated to empty | 22/24 (the count check and the tie check red), restored to 24/24 |
| `npm run check:tabs` | 61/61 |
| browser read of `#panel-field-pick` with the 11-14 pass served for the pick route | 5 `.pick-chaser` rows; tie note "level with 4 others on the same signals"; no digit, no bare decimal, no `must-watch` |
| `npm run gate` locally | **not completed**: killed at the 580 s limit; its rows reach hosts this sandbox refuses (api.open-meteo.com, www.google.com). The full gate runs in `verify-full.yml` (weekly, or on dispatch). |

## Residuals

- The relay writes a banned phrase into its pass line (`passLine` in `runPhase9FieldPick`, KV `field:pick:{date}` and `analytics_output`). The laboratory does not render it; whether the client does is not checked here.
