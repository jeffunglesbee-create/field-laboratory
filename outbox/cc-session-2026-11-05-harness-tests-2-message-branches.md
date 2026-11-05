# Session record: the harness's refusal messages are asserted

**Date:** 2026-11-05. **Scope:** residuals CC-CMD `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 10 item 11 (`scripts/mutation-check.mjs` only; assertions and table entries, no message changed). Assignment H3, commit 2 of 4.

**Why this file exists.** `check:staged-outbox` requires an `outbox/` path in every commit that stages `scripts/`, and the assignment says not to edit existing outbox files. New file, nothing existing touched; fold it into the session document or drop it when merging.

## Probe, before building (Rule 100)

On this clone, 2026-11-05, after the previous commit (the HEAD-moved message), each of the five mutations the residuals item implies was applied to a copy of `scripts/` and run against its `--self-test`: (1) drop the `, and N more` tail of the path list, (2) list every path, (4) drop `(kill -9 if it ignores a plain kill)` from the live-marker refusal, (5) the same from the run-lock refusal: all four `149/149 checks passed`, so they survived. (3) delete `it changed after the kill`: caught by the previous commit's clauses (145/149), so that branch was no longer a gap; it is a table entry here and an assertion on the edited-path refusal.

## What was built

Four clauses: (a) the edited-path refusal says `it changed after the kill` and not `HEAD`; (b) eight edited paths read `(out/p0.md ... out/p5.md, and 2 more)` and not `out/p6.md`, and exactly six read as six names with no `and N more`; (c) the live-marker refusal says `stop it (kill -9 if it ignores a plain kill)`; (d) the run-lock refusal says the same. Five table entries, one per message branch: `refusal-forgets-to-count-the-rest`, `refusal-lists-every-path`, `refusal-forgets-the-edit-came-after-the-kill`, `live-refusal-drops-the-kill-advice`, `lock-refusal-drops-the-kill-advice`.

**Two choices, both mine.** Each assertion is its own clause with its own label, not an addition to an existing clause, so that a red clause names the message that changed. The six-path clause also asserts the bound (exactly six prints no count), which the residuals item did not ask for: a hand mutation `ks.length > 6` to `>= 6` is red at 150/153 and is not a table entry (the five entries are what the item named; each entry costs about 16 s of gate time).

**Not identified.** The residuals item names "one clause label" that asserts nothing. A scan of the self-test's check labels for ones that claim a message with no text assertion beside them found six candidates, each asserting through other means. Needs the reviewer's reference.

## Verified

- Self-test: 149 clauses before, 153 after (4 new), all green on the unmodified messages.
- Red per entry, by hand, against the self-test: `refusal-forgets-to-count-the-rest` 150/153 (clause (b)); `refusal-lists-every-path` 150/153 (clause (b)); `refusal-forgets-the-edit-came-after-the-kill` 148/153 (clause (a), and two clauses from the previous commit); `live-refusal-drops-the-kill-advice` 150/153 (clause (c)); `lock-refusal-drops-the-kill-advice` 150/153 (clause (d)). The two nested-self-test clauses also go red in every case, as their cascade.
- The five entries through the harness (`--ids`): 6/6 checks passed (5 caught, plus the baseline), tree restored, `git status` shows only the file changed here.
