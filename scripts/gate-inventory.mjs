// The gate's row inventory, kept outside the gate.
//
// `scripts/confidence.mjs` scores as `earned / possible`, and `possible` is the
// sum of whatever rows happen to exist. That makes the denominator editable by
// the thing being measured: delete a failing row and the score goes UP.
// Measured, not assumed — 86/100 with a failing row present, 100/100 with the
// same row removed and nothing else changed.
//
// FIELD has already paid for this. `Resolve the standing confidence-gate CI
// violation — 2026-07-12` records a score of "100/100 (of 80 applicable points,
// per TASK 1's N/A exclusion)". The numerator was honest; the denominator moved.
// A gate whose denominator is chosen by the session it is grading is a gate that
// always passes eventually.
//
// So the inventory lives in docs/, and the gate compares itself against it.
//
// What this buys: shrinking the gate now requires editing two files in two
// directories, which shows up in the diff — and `outboxAccompaniesSource`
// already forces any scripts/ change to arrive with an outbox entry, so a
// removed row cannot be silent.
//
// What it does NOT buy: tamper-proofing. Nothing self-hosted can have that —
// both files are writable by anyone who can write either one. The claim is
// narrower and worth stating plainly: this converts a silent shrink into a
// visible one.
//
// Usage:  node scripts/gate-inventory.mjs     (runs the self-test)

import { readFileSync } from 'node:fs'

export const INVENTORY_PATH = 'docs/gate-rows.txt'

/** Parse `<weight> <name>` lines, ignoring comments and blanks. */
export const readInventory = (path = INVENTORY_PATH) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .map(l => l.replace(/^\s*#.*$/, '').trim())
    .filter(Boolean)
    .map(l => {
      const m = /^(\d+)\s+(.+)$/.exec(l)
      if (!m) throw new Error(`${path}: cannot parse line: ${l}`)
      return { weight: Number(m[1]), name: m[2].trim() }
    })

/**
 * Every way the live rows can disagree with the inventory.
 *
 * Order is deliberately NOT compared. Rows are keyed by name, because moving a
 * row is not a weakening and failing on it would train people to ignore this.
 */
export const diffAgainst = (inventory, rows) => {
  const problems = []
  const live = new Map(rows.map(r => [r.name, r.weight]))
  const declared = new Map(inventory.map(r => [r.name, r.weight]))

  for (const [name, weight] of declared) {
    if (!live.has(name)) problems.push(`MISSING row "${name}" (${weight} pts) — declared in ${INVENTORY_PATH}, not in the gate`)
    else if (live.get(name) !== weight) problems.push(`WEIGHT changed for "${name}": declared ${weight}, gate has ${live.get(name)}`)
  }
  for (const [name, weight] of live) {
    if (!declared.has(name)) problems.push(`UNDECLARED row "${name}" (${weight} pts) — in the gate, not in ${INVENTORY_PATH}`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// Self-test. A guard shown only to pass is half-tested, and this one guards
// against deletion, so the deletion case is the case that matters.
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createChecks } = await import('./checks.mjs')
  const { rows } = await import('./gate-checks.mjs')
  const { check, summarize } = createChecks()

  // THE REAL COMPARISON, FIRST. A Claude chat session reviewing this repo ran
  // this script standalone, deleted a real row from docs/gate-rows.txt on disk,
  // re-ran it, and got the same six passes — because everything below this line
  // is synthetic. They were right to call that out: a guard that answers a
  // question the checker did not ask is worse than one that refuses to answer.
  //
  // This needs no .NET, no browser and no build, which is the point. That
  // reviewer had none of the three; the full gate was unrunnable for them, so
  // the only reachable check had to be the honest one.
  const realProblems = diffAgainst(readInventory(), rows)
  check(`the live gate matches ${INVENTORY_PATH}`, realProblems.length === 0,
    realProblems.join('\n      → '))

  const declared = [
    { weight: 10, name: 'alpha' },
    { weight: 20, name: 'beta' },
    { weight: 30, name: 'gamma' },
  ]

  const identical = diffAgainst(declared, [...declared])
  check('an unchanged gate reports no problems', identical.length === 0,
    `reported: ${identical.join(' | ')} — the detector fails everything`)

  // The actual attack: drop the row that was failing.
  const dropped = diffAgainst(declared, declared.filter(r => r.name !== 'beta'))
  check('a DELETED row is caught', dropped.some(p => p.startsWith('MISSING row "beta"')),
    `reported: ${dropped.join(' | ')}`)

  // The quieter version of the same attack: leave the row, shrink its weight.
  const lightened = diffAgainst(declared,
    declared.map(r => (r.name === 'beta' ? { ...r, weight: 1 } : r)))
  check('a row silently reduced in weight is caught',
    lightened.some(p => p.startsWith('WEIGHT changed for "beta"')),
    `reported: ${lightened.join(' | ')}`)

  // The opposite direction, so adding a row is not free either — a new row must
  // be declared, which is where someone has to say what it is worth.
  const added = diffAgainst(declared, [...declared, { weight: 5, name: 'delta' }])
  check('an undeclared new row is caught',
    added.some(p => p.startsWith('UNDECLARED row "delta"')),
    `reported: ${added.join(' | ')}`)

  // Reordering is not a weakening; failing on it would make this noise.
  const reordered = diffAgainst(declared, [...declared].reverse())
  check('reordering rows is not flagged', reordered.length === 0,
    `reported: ${reordered.join(' | ')}`)

  // And the real file must parse — a typo here would disable the whole check
  // by throwing before any comparison happens.
  let real = null
  try { real = readInventory() } catch (e) { real = e.message }
  check(`${INVENTORY_PATH} parses`, Array.isArray(real) && real.length > 0,
    typeof real === 'string' ? real : 'parsed to an empty list')

  process.exit(summarize() === 0 ? 0 : 1)
}
