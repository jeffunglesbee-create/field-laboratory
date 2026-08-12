# The fix disarmed the guard — 2026-08-12

Jeff asked me to confirm CI was green on `ed701a6`. It was not.

Run 31551408060: **failure**.

```
FAIL  [workflow-cannot-run-step] a job that cannot run its own scripts is caught
      → mutation SURVIVED — .github/workflows/live-check.yml was broken and
        `node scripts/run-row.mjs "workflow jobs can run the scripts they invoke"`
        still passed. Nothing defends this claim.
36/37
```

## What happened, and it is a genuinely new shape

An hour earlier, `check:workflows` caught that `live-check.yml` ran
`render-check.mjs` without building, now that render-check imports
`build/Venues.js`. I added a build step. That fix was correct and necessary — a
verifier confirmed by deleting it that the job goes red *with no mutation at
all*.

And the fix **silently disarmed the mutation that had just caught me.**

`workflow-check` flags a job only when `needsBuild && !jobBuilds(job)`.
`jobBuilds` is `/npm run build/ || /dotnet fable/` over the whole job text. The
mutation works by *injecting* a build-dependent step and expecting an objection —
which requires the job to have no build. The moment the job had one, the
conjunction could never fire, and the mutation became a no-op that passed every
run.

This is not "a mutation whose anchor drifted". The harness catches that loudly —
there is a dedicated `the mutation anchor still exists` check. **This is a
mutation whose *precondition* was removed by an unrelated and correct change,
which the harness cannot detect except by the mutation surviving.** A guard that
depends on the ABSENCE of something is disarmed by anyone adding that thing, for
good reasons, without ever touching the guard.

## The fix, and why not the obvious one

The obvious repair is to invert the mutation: delete the build from
`live-check.yml` and require the objection. It works today, and it carries the
identical risk in mirror image — if `render-check` ever stops importing `build/`,
the inverted mutation goes silent exactly as its predecessor did.

So it moved to `status.yml`, which is **build-free by nature**: it probes live
URLs and reads git, and there is no plausible future in which it compiles F#.
Verified killed, `5/6`, with the failure text
`status.yml:status runs scripts/window-check.mjs — which import build/ — but never builds`.

The stale comments in `live-check.yml` that said "this job has no .NET and no
build step by design" are corrected, with the reason recorded. Deleting a false
premise without saying why it changed invites the same rot.

## The audit found something worse

Three read-only agents audited the surrounding work. One found a blocker that
had nothing to do with the mutation:

**`npm run check:live` could not start.** I put the new chip block after
`await browser.close()` — the identical mistake I made in `nav-check` an hour
earlier and wrote up in the previous entry. `page.$$eval` threw immediately.

It hid for two reasons, both worth naming:

- `check()` only pushes and `summarize()` prints, so the crash produced **no
  output at all** — not a failing assertion, an uncaught exception before
  anything printed.
- A **pinned** run skips the block, so `check` and `check:hard` were 13/13 green
  locally while the unpinned path could not run. And CI failed at mutation
  testing, six steps before it would have reached `check:live`.

Fixed by reading the chips before the browser closes. Unpinned now reports 18
named results.

## And the vacuous passes it found

- **`expected === 0`.** With no known venue on the slate, `filled.length ===
  expected` is `0 === 0` and all three chip checks go green having proven
  nothing — and they fail *together, in agreement*, because a chip can only fill
  for a venue the table carries. Table coverage is now its own assertion.
- **`.catch(() => {})`** on the wait. A swallowed timeout is a check that cannot
  fail. Now captured into a named check.
- **`nav-check` waited on slots EXISTING**, which `Scoreboard.fs` renders
  synchronously — so the wait returned on the first poll and the assertions
  raced the fetch. Under a 1.2 s stub delay it went red with three of four
  checks vacuously green. Now waits on the filled count.
- **"at least one card carries a chip"** passed with one of two blanked. Now
  `=== back.cards`.
- **The wet direction had never rendered.** The stub served a dry reading, so
  "names no precipitation" was satisfied by a chip that could never name any.
  nav-check now re-routes to a rainy payload, navigates again, and requires
  `61°F · rain`.

`check:nav` went 22/22 → **25/25**.

## One thing the audit got wrong, and I am recording it

The first analysis argued that a units regression — Celsius arriving where `degF`
is assumed — would reach the chip uncaught. The verifier refuted it by
experiment: dropping `&temperature_unit=fahrenheit` from the compiled output
takes `VerifyMain` from 35/35 to 34/35, because `Suite.fs` already pins it with
`temperature_unit=celsius` as the counterexample. Only the narrow point survived
— `includes('61')` would accept `161°F` — and the regex is anchored now.

Also added: `workflow-shallow-history`. The history half of `workflow-check` had
**no mutation at all** — it was exercised only by the detector's own in-file
fixtures, never against a real workflow. `fetch-depth: 0` → `1` on `verify.yml`,
killed.

CONFIDENCE: 96.

Artifacts: run 31551408060's log quoted above; `workflow-cannot-run-step` and
`workflow-shallow-history` both killed; `check:nav` 25/25 including the wet
direction; unpinned `render-check` reporting 18 results instead of crashing;
pinned `check` 13/13; `check:workflows` 6/6; the gate.

Docked four: the corrected `check:live` block has still never completed against
real egress — this sandbox 403s Open-Meteo, and every unpinned assertion here
failed for that reason rather than passing. The run this commit triggers is the
first that can execute it.
