// Confidence PER ROW, earned the same way the gate's total is.
//
// The gate scores itself per row as weight/weight — which is only "did this
// command exit 0". That is a fact about today's tree, not confidence in the row.
// A row that passes and has never been shown to fail is exactly the shape this
// session kept finding: `outboxToday` passed on any dated file, `zone-check`
// passed on a broken build, Scout's Gate C lied while `tab-check` agreed.
//
// So a row's confidence is computed from three things it can be wrong about,
// and none of them is self-reported:
//
//   TEETH (70)         at least one mutation in mutation-check breaks the
//                      invariant this row guards, and THIS ROW is what fails.
//                      The only part that distinguishes a guard from a green
//                      light.
//   DETERMINISTIC (30) the row's scripts do not consult the wall clock or the
//                      network, so the answer is the same tomorrow. This repo
//                      has been burned twice by time-dependent assertions.
//
// Both are required to clear 95, which is the point: a guard with teeth that
// answers differently tomorrow is not a guard, and neither is a stable one that
// has never been shown to fail.
//
// "Does the row pass today" is deliberately NOT scored here — that is exactly
// what the gate measures, and duplicating it would let a green light stand in
// for evidence again. The first version did include it, and got it wrong:
// it ran each row's script without the row's arguments, so `drift-check.mjs`
// with no `--file` "failed" and two rows scored 0 for a reason that was the
// scorer's mistake.
//
// A row below 95 is one nothing has proven can fail. That is a to-do with an
// address on it, not a score to argue with.
//
// Usage:  node scripts/row-confidence.mjs

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rows } from './gate-checks.mjs'
import { createChecks, finish } from './checks.mjs'

const BAR = 95

const gateSource = readFileSync('scripts/gate-checks.mjs', 'utf8')
const mutationSource = readFileSync('scripts/mutation-check.mjs', 'utf8')

/** The scripts a row shells out to, read from its declaration. */
const scriptsOf = rowName => {
  // Slice the row's own object literal, so a neighbouring row's command is not
  // attributed to it.
  const at = gateSource.indexOf(`name: '${rowName}'`) >= 0
    ? gateSource.indexOf(`name: '${rowName}'`)
    : gateSource.indexOf(`name: "${rowName}"`)
  if (at === -1) return []
  const end = gateSource.indexOf('\n\n', at)
  const decl = gateSource.slice(at, end === -1 ? gateSource.length : end)
  const named = [...decl.matchAll(/scripts\/([\w.-]+\.mjs)/g)].map(m => `scripts/${m[1]}`)
  // A row whose `run` is a local function — the outbox and history rows — names
  // no script, and its logic lives in gate-checks.mjs. Those rows were scanned
  // for nondeterminism against an EMPTY file list, so they scored full marks for
  // determinism without anything being read.
  //
  // That is how CI run 31456294086 failed: `outboxToday` called `fieldDay()` at
  // row-evaluation time, the run crossed midnight ET, and the row asked about a
  // different day than the one it started in. This scorer's own rule would have
  // caught it, if it had been looking at the file.
  return named.length > 0 ? named : ['scripts/gate-checks.mjs']
}

/**
 * Mutations that name THIS ROW as their expectation.
 *
 * Matched on the row name rather than a shared script path. Path matching
 * credited every row that happened to invoke the same script, and could not
 * credit the outbox or history rows at all — their logic lives in
 * gate-checks.mjs, not in a script of their own.
 */
