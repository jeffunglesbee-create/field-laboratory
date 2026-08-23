# The cessation probe that could never observe a cessation — 2026-08-23

## The defect

`CC-CMD-2026-08-22-brief-sport-contamination` is a STOP-GENERATING ask: its
observable consequence is defects **disappearing** from the relay's soccer
briefs. `cc-cmd-followup.mjs` tracked it like this:

```js
const withText = rows.filter(r => (r.brief_text || '').trim() !== '')
if (withText.length === 0) return null
return withText.every(r => soccerBriefDefect(r.brief_text) === null)
```

`.every()` over whatever 40 briefs `/archive/query?sport=EPL&limit=40` returns,
with **no baseline**. So a single EPL brief written before the fixes deployed —
and never regenerated since — pins the ask at `still generating` **permanently**.
No number of clean briefs afterwards can clear it.

The sentinel has been printing `still gen` for it on every run. That was read as
"the defect is live". It is not evidence of that; it is evidence the probe cannot
answer the question.

**This is the same error the relay's `verify-staged-items.mjs` made three separate
times on 2026-08-22**, corrected three times the same way — check 1 filtered on
the game's date rather than the odds' write time, check 2 counted future
fixtures in the denominator, check 3 judged the leak fix by briefs written before
it deployed. Each correction wrote down the same sentence: *a fix cannot be
judged by rows it never touched.* This is a fourth instance, in the other repo,
found by reading `still gen` and asking what would have to be true for it ever to
say anything else.

## Why `created_at` could not fix it

The obvious repair is to gate on the timestamp the route already projects. It
does not work, and the relay already documented why (`src/index.js` ~5438): three
brief writers use `ON CONFLICT(id) DO UPDATE`, so `brief_text` is rewritten in
place while `created_at` never moves. Measured there: a brief carrying a
fabricated figure at 19:09, clean at 21:14, still reporting `created_at`
18:30:53.

Gating on `created_at` therefore **discards exactly the regenerations that prove
a fix landed** — the failure that note exists to record.

## The fix, in two halves (Rule 70)

**Relay `7bde535`** adds `updated_at` to the `/archive/query` projection.
Additive; nothing renamed or removed. Rule 60 — the relay owns the response
contract, so the field belongs there rather than being reconstructed here.

**Laboratory (this change)** gates the predicate on when a brief was written:

- `writtenAt(r)` prefers `updated_at`, falls back to `created_at`, and returns
  `null` when neither is present.
- A row with no timestamp **cannot testify**. The caller reads that as NOT
  OBSERVABLE rather than falling back to an ungated scan — a silent fallback
  would restore the unbounded behaviour this gate removes, and would do it
  invisibly the day the relay changed its projection.
- Baseline `2026-08-23T05:33:54Z`, relay `f2faa50` — the EPL league-table line,
  which is the **last** of the three fixes this ask covers. Defects 1 and 3
  shipped at 02:20 (`812bb5c`); a brief written between the two saw only half the
  fix, so the later deploy governs.
- Zero post-baseline briefs reads `null`, not `false`. An off-day for this
  question is not a live defect, and reporting it as one would nag the relay on
  every quiet run.

## Seven assertions the old predicate could not have passed

Every one of these would have been indistinguishable before the gate existed:

| assertion | result |
|---|---|
| a pre-fix dirty brief no longer pins it red | `null` |
| a post-fix dirty brief IS still a defect | `false` |
| a post-fix clean brief reads landed | `true` |
| pre-fix dirt beside post-fix clean reads landed | `true` |
| one post-fix defect among post-fix clean is not landed | `false` |
| a row with no timestamp cannot testify | `null` |
| `updated_at` beats a stale `created_at` on a regenerated brief | `true` |

The fourth is the shape that was stuck: history outvoting evidence.

The pre-existing six assertions were failing after the gate landed, correctly —
they carried no timestamps and so returned `null` under the new contract. They
now supply a post-fix timestamp, because their subject is whether
`soccerBriefDefect` **discriminates**, and the gate is held constant for that.
30/30.

## What this does NOT claim

**It does not say defect 2 is fixed.** It says the probe can now tell. Whether a
live EPL brief still calls a 3-0 a 0-0-0 stalemate is answered by the next
sentinel run against post-baseline briefs — and for the first time, that answer
will mean something.
