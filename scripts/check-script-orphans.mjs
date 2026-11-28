// No script under scripts/ that a workflow depends on may become unreachable,
// and no `npm run` in a workflow may name a script that does not exist.
//
// WHY THIS EXISTS, from 2026-08-29, and the shape is worth stating because it
// is not "someone deleted a file".
//
// `package.json` carried `"check:sports": "node scripts/sport-registry-check.mjs"`,
// and `.github/workflows/verify.yml:347` runs `npm run check:sports` under the
// name "The sport registry matches what production serves" -- a blocking check
// with 12 assertions, one of which pins golf as deliberately unmodelled so that
// a check reading "everything is modelled" cannot pressure someone into
// modelling a tournament as a two-sided contest to get green.
//
// I then wrote a NEW render check and assigned it to that same key:
//
//   d['scripts']['check:sports'] = "URL='...' node scripts/render-check.mjs"
//
// without asking whether the key existed. The workflow step kept its name, kept
// passing, and started measuring something else entirely. sport-registry-check.mjs
// became referenced by nothing.
//
// NOTHING CAUGHT IT. `unused-check.mjs` was the obvious candidate and it checks
// F# public values, not npm scripts -- confirmed by running it against the
// clobbered tree, where it reported 1/1 PASS. That test is the reason this file
// exists rather than an assumption that a gap was there.
//
// TWO DIRECTIONS, because the failure is one direction and the obvious check is
// the other:
//
//   FORWARD  every `npm run X` named in a workflow resolves to a package.json
//            script. Catches a renamed or deleted script.
//   BACKWARD every scripts/*.mjs that any workflow's script-chain reaches stays
//            reachable. Catches the clobber, which broke nothing forward:
//            check:sports still existed and still ran.

import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { isMain } from './checks.mjs'
import { blankComments } from './strip-non-code.mjs'

const WF = '.github/workflows'

let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `\n        → ${detail}`}`)
  ok ? pass++ : fail++
}

export function npmRunNames (text) {
  // Flags are skipped. `npm run --silent check:staged-outbox` is real (see
  // .githooks/pre-commit:30) and the first regex captured `--silent` as the
  // script name, so the hook's whole chain read as unreachable.
  return [...text.matchAll(/npm run\s+((?:--?[a-z-]+\s+)*)([a-z0-9][a-z0-9:_-]*)/gi)].map(m => m[2])
}
export function scriptFiles (cmd) {
  return [...String(cmd).matchAll(/scripts\/([A-Za-z0-9._-]+\.m?js)/g)].map(m => m[1])
}
// Prose that NAMES a script is not an edge to it. Two `// ...` lines mentioning
// scripts/fetch-silently-empty-probe.mjs -- one of them in this very file --
// made a deliberately-ledgered probe read as reachable, and the ledger check
// then demanded its line be deleted. Same defect as the YAML-comment one below,
// in the other language, found the same way: by asking who references the file
// rather than trusting the count.
//
// WHAT A COMMENT IS, is decided by the scanner in `scripts/strip-non-code.mjs`.
// It was two regular expressions (a block-comment pass over the whole text, then
// `//` at a line start or after whitespace), and they were wrong in both
// directions. A `/*` in a string (`'/**'`) or in a line comment (`src/*.js`)
// opened a "comment" that ran to the next `*/` and took the edges between with
// it, and so did a `//` after a space inside a string: planting an edge at every
// statement start of every script, 88 of 16,289 positions in 11 scripts were not
// seen (2026-11-05). And a `//` that follows code with no space (`x();// see
// scripts/y.mjs`) was not stripped at all, so a comment became an edge (planted
// that way, 16,201 of the 16,289 positions read it as one), which is the quiet
// direction: an orphan reads as reachable. Nothing in the tree was changed by
// either: the edge sets of 169 scripts differ only by two self-edges, which
// reachability does not need. Only comments are blanked; the edges are IN the
// strings (`node scripts/x.mjs`), so those stay.
export const stripJsComments = blankComments

