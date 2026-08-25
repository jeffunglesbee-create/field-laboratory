# No workflow may install a credential from a literal

**2026-08-25.** Ported from field-relay-nba. Full write-up:
`field-relay-nba outbox/2026-08-25-literal-secret-writes.md`.

`update-odds-key.yml` there was named "Set ODDS_API_KEY to 20K plan key" and
piped the **exhausted** free-tier key into `wrangler secret put`, printing a
green checkmark. One dispatch would have replaced the working production key
with a dead one.

**Checks the mechanism, not the claim.** A command installing a secret must take
its value from a variable or a `secrets.*` expression, never a quoted literal.
The tempting rule — a step's name must match what it does — was measured first:
73 hits over 828 steps in three repos, essentially all section labels
(`STRUCTURAL`, `PROBE`, `COURIER`) and subject nouns (`ESPN`, `UEFA`, `OIDC`).
That signal-to-noise gets a check deleted, so it did not ship.

Ten self-test cases, six of them asserting a legitimate shape is **not** flagged
— a false positive fails a deploy, so the allowed forms are the larger half.

This repo scanned clean. Ported in the same change as the other three rather
than to one and reported as "the exposure" — the lesson the cross-repo secret
scan taught eight hours earlier.

Verify:

```
node scripts/check-no-literal-secret-writes.mjs --self-test
node scripts/check-no-literal-secret-writes.mjs
```
