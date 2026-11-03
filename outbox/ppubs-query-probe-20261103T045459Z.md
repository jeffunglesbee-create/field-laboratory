# PPUBS query-form probe

Run 2026-11-03T04:52:26.641464Z against `https://ppubs.uspto.gov`; grant day 2026-10-27, publication day 2026-10-29; 152.9 s; session renewals 0.

- number control: pass
- date forms that pass on USPAT: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd10', 'd11', 'd12']
- ... and on US-PGPUB: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd10', 'd11', 'd12']
- assignee forms that pass: ['a1', 'a2', 'a3', 'a4', 'a5']
- combined forms that pass: [('d1', 'a1'), ('d1', 'a2'), ('d1', 'a3'), ('d1', 'a4'), ('d1', 'a5'), ('d2', 'a1'), ('d2', 'a2'), ('d2', 'a3'), ('d3', 'a3'), ('d3', 'a4'), ('d3', 'a5')]
- selected: date `@PD="{d}"`, assignee `"{n}".as.`

## 0_number_control

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"10846193".pn.` | USPAT | 200 | 1 | 1 | True |

## 1_date_forms_uspat

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `@PD="20261027"` | USPAT | 200 | 100 | 100 | True |
| `@PD=20261027` | USPAT | 200 | 100 | 100 | True |
| `@PD>="20261027"<="20261027"` | USPAT | 200 | 100 | 100 | True |
| `@PD>=20261027<=20261027` | USPAT | 200 | 100 | 100 | True |
| `20261027.pd.` | USPAT | 200 | 100 | 100 | True |
| `"20261027".pd.` | USPAT | 200 | 100 | 100 | True |
| `(20261027).pd.` | USPAT | 200 | 100 | 100 | True |
| `@PD="2026-10-27"` | USPAT | 200 | 0 | 0 | False |
| `"2026-10-27".pd.` | USPAT | 200 | 0 | 0 | False |
| `@PD>="20261027" AND @PD<="20261027"` | USPAT | 200 | 100 | 100 | True |
| `@pd="20261027"` | USPAT | 200 | 100 | 100 | True |
| `20261027.PD.` | USPAT | 200 | 100 | 100 | True |

## 1b_date_forms_pgpub

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `@PD="20261029"` | US-PGPUB | 200 | 100 | 100 | True |
| `@PD=20261029` | US-PGPUB | 200 | 100 | 100 | True |
| `@PD>="20261029"<="20261029"` | US-PGPUB | 200 | 100 | 100 | True |
| `@PD>=20261029<=20261029` | US-PGPUB | 200 | 100 | 100 | True |
| `20261029.pd.` | US-PGPUB | 200 | 100 | 100 | True |
| `"20261029".pd.` | US-PGPUB | 200 | 100 | 100 | True |
| `(20261029).pd.` | US-PGPUB | 200 | 100 | 100 | True |
| `@PD>="20261029" AND @PD<="20261029"` | US-PGPUB | 200 | 100 | 100 | True |
| `@pd="20261029"` | US-PGPUB | 200 | 100 | 100 | True |
| `20261029.PD.` | US-PGPUB | 200 | 100 | 100 | True |

## 2_assignee_forms_uspat

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"RUWT".as.` | USPAT | 200 | 1 | 1 | True |
| `RUWT.as.` | USPAT | 200 | 1 | 1 | True |
| `(RUWT).as.` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".asnm.` | USPAT | 200 | 1 | 1 | True |
| `RUWT.asnm.` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".asg.` | USPAT | 200 | 0 | 0 | False |
| `@AS="RUWT"` | USPAT | 500 | 0 | None | False |

