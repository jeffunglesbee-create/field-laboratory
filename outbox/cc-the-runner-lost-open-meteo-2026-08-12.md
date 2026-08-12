# The runner lost Open-Meteo — 2026-08-12

Jeff asked me to confirm CI on `e36d326`. It was red, and so were the two
commits before it.

| commit | run | failure |
| --- | --- | --- |
| `e36d326` | 31632156907 | **only** step 33 — Open-Meteo `fetch failed` |
| `40c6868` | 31616402291 | **only** step 33 — same; every other step green, gate 480/480 |
| `201a20c` | 31613671544 | mutation-check 37/38 — all 37 listed mutations PASSED, so it was the unmutated-tree baseline. Did not recur on the next commit |

## The finding, which contradicts a premise I have used all session

**`api.open-meteo.com` is unreachable from GitHub-hosted runners.**

It was reachable yesterday. Run 31543404607 at 23:07 on the 11th read all 35
venues and is where the Comerica/Detroit error was caught. Three runs today —
15:41, 16:42, 19:51 — all report `fetch failed` at the connection level after
about ten seconds. Nothing in this repo changed in between.

"Use a GitHub Actions runner, it has egress" has been the answer to every
sandbox limitation for two days. It is not a property of runners; it is a
property of a runner and a particular host, and it can stop being true without
anything on our side moving.

## The fix, and why it is not the softening it resembles

Turning main permanently red on somebody else's outage is a check reporting the
wrong subject. Making an outage pass silently is the softening this session has
spent two days refusing. The repo already had the rule that separates them, in
`pick-live-check`:

> An HTTP failure is reported and not fatal (the bundle may not exist for a given
> date); a 200 the decoder cannot read is fatal, which is the actual assertion.

Applied here as a split between two jobs that answer different questions:

- **verify** — *is this commit correct?* A third party being down is not evidence
  about the commit. `--tolerate-unreachable` prints `::warning::`, says what did
  not run, and exits 0.
- **drift-sentinel** — *is the world still as we assumed?* The same script,
  daily, **without** the flag. There an outage is the finding and stays fatal.

The hazard is named in the source rather than left implicit: if unreachable were
tolerated everywhere, the check could pass forever having never run. It is
tolerated in exactly one job, the daily sentinel cannot be silenced, and the
toleration is visible in the run rather than absent from it.

Toleration covers a **thrown** fetch only. A 403 with a body is a real answer and
still fails — which is what this sandbox returns, and why the check is red here.

## And it was crashing, not failing

Making the outage visible exposed a second bug of the shape I have now hit three
times: the venue loop called `res.json()` unguarded, so an unparseable body threw
and the script produced **no check results at all** — the same class as reading
`page` after `browser.close()`.

Every venue failure is now a named mismatch, and the sign-flipped probe has its
own check for whether it got an answer to compare. The script reports 9 named
results here instead of a stack trace.

CONFIDENCE: 96.

Artifacts: the three run IDs and their step-level conclusions, quoted above;
run 31543404607 as the counter-example that Open-Meteo *was* reachable on the
11th; `check:workflows` 6/6 over the edited verify.yml; the script producing 9
named results locally where it previously threw; the gate.

Docked four: the tolerant path has not run on a runner. It is new, and whether
Open-Meteo's outage is still in effect when this commit's run reaches step 33
decides which branch executes — so the branch that gets exercised is chosen by
the outside world rather than by me. The daily sentinel's fatal path is likewise
unrun.
