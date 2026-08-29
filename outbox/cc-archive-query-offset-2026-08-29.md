
---

## Client half, same commit-day

`field-laboratory/scripts/brief-join-capture.mjs` now pages. It sent
`limit=100`, received 50, and reported it as a day's briefs — the exact consumer
this change was written for.

```js
let offset = 0, total = null, guard = 0
while (guard++ < 40) {
  const page = await get(`${RELAY}/archive/query?date=${d}&limit=50&offset=${offset}`)
  rows.push(...(page.results || []))
  total = page.total ?? null
  if (!page.hasMore) break
  offset += (page.results || []).length
  if (!(page.results || []).length) break
}
if (guard >= 40) console.log(`::warning::${d}: paging guard tripped at ${rows.length} rows`)
if (total !== null && rows.length !== total) {
  console.log(`::warning::${d}: paged ${rows.length} of ${total} briefs`)
}
```

The guard is loud rather than silent. A cap that trips quietly is the defect
being replaced, so tripping it emits a `::warning::`, and so does any run whose
row count disagrees with the `total` the relay served.

`jq-density-census.mjs:94` also sends `limit=100`. Whether it is truncated is a
question, not an observation, and it is left for its own commit.

**CORRECTION, same day.** The sentence above originally read "and is still
truncated." That was asserted from reading the `100`, not from counting rows,
and it is false. The census filters to one `brief_type`, and no date has ever
come close to the cap:

```
committed jq-mlb-game-corpus.json : 51 dates, max 25 mlb_game briefs on any date
untruncated 2026-08-23..29 window : max 19 on any date
dates at or above the cap of 50   : 0
```

Exactly the defect this document is about, committed in the document about it.
The census now pages anyway — a no-op against those counts, which is what makes
it safe to add while five checks pin that corpus at 592 rows.