const mutationsFor = (scripts, rowName) => {
  const found = []
  for (const block of mutationSource.split(/\n  \{\n/).slice(1)) {
    const id = /id: '([^']+)'/.exec(block)?.[1]
    // Match the WHOLE quoted string. The first version stopped at the first
    // quote of any kind, so `expect: "URL='http://…' node scripts/tab-check.mjs"`
    // captured `URL=` and the tab rows appeared to have no teeth at all.
    // Backticks included: `harness-blind`'s expectation is a template literal
    // wrapping a shell `!`, and a quote-only pattern read it as empty — the
    // mutation row then showed no teeth while its teeth were sitting right
    // there.
    const expect = /expect:\s*(['"`])((?:\\.|(?!\1).)*)\1/.exec(block)?.[2] ?? ''
    if (!id) continue
    if (expect.includes(rowName)) { found.push(id); continue }
    // Legacy form: a mutation naming the script the row runs.
    if (!/run-row\.mjs/.test(expect) && scripts.some(s => expect.includes(s))) found.push(id)
  }
  return found
}

/**
 * The source with comments removed, every string replaced by an empty string, every regular-expression literal by `0`, and every template literal by an empty string preceded by its `${…}` expressions, each kept as code in parentheses (`a ${b} c` leaves ` (b) ''`): what is left is code.
 *
 * IT IS A SCANNER, NOT THREE REGULAR EXPRESSIONS. The version before this one removed `//` comments line by line and then paired quotes across the whole file, and the two
 * disagree about a `//` inside a string (`'http://…'`, `"URL='http://…' node …"`): the comment pass cut the line at the `//`, which took the closing quote with it, and every
 * quote after that paired with the wrong one. From the first such line in `mutation-check.mjs` (measured 2026-11-04: line 111 of the file as committed) the scan read the file's strings as code and
 * its code as strings, so a clock read could sit in a region it never saw. It held up by parity until the table grew by 41 entries; then `harness-reads-the-clock-twice`, the
 * mutation that proves this row can see a second clock read in that very file, survived (2026-11-04, the gate's mutation row), and the row's claim for that file had been
 * undefended for as long as the parity happened to be wrong.
 *
 * Checked against a real tokenizer: acorn's, over all 168 scripts, left the same text as this does (template expressions kept, template text not). That comparison is a
 * one-off, not a test in the repo, because acorn is only reachable through `node --expose-internals`.
 *
 * A template literal's TEXT is hidden (`new Date() ${1}` holds no clock read); its `${…}` expressions are code, so a read in one is counted (`new Date(\`${fieldDay()}T12:00:00Z\`)` was a clock read
 * this scan could not see until `pickem-check.mjs` captured the day once), and a `/` that begins one begins a regular expression whatever stood before the template (a tag, `)`, `]`, a word).
 *
 * A `/` after the `)` that closes the header of an if, while, for or with begins a regular expression (`if (x) /re/.test(y)`; where that regular expression holds a backtick the scan used to open a template that
 * swallowed the rest of the file, so every later clock read was invisible); after any other `)`, and after `]`, it divides, and so does a `/` after a name that merely ends in `if` (`elif (x) / 2`). A `/` after a
 * `/` begins one (`a / /re/.source`).
 *
 * What it still does not do: a `/` after `}` is read as the start of a regular expression, which is right after a block
 * and wrong after an object literal or a class body (`{a: 1} / 2`). A `/` after `++`/`--` that ends an operand on the same line, and after a property spelled like a keyword
 * (`c.new`), is division (review 4, 2026-11-04: both were read as regular expressions, which inside a template expression hid the rest of the file); a `++` that starts its
 * statement, or follows a keyword, is a prefix, and a `.` that ends `...` or a number is not member access (review 5). A line ends at a line feed, a carriage return, U+2028 or
 * U+2029: a `//` comment, a regular expression and the `++` test stop there; a string stops at a line feed or a carriage return (U+2028 and U+2029 may be inside one), and a backslash
 * before a CR LF continues it over both. `instanceof`, `extends` and `default` can be followed by a regular expression. (A leading `#!`
 * line is read as a regular expression that ends at its line, which changes no count: 23 scripts begin with one.)
 */
const stripNonCode = src => {
  const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])
  const n = src.length
  let out = ''
  // The parentheses seen so far, in code: where in `out` each open one began, and where the one closed last began.
  const opens = []
  let closed = 0
  // The characters the language ends a line at (no raw U+2028 or U+2029 in this file: an editor would change what it means).
  const isEol = ch => ch === '\n' || ch === '\r' || ch === String.fromCharCode(0x2028) || ch === String.fromCharCode(0x2029)
  // A `.` that is member access: not the end of `...` (a spread, after which a keyword is a keyword) and not a number's decimal point (`1.`).
  const isPropertyDot = before => before.endsWith('.') && !before.endsWith('...') && !/(?<![\w$.])\d+\.$/.test(before)
  // Does `text` end in a keyword that a regular expression can follow, as opposed to a property spelled like one (`c.new`, `o?.in`)?
  const endsInKeyword = text => {
    const found = /([A-Za-z_$][\w$]*)$/.exec(text)
    return found !== null && REGEX_AFTER.has(found[1]) && !isPropertyDot(text.slice(0, found.index).trimEnd())
  }
  // Can a `/` here begin a regular expression? Only after something that cannot end an expression.
  const regexAllowed = () => {
    const raw = out.slice(-64)
    let tail = raw.trimEnd()
    // A window of nothing but whitespace is the start of the text only if nothing but whitespace came before it: `w` and sixty spaces and then `/ 2` divides.
    if (tail === '' && out.length > raw.length) tail = out.trimEnd().slice(-64)
    if (tail === '') return true
    // `x++ / y` and `x-- / y` divide: the operator ended an operand. Not when the operator starts its statement (`a` newline `++/re/` is a prefix), nor after a keyword
    // (`return ++/re/`). Otherwise `+` and `-` end nothing, and a `/` after them begins a regular expression.
    if (/(\+\+|--)$/.test(tail)) {
      const before = tail.slice(0, -2)
      const operand = before.trimEnd()
      if (/[\w$)\]]$/.test(operand) && ![...before.slice(operand.length)].some(isEol) && !endsInKeyword(operand)) return false
    }
    // The `)` that closes the header of an if, while, for or with begins a statement, so a `/` after it begins a regular expression: `if (x) /re/.test(y)`. After any other `)` it divides.
    if (tail.endsWith(')') && /(?<![\w$.#])(?:if|while|for(?:\s+await)?|with)$/.test(out.slice(Math.max(0, closed - 40), closed).trimEnd())) return true
    if ('(,=:[!&|?{};+-*%<>~^/'.includes(tail[tail.length - 1])) return true
    return endsInKeyword(tail)
  }
  // Code from `start`. With `inExpr` it stops after the `}` that closes a template's `${`. Returns the index after what it consumed.
  const scanCode = (start, inExpr) => {
    let i = start
    let depth = 0
    while (i < n) {
      const c = src[i]
      const d = src[i + 1]
      if (c === '/' && d === '/') { while (i < n && !isEol(src[i])) i++; continue }
      if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; out += ' '; continue }
      if (c === "'" || c === '"') {
        // A string that reaches a line feed or a carriage return unclosed ends there: a stray quote must not be able to swallow the rest of the file. (U+2028 and U+2029 may be inside a string.)
        // A backslash and the line end after it continue the string, and a CR LF is one line end: skip both characters.
        i++
        while (i < n && src[i] !== c && src[i] !== '\n' && src[i] !== '\r') i += src[i] !== '\\' ? 1 : src[i + 1] === '\r' && src[i + 2] === '\n' ? 3 : 2
        if (src[i] === c) i++
        out += "''"
        continue
      }
      if (c === '`') { i = skipTemplate(i + 1); out += "''"; continue }
      if (c === '/') {
        if (!regexAllowed()) { out += '/'; i++; continue }
        i++
        let inClass = false
        while (i < n && !isEol(src[i])) {
          const r = src[i]
          if (r === '\\') { i += 2; continue }
          if (r === '[') inClass = true
          else if (r === ']') inClass = false
          else if (r === '/' && !inClass) break
          i++
        }
        if (src[i] === '/') i++
        while (i < n && /[a-z]/.test(src[i])) i++
        out += '0'
        continue
      }
      if (c === '(') opens.push(out.length)
      else if (c === ')') closed = opens.pop() ?? 0
      if (inExpr) {
        if (c === '{') depth++
        else if (c === '}') { if (depth === 0) return i + 1; depth-- }
      }
      out += c
      i++
    }
    return i
  }
  // A template literal: its text is not kept, but each `${…}` expression is, as code between ` (` and `) `. The parenthesis is what lets a `/` that begins the expression begin a regular expression
  // whatever stood before the template, and keeps the stripped text balanced. Expressions may hold strings and templates of their own.
  const skipTemplate = start => {
    let i = start
    while (i < n) {
      const c = src[i]
      if (c === '\\') { i += 2; continue }
      if (c === '`') return i + 1
      if (c === '$' && src[i + 1] === '{') {
        out += ' ('
        i = scanCode(i + 2, true)
        out += ') '
        continue
      }
      i++
    }
    return i
  }
  scanCode(0, false)
  return out
}

