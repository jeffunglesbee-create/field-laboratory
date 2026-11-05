// What is code and what is not, in one scanner with two outputs.
//
// `scanNonCode(src)` is the scanner under the determinism half of `row-confidence.mjs` (the gate row "every gate row has teeth and is deterministic"); its comment, below, says what it
// replaces and what it still does not do. `stripNonCode` is its text (what `row-confidence.mjs` counts clock reads in) and `blankNonCode` is where it found non-code, turned into a blank of
// the same length and the same lines (what `check-exit-drains.mjs` classifies exits in, and reports line numbers from); `blankComments` is the same blank of the comments only (what `short-circuit-check.mjs`
// scans, because its subject is code and a template's `${…}` is code). It is a module of its own because `row-confidence.mjs` does its work at
// module scope (it reads the gate's rows and prints a table when it is imported), and `scripts/import-purity-check.mjs` imports every script with a top-level `export` in a fresh
// process and fails one that prints. This file imports nothing and does nothing when imported.

/**
 * `{ marked, spans }`. `spans` is where the text that is not code stood in `src`, as `[start, end)` pairs: every comment, string, regular-expression literal and template literal, a template from its opening
 * backtick to its closing one. The spans of what is inside a template's `${…}` expressions are in the list too, inside the template's own, so spans can overlap (blanking them is the same either way). `marked` is the source with comments removed, every string replaced by an empty string, every regular-expression literal by `0`, and every template literal by an empty string preceded by its `${…}` expressions, each kept as code in parentheses (`a ${b} c` leaves ` (b) ''`): what is left is code.
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
 * swallowed the rest of the file, so every later clock read was invisible); after any other `)`, and after `]`, it divides, and so does a `/` after a name that merely ends in `if` (`elif (x) / 2`, `éif (x) / 2`) and after a method that is spelled like a
 * header word (`o.if (x) / 2`, `o. if (x) / 2`, `o?.with (x) / 2`): the keyword is read as every other keyword is, as a whole name that is neither a property nor a private name. `await` is a header word only after
 * `for`; the keyword is looked for in the forty characters before the parenthesis. A `/` after a `/` begins a regular expression (`a / /re/.source`).
 *
 * What it still does not do: a `/` after `}` is read as the start of a regular expression, which is right after a block
 * and wrong after an object literal or a class body (`{a: 1} / 2`). A `/` after `++`/`--` that ends an operand on the same line, and after a property spelled like a keyword
 * (`c.new`), is division (review 4, 2026-11-04: both were read as regular expressions, which inside a template expression hid the rest of the file); a `++` that starts its
 * statement, or follows a keyword, is a prefix, and a `.` that ends `...` or a number is not member access (review 5). A line ends at a line feed, a carriage return, U+2028 or
 * U+2029: a `//` comment, a regular expression and the `++` test stop there; a string stops at a line feed or a carriage return (U+2028 and U+2029 may be inside one), and a backslash
 * before a CR LF continues it over both. `instanceof`, `extends` and `default` can be followed by a regular expression, and so can `...` (`f(.../re/.exec(x))`: a spread is not member access). `of` is a keyword where an operator can stand, after
 * something that ends an operand (`for (x of /re/.exec(s))`), and a name where an expression begins (`= of / 2`, `in of / 2`, `if (x) of / 2`); after the `}` of a destructuring pattern
 * (`for (const {a} of /re/.exec(s))`) it is read as a name, because a `}` is read as the end of a block (above). Neither a private name (`this.#in`) nor a name that has a keyword after a non-ASCII letter or a
 * combining mark (`éin`) is the keyword it ends in. (A leading `#!`
 * line is read as a regular expression that ends at its line, which changes no count: 23 scripts begin with one.)
 */