// A PATH FILTER NAMES A FILE, IT DOES NOT RUN IT (2026-11-28). `on.push.paths:` is the list of files whose change should START a workflow; `scripts/x.mjs` in it is a trigger, not an
// invocation. The scan below read the whole workflow text, so such an entry was an edge: with the `node scripts/x.mjs` line deleted from a workflow that kept `scripts/x.mjs` in its
// filter, the script still read as reachable, the guard stayed green, and the ledger did not demand its declaration back. Found while wiring scripts/mutate-uefa-fit.mjs into
// .github/workflows/uefa-fit-mutate.yml, whose own filter names the script; reproduced by deleting the run line (PASS 3/3). Measured the same day with a YAML parser over all 63 workflows:
// 234 mentions of a script, 231 in `run:` and 3 in a filter, no script named only in a filter, so the fix moves no script out of the reachable set and the ledger did not change.
//
// WHAT IS REMOVED: inside the workflow's top-level `on:` block, the VALUE of a `paths` or `paths-ignore` key, in these shapes: a block sequence (dashes at the key's indent or deeper, an item's
// deeper lines belonging to it), a flow sequence on one line or over several (brackets counted outside quotes and comments), a scalar, any of those starting on the line AFTER the key (the form
// Prettier writes for a long list), after an `&anchor`, a `!tag` or a verbatim `!<tag>`, and the same keys inside a flow-mapping `on: { ... }` (flow context is tracked by depth, not by where a
// line starts; there a quoted key may stand straight before its colon, `{"paths":[x]}`). A key is a key only when its colon ends it: `paths:x` is one plain scalar. Also dropped, and nothing
// else: a comment inside `on:` (it holds no shell text, so a ` #` there is always a YAML comment; that includes a comment on a block scalar's header line). Left whole, because they are not
// filters: a `paths:` key whose value is a MAPPING (an input of that name under `workflow_call`), the body of a block scalar (`|`, `>`) wherever it stands, and any `paths:` text outside
// `on:` (a heredoc in a `run:` block). Removing too much is the dangerous direction here (a real edge lost reads as an orphan), so each of those is a fixture below.
// A quote opens a quoted scalar only where a scalar can START (after `: `, `- `, `[`, `{`, `,`, `?` or at a line's start, an `&anchor` or `!tag` standing in between not counting): an
// apostrophe inside a plain scalar (`description: Don't run`) is text. In a single-quoted scalar `''` is an escaped apostrophe; in a double-quoted one a backslash escapes.
// A file is read with CR and CRLF line ends normalised and a leading BOM dropped. A trailing `#` comment OUTSIDE `on:` still reads as text.
// NOT covered, on purpose, each measured absent from the tree and each still reading as an edge or as text, or (the first three of the second line) losing an edge: an explicit key (`? paths`);
// a flow collection whose continuation lines start in column 0; a second YAML document in one file; a whole document indented; a quote character that begins a continuation line of a
// multi-line PLAIN scalar (read as the opening of a quoted scalar); a multi-line quoted scalar in a block list whose continuation lines are indented less than its dash; anchors and aliases
// (a filter list reused through `*alias`, an anchor defined in a filter and aliased elsewhere) and merge keys; a script named by a trailing `#` comment outside `on:`, or by an action input
// (`with: filters:` of a paths-filter step). The `on:` block is taken to end at the first column-0 line that is not a comment.
const FILTER_KEY = /(['"]?)(paths|paths-ignore)\1[ \t]*:/y
const PROP = String.raw`(?:&[^\s,[\]{}]*|!<[^>\s]*>|![^\s,[\]{}]*)`          // an anchor, a verbatim tag, a tag
const PROPERTIES = new RegExp(`(?:${PROP}[ \\t]*)+`, 'y')
const TRAILING_PROPS = new RegExp(`(?<![^\\s[{,:?])(?:${PROP}[ \\t]+)+$`)
const MAPPING_LINE = /^\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"[{][^#]*?)[ \t]*:(?=[ \t]|$)/
const lineStart = (s, i) => s.lastIndexOf('\n', i - 1) + 1
const lineEnd = (s, i) => { const e = s.indexOf('\n', i); return e < 0 ? s.length : e }
const indentOf = line => line.length - line.trimStart().length
const isBlankOrComment = line => line.trim() === '' || /^\s*#/.test(line)
/** Whether a scalar or a collection can START at `i`: the text before it on the line, once any `&anchor` or `!tag` is set aside, is empty or ends in `:`, `-` (a dash item), `[`, `{`, `,` or `?`. Only the last 256 characters of the line are looked at. */
function startsToken (s, i) {
  let before = s.slice(Math.max(0, i - 256), i)
  before = before.slice(before.lastIndexOf('\n') + 1).replace(TRAILING_PROPS, '').trimEnd()
  const last = before.at(-1)
  return before === '' || '[{,:?'.includes(last) || (last === '-' && (before.length === 1 || /\s/.test(before.at(-2))))
}
/** The index just after the quoted scalar that opens at `i`: a `"` ends at an unescaped `"` (a backslash escapes), a `'` at a lone `'` (`''` is an escaped apostrophe); an unclosed one runs to the end. */
function skipQuoted (s, i) {
  const q = s[i]
  for (let k = i + 1; k < s.length; k++) {
    if (q === '"' && s[k] === '\\') k++
    else if (s[k] === q) { if (q === "'" && s[k + 1] === "'") k++; else return k + 1 }
  }
  return s.length
}
/** The index just after the flow sequence that opens at `j` (a `[`): brackets are counted outside quotes and comments; unbalanced text runs to the end. */
function endOfFlowSequence (s, j) {
  let depth = 0
  for (let i = j; i < s.length; i++) {
    const c = s[i]
    if ((c === '"' || c === "'") && startsToken(s, i)) i = skipQuoted(s, i) - 1
    else if (c === '#' && /\s/.test(s[i - 1] ?? ' ')) i = lineEnd(s, i) - 1
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) return i + 1
  }
  return s.length
}
/** The index of the `,`, `}` or `]` that ends a plain or quoted scalar which starts at `j` inside a flow collection (outside quotes); the end of the text when none does. */
function endOfFlowScalar (s, j) {
  for (let i = j; i < s.length; i++) {
    const c = s[i]
    if ((c === '"' || c === "'") && startsToken(s, i)) i = skipQuoted(s, i) - 1
    else if (c === ',' || c === '}' || c === ']') return i
  }
  return s.length
}
/** The index at which the block sequence under a key at `keyIndent` ends, looking from the end of the key's line; `from` itself when no sequence follows (a mapping, or nothing). */
function endOfBlockSequence (s, from, keyIndent) {
  let dashIndent = null, consumedTo = from, p = from
  while (p < s.length) {
    const ls = p + 1, le = lineEnd(s, ls), line = s.slice(ls, le)
    p = le
    if (isBlankOrComment(line)) continue
    const indent = indentOf(line), dash = /^\s*-(\s|$)/.test(line)
    if (dashIndent === null) { if (dash && indent >= keyIndent) dashIndent = indent; else break }
    if ((dash && indent === dashIndent) || indent > dashIndent) consumedTo = le; else break
  }
  return consumedTo
}
/** Where the value of a block-context key at `keyIndent` ends when it starts on a LATER line (the key's line holds nothing but, perhaps, a comment); `from` when there is no filter value there. */
function endOfNextLineValue (s, from, keyIndent) {
  let p = from
  while (p < s.length) {
    const ls = p + 1, le = lineEnd(s, ls), line = s.slice(ls, le)
    p = le
    if (isBlankOrComment(line)) continue
    const indent = indentOf(line), text = line.trimStart()
    if (/^-(\s|$)/.test(text) && indent >= keyIndent) return endOfBlockSequence(s, from, keyIndent)
    if (indent <= keyIndent || text[0] === '{' || MAPPING_LINE.test(line)) return from       // nothing, or a mapping: not a filter
    if (text[0] === '[') return endOfFlowSequence(s, ls + indent)
    let end = le                                                                              // a scalar on its own line, and the lines indented deeper than the key
    for (let q = le; q < s.length;) {
      const ls2 = q + 1, le2 = lineEnd(s, ls2), line2 = s.slice(ls2, le2)
      q = le2
      if (line2.trim() === '') continue
      if (indentOf(line2) > keyIndent) end = le2; else break
    }
    return end
  }
  return from
}
function removeFilterValues (region) {
  let out = '', depth = 0                                                     // depth: the flow collections (`[`, `{`) open at the scan position
  for (let i = 0; i < region.length;) {
    const c = region[i]
    // a comment is dropped: the `on:` block holds no shell text, so a ` #` there is a YAML comment and never an edge (outside it, a trailing `#` can be part of a shell command and stays)
    if (c === '#' && (i === 0 || /\s/.test(region[i - 1]))) { i = lineEnd(region, i); continue }
    // a block scalar (`key: |`, `- >-`): its header line, but for a comment on it, and every deeper line are text, whatever they look like
    if ((c === '|' || c === '>') && startsToken(region, i) && /^[-+0-9]*[ \t]*(?:#.*)?$/.test(region.slice(i + 1, lineEnd(region, i)))) {
      const headerEnd = lineEnd(region, i), headerIndent = indentOf(region.slice(lineStart(region, i), headerEnd))
      let end = headerEnd
      for (let p = end; p < region.length;) {
        const ls = p + 1, le = lineEnd(region, ls), line = region.slice(ls, le)
        p = le
        if (line.trim() === '') continue
        if (indentOf(line) > headerIndent) end = le; else break
      }
      out += /^[|>][-+0-9]*/.exec(region.slice(i, headerEnd))[0] + region.slice(headerEnd, end); i = end; continue
    }
    if (i === 0 || /[\s{,]/.test(region[i - 1])) {
      FILTER_KEY.lastIndex = i
      const m = FILTER_KEY.exec(region)
      // the colon must end the key: `paths:x` is one plain scalar. In a flow collection a flow indicator may follow it (`{paths:[x]}`), and anything may when the key is quoted (`{'paths':'x'}`)
      if (m && (i + m[0].length >= region.length || ' \t\n'.includes(region[i + m[0].length]) || (depth > 0 && (m[1] !== '' || ',}][{'.includes(region[i + m[0].length]))))) {
        const keyEnd = i + m[0].length
        let j = keyEnd
        while (region[j] === ' ' || region[j] === '\t') j++
        PROPERTIES.lastIndex = j
        const props = PROPERTIES.exec(region)
        if (props) j += props[0].length
        if (region[j] === '[') { out += region.slice(i, keyEnd) + ' '; i = endOfFlowSequence(region, j); continue }
        // a MAPPING value is not a filter (an input called `paths` under `workflow_call`): the key is kept, the value is scanned like any other text
        if (region[j] === '{') { out += region.slice(i, keyEnd); i = keyEnd; continue }
        if (depth > 0) { out += region.slice(i, keyEnd) + ' '; i = endOfFlowScalar(region, j); continue }
        const eol = lineEnd(region, j), rest = region.slice(j, eol), keyIndent = i - lineStart(region, i)
        if (rest === '' || rest[0] === '#') { out += region.slice(i, keyEnd) + ' '; i = endOfNextLineValue(region, eol, keyIndent); continue }
        // a scalar on the key's line: it and the lines indented deeper than the key
        let end = eol
        for (let p = eol; p < region.length;) {
          const ls = p + 1, le = lineEnd(region, ls), line = region.slice(ls, le)
          p = le
          if (line.trim() === '') continue
          if (indentOf(line) > keyIndent) end = le; else break
        }
        out += region.slice(i, keyEnd) + ' '; i = end; continue
      }
    }
    if ((c === '"' || c === "'") && startsToken(region, i)) { const end = skipQuoted(region, i); out += region.slice(i, end); i = end; continue }
    if ((c === '[' || c === '{') && startsToken(region, i)) depth++
    else if ((c === ']' || c === '}') && depth > 0) depth--
    out += c; i++
  }
  return out
}
/** CR and CRLF line ends become LF and a leading BOM goes: the text is read as lines. */
const normalizeText = t => String(t).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
/** A workflow file's text without the values of its `on:` path filters (see above). A file with no top-level `on:` block comes back unchanged (normalised). */
export function stripPathFilters (text) {
  const lines = normalizeText(text).split('\n')
  const start = lines.findIndex(l => /^(?:on|"on"|'on')[ \t]*:/.test(l))
  if (start < 0) return lines.join('\n')
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) if (/^\S/.test(lines[i]) && lines[i][0] !== '#') { end = i; break }
  return [...lines.slice(0, start), removeFilterValues(lines.slice(start, end).join('\n')), ...lines.slice(end)].join('\n')
}
/** Whole-line comments are dropped. Only whole-line ones: a trailing `#` inside a `run:` block can be part of a shell command, and stripping those would stop seeing real invocations. */
export const stripYamlComments = t => t.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
/** The text the workflow scan reads: every file, normalised, its whole-line comments dropped, its path-filter values dropped, then joined. */
export const workflowText = texts => texts.map(t => stripPathFilters(stripYamlComments(normalizeText(t)))).join('\n')

/**
 * Every scripts/*.mjs reachable from a set of npm script names, one hop at a
 * time through package.json.
 *
 * Extracted from the main block on 2026-10-09 so the lifecycle rule below can
 * be self-tested; it was inline and therefore unprovable.
 *
 * NPM LIFECYCLE SCRIPTS ARE REACHED WITHOUT BEING NAMED. npm runs `prebuild`
 * before `build` and `postbuild` after it, and nothing in any workflow or in
 * `build`'s own command refers to either — so a `pre*` script was invisible to
 * this walk and read as an orphan while npm ran it on every build. Found by
 * adding a `prebuild`: the checker called scripts/session-ready-check.mjs
 * unreachable while `npm run build` was printing its output two lines up. That
 * is this file's own failure mode — a detector whose name and measurement
 * disagree — for the fifth recorded time.
 */
export function reachableFiles (scripts, entryNames) {
  const reached = new Set()
  const seen = new Set()
  const walk = name => {
    if (seen.has(name) || !(name in scripts)) return
    seen.add(name)
    for (const f of scriptFiles(scripts[name])) reached.add(f)
    for (const n of npmRunNames(scripts[name])) walk(n)
    for (const n of [`pre${name}`, `post${name}`]) walk(n)
  }
  for (const n of entryNames) walk(n)
  return reached
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const T = (l, ok) => check(l, ok)
  T('npm run names are extracted', npmRunNames('run: npm run check:sports\n npm run check').join(',') === 'check:sports,check')
  T('a whole-line YAML comment is not code',
    npmRunNames(stripYamlComments(['  # does `npm run X` resolve?', '  run: npm run check:real'].join('\n'))).join(',') === 'check:real')
  T('a flag is not mistaken for the script name',
    npmRunNames('npm run --silent check:staged-outbox').join(',') === 'check:staged-outbox')
  T('a script path is extracted from a command', scriptFiles('node scripts/a-b.mjs && node scripts/c.mjs').join(',') === 'a-b.mjs,c.mjs')
  T('a command naming no script yields none', scriptFiles('dotnet fable src/X.fsproj').length === 0)
  T('a script named in a JS comment is not an edge',
    scriptFiles(stripJsComments("// found by scripts/probe.mjs\nrun('node scripts/real.mjs')")).join(',') === 'real.mjs')
  T('a URL survives comment-stripping',
    stripJsComments("const u = 'https://x.dev/a'").includes('https://x.dev/a'))
  // What a comment is was decided by a regular expression over the whole text and another per line, until 2026-11-05. Each fixture is a whole file with ONE real edge in it (`real.mjs`) placed
  // where the old stripper lost it, or with a comment that names a script (`ghost.mjs`) where it kept it. RULE 91: these are fixtures, not the tree (the live half reads the tree).
  const lost = [
    ["const a = glob.endsWith('/**')\nrun('node scripts/real.mjs')\nconst b = glob.startsWith('**/*.')\n", 'a glob string that opens a block comment, and a later one that closes it'],
    ["// matches src/*.js and nothing else\nrun('node scripts/real.mjs')\n/** doc */\n", 'a line comment that holds a /*, and a doc comment that closes later'],
    ["const base = ' //cdn.example'; run('node scripts/real.mjs')\n", 'a // after a space, inside a string'],
  ]
  const unseen = lost.filter(([src]) => scriptFiles(stripJsComments(src)).join() !== 'real.mjs')
  check(`AN EDGE IS STILL SEEN AFTER EACH CONSTRUCT THAT LOST THE OLD STRIPPER ITS PLACE (${lost.length} fixtures)`,
    unseen.length === 0, `${unseen.length} of ${lost.length} not seen: ${JSON.stringify(unseen.map(f => f[1]))}`)
  const kept = ["run('node scripts/real.mjs');// see scripts/ghost.mjs\n", "run('node scripts/real.mjs') /* see scripts/ghost.mjs */\n", "/* one\n   see scripts/ghost.mjs\n*/\nrun('node scripts/real.mjs')\n"]
  const ghosts = kept.filter(src => scriptFiles(stripJsComments(src)).join() !== 'real.mjs')
  check(`A SCRIPT NAMED IN A COMMENT IS NOT AN EDGE, whatever stands before the comment, on one line or several (${kept.length} fixtures)`,
    ghosts.length === 0, `${ghosts.length} of ${kept.length} read a comment as an edge: ${JSON.stringify(ghosts.map(src => scriptFiles(stripJsComments(src))))}`)
  check('a string that merely BEGINS with // or /* is a string, not a comment: the edge in it stays',
    scriptFiles(stripJsComments("run('//scripts/real.mjs')")).join() === 'real.mjs' &&
    scriptFiles(stripJsComments("run('/*scripts/real.mjs')")).join() === 'real.mjs')
  check('an edge inside a template literal stays: only comments are blanked',
    scriptFiles(stripJsComments('run(`node scripts/real.mjs ${x}`)')).join() === 'real.mjs')
  // The clobber, as a fixture: the KEY survives, the FILE it named does not.
  const before = { 'check:sports': 'node scripts/sport-registry-check.mjs' }
  // The name is NOT the real browser script that the incident named (scripts/render-check.mjs): scripts/check-browser-gate.py reads a script that spawns a process (this file does, in
  // the tree rows below) and names a browser script as a SPAWNER of it, and then demands a browser guard on the verify step that runs this file. 2026-11-28, found by review.
  const after  = { 'check:sports': "URL='x' node scripts/fixture-sports-check.mjs" }
  const reach = s => new Set(Object.values(s).flatMap(scriptFiles))
  T('THE CLOBBER IS DETECTED: a file reachable before is unreachable after',
    reach(before).has('sport-registry-check.mjs') && !reach(after).has('sport-registry-check.mjs'))
  T('...and the forward direction alone would NOT have caught it',
    'check:sports' in before && 'check:sports' in after,
    'the key survived, so every npm run still resolved')
  // THE LIFECYCLE RULE, which was inline and unprovable until this commit.
  const lc = { build: 'node scripts/build-site.mjs', prebuild: 'node scripts/ready.mjs',
               postbuild: 'node scripts/after.mjs' }
  const lcReached = reachableFiles(lc, ['build'])
  T('A `prebuild` IS REACHABLE WHENEVER `build` IS, though nothing names it',
    lcReached.has('ready.mjs'),
    'npm runs prebuild before build; a walk that only follows named invocations calls it an orphan')
  T('...and so is a `postbuild`', lcReached.has('after.mjs'))
  T('the entry script itself is still reached', lcReached.has('build-site.mjs'))
  T('a lifecycle name with no script does not invent an edge',
    reachableFiles({ build: 'node scripts/build-site.mjs' }, ['build']).size === 1)
  T('the walk terminates on a self-referential lifecycle name',
    reachableFiles({ prebuild: 'npm run prebuild && node scripts/x.mjs' }, ['prebuild']).has('x.mjs'),
    'prebuild naming itself must not loop forever')

  // A PATH FILTER IS NOT AN EDGE (2026-11-28). Each fixture is a whole workflow file with its expected edge set written next to it. `fixture-run.mjs` is invoked by a `run:` line in every one
  // of them; `fixture-filtered.mjs` and `fixture-two.mjs` are named where the scan must NOT read them (a filter) or where it must (the `staysAnEdge` and `mixed` groups); `fixture-sibling.mjs`
  // is a real edge that stands NEXT TO a filter, because removing too much is the dangerous direction. RULE 91: these are fixtures, not the tree; the last rows run the real main block.
  const JOBS = 'jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/fixture-run.mjs\n'
  const edgesOf = (...files) => [...new Set(scriptFiles(workflowText(files)))].sort().join(',')
  const F = 'scripts/fixture-filtered.mjs', F2 = 'scripts/fixture-two.mjs', G = 'scripts/fixture-sibling.mjs'
  const RUN = 'fixture-run.mjs', RUN_G = 'fixture-run.mjs,fixture-sibling.mjs', RUN_F = 'fixture-filtered.mjs,fixture-run.mjs', RUN_F_G = 'fixture-filtered.mjs,fixture-run.mjs,fixture-sibling.mjs'
  const dropped = [
    [`on:\n  push:\n    paths:\n      - '${F}'\n      - "${F2}"\n${JOBS}`, RUN, 'a block list, quoted items'],
    [`on:\n  push:\n    paths-ignore:\n      - ${F}\n${JOBS}`, RUN, 'paths-ignore, an unquoted item'],
    [`on:\n  push:\n    paths:\n    - '${F}'\n    branches: [${G}]\n${JOBS}`, RUN_G, 'dashes at the key\'s own indent, with a sibling edge after'],
    [`on:\n  push:\n    paths:\n      - '${F}'  # why\n      - >\n        ${F2}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'an item with a trailing comment, and an item with a deeper continuation line'],
    [`on:\n  push:\n    paths: ['${F}', "${F2}"]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list on one line'],
    [`on:\n  push:\n    paths: [\n      'src/[ab].fs',\n      'x]y/z',\n      '${F}',  # a ] in a comment\n      "${F2}"\n    ]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list over several lines, with an unbalanced ] in a quoted glob and a ] in a comment'],
    [`on:\n  push:\n    paths: ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar, with a sibling edge after'],
    [`on:\n  push:\n    'paths':\n      - ${F}\n${JOBS}`, RUN, 'a quoted key'],
    [`on: { push: { paths: ['${F}'], branches: [main] } }\n${JOBS}`, RUN, 'a flow-mapping `on:`'],
    [`on:\n  push:\n    paths:\n      - ${F}\n  pull_request:\n    paths-ignore: [${F2}]\n${JOBS}`, RUN, 'two events, a block list and a flow list'],
    [`on:\r\n  push:\r\n    paths:\r\n      - '${F}'\r\n${JOBS.replace(/\n/g, '\r\n')}`, RUN, 'CRLF line ends'],
    [`on:\r  push:\r    paths:\r      - '${F}'\r${JOBS.replace(/\n/g, '\r')}`, RUN, 'CR line ends'],
    [`\uFEFFon:\n  push:\n    paths: [${F}]\n${JOBS}`, RUN, 'a byte order mark before on:'],
    [`on:\n  push:\n    paths: ['${F}']  # ${F2}\n${JOBS}`, RUN, 'a comment that ends the line of a one-line flow list'],
    [`on:\n  push:\n    paths: >\n      ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a block scalar value, with a sibling edge after'],
    [`on:\n  push:\n    paths:\n      - ${F}\n\n      - ${F2}\n${JOBS}`, RUN, 'a blank line between items'],
    [`on:\n  push:\n    paths:\n      - ${F}\n   \n      - ${F2}\n${JOBS}`, RUN, 'a line of spaces between items'],
    [`on:\r\n  push:\r\n    paths:\r\n      - ${F}\r\n\r\n      - ${F2}\r\n${JOBS}`, RUN, 'a blank line between items, CRLF'],
    [`on: {push: {paths: ['${F}'],paths-ignore: ['${F2}']}}\n${JOBS}`, RUN, 'a flow mapping with no spaces: a key straight after { and after ,'],
    [`on:\n  push:\n    paths:\n      [\n        "${F}",\n        "docs/**",\n      ]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list that starts on the line AFTER the key (what Prettier writes)'],
    [`on:\n  push:\n    paths:\n      ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the line after the key'],
    [`on:\n  push:\n    paths: # why\n      [${F}]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list on the line after a key that carries a comment'],
    [`on:\n  push:\n    paths: &p\n    - ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'an anchored key, dashes at the key\'s indent'],
    [`on:\n  push:\n    paths: !!seq\n    - ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a tagged key, dashes at the key\'s indent'],
    [`on:\n  push:\n    paths: # why\n    - ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a comment on the key\'s line, dashes at the key\'s indent'],
    [`on:\n  push:\n    paths :\n      - ${F}\n${JOBS}`, RUN, 'a space before the colon'],
    [`on:\n  push:\n    paths:\n      -\n        ${F}\n      - ${F2}\n${JOBS}`, RUN, 'a bare dash with its value on the next line'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: Don't run twice\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'an apostrophe in a plain scalar BEFORE the filter'],
    [`on:\n  push:\n    paths: [it's, docs/**]\n  workflow_dispatch:\n    inputs:\n      script:\n        type: choice\n        options:\n          - ${G}\n${JOBS}`, RUN_G, 'an apostrophe in a plain flow item: the edge after it is not lost'],
    [`on:\n  push:\n    branches: ['main', "dev"]\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'single- and double-quoted strings BEFORE a filter'],
    [`on:\n  push:\n    branches: [main]  # don't\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a trailing comment with an apostrophe before a filter'],
    [`on:\n  push:\n    paths: ["a\\"b", "${F}"]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a backslash-escaped quote in a double-quoted flow item'],
    [`on: { push: { paths: "${F},x", branches: [${G}] } }\n${JOBS}`, RUN_G, 'a quoted scalar with a comma, in a flow mapping'],
    [`on: { push: { paths: ${F}, branches: [${G}] } }\n${JOBS}`, RUN_G, 'a plain scalar in a flow mapping, a sibling edge after it'],
    [`'on':\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, "a single-quoted 'on' key"],
    [`"on":\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a double-quoted "on" key'],
    [`${JOBS}on:\n  push:\n    paths:\n      - ${F}`, RUN, 'on: AFTER jobs, as the last line, with no newline'],
    [`${JOBS}on:\n  push:\n    paths: ${F}`, RUN, 'a scalar on the key line, at the end of the file with no newline'],
    [`${JOBS}on:\n  push:\n    paths:\n      ${F}`, RUN, 'a scalar on the line after the key, at the end of the file with no newline'],
    [`on:\n  push:\n    paths:\n      - ${F}\n    branches:\n      - ${G}\n${JOBS}`, RUN_G, 'a block list, then a sibling block list naming a real script at the same indent'],
    [`on:\n  push:\n    paths: ${F}\n    branches: [main]\n  workflow_dispatch:\n    inputs:\n      script:\n        type: choice\n        options:\n          - ${G}\n${JOBS}`, RUN_G, 'a scalar, then a sibling, then deeper lines that name a real script'],
    [`on:\n  push:\n    paths:\n      ${F}\n    branches: [main]\n  workflow_dispatch:\n    inputs:\n      script:\n        type: choice\n        options:\n          - ${G}\n${JOBS}`, RUN_G, 'a scalar on the next line, then a sibling, then deeper lines that name a real script'],
    [`on:\n  push:\n    paths:\n      ${F}\n        and more of it\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the next line with a deeper continuation line'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: |\n          run it\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a block scalar, then a filter at a lower indent than the block scalar\'s key'],
    [`on:\n  x: |\n    body\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a block scalar at a shallow indent, then a filter on deeper lines'],
    [`on:\n  push:\n    branches: ['main', "dev"]\n    paths:\n      - ${F}\n    tags: [${G}]\n${JOBS}`, RUN_G, 'quoted strings before a filter, and a real edge in a sibling after it'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        default: |\n          body text\n      y:\n        default: ${G}\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'a block scalar, then an input default naming a real script, then a filter'],
    [`on: { push: { paths: ['docs/**', '${F}'], branches: [main] } }\n${JOBS}`, RUN, 'a flow list of several items inside a flow mapping'],
    [`on:\n  push:\n    paths:\n      - ${F2}\n      - ${F}  # why\n${JOBS}`, RUN, 'the LAST item of a block list carries a trailing comment'],
    [`on:\n  push:\n    paths: ['a]b', '${F}']\n${JOBS}`, RUN, 'the FIRST item of a flow list is a quoted string holding a ]'],
    [`on:\n  push:\n    paths: [a, 'x]y', '${F}']\n${JOBS}`, RUN, 'a quoted string holding a ] straight after a comma'],
    [`on :\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a space before the colon of on'],
    [`on:\n  push:\n    paths:\n      ${F}\n\n        ${F2}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the next line, a blank line, then a continuation line that names a script'],
    [`on:\n  push:\n    paths: ${F}\n\n      ${F2}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the key line, a blank line, then a continuation line that names a script'],
    [`on: { push: { paths: "x,${F}", branches: [${G}] } }\n${JOBS}`, RUN_G, 'a comma INSIDE a quoted scalar in a flow mapping, a script after it'],
    [`on: { push: { paths: "a\\",${F}", branches: [${G}] } }\n${JOBS}`, RUN_G, 'an escaped quote, then a comma, inside a quoted scalar in a flow mapping'],
    [`on:\n  push:\n    paths: [a#b, '${F}']\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a # glued inside a filter\'s own flow list is not a comment'],
    [`on:\n  push:\n    branches: [main]  # why\n    tags: [${G}]\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'a real edge in a sibling AFTER a trailing comment'],
    [`on: # ${F2}\n  push: # ${F2}\n    branches: [main] # ${F2}\n    paths: # ${F2}\n      - ${F}\n${JOBS}`, RUN, 'trailing comments naming a script on the lines of the on: block'],
    [`# ${F2}\ron:\r  push:\r    paths:\r      - ${F}\r${JOBS.replace(/\n/g, '\r')}`, RUN, 'CR line ends and a comment on the first line'],
    [`on: {\n  push: {\n    paths: ['${F}'], branches: [${G}]\n  }\n}\n${JOBS}`, RUN_G, 'a flow mapping over several lines, the filter key first on its line, a sibling edge after it on the same line'],
    [`on:\n  push:\n    paths: ['${F}'\n${JOBS}`, RUN, 'a flow list that is never closed'],
    [`on: { push: { paths: ${F}\n${JOBS}`, RUN, 'a flow mapping whose scalar is never closed'],
    [`on:\n  push:\n    paths:\n\n      [${F}]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list on the next line but one'],
    [`on:\n  push:\n    paths:\n\n      ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the next line but one'],
    [`on:\n  push:\n    paths:\n      ${F}\n\n        more\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the next line, a blank line, then a deeper continuation line'],
    [`on:\n  push:\n    paths: ["a\\"]b", '${F}']\n${JOBS}`, RUN, 'an escaped quote, then a ], inside a double-quoted flow item'],
    [`on:\n  push:\n    paths:\n    branches: [${G}]\n${JOBS}`, RUN_G, 'paths: null, then a sibling at the key\'s own indent'],
    [`on:\n  push:\n    x: |\n      body\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a block scalar, then a filter at the SAME indent as the block scalar\'s key'],
    // review round 2 (2026-11-28): a doubled apostrophe is an escape, not the end of a quoted scalar
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: 'don''t # see ${G}'\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, "a '' escape, then ' #' and a script, in a quoted description: the quote is still open, so the name is text (and so an edge)"],
    [`on:\n  push:\n    paths: ['it''s # ${F2}', '${F}']\n    branches: [${G}]\n${JOBS}`, RUN_G, "a '' escape, then ' #', inside a quoted flow-list item: the closing ] is not swallowed"],
    [`on: { push: { paths: 'it''s # x, ${F}', branches: [${G}] } }\n${JOBS}`, RUN_G, "a '' escape, ' #' and a comma, inside a quoted scalar in a flow mapping"],
    [`on:\n  push:\n    paths: ['a''b', '${F}']\n    branches: [${G}]\n${JOBS}`, RUN_G, "a '' escape in the first item of a flow list"],
    // an anchor, a tag or a verbatim tag in front of a quoted scalar or a block scalar does not stop it from being one
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: !!str "x # ${G}"\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'a tagged double-quoted description holding " #" and a script'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: &d 'x # ${G}'\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, "an anchored single-quoted description holding ' #' and a script"],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: !<tag:yaml.org,2002:str> "x # ${G}"\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'a verbatim-tagged description holding " #" and a script'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        default: !!str |\n          paths:\n            - ${F2}\n  push:\n    paths:\n      - ${F}\n${JOBS}`, 'fixture-run.mjs,fixture-two.mjs', 'a tagged block scalar whose body holds paths: lines is text (the name in it stays an edge), and the filter after it is dropped'],
    [`on:\n  push:\n    paths: !<tag:yaml.org,2002:seq>\n    - ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a verbatim tag on the key, dashes at the key\'s indent'],
    // paths: glued to following text is a plain scalar, not a key
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: see paths:${G}\n        type: string\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'paths: glued to text in a plain scalar before a filter: the text is not a key, the filter after it is still dropped'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: update paths:x\n      script:\n        type: choice\n        options:\n          - ${G}\n${JOBS}`, RUN_G, 'paths: glued to text in a plain scalar: the edge after it is not lost'],
    // a block scalar header may carry a comment, which is a comment; the body is text
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: | # ${F2}\n          body ${G}\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'a comment on a block scalar header (not an edge) and a body line that names a script (an edge)'],
    // flow context, decided by depth and not by whether the key starts its line
    [`on: {\n  push: {\n    paths: ${F}, branches: [${G}]\n  },\n  workflow_call: { inputs: { x: { default: ${F2} } } }\n}\n${JOBS}`, 'fixture-run.mjs,fixture-sibling.mjs,fixture-two.mjs', 'a flow mapping over several lines: a scalar filter first on its line, a sibling after it on the line, an input default on a later line'],
    [`on: {"push":{"paths":["${F}"],"branches":["${G}"]}}\n${JOBS}`, RUN_G, 'JSON style: quoted keys straight before their colons'],
    [`on: {'push':{'paths':'${F}','branches':['${G}']}}\n${JOBS}`, RUN_G, "single-quoted keys and a single-quoted scalar straight after the colon"],
    [`on: {push: {paths:[${F}], branches: [${G}]}}\n${JOBS}`, RUN_G, 'a flow list straight after the colon of an unquoted key in a flow mapping'],
    [`on:\n  push:\n    branches: [a, paths: ]\n    paths:\n      - ${F}\n    tags: [${G}]\n${JOBS}`, RUN_G, 'a null-valued paths: key inside a flow sequence ends at the ], and the block filter after it is still read as block context'],
    // round 2, from the survivors of the mutation sweep (outbox/orphan-paths-mutant-sweep-2026-11-28.txt): each row is a shape that made a one-character change to the reader read a different edge set
    [`on:\n  push:\n    paths:\n      [ "a: b", '${F}' ]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list on the line after the key whose first line holds ": " inside a quoted item (not a mapping line)'],
    [`on:\n  push:\n    paths:\n      [ 'a - b', '${F}' ]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a flow list on the line after the key whose first line holds " - " inside a quoted item (not a block list)'],
    [`on:\n  push:\n    paths: [${F}, # why\n      'x:y #c' ]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a quoted item that starts a line after a comment line, and holds " #"'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: x-'y # ${G}\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, "an apostrophe glued after a hyphen in a plain scalar is text: the ' #' after it is a comment"],
    [`on:\n  push:\n    paths: ["a\\"", '${F}']\n    branches: [${G}]\n${JOBS}`, RUN_G, 'an escaped quote straight before the closing quote of a double-quoted flow item'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: 'don'''\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, "a '' escape straight before the closing quote of a single-quoted scalar"],
    [`on:\n  schedule:\n    - cron: '''0 7 * * *'''\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, "a single-quoted scalar that starts and ends with a '' escape"],
    [`on:\n  push:\n    paths: ['${F}', 'a:']\n    paths-ignore: ['${F2}']\n    branches: [${G}]\n${JOBS}`, RUN_G, 'the last item of a flow list is a quoted scalar ending in a colon, and a second filter follows'],
    [`on: { push: { paths: , branches: [${G}] } }\n${JOBS}`, RUN_G, 'a null filter value in a flow mapping, then a comma'],
    [`on: { push: { paths-ignore:, tags: [${G}] } }\n${JOBS}`, RUN_G, 'a null filter value straight before a comma in a flow mapping'],
    [`on:\n  push: { 'paths-ignore': }\n  workflow_call:\n    inputs:\n      x:\n        default: ${G}\n${JOBS}`, RUN_G, 'a null filter value straight before the } that closes the flow mapping'],
    [`on:\n  push:\n    paths:\n${JOBS}`, RUN, 'paths: null as the last line of the on: block'],
    [`on:\n  push:\n    branches: [main] #see ${F2}\n    tags: [${G}]\n${JOBS}`, RUN_G, 'a comment whose # is followed straight by a letter'],
    [`on:\n  push:\n    paths: >- # c ${F2}\n      [x] ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a block scalar value with a header comment whose body starts with ['],
    [`on: {"schedule":[{"cron":"0 7 * * *"}],"push":{"paths":["${F}","${F2}"]}}\n${JOBS}`, RUN, 'JSON style: a nested flow collection closes, then a filter with quoted keys'],
    [`on:\n  push:\n    paths:   \n    - ${F}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'trailing spaces after the key\'s colon, dashes at the key\'s indent'],
    [`on:\n  push:\n    paths:\n      ${F}\n  \n        ${F2}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the next line, a line of spaces SHALLOWER than the key, then a continuation line that names a script'],
    [`on:\n  push:\n    paths: ${F}\n  \n      ${F2}\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a scalar on the key line, a line of spaces shallower than the key, then a continuation line that names a script'],
    [`on:\n  push:\n    paths: [${F}, #c ]\n      ${F2}]\n    branches: [${G}]\n${JOBS}`, RUN_G, 'a comment whose # is followed straight by a letter and holds a ], inside a flow list'],
    [`on:\n  push:\n    paths:\n    - ${F}\n    description: a - ${G}\n${JOBS}`, RUN_G, 'dashes at the key\'s indent, then a sibling key whose text holds " - "'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: a}b\n  push: { paths: ${F}, branches: [${G}] }\n${JOBS}`, RUN_G, 'a stray } in a plain scalar does not unbalance the flow mapping that follows it'],
    // where a quote can open: straight after `{`, after `,` and after the `?` of an explicit key (each holds ' #' and a script, then a filter follows)
    [`on: { workflow_call: {"x # ${G}": 1}, push: { paths: [${F}] } }\n${JOBS}`, RUN_G, 'a quoted key straight after {'],
    [`on: { workflow_call: {a: 1,"x # ${G}": 2}, push: { paths: [${F}] } }\n${JOBS}`, RUN_G, 'a quoted key straight after a comma'],
    [`on:\n  workflow_call:\n    inputs:\n      ? "x # ${G}"\n      : { type: string }\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_G, 'a quoted explicit key straight after ?'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: 'C:\\tmp\\'\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN, 'a backslash before the closing quote of a single-quoted scalar does not escape it'],
  ]
  const staysAnEdge = [
    [`on:\n  workflow_call:\n    inputs:\n      paths:\n        description: x\n        default: ${F}\n${JOBS}`, RUN_F, 'an INPUT called paths, a mapping, whose default feeds a run'],
    [`on:\n  workflow_call:\n    inputs:\n      paths: { default: '${F}' }\n${JOBS}`, RUN_F, 'an input called paths written as a flow mapping'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths: !!map\n        default: ${F}\n${JOBS}`, RUN_F, 'an input called paths, tagged !!map'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths: &m\n        default: ${F}\n${JOBS}`, RUN_F, 'an input called paths, anchored'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths:\n        description: x\n      script:\n        type: choice\n        options:\n          - ${G}\n${JOBS}`, RUN_G, 'a choice input after a mapping-valued paths:'],
    [`on:\n  push:\n    branches: [main]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          cat <<EOF\n          paths:\n            - ${F}\n          EOF\n          node scripts/fixture-run.mjs\n`, RUN_F, 'a paths: heredoc in a run: block, outside on:'],
    [`on:\n  push:\n    not-paths:\n      - ${F}\n${JOBS}`, RUN_F, 'a key that merely ends in paths'],
    [`on:\n  push:\n    not-paths:\n          - ${F}\n${JOBS}`, RUN_F, 'a key that merely ends in paths, its list indented deeper than the column of the word paths inside the key'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      note:\n        description: 'set paths: [${F}]'\n${JOBS}`, RUN_F, 'text inside a single-quoted string that looks like a filter'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      note:\n        description: "set paths: [${F}]"\n${JOBS}`, RUN_F, 'text inside a double-quoted string that looks like a filter'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        default: |\n          paths:\n            - ${F}\n${JOBS}`, RUN_F, 'a paths: line inside a block scalar body in on:'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: >-\n          it's paths: [${F}]\n${JOBS}`, RUN_F, 'a block scalar body that holds an apostrophe and filter-looking text'],
    [`on: { push: { branches: [main] } }\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: some/action\n        with:\n          paths: ${F}\n      - run: node scripts/fixture-run.mjs\n`, RUN_F, 'a one-line on:, then a paths: input of an action under jobs'],
    [`on:\n  push:\n    branches: [main]\nenv: { X: ${F} }\n${JOBS}`, RUN_F, 'a top-level key straight after the on: block'],
    [`on:\n  push:\n    branches: [main]\n# a comment in column 0\nenv: { X: ${F} }\n${JOBS}`, RUN_F, 'a comment line in column 0 after the on: block, then a top-level key'],
    [`jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: some/action\n        with:\n          paths: ${F}\n      - run: node scripts/fixture-run.mjs\non:\n  push:\n    branches: [main]\n`, RUN_F, 'on: AFTER jobs: text before it is not touched'],
    [`on:\n  push:\n    branches: [main]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: some/action\n        with:\n          paths: ${F}\n      - run: node scripts/fixture-run.mjs\n`, RUN_F, 'a paths: input of an action, under jobs'],
    [`on:\n  push:\n    branches: [main]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: some/action\n        with:\n          paths: ${F}\n      - run: node scripts/fixture-run.mjs\npermissions: {}\n`, RUN_F, 'a paths: input of an action under jobs, and a top-level key after jobs'],
    [`jobs:\n  j:\n    steps:\n      - run: node scripts/fixture-run.mjs\n      - uses: some/action\n        with:\n          paths: ${F}`, RUN_F, 'no on: block, and a paths: input on the last line with no newline'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths:\n        type: choice\n        options:\n          - ${F}\n${JOBS}`, RUN_F, 'an input NAMED paths whose mapping holds an options list'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths:\n        description: a - b\n        default: ${F}\n${JOBS}`, RUN_F, 'an input named paths whose first line holds a " - " inside its text'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths:\n        { default: ${F} }\n${JOBS}`, RUN_F, 'an input named paths whose flow mapping starts on the next line'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths:\n        "type": choice\n        default: ${F}\n${JOBS}`, RUN_F, 'an input named paths whose first line has a double-quoted key'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      paths:\n        'type': choice\n        default: ${F}\n${JOBS}`, RUN_F, 'an input named paths whose first line has a single-quoted key'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      script:\n        type: choice\n        options:\n          - 'set paths: [${F}]'\n${JOBS}`, RUN_F, 'a quoted option after a dash that looks like a filter'],
    [`on:\n  push:\n    branches: [a, 'paths: [${F}]']\n${JOBS}`, RUN_F, 'a quoted flow item after a comma that looks like a filter'],
    [`on:\n  push:\n    branches: ['paths: [${F}]']\n${JOBS}`, RUN_F, 'a quoted flow item right after the [ that looks like a filter'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      note:\n        description: "say \\"hi\\" paths: [${F}]"\n${JOBS}`, RUN_F, 'escaped quotes inside a double-quoted string that looks like a filter'],
    [`on:\n  push:\n    branches: [a#b, ${G}]\n${JOBS}`, RUN_G, 'a # glued inside a plain flow item is not a comment'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        default: |\n          first\n\n          paths:\n            - ${F}\n${JOBS}`, RUN_F, 'a block scalar body with a blank line before the filter-looking text'],
    [`on: { workflow_call: { inputs: { paths: &m { default: '${F}' } } } }\n${JOBS}`, RUN_F, 'an input called paths, anchored, written as a flow mapping'],
    [`on: { workflow_call: { inputs: { paths: !!map { default: '${F}' } } } }\n${JOBS}`, RUN_F, 'an input called paths, tagged, written as a flow mapping'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: update paths:${F}\n${JOBS}`, RUN_F, 'paths: glued to text in a plain scalar is text'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: !!str |\n          see paths: [${F}]\n${JOBS}`, RUN_F, 'a tagged block scalar body holding filter-looking text'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: &d >-\n          see paths: [${F}]\n${JOBS}`, RUN_F, 'an anchored block scalar body holding filter-looking text'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: |2 # c\n            body ${F}\n${JOBS}`, RUN_F, 'a block scalar header with an indentation indicator and a comment: the body is text'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: "a\n          multi-line paths: [${F}]"\n${JOBS}`, RUN_F, 'a multi-line double-quoted description holding filter-looking text'],
    [`on:\n  workflow_call:\n    outputs:\n      "paths":\n        'description' : ${F}\n${JOBS}`, RUN_F, 'an output called paths whose first key is quoted and has a space before its colon'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        default: |- # c\n          paths: [${F}]\n${JOBS}`, RUN_F, 'a block scalar whose header has a comment after two characters: the body holding paths: is text'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        default: |\n          first\n  \n          paths:\n            - ${F}\n${JOBS}`, RUN_F, 'a block scalar body with a line of spaces SHALLOWER than the body before the filter-looking text'],
    [`on:\n  workflow_call:\n    inputs:\n      x:\n        description: update paths:[${F}]\n${JOBS}`, RUN_F, 'paths: glued to a [ in a plain scalar in block context is text'],
    [`on: { workflow_call: { inputs: { x: { default: see paths:${F} } } } }\n${JOBS}`, RUN_F, 'paths: glued to text in a plain scalar inside a flow mapping is text'],
    [`on:\n  workflow_dispatch:\n    inputs:\n      who:\n        description: 'oops\n  push:\n    paths:\n      - ${F}\n${JOBS}`, RUN_F, 'a single-quoted scalar that is never closed runs to the end of the block, and the scan still ends (not valid YAML)'],
  ]
  // A filter AND a real edge in the same text: what stands after the filter must survive it.
  const mixed = [
    [`on: { push: { paths: ${F} }, workflow_call: { inputs: { x: { default: ${F2} } } } }\n${JOBS}`, 'fixture-run.mjs,fixture-two.mjs', 'a scalar filter inside a flow mapping, with an input default after it on the same line'],
    [`on: { push: { paths: ['${F}'], branches: [main] }, workflow_call: { inputs: { x: { default: ${F2} } } } }\n${JOBS}`, 'fixture-run.mjs,fixture-two.mjs', 'a flow-list filter inside a flow mapping, with an input default after it on the same line'],
  ]
  const wrong = (group) => group.filter(([f, want]) => edgesOf(f) !== want)
  const show = (group) => JSON.stringify(wrong(group).map(([f, want, why]) => [why, edgesOf(f), want]))
  check(`A SCRIPT NAMED IN A PATH FILTER IS NOT AN EDGE, in each shape listed in the block above FILTER_KEY, and the edges beside it survive (${dropped.length} fixtures)`, wrong(dropped).length === 0,
    `${wrong(dropped).length} differ (why, got, want): ${show(dropped)}`)
  check(`...AND A NAME THAT IS NOT A FILTER STAYS AN EDGE: a mapping-valued paths:, a block scalar body, quoted text, a look-alike key, text outside on: (${staysAnEdge.length} fixtures)`, wrong(staysAnEdge).length === 0,
    `${wrong(staysAnEdge).length} differ (why, got, want): ${show(staysAnEdge)}`)
  check(`...AND WHAT STANDS AFTER A FILTER ON THE SAME LINE SURVIVES IT (${mixed.length} fixtures)`, wrong(mixed).length === 0,
    `${wrong(mixed).length} differ (why, got, want): ${show(mixed)}`)
  check('a script that is in a filter AND invoked by a run line is still an edge: the invocation counts',
    edgesOf(`on:\n  push:\n    paths:\n      - scripts/fixture-run.mjs\n${JOBS}`) === 'fixture-run.mjs')
  check('two files do not run together: one that ends in the middle of a name and one that starts with the rest of it name no script (a file with no final newline, then another file)',
    edgesOf('run: node scripts/fixture-run.m', 'js\n') === '' && edgesOf('run: node scripts/fixture-run.mjs', 'run: node scripts/fixture-two.mjs') === 'fixture-run.mjs,fixture-two.mjs')
  check('a BOM in the middle of a name is not a BOM: only a leading one is dropped', edgesOf('run: node scripts/fixture-\uFEFFx.mjs\n') === '')
  check('stripPathFilters returns a file with no on: block unchanged, line for line (the edge SET would hide a duplicated line)',
    stripPathFilters('jobs:\n  j:\n    steps:\n      - run: node scripts/fixture-run.mjs\n') === 'jobs:\n  j:\n    steps:\n      - run: node scripts/fixture-run.mjs\n')
  check('a file with no on: block is read whole',
    edgesOf(`jobs:\n  j:\n    steps:\n      - run: node ${F} && node scripts/fixture-run.mjs\n`) === 'fixture-filtered.mjs,fixture-run.mjs')
  check('comment lines inside a filter do not end it, and the script they name is not an edge',
    [...new Set(scriptFiles(stripPathFilters(`on:\n  push:\n    paths:\n      # ${F2}\n      - ${F}\n      # ${F2}\n      - ${F2}\n    branches: [${G}]\n${JOBS}`)))].sort().join() === 'fixture-run.mjs,fixture-sibling.mjs')
  check('a whole-line comment, in column 0 or indented, is not an edge: the workflow scan drops it',
    edgesOf(`# node ${G}\nname: x\non:\n  push:\n    branches: [main]\n${JOBS.replace('steps:\n', 'steps:\n      # node ' + G + '\n')}`) === 'fixture-run.mjs')
  check('each file is read on its own: two files that each name a script only in a filter, and nothing is carried from one to the next',
    edgesOf(`on:\n  push:\n    paths:\n      - ${F}\n${JOBS}`, `on:\n  push:\n    paths:\n      - ${F2}\n${JOBS}`) === 'fixture-run.mjs' &&
    edgesOf(`jobs:\n  j:\n    steps:\n      - run: echo hi\n`, `on:\n  push:\n    paths:\n      - ${F}\n${JOBS}`) === 'fixture-run.mjs')
  // THE MAIN BLOCK, on a tree of its own: the rows above call workflowText; these run the file as the guard runs, so a main block that stopped using it is seen.
  const runGuard = (workflows, ledger = '') => {
    const root = mkdtempSync(join(tmpdir(), 'orphans-'))
    try {
      for (const d of ['scripts', '.github/workflows', 'docs']) mkdirSync(join(root, d), { recursive: true })
      writeFileSync(join(root, 'package.json'), '{"scripts":{}}\n')
      for (const f of ['fixture-run.mjs', 'fixture-filtered.mjs', 'fixture-two.mjs']) if (f !== 'fixture-two.mjs' || Object.values(workflows).some(t => t.includes('fixture-two'))) writeFileSync(join(root, 'scripts', f), '// x\n')
      for (const [name, text] of Object.entries(workflows)) writeFileSync(join(root, '.github', 'workflows', name), text)
      writeFileSync(join(root, 'docs', 'unreachable-scripts.txt'), ledger)
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: root, encoding: 'utf8' })
      return { code: r.status, out: r.stdout + r.stderr }
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
  const filterOnly = runGuard({ 'w.yml': `on:\n  push:\n    paths:\n      - ${F}\n${JOBS}` })
  check('THE GUARD, RUN ON A TREE: a script named only in a path filter is unreachable, and undeclared it fails',
    filterOnly.code === 1 && /fixture-filtered\.mjs +<- NOT DECLARED/.test(filterOnly.out) && !/fixture-run\.mjs/.test(filterOnly.out), `exit ${filterOnly.code}: ${filterOnly.out.slice(-300)}`)
  const filterAndRun = runGuard({ 'w.yml': `on:\n  push:\n    paths:\n      - ${F}\n${JOBS}      - run: node ${F}\n` })
  check('...and the same script invoked by a run line is reachable: the guard passes', filterAndRun.code === 0, `exit ${filterAndRun.code}: ${filterAndRun.out.slice(-300)}`)
  const declared = runGuard({ 'w.yml': `on:\n  push:\n    paths:\n      - ${F}\n${JOBS}` }, '# a filter is not a run\nfixture-filtered.mjs\n')
  check('...and declared in the ledger it passes, and the ledger does not call it reachable again', declared.code === 0, `exit ${declared.code}: ${declared.out.slice(-300)}`)
  const twoFiles = runGuard({ 'a.yml': `on:\n  push:\n    paths:\n      - ${F}\n${JOBS}`, 'b.yml': `on:\n  push:\n    paths:\n      - ${F2}\n${JOBS}` })
  check('...and with two workflow files each filter is read in its own file: both scripts are unreachable',
    twoFiles.code === 1 && /fixture-filtered\.mjs +<- NOT DECLARED/.test(twoFiles.out) && /fixture-two\.mjs +<- NOT DECLARED/.test(twoFiles.out), `exit ${twoFiles.code}: ${twoFiles.out.slice(-300)}`)
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} self-test(s)\n`)
  process.exit(fail === 0 ? 0 : 1)
}


// EXECUTABLE HALF, GUARDED. This module exports functions, so something will
// eventually import it -- and an unguarded module does its work at import time
// and calls process.exit, so the importer's own code never runs and the command
// still exits 0. That is the exact failure import-purity-check.mjs was written
// for; see its header. Everything below runs only when this file IS the entry
// point.
if (isMain(import.meta.url)) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const scripts = pkg.scripts ?? {}
  // COMMENT LINES ARE STRIPPED. The first run flagged a missing script named `X`,
  // harvested from this file's own explanatory comment inside guards.yml -- "does
  // `npm run X` resolve?". A checker that reads prose as code is the same defect
  // scripts/fetch-silently-empty-probe.mjs was narrowed for, and it is the fourth
  // time this session that a detector's name and its measurement disagreed.
  //
  // Only whole-line comments are dropped: a trailing `#` inside a run: block can
  // be part of a shell command, and stripping those would silently stop seeing
  // real invocations.
  //
  // PATH FILTERS ARE STRIPPED TOO (2026-11-28): see the block above `FILTER_KEY`. Each file is read on its own, because the `on:` block is found per file.
  const wfText = workflowText(readdirSync(WF).filter(f => /\.ya?ml$/.test(f)).map(f => readFileSync(join(WF, f), 'utf8')))

  // FORWARD
  const missing = [...new Set(npmRunNames(wfText))].filter(n => !(n in scripts))

  // BACKWARD. Reachability is one hop through package.json: a script command may
  // name another npm script (`npm run a && npm run b`), so follow those too.
  // The pre-commit hook is a second entry point, read rather than guessed —
  // see the note below. Its `npm run` names join the workflows' as roots so one
  // reachability walk covers both; a separate post-hoc walk is what broke when
  // the walk moved into reachableFiles.
  const HOOK = ['.githooks/pre-commit', 'scripts/pre-commit'].find(existsSync)
  if (!HOOK) console.log('  note: no pre-commit hook found; its scripts are not counted as reachable')
  const hookText = HOOK ? readFileSync(HOOK, 'utf8') : ''
  const reached = reachableFiles(scripts, [...npmRunNames(wfText), ...npmRunNames(hookText)])
  for (const f of scriptFiles(hookText)) reached.add(f)
  // A workflow may also invoke a script DIRECTLY -- `node scripts/serve.mjs &`,
  // `node scripts/drift-check.mjs` -- without going through package.json at all.
  // The first version of this check walked only `npm run` and reported 33
  // unreachable files, most of them called directly by a workflow step three
  // lines from where it was looking. Its name said "reachable from a workflow"
  // and it measured "reachable from a workflow's npm scripts", which is the same
  // defect this file exists to catch, in the file itself, on its first run.
  for (const f of scriptFiles(wfText)) reached.add(f)

  // A module IMPORTED by a reachable script is reachable. Without this the ledger
  // fills with libraries -- jq-tokenizer.mjs, checks.mjs, game-id-scheme.mjs are
  // never invoked and are imported by scripts that are -- and a ledger that is
  // mostly noise is one nobody reads when the real entry appears. Transitive, so
  // a helper imported by a helper still counts.
  const importsOf = f => {
    const path = join('scripts', f)
    if (!existsSync(path)) return []
    const t = readFileSync(path, 'utf8')
    return [...t.matchAll(/from\s+['"]\.\/([A-Za-z0-9._-]+\.m?js)['"]|import\(['"]\.\/([A-Za-z0-9._-]+\.m?js)['"]/g)]
      .map(m => m[1] || m[2]).filter(Boolean)
  }
  // A reachable script may SHELL OUT to another -- gate-checks.mjs:244 runs
  // `ok('node scripts/mutation-check.mjs')`, which in turn runs run-row.mjs. That
  // is a real edge and no import or npm script records it, so the file's own
  // source is harvested for `scripts/X.mjs` alongside its imports. Without this,
  // mutation-check.mjs read as an orphan while the gate ran it on every row.
  const edgesOf = f => {
    const path = join('scripts', f)
    if (!existsSync(path)) return []
    const t = readFileSync(path, 'utf8')
    // Only edges to files that EXIST. This file's own self-test fixtures name
    // scripts/a-b.mjs and friends as string literals, and harvesting its source
    // walked them into the reachable set -- five names that are not files. They
    // could never mask a real orphan, but a count that overshoots the directory
    // is a count nobody can check against `ls`.
    return [...importsOf(f), ...scriptFiles(stripJsComments(t))]
      .filter(d => existsSync(join('scripts', d)))
  }
  let grew = true
  while (grew) {
    grew = false
    for (const f of [...reached]) for (const dep of edgesOf(f)) if (!reached.has(dep)) { reached.add(dep); grew = true }
  }
  // The pre-commit hook is a real entry point too.
  // Both forms, because the hook uses both: `node scripts/x.mjs` AND `npm run y`.
  // Harvesting only the first left staged-outbox-check.mjs reported unreachable
  // while the pre-commit gate was running it on every commit -- including the
  // commit that added this check.
  // The hook path is READ, not guessed. `git config core.hooksPath` says
  // `.githooks`; I wrote `scripts/pre-commit` from memory, existsSync returned
  // false, and the whole branch silently did nothing -- so the hook's scripts
  // looked unreachable and the check had no idea it was blind.
  //
  // A missing optional file and a missing REQUIRED one are different, so this
  // says which it found.

  const onDisk = readdirSync('scripts').filter(f => /\.m?js$/.test(f))
  const unreachable = onDisk.filter(f => !reached.has(f))

  console.log(`\n  ${Object.keys(scripts).length} npm script(s), ${onDisk.length} file(s) in scripts/`)
  console.log(`  ${reached.size} reachable from a workflow or the pre-commit hook\n`)

  check('every `npm run` in a workflow resolves to a script', missing.length === 0, missing.join(', '))

  // NOT a hard failure on every unreachable file: probes and one-off censuses are
  // deliberately dispatch-only or manual, and forbidding those would push real
  // tools into fake workflows. The ratchet is what matters -- the number must not
  // GROW, which is what a clobber does.
  const LEDGER = 'docs/unreachable-scripts.txt'
  const declared = existsSync(LEDGER)
    ? readFileSync(LEDGER, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    : []
  const undeclared = unreachable.filter(f => !declared.includes(f))
  const stale = declared.filter(f => !unreachable.includes(f))

  if (unreachable.length) {
    console.log(`  unreachable (${unreachable.length}), all declared in ${LEDGER}:`)
    for (const f of unreachable) console.log(`    ${f}${declared.includes(f) ? '' : '   <- NOT DECLARED'}`)
    console.log('')
  }

  check('no script became unreachable without being declared',
    undeclared.length === 0,
    `${undeclared.join(', ')} — if this is a deliberate retirement, add it to ${LEDGER} ` +
    `with a reason in the same commit. If it is a clobber, a workflow step is now ` +
    `measuring something other than what its name says.`)
  check('the ledger carries no script that is reachable again',
    stale.length === 0,
    `${stale.join(', ')} — reachable now; delete the line in the commit that rewired it`)

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass}/${pass + fail} checks passed`)
  process.exit(fail === 0 ? 0 : 1)
}
