// Documents must stay true, or the build fails.
//
// `proof-check.mjs` does this for COMPILER claims: a proof doc says "this does
// not type-check", the script injects it and requires the build to fail. This
// is the same idea for PRODUCTION claims — the numbers docs quote about the
// corpus, the scales and the relay.
//
// Why those numbers rot: they were measured once, written into prose, and prose
// is not executable. `docs/PROSE-PROOF.md` cites a corpus minimum of 1.75 and
// 91.2% floored; `CEILING-PROOF.md` cites 240 as 97.96% of 245;
// `JOURNALISM-PROOF.md` cites 285 unanchored stat sentences of 627. Every one of
// those was true when written and nothing re-checks any of them.
//
// HOW A CLAIM IS WRITTEN
//
//     <!-- claim: corpus.size = 592 -->
//
// The id names an entry in CLAIMS below, which computes the value from
// committed data. The doc states what it believes; the registry states what is
// true; a mismatch fails the build and names both.
//
// WHY NOT "EVERY CLAIM CARRIES THE COMMAND THAT RE-DERIVES IT"
//
// That was the original Phase 5 sketch, and it is worse. Executing arbitrary
// shell written inside a markdown file is a code-execution surface in a repo
// where docs are the least-reviewed files, and it would put a process spawn —
// tens of milliseconds at best, a Fable build at worst — behind every claim.
// This runs in well under a second on every push, which is the difference
// between a guard that runs and a guard that gets moved to a weekly job.
//
// The cost is real and worth naming: a NEW kind of claim needs an entry here,
// so the registry is a gate on what can be asserted. That is a deliberate
// trade — claims that nothing can compute are exactly the claims that rot.

import { readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createChecks, finish } from './checks.mjs'
import {
  tokenise, shippedRawDensity, shippedDensity,
} from '../build/Prose.js'
import { maxOf, nominal, relayReachable, unreachable } from '../build/Ceiling.js'
import { anchoring, briefTypeOfString, isModelled } from '../build/Journalism.js'
import { sportOfString, sportMeta, allSports } from '../build/Desk.js'

const SELF_TEST = process.argv.includes('--self-test')
const { check, summarize } = createChecks()

const CORPUS = JSON.parse(readFileSync('data/jq-mlb-game-corpus.json', 'utf8'))

// Computed once; several claims read the same pass over the corpus.
const tokenised = CORPUS.map(r => tokenise(r.brief_text))
const anchored = CORPUS.reduce(
  (acc, r) => {
    const [stat, anch] = Array.from(anchoring(r.brief_text))
    return { stat: acc.stat + stat, anchored: acc.anchored + anch }
  },
  { stat: 0, anchored: 0 })

// The whole registry, not seven strings. `allSports` was added to Desk.fs on
// 2026-08-29; before it existed this file transcribed the same seven sports
// sport-registry-check did, and the `sports.modelled` claim below was a fact
// about that literal rather than about the registry.
const SPORTS = Array.from(allSports).map(sp => sportMeta(sp).Label)
// Read from the capture, not transcribed. See journalism-check.mjs for the full
// reasoning: the literal that used to be here was a copy of the registry's own
// vintage, so the claim it fed could not move when production wrote a new type.
const BRIEF_TYPES = [...new Set([
  'game_recap', 'pre_game', 'game_brief', 'slate', 'night_owl',
  'mlb_game', 'epl_match', 'narrative_context', 'compound',
  ...JSON.parse(readFileSync('data/brief-recency-corpus.json', 'utf8'))
    .briefs.map(b => b.brief_type).filter(Boolean),
])].sort()

/**
 * Every claim a document is allowed to make, and how to re-derive it.
 *
 * `tolerance` exists because a document quoting 45.5% should not fail when the
 * true value is 45.4999. It is NOT a fudge factor for drift: it is one decimal
 * place, matching how the figure is written.
 */
const CLAIMS = {
  'corpus.size': { value: () => CORPUS.length, tolerance: 0 },
  // Every row is unattributed, because none carries `scoring_version`. Computed
  // rather than asserted so the day the relay projects it, this claim moves.
  'corpus.unattributed': {
    value: () => CORPUS.filter(r => !('scoring_version' in r)).length, tolerance: 0,
  },

  'prose.minRawDensity': {
    value: () => Math.min(...tokenised.map(shippedRawDensity)), tolerance: 5e-3,
  },
  'prose.flooredPct': {
    value: () => (tokenised.filter(t => shippedDensity(t) === 0).length / tokenised.length) * 100,
    tolerance: 0.05,
  },

  'ceiling.nominal': { value: () => maxOf(nominal), tolerance: 0 },
  'ceiling.relayReachable': { value: () => maxOf(relayReachable), tolerance: 0 },
  'ceiling.unreachable': { value: () => unreachable, tolerance: 0 },
  'ceiling.flatBarPctOfReachable': {
    value: () => (240 / maxOf(relayReachable)) * 100, tolerance: 0.005,
  },

  'journalism.statSentences': { value: () => anchored.stat, tolerance: 0 },
  'journalism.unanchoredSentences': {
    value: () => anchored.stat - anchored.anchored, tolerance: 0,
  },
  'journalism.unanchoredPct': {
    value: () => ((anchored.stat - anchored.anchored) / anchored.stat) * 100,
    tolerance: 0.05,
  },

  'sports.modelled': {
    value: () => SPORTS.filter(s => sportMeta(sportOfString(s)).Modelled).length, tolerance: 0,
  },
  'briefTypes.modelled': {
    value: () => BRIEF_TYPES.filter(b => isModelled(briefTypeOfString(b))).length, tolerance: 0,
  },
}