export const scanNonCode = src => {
  const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'in', 'instanceof', 'extends', 'default', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'])
  const n = src.length
  let out = ''
  const spans = []
  // The parentheses seen so far, in code: where in `out` each open one began, and where the one closed last began.
  const opens = []
  let closed = 0
  // The characters the language ends a line at (no raw U+2028 or U+2029 in this file: an editor would change what it means).
  const isEol = ch => ch === '\n' || ch === '\r' || ch === String.fromCharCode(0x2028) || ch === String.fromCharCode(0x2029)
  // A `.` that is member access: not the end of `...` (a spread, after which a keyword is a keyword) and not a number's decimal point (`1.`).
  const isPropertyDot = before => before.endsWith('.') && !before.endsWith('...') && !/(?<![\w$.])\d+\.$/.test(before)
  // The keywords whose parenthesis opens a header (`for await` is `for` here: see regexAllowed).
  const HEADER = new Set(['if', 'while', 'for', 'with'])
  const OF = new Set(['of'])
  // Does `text` end in one of `words` (the keywords that a regular expression can follow, or the keywords of a header)? The trailing word is a whole identifier (any letter, combining mark or digit the language
  // allows, so `éin` is not `in`), and it is not a property spelled like one (`c.new`, `o?.in`, `o. if`) or a private name (`this.#in`).
  const endsInKeyword = (text, words = REGEX_AFTER) => {
    const found = /[\p{ID_Continue}$]+$/u.exec(text)
    return found !== null && words.has(found[0]) && text[found.index - 1] !== '#' && !isPropertyDot(text.slice(0, found.index).trimEnd())
  }
  // Can a `/` begin a regular expression after `tail`, the last sixty-four characters of the code so far without the white space at their end? Only after something that cannot end an expression.
  const allowedAfter = tail => {
    if (tail === '') return true
    // `x++ / y` and `x-- / y` divide: the operator ended an operand. Not when the operator starts its statement (`a` newline `++/re/` is a prefix), nor after a keyword
    // (`return ++/re/`). Otherwise `+` and `-` end nothing, and a `/` after them begins a regular expression.
    if (/(\+\+|--)$/.test(tail)) {
      const before = tail.slice(0, -2)
      const operand = before.trimEnd()
      if (/[\w$)\]]$/.test(operand) && ![...before.slice(operand.length)].some(isEol) && !endsInKeyword(operand)) return false
    }
    // The `)` that closes the header of an if, while, for or with begins a statement, so a `/` after it begins a regular expression: `if (x) /re/.test(y)`. After any other `)` it divides.
    // The keyword is read as every other keyword here is, by `endsInKeyword`, so a method (`o. if (x)`, `o?.with (x)`), a private name and a longer name (`éif (x)`, `elif (x)`) are calls, not headers.
    // `for await (` is a header once the `await` is set aside; an `await` alone (`await (x) / 2`) is not a header word.
    if (tail.endsWith(')') && endsInKeyword(out.slice(Math.max(0, closed - 40), closed).trimEnd().replace(/\s+await$/, ''), HEADER)) return true
    if ('(,=:[!&|?{};+-*%<>~^/'.includes(tail[tail.length - 1])) return true
    // A spread is not member access: an expression follows `...` (`f(.../re/.exec(x))`).
    if (tail.endsWith('...')) return true
    // `of` is a keyword where an operator can stand, after something that ends an operand (`for (x of /re/.exec(s))`), and a name where an expression begins (`= of / 2`, `in of / 2`, `; of / 2`, `if (x) of / 2`). It is the
    // second kind when a `/` could begin a regular expression in front of it.
    return endsInKeyword(tail) || (endsInKeyword(tail, OF) && !allowedAfter(tail.slice(0, -2).trimEnd()))
  }
  // Can a `/` here begin a regular expression?
  const regexAllowed = () => {
    const raw = out.slice(-64)
    let tail = raw.trimEnd()
    // A window of nothing but whitespace is the start of the text only if nothing but whitespace came before it: `w` and sixty spaces and then `/ 2` divides.
    if (tail === '' && out.length > raw.length) tail = out.trimEnd().slice(-64)
    return allowedAfter(tail)
  }
  // Code from `start`. With `inExpr` it stops after the `}` that closes a template's `${`. Returns the index after what it consumed.
  const scanCode = (start, inExpr) => {
    let i = start
    let depth = 0
    while (i < n) {
      const c = src[i]
      const d = src[i + 1]
      if (c === '/' && d === '/') { const s = i; while (i < n && !isEol(src[i])) i++; spans.push([s, i]); continue }
      if (c === '/' && d === '*') { const s = i; const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; spans.push([s, i]); out += ' '; continue }
      if (c === "'" || c === '"') {
        // A string that reaches a line feed or a carriage return unclosed ends there: a stray quote must not be able to swallow the rest of the file. (U+2028 and U+2029 may be inside a string.)
        // A backslash and the line end after it continue the string, and a CR LF is one line end: skip both characters.
        const s = i
        i++
        while (i < n && src[i] !== c && src[i] !== '\n' && src[i] !== '\r') i += src[i] !== '\\' ? 1 : src[i + 1] === '\r' && src[i + 2] === '\n' ? 3 : 2
        if (src[i] === c) i++
        spans.push([s, i])
        out += "''"
        continue
      }
      if (c === '`') { const s = i; i = skipTemplate(i + 1); spans.push([s, i]); out += "''"; continue }
      if (c === '/') {
        if (!regexAllowed()) { out += '/'; i++; continue }
        const s = i
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
        spans.push([s, i])
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
  // A construct left open at the end of the text (a string that ends in a backslash, a template or a regular expression that does) runs to the end of the text and no further.
  return { marked: out, spans: spans.map(([s, e]) => [s, Math.min(e, n)]) }
}

export const stripNonCode = src => scanNonCode(src).marked

// The one place text is blanked: every character of each span `which` picks (by where it starts) becomes a space, except a line feed.
const blankSpans = (src, which) => {
  const chars = src.split('')
  const { spans } = scanNonCode(src)
  for (const [s, e] of spans) if (which(s)) for (let i = s; i < e; i++) if (chars[i] !== '\n') chars[i] = ' '
  return chars.join('')
}

/**
 * `src` with every character of every span replaced by a space, except a line feed: the same length, and the same lines, so a line number found in it is the line of the source. A leading `#!` line
 * is read as a regular expression (see above), so part of it stays (`#!        /env node`): the line cannot hold a statement.
 */
export const blankNonCode = src => blankSpans(src, () => true)

/**
 * `src` with only the COMMENTS blanked, as `blankNonCode` blanks them (same length, same lines); strings, regular expressions and templates are left as they were, `${…}` expressions included. It is
 * for a reader whose subject is in the strings (`scripts/x.mjs` named in a command) or in a template's expressions (a call inside `${…}`), which `blankNonCode` would blank with the rest. A span is a comment
 * if it starts with `//` or `/*`: nothing else the scanner records can (a string starts with a quote, a template with a backtick, and a regular expression with a `/` that is neither `//` nor `/*`,
 * because the scanner took those two as comments before it asked whether a `/` begins a regular expression).
 */
export const blankComments = src => blankSpans(src, s => src[s] === '/' && (src[s + 1] === '/' || src[s + 1] === '*'))
