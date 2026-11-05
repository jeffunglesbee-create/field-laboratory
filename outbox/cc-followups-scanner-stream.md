# Scanner follow-ups of the residuals CC-CMD: what each commit did

CC-CMD: `docs/CC-CMD-2026-11-03-gate-hazard-residuals.md`, Task 9 and Task 10 items that live in `scripts/row-confidence.mjs` (the scanner under the gate row "every gate row has teeth and is deterministic").

This note exists because `.githooks/pre-commit` (`check:staged-outbox`) refuses any commit that stages `scripts/` without an `outbox/` path, and the building agent was told not to edit the owner's write-ups. It is one new file, named without a date so the gate row "this session wrote its outbox" is not satisfied by it. The owner's session doc replaces it; delete it when that lands.

## 9.4 with 10.5: bracket balance over the scripts a row names, and the harness clause on the property

- Premise commands, all run on the tree before building: the self-test read only `scripts/mutation-check.mjs` of the row scripts; the current scan leaves 0 of 168 scripts unbalanced and the three-regular-expression scan it replaced leaves 96 of 168 (12 of the 21 scripts rows name); the refactor `BASELINE_AT = RUN_STARTED_AT` took the self-test to 14/15.
- One premise did not hold: the probe's splice anchor `const guardOf = ` is in the file once and in the region the harness mutates 0 times, so an entry on it is stale. An entry holding the guard's own words moved the guard into the table and made 2 existing entries ambiguous. The clause splices at `\nconst applyMutation = ` instead.
- Built: one balance clause (21 scripts, 3 controls the old scan fails, prints `checked N of M`), the harness clause rewritten, 11 table entries.
- Evidence: all 11 entries run through the harness with `--ids` (11 of 11 caught, each by the one clause it names); the balance clause is red on a tree whose scanner is the old three-pass scan. Self-test 15/15 to 16/16.

## pickem-check.mjs: the day is captured once (Task 9 item 1, the script half)

- Premise command: in a scratch copy with template expressions revealed, `node scripts/row-confidence.mjs` read `70/100 ... pick'em grades only finished games ... scripts/pickem-check.mjs: reads the clock 1x` and `22/23 rows at or above 95`; with this fix in the same copy, `23/23`.
- Changed: `const FIELD_DAY = fieldDay()` above `const DATE`, and the template reads `${FIELD_DAY}`. 2 lines in 1 file; `DATE` was already computed once at the top, so behaviour is the same: `pickem-check.mjs` is 24/24 before and after (3.8 s each), and the existing entry `pickem-date-pinned-to-the-past` is still caught through the harness.
- This commit changes no score: the scanner still hides template text. The entry that defends the capture arrives with the commit that reveals templates.
