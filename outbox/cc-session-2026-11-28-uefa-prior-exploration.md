# Exploration 2026-11-28: the UEFA forecaster, idea 3 (a prior), outcome-blind

**Nothing is built, nothing is pre-registered, nothing is written to production.** No score from the 2025-26 bundle or the frozen 2026-27 bundle was read, printed or used: coverage was counted on club names only (`outbox/uefa-prior-coverage-2026-11-28.mjs`, output `...txt`). The only outcome-bearing numbers below are the lab's own published fit result and numbers published by others.
Spec: `docs/CC-CMD-2026-11-27-uefa-forecast-on-tonights-cards.md` ("After the verdict"). Owner instruction, 2026-11-28: "Explore #3 first. We want the full forecaster." Idea 3 of the 2026-11-28 list: give the model a prior.
Relay-side artifacts used (field-relay-nba `outbox/`): `archive-league-history-backfill-uefa-*-2026-11-28T*.json` (five read-only dry runs), `archive-label-dates-2026-11-28T00-37-28-553Z.json`.

## 1. How I read the instruction

- **"#3"** is the prior: a rating that does not start from nothing. **"The full forecaster"** is read as: a number for every league-phase match, including the 162 of 396 "opening matches" the fit could not forecast, then knockout ties and league-phase stakes on top, not a partial table line. If "full" means something else (a different scope, other competitions), say so before the rule is written.
- **This is a new decision, not a lifting of NO FURTHER LOOK.** The rule's text: "no second pass over 2025-26, no refit, no change of K, of the weights or of the folds, and no alternative candidate on these data ... Any revision after that is a new decision with new matches to read." So the 2025-26 league phase (396 matches) and the frozen 2026-27 bundle (252) are burned for scoring or tuning any alternative candidate. They can still be INPUTS (a later match's rating may use an earlier result); they cannot be the test.

## 2. External evidence (every claim re-read by a skeptic; `outbox/uefa-forecaster-prior-literature-2026-11-28.json`, workflow `wf_92c3f5e2-752`, read 2026-11-28)

30 claims, 26 confirmed, 3 `overreach`, 1 `quote-not-verbatim`, 0 refuted; the three over-reaches and the one misquote are marked in the file and none is relied on below. All of it is external; none is FIELD data. Labels: **V** = verified-read by the researcher and re-read by the skeptic; **P** = preprint, no peer review shown; **D** = domestic leagues, not UEFA competitions.

