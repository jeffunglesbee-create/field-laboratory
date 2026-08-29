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
// `//` is stripped only at line start or after whitespace, so `https://` and
// any other scheme survive. A `//` inside a template literal would be stripped;
// no script here has one, and losing an edge is the direction that fails LOUD.
export function stripJsComments (t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
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
  // The clobber, as a fixture: the KEY survives, the FILE it named does not.
  const before = { 'check:sports': 'node scripts/sport-registry-check.mjs' }
  const after  = { 'check:sports': "URL='x' node scripts/render-check.mjs" }
  const reach = s => new Set(Object.values(s).flatMap(scriptFiles))
  T('THE CLOBBER IS DETECTED: a file reachable before is unreachable after',
    reach(before).has('sport-registry-check.mjs') && !reach(after).has('sport-registry-check.mjs'))
  T('...and the forward direction alone would NOT have caught it',
    'check:sports' in before && 'check:sports' in after,
    'the key survived, so every npm run still resolved')
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
  const reached = new Set()
  const seen = new Set()
  const walk = name => {
    if (seen.has(name) || !(name in scripts)) return
    seen.add(name)
    for (const f of scriptFiles(scripts[name])) reached.add(f)
    for (const n of npmRunNames(scripts[name])) walk(n)
  }
  for (const n of npmRunNames(wfText)) walk(n)
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
  const HOOK = ['.githooks/pre-commit', 'scripts/pre-commit'].find(existsSync)
  if (!HOOK) console.log('  note: no pre-commit hook found; its scripts are not counted as reachable')
  if (HOOK) {
    const hook = readFileSync(HOOK, 'utf8')
    for (const f of scriptFiles(hook)) reached.add(f)
    for (const n of npmRunNames(hook)) walk(n)
  }

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