## 3_combined_forms_uspat

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"RUWT".as. AND @PD="20190625"` | USPAT | 200 | 1 | 1 | True |
| `RUWT.as. AND @PD="20190625"` | USPAT | 200 | 1 | 1 | True |
| `(RUWT).as. AND @PD="20190625"` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".asnm. AND @PD="20190625"` | USPAT | 200 | 1 | 1 | True |
| `RUWT.asnm. AND @PD="20190625"` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".as. AND @PD=20190625` | USPAT | 200 | 1 | 1 | True |
| `RUWT.as. AND @PD=20190625` | USPAT | 200 | 1 | 1 | True |
| `(RUWT).as. AND @PD=20190625` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".asnm. AND @PD=20190625` | USPAT | 429 | 0 | None | False |
| `RUWT.asnm. AND @PD=20190625` | USPAT | 429 | 0 | None | False |
| `"RUWT".as. AND @PD>="20190625"<="20190625"` | USPAT | 429 | 0 | None | False |
| `RUWT.as. AND @PD>="20190625"<="20190625"` | USPAT | 429 | 0 | None | False |
| `(RUWT).as. AND @PD>="20190625"<="20190625"` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".asnm. AND @PD>="20190625"<="20190625"` | USPAT | 200 | 1 | 1 | True |
| `RUWT.asnm. AND @PD>="20190625"<="20190625"` | USPAT | 200 | 1 | 1 | True |
| `"RUWT".as. AND @PD>=20190625<=20190625` | USPAT | 429 | 0 | None | False |

## 4_real_week

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"Dynatrace LLC".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Dynatrace LLC" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Akamai Technologies".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Akamai Technologies" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Datadog".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Datadog" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"New Relic".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"New Relic" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Cisco AppDynamics".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Cisco AppDynamics" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Splunk LLC".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Splunk LLC" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Tealeaf Technology".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Tealeaf Technology" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"SpeedCurve".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"SpeedCurve" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"LogRocket".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"LogRocket" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Are You Watching This".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Are You Watching This" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"RUWT".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"RUWT" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"MetaBet".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"MetaBet" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Data Skrive".as. AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Data Skrive" AND @PD="20261027"` | USPAT | 200 | 0 | 0 |  |
| `"Stats Perform".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Stats Perform" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Sportradar".as. AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `"Sportradar" AND @PD="20261027"` | USPAT | 429 | 0 | None |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | USPAT | 429 | 0 | None |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | USPAT | 200 | 0 | 0 |  |
| `"Dynatrace LLC".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Dynatrace LLC" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Akamai Technologies".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Akamai Technologies" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Datadog".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Datadog" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"New Relic".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"New Relic" AND @PD="20261029"` | US-PGPUB | 200 | 1 | 1 |  |
| `"Cisco AppDynamics".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Cisco AppDynamics" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Splunk LLC".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Splunk LLC" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Tealeaf Technology".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Tealeaf Technology" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"SpeedCurve".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"SpeedCurve" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"LogRocket".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"LogRocket" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Are You Watching This".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Are You Watching This" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"RUWT".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"RUWT" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"MetaBet".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"MetaBet" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Data Skrive".as. AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Data Skrive" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `"Stats Perform".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Stats Perform" AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Sportradar".as. AND @PD="20261029"` | US-PGPUB | 200 | 0 | 0 |  |
| `"Sportradar" AND @PD="20261029"` | US-PGPUB | 429 | 0 | None |  |
| `("Dynatrace LLC".as. OR "Akamai Technologies".as. OR "Datadog".as. OR "New Relic".as. O...` | US-PGPUB | 429 | 0 | None |  |
| `("Dynatrace LLC" OR "Akamai Technologies" OR "Datadog" OR "New Relic" OR "Cisco AppDyna...` | US-PGPUB | 429 | 0 | None |  |

## 5_enumeration_cost

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `@PD="20261027"` | USPAT | 429 | 0 | None |  |
| `@PD="20261027"` | USPAT | 200 | 504 | 500 |  |

## 6_number_control_after

| query | db | http | docs | found | pass |
|---|---|---|---|---|---|
| `"10846193".pn.` | USPAT | 429 | 0 | None | False |

