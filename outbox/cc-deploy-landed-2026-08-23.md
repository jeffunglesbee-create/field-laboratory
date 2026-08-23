# Outbox — the deploy-landed proof the laboratory was missing

**Date:** 2026-08-23
**Ships:** `scripts/deploy-landed-check.mjs`, its self-test in `verify`, and a
`--strict` live assertion in `live-check`. First of the cross-repo optimisations.

## The gap

A cross-repo comparison found the client can prove its deploy landed — its gate
asserts the live site serves the commit it just pushed — while the laboratory
could only report, softly, that the published stamp was "not main HEAD", unable
to say whether that was correct or a failed deploy. STATUS.md showed exactly this:
Cloudflare serving an older commit than main HEAD, with no verdict on whether
that was fine.

## Why the client's check would be wrong to copy

The client deploys every push. The laboratory deliberately does NOT deploy
docs-only or `[skip ci]` commits — `verify` ignores `docs/**`, `outbox/**`,
`**/*.md`, and both build and deploy skip a stamp already live. So "published !=
HEAD" is the EXPECTED state the moment a STATUS refresh or a docs commit lands on
top. A naive `published == HEAD` gate would go red on nearly every commit, which
is the "train people to ignore red" failure this repo keeps naming.

## The better question

Is the published artifact the newest **deployable** commit? The check walks main
newest-first, skipping commits that only touch the deploy-ignored paths, and
compares the first deployable commit it finds to the live `version.txt`:

- **landed** — published IS the newest deployable commit (deploy landed, even if
  HEAD is newer because docs sit on top).
- **behind** — published is behind the newest deployable commit (deploy genuinely
  did not land). `::error::` under `--strict`.
- **unknown** — the site returned no stamp (unreachable); a warning, not a
  failure, so a transient outage is not read as a bad deploy.

The deploy-ignore set is kept identical to `verify.yml`'s `paths-ignore`, so the
two cannot drift on what counts as deployable.

## Verified

Self-test 6/6 (the deployable classifier, the newest-deployable walk, and every
verdict case), run in `verify`. Live mode exercised locally: it correctly found
the newest deployable commit and reported `unknown` when the site was unreachable
from the sandbox (the sandbox has no route to the site — which is exactly why the
live assertion runs in `live-check`, post-deploy, with `--strict`).
`check:workflows` 6/6 with the new steps.

## Not done

- The verdict is not yet folded into STATUS.md's prose — `live-check` carries it;
  surfacing it in STATUS is a small follow-up.
- The other screenshot gaps: a pre-commit gate (the laboratory has none, so every
  check runs only in CI after the bad commit exists) is the next optimisation.
  The SW_VERSION cache invariant does not apply — the laboratory ships no service
  worker, and inventing one to match would be cargo-culting, not optimising.
