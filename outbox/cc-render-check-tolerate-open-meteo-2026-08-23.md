# Outbox — render-check no longer gates the deploy on an Open-Meteo outage

**Date:** 2026-08-23
**Ships:** `scripts/render-check.mjs` + one line in `.github/workflows/verify.yml`.

## The fragility

`render-check`'s four live weather-chip assertions fill from a real Open-Meteo
call with a hard 20s wait and no tolerance. api.open-meteo.com has gone
unreachable from GitHub-hosted runners for stretches (weather-live-check names
the runs), and when it does the chips cannot fill through no fault of the page —
yet the assertions failed hard, turned verify red, and blocked the deploy on a
third-party outage. It just happened: verify failed on 428d200 with exactly these
four checks red ("the chips all filled within the wait → Timeout 20000ms",
"1 known venue, 0 chips filled"), no code change to weather or rendering, and
`no page or console errors` still passing — the signature of Open-Meteo being
slow, not the page being broken. A re-run went green.

The Drive "Weather API Deep Dive" (2026-05-17) confirms the stakes: Open-Meteo is
FIELD's single weather source — every examined alternative was "skip for v1" — so
there is no fallback provider. An unreachable Open-Meteo is a dependency outage,
not a product regression, and a deploy gated on it is pressure, not a measurement.

## The fix — the pattern weather-live-check already established

`weather-live-check` resolved this exact split two days of work ago: tolerate
unreachability in verify, nowhere else, and only ever for a probe that actually
failed to reach the service. `render-check` now does the same:

- `--tolerate-unreachable` is passed by verify.yml's live render step and by no
  other job.
- When the chips do not fill, a direct probe (Fenway Park, the same coordinate
  weather-live-check uses) attributes the failure: is Open-Meteo reachable at all?
- Only when the probe FAILS **and** the flag is set are the four live weather-chip
  assertions skipped — loudly, as a `::warning::`, never a silent pass. A broken
  chip while the service is UP never reaches this branch (the probe succeeds), so
  a real render regression stays a hard failure everywhere.

The probe runs only when there is an empty-chip failure to explain, so a healthy
slate pays nothing. The venue-table coverage check is about the table, not the
service, and is asserted whether or not Open-Meteo answered.

## Verified

Reproduced against the sandbox, which blocks Open-Meteo exactly as the failing
runner did:

- **Without the flag:** the four weather checks FAIL — teeth intact.
- **With `--tolerate-unreachable`:** the probe detects Open-Meteo unreachable, the
  four checks are skipped with the warning, and they leave the denominator
  (18 → 14). This is the real CI failure's shape — that run was 14/18 with only
  those four red — so the skip turns it green.
- **Pinned paths unchanged:** `check` and `check:hard` (the confidence-gate render
  rows) are 13/13 each; pinned runs never enter the weather block or the probe.
- `workflow-check` 6/6 — verify.yml still valid.

No F# or index.html changed, so every build/render/proof/mutation invariant is
byte-identical to the 100/100 base already on main; the changed surface —
render-check and one verify.yml line — is verified directly above.
