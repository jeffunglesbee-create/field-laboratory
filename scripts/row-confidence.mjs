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

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rows } from './gate-checks.mjs'
import { stripNonCode, blankComments } from './strip-non-code.mjs'
import { NETWORK_EXEMPT } from './network-exempt.mjs'
import { createChecks, finish } from './checks.mjs'

const BAR = 95

const gateSource = readFileSync('scripts/gate-checks.mjs', 'utf8')
const mutationSource = readFileSync('scripts/mutation-check.mjs', 'utf8')

/**
 * A row's own declaration in a source text laid out like `gate-checks.mjs`, comments included (a caller that reads commands out of it blanks them first: `scriptsIn`, `commandsOf`): from its `name:` to the
 * next row's `{ name:` or the `]` that closes the table. Empty when no row has that name. A blank line inside a row does not end it (it used to: a command written after one was invisible to the scan).
 */
const declIn = (source, rowName) => {
  // Slice the row's own object literal, so a neighbouring row's command is not
  // attributed to it.
  const at = source.indexOf(`name: '${rowName}'`) >= 0
    ? source.indexOf(`name: '${rowName}'`)
    : source.indexOf(`name: "${rowName}"`)
  if (at === -1) return ''
  const ends = ['\n  { name:', '\n]'].map(mark => source.indexOf(mark, at + 1)).filter(i => i !== -1)
  return source.slice(at, ends.length === 0 ? source.length : Math.min(...ends))
}
const declOf = rowName => declIn(gateSource, rowName)

/** The scripts a row shells out to, read from its declaration. Empty when no row has that name. */
const scriptsOf = rowName => {
  const decl = declOf(rowName)
  return decl === '' ? [] : scriptsIn(decl)
}

