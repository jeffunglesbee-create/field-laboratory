# PPUBS query-form probe

Run 2026-11-03T05:12:38.171127Z against `https://ppubs.uspto.gov`; grant day 2026-10-27, publication day 2026-10-29; 540.7 s; session renewals 0.

- number control (counts+search / search only): [True, True]
- range + assignee control (RUWT since 2019 includes US-10328326-B2): True
- production form finds every known answer, single and OR: True
- eight-week date totals all >= 500 and counts == search: False
- OR query equals the union of single-term queries: [True, True, True, True]
- 429 events 0, unrecovered 0, calls 169, 540.7 s

## 0_number_control

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"10846193".pn.` | USPAT | 200 | 1 | 1 | True |
| `"10846193".pn.` | USPAT | 200 | 1 | 1 | True |

## 1_known_answers

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"Dynatrace LLC".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 3 | 3 |  |
| `"Akamai Technologies".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 3 | 3 |  |
| `"Datadog".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 3 | 3 |  |
| `"New Relic".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 7 | 3 |  |
| `"Cisco AppDynamics".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Splunk LLC".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 3 | 3 |  |
| `"Tealeaf Technology".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"SpeedCurve".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"LogRocket".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 5 | 3 |  |
| `"Are You Watching This".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"RUWT".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 1 | 1 | True |
| `"MetaBet".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Data Skrive".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 2 | 1 |  |
| `"Stats Perform".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Sportradar".as. AND @PD>="20190101"<="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Dynatrace LLC".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 3 | 3 |  |
| `"Akamai Technologies".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 4 | 3 |  |
| `"Datadog".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 3 | 3 |  |
| `"New Relic".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Cisco AppDynamics".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Splunk LLC".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 1 | 1 |  |
| `"Tealeaf Technology".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"SpeedCurve".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"LogRocket".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 3 | 3 |  |
| `"Are You Watching This".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"RUWT".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"MetaBet".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Data Skrive".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 2 | 1 |  |
| `"Stats Perform".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Sportradar".as. AND @PD>="20190101"<="20261029"` | US-PGPUB | 200 | 0 | 0 |  |

## 2_production_form_on_known_answers

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"Dynatrace LLC".as. AND @PD="20260908"` | USPAT | 200 | 1 | 1 | True |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 1 | 1 | True |
| `"Akamai Technologies".as. AND @PD="20261020"` | USPAT | 200 | 2 | 2 | True |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 2 | 2 | True |
| `"Datadog".as. AND @PD="20260901"` | USPAT | 200 | 1 | 1 | True |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 2 | 2 | True |
| `"Dynatrace LLC".as. AND @PD="20261022"` | US-PGPUB | 200 | 1 | 1 | True |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 1 | 1 | True |
| `"Akamai Technologies".as. AND @PD="20260903"` | US-PGPUB | 200 | 1 | 1 | True |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 1 | 1 | True |
| `"Datadog".as. AND @PD="20260430"` | US-PGPUB | 200 | 2 | 2 | True |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 3 | 3 | True |

## 3_date_totals

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `@PD="20261027"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20261020"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20261013"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20261006"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20260929"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20260922"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20260915"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20260908"` | USPAT | 200 | 1 | 1 | False |
| `@PD="20261029"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20261022"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20261015"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20261008"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20261001"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20260924"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20260917"` | US-PGPUB | 200 | 1 | 1 | False |
| `@PD="20260910"` | US-PGPUB | 200 | 1 | 1 | False |

## 4_eight_weeks_or

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 0 | 0 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 2 | 2 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 5 | 5 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 3 | 3 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 5 | 5 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 2 | 2 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 2 | 2 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 6 | 6 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 1 | 1 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 200 | 1 | 1 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 6 | 6 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 3 | 3 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 1 | 1 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 5 | 5 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 1 | 1 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 6 | 6 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 2 | 2 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 6 | 6 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 1 | 1 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 2 | 2 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 7 | 5 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 5 | 5 |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 200 | 0 | 0 |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 200 | 0 | 0 |  |

## 5_or_vs_per_term

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"Dynatrace LLC".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Akamai Technologies".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Datadog".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"New Relic".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Cisco AppDynamics".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Splunk LLC".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Tealeaf Technology".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"SpeedCurve".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"LogRocket".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Are You Watching This".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"RUWT".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"MetaBet".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Data Skrive".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Stats Perform".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Sportradar".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Dynatrace LLC" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Akamai Technologies" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Datadog" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"New Relic" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Cisco AppDynamics" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Splunk LLC" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Tealeaf Technology" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"SpeedCurve" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"LogRocket" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Are You Watching This" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"RUWT" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"MetaBet" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Data Skrive" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Stats Perform" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Sportradar" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Dynatrace LLC".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Akamai Technologies".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Datadog".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"New Relic".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Cisco AppDynamics".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Splunk LLC".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Tealeaf Technology".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"SpeedCurve".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"LogRocket".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Are You Watching This".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"RUWT".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"MetaBet".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Data Skrive".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Stats Perform".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Sportradar".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Dynatrace LLC" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Akamai Technologies" AND @PD="20261029"` | US-PGPUB | 200 | 1 | 1 |  |
| `"Datadog" AND @PD="20261029"` | US-PGPUB | 200 | 2 | 2 |  |
| `"New Relic" AND @PD="20261029"` | US-PGPUB | 200 | 1 | 1 |  |
| `"Cisco AppDynamics" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Splunk LLC" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Tealeaf Technology" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"SpeedCurve" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"LogRocket" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Are You Watching This" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"RUWT" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"MetaBet" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Data Skrive" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Stats Perform" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Sportradar" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |

## weekly reading (OR over the watchlist): documents returned / total matching

| day | db | assignee field | all-fields phrase |
|---|---|---|---|
| 2026-10-29 | US-PGPUB | 0 / 0 | 3 / 3 |
| 2026-10-27 | USPAT | 0 / 0 | 0 / 0 |
| 2026-10-22 | US-PGPUB | 1 / 1 | 5 / 5 |
| 2026-10-20 | USPAT | 2 / 2 | 5 / 5 |
| 2026-10-15 | US-PGPUB | 1 / 1 | 6 / 6 |
| 2026-10-13 | USPAT | 0 / 0 | 3 / 3 |
| 2026-10-08 | US-PGPUB | 2 / 2 | 6 / 6 |
| 2026-10-06 | USPAT | 0 / 0 | 5 / 5 |
| 2026-10-01 | US-PGPUB | 1 / 1 | 2 / 2 |
| 2026-09-29 | USPAT | 0 / 0 | 2 / 2 |
| 2026-09-24 | US-PGPUB | 0 / 0 | 7 / 7 |
| 2026-09-22 | USPAT | 2 / 2 | 6 / 6 |
| 2026-09-17 | US-PGPUB | 0 / 0 | 5 / 5 |
| 2026-09-15 | USPAT | 0 / 0 | 1 / 1 |
| 2026-09-10 | US-PGPUB | 0 / 0 | 0 / 0 |
| 2026-09-08 | USPAT | 1 / 1 | 6 / 6 |

## OR query against the union of single-term queries

| day | db | kind | OR | union | equal |
|---|---|---|---|---|---|
| 2026-10-27 | USPAT | assignee | 0 | 0 | True |
| 2026-10-27 | USPAT | phrase | 0 | 0 | True |
| 2026-10-29 | US-PGPUB | assignee | 0 | 0 | True |
| 2026-10-29 | US-PGPUB | phrase | 3 | 3 | True |

