# Empowerment metrics: four rule citations corrected — 2026-10-16

The owner's fae6b6b and f86390f landed while `b6f1fcf` (the four empowerment
metrics) was being pushed. They correct a bare "Rule 91" in the CC-CMD:
STANDARDS.md's Numbering caution says three registries diverge above 88, its own
Rule 91 is SCOPE-LEGIBLE-A, and SAMPLE-COVERAGE-A is Rule 91 only in
`field-relay-nba/CLAUDE.md`.

`b6f1fcf` had copied the same bare citation four times, in comments:

| file | was | now |
| --- | --- | --- |
| `scripts/flow-census.mjs` | coverage line states N of N (Rule 91) | SAMPLE-COVERAGE-A, `field-relay-nba/CLAUDE.md` |
| `scripts/gravity-census.mjs` | coverage printed beside the verdict (Rule 91) | SAMPLE-COVERAGE-A, `field-relay-nba/CLAUDE.md` |
| `src/Stamina.fs` | Insufficient is a sibling (Rule 91) | Rule 99, DISTINGUISHABILITY-A — the owner's correction of the same sentence |
| `src/Stamina.fs` | thresholds printed beside the numbers (Rule 91) | SAMPLE-COVERAGE-A, `field-relay-nba/CLAUDE.md` |

Comments only. Measured on this tree: `dotnet build` 0 FS/NU warnings,
`node build/VerifyMain.js` 294/294, both census self-tests green (11/11, 13/13),
quick gate 270/270 on run `b6f1fcf5df08-42e9490187a2`.

**Not changed, and counted instead (TOUCH-ONLY):** bare "Rule 91" citations that
predate this session remain: 20 mentions of "Rule 91" across 18 files in
`scripts/` and `src/` (`git grep -c 'Rule 91' -- scripts src`), e.g.
`scripts/axis-check.mjs:94` (`Rule 91: the denominator travels with the result`),
`scripts/checks.mjs:281` (`Rule 91: the cap's own denominator is annotated`),
`src/Suite.fs:1226` (`COVERAGE, stated where the result is read (Rule 91)`). They
are the same misattribution the owner corrected and want their own commit.
