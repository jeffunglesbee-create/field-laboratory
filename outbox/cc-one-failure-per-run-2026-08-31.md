# One failure per run is arithmetic, not luck

**Date:** 2026-08-31
**Scope:** `.github/workflows/live-check.yml`

Seven rounds this morning, each revealing exactly one new problem, each costing a
~6-minute run:

| round | step | cause |
|---|---|---|
| 1–3 | brief phase | `cards.find` took a duplicate stub |
| 4 | brief phase | AMBIGUOUS failed the rule holding twice |
| 5 | page load | empty slate thrown as a `TimeoutError` |
| 6 | pick tabs | `/Gate /` with no empty-slate branch |
| 7 | stats cards | `.st-card` with no empty-slate branch |

Rounds 5–7 are **one fact** — a slate with no games, between midnight ET and the
first fixture — meeting three assertions that had never seen one.

## Why they arrived one at a time

A failing step ends the job. `live-check` has five assertion steps about the
deployed page and **none carried an `if:`**, so every run reported the first
failure and nothing about the four behind it.

Rounds 6 and 7 were already present during round 5. The job just never got to
them.

## Five assertions, one page, no dependency between them

```yaml
if: "!cancelled() && steps.landed.outcome == 'success'"
```

`!cancelled()` rather than `always()`, because a cancelled run has nothing to
say.

**Gated on `landed`, which is the whole reason not to use `always()`.** The two
steps above these do not assert about the page — they establish *which artifact
the page is*:

- `The deployed build stamp matches main` — warns, never fails
- `The deploy landed` — `--strict`, fails when the published commit is behind
  the newest deployable one

If that gate fails, every assertion below describes some other build. Running
them anyway would produce five confident findings about the wrong bytes.
**Fail-fast is correct there and wrong below it.**

This session demonstrated the failure mode twice, both times my own doing: I
dispatched `live-check` before a deploy landed, and the gate stopped the run —
correctly. With a blanket `always()` those runs would have reported page
findings against the previous artifact instead.

## What this does not change

Any failing step still fails the job. Nothing is downgraded to a warning, no
assertion is relaxed, and the empty-slate states added in the last three commits
stay exactly as they are. The only change is **how many of the truths a single
run is allowed to tell.**

## Verified

```
npm run check:workflows    9/9
```

---

## The green run does not prove what it looks like it proves

`live-check` went **green on `5bcc1db`**, all steps, zero failures. That is not
the empty-slate coverage being confirmed.

The run is timestamped **11:59 UTC — 07:59 ET**. Hours passed between the commit
and the run, and today's fixtures exist:

```
PASS  a records row names BOTH teams, never half a line
PASS  every pitcher row carries a name
5/5 checks passed
```

Everything passed because the slate is populated. The `if:` guards shipped
correctly and were never exercised — with nothing failing, there was nothing for
them to reveal. **Round seven's assertion is still unfixed**, and would have
reddened again after midnight ET.

Recording this because a green run at the wrong hour is exactly the kind of
evidence this session keeps catching itself misreading: `$?` after a pipe,
"failed again on attempt 2", and now "green, therefore fixed".

## Round seven, fixed from the evidence rather than from a rerun

`scripts/schedule-live-check.mjs` already reasoned about empty states twice:

```
NOTE  no records row rendered. Correct when the slate has no MLB game
      whose venue resolves to a park.
NOTE  no pitcher row rendered. Correct when no starter has been announced.
FAIL  the page rendered stats cards at all
```

Two NOTEs and a flat assertion, in one file, about one page. The bounded wait
above them (`waitForSelector(...).catch(() => {})`) shows the author already
knew the selector "may legitimately never appear".

`deskCards` separates the two facts. An empty slate renders no desk cards
either, so zero-and-zero is a day with no games and gets a NOTE. Desk cards
present with no stats cards is the panel actually failing, and still fails —
with the count in the message, so the distinction is visible in the log rather
than only in this comment.

That is the third and last of the empty-slate assertions found on 2026-08-31.
The next one, if there is one, arrives in a single run rather than a seventh.
