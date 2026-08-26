# The guard against literal credentials was carrying one, in three repos

**2026-08-26.** `scripts/check-no-literal-secret-writes.mjs`, fixed in
field-laboratory, jubilant-bassoon and field-playground.

## What happened

`check-no-literal-secret-writes.mjs` exists to fail any workflow step that
installs a credential from a quoted literal. Its self-test needs a line that
should be caught, and I used **the real (exhausted) Odds API key** — twice: the
`bad` fixture, and the "a step that installs nothing is allowed" case.

field-relay-nba `32c5c99` fixed that. **The same script had been shipped to all
four repos, and I fixed one copy.** The other three carried the literal for the
rest of the day.

## How it was found, and how it should have been

`exposed-secret-check.mjs` — this repo's own ratchet — had been failing on it:

```
FAIL  no file in the working tree contains a known-exposed credential
      → scripts/check-no-literal-secret-writes.mjs
```

`verify` was red for runs 143, 144, 145 and 146. **I pushed four commits to this
repo today without looking at it**, and only read the log after the fifth.

That is the failure worth recording. The ratchet worked exactly as designed and
said so four times; nobody read it. A gate whose output goes unread is the
weaker half of the same problem the gate itself guards against.

## The fix

Both fixtures are now a synthetic 32-hex string. They test a **shape** — a
quoted run of 8+ non-space characters fed to a secret installer — and the shape
never needed the real value, which is the point the guard makes about every
other file. Self-test still passes in all three repos; the exposed-secret
ratchet is green here.

## What is NOT fixed

The literal is in git history in four repos and always was — removing it from
the working tree does not remove it from history. The key is the exhausted
free-tier one (field-relay-nba `docs/exposed-secrets.sha256` records it at a
budget of 0 because nothing needs it: `GET /budget/odds` on 2026-08-25 showed
42,102 of 85,000 credits used, so `env.ODDS_API_KEY` is set and working and this
constant was never reached). It should still be rotated at the provider by the
account holder.

## Unblock criteria (Rule 74)

- **Closed:** the working-tree copies. Zero occurrences in all four repos.
- **Open, needs the account holder:** rotate the Odds API key at the provider.
  Verify: `GET /budget/odds` keeps reporting usage after the rotation, meaning
  the live worker secret was updated too.
- **Open, blocked on nothing:** three of the four repos have no equivalent of
  the relay's `guards.yml`, so a script-only push there runs no gate at all.
  Verify by pushing a `scripts/`-only change and checking whether any workflow
  fires.
