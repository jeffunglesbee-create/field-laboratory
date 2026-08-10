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
