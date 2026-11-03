# Patent watch rehearsal, 20261103T064218Z

The client's watcher, run unmodified against the real PPUBS host with no token: nothing filed, nothing chained.
Client commit read: `9b1170dbf661ad6d88439630fb7b16e842c49350`. Run: https://github.com/jeffunglesbee-create/field-laboratory/actions/runs/41590865114.

| week | Tuesday | Thursday | result | time | read_complete | grant day families | pub day families | matches |
|---|---|---|---|---|---|---|---|---|
| settled week | 2026-10-27 | 2026-10-22 | read | 218 s | True | 5827 | 9476 | 5 (1 assignee, 4 text) |
| upcoming week | 2026-11-03 | - | NOT READ | 22 s | - | - | - | - (0 assignee, 0 text) |

## settled week: 2026-10-27, exit 0

### Log

```
Watchlist (15 entries):
  - Dynatrace LLC
  - Akamai Technologies
  - Datadog
  - New Relic
  - Cisco AppDynamics
  - Splunk LLC
  - Tealeaf Technology
  - SpeedCurve
  - LogRocket
  - Are You Watching This
  - RUWT
  - MetaBet
  - Data Skrive
  - Stats Perform
  - Sportradar
Grant week: 2026-10-27 (Tuesday)
PGPub week: 2026-10-22 (Thursday)

Session and controls...
  [ppubs] prime: HTTP 200
  [ppubs] session ok: caseId=257843625
  control ok: number form
  control ok: assignee + exact date, grants
  control ok: assignee + exact date, applications
  control ok: text + exact date, grants
  control ok: text + exact date, applications

Reading grants (USPAT, 2026-10-27)...
  USPAT 2026-10-27: 5827 families published that day
  grants       Dynatrace LLC            assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Akamai Technologies      assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Datadog                  assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       New Relic                assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Cisco AppDynamics        assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Splunk LLC               assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Tealeaf Technology       assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       SpeedCurve               assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       LogRocket                assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Are You Watching This    assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       RUWT                     assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       MetaBet                  assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Data Skrive              assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Stats Perform            assignee  0 docs /  0 families   text  0 docs /  0 families
  grants       Sportradar               assignee  0 docs /  0 families   text  0 docs /  0 families
  0 grants match(es)

Reading applications (US-PGPUB, 2026-10-22)...
  US-PGPUB 2026-10-22: 9476 families published that day
  applications Dynatrace LLC            assignee  1 docs /  1 families   text  2 docs /  2 families
  applications Akamai Technologies      assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Datadog                  assignee  0 docs /  0 families   text  3 docs /  3 families
  applications New Relic                assignee  0 docs /  0 families   text  2 docs /  2 families
  applications Cisco AppDynamics        assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Splunk LLC               assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Tealeaf Technology       assignee  0 docs /  0 families   text  0 docs /  0 families
  applications SpeedCurve               assignee  0 docs /  0 families   text  0 docs /  0 families
  applications LogRocket                assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Are You Watching This    assignee  0 docs /  0 families   text  0 docs /  0 families
  applications RUWT                     assignee  0 docs /  0 families   text  0 docs /  0 families
  applications MetaBet                  assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Data Skrive              assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Stats Perform            assignee  0 docs /  0 families   text  0 docs /  0 families
  applications Sportradar               assignee  0 docs /  0 families   text  0 docs /  0 families
  5 applications match(es)
  No GH_TOKEN/GH_REPO; skipping issue creation

Saved outbox/patents/watch-2026-10-27.json

No grant hits to auto-chain.
```

### Manifest

