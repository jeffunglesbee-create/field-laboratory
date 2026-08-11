# live-check failed a commit whose code was never deployed — 2026-08-10

Confirming CI on `531b0a8` turned up a false failure, and the cause is a guard
this workflow was missing.

## What the runs actually say

| workflow | sha | result |
| --- | --- | --- |
| `verify` | `531b0a8` | **success** (run `31449432808`) |
| `deploy` | `531b0a8` | **skipped** (run `31449447980`, 1s) |
| `live-check` | `531b0a8` | **failure** (run `31449449788`) |
| `deploy` | `3814c57` | success |
| `live-check` | `3814c57` | **success, 13/13** (run `31449830025`) |

`3814c57` is `531b0a8` plus a `status: refresh` commit, so it carries the same
source.

## Why the failure was false

`deploy` runs on `workflow_run` from `verify` and guards itself:

```yaml
if: github.event_name != 'workflow_run' ||
    github.event.workflow_run.conclusion == 'success'
```

At `531b0a8` its triggering verify run had been **cancelled**, so deploy
correctly skipped. But a skipped job still *completes* — and `live-check` also
triggers on `workflow_run` completion, without that guard. It inherited the
trigger and not the condition.

So it ran against the artifact still live from `69f02ef` and reported:

```
FAIL  no bare composite score renders in either pick panel
  → "1.0" near: Passed on tonight — top game scored 1.0 — under the 3.0 watch-bar
```

**That is a real ADR-002 violation being reported against the commit that fixed
it.** The code under test was never on the page.

## The fix is confirmed live

The next run, against the artifact that does carry `531b0a8`:

```
PASS  no bare composite score renders in either pick panel
Field's Pick says: ... Passed on tonight — no game cleared the bar.
```

`passReasonText`'s fixed sentence, no numbers. The relay is still sending
`top game scored 1.0 — under the 3.0 watch-bar`; the page no longer renders it.

## The guard

`live-check` now carries the same condition as `deploy`. Scheduled and manual
runs are unaffected — there is no deploy conclusion to consult.

Worth naming the shape, because it is this session's fourth: **a check that is
correct about its subject and wrong about its timing.** nav-check knew one relay
route; tab-check used a global role selector; live-tabs-check counted three tabs;
this one tested an artifact that predated the commit it was blaming.

None of them were wrong about the feature. Each was wrong about the world around
it having changed.

## What this does not fix

A stale artifact can still be tested on the *scheduled* run, or when a deploy
succeeds but Cloudflare has not yet propagated. The workflow already warns when
the deployed stamp is not main HEAD, and that warning is exactly the signal that
would have explained this failure in one line — it fired and nobody read it,
including me.

Turning that warning into a failure is tempting and wrong: a docs-only commit
legitimately never deploys, and failing on it would train people to ignore this
workflow. The honest improvement is to print the stamp mismatch in the failure
text of every assertion, so a red check says which artifact it describes rather
than requiring someone to scroll. Not done here — recorded as the next step.
