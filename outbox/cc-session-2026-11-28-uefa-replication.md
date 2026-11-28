# Session record: the UEFA replication of candidate U (2026-11-28)

**Status: IN PROGRESS.** Written before the rule's final commit (the rule names this file); the numbers and hashes of later steps are added by later commits to this file, and a later commit that changes a statement says so in its message. Rule 67: HEAD progression, what was built per commit, what was verified against what is staged, open carry-forwards.

## The owner's instruction and the five ideas it chose from

The owner asked "What novel thinking accomplishes the UEFA forecaster?", then "Explore #3 first. We want the full forecaster." (done: `outbox/cc-session-2026-11-28-uefa-prior-exploration.md`), then "Now 1 and 2" and, mid-turn, "Meant ideas 1 and 2". The five ideas were the assistant's answer in that conversation (not previously in the repo; recorded here so the rule's header can cite them):

1. **Backward holdout, read-only.** Freeze the constants at 1.34 / 1.97 / 0.18, commit a rule before any 2024-25 result is read, score U on the 2024-25 league phase (ESPN lists 189 + 189 + 153 completed events). About 234 forecasts.
2. **Sequential test.** The answer proposed ±ln 20 Wald boundaries between "no skill" and "the cross-validation effect". **This record states the change:** the rule uses a two-look group-sequential test instead (one-sided total alpha 0.05, Bonferroni 0.0125 / 0.0375), because a Wald test needs a point alternative and the project has measured the standard deviation of the paired difference at 0.212 and at 0.315, so an assumed one would make it overconfident or under-powered (rule, CHOICES MADE WITHOUT DATA).
3. **Give the model a prior** (explored first; not built; the prior-source decision is the owner's).
4. **Show the price where one exists** (an owner decision with a measured Odds API cost; not touched).
5. **Change the deliverable to league-phase stakes** (arithmetic classification; not touched).

The recommendation was "run ideas 1 and 2 as one pre-registered replication". The owner's instruction took that form.

## What this costs later candidates (stated before any data)

U scored on 2024-25 at Look 1 makes 2024-25 not blind for any later candidate (a prior, ClubElo, anything). If Look 1 does not cross, the 144 forward 2026-27 matches are scored at Look 2 and are spent too. If Look 1 crosses (BUILD or DO NOT BUILD), the forward matches stay unspent. The exploration record's clean-data budget (section 4) lists these two sets as the clean ones for a new candidate; this replication uses them for U.

## Order of the work, with the commands that tested each premise (Rule 100)

| premise | the one command that tried to refute it | result |
|---|---|---|
| A status rule of "every completed event is FULL_TIME" is safe | categorical census of the 2024-25 window (run 46095464139, counts only) | refuted: 4 / 5 / 7 completed events per competition are AET or PEN; the rule became version 2 |
| The forward window 2026-08-01 to 2026-11-26 holds only league-phase events on the three slugs | census (run 46098677826) | 90 / 90 / 72 events, all completed, all `league-phase`: the same counts as the frozen bundle's 252 |
| No league-phase match was played on 2026-11-27 or 2026-11-28 | census (run 46100707804) | no event on any of the three slugs on either day |
| The archive's frozen bundle can serve as a club-id reference | `node` over the frozen bundle | refuted: it carries club names, 37 raw names for 36 clubs in the Champions and Europa League (spelling variants), so the frozen check compares espn_event_id, scores and start times, never club ids |
| The frozen bundle's start times are one format | `node` over the 252 rows | all `dddd-dd-ddTdd:ddZ` |
| G3 (k): a fresh ESPN read of the frozen window equals the pinned frozen bundle (ids, scores, start times) | the collector in bundle mode on 2026-08-01 to 2026-11-26 (run 46102782008, commit 08703e46), compared with the pinned file by `node` | holds: 252 ids, 0 missing, 0 extra, 0 differences in home score, away score, start time or date; start times all `dddd-dd-ddTdd:ddZ` |

The exact comparison, run on the recheck bundle committed in `08703e46` (`git show 08703e46:outbox/forecast-uefa-data-2026-27-recheck-2026-11-28.json`) against the pinned `outbox/forecast-uefa-data-2026-27-frozen-2026-11-27.json`, matching on `espn_event_id`: `read rows 252 pinned 252; {missingFromRead: 0, extraInRead: 0, homeScoreDiffs: 0, awayScoreDiffs: 0, startTimeDiffs: 0, dateDiffs: 0}`; the read's tallies were completed 90 / 90 / 72, skipped 0, dateMismatch 0, invalidScore 0, duplicates 0, HTTP 200 x 354. The comparison was an inline `node -e` over the two files, not a committed script; it is G3 (k)'s comparison done by hand, and the tooling's own (k) is exercised by the check script (on the same 252 rows turned into ESPN-shaped events plus synthetic forward matches).
| G3 (d), (e), (g), (h), (i), (m): the 2024-25 calendar has 144 / 144 / 108 league-phase matches by the counting rule, 36 clubs each all on exactly 8 / 8 / 6, no same-date repeats, every league-phase match STATUS_FULL_TIME, 90 / 90 / 54 eligible forecasts | `scripts/uefa-structure-census.mjs`, a standalone second implementation of the counting rule, counts only (run 46104147304, commit 2e5238df) | holds on all of them; 45 events per competition follow the league phase |
| An implementation of U written from the rule text equals the earlier tooling's | the check script's known answers A and B | A: the frozen 2026-27 bundle gives n 90 and the earlier result's Brier U, Brier base, mean D and z to 1e-9; B: the 2025-26 rows give 234 eligible forecasts with outcome counts (122, 43, 69) and the same gaps as the earlier `prepare()` |

## Review

Five rounds of independent review, each by separate agents told to refute (not to approve), all before any 2024-25 row was written to disk or printed: round 1 on version 1; round 2 (three lenses) on version 2; round 3 (three lenses: consistency and implementability, statistics and process, claims against the repo; 17, 13 and 13 findings) on an earlier text of version 3; round 4 (the same three lenses; 16, 15 and 13 findings) on the text that round 3 produced; round 5 (a narrow one, on the diff since round 4) on the text that round 4 produced. Every round found real defects in text the previous round had not seen, so the number of rounds was set by when a round's findings stopped being blocking, not in advance.

Round 3's blockers: a G3 that could not hold for the pinned frozen file, and an unspecified stop-versus-verdict. Round 4's blockers: an independent-recomputation clause with no artifact that the gate could read, and a G3b that reproduced the Look 1 z but not its verdict (an edited `verdict` key could have started a Look 2 after a Look 1 crossing). Both rounds' fixes are in the rule's VERSION paragraph. Findings not adopted, with reasons: gating on a clustered standard error (a change of test; the size under dependence is stated instead, with a committed sensitivity script and the finding that it is not measured anywhere in the project); restricting (g) and (j) at Look 2 to scorable rows (the repair-pending wait handles an irrelevant anomaly without a second rule); a Look 1 deadline (the programme can be abandoned by inaction, which can end a look without a verdict and cannot produce a favourable one; the rule says so).

Decisions taken because of review, each with the rule text that carries it: the tooling cuts the RULE block from the rule file's bytes and evaluates that text (`scripts/uefa-replicate-rule.mjs`), so nothing in the file's unhashed tail is what a verdict runs through; the scoring is its own module whose sha256 is recorded in each bundle's data commit message and in the Look 1 result and compared at Look 2 (G3 (n)), so a repair of a G3 check cannot change the scoring; the independent recomputation is a record committed by the same workflow run (`agrees`, `zAgrees`), the Look 2 gate is inert without an agreeing Look 1 record, and only a verdict disagreement voids a look; the Look 1 result records the bundle it scored.

## The independent implementation (written before the rule was committed, so its ambiguities could still be fixed)

A separate agent was given the rule text only (`node outbox/forecast-replicate-uefa-2026-11-28.mjs --print-rule`), the two known-answer data files, the alias map, and the synthetic fixtures, and told not to read the run tooling, the scoring module, the check script, the fixture exporter, the structure census or the earlier fit's code. Its tool calls were read afterwards (counts of file names in its transcript): it listed `scripts/` once and opened none of the forbidden files. It wrote `scripts/uefa-replicate-independent.mjs` (174 lines, imports only `node:fs` and `node:path`) and a test of its own (126 checks including 14 that turn red under a deliberate break).

Result, from the test printed in the repository: both known answers reproduced (A: n 90 exactly, Brier U and base to 0, mean D 9.0e-16, z 4.4e-16; B: n 234 and the outcome counts 122 / 43 / 69 exactly) and all five fixtures (Look 1 a, b, c, d and Look 2) to 1.8e-15 on every quantity, verdicts and fold sizes exact; the fixtures reach CONTINUE TO LOOK 2 (two), BUILD, DO NOT BUILD by G1 and a Look 2 DO NOT BUILD. No fixture reaches a G2 failure, a Look 2 BUILD or a NO VERDICT; the agent covered those with unit cases of the verdict table.

It reported ten places where the text could be read two ways. Eight were fixed in the rule before it was committed (ppg, gdpg and gfpg were not defined; "before the match" for ratings; the slope's set at Look 2; the convergence edge; equality at G2; event ids as digit strings; events with a null score; the order of pooled sums); one is a statement of its own choice that changes nothing (rows with an unknown sport label are ignored); one is already in the rule (a non-finite fold or slope fails G1 or G2).

## What the author has read of 2024-25 (the BLIND disclosure list)

Published aggregates and one standings line, as listed in the rule's SEEN. **No 2024-25 row has been opened by the author.** The only reads of the 2024-25 payloads are the collector's census run (counts of kinds in memory, nothing written). The session record lists every command that touches the bundle once it exists: none yet.

## Not asserted

That the ESPN data's licence allows this use (Rule 45: flagged for a human). That the matches are independent (they are not; the size under dependence is in the rule's POWER). That U is a good forecast: a pass says the table beats a table-free forecast on eligible matches.

## Carry-forwards

None deferred: every remaining step is a numbered task of the CC-CMD section "Replication 2026-11-28" (Rule 87).

## Commits (HEAD progression; each source commit stages an outbox entry, the repo's history rule)

1. `230fbfc8` docs: the CC-CMD section, this record, the power script and its output (before any pointer in the rule dangles).
2. Tooling prep (this entry): the collector conformed to the rule's row conditions (status field, skipped events with no id or an empty team id, a start time needs Z or an offset and is compared by its UTC day, one more read after a body without events or a non-JSON body, tallies for the rows made; self-test 40 checks, mutation harness 32 of 32), `scripts/uefa-structure-census.mjs` and the data workflow's `structure` mode (counts of the league-phase structure only, so the 2024-25 calendar can be tried against the rule's G3 expectations before the rule is fixed), and the data workflow's commit-message formats (`bundle sha256: <hex> <bytes> bytes <path>`, the collector's and the scoring module's sha256, a bundle path that exists is refused).
3. Not yet committed at the time of this entry: the rule (RULE block sha256 recorded in its own commit message), then the scoring tooling (`scripts/uefa-replicate-run.mjs`, `scripts/uefa-replicate-score.mjs` which holds the rule loader, the scoring, the sets and the pooling, the checks and mutation harness, the fixture exporter and the fixtures), the independent implementation and its test, and the workflows. Round 5's fixes (a pinned scoring module, G3 (o), the result committed before the recomputation, the uncounted pre-check, history-read guards) were not themselves reviewed by a sixth round: the check script (109 checks) and the mutation harness exercise them, which is a weaker control than an independent reader, and this record says so.
