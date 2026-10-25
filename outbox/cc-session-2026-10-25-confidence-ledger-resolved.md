# Confidence ledger resolved (2026-10-25)

main's `docs/confidence-log.jsonl` and `docs/scale-log.jsonl` lacked the records of
the gate runs that scored the venue work. They were lost when the session branch
history was rewritten, not because the runner failed to record them.

## What was recovered, and from where

Every line below was copied byte for byte from a commit or branch that holds it,
by `git diff <record>^ <record>` and `git show <ref>:<file>`. No score was typed.

| gated sha | confidence id | source of the line |
|---|---|---|
| 7d25a9f7acbd | 7d25a9f7acbd-dd22476cf2d6 (530/530) | record commit d9a757fa6e84, scale line too |
| 19de8bd186f3 | 19de8bd186f3-7f9fd65649f6 (530/530) | record commit be946504e316, scale line too |
| c14373272a9d | c14373272a9d-752591e1e934 | origin/ccr-db13c105-6wz2mo ledgers (confidence and scale) |

Replay was union-append: a line is added only if no identical line exists. Nothing
was dropped or rewritten. Result: confidence log 57 -> 60 lines, scale log 28 -> 31.

## Runs with no record, and why

Runs 47 and 49 have no line anywhere. Their gate step failed, and the runner skips
the "Record this measurement" step when the gate step fails, so CI never records a
failing run. Run 49 scored 510/530 (stated in its repair commit message; that figure
is the commit message's, not a ledger line). An absent line there is a fact about CI,
not a gap to fill. Nothing was reconstructed for them.

## Correction to an earlier statement

An earlier check in this session found "no record for the venue commits". It searched
main's commit shas, but the ledger is keyed by the gated sha, which main never
contained after the history rewrite. The check could not have found them. The records
existed on the record commits above.

## Checks run

`node scripts/confidence-record-check.mjs`: 3/3 passed. Same-id lines agree: no
duplicated id in either ledger. One id-less line exists in the confidence log; it is
on main already and was not touched.
