
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

`jq-density-census.mjs:94` still sends `limit=100` and is still truncated. It is
a different census with its own consumers and is not in this commit's scope.
