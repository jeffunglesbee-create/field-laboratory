// The append-only store for forecast observations, and the SQL that defines it.
//
// WHY APPEND-ONLY IS A PROPERTY OF THE SCHEMA, NOT A CONVENTION. `codex_write`
// replaced content in place and destroyed 26 entry bodies on 2026-09-08. A
// store that CAN overwrite an observation will, and a change record whose
// history can be rewritten is not a record. So there is no UPDATE statement
// here, and deliberately no unique key on (subject) that would invite an
// ON CONFLICT DO UPDATE — the whole point is many rows per subject.
//
// WHERE IT LIVES. field-laboratory is an assets-only Worker with no D1 of its
// own; its only write path is field-relay-nba's POST /d1/execute, which gates
// on a hardcoded table allow-list. `forecast_observations` must be in that list
// or both the DDL and every INSERT return 403.
//
// THE RELAY COMPUTES NOTHING HERE (Rule 47). The model runs in Fable and the
// rows arrive already formed; the relay stores a value it did not derive.

export const TABLE = 'forecast_observations'

// `id` is a plain autoincrementing rowid and the only key. No natural key, by
// design: (subject, observed_at) would look reasonable and would be the hook
// an ON CONFLICT clause hangs off later.
export const DDL = `CREATE TABLE IF NOT EXISTS ${TABLE} (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,
  value       TEXT NOT NULL,
  provenance  TEXT NOT NULL CHECK (provenance IN ('MarketImplied','Modelled','NoForecast')),
  cause       TEXT NOT NULL,
  observed_at TEXT NOT NULL
)`

// Indexed on the one access pattern: the newest row for a subject. The change
// record is read as "what did we last say about this fixture", never scanned.
export const DDL_INDEX =
  `CREATE INDEX IF NOT EXISTS idx_${TABLE}_subject_at ON ${TABLE} (subject, observed_at DESC)`

export const SQL_INSERT =
  `INSERT INTO ${TABLE} (subject, value, provenance, cause, observed_at) VALUES (?, ?, ?, ?, ?)`

/** The newest row per subject — the prior a diff is taken against. */
export const SQL_LATEST = `SELECT subject, value, provenance, cause, observed_at
  FROM ${TABLE}
 WHERE id IN (SELECT MAX(id) FROM ${TABLE} GROUP BY subject)`

export const SQL_COUNT = `SELECT COUNT(*) AS n FROM ${TABLE}`

/**
 * `provenance` and `value` from one Fable `Forecast`.
 *
 * READS THE COMPILED UNION, never a reimplementation of it. Fable emits a
 * union case as an object carrying `tag` and `fields`; the shape is read from
 * the value rather than assumed, so a case reordering surfaces as an unknown
 * tag instead of a silently mislabelled row.
 */
export function rowOf(forecast, caseNames) {
  const name = caseNames[forecast?.tag]
  if (!name) return null
  if (name === 'NoForecast') {
    const reason = forecast.fields?.[0]
    return { provenance: 'NoForecast', value: typeof reason === 'string' ? reason : String(reason?.name ?? reason?.tag ?? 'unknown') }
  }
  const m = name === 'Modelled' ? forecast.fields?.[0]?.Market : forecast.fields?.[0]
  const nums = m?.fields ?? []
  if (nums.length !== 3 || nums.some(n => typeof n !== 'number')) return null
  return { provenance: name, value: nums.map(n => n.toFixed(6)).join('/') }
}

/** A value string back to three numbers, or null. Used to compare two rows. */
export const parseValue = (v) => {
  const parts = String(v).split('/')
  if (parts.length !== 3) return null
  const nums = parts.map(Number)
  return nums.some(Number.isNaN) ? null : nums
}
