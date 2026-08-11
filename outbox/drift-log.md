# Drift log

Appended by .github/workflows/drift-sentinel.yml. One row per run.
`status` is `ok`, `malformed` (a nested JSON field stopped decoding),
`decode-failed` (the payload shape changed), or `fetch-failed`
(infrastructure, not drift).

| run (UTC) | payload date | games | status | malformed | note |
| --- | --- | --- | --- | --- | --- |
| 2026-08-09 23:25 | 2026-08-09 | 36 | malformed | 2 | EFL Cup_2026-08-09_mansfield_sheffieldutd.drama_arc: Error at: `$` Expecting a list but instead got: null |
| 2026-08-09 23:28 | 2026-08-09 | 36 | ok | 0 | — |
| 2026-08-10 13:23 | 2026-08-10 | 18 | ok | 0 | — |
| 2026-08-10 14:48 | 2026-08-10 | 18 | unmodelled-sport | 0 | unmodelled: MLS, WNBA, EFL Cup|MLB:10 MLS*:5 WNBA*:2 EFL Cup*:1 |
| 2026-08-10 14:56 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1 |
| 2026-08-10 15:13 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0 |
| 2026-08-10 15:39 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0|spreads=24 unbal=0 totals=24 split=0 mismatch=2 |
| 2026-08-10 15:46 | 2026-08-10 | 18 | favourite-mismatch | 0 | MLB MLB_2026-08-10_cardinals_phillies: ML -113/-107 H 1.5/-1.5|MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0|spreads=24 unbal=0 totals=24 split=0 mismatch=2 |
| 2026-08-10 15:53 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0|spreads=24 unbal=0 totals=24 split=0 mismatch=0 |
| 2026-08-10 18:20 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0|spreads=24 unbal=0 totals=24 split=0 mismatch=0|briefs=present(192) series=empty-or-failed standings=present(8)|note=0 local=0 crew=0 tags=0/18|EFL Cup:same-utc-day=1 MLB:same-utc-day=4 MLB:starts-after-date=6 MLS:no-start-time=5 WNBA:starts-after-date=2 |
| 2026-08-10 18:35 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0|spreads=24 unbal=0 totals=24 split=0 mismatch=0|briefs=present(192) series=empty-or-failed standings=present(8)|note=0 local=0 crew=0 tags=0/18|EFL Cup:same-utc-day=1 MLB:same-utc-day=4 MLB:starts-after-date=6 MLS:no-start-time=5 WNBA:starts-after-date=2 |
| 2026-08-11 03:14 | 2026-08-10 | 18 | ok | 0 | |MLB:10 MLS:5 WNBA:2 EFL Cup:1|both=12 notseq=12 moved=0 unmoved=0|spreads=24 unbal=0 totals=24 split=0 mismatch=0|briefs=present(196) series=empty-or-failed standings=present(8)|note=0 local=0 crew=0 tags=0/18|EFL Cup:same-utc-day=1 MLB:same-utc-day=4 MLB:starts-after-date=6 MLS:no-start-time=5 WNBA:starts-after-date=2 |