| # | what | number | source |
|---|---|---|---|
| E1 | A rating frozen on 1 September (ClubElo, NOT updated in-season) against an expanding-window outcome-frequency benchmark, 600 Champions and Europa League matches of 2023/24 and 2024/25 (272 of them 2024/25 league phase), ordered probit | RPS x100 **19.729 against 23.068**; Brier (mean over 3 outcomes) 0.183 against 0.207; log loss 0.932 against 1.029. In the lab's Brier scale (sum over 3 outcomes) that is **0.549 against 0.621**, a gap of 0.072 (my arithmetic) | Csurilla and Csato, arXiv 2609.21674, v1 2026-09-18 (V, P). The skeptic corrected the researcher: ClubElo's 1 September rating already includes every domestic and European result up to that day; "no update" means no update inside the forecast season |
| E2 | The same kind of rating (ClubElo difference in a Dixon-Coles model fitted on 2024/25 only), scored on the 2025/26 league phase, 144 matches per competition | Champions League Brier 0.5262, Europa League 0.5531 (normalisation not stated; the skeptic's check says it is consistent with a sum over outcomes) | Winkelmann, Michels, Deutscher, arXiv 2508.20075, Table D1 (V, P). These are published results on the same 2025/26 matches the lab burned; they are external evidence, not a look by us |
| E3 | "Higher rating wins" on Champions League matches 2003/04 to 2021/22, ratings fixed before each season | group matches **73.32% (ClubElo, 30 June) against 70.68% (UEFA club coefficient)**; two-legged ties 65.00% against 61.92% | Csato, arXiv 2304.09078 (V). Old 32-team group format |
| E4 | Noise in a few matches of results (Bundesliga, a league-mean prior) | variance of goal difference per match after N matches = 0.215 + 3.03/N; shrinkage weight on the team's own record N/(N+14.1): **0.26 at 5 matches, 0.36 at 8** (my arithmetic from the printed constants). Scottish points per game: prior worth m = 11.4 games | Heuer and Rubner 2009, arXiv 0803.0614 (V, D); Football Data Science, "where priors come from" (V, D, practitioner) |
| E5 | Previous-season information against the present season (Bundesliga) | previous season carries about as much information as the first 12 matches of the present one; still helps after 17 | Heuer and Rubner 2014, PLOS ONE 9(9):e104647 (V, D; units are chances for goals) |
| E6 | A current-season-only model against models that carry earlier information (top five leagues, 15 league-seasons) | needed about 10 match days (of 34 to 38) to approach them | Van Eetvelde, Hvattum, Ley, PMC8355582 (V, D) |
| E7 | Season-boundary carry-over of strength | Elo carry-over 0.90, a flat optimum over 0.80 to 0.95 (grid floor 0.8) (V, D, practitioner); EPL state-space summer information discount 0.74 to 0.80 (V, D); Elo autoregressive coefficient 0.70 (V, D, 140 surviving clubs, so survivorship) | footballdatascience.co.uk/learn/elo-tuned; JRSS C 74(3):717; Warsaw Forum of Economic Sociology 16(32) |
| E8 | Draw and home shares in the new league phase, 144 matches per competition-season | Champions League 2024/25 53.47 / 12.50 / 34.03 (home / draw / away), 2025/26 49.31 / 17.36 / 33.33; Europa League 2024/25 48.61 / 24.31 / 27.08, 2025/26 52.78 / 17.36 / 29.86 | arXiv 2508.20075, Table 3 (V, P). The draw share moves by 12 points between competition-seasons; a standard error at n = 144 is about 3 |
| E9 | Knockout ties | the second-leg home side wins 40.6% of ties after losing 0-1 away (402 of 990) and 97.3% after winning 2-0 away (330 of 339); 268 penalty shootouts 2000 to 2025: no detectable effect of ClubElo strength (the skeptic found the published wording hedged to "none ... has a significant effect") | historical shares (V); Csato and Petrozcy (V, with the misquote noted) |

**Not found, stated as not found:** no published weight for blending a carried-over prior with n in-season UEFA matches; no Conference League evidence of any kind; ClubElo's own season-boundary rule and FiveThirtyEight's primary methodology page were not readable; UEFA's coefficient regulations were not read. **Pointed to by the skeptic, read as excerpts only:** B-CLAD (KU Leuven MLSA26 paper 380, a model linking 15 domestic leagues to the three UEFA competitions, trained on four seasons and tested on 2024/25) and Foulley 2015 (arXiv 1501.05831).

**What E1 to E6 say together.** In an 8-match phase the table is mostly noise (E4, E6) and a rating that carries earlier information has direct UEFA support (E1, E2, E3). The lab's fitted table model gained 0.032 Brier on the cross-validation set and lost 0.016 on the forward bundle; the published pre-season-rating model gained 0.072 against a benchmark whose Brier (0.621) is where the lab's own base rate sits (0.617 cross-validation, 0.629 forward). Different match sets, a different model class and an unstated normalisation in E2 make this a direction, not a comparison.

## 3. What the archive and ESPN hold (measured today, outcome-blind)

1. **Prior coverage from the archive's own UEFA history** (`outbox/uefa-prior-coverage-2026-11-28.txt`): of the 108 club-slots in the 2026-27 league phases, **28 (26%) played the same competition in 2025-26, 64 (59%) played any UEFA competition, 44 (41%) have no UEFA row in 2025-26** (Champions League 7, Europa League 15, Conference League 22). One of the 44 may be a spelling mismatch (`CSU Craiova` and `Craiova`); the other six the screen printed are different clubs. So one season of UEFA history cannot be a prior for 41% of the field; the Conference League is where it is thinnest (2 of 36 in the same competition).
2. **No last-season domestic history in the archive**: `read-archive-label-dates.yml` at 00:37Z: EPL 137 rows from 2026-05-09, La Liga 142 from 2026-05-24, Serie A 121 from 2026-08-22, Bundesliga 91 from 2026-08-28, Ligue 1 102 from 2026-05-13. So the archive cannot supply a domestic prior either.
3. **ESPN holds the earlier seasons, and the counts equal each format's size** (read-only dry runs of `archive-league-history-backfill.yml`, every scoreboard HTTP 200, 0 written): completed events 2024-09-01 to 2025-06-30 **Champions League 189, Europa League 189, Conference League 153** (144 + 45, 144 + 45, 108 + 45 as the league-phase format predicts); 2023-09-01 to 2024-06-30 **Champions League 125, Conference League 141** (96 group + 29 knockout, 96 + 45, as the group-stage format predicts). The Europa League 2023-24 and every earlier season were not read. A count that matches the format is not a read of the league-phase split.
4. **ESPN's scoreboard payload carries what identity and phase need** (one read, `uefa.champions` 2025-12-10, from a Worker IP): a `team.id` on every competitor (whether an id is the same across competitions and seasons was not tested), `season.slug` `league-phase`, `altGameNote` "UEFA Champions League, League Phase", and the venue's country. The archive rows carry names only, which is why the aliases exist (`Man United` / `Man Utd`, `CSU Craiova` / `Craiova`).

## 4. The clean-data budget (which matches may be read for what)

| season | format | matches | status for a new candidate |
|---|---|---|---|
| 2023-24 and earlier | group stage | Champions League 125 and Conference League 141 read as counts; Europa League not read | clean; development only (the format differs) |
| 2024-25 | league phase | 189 + 189 + 153 completed, of which 144 + 144 + 108 league-phase | clean to the lab's models and data. **Not blind to the idea**: E1 and E2 publish how a pre-season-rating model did on it |
| 2025-26 | league phase | 396 league-phase matches | **burned** (the fit's training and cross-validation set); input only |
| 2026-27 to 2026-11-26 | league phase | 252 league-phase matches | **burned** (the frozen bundle); input only |
| 2026-27 after the freeze | league phase | 144 league-phase matches still to play (a count from the format: 396 - 252; the calendar was not read) | clean and forward; the only truly blind test this season |

**Power**, one-sided 5%, from the fit result's own numbers (the standard deviation of the paired Brier difference is 0.21 on the cross-validation set and 0.32 on the early-season bundle, so each cell gives both; independence assumed, which the rule itself notes is false):

| test | n | gain 0.072 (E1's size) | gain 0.032 (the table model's cross-validation gain) | gain 0.024 (a third of E1's) |
|---|---|---|---|---|
| 2024-25 league phase, every match forecastable | 396 | 1.00 / 1.00 | 0.92 / 0.63 | 0.74 / 0.44 |
| the 144 forward matches alone | 144 | 0.99 / 0.85 | 0.57 / 0.33 | 0.39 / 0.23 |

(cells read: standard deviation 0.21 / 0.32; power = Phi(gain / (sd / sqrt(n)) - 1.645), a normal approximation, computed 2026-11-28.)

A prior makes every match forecastable, so the test set grows from 234 to 396 matches. That is the part of the gain that does not depend on the model being good.

## 5. The candidate, as a DRAFT (not a rule; nothing here is fixed until the owner says to write it)

**Candidate E: a rating with memory** instead of a table: one rating per club that carries across seasons and competitions, updated by results, regressed at each season boundary, mapped to home / draw / away.

- **Why not just add a prior to the table (U2)**: the table (`ppg + 0.25 gdpg + 0.10 gfpg`) has no opponent adjustment, and a league-phase club meets 8 different opponents (format knowledge, not read here), so two clubs with equal tables have met different schedules; a rating updated by opponent strength corrects that, and it handles opening matches and clubs that change competition by construction. U2 stays an option if the owner prefers continuity with the EPL's table-v2.
- **Boundary carry-over** 0.8 to 0.9 of the deviation from the mean (E7: touches every published range at 0.80). **In-season weight**: shrinkage or a small K, chosen BLIND from E4 to E6 (a prior worth 11 to 21 matches of own results). **Outcome map**: three constants (home, scale, draw), fitted on development seasons only, rounded to two decimals as the fit did. The draw share is competition-specific only if the rule pre-registers why (E8).
- **Debutants** (the 41%): a tier prior from the club's country (the venue's country, read from the payload) shrunk toward the field mean; or an outside rating (section 6).
- **Knockouts and stakes** come after, as arithmetic on the same ratings: a second leg conditional on the first (E9), shootouts treated as even (E9), and "through / out" classification, which is arithmetic and pull-only (Rule 47, Rule A).
- **Display**: the type already carries `Modelled of { Market; Method }`; the method string carries every constant. New `NoForecastReason` cases would be named, not folded into a catch-all.

## 6. The open choice: where the pre-season rating comes from

| source | evidence for UEFA | covers the 41%? | Rule 45 | cost |
|---|---|---|---|---|
| ClubElo 1 September rating | E1, E2, E3 | yes, every European club | **unread**: `clubelo.com/API` and `/System` returned the site's front page twice (Exa and `html_probe`), no method or terms text; a human reads them | a third-party feed; availability and attribution unknown |
| an Elo built here from ESPN's UEFA results, all rounds, several seasons | none published for this construct | the 345 qualifying events of 2026 (archive holds none) are exactly the history the small-league debutants have; coverage with 3 seasons is **not measured** | ESPN, as the archive already uses it | a collector and an Elo; the next step below measures it |
| the same plus ESPN domestic histories for the big five | closest to ClubElo, unvalidated | the big-five debutants (Man Utd, Milan, Bournemouth, Brighton, Real Sociedad, Getafe, Rennes, Lens, Como and others in the 44) | ESPN | five leagues times the seasons, about 300 reads each |
| UEFA club coefficient | E3: weaker than ClubElo | yes | UEFA's regulations unread | simplest |

## 7. The full forecaster, staged (each gate is the owner's)

1. **Names-only collector** (next, unblocked, read-only): ESPN scoreboards for the three competitions and their qualifying rounds over the last 3 to 5 seasons, writing club id, name, competition, phase, date and venue country and NO score. It measures how many 2026-27 clubs a multi-season UEFA history covers, and decides between the second row and the first in section 6. About 300 reads per competition-season, spaced as the backfill spaces them.
2. **The rule, committed alone first** (the lab's order): candidate, constants or the procedure that fixes them, development and test seasons, the pass lines with the power above, a sequential forward test on the 144 matches, and a DISCLOSED block that says what was seen (section 8). Then the bundles, then the tooling tested on synthetic seasons, then one run on a runner, then an independent recomputation.
3. **If it passes**: the UEFA line on a card (the old Task 3 and 4 pattern), pull-only, then knockouts and stakes.
4. **If it fails**: the price where one exists (the `MarketImplied` case; the relay maps only `soccer_uefa_champs_league`, for backfill, and live capture is unapproved spend per the 2026-09-15 comment, not re-checked) or the stakes arithmetic alone.

## 8. What the rule would have to disclose

- Numbers seen in published form before writing it: E1 and E2 (how a pre-season-rating model scored on the 2024/25 and 2025/26 league phases), so 2024-25 is not blind to the idea.
- The lab's own fit result and the frozen bundle's verdict (public in the CC-CMD).
- The author's background knowledge of 2024-25 and 2025-26 UEFA results (the assistant's training reaches June 2026); none enters a number, and a script, not the author, scores.
- Names only were read from the burned bundles.

## 9. Decisions this needs from the owner (recommendation first)

1. **Authorise the names-only collector** (section 7.1). Recommended: yes; it is read-only, outcome-blind, and decides the source.
2. **Prior source**: after the collector, an in-house Elo if coverage is high; otherwise ClubElo, which needs a human to read its terms first (Rule 45.3). Recommended: do not decide before the collector.
3. **Keep NO FURTHER LOOK on 2025-26 and the frozen bundle** (recommended: yes). The burned data become inputs only.
4. **Confirm "full"** means league-phase for every match first, with knockouts and stakes after.

## 10. Not established, and the limits of this exploration

- Whether a multi-season UEFA history covers enough of the 41% (not measured; the collector measures it).
- Whether an in-house rating matches ClubElo's published gain (E1 is ClubElo's, not ours).
- The in-season weight and the carry-over for THIS format (E4 to E7 are domestic; no UEFA figure exists).
- The 2024-25 league-phase split was not read (only the completed-event counts); the Europa League 2023-24 and all earlier seasons were not read.
- Power uses the lab's cross-validation and early-season standard deviations for a different model class and treats matches as independent.
- The coverage counts depend on six aliases and one crude spelling screen.
