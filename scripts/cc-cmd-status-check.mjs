// A CC-CMD's status must be greppable, and it must not contradict the document
// it sits on top of.
//
// WHY THIS EXISTS
//
// On 2026-08-27 a session was asked to audit which CC-CMDs were still open. It
// ran `grep -lE '^#+ *(CLOSED|RESOLVED|DONE)' docs/CC-CMD-*.md` and reported
// TEN open asks. The real number was three. Fifteen documents carried their
// status on a `**Status:**` LINE and the grep was looking for a HEADING, so
// every one of them read as unfinished.
//
// The cost of that error is specific and this repository has paid it five times
// in one week, by field-relay-nba's own HANDOFF count: a session reads a stale
// "open", rebuilds work that already shipped, and the duplicate is not merely
// redundant — the 2026-08-23 FPL case reintroduced two bugs the original had
// been corrected for one day earlier.
//
// The same grep also MISSED a real defect in the opposite direction. The
// per-play EPA ask had been closed twenty minutes before, with a full `## CLOSED`
// section listing three met done conditions — and its `**Status:**` line still
// read "FILED, not started." A reader who trusted either half was wrong about
// the other. Both failures are one cause: the marker had no agreed form, so no
// mechanical reader could be trusted about it, in either direction.
//
// WHAT THIS CHECKS, and what it deliberately does not
//
// It does NOT judge whether an ask is finished. That is a human and a
// measurement, never a linter. It checks three mechanical properties:
//
//   1. Every CC-CMD carries exactly one `**Status:**` line, so a grep for it
//      cannot silently find nothing.
//   2. That line opens with a word from a closed vocabulary, so a grep for the
//      terminal ones is exhaustive rather than a guess about phrasing.
//   3. A document whose status is NON-TERMINAL does not also contain a closing
//      section. That contradiction is the exact state the EPA ask spent twenty
//      minutes in, and it is invisible to any reader who checks only one half.
//
// A doc may be non-terminal, and may be terminal. It may not be both at once.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'docs'

// The closed vocabulary. TERMINAL means the ask needs no further work in this
// repository; a residual explicitly assigned to a human does not make an ask
// non-terminal, or the three 2026-08-09 asks would stay open forever waiting on
// a settings dialog nobody has a tool for.
const TERMINAL = ['CLOSED', 'RESOLVED', 'BUILT', 'DONE', 'LANDED', 'SHIPPED', 'WITHDRAWN', 'SUPERSEDED']
const NONTERMINAL = ['FILED', 'OPEN', 'IN PROGRESS', 'BLOCKED', 'STAGED', 'PARTIAL']

// A closing SECTION, not a passing mention. `## CLOSED 2026-08-27` counts;
// the sentence "the relay just closed this" in a paragraph does not.
const CLOSING_SECTION = /^#{2,4} *(CLOSED|RESOLVED|LANDED|COMPLETE)\b/im

let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `\n        → ${detail}`}`)
  ok ? pass++ : fail++
}

// Returns { status, word, terminal } or null when there is no usable line.
export function readStatus (text) {
  const lines = text.split('\n').filter(l => /^\*\*Status:\*\*/.test(l))
  if (lines.length !== 1) return { count: lines.length }
  const body = lines[0].replace(/^\*\*Status:\*\*\s*/, '').replace(/\*/g, '').trim()
  const upper = body.toUpperCase()
  const word = [...TERMINAL, ...NONTERMINAL].find(w => upper.startsWith(w)) || null
  return { count: 1, body, word, terminal: word ? TERMINAL.includes(word) : null }
}

export function contradicts (text) {
  const s = readStatus(text)
  return s.count === 1 && s.terminal === false && CLOSING_SECTION.test(text)
}

// ── self-test, so a broken detector fails HERE rather than passing there ─────
if (process.argv.includes('--self-test')) {
  const T = (label, ok) => check(label, ok)
  T('a single Status line is read', readStatus('**Status:** CLOSED 2026-01-01\nbody').word === 'CLOSED')
  T('bold inside the status does not defeat the vocabulary',
    readStatus('**Status:** **CLOSED 2026-08-27**, same day').word === 'CLOSED')
  T('a missing Status line is reported as missing', readStatus('# doc\nno status').count === 0)
  T('two Status lines are a conflict, not an override',
    readStatus('**Status:** FILED\n**Status:** CLOSED').count === 2)
  T('an unknown word is not silently accepted', readStatus('**Status:** probably fine').word === null)
  T('BUILT and WITHDRAWN are terminal',
    readStatus('**Status:** BUILT 2026-08-24').terminal === true &&
    readStatus('**Status:** WITHDRAWN same day').terminal === true)
  T('FILED is not terminal', readStatus('**Status:** FILED, not started.').terminal === false)
  // The defect this file exists for, as a fixture.
  T('THE CONTRADICTION IS CAUGHT: FILED above a ## CLOSED section',
    contradicts('**Status:** FILED, not started.\n\n## CLOSED 2026-08-27\n\nall three met'))
  T('...and a terminal status above the same section is fine',
    !contradicts('**Status:** CLOSED 2026-08-27\n\n## CLOSED 2026-08-27\n\nall three met'))
  T('...and a non-terminal doc with no closing section is fine',
    !contradicts('**Status:** FILED, not started.\n\n## Done condition\n\nthree things'))
  T('a passing mention of the word is not a closing section',
    !contradicts('**Status:** FILED\n\nthe relay just closed the games fragmentation'))
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} self-test(s)\n`)
  process.exit(fail === 0 ? 0 : 1)
}

// ── the real run ────────────────────────────────────────────────────────────
const files = readdirSync(DIR).filter(f => /^CC-CMD-.*\.md$/.test(f)).sort()

const missing = [], multiple = [], unknown = [], conflicted = []
const terminal = [], open = []

for (const f of files) {
  const text = readFileSync(join(DIR, f), 'utf8')
  const s = readStatus(text)
  if (s.count === 0) { missing.push(f); continue }
  if (s.count > 1) { multiple.push(`${f}: ${s.count} Status lines`); continue }
  if (!s.word) { unknown.push(`${f}: "${s.body.slice(0, 60)}"`); continue }
  if (s.terminal) terminal.push(f)
  else {
    open.push(`${f} — ${s.word}`)
    if (CLOSING_SECTION.test(text)) {
      const heading = text.match(CLOSING_SECTION)[0].trim()
      conflicted.push(`${f}: status says ${s.word}, but the document carries "${heading}"`)
    }
  }
}

console.log(`\n  ${files.length} CC-CMD(s): ${terminal.length} terminal, ${open.length} open\n`)
for (const o of open) console.log(`    OPEN  ${o}`)
if (open.length) console.log('')

check('every CC-CMD carries a Status line', missing.length === 0,
  `${missing.length} without one: ${missing.join(', ')}`)
check('...exactly one, so a second cannot override the first', multiple.length === 0,
  multiple.join('\n        → '))
check('every status opens with a word from the closed vocabulary', unknown.length === 0,
  `a grep for the terminal words is only exhaustive if this holds\n        → ${unknown.join('\n        → ')}`)
check('no document is open at the top and closed further down', conflicted.length === 0,
  conflicted.join('\n        → '))

// NON-VACUITY. "Every status is well-formed" is free over an empty directory,
// and this check would then pass on a repo whose docs/ had been emptied.
check('there are CC-CMDs to check at all', files.length > 0, `${files.length} found`)

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} checks passed`)
process.exit(fail === 0 ? 0 : 1)
