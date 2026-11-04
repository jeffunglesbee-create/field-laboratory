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
 * The source with comments removed, every string and template literal replaced by an empty string and every regular-expression literal by `0`: what is left is code.
 *
 * IT IS A SCANNER, NOT THREE REGULAR EXPRESSIONS. The version before this one removed `//` comments line by line and then paired quotes across the whole file, and the two
 * disagree about a `//` inside a string (`'http://…'`, `"URL='http://…' node …"`): the comment pass cut the line at the `//`, which took the closing quote with it, and every
 * quote after that paired with the wrong one. From the first such line in `mutation-check.mjs` (measured 2026-11-04: line 111 of the file as committed) the scan read the file's strings as code and
 * its code as strings, so a clock read could sit in a region it never saw. It held up by parity until the table grew by 41 entries; then `harness-reads-the-clock-twice`, the
 * mutation that proves this row can see a second clock read in that very file, survived (2026-11-04, the gate's mutation row), and the row's claim for that file had been
 * undefended for as long as the parity happened to be wrong.
 *
 * Checked against a real tokenizer: acorn's, over all 168 scripts, counted the same clock reads as this does (with template text revealed; see below). That comparison is a
 * one-off, not a test in the repo, because acorn is only reachable through `node --expose-internals`.
 *
 * What it still does not do: the contents of a template literal are not scanned, as before (`new Date(\`${fieldDay()}T12:00:00Z\`)` in `pickem-check.mjs` is a clock read this scan
 * does not see, and revealing them would flag that script and take its row below the bar; filed in docs/CC-CMD-2026-11-03-gate-hazard-residuals.md). A `/` after `)` or `]`
 * is read as division, which is wrong for `if (x) /re/.test(y)`, a shape this repo does not use; where that regular expression holds a backtick the scan opens a template that
 * swallows the rest of the file, so such a line makes every later clock read invisible. A `/` after `}` is read as the start of a regular expression, which is right after a block
 * and wrong after an object literal or a class body (`{a: 1} / 2`). A `/` after `++`/`--` that ends an operand on the same line, and after a property spelled like a keyword
 * (`c.new`), is division (review 4, 2026-11-04: both were read as regular expressions, which inside a template expression hid the rest of the file); a `++` that starts its
 * statement, or follows a keyword, is a prefix, and a `.` that ends `...` or a number is not member access (review 5). Not handled, and filed with the rest: a comment or string
 * ended by CR, U+2028 or U+2029 or by a backslash-CRLF, `default`, `instanceof` and `extends` before a regular expression, and `new Date` with no parentheses. (A leading `#!`
 * line is read as a regular expression that ends at its line, which changes no count: 23 scripts begin with one.)
 */
const stripNonCode = src => {
  const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])
  const n = src.length
  let out = ''
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
      if (/[\w$)\]]$/.test(operand) && !before.slice(operand.length).includes('\n') && !endsInKeyword(operand)) return false
    }
    if ('(,=:[!&|?{};+-*%<>~^'.includes(tail[tail.length - 1])) return true
    return endsInKeyword(tail)
  }
  // Code from `start`. With `inExpr` it stops after the `}` that closes a template's `${`. Returns the index after what it consumed.
  const scanCode = (start, inExpr) => {
    let i = start
    let depth = 0
    while (i < n) {
      const c = src[i]
      const d = src[i + 1]
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue }
      if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; out += ' '; continue }
      if (c === "'" || c === '"') {
        // A string that reaches a newline unclosed ends there: a stray quote must not be able to swallow the rest of the file.
        i++
        while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1
        if (src[i] === c) i++
        out += "''"
        continue
      }
      if (c === '`') { i = skipTemplate(i + 1); out += "''"; continue }
      if (c === '/') {
        if (!regexAllowed()) { out += '/'; i++; continue }
        i++
        let inClass = false
        while (i < n && src[i] !== '\n') {
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
      if (inExpr) {
        if (c === '{') depth++
        else if (c === '}') { if (depth === 0) return i + 1; depth-- }
      }
      out += c
      i++
    }
    return i
  }
  // A template literal's text, and (to find where it ends) its `${…}` expressions, which may hold strings and templates of their own. None of it is kept.
  const skipTemplate = start => {
    let i = start
    while (i < n) {
      const c = src[i]
      if (c === '\\') { i += 2; continue }
      if (c === '`') return i + 1
      if (c === '$' && src[i + 1] === '{') {
        const kept = out
        i = scanCode(i + 2, true)
        out = kept
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
  const captures = code.match(/const [A-Z][A-Z0-9_]* = [^\n]*?(new\s+Date\s*\(\s*\)|fieldDay\s*\(\s*\)|fieldToday\s*\(\s*\))/g) ?? []
  const clockReads = code.match(/Date\s*\.\s*now\s*\(\s*\)|new\s+Date\s*\(\s*\)|fieldDay\s*\(\s*\)|fieldToday\s*\(\s*\)/g) ?? []
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
 * captures. How many captures a script may have is not limited and nothing checks that one is at top level, so `const A = () => new Date()` passes (residual Task 10) and two
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
  sloppy('AN ESCAPED QUOTE, AN ESCAPED BACKTICK, A NESTED TEMPLATE WITH STRINGS AND BRACES IN ITS EXPRESSION: each ends where it ends',
    ["const E = 'it\\'s'", 'const T = `x\\`y`', 'const N = `a ${ `b ${ {x: 1}.x } c` + \'`\' + "}" } d`', 'const B = `p ${ {a: 1}.a + `y` } q`', "const G = `p ${ {a: 1}.a + '`' } q`"])
  // A block comment where a `/` can only be division (after a value), so it is the comment rule that has to end it and nothing else would: quotes and a clock read inside it.
  sloppy('A BLOCK COMMENT AFTER A VALUE ENDS AT ITS `*/`, WHATEVER IS INSIDE IT', ["const C = 1 /* it's new Date() */ + 2", 'const D = x /* "\' ` */'])
  check('A CLOCK READ IN A COMMENT, A STRING OR A TEMPLATE IS NOT ONE',
    clockCounts("// new Date()\n/* Date.now() */\nconst s = 'new Date()'\nconst t = `new Date() ${1}`\n").reads === 0,
    `saw ${clockCounts("// new Date()\n/* Date.now() */\nconst s = 'new Date()'\nconst t = `new Date() ${1}`\n").reads} reads in text that is not code`)
  check('AN UNCLOSED QUOTE ENDS AT ITS LINE: it cannot swallow the rest of the file', seen("const a = 'oops") === '2/1', `saw ${seen("const a = 'oops")}`)
  // THE STRIPPED TEXT ITSELF, not only the counts it leads to. A count survives a scanner that changes what it leaves behind as long as the damage lands where no clock read is, which is
  // how half of the scanner's branches could be broken with every clause green (review 4, 2026-11-04: 49 of 66 mutants of it passed this self-test and the whole 23-row run).
  // Each pair is an input and exactly what must be left of it: comments gone, strings and regular expressions and templates reduced to a marker, division left alone.
  const STRIPS = [
    ['a = \'x\' + "y"', 'a = \'\' + \'\'', 'both quote kinds, each kept as an empty string'],
    ['a = `t ${1} u`', "a = ''", 'a template, expression and all, as one empty string'],
    ['a = /x[/]/gi + b', 'a = 0 + b', 'a regular expression with a slash in a class, and its flags'],
    ['a /* c */ b', 'a   b', 'a block comment becomes one space'],
    ['a // c\nb', 'a \nb', 'a line comment ends at its newline and leaves it'],
    ['a /*/ b */ c', 'a   c', 'a block comment cannot end on the slash that opened it'],
    ['x = // new Date()\ny', 'x = \ny', 'a comment where a regular expression could begin is still a comment'],
    ['/"\'`/.test(a)', '0.test(a)', 'a regular expression at the very start of the text'],
    ["'oops\nb", "''\nb", 'an unclosed quote ends at its line'],
    ['x = y / 2 / z', 'x = y / 2 / z', 'division'],
    ['x = (a) / 2 / b', 'x = (a) / 2 / b', 'division after a parenthesis'],
    ['x = a[0] / 2 / b', 'x = a[0] / 2 / b', 'division after a bracket'],
    ['n++ / 2 / y', 'n++ / 2 / y', 'division after a postfix increment'],
    ['n-- / 2 / y', 'n-- / 2 / y', 'division after a postfix decrement'],
    ['x = ++/"/.lastIndex', 'x = ++0.lastIndex', 'a prefix increment is not an operand end'],
    ['return /x/.test(y)', 'return 0.test(y)', 'a regular expression after a keyword'],
    ['`${ {a:{b:1}}.a } x` + c', "'' + c", 'braces nested inside a template expression close where they close'],
    ['`a ${ Date.now() } b`', "''", 'the inside of a template expression is not kept'],
    ['`a ${ `b ${1}` + "}" } c` + d', "'' + d", 'a template inside a template expression, with a brace in a string'],
  ]
  for (const k of ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']) {
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

  // Every spelling of a clock read is counted as one, and only the three that can be captured are captured. A scanner that counted fewer would pass every other clause here.
  const FORMS = [['Date.now()', 1, 0], ['Date.now( )', 1, 0], ['Date.now ()', 1, 0], ['globalThis.Date.now()', 1, 0], ['new Date()', 1, 0], ['new Date( )', 1, 0], ['new  Date()', 1, 0],
    ['new\nDate()', 1, 0], ['fieldDay()', 1, 0], ['fieldDay( )', 1, 0], ['fieldDay ()', 1, 0], ['fieldToday()', 1, 0], ['fieldToday( )', 1, 0],
    ['const NOW = new Date()', 1, 1], ['const NOW = new Date( )', 1, 1], ['const NOW = new  Date()', 1, 1], ['const DAY = fieldDay()', 1, 1], ['const DAY = fieldDay( )', 1, 1], ['const DAY = fieldDay ()', 1, 1],
    ['const DAY = fieldToday( )', 1, 1], ['const later = new Date()', 1, 0], ['const NOW = Date.now()', 1, 0],
    ['const A = new Date(); const B = fieldDay()', 2, 2], ['const A = new Date(); const b = fieldDay()', 2, 1]]
  const badForms = FORMS.filter(([src, reads, captures]) => { const c = clockCounts(src); return c.reads !== reads || c.captures !== captures })
  check(`THESE ${FORMS.length} SPELLINGS OF A CLOCK READ ARE COUNTED (whitespace inside and around the call included), and a capture is a \`const\` in capitals on the same line as new Date(), fieldDay() or fieldToday()`,
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

  // The file the mutation `harness-reads-the-clock-twice` breaks: as it is, every clock read is a capture; with a bare read added where that entry puts one, it is flagged.
  const harness = readFileSync('scripts/mutation-check.mjs', 'utf8')
  const afterGuard = harness.indexOf('const selected = ONLY')
  const harnessTwice = harness.slice(0, afterGuard) + harness.slice(afterGuard).replace("writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({\n    at: BASELINE_AT.toISOString(),", "writeFileSync('outbox/mutation-baseline-latest.json', JSON.stringify({\n    at: new Date().toISOString(),")
  const harnessNow = clockCounts(harness)
  const harnessMut = clockCounts(harnessTwice)
  check('THE HARNESS\'S OWN CLOCK READS ARE ALL CAPTURES, AND A SECOND BARE READ IN IT IS SEEN (it was not, once its table grew: the scan lost sync at the first `//` in a string)',
    harnessNow.reads === harnessNow.captures && harnessNow.reads >= 2 && harnessTwice !== harness && harnessMut.reads === harnessMut.captures + 1,
    `as it is ${harnessNow.reads} reads, ${harnessNow.captures} captures; with a bare read added ${harnessMut.reads} reads, ${harnessMut.captures} captures`)
}
