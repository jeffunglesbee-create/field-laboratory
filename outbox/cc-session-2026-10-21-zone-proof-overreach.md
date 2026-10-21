# docs/ZONE-PROOF.md no longer says the 18-game slate ruled out UTC

CC-CMD: `docs/CC-CMD-2026-10-20-zone-proof-overreach.md`. Docs only: no
`src/`, `scripts/` or workflow file changed, and `docs/**` is in `verify.yml`'s
`paths-ignore`.

## TASK 0, probed before editing

- **The sentence was still as quoted**, on line 22 of `docs/ZONE-PROOF.md` before
  this change, and the
  corrected source comment (in `src/Desk.fs`, beginning "What that test CANNOT see") was
  present on main (`4d36156`).
- **`grep -rn "inconsistent with UTC" docs src scripts`** found one live copy,
  this one. The others were the CC-CMDs that quote it.

## The doc had the defect in three places

The CC-CMD named one. Reading the whole file found the same claim twice more, and
fixing only the named one would have left the page contradicting itself:

1. **The conclusion** (line 22): "consistent with ET and inconsistent with UTC".
   Replaced by the direction the slate does bound, then what it cannot see (a
   UTC-keyed row scores *same-utc-day*, which correct ET keying also produces for
   every game not crossing UTC midnight), then a new section "Measured again, per
   row" with the discriminating form.
2. **The framing** (line 9): "Genuinely unknown". Kept, dated to when it was
   written, and pointed at the per-row answer.
3. **"What this does not claim"**: "consistent with ET and rules out UTC", and
   the AFL gap explained by zone geometry. Rewritten: the slate does not rule out
   UTC; the per-row measurement is what establishes ET; the AFL reason is that
   all 138 rows have an empty `start_time`.

The original measurement block (`MLB:starts-after-date=6 ...`) and the rest of
the doc are untouched: the window table, the mechanism, the proofs and the
"version that was not enough".

## Numbers, and where each came from

- **2026-10-20, measured by me** against live `field-archive`, the CC-CMD's own
  SQL: CFB 100, CFL 13, FIFA World Cup 6, MLB 334, MLS 133, NBA 36, NFL 36,
  NHL 84, WNBA 105: 847 ET, 0 UTC, 0 neither. AFL 138 of 138 with an empty
  `start_time`. (Recorded in
  `outbox/cc-session-2026-10-20-relay-date-keying-comments.md`.)
- **2026-10-17, not measured by me**: 821 ET, 13 UTC, 0 neither is quoted from
  `docs/CC-CMD-2026-10-16-relay-date-keying-comment-corrections.md`, and the doc
  says so.
- **The ET offset** was UTC-4 for the probe. Said in the doc, with its reason
  (every row queried is dated 2026-03-09 to 2026-10-31, inside daylight time).

One sentence was reworded after a first draft: "thirteen CFL rows were UTC-keyed
while this section stood" implied all 13 predated the section, which was not
checked. It now says "by 2026-10-17", with the section still standing.

## Verified

- `grep -n "inconsistent with UTC" docs/ZONE-PROOF.md` prints nothing (exit 1),
  the CC-CMD's done condition.
- The proof blocks (`<!-- proof: FS0001 -->`, `FS1093`) are untouched.
- The commit passed the pre-commit hook (doc claims, citations, history).

## Not covered

- The doc is prose. Nothing here fails if it drifts again; the guard that can is
  the relay's `check-archive-date-keying.mjs`.

## Gate and landing

- **`verify-full` run 39673531529 scored 530/530 (100)**, mutation baseline 0
  failing across 181 mutations (65 distinct expectations), on tree `8b70ed9`,
  which is `98c4ad3` plus one scale-log line. The record says `dirty: true`, the
  known runner artifact earlier records here carry too; no score is cited from it
  in any document.
- **Landed on main** as a cherry-pick of `98c4ad3`, then the gate's records. The
  three record commits conflicted on the append-only ledgers because other
  sessions had appended to them; each was replayed by appending its own added
  lines to main's file, none dropped.
- **It took two dispatches of mine, and the first failed for a reason that was not this tree.**
  The workflow has `cancel-in-progress` concurrency, so the gate is one lane for
  every session on the account. A tab-strip session dispatched at 18:00Z and
  cancelled my first run at 19 minutes (39646095894); its run was then cancelled
  by its own next dispatch (39648850506, 18:48Z); the run after that finished green
  (39658086563, 20:42Z); my second dispatch started at 20:48Z and finished. Re-dispatching
  while another session's run was in flight would have cancelled that run, so I
  waited rather than race. The cancelled run's scale step had already pushed a
  scale-log line for `98c4ad3`, which is why the gated tree is `8b70ed9`.

