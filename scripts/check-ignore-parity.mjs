#!/usr/bin/env node
// THE KEYSTONE, and until now undefended.
//
// `deployable.mjs`'s `isIgnored` and `verify.yml`'s `paths-ignore` describe the
// same set. That equivalence is what lets the deploy gate ask an EXACT question
// rather than an approximate one: a commit is deployable if and only if verify
// runs on it, so for every deployable commit a verify run exists or is in
// flight, and the gate can ask for that commit's verdict by sha.
//
// Edit either side alone and the gate silently starts consulting a verdict that
// may not exist for the commit being published — and the failure is invisible,
// because a missing run reads as "unknown" and the deploy just stops, hourly,
// for a reason nobody connects to a one-line path change.
//
// BEHAVIOURAL, NOT TEXTUAL. Comparing the two as strings would pass on
// `docs/**` vs `docs/` and fail on a harmless reordering. This translates
// verify.yml's globs into predicates and asserts the two agree on every path in
// a corpus — the repo's real tracked paths, plus the edge cases a corpus of
// real files cannot contain.
//
// `check-push-lands.py` is the precedent: read a workflow's own declarations
// rather than a copy of them.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { isIgnored } from './deployable.mjs'
import { createChecks, isMain, finish } from './checks.mjs'

export const WORKFLOW = '.github/workflows/verify.yml'

/** The `paths-ignore:` list under `on.push`, read out of the workflow itself. */
export const readPathsIgnore = (text) => {
  const lines = text.split('\n')
  const i = lines.findIndex(l => /^\s*paths-ignore:\s*$/.test(l))
  if (i === -1) return null
  const out = []
  for (let j = i + 1; j < lines.length; j++) {
    const m = /^\s*-\s*'?"?([^'"\s]+)'?"?\s*$/.exec(lines[j])
    if (!m) break
    out.push(m[1])
  }
  return out.length ? out : null
}

/** One GitHub path glob as a predicate. Only the forms this repo uses. */
export const globToPredicate = (glob) => {
  if (glob.endsWith('/**')) { const p = glob.slice(0, -2); return f => f.startsWith(p) }
  if (glob.startsWith('**/*.')) { const e = glob.slice(3); return f => f.endsWith(e.slice(1)) }
  if (glob.startsWith('*.')) { const e = glob.slice(1); return f => f.endsWith(e) }
  return f => f === glob
}

export const ignoredByWorkflow = (globs) => {
  const preds = globs.map(globToPredicate)
  return f => preds.some(p => p(f))
}

/** Paths a corpus of real files cannot contain, and where the two could differ. */
export const EDGE_CASES = [
  'docs/x.md', 'docs/nested/deep/x.txt', 'outbox/y.json', 'README.md',
  'src/Program.fs', 'scripts/status.mjs', '.github/workflows/verify.yml',
  'package.json', 'docsentry.fs', 'outboxed.mjs', 'a/b/c.md', 'index.html',
  'src/x.md', 'docs', 'outbox', 'x.markdown', 'MD', 'a.md.fs',
]

export const disagreements = (corpus, wfPredicate) =>
  corpus.filter(f => isIgnored(f) !== wfPredicate(f))

function selfTest () {
  const { check, summarize } = createChecks()
  check('a dir glob becomes a prefix test', globToPredicate('docs/**')('docs/a/b.txt') === true)
  check('...and does not match a lookalike prefix', globToPredicate('docs/**')('docsentry.fs') === false)
  check('an extension glob becomes a suffix test', globToPredicate('**/*.md')('a/b/c.md') === true)
  check('...and is not satisfied by a mid-name match', globToPredicate('**/*.md')('a.md.fs') === false)
  check('the paths-ignore list parses out of real YAML',
    JSON.stringify(readPathsIgnore("on:\n  push:\n    paths-ignore:\n      - 'docs/**'\n      - '**/*.md'\n  pull_request:\n"))
      === JSON.stringify(['docs/**', '**/*.md']))
  check('a workflow with no paths-ignore is null, not an empty set',
    readPathsIgnore('on:\n  push:\n') === null)

  // Rule 90 — the mutation this check exists to catch: one side edited alone.
  const drifted = ignoredByWorkflow(['docs/**', '**/*.md'])  // outbox/** dropped
  check('MUTATION: dropping outbox/** from the workflow IS caught',
    disagreements(['outbox/a.json'], drifted).length === 1)
  const widened = ignoredByWorkflow(['docs/**', 'outbox/**', '**/*.md', 'src/**'])
  check('MUTATION: widening the workflow with src/** IS caught',
    disagreements(['src/Program.fs'], widened).length === 1)
  check('...and the matching set disagrees nowhere',
    disagreements(EDGE_CASES, ignoredByWorkflow(['docs/**', 'outbox/**', '**/*.md'])).length === 0)
  return summarize('ignore parity')
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) process.exit(selfTest())

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const globs = readPathsIgnore(readFileSync(WORKFLOW, 'utf8'))
  check(`${WORKFLOW} declares a paths-ignore list`, globs !== null, String(globs))
  if (globs === null) process.exit(summarize('ignore parity'))

  const wf = ignoredByWorkflow(globs)
  let tracked = []
  try { tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean) }
  catch { /* corpus falls back to the edge cases alone, and says so below */ }
  const corpus = [...new Set([...tracked, ...EDGE_CASES])]
  const bad = disagreements(corpus, wf)

  console.log(`\n  verify.yml paths-ignore: ${globs.join(', ')}`)
  console.log(`  corpus: ${tracked.length} tracked path(s) + ${EDGE_CASES.length} edge case(s) = ${corpus.length} compared`)
  if (bad.length) {
    console.log('\n  THE TWO DISAGREE ON:')
    for (const f of bad.slice(0, 20)) {
      console.log(`    ${f}   isIgnored=${isIgnored(f)}  verify.yml=${wf(f)}`)
    }
  }
  check('isIgnored and verify.yml\'s paths-ignore describe the same set',
    bad.length === 0, `${bad.length} disagreement(s)`)
  check('the corpus is not vacuous', corpus.length > EDGE_CASES.length,
    `${tracked.length} tracked paths read from git`)
  finish(summarize('ignore parity'))
}
