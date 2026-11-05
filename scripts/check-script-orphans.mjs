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

import { readFileSync, readdirSync, existsSync } from 'node:fs'
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
    npmRunNames(['  # does `npm run X` resolve?', '  run: npm run check:real']
      .filter(l => !/^\s*#/.test(l)).join('\n')).join(',') === 'check:real')
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
  const after  = { 'check:sports': "URL='x' node scripts/render-check.mjs" }
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
  const stripComments = t => t.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
  const wfText = stripComments(readdirSync(WF).filter(f => /\.ya?ml$/.test(f))
    .map(f => readFileSync(join(WF, f), 'utf8')).join('\n'))

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
