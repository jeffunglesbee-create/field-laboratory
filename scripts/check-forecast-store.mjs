// The store's SQL, executed against a real SQLite rather than described.
//
// `node:sqlite` is the same dialect D1 runs, and the claims that matter —
// append-only, the provenance CHECK, the newest-row read — are properties of
// the STATEMENTS, not of the code around them. Asserting them in prose is how
// a store that can overwrite ships with a comment saying it cannot.
import { DatabaseSync } from 'node:sqlite'
import { DDL, DDL_INDEX, SQL_INSERT, SQL_LATEST, SQL_COUNT, TABLE, rowOf, parseValue } from './forecast-store.mjs'

let pass = 0, fail = 0
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`) } else { fail++; console.log(`  FAIL  ${n}${d ? `\n        ${d}` : ''}`) } }
const fresh = () => { const db = new DatabaseSync(':memory:'); db.exec(DDL); db.exec(DDL_INDEX); return db }
const add = (db, s, v, p, c, at) => db.prepare(SQL_INSERT).run(s, v, p, c, at)

// ── the schema executes at all ────────────────────────────────────────────
const db = fresh()
t('the DDL runs on a real SQLite', true)
t('it is idempotent — IF NOT EXISTS means a second run is not an error',
  (() => { try { db.exec(DDL); db.exec(DDL_INDEX); return true } catch { return false } })())

// ── APPEND-ONLY, which is the whole claim ─────────────────────────────────
add(db, 'fx-1', '0.5/0.3/0.2', 'Modelled', 'NoPrior', '2026-10-04T00:00:00Z')
add(db, 'fx-1', '0.6/0.25/0.15', 'Modelled', 'Unchanged', '2026-10-05T00:00:00Z')
t('TWO OBSERVATIONS OF ONE SUBJECT BOTH SURVIVE',
  db.prepare(SQL_COUNT).get().n === 2, JSON.stringify(db.prepare(SQL_COUNT).get()))
t('...and the first one is still readable in full',
  db.prepare(`SELECT value FROM ${TABLE} WHERE id = 1`).get().value === '0.5/0.3/0.2',
  'the codex_write defect was exactly this: the first body gone, the row still there')
t('NO UNIQUE KEY INVITES AN UPSERT: a third row for the same subject inserts',
  (() => { add(db, 'fx-1', '0.7/0.2/0.1', 'Modelled', 'MarketMoved', '2026-10-06T00:00:00Z')
           return db.prepare(SQL_COUNT).get().n === 3 })())

// ── the CHECK is real, not documentation ──────────────────────────────────
t('AN UNKNOWN PROVENANCE IS REFUSED BY THE DATABASE',
  (() => { try { add(db, 'fx-9', '0.5/0.3/0.2', 'Guessed', 'Unchanged', '2026-10-04T00:00:00Z'); return false }
           catch { return true } })(),
  'a typo in a writer would otherwise create a fourth provenance nothing reads')
t('each of the three declared provenances is accepted',
  ['MarketImplied', 'Modelled', 'NoForecast'].every(p => {
    try { add(db, `p-${p}`, 'x', p, 'Unchanged', '2026-10-04T00:00:00Z'); return true } catch { return false } }))
t('a null subject is refused', (() => { try { add(db, null, 'v', 'Modelled', 'Unchanged', 'x'); return false } catch { return true } })())
t('a null cause is refused — a row without a cause is not a record entry',
  (() => { try { add(db, 's', 'v', 'Modelled', null, 'x'); return false } catch { return true } })())

// ── the prior a diff is taken against ─────────────────────────────────────
const db2 = fresh()
add(db2, 'fx-1', 'a', 'Modelled', 'NoPrior', '2026-10-04T00:00:00Z')
add(db2, 'fx-1', 'b', 'Modelled', 'Unchanged', '2026-10-05T00:00:00Z')
add(db2, 'fx-2', 'c', 'NoForecast', 'NoPrior', '2026-10-04T00:00:00Z')
const latest = db2.prepare(SQL_LATEST).all()
t('the latest read returns one row per subject', latest.length === 2, JSON.stringify(latest))
t('AND IT IS THE NEWEST ONE, not the first',
  latest.find(r => r.subject === 'fx-1').value === 'b', JSON.stringify(latest))
// MAX(id), not MAX(observed_at): two rows written in the same second are a real
// case (a backfill), and a string compare on equal timestamps picks arbitrarily.
const db3 = fresh()
add(db3, 'fx-1', 'first', 'Modelled', 'NoPrior', '2026-10-04T00:00:00Z')
add(db3, 'fx-1', 'second', 'Modelled', 'Unchanged', '2026-10-04T00:00:00Z')
t('TWO ROWS AT THE SAME TIMESTAMP RESOLVE TO THE LATER INSERT',
  db3.prepare(SQL_LATEST).all()[0].value === 'second',
  'MAX(id) rather than MAX(observed_at); equal timestamps happen in a backfill')
t('an empty table yields no prior rather than throwing',
  fresh().prepare(SQL_LATEST).all().length === 0)

// ── reading a compiled Fable union ────────────────────────────────────────
const NAMES = ['MarketImplied', 'Modelled', 'NoForecast']
t('a Modelled case becomes a Modelled row with three numbers',
  JSON.stringify(rowOf({ tag: 1, fields: [{ Market: { fields: [0.5, 0.3, 0.2] } }] }, NAMES))
    === JSON.stringify({ provenance: 'Modelled', value: '0.500000/0.300000/0.200000' }),
  JSON.stringify(rowOf({ tag: 1, fields: [{ Market: { fields: [0.5, 0.3, 0.2] } }] }, NAMES)))
t('a MarketImplied case reads its ThreeWay directly',
  rowOf({ tag: 0, fields: [{ fields: [0.4, 0.3, 0.3] }] }, NAMES).provenance === 'MarketImplied')
t('A NoForecast case stores its REASON as the value, not an empty string',
  rowOf({ tag: 2, fields: [{ name: 'FixtureUnscheduled' }] }, NAMES).value === 'FixtureUnscheduled')
t('AN UNKNOWN TAG IS null, NEVER A DEFAULTED ROW',
  rowOf({ tag: 7, fields: [] }, NAMES) === null,
  'a case reordering must surface, not write a mislabelled row')
t('a market with the wrong arity is null, not a two-way written as three',
  rowOf({ tag: 0, fields: [{ fields: [0.6, 0.4] }] }, NAMES) === null)
t('a market carrying a non-number is null',
  rowOf({ tag: 0, fields: [{ fields: [0.6, 'x', 0.1] }] }, NAMES) === null)

t('a stored value parses back to three numbers', JSON.stringify(parseValue('0.5/0.3/0.2')) === '[0.5,0.3,0.2]')
t('A REASON STRING DOES NOT PARSE AS A MARKET', parseValue('FixtureUnscheduled') === null,
  'otherwise a NoForecast row would be compared numerically against a priced one')

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} checks`)
console.log('COVERAGE: the SQL, executed on node:sqlite, and the Fable union reader.')
console.log('It does NOT prove D1 accepts these statements over /d1/execute — that')
console.log('needs the table in the relay\'s ALLOWED_TABLES and a live run.')
process.exit(fail ? 1 : 0)
