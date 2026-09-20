# The drift sentinel caught the published skill moving, and upstream had adopted this repo's carve-out

**Date:** 2026-09-20
**Found by:** `drift-sentinel` runs 103 and 104, both red at step 8.

## What was red

```
::error::.claude/skills/i-have-adhd/SKILL.md has drifted from source
         — re-run without --check to reinstall it verbatim
```

**The local file had not changed since `606c22d`, 2026-08-22.** Nothing in this
repo drifted. The published source moved, and the check — which exists to catch
a hand-edit or a partial reconstruction — reported the movement correctly from
the other direction.

## The change: one rule, and it is this repo's own carve-out

```diff
-### 9. Cap lists at 5 items
+### 9. Cap lists to 5 items

-If a list grows past five, split into "do now" vs "later," or "must" vs
-"nice to have." Five items ranked beats ten unranked.
+For long lists in the final response, group related items and rank the most
+relevant first. Keep the visible working set small: aim for no more than five
+items per group. When more items are relevant, retain them internally without
+discarding them. Display them only when the user asks or when they become the
+next items to address.
+
+Never omit relevant items when completeness matters. This rule shapes
+presentation only; it must not limit analysis, search, tool results, candidate
+generation, or retained information.
```

CLAUDE.md has carried this since adoption:

> **Rule 9 caps prose lists, not measured data.** A 5-item cap would have
> truncated the workflow-minutes table, and that table was the answer.

That is the same exception, reached independently. Upstream now states it in the
skill itself, so there is nothing local left to except. CLAUDE.md records the
history rather than deleting it — the carve-out was reached from a measurement,
and the measurement is still why it is right.

## What this costs, and what it does not

Nothing in this repo needed correcting. The skill is reinstalled byte-identical
(7207 bytes, 142 lines, `diff` clean against the source). The sentinel goes
green on its next run.

## The step that was skipped behind it

`drift-sentinel` step 8 failing skipped **step 12, "Sport registry covers the
relay's whole vocabulary"** — a BLOCKING gate, added deliberately as blocking so
that a competition the relay starts carrying stops the run on the day it becomes
true rather than on the morning it first plays.

Two runs, twice unobserved, for a reason it had nothing to do with. It is the
same shape as `verify` step 25 hiding forty-three checks, one workflow over and
on the same day.

**`run-steps.mjs`, committed hours earlier, would report exactly this — and it
does not see it.** It is wired to `red-main-issue.mjs`, which fires from
`status.yml` on a red `verify`. `drift-sentinel`'s reds never reach that path.
Naming the gap rather than closing it: widening the sentinel from "main is red"
to "a scheduled watcher is red" changes what the issue means and what closes it,
and that is a decision of its own.

## Verification

| check | result |
|---|---|
| `check:adhd-skill` | 4/4 self-test, `ok — byte-identical to source (7207 bytes)` |
| `diff SKILL.md <upstream>` | no output |
| `check:workflows` | 9/9 |
| `check:script-orphans` | 3/3 |
| `check:import-purity` | 2/2 |
| `check:short-circuit` | 5/5 |
| `check:citations` | PASS |
| `check:docs` | 3/3 |
| `check:sport-vocabulary` | **UNRUNNABLE here** — `RELAY_SHARED_SECRET` is not set in the sandbox, and the script fails loudly rather than skipping. It runs in CI, where the secret exists. |

`npm run sync:adhd-skill` — the CROSS-REPO propagator — returned `HTTP 401` for
both `field-relay-nba` and `jubilant-bassoon`: no sibling-repo token here. Those
two copies are still on the old Rule 9 and this session did not change them.
The propagator runs in CI with `SIBLING_REPO_TOKEN`.

## A separate observation, recorded not acted on

Both crons are firing hours late. Declared `0 12 * * *` and `30 1 * * *`; runs
103 and 104 started at **06:30** and **15:51** UTC. That is GitHub's scheduled-
workflow queueing, not a repo defect, and the relay's own notes already record
a similar delay on its odds crons. It matters here only because the 01:30 run
is chosen to land inside the ET/UTC disagreement window, and a five-hour delay
moves it outside.