const CLAIM_RE = /<!--\s*claim:\s*([A-Za-z0-9._]+)\s*=\s*([-\d.]+)\s*-->/g

/**
 * A marker inside a FENCED BLOCK is a quotation, not an assertion, and a
 * CC-CMD quoting one is describing it rather than claiming it.
 *
 * Added 2026-09-20, when it bit. CC-CMD-2026-09-11 specifies a staleness sweep
 * and quotes seven markers as examples of what had gone stale. Correcting the
 * real markers in CEILING-PROOF.md left those quotations behind, and this
 * script read them as live claims and failed — reporting a document as untrue
 * for accurately recording what used to be true.
 *
 * scripts/claim-check.mjs made both exclusions from the start and is the reason
 * this was diagnosable in one read rather than mistaken for a bad correction.
 */
const stripFenced = text => {
  const out = []
  let fenced = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    out.push(fenced ? '' : line)
  }
  return out.join('\n')
}

/** Every `<!-- claim: id = value -->` in a directory of markdown. */
const claimsIn = dir =>
  readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.startsWith('CC-CMD-'))
    .flatMap(f => {
      const text = stripFenced(readFileSync(join(dir, f), 'utf8'))
      return [...text.matchAll(CLAIM_RE)].map(m => ({
        file: `${dir}/${f}`, id: m[1], stated: Number(m[2]),
      }))
    })

// ── the self-test: can this script fail at all? ─────────────────────────────
//
// Run first and separately, because a docs checker that cannot detect a stale
// claim would report every document true forever. Writes to a temp directory,
// never to docs/.

if (SELF_TEST) {
  const dir = join(tmpdir(), `docs-check-selftest-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  try {
    const truth = CLAIMS['corpus.size'].value()

    writeFileSync(join(dir, 'fresh.md'), `<!-- claim: corpus.size = ${truth} -->\n`)
    writeFileSync(join(dir, 'stale.md'), `<!-- claim: corpus.size = ${truth + 1} -->\n`)
    writeFileSync(join(dir, 'unknown.md'), `<!-- claim: nobody.computes.this = 5 -->\n`)
    writeFileSync(join(dir, 'silent.md'), 'A document making no claim at all.\n')

    const found = claimsIn(dir)
    check('the self-test finds exactly the claims it wrote',
      found.length === 3,
      `${found.length} claim(s) parsed from 4 files (one states nothing)`)

    const verdictFor = name => {
      const c = found.find(x => x.file.endsWith(name))
      if (!c) return 'not-found'
      const spec = CLAIMS[c.id]
      if (!spec) return 'unknown-id'
      return Math.abs(spec.value() - c.stated) <= spec.tolerance ? 'true' : 'stale'
    }

    check('a fresh claim reads as true', verdictFor('fresh.md') === 'true', verdictFor('fresh.md'))
    check('a STALE claim is detected', verdictFor('stale.md') === 'stale', verdictFor('stale.md'))
    check('a claim nothing can compute is refused, not ignored',
      verdictFor('unknown.md') === 'unknown-id', verdictFor('unknown.md'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit(summarize() === 0 ? 0 : 1)
}

// ── the real documents ──────────────────────────────────────────────────────

const found = [...claimsIn('docs'), ...claimsIn('outbox')]

// Non-vacuity, loudest and first. "Every claim is true" is free when there are
// no claims, and a regex that stopped matching would report exactly that.
check('the documents carry machine-checkable claims',
  found.length > 0,
  `${found.length} claim(s) across docs/ and outbox/`)

const unknown = found.filter(c => !CLAIMS[c.id])
check('every claim names something the registry can compute',
  unknown.length === 0,
  unknown.map(c => `${c.file}: ${c.id}`).join('; ') || `${Object.keys(CLAIMS).length} claim ids registered`)

const stale = found
  .filter(c => CLAIMS[c.id])
  .map(c => ({ ...c, actual: CLAIMS[c.id].value(), tol: CLAIMS[c.id].tolerance }))
  .filter(c => Math.abs(c.actual - c.stated) > c.tol)

check('every claim a document makes is still true',
  stale.length === 0,
  stale.map(c => `${c.file}: ${c.id} says ${c.stated}, actual ${c.actual}`).join('; ') ||
  `${found.length} claim(s) re-derived and matching`)

finish(summarize())
