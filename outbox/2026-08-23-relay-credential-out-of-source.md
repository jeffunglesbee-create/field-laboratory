# The relay credential is out of this repo's source

## What failed

The boundary fix (`d4aabb6`) got `check:history` past its error, and `verify`
reached a step it had not been reaching. `check:secrets` failed:

```
Scanned 289 file(s) in the working tree against 3 pinned hash(es)

PASS  there are pinned secrets to look for
FAIL  no file in the working tree contains a known-exposed credential
      → docs/CC-CMD-2026-08-23-matchup-note-starvation.md: relay shared auth
        header value (gates POST /d1/execute — write path to production briefs)
      → scripts/sport-vocabulary-check.mjs: relay shared auth header value
```

Both files are from today, both mine. The check is right, and it was right the
whole time — it could not say so because a stale boundary sha aborted the suite
four steps earlier. One broken check hid another.

## The fix in this repo

`scripts/sport-vocabulary-check.mjs` reads `process.env.RELAY_SHARED_SECRET`.
Two header literals removed; the CC-CMD's curl now interpolates `$RELAY_SHARED_SECRET`.
`.github/workflows/drift-sentinel.yml` passes it from a repository secret.

**No fallback.** A default would make an unset secret indistinguishable from a
set one until the relay returned 401, which this script would then have reported
as "the probe failed" — the same silence this repo keeps deleting. Missing
credential is its own state, and it is fatal:

```
PROBE FAILED — this says nothing about the registry.
RELAY_SHARED_SECRET is not set. This check reads the relay's games tables
through POST /d1/execute, which is credentialled. Set it as a repository secret
and pass it in .github/workflows/drift-sentinel.yml. Until then the registry gap
this check exists to find is unobserved, which is a failure and not a skip.
```

Demonstrated by running the script against a stubbed `build/Desk.js` with the
variable unset: exit 1, message above. A vocabulary check that cannot read the
vocabulary has not checked anything.

## What this does NOT fix, and it is the larger half

`check:secrets` scans this repo's working tree. The credential's actual home is
`field-relay-nba`, where it is not a secret at all:

| where | count |
|---|---|
| `src/index.js` | 27 occurrences |
| `src/analytics-engine.js` | 1 |
| `.github/workflows/*.yml` | 5 files |
| `docs/` and `CLAUDE.md` | 8 files |

It appears in `src/index.js` as a hardcoded fallback:

```js
env.RELAY_SHARED_SECRET || '<literal>'
```

So the deployed worker accepts the literal whether or not the binding is set,
and the literal is committed in a repo alongside every workflow that uses it.
Removing it from field-laboratory removes it from **one** of four repositories
and changes nothing about its exposure.

**This is not something to fix quietly from here.** Dropping the `||` fallback
is an authentication change on a live worker: if the `RELAY_SHARED_SECRET`
binding is absent or differs, every cron, every workflow, and every `/d1/execute`
caller starts getting 401 at the next deploy. That needs the binding's real value
confirmed against the Cloudflare account first, and it is not a change to make
without saying so out loud.

**Recorded, not acted on:**

1. `RELAY_SHARED_SECRET` needs adding as a field-laboratory repository secret,
   or `check:sport-vocabulary` stays red in `drift-sentinel.yml`. That is the
   correct state, not a regression — the check is honest about being blind.
2. Whether to rotate the value and drop the relay's fallback is a decision with
   a live blast radius, and it belongs to the person who owns the account.

## Status

| | |
|---|---|
| `check:secrets` | 2/2 — was 1/2 |
| `check:workflows` | 6/6 |
| missing-credential path | demonstrated: exit 1, named |
| `check:sport-vocabulary` | **red until the repository secret exists.** Unblocks on: adding `RELAY_SHARED_SECRET` to field-laboratory. Verify: `drift-sentinel.yml`'s sport-vocabulary step reports a label count instead of `PROBE FAILED`. |

## Files

- `scripts/sport-vocabulary-check.mjs` — env read, no fallback, fatal when empty
- `docs/CC-CMD-2026-08-23-matchup-note-starvation.md` — curl interpolates
- `.github/workflows/drift-sentinel.yml` — passes the secret