```json
{
  "week_tuesday": "2026-10-27",
  "week_thursday": "2026-10-22",
  "source": "ppubs",
  "read_complete": true,
  "watchlist": [
    "Dynatrace LLC",
    "Akamai Technologies",
    "Datadog",
    "New Relic",
    "Cisco AppDynamics",
    "Splunk LLC",
    "Tealeaf Technology",
    "SpeedCurve",
    "LogRocket",
    "Are You Watching This",
    "RUWT",
    "MetaBet",
    "Data Skrive",
    "Stats Perform",
    "Sportradar"
  ],
  "controls": [
    "number form",
    "assignee + exact date, grants",
    "assignee + exact date, applications",
    "text + exact date, grants",
    "text + exact date, applications"
  ],
  "scanned": {
    "grants": {
      "database": "USPAT",
      "day": "2026-10-27",
      "families_on_day": 5827,
      "queries": 30
    },
    "applications": {
      "database": "US-PGPUB",
      "day": "2026-10-22",
      "families_on_day": 9476,
      "queries": 30
    }
  },
  "matches": [
    {
      "assignee_match": "Dynatrace LLC",
      "patent_id": "20260332641",
      "title": "Techniques For Detecting And Reporting On Cloned Websites",
      "doc_kind": "application",
      "scan": "applications",
      "basis": "assignee",
      "terms": [
        "Dynatrace LLC"
      ],
      "guid": "US-20260332641-A1",
      "date": "2026-10-22",
      "assignee": "Dynatrace LLC | Dynatrace LLC"
    },
    {
      "assignee_match": "Datadog",
      "patent_id": "20260329571",
      "title": "AUTOMATED CHANGE MANAGEMENT SYSTEM AND METHOD",
      "doc_kind": "application",
      "scan": "applications",
      "basis": "text",
      "terms": [
        "Datadog"
      ],
      "guid": "US-20260329571-A1",
      "date": "2026-10-22",
      "assignee": "THE PNC FINANCIAL SERVICES GROUP, INC."
    },
    {
      "assignee_match": "New Relic",
      "patent_id": "20260329660",
      "title": "AUTONOMOUS ENFORCEMENT OF SERVICE LEVEL OBJECTIVES",
      "doc_kind": "application",
      "scan": "applications",
      "basis": "text",
      "terms": [
        "New Relic"
      ],
      "guid": "US-20260329660-A1",
      "date": "2026-10-22",
      "assignee": "Express Scripts Strategic Development, Inc."
    },
    {
      "assignee_match": "Dynatrace LLC",
      "patent_id": "20260329977",
      "title": "Onboarding of Monitoring Tools",
      "doc_kind": "application",
      "scan": "applications",
      "basis": "text",
      "terms": [
        "Dynatrace LLC",
        "Datadog",
        "New Relic"
      ],
      "guid": "US-20260329977-A1",
      "date": "2026-10-22",
      "assignee": "Capital One Services, LLC"
    },
    {
      "assignee_match": "Datadog",
      "patent_id": "20260333040",
      "title": "TELECOMMUNICATIONS CALL VALIDATION PLATFORM",
      "doc_kind": "application",
      "scan": "applications",
      "basis": "text",
      "terms": [
        "Datadog"
      ],
      "guid": "US-20260333040-A1",
      "date": "2026-10-22",
      "assignee": "Somos, Inc."
    }
  ]
}
```

## upcoming week: 2026-11-03, exit 1

### Log

```
Watchlist (15 entries):
  - Dynatrace LLC
  - Akamai Technologies
  - Datadog
  - New Relic
  - Cisco AppDynamics
  - Splunk LLC
  - Tealeaf Technology
  - SpeedCurve
  - LogRocket
  - Are You Watching This
  - RUWT
  - MetaBet
  - Data Skrive
  - Stats Perform
  - Sportradar
Grant week: 2026-11-03 (Tuesday)
PGPub week: 2026-10-29 (Thursday)

Session and controls...
  [ppubs] prime: HTTP 200
  [ppubs] session ok: caseId=257844762
  control ok: number form
  control ok: assignee + exact date, grants
  control ok: assignee + exact date, applications
  control ok: text + exact date, grants
  control ok: text + exact date, applications

Reading grants (USPAT, 2026-11-03)...

NOT READ: USPAT holds 0 families for 2026-11-03 (fewer than 500): the day is not published or indexed yet, or the date form stopped working
::error title=Patent watch did not read this week::USPAT holds 0 families for 2026-11-03 (fewer than 500): the day is not published or indexed yet, or the date form stopped working
```

No manifest was written for this week.