/** The scripts a declaration runs: the paths in its code and its strings, not in its comments (`commandsOf` blanks them the same way, so the two agree on what the row runs). */
const scriptsIn = decl => {
  const named = [...blankComments(decl).matchAll(/scripts\/([\w.-]+\.mjs)/g)].map(m => `scripts/${m[1]}`)
  // A row whose `run` is a local function — the outbox and history rows — names
  // no script, and its logic lives in gate-checks.mjs. Those rows were scanned
  // for nondeterminism against an EMPTY file list, so they scored full marks for
  // determinism without anything being read.
  //
  // That is how CI run 31456294086 failed: `outboxToday` called `fieldDay()` at
  // row-evaluation time, the run crossed midnight ET, and the row asked about a
  // different day than the one it started in. This scorer's own rule would have
  // caught it, if it had been looking at the file.
  // Once each: a row that runs a script twice (two captures through `drift-check.mjs`) is scanned once, and an objection about it is listed once, not once per command.
  return named.length > 0 ? [...new Set(named)] : ['scripts/gate-checks.mjs']
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
 * Network use is a CALL, or a reference that becomes one. The scan used to look for `https://` in the text left when comments and strings were removed, and a URL is always in one or the other, so
 * it could not fire (measured 2026-11-05 on this tree: it flagged 0 of 169 scripts). What it looks for now is the callee, in code: `fetch` as a call or as a value (`fetchImpl = fetch`),
 * `globalThis.fetch`, `new WebSocket`, `https.request`, `net.connect`, `sendBeacon`. A property or a key named like one is not use (`o.fetch(x)`, `{ fetch: 1 }`), and a longer name is not (`fetchImpl(u)`).
 * Nor is a DECLARATION of the name or an ASSIGNMENT to it: a script that stubs `fetch` (`globalThis.fetch = (url) => …`, `function fetch(u) {}`, `const fetch = …`, a method or a class field called `fetch`) makes no request, and
 * was reported as one (`weather-burst-check.mjs`: `global fetch x2`). A declaration is the name after `function`, `const`, `let` or `var`, or followed on its line by a parameter list and a `{`; an assignment is the
 * name followed by a single `=` (also through a global object). What is read from it, compared or passed on is still use (`fetch === undefined`, `const f = globalThis.fetch`, `f(fetch)`).
 * Each is a label and the number of times it was seen, which is what the objection prints (`reaches the network (fetch x1)`).
 *
 * WHAT IT CANNOT SEE (Rule 91; the clause that checks it prints the same list and pins each spelling in it as not seen): optional chaining on a global or a module (`globalThis?.fetch(u)`, `http?.get(u)`), a constructor reached through a global or
 * in parentheses (`new globalThis.WebSocket(u)`, `new (WebSocket)(u)`), a module reached by `require('https').get(u)` or `import('node:net')`, a module imported or required under a name of its own (`import h from 'node:https'; h.request(o)`)
 * or by a named import (`import { get } from 'node:https'; get(u)`), a destructured alias (`const { fetch: f } = globalThis; f(u)`), `new net.Socket().connect(80)`, `dgram` and `dns`, a spread of fetch (`f(...fetch)`: the dot of
 * the spread reads as a property), a child process (`spawn('curl')`, `gh api`), `dotnet restore` inside `proof-check.mjs` and the build row, a browser's `route.fetch()` and `page.goto` to an external address, access by a computed name
 * (`globalThis['fe' + 'tch']`), a ternary that names `fetch` before a colon (`c ? fetch : g` reads as a key), a reference to `https.get`, `net.connect` or `navigator.sendBeacon` that is not called on the spot (only `fetch` is counted as a
 * value), and a module the script imports that does the fetching: the scan does not follow imports. It errs the safe way on a method whose brace is on the next line (it reads as a call).
 */
const NETWORK_USE = [
  [/(?<!\b(?:function(?:\s*\*)?|const|let|var)\s+)(?<![\w$])(?<!\.\s*)fetch(?![\w$])(?!\s*:)(?!\s*=(?!=))(?![ \t]*\((?:[^()]|\([^()]*\))*\)[ \t]*\{)/g, 'fetch'],
  [/(?<![\w$])(?<!\.\s*)(?:globalThis|window|self|global)\s*\.\s*fetch(?![\w$])(?!\s*=(?!=))/g, 'global fetch'],
  [/(?<![\w$])(?<!\.\s*)new\s+(?:WebSocket|EventSource|XMLHttpRequest)(?![\w$])/g, 'new WebSocket|EventSource|XMLHttpRequest'],
  [/(?<![\w$])(?<!\.\s*)https?\s*\.\s*(?:request|get)\s*\(/g, 'http(s).request|get'],
  [/(?<![\w$])(?<!\.\s*)(?:net|tls|http2)\s*\.\s*(?:connect|createConnection)\s*\(/g, 'net|tls|http2.connect'],
  [/(?<![\w$])sendBeacon\s*\(/g, 'sendBeacon'],
]
/** The kinds of network use in `code` (already stripped of comments and strings), each with its count: `['fetch x1']`. Empty when there is none. */
const networkUses = code => NETWORK_USE.map(([re, kind]) => [kind, (code.match(re) ?? []).length]).filter(([, n]) => n > 0).map(([kind, n]) => `${kind} x${n}`)

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
  // nothing of the kind, and the read happens later, every time it is called (`const NOW = () => new Date()`), so it is not counted as one. The read is on the constant's own line, and a line ends
  // at a line feed, a carriage return, U+2028 or U+2029, as the scanner reads one (without the last three, `const NOW = 1` and a carriage return and `log(new Date())` was a capture).
  const captures = code.match(/const [A-Z][A-Z0-9_]* = (?:(?!=>|\bclass\b|\)\s*\{|;)[^\n\r\u2028\u2029])*?(new\s+Date(?![\w$])(?!\s*\(\s*(?!\.\.\.)[^\s)])|(?<![\w$#])fieldDay\s*\(\s*\)|(?<![\w$#])fieldToday\s*\(\s*\))/g) ?? []
  // A read is any way of asking the wall clock for an INSTANT: `Date.now` (called or not: `const clock = Date.now` reads it later); any computed member of `Date` (`Date['now']()`, `Date['now']`, `Date[k]()`: a string is
  // already `''` by now, so `now` cannot be told from `UTC` and `Date['UTC'](1)` counts too); `new Date` with no argument, or with only a spread that may be empty (parentheses or none; `new Date(x)` builds a date from x and reads
  // nothing); `Date()` and `Date(5)` (they return the current time whatever they are given); a bare `Date` that is stored or passed on (`const D = Date`, `f(Date)`, `{ Date }`), since the time can then be asked for under another
  // name; and the global reached through an object (`globalThis.Date`, `window.Date`, `self.Date`, `global.Date`), however it is then used (`new globalThis.Date(5)` counts too: the pattern cannot tell what follows). Not reads:
  // `Date.UTC`, `o.Date` (also `o. Date`, `o?.Date` and `this.#Date`: a property, however it is spelled, is not the global; `f(...Date)` is a spread, not a property), a `{ Date: 1 }` key, `x instanceof Date`, `typeof Date`,
  // `new Date(5)`, and a name that only ends or begins like one (`MyDate.now()`, `$Date.now()`, `DateFormatter`, `Dates`, `xfieldDay()`; `z.fieldDay()` on a namespace import is a call of the helper, and is one).
  // `performance.now()` and `process.hrtime()` are deliberately not counted: they are durations, and counting them takes the row `doc claims are compiler-verified, not prose` below the bar on the two timings `proof-check.mjs`
  // prints; if they are ever wanted, that script's `batchMs` has to go first. A capture takes the same `new Date` spelling as the reads do, so that a capture is always also a read.
  const clockReads = code.match(/(?<![\w$#])Date\s*\.\s*now(?![\w$])|new\s+Date(?![\w$])(?!\s*\(\s*(?!\.\.\.)[^\s)])|(?<![\w$#])fieldDay\s*\(\s*\)|(?<![\w$#])fieldToday\s*\(\s*\)|(?<![\w$#])(?:globalThis|self|window|global)\s*\.\s*Date(?![\w$])|(?<![\w$#])(?<!(?<!\.\.)\.\s*)(?<!\b(?:new|instanceof|typeof)\s+)Date(?![\w$])(?!\s*[.:])/g) ?? []
  return { captures: captures.length, reads: clockReads.length, network: networkUses(code) }
}

/**
 * The arguments of each command that runs `script` in a row's declaration: what follows the script's path up to the next script path or the next `ok(`, `fails(` or `all(` call, whatever quotes, `+` or lines
 * are between (the first version stopped at the first quote, so `--file "a.json" --url …` and `'--file a.json ' + '--url …'` hid the flag). Comments are blanked first, so a flag named in one is not passed.
 */
const commandsOf = (decl, script) => blankComments(decl).split(script).slice(1).map(rest => rest.split(/scripts\/[\w.-]+\.mjs|\b(?:ok|fails|all)\(/)[0])

/** Does the row's own text pass `flag` to `script`, as `--flag` or `--flag=value`, in a string of any quote or in several joined by `+`? Arguments built at run time (a template's `${…}`, a variable, the environment) are not seen. */
const passesFlag = (decl, script, flag) => commandsOf(decl, script).some(args => args.split(/[\s'"\x60]+/).some(t => t === flag || t.startsWith(`${flag}=`)))

/**
 * What a script's network use costs the row that runs it: nothing under a sanctioned entry, nothing under a flag entry while the row's own text does not pass the flag, an objection otherwise.
 * `row` is `{ name, decl, exempt }`; with none (`null`), nothing is exempt.
 */
const networkObjections = (script, kinds, row) => {
  const seen = `${script}: reaches the network (${kinds.join(', ')})`
  const entry = row?.exempt.find(e => e.row === row.name && e.script === script)
  if (entry === undefined) return [seen]
  if (entry.sanctioned) return []
  if (typeof entry.flag !== 'string') return [`${seen}; its exemption names no flag and is not the sanctioned wait, so it exempts nothing`]
  if (passesFlag(row.decl, script, entry.flag)) return [`${seen}, and this row passes ${entry.flag}, the only way it gets there`]
  return []
}

/** Exemptions that name a row the gate does not have, or a script their row does not run. `scriptsByRow` maps a row's name to the scripts `scriptsOf` finds in its declaration. */
const staleExemptions = (exempt, scriptsByRow) => exempt
  .filter(e => !(scriptsByRow.get(e.row) ?? []).includes(e.script))
  .map(e => `${e.script}: exempt from the network scan in "${e.row}", ${scriptsByRow.has(e.row) ? 'a row that does not run it' : 'which is not a row of the gate'} (a stale exemption)`)

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
 * Network use is a callee in code (`NETWORK_USE`), and a script that has it is flagged unless `NETWORK_EXEMPT` names it for THIS row and the row's own text does not pass the flag that is its only way there.
 *
 * The rule it applies: every clock read must be on the line of a `const NAME = ...` whose name is in capitals (a capture), and a script is flagged when it has more reads than
 * captures. A capture is the read itself, so `const A = () => new Date()` is not one. How many captures a script may have is not limited and nothing checks that one is at top level, so two
 * captures can straddle midnight between them. The shape this repo settled on is the same as `gameStateAt`'s: capture the instant ONCE, into `const NOW = new Date()`, then be pure.
 */
const nondeterminism = (scripts, row = null) => {
  const flagged = []
  for (const s of scripts) {
    let src
    try { src = readFileSync(s, 'utf8') } catch { continue }
    const { captures, reads, network } = clockCounts(src)
    if (reads > captures) {
      flagged.push(`${s}: reads the clock ${reads}x (capture it once as NOW)`)
    }
    if (network.length > 0) flagged.push(...networkObjections(s, network, row))
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
  networkClauses(check)
  process.exit(summarize() === 0 ? 0 : 1)
}

const report = []
const scriptsByRow = new Map(rows.map(r => [r.name, scriptsOf(r.name)]))
for (const row of rows) {
  const scripts = scriptsByRow.get(row.name)
  const muts = mutationsFor(scripts, row.name)
  const nd = nondeterminism(scripts, { name: row.name, decl: declOf(row.name), exempt: NETWORK_EXEMPT })

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
const stale = staleExemptions(NETWORK_EXEMPT, scriptsByRow)
check(`every network exemption names a row of the gate and a script that row runs (${NETWORK_EXEMPT.length} exemptions)`, stale.length === 0, stale.join('\n      → '))
finish(summarize())

// The scanner's own clauses, at the END of the file, called through a hoisted declaration. They went here on 2026-11-04 because `scripts/check-exit-drains.mjs` then blanked comments and
// strings with regular-expression passes (single quotes first, then double, then backticks, over the whole text), and these fixtures put quotes, backticks and slashes inside each other:
// after the first of them it paired the wrong ends for the rest of the file and could not see the exit line of the self-test above, so its count of early exits fell by one with nothing
// changed in what the script does (59 against a budget of 60). It blanks with the scanner these clauses test (`scripts/strip-non-code.mjs`) now, and its own clauses put the same shapes
// in front of an exit, so the position no longer matters; the call is left where it is. Residual Task 10 item 19.
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
  for (const k of ['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']) {
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
  // Review 6, 2026-11-05. The keyword of a header is read as every other keyword is (a whole name, not a property, not a private name), so the shapes the one-character lookbehind could not see are calls: a method after a dot
  // and a space or a line feed (`o. if (x)`, `o.\nwhile (x)`, `o?.with (x)`), a name that ends in a keyword after a non-ASCII letter or a combining mark; and `await` is a header word only after `for`.
  STRIPS.push(
    ['o. if (x) / 2 / z', 'o. if (x) / 2 / z', 'a method named if after a dot and a space is a call: its slash divides'],
    ['o.\nwhile (x) / 2 / z', 'o.\nwhile (x) / 2 / z', 'a method named while after a dot and a line feed is a call: its slash divides'],
    ['o?.with (x) / 2 / z', 'o?.with (x) / 2 / z', 'a method named with after an optional chain is a call: its slash divides'],
    ['\u00e9if (x) / 2 / z', '\u00e9if (x) / 2 / z', 'a name that ends in if after a non-ASCII letter is not the keyword'],
    ['a\u0301if (x) / 2 / z', 'a\u0301if (x) / 2 / z', 'a name that ends in if after a combining mark is not the keyword'],
    ['await (x) / 2 / z', 'await (x) / 2 / z', 'a parenthesis after await alone is an operand: its slash divides'],
    ['x = await (y) / 2 / z', 'x = await (y) / 2 / z', 'a parenthesis after await in an expression is an operand, not a header'])
  // Review 6, 2026-11-05. A slash after `...` begins a regular expression (a spread is not member access), and `of` is a keyword after something that ends an operand (`for (x of /re/...)`) and a name where an expression
  // begins (`= of / 2`, `in of / 2`, `; of / 2`, `if (x) of / 2`, `return of / 2`, `f(...of / 2)`): it is the keyword when a slash could not begin a regular expression in front of it.
  STRIPS.push(
    [`f(.../${Q}/.exec(x))`, 'f(...0.exec(x))', 'a slash after a spread in a call begins a regular expression'],
    [`[.../${Q}/.exec(x)]`, '[...0.exec(x)]', 'a slash after a spread in an array begins a regular expression'],
    [`for (const m of /${Q}/.exec(y))`, 'for (const m of 0.exec(y))', 'a slash after the of of a for-of header begins a regular expression'],
    [`for (const [a] of /${Q}/.exec(y))`, 'for (const [a] of 0.exec(y))', 'a slash after the of of a for-of header with a pattern in brackets begins a regular expression'],
    [`for await (const m of /${Q}/.exec(y))`, 'for await (const m of 0.exec(y))', 'a slash after the of of a for-await header begins a regular expression'],
    ['x = of / 2 / z', 'x = of / 2 / z', 'an identifier named of after an equals sign divides'],
    ['for (x in of / 2 / z)', 'for (x in of / 2 / z)', 'an identifier named of after in divides'],
    ['y; of / 2 / z', 'y; of / 2 / z', 'an identifier named of at the start of a statement divides'],
    ['if (x) of / 2 / z', 'if (x) of / 2 / z', 'an identifier named of right after a header divides'],
    ['return of / 2 / z', 'return of / 2 / z', 'an identifier named of after return divides'],
    ['f(...of / 2 / z)', 'f(...of / 2 / z)', 'an identifier named of after a spread divides'])
  // Review 6, 2026-11-05. A block comment that holds a line terminator is a line terminator to the language (ASI), so it is a line feed in the stripped text and a `++` after it, with an operand before the comment, is a prefix.
  // One that holds none is one space, and the `++` after it still ends an operand.
  STRIPS.push(
    [`a /*\n*/ ++/${Q}/.lastIndex`, `a \n ++0.lastIndex`, 'a `++` after a block comment that holds a line feed is a prefix'],
    [`a /*\r\n*/ ++/${Q}/.lastIndex`, `a \n ++0.lastIndex`, 'a `++` after a block comment that holds a carriage return and a line feed is a prefix'],
    [`a /*\r*/ ++/${Q}/.lastIndex`, `a \n ++0.lastIndex`, 'a `++` after a block comment that holds a carriage return is a prefix'],
    [`a /*${String.fromCharCode(0x2028)}*/ ++/${Q}/.lastIndex`, `a \n ++0.lastIndex`, 'a `++` after a block comment that holds U+2028 is a prefix'],
    [`a /*${String.fromCharCode(0x2029)}*/ ++/${Q}/.lastIndex`, `a \n ++0.lastIndex`, 'a `++` after a block comment that holds U+2029 is a prefix'],
    ['a /* c */ ++ / 2 / z', 'a   ++ / 2 / z', 'a `++` after a block comment of one line still ends an operand'],
    ['a /* c\n d */ b', 'a \n b', 'a block comment of several lines leaves one line feed'])
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
  // Residuals Task 10 item 16. A name is not the keyword it ends in: a private name (`this.#in`), `of` (an identifier in a module, where `for (x of /re/...)` does not occur), a name that has a keyword after a non-ASCII
  // letter (`éin`) or after a combining mark (`a` and U+0301, then `in`), and a name that ends in a non-ASCII letter after one (`iné`). Each divides.
  for (const k of ['in', 'new', 'do', 'of', 'return', 'default', 'extends', 'instanceof']) STRIPS.push([`this.#${k} / 2 / z`, `this.#${k} / 2 / z`, `a private name spelled ${k} is not the keyword`])
  for (const k of ['in', 'of', 'new', 'return']) STRIPS.push([`é${k} / 2 / z`, `é${k} / 2 / z`, `a name that has ${k} after a non-ASCII letter is not the keyword`], [`${k}é / 2 / z`, `${k}é / 2 / z`, `a name that ends in a non-ASCII letter after ${k} is not the keyword`])
  STRIPS.push(['of / 2 / z', 'of / 2 / z', 'an identifier named of divides'], ['o.of / 2 / z', 'o.of / 2 / z', 'a property named of divides'], ['a\u0301in / 2 / z', 'a\u0301in / 2 / z', 'a name with a combining mark before in is not the keyword'],
    ['$in / 2 / z', '$in / 2 / z', 'a name that begins with a dollar sign and ends in a keyword is not the keyword'])
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
    ['a backtick in a regular expression after default', `export default /\`/.test(y)\n${BARE2}`, '2/0'],
    ['a backtick in a regular expression after a spread', `f(.../\`/.exec(x))\n${BARE2}`, '2/0'],
    ['a backtick in a regular expression after the of of a for-of header', `for (const m of /\`/g.exec(y)) {}\n${BARE2}`, '2/0'],
    ['a backtick in a regular expression after a prefix ++ that follows a block comment holding a line feed', `var a = 1; a /*\n*/ ++/\`/.lastIndex\n${BARE2}`, '2/0']]
  const off13 = CASES13.map(([what, src, want]) => ({ what, want, got: (c => `${c.reads}/${c.captures}`)(clockCounts(src)) })).filter(x => x.want !== x.got)
  check(`A LINE THAT ENDS AT A CARRIAGE RETURN, U+2028 OR U+2029 (A COMMENT, A REGULAR EXPRESSION; a string at a CR, not at U+2028), A BACKSLASH BEFORE A CR LF, AND instanceof, extends, default, A SPREAD, THE of OF A for-of HEADER AND A PREFIX ++ AFTER A MULTI-LINE COMMENT BEFORE A REGULAR EXPRESSION, DO NOT HIDE THE CLOCK READS AFTER THEM, for ${CASES13.length} inputs`,
    off13.length === 0, off13.map(x => `${x.what}: wanted ${x.want}, got ${x.got}`).join(' / '))

  // The same one level up: each of these is a division that was read as a regular expression, which ran to the end of its line and took the clock read after it. Each is followed by that read, so "1/0" is it seen.
  const DIVIDES = [...['in', 'new', 'do', 'died'].map(k => [`a private name spelled ${k}`, `class A { #${k} = 1; f() { return this.#${k} / 2 + Date.now() } }\n`]),
    ['an identifier named of', 'var of = 4; var y = of / 2 + Date.now()\n'],
    ...['in', 'of', 'new', 'return'].map(k => [`a name with ${k} after a non-ASCII letter`, `var é${k} = 4; var y = é${k} / 2 + Date.now()\n`]),
    ['a name with a combining mark before in', 'var a\u0301in = 4; var y = a\u0301in / 2 + Date.now()\n'],
    ['a name that ends in a non-ASCII letter', 'var café = 4; var y = café / 2 + Date.now()\n'],
    ...['if', 'while', 'with'].map(k => [`a method named ${k} after a dot and a space (the header rule read it as a header)`, `var o = { ${k}: () => 1 }; var y = o. ${k} (1) / 2 + Date.now()\n`]),
    ['a method named while after a dot and a line feed', 'var o = { while: () => 1 }; var y = o.\nwhile (1) / 2 + Date.now()\n'],
    ['a name that ends in if after a non-ASCII letter', 'function \u00e9if(x) { return x }; var y = \u00e9if(1) / 2 + Date.now()\n']]
  const off16 = DIVIDES.map(([what, src]) => ({ what, got: (c => `${c.reads}/${c.captures}`)(clockCounts(src)) })).filter(x => x.got !== '1/0')
  check(`A DIVISION AFTER A PRIVATE NAME, \`of\`, A NAME THAT HAS A KEYWORD AFTER A NON-ASCII LETTER, OR A METHOD SPELLED LIKE A HEADER WORD, DOES NOT HIDE THE CLOCK READ AFTER IT, for ${DIVIDES.length} inputs (a keyword is the whole trailing word, and a private name or a property is not one)`,
    off16.length === 0, off16.map(x => `${x.what}: wanted 1/0, got ${x.got}`).join(' / '))

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
    ['const NOW = 1\rlog(new Date())', 1, 0], ['const NOW = 1\u2028log(new Date())', 1, 0], ['const NOW = 1\u2029log(new Date())', 1, 0], ['const A = 1\r\nconst B = new Date()', 1, 1],
    ['const T = process.env.T || new Date().toISOString().slice(0, 10)', 1, 1], ['const D = fieldDayIso(fieldToday())', 1, 1], ['const X = { at: new Date() }', 1, 1],
    // Residuals Task 10 item 2: the spellings the scan matched as text and so did not see. `new Date` with no parentheses, the computed `Date['now']()`, `Date.now` or `Date` itself passed on as a value
    // (`const D = Date`, `f(Date)`, `{ Date }`), and `Date()` and `Date(5)`, which return the current time whatever they are given. Then the neighbours that are not reads: a `Date` that is constructed
    // from an argument or named in a type test, a static that is not `now`, a property or key spelled Date, and longer names.
    ['new Date', 1, 0], ['const NOW = new Date', 1, 1], ['new Date;', 1, 0], ["Date['now']()", 1, 0], ['Date.now', 1, 0], ['const clock = Date.now', 1, 0], ['const D = Date', 1, 0], ['f(Date)', 1, 0], ['{ Date }', 1, 0],
    ['Date()', 1, 0], ['Date(5)', 1, 0], ['new Date(5)', 0, 0], ['new Date(x)', 0, 0], ['new Date\n(5)', 0, 0], ['x instanceof Date', 0, 0], ['typeof Date', 0, 0], ['Date.UTC(1)', 0, 0], ["Date['UTC'](1)", 1, 0],
    ['o.Date', 0, 0], ['{ Date: 1 }', 0, 0],
    // Review 6: a name that only ends in one of the spellings is not a read (a left boundary on each), a property is a property however it is spelled (a dot and a space or a line feed, an optional chain, a private name),
    // a spread is not a dot, and a helper called on a namespace import is a call of the helper.
    ['MyDate.now()', 0, 0], ['LocalDate.now()', 0, 0], ['$Date.now()', 0, 0], ['this.#Date.now()', 0, 0], ["MyDate['now']()", 0, 0], ['xfieldDay()', 0, 0], ['xfieldToday()', 0, 0], ['$fieldDay()', 0, 0], ['this.#fieldToday()', 0, 0],
    ['const NOW = xfieldDay()', 0, 0], ['const NOW = xfieldToday()', 0, 0], ['z.fieldDay()', 1, 0], ['z.fieldToday()', 1, 0], ['f(MyDate)', 0, 0], ['f($Date)', 0, 0],
    ['o. Date', 0, 0], ['o.\nDate', 0, 0], ['this.#Date', 0, 0], ['o?.Date', 0, 0], ['f(...Date)', 1, 0],
    // Review 6, the reads the pattern hid: any computed member of Date (the key is gone by the time the pattern sees it), the global reached through an object, and a spread that may be empty.
    ["Date['UTC']()", 1, 0], ["Date['now']", 1, 0], ["const f = Date['now']; f()", 1, 0], ['Date[k]()', 1, 0], ['Date[k]', 1, 0], ["o.Date['x']", 0, 0], ["MyDate['now']()", 0, 0], ['Date .UTC(1)', 0, 0], ['{ Date : 1 }', 0, 0],
    ['new globalThis.Date()', 1, 0], ['const D = globalThis.Date; new D()', 1, 0], ['window.Date', 1, 0], ['self.Date', 1, 0], ['global.Date', 1, 0], ['globalThis . Date', 1, 0], ['xglobalThis.Date', 0, 0], ['globalThis.Dates', 0, 0],
    ['new Date(...[])', 1, 0], ['new Date(...a)', 1, 0], ['const NOW = new Date(...[])', 1, 1], ['new Date(.5)', 0, 0], ['new Date( ...a )', 1, 0], ['new DateTimeFormat()', 0, 0], ['const F = DateFormatter', 0, 0], ['const D = Dates', 0, 0],
    // Whitespace inside the spelling (a `Date` and its `.`, the computed form), and a capture that is not a read: `new Date(5)` and `new DateTimeFormat()` hold no clock read, so a constant holding one must not count
    // as a capture either, or it would hide a bare read somewhere else in the script.
    ['Date . now()', 1, 0], ['Date.nowish', 0, 0], ['Date\n.now()', 1, 0], ["Date [ 'now' ] ( )", 1, 0], ['const NOW = new Date(5)', 0, 0], ['const N = new DateTimeFormat()', 0, 0]]
  const badForms = FORMS.filter(([src, reads, captures]) => { const c = clockCounts(src); return c.reads !== reads || c.captures !== captures })
  check(`THESE ${FORMS.length} SPELLINGS OF A CLOCK READ ARE COUNTED OR NOT (whitespace inside and around the call, a template expression but not template text, \`new Date\` with no parentheses, \`Date.now\` and \`Date\` passed on as values, any computed member of \`Date\`, the global through \`globalThis\`, \`window\`, \`self\` or \`global\`, \`new Date(...x)\`, and a name that only ends in one of them), and a capture is a \`const\` in capitals whose value IS new Date(), fieldDay() or fieldToday() on the same line, not a function, class or later statement that holds one. NOT COVERED: \`performance.now()\` and \`process.hrtime()\` (durations, not instants, and proof-check.mjs reads them for its report), \`process.uptime()\`, \`Intl\` and \`Atomics\` timers, and a \`Date\` reached through a computed or concatenated name (\`globalThis['Da' + 'te']\`)`,
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

// The network half of the scan and its exemptions (2026-11-05). A hoisted function after the scanner's, for the same reason: it holds fixtures that put quotes and slashes inside each other.
function networkClauses(check) {
  const KINDS = {
    fetch: 'fetch x1', global: 'global fetch x1', socket: 'new WebSocket|EventSource|XMLHttpRequest x1', http: 'http(s).request|get x1', connect: 'net|tls|http2.connect x1', beacon: 'sendBeacon x1',
  }
  const SEEN = [
    // fetch, as a call and as a value (`fetchImpl = fetch` is how mutation-await.mjs reaches the network), in a template's expression, and twice.
    ['await fetch(u)', KINDS.fetch], ['const f = fetch', KINDS.fetch], ['const run = async ({ fetchImpl = fetch }) => fetchImpl(u)', KINDS.fetch], ['fetch(a); fetch(b)', 'fetch x2'],
    ['const r = await fetch(`${base}/x`)', KINDS.fetch], ['const t = `${fetch(a)}`', KINDS.fetch], ['fetch (u)', KINDS.fetch],
    // fetch through a global object.
    ['globalThis.fetch(u)', KINDS.global], ['window.fetch(u)', KINDS.global], ['self.fetch(u)', KINDS.global], ['global.fetch(u)', KINDS.global], ['globalThis . fetch(u)', KINDS.global],
    // a DECLARATION of the name or an ASSIGNMENT to it is not use (a script that stubs fetch makes no request): a function, a variable, a method of a class or an object (one the engine calls, as a Worker's
    // `export default { fetch }` is), a class field, an assignment target, through a global too. The neighbours beside them are still use: compared, read, passed on, or a call with a callback.
    ['function fetch(u){}', ''], ['function fetch(u = g(h())) {}', ''], ['async function fetch(u){}', ''], ['function* fetch(){}', ''], ['function* fetch(u = g(h())) {}', ''], ['let fetch', ''], ['var fetch, other', ''], ['const fetch = realFetch', ''], ['for (const fetch of list) {}', ''],
    ['class A { fetch(u){} }', ''], ['class A { async fetch(u){} }', ''], ['class A { static fetch(u = g()) {} }', ''], ['const o = { fetch(u){} }', ''], ['export default { async fetch(request, env) { return 1 } }', ''],
    ['class A { fetch = 1 }', ''], ['fetch = stub', ''], ['fetch=stub', ''],
    ['globalThis.fetch = (url) => ({})', ''], ['window.fetch=s', ''], ['self . fetch = s', ''], ['global.fetch = s', ''],
    ['fetch === undefined', KINDS.fetch], ['fetch == g', KINDS.fetch], ['typeof fetch', KINDS.fetch], ['globalThis.fetch === undefined', KINDS.global], ['const f = globalThis.fetch', KINDS.global],
    ['window.fetch = window.fetch.bind(window)', KINDS.global], ['globalThis.fetch ??= stub', KINDS.global], ['x = fetch(u).then(function () { return 1 })', KINDS.fetch], ['fetch(function () {})', KINDS.fetch],
    ['x = fetch(u)\n.then(() => {})', KINDS.fetch], ['const r = await fetch(u)\n{ }', KINDS.fetch],
    // the one spelling this gets wrong in the safe direction: a method whose brace is on the NEXT line reads as a call.
    ['class A { fetch(u)\n{ } }', KINDS.fetch],
    // the other clients.
    ['new WebSocket(u)', KINDS.socket], ['new EventSource(u)', KINDS.socket], ['new XMLHttpRequest()', KINDS.socket], ['new  WebSocket(u)', KINDS.socket],
    ['https.request(o)', KINDS.http], ['http.get(u)', KINDS.http], ['https . get (u)', KINDS.http], ['net.connect(80)', KINDS.connect], ['tls.connect(o)', KINDS.connect],
    ['http2.connect(u)', KINDS.connect], ['net.createConnection(80)', KINDS.connect], ['navigator.sendBeacon(u, d)', KINDS.beacon], ['sendBeacon(u)', KINDS.beacon],
    ['fetch(a); new WebSocket(b)', `${KINDS.fetch}, ${KINDS.socket}`],
    // not use: text (a string, a comment, a template's text), a key, a property, a longer name, a module's other members, a constructor of something else.
    ["const s = 'fetch(u)'", ''], ['// fetch(u)\nconst a = 1', ''], ['/* new WebSocket(u) */', ''], ['const t = `fetch(u) ${1}`', ''], ['const o = { fetch: 1 }', ''], ['const o = { fetch : 1 }', ''],
    ['o.fetch(x)', ''], ['o?.fetch(x)', ''], ['o . fetch(x)', ''], ['fetchImpl(u)', ''], ['refetch(u)', ''], ['$fetch(u)', ''], ['const fetched = 1', ''], ['https.Agent', ''], ['http.STATUS_CODES', ''],
    ['net.isIP(x)', ''], ['o.http.get(1)', ''], ['new WebSocketServer(u)', ''], ['new URL(u, base)', ''], ['xnet.connect(1)', ''],
    // the guards of each pattern, from both sides (review 7: a guard nothing pinned could be deleted with every clause green). A name that merely ENDS in a global's or a module's name, a property of one (with a space after
    // the dot too), a member that merely BEGINS like fetch; and then the spellings with spaces that the patterns allow, which the unspaced ones above do not reach.
    ['window.fetchSlate(x)', ''], ['self.fetchPending = 1', ''], ['itself.fetch(x)', ''], ['myglobal.fetch(x)', ''], ['o.window.fetch(x)', ''], ['o. window.fetch(x)', ''],
    ['myhttp.get(u)', ''], ['o. http.get(u)', ''], ['o.net.connect(1)', ''], ['o. net.connect(1)', ''], ['function * fetch(u = g(h())) {}', ''],
    ['net . connect (80)', KINDS.connect], ['tls . connect (o)', KINDS.connect], ['http2 . createConnection (u)', KINDS.connect], ['sendBeacon (u)', KINDS.beacon], ['navigator . sendBeacon (u)', KINDS.beacon],
    ['resendBeacon(x)', ''], ['$sendBeacon(x)', ''],
  ]
  // NOT COVERED, PINNED AS NOT SEEN. Spellings of network use this scan does not see, each measured on this tree (review 7, 2026-11-05: none of them gives a network use) and listed in the label below. They are pinned
  // here so that the list cannot drift from the scan: if the scan learns one, this clause fails and the label has to change with it. Grepped over scripts/*.mjs on 2026-11-05: no script uses any of the forms (the two that
  // import node:http, mutation-await.mjs and serve.mjs, import only createServer).
  const NOT_SEEN = [
    'globalThis?.fetch(u)', 'self?.fetch(u)', 'http?.get(u)', 'http?.request(o)',
    'new globalThis.WebSocket(u)', 'new window.WebSocket(u)', 'new (WebSocket)(u)',
    "require('https').get(u)", "require('node:https').request(o)", "import('node:https').then(h => h.get(u))", "(await import('node:net')).connect(80)",
    "import h from 'node:https'; h.request(o)", "const h = require('https'); h.get(u)", "import { get } from 'node:https'; get(u)",
    'const { fetch: f } = globalThis; f(u)', 'new net.Socket().connect(80)',
    "import dgram from 'node:dgram'; dgram.createSocket('udp4').send(m, 80, 'h')", "dns.lookup('x', cb)",
    '[...fetch]', 'f(...fetch)',
    "spawn('curl', [u])", 'route.fetch()', "globalThis['fe' + 'tch'](u)", 'c ? fetch : g',
    'const g = https.get', 'const c = net.connect', 'const b = navigator.sendBeacon',
  ]
  const wrongSeenIn = list => list.filter(([src, kinds]) => clockCounts(src).network.join(', ') !== kinds)
  const wrongNotSeenIn = list => list.filter(src => clockCounts(src).network.length !== 0)
  const wrongSeen = wrongSeenIn(SEEN)
  const wrongNotSeen = wrongNotSeenIn(NOT_SEEN)
  // A check that has only ever passed proves nothing: each comparison is shown to report a pin that is wrong (a call of fetch pinned as not use, and as not seen).
  const controlsHold = wrongSeenIn([['fetch(u)', '']]).length === 1 && wrongNotSeenIn(['fetch(u)']).length === 1
  check(`THESE ${SEEN.length} SPELLINGS ARE NETWORK USE (${SEEN.filter(x => x[1] !== '').length}) OR NOT (${SEEN.filter(x => x[1] === '').length}): fetch as a call or a value, through a global, new WebSocket|EventSource|XMLHttpRequest, http(s).request|get, net|tls|http2.connect, sendBeacon; not text, a key, a property, a longer name, a declaration or an assignment to the name (\`function fetch\`, \`let fetch\`, a method or a class field, \`globalThis.fetch = stub\`). NOT COVERED, AND PINNED AS NOT SEEN (${NOT_SEEN.length} spellings): optional chaining on a global or a module (\`globalThis?.fetch(u)\`, \`self?.fetch(u)\`, \`http?.get(u)\`), a constructor reached through a global or in parentheses (\`new globalThis.WebSocket(u)\`, \`new window.WebSocket(u)\`, \`new (WebSocket)(u)\`), a module reached by \`require('https').get(u)\` or \`import('node:net')\`, a module imported or required under a name of its own (\`import h from 'node:https'; h.request(o)\`, \`const h = require('https'); h.get(u)\`) or by a named import (\`import { get } from 'node:https'; get(u)\`), a destructured alias (\`const { fetch: f } = globalThis; f(u)\`), \`new net.Socket().connect(80)\`, \`dgram\` and \`dns\`, a spread of fetch (\`f(...fetch)\`, \`[...fetch]\`: the dot of the spread reads as a property), a child process (\`spawn('curl')\`, \`gh api\`), \`dotnet restore\` in proof-check.mjs and the build row, a browser's \`route.fetch()\` or \`page.goto\` to an external address, a computed name (\`globalThis['fe' + 'tch']\`), \`c ? fetch : g\` (read as a key), \`const g = https.get\`, \`const c = net.connect\` or \`const b = navigator.sendBeacon\` (a reference that is not called on the spot), and a module the script imports that does the fetching. It errs in the safe direction on a method whose brace is on the NEXT line: it reads as a call.`,
    wrongSeen.length === 0 && wrongNotSeen.length === 0 && controlsHold,
    [...wrongSeen.map(([src, kinds]) => `${JSON.stringify(src)}: saw [${clockCounts(src).network.join(', ')}], wanted [${kinds}]`), ...wrongNotSeen.map(src => `${JSON.stringify(src)}: saw [${clockCounts(src).network.join(', ')}], listed as NOT COVERED`)].slice(0, 4).join(' / ')
      + ` (${wrongSeen.length} wrong of ${SEEN.length}; ${wrongNotSeen.length} of the ${NOT_SEEN.length} listed as not seen are seen; a pin that is wrong is reported by both comparisons: ${controlsHold})`)

  // The exemption, on real files and a row declaration written for the case. The row is `r`, its script writes a fetch; the declaration is the text `gate-checks.mjs` would hold for it.
  const dir = mkdtempSync(join(tmpdir(), 'row-network-'))
  try {
    const F = join(dir, 'fetches.mjs'), Q = join(dir, 'quiet.mjs')
    writeFileSync(F, 'const res = await fetch(url)\n')
    writeFileSync(Q, 'console.log(1)\n')
    const declOfCommands = (...cmds) => "name: 'r',\n    run: () => " + cmds.map(c => "ok('node " + c + "')").join(' &&\n               ') + ' },'
    const guarded = { row: 'r', script: F, flag: '--url' }
    const rowOf = (exempt, decl) => ({ name: 'r', decl, exempt })
    const OFFLINE = declOfCommands(`${F} --file data/a.json`)
    const CASES = [
      ['no row at all: nothing is exempt', null, false, 'reaches the network (fetch x1)'],
      ['no entry for it', rowOf([], OFFLINE), false, 'reaches the network (fetch x1)'],
      ['an entry with a flag the row does not pass', rowOf([guarded], OFFLINE), true],
      ['the same entry once the row passes the flag', rowOf([guarded], declOfCommands(`${F} --url https://example.test/x`)), false, 'this row passes --url'],
      ['the same entry once the row passes the flag as --url=value', rowOf([guarded], declOfCommands(`${F} --url=https://example.test/x`)), false, 'this row passes --url'],
      ['a flag that only begins like the guard flag (--urls)', rowOf([guarded], declOfCommands(`${F} --urls data/a.json`)), true],
      ['the flag named only in a comment of the row', rowOf([guarded], "name: 'r',\n    // the sentinel passes " + F + " --url https://example.test/x\n    run: () => ok('node " + F + " --file data/a.json') },"), true],
      ['the flag passed to another script of the row', rowOf([guarded], declOfCommands(`${F} --file data/a.json`, `${Q} --url https://example.test/x`)), true],
      ['the flag passed to this script by the second of two commands', rowOf([guarded], declOfCommands(`${F} --file data/a.json`, `${F} --url https://example.test/x`)), false, 'this row passes --url'],
      ['the flag after a double-quoted argument (the first version stopped reading at any quote)', rowOf([guarded], declOfCommands(`${F} --file "data/a.json" --url https://example.test/x`)), false, 'this row passes --url'],
      ['the flag in a second string joined to the first by +', rowOf([guarded], "name: 'r',\n    run: () => ok('node " + F + " --file data/a.json ' + '--url https://example.test/x') },"), false, 'this row passes --url'],
      ['an entry that names another row', rowOf([{ ...guarded, row: 'other' }], OFFLINE), false, 'reaches the network (fetch x1)'],
      ['an entry that names another script', rowOf([{ ...guarded, script: Q }], OFFLINE), false, 'reaches the network (fetch x1)'],
      ['a sanctioned entry, whatever the row passes', rowOf([{ row: 'r', script: F, sanctioned: 'the one read' }], declOfCommands(`${F} --url https://example.test/x`)), true],
      ['an entry with neither a flag nor a sanction', rowOf([{ row: 'r', script: F }], OFFLINE), false, 'names no flag and is not the sanctioned wait'],
    ]
    const off = CASES.map(([what, row, clean, mention]) => {
      const found = nondeterminism([F], row)
      const mark = score(true, found.length > 0)
      const right = (clean ? mark >= BAR : mark < BAR) && (clean || (found.length === 1 && (mention === undefined || found[0].includes(mention))))
      return right ? null : `${what}: scored ${mark}${clean ? '' : ' (wanted below the bar)'}, objections [${found.join(' | ')}]`
    }).filter(x => x !== null)
    check(`A SCRIPT THAT REACHES THE NETWORK SCORES CLEAN ONLY UNDER AN EXEMPTION FOR ITS OWN ROW AND SCRIPT THAT THE ROW'S OWN TEXT DOES NOT CONTRADICT, for ${CASES.length} cases (a flag in a comment or in another script's command is not passed; \`--flag=value\` is; a sanction holds whatever the row passes; an entry with no flag exempts nothing). NOT COVERED: arguments built at run time (a template, a variable, the environment) are not seen, which is why the shard wait is a sanction and not a flag`,
      off.length === 0, off.slice(0, 3).join(' / ') + ` (${off.length} wrong of ${CASES.length})`)

    // An exemption that names a row the gate does not have, or a script its row does not run, is an objection of its own.
    const BYROW = new Map([['a', ['scripts/x.mjs', 'scripts/y.mjs']], ['b', ['scripts/y.mjs']]])
    const e = (row, script) => ({ row, script, flag: '--url' })
    const STALE = [
      ['a script its row runs', [e('a', 'scripts/x.mjs')], 0, ''], ['a script its row does not run', [e('b', 'scripts/x.mjs')], 1, 'a row that does not run it'],
      ['a row the gate does not have', [e('c', 'scripts/x.mjs')], 1, 'which is not a row of the gate'], ['one live and two stale', [e('a', 'scripts/y.mjs'), e('b', 'scripts/x.mjs'), e('c', 'scripts/y.mjs')], 2, 'a stale exemption'],
    ]
    const offStale = STALE.map(([what, entries, want, mention]) => { const found = staleExemptions(entries, BYROW); return found.length === want && found.every(m => m.includes(mention)) ? null : `${what}: ${found.length} stale, wanted ${want} [${found.join(' | ')}]` }).filter(x => x !== null)
    check(`AN EXEMPTION FOR A ROW THE GATE DOES NOT HAVE, OR FOR A SCRIPT ITS ROW DOES NOT RUN, IS STALE AND SAID SO (${STALE.length} cases)`, offStale.length === 0, offStale.join(' / '))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  // The scripts a row runs are read from its code and its strings, not from its comments: a path named in a comment is documentation, and the row does not run it. It was scanned as if the row did,
  // and with the network half alive a sentence naming any of the 55 scripts that reach the network dropped its row to 70 (review 7). The last case is the way the comment pass can go wrong the other
  // way: a `//` inside the string of one command (a URL) must not take the next command's path with it.
  const IN = [
    ['a path in a line comment', "name: 'r',\n    // the live counterpart is scripts/window-check.mjs, which this row does not run\n    run: () => ok('node scripts/spark-check.mjs') },", 'scripts/spark-check.mjs'],
    ['a path in a block comment', "name: 'r', /* scripts/window-check.mjs */ run: () => ok('node scripts/spark-check.mjs') },", 'scripts/spark-check.mjs'],
    ['a path in a comment after the command, on the same line', "name: 'r', run: () => ok('node scripts/spark-check.mjs') }, // not scripts/window-check.mjs", 'scripts/spark-check.mjs'],
    ['a path only in a comment names no script: the row is its own logic', "name: 'r',\n    // scripts/window-check.mjs\n    run: () => localFn() },", 'scripts/gate-checks.mjs'],
    ['a `//` inside the string of one command does not hide the next command', "name: 'r', run: () => " + ["ok('node scripts/a-check.mjs --url http://x')", "ok('node scripts/b-check.mjs')"].join(' && ') + ' },', 'scripts/a-check.mjs,scripts/b-check.mjs'],
  ]
  const offIn = IN.map(([what, decl, want]) => ({ what, want, got: scriptsIn(decl).join() })).filter(x => x.want !== x.got)
  const mentioned = scriptsIn(IN[0][1])
  const staleForComment = staleExemptions([{ row: 'r', script: 'scripts/window-check.mjs', flag: '--url' }], new Map([['r', mentioned]]))
  check(`THE SCRIPTS A ROW RUNS ARE THE ONES IN ITS CODE AND STRINGS, NOT IN ITS COMMENTS, for ${IN.length} declarations (a line comment, a block comment, a comment after the command, a comment alone; a \`//\` in a URL inside a string is not a comment), and an exemption for a script a row only names in a comment is stale`,
    offIn.length === 0 && staleForComment.length === 1,
    offIn.map(x => `${x.what}: scanned [${x.got}], wanted [${x.want}]`).join(' / ') + ` (${offIn.length} wrong of ${IN.length}; ${staleForComment.length} stale of 1 exemption for the commented script)`)

  // Whether a row passes the flag, in every shape the text of a command can take (review 7, C4). The version before this one read a command up to its first quote of any kind and split the rest at whitespace
  // only (so `'--url` was not `--url`): a flag behind a quote, a `+` join, a line break or an argument array was passed and not seen. Those are the first cases. The neighbours the new cut must still get right
  // follow: a path under scripts/ is an argument and a call named like ok( is not the end of one; and the ones that must stay not passed: no flag, a flag that belongs to the next script of the same command,
  // and one named in a later, different call.
  const A = 'scripts/a-check.mjs', B = 'scripts/b-check.mjs'
  const call = (...cmds) => cmds.map(c => "ok('node " + c + "')").join(' &&\n               ')
  const FLAGS = [
    ['a double-quoted argument before the flag', "ok('node " + A + ' --file "data/a.json" --url https://example.test/x' + "')", A, '--url', true],
    ['a single-quoted argument before the flag, in a double-quoted command', 'ok("node ' + A + " --file 'data/a.json' --url https://example.test/x" + '")', A, '--url', true],
    ['a second string joined by + after a space', "ok('node " + A + " --file data/a.json ' + '--url https://example.test/x')", A, '--url', true],
    ['a second string joined by + with no space', "ok('node " + A + " --file data/a.json '+'--url=https://example.test/x')", A, '--url', true],
    ['the strings on separate lines', "ok('node " + A + " --file data/a.json ' +\n               '--url https://example.test/x')", A, '--url', true],
    ['a template literal', 'ok(`node ' + A + ' --file data/a.json --url ${u}`)', A, '--url', true],
    ['a second template literal joined by +', 'ok(`node ' + A + ' --file data/a.json ` + `--url ${u}`)', A, '--url', true],
    ['an argument array', "run(['node', '" + A + "', '--file', 'data/a.json', '--url', u])", A, '--url', true],
    ['an argument array in double quotes', 'run(["node", "' + A + '", "--file", "data/a.json", "--url", u])', A, '--url', true],
    ['a path under scripts/ before the flag (it is not the next script)', "ok('node " + A + " --file scripts/data.json --url https://example.test/x')", A, '--url', true],
    ['no flag at all', call(A + ' --file data/a.json'), A, '--url', false],
    ['the flag belongs to the next script of the same command', "ok('node " + A + ' --file a.json && node ' + B + " --url https://example.test/x')", A, '--url', false],
    ['...and is that script\'s', "ok('node " + A + ' --file a.json && node ' + B + " --url https://example.test/x')", B, '--url', true],
    ['the flag named in a later, different ok( call', call(A + ' --file a.json', "echo --url x"), A, '--url', false],
    ['the flag named in a later fails( call', "ok('node " + A + " --file a.json') &&\n               fails('echo --url x')", A, '--url', false],
    ['the flag named in a later all( call', "ok('node " + A + " --file a.json') &&\n               all('echo --url x')", A, '--url', false],
    ['a call whose name merely ends in ok( inside the arguments does not end them', "ok('node " + A + " --file ' + book('a') + ' --url https://example.test/x')", A, '--url', true],
    ['the flag in a comment after the command', "ok('node " + A + " --file a.json') // --url https://example.test/x", A, '--url', false],
  ]
  const offFlags = FLAGS.map(([what, decl, script, flag, want]) => ({ what, want, got: passesFlag(decl, script, flag) })).filter(x => x.want !== x.got)
  check(`A FLAG IS FOUND IN A COMMAND WHATEVER QUOTES, JOINS OR LINES ARE IN FRONT OF IT, for ${FLAGS.length} commands (${FLAGS.filter(x => x[4]).length} pass it: double and single quotes, + with and without a space, separate lines, a template, an argument array, a path under scripts/ and a call named like ok( before it; ${FLAGS.filter(x => !x[4]).length} do not: none, the next script's, a later ok( fails( or all( call's, a comment's). NOT COVERED: arguments built at run time (a variable, the environment, the text inside a template's expression)`,
    offFlags.length === 0, offFlags.map(x => `${x.what}: wanted ${x.want}, got ${x.got}`).join(' / ') + ` (${offFlags.length} wrong of ${FLAGS.length})`)

  // Where a row's declaration ends: at the next row or at the end of the table, and not at a blank line. A source laid out like `gate-checks.mjs`, written for the case: a comment above a row belongs to the row
  // before it (and is blanked when read), a command after a blank line belongs to its row, a name in double quotes is found, and the table's `]` ends the last row (the code after it is not a row's).
  const SRC = ['export const rows = [', "  { name: 'one', weight: 1,", "    run: () => ok('node scripts/a.mjs') },", '', '  // a note on the next row, naming scripts/z-note.mjs', "  { name: 'two', weight: 1,",
    '    run: () => ' + [ "ok('node scripts/b.mjs')", "ok('node scripts/c.mjs --url https://example.test/x')" ].join(' &&\n\n               ') + ' },', '', '  { name: "three\'s", weight: 1,', "    run: () => ok('node scripts/d.mjs') },", ']', '',
    "const after = () => ok('node scripts/after.mjs')", ''].join('\n')
  const DECLS = [['one', 'scripts/a.mjs'], ['two', 'scripts/b.mjs,scripts/c.mjs'], ["three's", 'scripts/d.mjs'], ['no such row', '']]
  const offDecls = DECLS.map(([name, want]) => ({ name, want, got: (d => d === '' ? '' : scriptsIn(d).join())(declIn(SRC, name)) })).filter(x => x.want !== x.got)
  check(`A ROW'S DECLARATION RUNS TO THE NEXT ROW OR THE END OF THE TABLE, NOT TO A BLANK LINE, for ${DECLS.length} rows of a table written for the case (a command after a blank line is the row's; a comment above the next row is blanked; a name in double quotes is found; the code after the table is no row's), and a flag after that blank line is passed`,
    offDecls.length === 0 && passesFlag(declIn(SRC, 'two'), 'scripts/c.mjs', '--url') && !passesFlag(declIn(SRC, 'one'), 'scripts/c.mjs', '--url'),
    offDecls.map(x => `${x.name}: scanned [${x.got}], wanted [${x.want}]`).join(' / ') + ` (${offDecls.length} wrong of ${DECLS.length}; flag after the blank line passed: ${passesFlag(declIn(SRC, 'two'), 'scripts/c.mjs', '--url')}, flag in the row above passed: ${passesFlag(declIn(SRC, 'one'), 'scripts/c.mjs', '--url')})`)

  // The table itself. There is exactly one sanctioned network read in the gate, the shard wait, and a guarded entry's flag is a flag: a flag spelled `url` would never be passed, and its exemption would never lapse.
  const sanctioned = NETWORK_EXEMPT.filter(x => x.sanctioned).map(x => x.script)
  const badFlags = NETWORK_EXEMPT.filter(x => !x.sanctioned && !/^--[a-z][a-z-]*$/.test(x.flag ?? '')).map(x => `${x.script} in "${x.row}": ${JSON.stringify(x.flag)}`)
  check(`THE TABLE OF ${NETWORK_EXEMPT.length} EXEMPTIONS HOLDS EXACTLY ONE SANCTIONED NETWORK READ, THE SHARD WAIT, AND EVERY OTHER ENTRY IS KEYED ON A FLAG`,
    sanctioned.join() === 'scripts/mutation-await.mjs' && badFlags.length === 0, `sanctioned: [${sanctioned.join()}] (wanted scripts/mutation-await.mjs); not a flag: ${badFlags.join(' / ') || '(none)'}`)

  // On the real tree the scan has to fire somewhere. The denominators are in the label, from the data; holding each script a row runs to the table is the scorer's job, above.
  const every = readdirSync('scripts').filter(f => f.endsWith('.mjs')).map(f => `scripts/${f}`)
  const hits = every.filter(f => clockCounts(readFileSync(f, 'utf8')).network.length > 0)
  const rowScripts = [...new Set(rows.flatMap(r => scriptsOf(r.name)))]
  const rowHits = rowScripts.filter(f => hits.includes(f))
  check(`THE NETWORK SCAN FIRES ON THE REAL TREE: ${hits.length} of ${every.length} scripts under scripts/ reach the network by its reading, ${rowHits.length} of the ${rowScripts.length} that a gate row runs (${rowHits.join(', ')}); the scorer holds each of those to the table`,
    hits.length > 0, `it flagged none of ${every.length} scripts`)

  // A row that runs one script twice lists it once: an objection about the script is one line, not one per command.
  const listedTwice = rows.map(r => [r.name, scriptsOf(r.name)]).filter(([, list]) => new Set(list).size !== list.length).map(([name, list]) => `${name}: ${list.join(' ')}`)
  check(`NO GATE ROW LISTS A SCRIPT TWICE, for ${rows.length} rows (${rows.filter(r => (declOf(r.name).match(/scripts\/[\w.-]+\.mjs/g) ?? []).length > scriptsOf(r.name).length).length} of them name one script in more than one command)`,
    listedTwice.length === 0, listedTwice.join(' / '))
}