/** Clock reads, captured clock reads and network use in one source text. Pure, so the self-test can feed it snippets. */
const clockCounts = src => {
  const code = stripNonCode(src)

  // Clock reads BEHIND A HELPER count too. `fieldDay()` and `fieldToday()`
  // are this repo's zone-aware readers, and the first version of this scan
  // saw only literal `new Date()` — so it looked straight past
  // `const today = fieldDay()` inside the outbox row, which is the exact call
  // that failed CI run 31456294086 by crossing midnight mid-run.
  // The rule, stated generally: a clock read must be captured into a
  // top-level CONSTANT. Naming specific constants (NOW, GATE_DAY) made the
  // rule about vocabulary; this makes it about shape, and zone-check's
  // `fieldToday()` — the zero-argument production reader it exists to test —
  // can satisfy it the same way everything else does.
  // A capture is the read ITSELF: the constant holds the instant. A `=>`, a `class`, a `) {` or a `;` between the `=` and the read means it holds a function, a class, a method or
  // nothing of the kind, and the read happens later, every time it is called (`const NOW = () => new Date()`), so it is not counted as one.
  const captures = code.match(/const [A-Z][A-Z0-9_]* = (?:(?!=>|\bclass\b|\)\s*\{|;)[^\n])*?(new\s+Date(?![\w$])(?!\s*\(\s*[^\s)])|fieldDay\s*\(\s*\)|fieldToday\s*\(\s*\))/g) ?? []
  // A read is any way of asking the wall clock for an INSTANT: `Date.now` (called or not: `const clock = Date.now` reads it later), `Date['now']()` (a string is already `''` by now, so any computed member
  // called with nothing is counted and `Date['UTC'](1)` is not), `new Date` with no argument (parentheses or none; `new Date(x)` builds a date from x and reads nothing), `Date()` and `Date(5)` (they return the
  // current time whatever they are given), and a bare `Date` that is stored or passed on (`const D = Date`, `f(Date)`, `{ Date }`), since the time can then be asked for under another name. Not reads: `Date.UTC`, `o.Date`,
  // a `{ Date: 1 }` key, `x instanceof Date`, `typeof Date`, `new Date(5)`, and longer names. `performance.now()` and `process.hrtime()` are deliberately not counted: they are durations, and counting them takes the row
  // `doc claims are compiler-verified, not prose` below the bar on the two timings `proof-check.mjs` prints; if they are ever wanted, that script's `batchMs` has to go first. A capture takes the same `new Date`
  // spelling as the reads do, so that a capture is always also a read.
  const clockReads = code.match(/Date\s*\.\s*now(?![\w$])|Date\s*\[\s*''\s*\]\s*\(\s*\)|new\s+Date(?![\w$])(?!\s*\(\s*[^\s)])|fieldDay\s*\(\s*\)|fieldToday\s*\(\s*\)|(?<![.\w$])(?<!\b(?:new|instanceof|typeof)\s+)Date(?![\w$])(?!\s*[.\[:])/g) ?? []
  return { captures: captures.length, reads: clockReads.length, network: /https?:\/\/(?!localhost)/.test(code) }
}

/**
 * Wall-clock or network use anywhere the row reaches.
 *
 * Comments and string literals are stripped first. The first version scanned raw
 * source and flagged `drift-check.mjs` as reaching the network because its usage
 * comment shows a `--url https://…` example the gate never passes. That is the
 * SAME bug this session already fixed in workflow-check, which read the comment
 * explaining why a step was absent as the step itself. A detector that reads
 * documentation as code will fire on the sentence documenting it.
 *
 * The rule it applies: every clock read must be on the line of a `const NAME = ...` whose name is in capitals (a capture), and a script is flagged when it has more reads than
 * captures. A capture is the read itself, so `const A = () => new Date()` is not one. How many captures a script may have is not limited and nothing checks that one is at top level, so two
 * captures can straddle midnight between them. The shape this repo settled on is the same as `gameStateAt`'s: capture the instant ONCE, into `const NOW = new Date()`, then be pure.
 */
const nondeterminism = scripts => {
  const flagged = []
  for (const s of scripts) {
    let src
    try { src = readFileSync(s, 'utf8') } catch { continue }
    const { captures, reads, network } = clockCounts(src)
    if (reads > captures) {
      flagged.push(`${s}: reads the clock ${reads}x (capture it once as NOW)`)
    }
    if (network) flagged.push(`${s}: reaches the network`)
  }
  return flagged
}

console.log('\nPer-row confidence\n')

// --- self-test ---------------------------------------------------------------
//
// This scorer has the same self-reference problem as the mutation harness: blind
// its teeth-detection and every row scores 100, which looks like success. So it
// scores a synthetic pair whose answers are known — one row with a mutation and
// one without — and requires the second to come out below the bar.
//
// `--self-test` FAILING is what proves the scorer can still tell the difference,
// and the gate row asserts both halves.
const score = (hasTeeth, hasClock) => (hasTeeth ? 70 : 0) + (hasClock ? 0 : 30)

if (process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  check('a row with teeth and no clock scores 100', score(true, false) === 100,
    `got ${score(true, false)}`)
  check('a row with NO mutation is below the bar', score(false, false) < BAR,
    `a toothless row scored ${score(false, false)} — the scorer cannot tell`)
  check('a row that reads the clock is below the bar', score(true, true) < BAR,
    `a clock-reading row scored ${score(true, true)}`)

  scannerClauses(check)
  process.exit(summarize() === 0 ? 0 : 1)
}

const report = []
for (const row of rows) {
  const scripts = scriptsOf(row.name)
  const muts = mutationsFor(scripts, row.name)
  const nd = nondeterminism(scripts)

  // RUNS is asserted from the row's own command where it is cheap, and taken
  // from the last full gate run otherwise. Rows that need a browser or a build
  // are marked skipQuick and are not re-run here — that is stated, not hidden.
  report.push({ name: row.name, weight: row.weight,
                score: score(muts.length > 0, nd.length > 0), muts, nd, scripts })
}

const width = Math.max(...report.map(r => r.name.length))
for (const r of report.sort((a, b) => a.score - b.score || b.weight - a.weight)) {
  const flag = r.score >= BAR ? ' ' : '<'
  console.log(`  ${flag} ${String(r.score).padStart(3)}/100  w${String(r.weight).padStart(2)}  ${r.name.padEnd(width)}  ${
    r.muts.length ? `teeth: ${r.muts.join(', ')}` : 'NO MUTATION PROVES THIS ROW CAN FAIL'}`)
  for (const n of r.nd) console.log(`${' '.repeat(width + 22)}  ${n}`)
}

const below = report.filter(r => r.score < BAR)
console.log(`\n  ${report.length - below.length}/${report.length} rows at or above ${BAR}`)
if (below.length > 0) {
  console.log(`\n  BELOW ${BAR} — nothing has shown these can fail:\n`)
  for (const r of below.sort((a, b) => b.weight - a.weight)) {
    console.log(`    ${r.score}/100  (weight ${r.weight})  ${r.name}`)
  }
  console.log('')
}

const { check, summarize } = createChecks()
check(`every gate row is at or above ${BAR}`, below.length === 0,
  below.map(r => `${r.name} = ${r.score}`).join('\n      → '))
finish(summarize())

// The scanner's own clauses, at the END of the file on purpose. `scripts/check-exit-drains.mjs` blanks comments and strings with regular-expression passes (single quotes
// first, then double, then backticks, over the whole text) and these fixtures put quotes, backticks and slashes inside each other: after the first of them it pairs the wrong
// ends for the rest of the file and cannot see the exit line of the self-test above, so its count of early exits fell by one with nothing changed in what the script does
// (found 2026-11-04 by `check:exit-drains`: 59 against a budget of 60). Called through a hoisted declaration, so nothing before this line is affected. Residual Task 10 item 19.
function scannerClauses(check) {
  // The scanner under the determinism half. Each snippet is one the previous regular-expression version got wrong or could be made to: it is followed by a capture and a second,
  // bare clock read, which has to be counted wherever the quotes, comments and braces before it sit ("2/1" is reads over captures, and means the second read was seen).
  // The tail comes twice, on the same line and on the lines after, because a stray quote ends at its line: damage to the pairing is local to the line that caused it, and
  // is only visible to a read on that line or, for a template, to the lines after.
  const TAIL_INLINE = '; const NOW = new Date(); const later = new Date()\n'
  const TAIL_LINES = '\nconst NOW = new Date()\nconst later = new Date()\n'
  const seen = (pre, tail = TAIL_LINES) => { const c = clockCounts(pre + tail); return `${c.reads}/${c.captures}` }
  const everywhere = pre => `${seen(pre, TAIL_INLINE)} ${seen(pre, TAIL_LINES)}`
  const BOTH = '2/1 2/1'
  const sloppy = (label, snippets) => check(label, snippets.every(x => everywhere(x) === BOTH),
    snippets.map(x => `${JSON.stringify(x).slice(0, 50)}: ${everywhere(x)}`).join(' / ') + ` (wanted ${BOTH})`)
  sloppy('A `//` INSIDE A STRING DOES NOT HIDE WHAT COMES AFTER IT (the comment pass used to cut the line and take the closing quote with it)',
    ["const U = 'http://example.test/x'", 'const V = "URL=\'http://x\' node a.mjs"', 'const S = "it\'s"'])
  sloppy('A REGULAR EXPRESSION LITERAL WITH QUOTES, A SLASH IN A CLASS, OR RIGHT AFTER `return` IS NOT A STRING',
    ['const RE = /["\'`]/g', "const CL = /[/'\"]x/", "const f = x => { return /'/.test(x) }"])
  sloppy('A SLASH THAT DIVIDES IS NOT A REGULAR EXPRESSION', ["const q = a / b / c", "const r = (d + e) / 2 + 'x'"])
  sloppy('A REGULAR EXPRESSION AFTER THE PARENTHESIS OF AN if, while OR for HEADER IS NOT DIVISION: a quote or a backtick in it must not open a string or a template that swallows what comes after',
    ['if (x) /"/.test(y)', 'while (x) /`/.test(y)', "for (const a of b) /'/.test(a)", 'if (x) /`/.test(y)'])
  sloppy('AN ESCAPED QUOTE, AN ESCAPED BACKTICK, A NESTED TEMPLATE WITH STRINGS AND BRACES IN ITS EXPRESSION: each ends where it ends',
    ["const E = 'it\\'s'", 'const T = `x\\`y`', 'const N = `a ${ `b ${ {x: 1}.x } c` + \'`\' + "}" } d`', 'const B = `p ${ {a: 1}.a + `y` } q`', "const G = `p ${ {a: 1}.a + '`' } q`"])
  // A block comment where a `/` can only be division (after a value), so it is the comment rule that has to end it and nothing else would: quotes and a clock read inside it.
  sloppy('A BLOCK COMMENT AFTER A VALUE ENDS AT ITS `*/`, WHATEVER IS INSIDE IT', ["const C = 1 /* it's new Date() */ + 2", 'const D = x /* "\' ` */'])
  check('A CLOCK READ IN A COMMENT, A STRING OR A TEMPLATE\'S TEXT IS NOT ONE (an expression inside a template is code: see the spellings below)',
    clockCounts("// new Date()\n/* Date.now() */\nconst s = 'new Date()'\nconst t = `new Date() ${1}`\n").reads === 0,
    `saw ${clockCounts("// new Date()\n/* Date.now() */\nconst s = 'new Date()'\nconst t = `new Date() ${1}`\n").reads} reads in text that is not code`)
  check('AN UNCLOSED QUOTE ENDS AT ITS LINE: it cannot swallow the rest of the file', seen("const a = 'oops") === '2/1', `saw ${seen("const a = 'oops")}`)
  // THE STRIPPED TEXT ITSELF, not only the counts it leads to. A count survives a scanner that changes what it leaves behind as long as the damage lands where no clock read is, which is
  // how half of the scanner's branches could be broken with every clause green (review 4, 2026-11-04: 49 of 66 mutants of it passed this self-test and the whole 23-row run).
  // Each pair is an input and exactly what must be left of it: comments gone, strings and regular expressions and templates reduced to a marker, division left alone.
  const STRIPS = [
    ['a = \'x\' + "y"', 'a = \'\' + \'\'', 'both quote kinds, each kept as an empty string'],
    ['a = `t ${1} u`', "a =  (1) ''", 'a template: its text is gone and its expression is kept, as an operand in parentheses'],
    ['a = /x[/]/gi + b', 'a = 0 + b', 'a regular expression with a slash in a class, and its flags'],
    ['a /* c */ b', 'a   b', 'a block comment becomes one space'],
    ['a // c\nb', 'a \nb', 'a line comment ends at its newline and leaves it'],
    ['a /*/ b */ c', 'a   c', 'a block comment cannot end on the slash that opened it'],
    ['x = // new Date()\ny', 'x = \ny', 'a comment where a regular expression could begin is still a comment'],
    ['/"\'`/.test(a)', '0.test(a)', 'a regular expression at the very start of the text'],
    ['a = `just text`', "a = ''", 'a template with no expression is one empty string'],
    ['`${a}${b} t`', " (a)  (b) ''", 'each expression of a template is kept, in order'],
    ['tag`${/"/.test(y)}`', "tag (0.test(y)) ''", 'a slash that begins a template expression begins a regular expression, whatever stood before the template'],
    ['`${a}` / 2 / z', " (a) '' / 2 / z", 'a slash after a template divides'],
    ["'oops\nb", "''\nb", 'an unclosed quote ends at its line'],
    ['x = y / 2 / z', 'x = y / 2 / z', 'division'],
    ['x = (a) / 2 / b', 'x = (a) / 2 / b', 'division after a parenthesis'],
    ['x = a[0] / 2 / b', 'x = a[0] / 2 / b', 'division after a bracket'],
    ['n++ / 2 / y', 'n++ / 2 / y', 'division after a postfix increment'],
    ['n-- / 2 / y', 'n-- / 2 / y', 'division after a postfix decrement'],
    ['x = ++/"/.lastIndex', 'x = ++0.lastIndex', 'a prefix increment is not an operand end'],
    ['return /x/.test(y)', 'return 0.test(y)', 'a regular expression after a keyword'],
    ['`${ {a:{b:1}}.a } x` + c', " ( {a:{b:1}}.a ) '' + c", 'braces nested inside a template expression close where they close'],
    ['`a ${ Date.now() } b`', " ( Date.now() ) ''", 'the inside of a template expression is kept'],
    ['`a ${ `b ${1}` + "}" } c` + d', " (  (1) '' + '' ) '' + d", 'a template inside a template expression, with a brace in a string'],
  ]
  for (const k of ['return', 'typeof', 'case', 'in', 'of', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']) {
    STRIPS.push([`${k} /"'\`/`, `${k} 0`, `a regular expression after the keyword ${k}`], [`o.${k} / 2`, `o.${k} / 2`, `a property named ${k} is not the keyword`])
  }
  STRIPS.push(['o?.in / 2', 'o?.in / 2', 'an optional-chained property named like a keyword'], ['o. of / 2', 'o. of / 2', 'a property after a dot and a space'])
  for (const c of '(,=:[!&|?{};+-*%<>~^') STRIPS.push([`x ${c} /"'\`/`, `x ${c} 0`, `a regular expression after ${c}`])
  // A few spaces between the keyword and the slash: the window the scan looks back over must reach the keyword through them.
  STRIPS.push([`typeof   /'/`, `typeof   0`, 'a regular expression after a keyword and three spaces'])
  // Review 5. Every branch of the increment and property rules, each pair broken by one mutant of its own (the table entries `row-scan-increment-*` and `row-scan-*-dot-*`).
  const Q = '"\'`'
  STRIPS.push(
    [`n++\nconst RE = /${Q}/g`, 'n++\nconst RE = 0', 'an increment earlier in the window does not make the slash after `=` a division'],
    ['a[0]++ / 2 / b', 'a[0]++ / 2 / b', 'division after a postfix increment of an element'],
    ['(a)++ / 2 / b', '(a)++ / 2 / b', 'division after a postfix increment of a parenthesis'],
    ['n ++ / 2 / b', 'n ++ / 2 / b', 'division after a postfix increment with a space'],
    [`a\n++/${Q}/.lastIndex`, `a\n++0.lastIndex`, 'a `++` that starts its statement is a prefix (ASI)'],
    [`a\n--/${Q}/.lastIndex`, `a\n--0.lastIndex`, 'a `--` that starts its statement is a prefix (ASI)'],
    [`return ++/${Q}/.lastIndex`, `return ++0.lastIndex`, 'a `++` after `return` is a prefix'],
    [`void --/${Q}/.lastIndex`, `void --0.lastIndex`, 'a `--` after `void` is a prefix'],
    [`o.p; return /${Q}/`, `o.p; return 0`, 'a dot earlier in the window is not a property access on the keyword'],
    [`f(...void /${Q}/)`, `f(...void 0)`, 'a keyword after a spread is a keyword'],
    [`return 1. in /${Q}/`, `return 1. in 0`, 'a number\'s decimal point is not a property access'],
    [`w${' '.repeat(100)}/ 2 / z`, `w${' '.repeat(100)}/ 2 / z`, 'a slash after an identifier and a long run of spaces divides (the window is all whitespace)'],
    [`${' '.repeat(100)}/${Q}/`, `${' '.repeat(100)}0`, 'a slash after nothing but spaces begins a regular expression'],
    [`return/${Q}/`, 'return0', 'a regular expression straight after a keyword, with no space'],
    [`o.${' '.repeat(30)}new / 2 / z`, `o.${' '.repeat(30)}new / 2 / z`, 'a property named like a keyword, with its dot further back than a short window reaches'])
  // Residuals Task 9 item 3. The `)` that closes the header of an if, while, for or with begins a statement, so a slash after it begins a regular expression (after any other `)` it divides; after `]` it always divides,
  // and nothing was wrong there). And a slash after a division sign begins one too, which the punctuation list did not have.
  for (const h of ['if', 'while', 'for', 'with', 'for await', 'else if']) STRIPS.push([`${h} (x) /${Q}/.test(y)`, `${h} (x) 0.test(y)`, `a slash after the parenthesis of ${h} begins a regular expression`])
  STRIPS.push(
    [`if (f(x)) /${Q}/.test(y)`, 'if (f(x)) 0.test(y)', 'the header closes at its own parenthesis, not at the one inside it'],
    [`while (a && (b)) /${Q}/.test(y)`, 'while (a && (b)) 0.test(y)', 'a header with a parenthesis of its own after the condition'],
    [`do ; while (x)\n/${Q}/.test(y)`, 'do ; while (x)\n0.test(y)', 'the parenthesis that ends a do-while is a header too'],
    ['f(x) / 2 / z', 'f(x) / 2 / z', 'a slash after a call divides'],
    ['f(g(x)) / 2 / z', 'f(g(x)) / 2 / z', 'a slash after nested calls divides'],
    ['o.if (x) / 2 / z', 'o.if (x) / 2 / z', 'a method named if is a call: its slash divides'],
    ['this.#if (x) / 2 / z', 'this.#if (x) / 2 / z', 'a private method named if is a call: its slash divides'],
    ['elif (x) / 2 / z', 'elif (x) / 2 / z', 'a name that ends in if is not the keyword'],
    ['$if (x) / 2 / z', '$if (x) / 2 / z', 'a name that ends in if after a dollar sign is not the keyword'],
    ['if (x) y / 2 / z', 'if (x) y / 2 / z', 'a slash after the statement of an if divides: only the slash right after the header\'s parenthesis begins a regular expression'],
    [`if${' '.repeat(30)}(x) /${Q}/.test(y)`, `if${' '.repeat(30)}(x) 0.test(y)`, 'a header whose keyword is thirty spaces before its parenthesis is still one (the window the keyword is looked for in is forty characters)'],
    [`a / /${Q}/.source`, 'a / 0.source', 'a slash after a division sign begins a regular expression'])
  // Residuals Task 10 item 13. The language ends a line at a carriage return, U+2028 and U+2029 as well as at a line feed, so a `//` comment, a `++` that starts its statement and a regular expression end there too;
  // a quote ends at a line feed or a carriage return (U+2028 and U+2029 are legal inside a string since ES2019), and a backslash before a CR LF continues the string over both. No file in the repo has any of them.
  const CRc = '\r', LSc = String.fromCharCode(0x2028), PSc = String.fromCharCode(0x2029)
  for (const [name, eol] of [['a carriage return', CRc], ['U+2028', LSc], ['U+2029', PSc]]) STRIPS.push(
    [`a // c${eol}b`, `a ${eol}b`, `a line comment ends at ${name}`],
    [`a${eol}++/${Q}/.lastIndex`, `a${eol}++0.lastIndex`, `a ++ after ${name} starts its statement, so it is a prefix`],
    [`x = /oops${eol}b`, `x = 0${eol}b`, `an unterminated regular expression ends at ${name}`])
  STRIPS.push(
    [`'a\\${CRc}\nb' + c`, "'' + c", 'a backslash and a CR LF continue a string over both'],
    [`'a\\${CRc}' + c`, "'' + c", 'a backslash and a lone CR continue a string over the CR only'],
    [`'oops${CRc}b`, `''${CRc}b`, 'an unclosed quote ends at a carriage return'],
    [`'a${LSc}b' + c`, "'' + c", 'U+2028 is legal inside a string'],
    [`x = a instanceof /${Q}/`, 'x = a instanceof 0', 'a regular expression after instanceof'])
  STRIPS.push(['x = /a\\/b/g + c', 'x = 0 + c', 'an escaped slash does not end a regular expression'], ['x = /[\\]/]y/ + c', 'x = 0 + c', 'an escaped bracket does not end a class'],
    ['x = /oops\nb', 'x = 0\nb', 'an unterminated regular expression ends at its line'])
  const wrong = STRIPS.filter(([from, want]) => stripNonCode(from) !== want)
  check(`WHAT THE SCANNER LEAVES IS EXACTLY WHAT IT SHOULD, for ${STRIPS.length} inputs (comments, strings, templates, regular expressions, and every place a slash divides or does not)`,
    wrong.length === 0, wrong.map(([from, want, why]) => `${why}: ${JSON.stringify(from)} left ${JSON.stringify(stripNonCode(from))}, wanted ${JSON.stringify(want)}`).slice(0, 4).join(' / ') + ` (${wrong.length} wrong of ${STRIPS.length})`)

  // The shapes review 4 reproduced, as the scan sees them: a division that was read as a regular expression, where it swallowed the clock read after it, and inside a template
  // expression the rest of the file.
  const CASES = [
    ['const NOW = new Date()\nlet n = 0\nconst rate = n++ / ((Date.now() - NOW) / 1000)\n', '2/1'],
    ['const NOW = new Date()\nconst pct = c => `${(c.new / c.total * 100).toFixed(1)}%`\nconst stamp = () => Date.now()\n', '2/1'],
    ['let i=0; const a = `x ${ i++ / 2 }`;\nDate.now()\nconst b = `y`;\nDate.now()\nconst NOW = new Date()\nconst later = new Date()\n', '4/1'],
  ]
  const off = CASES.map(([src, want]) => ({ want, got: (c => `${c.reads}/${c.captures}`)(clockCounts(src)) })).filter(x => x.want !== x.got)
  check('A DIVISION AFTER `++`, OR AFTER A PROPERTY NAMED LIKE A KEYWORD, DOES NOT HIDE THE CLOCK READS AFTER IT (nor, inside a template expression, the rest of the file)',
    off.length === 0, off.map(x => `wanted ${x.want}, got ${x.got}`).join(' / '))

  // The same, one level up, for a line that ends in a character the scan did not know and a keyword that takes a regular expression: each of these lost the read after it. Each is followed by two bare reads, so "2/0" is both seen.
  const EOLS = [['a carriage return', CRc], ['U+2028', LSc], ['U+2029', PSc]]
  const BARE2 = 'Date.now()\nDate.now()\n'
  const CASES13 = [...EOLS.map(([name, eol]) => [`a line comment ended by ${name}`, `// c${eol}${BARE2}`, '2/0']),
    ['a string left open at a carriage return', `const a = 'oops${CRc}${BARE2}`, '2/0'],
    ['a string continued by a backslash and CR LF', `const a = 'a\\${CRc}\nb' + ${BARE2}`, '2/0'],
    ['a regular expression left open at a carriage return', `x = /oops${CRc}${BARE2}`, '2/0'],
    ['a string left open at U+2028, which the language lets it hold (the read after it is inside it)', `const a = 'oops${LSc}${BARE2}`, '1/0'],
    ['a backtick in a regular expression after instanceof', `x = a instanceof /\`/.constructor\n${BARE2}`, '2/0'],
    ['a backtick in a regular expression after extends', `class A extends /\`/.constructor {}\n${BARE2}`, '2/0'],
    ['a backtick in a regular expression after default', `export default /\`/.test(y)\n${BARE2}`, '2/0']]
  const off13 = CASES13.map(([what, src, want]) => ({ what, want, got: (c => `${c.reads}/${c.captures}`)(clockCounts(src)) })).filter(x => x.want !== x.got)
  check(`A LINE THAT ENDS AT A CARRIAGE RETURN, U+2028 OR U+2029 (A COMMENT, A REGULAR EXPRESSION; a string at a CR, not at U+2028), A BACKSLASH BEFORE A CR LF, AND instanceof, extends AND default BEFORE A REGULAR EXPRESSION, DO NOT HIDE THE CLOCK READS AFTER THEM, for ${CASES13.length} inputs`,
    off13.length === 0, off13.map(x => `${x.what}: wanted ${x.want}, got ${x.got}`).join(' / '))

  // Every spelling of a clock read is counted as one, and only the three that can be captured are captured. A scanner that counted fewer would pass every other clause here.
  const FORMS = [['Date.now()', 1, 0], ['Date.now( )', 1, 0], ['Date.now ()', 1, 0], ['globalThis.Date.now()', 1, 0], ['new Date()', 1, 0], ['new Date( )', 1, 0], ['new  Date()', 1, 0],
    ['new\nDate()', 1, 0], ['fieldDay()', 1, 0], ['fieldDay( )', 1, 0], ['fieldDay ()', 1, 0], ['fieldToday()', 1, 0], ['fieldToday( )', 1, 0],
    ['const NOW = new Date()', 1, 1], ['const NOW = new Date( )', 1, 1], ['const NOW = new  Date()', 1, 1], ['const DAY = fieldDay()', 1, 1], ['const DAY = fieldDay( )', 1, 1], ['const DAY = fieldDay ()', 1, 1],
    ['const DAY = fieldToday( )', 1, 1], ['const later = new Date()', 1, 0], ['const NOW = Date.now()', 1, 0],
    ['const A = new Date(); const B = fieldDay()', 2, 2], ['const A = new Date(); const b = fieldDay()', 2, 1], ['{ const A = new Date() } { const B = fieldDay() }', 2, 2],
    ['`${fieldDay()}T12`', 1, 0], ['const DAY = `${fieldDay()}T12`', 1, 1], ['`${ `${new Date()}` }`', 1, 0], ['`new Date() ${1}`', 0, 0],
    ['tag`${/"/.test(y)}` + Date.now()', 1, 0], ['f(x)`${/"/.test(y)}` + Date.now()', 1, 0], ['a[0]`${/"/.test(y)}` + Date.now()', 1, 0],
    ['const NOW = () => new Date()', 1, 0], ['const NOW = async () => new Date()', 1, 0], ['const NOW = function () { return new Date() }', 1, 0], ['const O = { f() { return new Date() } }', 1, 0],
    ['const A = class { static t = new Date() }', 1, 0], ['const NOW = 1; log(new Date())', 1, 0],
    ['const T = process.env.T || new Date().toISOString().slice(0, 10)', 1, 1], ['const D = fieldDayIso(fieldToday())', 1, 1], ['const X = { at: new Date() }', 1, 1],
    // Residuals Task 10 item 2: the spellings the scan matched as text and so did not see. `new Date` with no parentheses, the computed `Date['now']()`, `Date.now` or `Date` itself passed on as a value
    // (`const D = Date`, `f(Date)`, `{ Date }`), and `Date()` and `Date(5)`, which return the current time whatever they are given. Then the neighbours that are not reads: a `Date` that is constructed
    // from an argument or named in a type test, a static that is not `now`, a property or key spelled Date, and longer names.
    ['new Date', 1, 0], ['const NOW = new Date', 1, 1], ['new Date;', 1, 0], ["Date['now']()", 1, 0], ['Date.now', 1, 0], ['const clock = Date.now', 1, 0], ['const D = Date', 1, 0], ['f(Date)', 1, 0], ['{ Date }', 1, 0],
    ['Date()', 1, 0], ['Date(5)', 1, 0], ['new Date(5)', 0, 0], ['new Date(x)', 0, 0], ['new Date\n(5)', 0, 0], ['x instanceof Date', 0, 0], ['typeof Date', 0, 0], ['Date.UTC(1)', 0, 0], ["Date['UTC'](1)", 0, 0],
    ['o.Date', 0, 0], ['{ Date: 1 }', 0, 0], ['new DateTimeFormat()', 0, 0], ['const F = DateFormatter', 0, 0], ['const D = Dates', 0, 0],
    // Whitespace inside the spelling (a `Date` and its `.`, the computed form), and a capture that is not a read: `new Date(5)` and `new DateTimeFormat()` hold no clock read, so a constant holding one must not count
    // as a capture either, or it would hide a bare read somewhere else in the script.
    ['Date . now()', 1, 0], ['Date.nowish', 0, 0], ['Date\n.now()', 1, 0], ["Date [ 'now' ] ( )", 1, 0], ['const NOW = new Date(5)', 0, 0], ['const N = new DateTimeFormat()', 0, 0]]
  const badForms = FORMS.filter(([src, reads, captures]) => { const c = clockCounts(src); return c.reads !== reads || c.captures !== captures })
  check(`THESE ${FORMS.length} SPELLINGS OF A CLOCK READ ARE COUNTED OR NOT (whitespace inside and around the call, a template expression but not template text, \`new Date\` with no parentheses, \`Date.now\` and \`Date\` passed on as values, \`Date['now']()\`), and a capture is a \`const\` in capitals whose value IS new Date(), fieldDay() or fieldToday() on the same line, not a function, class or later statement that holds one. NOT COVERED: \`performance.now()\` and \`process.hrtime()\` (durations, not instants, and proof-check.mjs reads them for its report), \`process.uptime()\`, \`Intl\` and \`Atomics\` timers, and a \`Date\` reached through a computed or concatenated name (\`globalThis['Da' + 'te']\`)`,
    badForms.length === 0, badForms.map(([src, reads, captures]) => `${src}: ${JSON.stringify(clockCounts(src))}, wanted ${reads} read(s) and ${captures} capture(s)`).join(' / '))

  // The comparison itself, on real files: one bare read more than the captures flags the script, balanced reads do not.
  const dir = mkdtempSync(join(tmpdir(), 'row-confidence-'))
  try {
    writeFileSync(join(dir, 'balanced.mjs'), 'const NOW = new Date()\nconsole.log(NOW)\n')
    writeFileSync(join(dir, 'one-extra.mjs'), 'const NOW = new Date()\nconsole.log(Date.now())\n')
    writeFileSync(join(dir, 'two-extra.mjs'), 'const NOW = new Date()\nconsole.log(Date.now(), Date.now())\n')
    const flagged = nondeterminism(['balanced.mjs', 'one-extra.mjs', 'two-extra.mjs'].map(f => join(dir, f))).map(m => m.split(':')[0].split('/').pop())
    check('A SCRIPT WITH ONE CLOCK READ MORE THAN ITS CAPTURES IS FLAGGED, AND ONE WITH AS MANY IS NOT', flagged.join() === 'one-extra.mjs,two-extra.mjs', `flagged: ${flagged.join() || '(none)'}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  // Every script a row names, as this scan leaves it: its brackets must pair. A scan that has lost its place reads code as a string or a string as code, and then they stop pairing
  // (the three-regular-expression scan this one replaced left 96 of the 168 scripts unbalanced, among them rows' own). It needs no tokenizer to be checked, and it is the test that
  // would have caught that failure on the day it was introduced.
  const imbalance = text => {
    const delta = { '(': 0, '{': 0, '[': 0 }
    for (const ch of text) {
      if (ch in delta) delta[ch]++
      else if (ch === ')') delta['(']--
      else if (ch === '}') delta['{']--
      else if (ch === ']') delta['[']--
    }
    return delta['('] === 0 && delta['{'] === 0 && delta['['] === 0 ? '' : `( ${delta['(']} { ${delta['{']} [ ${delta['[']}`
  }
  // The three passes that scan was (block comments, then line comments, then quotes paired over the whole text), written out so the controls below can run it.
  const threePasses = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n').replace(/(['"\x60])(?:\\.|(?!\1)[\s\S])*\1/g, "''")
  // A check that has only ever passed proves nothing, so it carries its own controls: each is a `//` inside a string followed by a line with one kind of bracket in a string. The old
  // scan must leave every one unbalanced and this scan balanced, and one per kind means a counter that is blind to a kind of bracket is caught.
  const CONTROLS = ["const u = 'http://x'\nf('y')\n", "const u = 'http://x'\nconst o = { a: 'y' }\n", "const u = 'http://x'\nconst a = ['y']\n"]
  const unbalanced = []
  for (const c of CONTROLS) {
    if (imbalance(threePasses(c)) === '') unbalanced.push(`control ${JSON.stringify(c)}: the three-pass scan left it balanced, so this count cannot tell a lost scan from a good one`)
    if (imbalance(stripNonCode(c)) !== '') unbalanced.push(`control ${JSON.stringify(c)}: this scan left it unbalanced (${imbalance(stripNonCode(c))})`)
  }
  const reached = [...new Set(rows.flatMap(r => scriptsOf(r.name)))]
  let checked = 0
  for (const s of reached) {
    let left
    try { left = stripNonCode(readFileSync(s, 'utf8')) } catch { unbalanced.push(`${s}: unreadable`); continue }
    checked++
    const off = imbalance(left)
    if (off !== '') unbalanced.push(`${s} ${off}`)
  }
  check(`EVERY SCRIPT A ROW NAMES LEAVES BALANCED BRACKETS WHEN THE SCAN IS DONE WITH IT (${reached.length} scripts, and ${CONTROLS.length} controls the three-pass scan it replaced fails): a scan that loses its place reads code as a string, and the brackets stop pairing`,
    unbalanced.length === 0 && checked === reached.length, unbalanced.slice(0, 4).join(' / ') + ` (checked ${checked} of ${reached.length} scripts and ${CONTROLS.length} controls, ${unbalanced.length} problems)`)

  // The harness, the file whose table once hid a second read from this scan (it lost sync at the first `//` in a string). Three things, none tied to how many reads the harness has today:
  // the place this clause splices at is there exactly once, every read the harness makes is a capture, and a bare read put at that place is one more read than before and no more captures
  // (a scan that sees nothing cannot pass by agreeing with itself). The anchor starts with the newline because the table entry that respells it holds the same words inside a string, and it
  // is not the guard's own text (`const selected` and the rest): an entry holding THAT would move the harness's own guard up into the table and make every entry below it ambiguous.
  const harness = readFileSync('scripts/mutation-check.mjs', 'utf8')
  const SPLICE_AT = '\nconst applyMutation = '
  const splices = harness.split(SPLICE_AT).length - 1
  const harnessNow = clockCounts(harness)
  const spliceIndex = harness.indexOf(SPLICE_AT)
  const harnessMut = clockCounts(splices === 1 ? harness.slice(0, spliceIndex) + '\nDate.now()' + harness.slice(spliceIndex) : harness)
  check('THE HARNESS: EVERY CLOCK READ IN IT IS A CAPTURE, AND A BARE READ PUT AFTER ITS TABLE IS SEEN (it was not, once its table grew: the scan lost sync at the first `//` in a string)',
    splices === 1 && harnessNow.reads === harnessNow.captures && harnessMut.reads === harnessNow.reads + 1 && harnessMut.captures === harnessNow.captures,
    splices !== 1 ? `the place to put the bare read, ${JSON.stringify(SPLICE_AT)}, is in scripts/mutation-check.mjs ${splices}x (wanted 1)`
      : harnessNow.reads !== harnessNow.captures ? `the harness reads the clock ${harnessNow.reads}x and captures it ${harnessNow.captures}x: a read is not captured`
        : `a bare read put after the table moved the count from ${harnessNow.reads} reads, ${harnessNow.captures} captures to ${harnessMut.reads} reads, ${harnessMut.captures} captures (wanted one more read and the same captures)`)
}
