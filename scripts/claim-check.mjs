// Makes `<!-- claim: name.field = value -->` markers executable.
//
// WHY THIS EXISTS
//
// `proof-check.mjs` already makes COMPILER claims executable: each
// `<!-- proof: FSxxxx -->` block is injected, compiled, and passes only if the
// build fails with the stated code. Its rationale — "a proof document that no
// one runs is a design document" — applies just as hard to the numeric claims
// beside them, and those had no harness at all. They are assertions about
// production that nothing read.
//
// It had already cost. CEILING-PROOF.md carries four `ceiling.*` markers taken
// from a 300-point rubric. The relay's SCALE has since moved twice — the source
// file's own comment records REACHABLE_CEILING going 245 -> 277 "silently" — and
// the document went on asserting the old numbers in the present tense. The
// doc's whole argument is that a number outlives the scale it was set on, and
// that is what happened to the doc.
//
// THREE STATES, NEVER PASS/FAIL
//
//   HOLDS        marker and live value both read, and they agree
//   STALE        both read, and they DISAGREE
//   UNCHECKABLE  no reachable source; the reason is recorded
//
// `UNCHECKABLE` never alarms and is never counted as `HOLDS`. Reporting a
// marker as holding when nothing verified it is the exact failure this file
// exists to end, so the two are kept in separate counters and the summary
// prints both. An UNCHECKABLE marker is a gap in coverage, not a green.
//
// THE MARKERS ARE HTML COMMENTS. A `^name.field = value` regex finds ZERO
// across all 18 proof docs and reports a clean sweep of nothing — the false
// negative this file's own CC-CMD warns about, and the shape the repo keeps
// finding: an instrument that cannot match its subject looks identical to a
// subject with no defects.

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createChecks, isMain } from './checks.mjs'

// ── marker parsing ──────────────────────────────────────────────────────────

/**
 * Markers inside a fenced code block are QUOTATIONS, not assertions.
 * CC-CMD-2026-09-11 quotes seven of them while specifying this harness; a
 * parser that counted those would report markers that no document is claiming
 * and would fail on the CC-CMD's own worked examples.
 */
export function parseClaims(text) {
  const out = []
  let fenced = false
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    const m = line.match(/<!--\s*claim:\s*([A-Za-z_][\w.]*)\s*=\s*([^\s-][^-]*?)\s*-->/)
    if (m) out.push({ name: m[1], raw: m[2].trim(), line: i + 1 })
  }
  return out
}

// ── the relay source, which is a DIFFERENT REPOSITORY ───────────────────────
//
// The `ceiling.*` markers resolve against constants in field-relay-nba. Two
// things follow and both matter:
//
//  1. The constants are COMPUTED from SCALE, not written down. Their source
//     carries trailing comments (`// 294`, `// 252`) and those comments have
//     been wrong before — the same file records the value moving silently under
//     one. So this imports the module and reads the evaluated export. Reading
//     the comment would be reading a copy of the answer.
//
//  2. field-laboratory's `verify` workflow does not check that repo out, so
//     without a deliberate step these markers are UNCHECKABLE in CI and the
//     harness would report a clean sweep while its only known-stale controls
//     went unexamined. The workflow now checks it out to RELAY_SRC. When it is
//     absent the markers say UNCHECKABLE with the path that was missing — they
//     never quietly pass.
const RELAY_CANDIDATES = [
  process.env.RELAY_SRC,
  '.relay-src',
  '../field-relay-nba',
].filter(Boolean)

const relayRoot = RELAY_CANDIDATES.find(p => existsSync(`${p}/src/journalism-quality.js`))

let relay = null, relayError = null
if (relayRoot) {
  try {
    // pathToFileURL(resolve(...)), NOT `new URL(rel, import.meta.url)`. The two
    // resolve against DIFFERENT BASES — cwd for existsSync above, scripts/ for
    // import.meta.url — so `../field-relay-nba` passed the existence check and
    // then imported from `field-laboratory/field-relay-nba/`, which is nowhere.
    // Caught on the first real sweep, and caught only because an unreachable
    // source reports UNCHECKABLE with its path instead of a plausible default.
    relay = await import(pathToFileURL(resolve(relayRoot, 'src/journalism-quality.js')).href)
  } catch (e) { relayError = String(e && e.message || e).slice(0, 160) }
} else {
  relayError = `field-relay-nba not found; looked in ${RELAY_CANDIDATES.join(', ')}`
}

// ── corpus, and the oracles that already exist ──────────────────────────────

const CORPUS_PATH = 'data/jq-mlb-game-corpus.json'
const CORPUS = existsSync(CORPUS_PATH) ? JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) : null

// Production's Dim 8 extractor, copied verbatim in journalism-check.mjs and
// reused here rather than re-derived. A second, tidier implementation would
// agree with nothing and prove nothing.
const STAT_RE = /\d+\.?\d*\s*(ppg|apg|rpg|pts?|points?|rebounds?|assists?|goals?|saves?|era|ops|mph|yards?|rbi|%|\+\/\-)/i
const TEMPORAL_RE = /\b(this series|this season|this postseason|in game \d|game \d|in \d{4}|since \d{4}|last \d+ games?|per game|on the year|this year|career|tonight|in the playoffs?|in these playoffs?)\b/i

let _anchor = null
function anchorTotals() {
  if (_anchor) return _anchor
  let stat = 0, anchored = 0
  for (const row of CORPUS) {
    for (const s of String(row.brief_text || '').split(/[.!?]+/).map(x => x.trim()).filter(Boolean)) {
      if (STAT_RE.test(s)) { stat++; if (TEMPORAL_RE.test(s)) anchored++ }
    }
  }
  return (_anchor = { stat, anchored, unanchored: stat - anchored })
}

let _prose = null
async function proseTotals() {
  if (_prose) return _prose
  const { tokens } = await import('./jq-tokenizer.mjs')
  const t = CORPUS.map(r => tokens(r.brief_text))
  return (_prose = {
    minRawDensity: Math.min(...t.map(x => x.rawDensity)),
    flooredPct: (t.filter(x => x.density === 0).length / t.length) * 100,
  })
}

/** F# union cases, minus the explicit escape hatch each union carries. */
function unionCases(file, typeName, escapeHatch) {
  const src = readFileSync(file, 'utf8')
  const m = src.match(new RegExp(`^\\s*type ${typeName}\\b.*?$([\\s\\S]*?)(?=^\\s*(?:type|let|module)\\s)`, 'm'))
  if (!m) return null
  const cases = [...m[1].matchAll(/^\s*\|\s*(\w+)/gm)].map(x => x[1])
  return cases.filter(c => c !== escapeHatch).length
}

// ── resolvers ───────────────────────────────────────────────────────────────
//
// Each returns { value } or { unreachable: '<reason>' }. A resolver that cannot
// reach its source must SAY SO; returning a plausible default here is the same
// defect as the stale marker, one layer down.

const NO_CORPUS = () => ({ unreachable: `${CORPUS_PATH} not present` })
const NO_RELAY  = () => ({ unreachable: relayError })

const RESOLVERS = {
  // Evaluated exports, not the comments beside them.
  'ceiling.nominal':        () => relay ? { value: relay.NOMINAL_TOTAL } : NO_RELAY(),
  'ceiling.relayReachable': () => relay ? { value: relay.REACHABLE_CEILING } : NO_RELAY(),
  'ceiling.unreachable':    () => relay ? { value: relay.NOMINAL_TOTAL - relay.REACHABLE_CEILING } : NO_RELAY(),
  // The doc's own arithmetic: the flat 240 bar as a percentage of what the
  // relay can actually reach. Recomputed from the live ceiling, so the marker
  // is compared against today's ratio rather than a remembered one.
  'ceiling.flatBarPctOfReachable': () =>
    relay ? { value: Number((240 / relay.REACHABLE_CEILING * 100).toFixed(2)) } : NO_RELAY(),

  'corpus.size':         () => CORPUS ? { value: CORPUS.length } : NO_CORPUS(),
  'corpus.unattributed': () => CORPUS
    ? { value: CORPUS.filter(r => r.scoring_version === undefined || r.scoring_version === null || r.scoring_version === '').length }
    : NO_CORPUS(),

  'journalism.statSentences':       () => CORPUS ? { value: anchorTotals().stat } : NO_CORPUS(),
  'journalism.unanchoredSentences': () => CORPUS ? { value: anchorTotals().unanchored } : NO_CORPUS(),
  'journalism.unanchoredPct':       () => CORPUS
    ? { value: Number((anchorTotals().unanchored / anchorTotals().stat * 100).toFixed(1)) } : NO_CORPUS(),

  'prose.minRawDensity': async () => CORPUS ? { value: Number((await proseTotals()).minRawDensity.toFixed(4)) } : NO_CORPUS(),
  'prose.flooredPct':    async () => CORPUS ? { value: Number((await proseTotals()).flooredPct.toFixed(1)) } : NO_CORPUS(),

  'sports.modelled':     () => {
    const n = unionCases('src/Desk.fs', 'Sport', 'Unrecognised')
    return n === null ? { unreachable: 'Sport union not found in src/Desk.fs' } : { value: n }
  },
  'briefTypes.modelled': () => {
    const n = unionCases('src/Journalism.fs', 'BriefType', 'Unmodelled')
    return n === null ? { unreachable: 'BriefType union not found in src/Journalism.fs' } : { value: n }
  },
}

// ── transcriptions ──────────────────────────────────────────────────────────
//
// WHY A SWEEP OF MARKERS IS NOT ENOUGH, and this was found the day after the
// sweep shipped.
//
// `scripts/docs-check.mjs` resolves all fourteen of these same markers and has
// for some time — the CC-CMD that asked for this harness said none existed, and
// that was false at HEAD. Run it today and it reports
// `every claim a document makes is still true`, 3/3 PASS, on the five markers
// this file reports STALE.
//
// The fork is one import. `docs-check.mjs:42` reads the ceiling from
// `build/Ceiling.js` — the compiled F# in THIS repo — while this file reads the
// relay. `src/Ceiling.fs` hardcodes the same 300/245 the document does, so
// docs-check compares a copy against a copy and passes.
//
// A READER SEEING TWO HARNESSES DISAGREE NEEDS TO KNOW WHY, and until now that
// fact lived only in an outbox document — prose, unexecuted, which is the exact
// condition this whole CC-CMD exists to end. So it is printed here, from the
// source, every run.
//
// IT DOES NOT GATE, and that is deliberate rather than timid. Whether
// `src/Ceiling.fs` is STALE or is deliberately encoding the historical scale the
// 240 bar was set against is an open judgement — the module's whole argument is
// that a bar from one scale cannot judge a score from another, so 300/245 may be
// intentional history. Failing a build on an unresolved judgement is a red
// nobody is permitted to fix.
const TRANSCRIPTIONS = [
  { file: 'src/Ceiling.fs', binding: 'nominal',        relay: 'NOMINAL_TOTAL' },
  { file: 'src/Ceiling.fs', binding: 'relayReachable', relay: 'REACHABLE_CEILING' },
]

/** The `Max = N<point>` literal bound to `let <binding>`, or null. */
export function transcribedMax(text, binding) {
  // Anchored to the binding, not to the first Max in the file: two records sit
  // six lines apart and a bare /Max = (\d+)/ would read nominal's 300 for both,
  // which agrees with the relay for neither and disagrees for the wrong reason.
  const m = text.match(new RegExp(`\\blet\\s+${binding}\\s*:[^=]*=\\s*\\{[^}]*?\\bMax\\s*=\\s*(\\d+)<point>`, 's'))
  return m ? Number(m[1]) : null
}

/** MATCHES | DIVERGED | UNCHECKABLE — same discipline as the marker states. */
export function transcriptionState(local, live) {
  if (local === null || local === undefined) return 'UNCHECKABLE'
  if (live === null || live === undefined) return 'UNCHECKABLE'
  return local === live ? 'MATCHES' : 'DIVERGED'
}

// ── comparison ──────────────────────────────────────────────────────────────

/**
 * Compared as NUMBERS when both parse as numbers, because `97.96` and `"97.96"`
 * are the same claim and `==` across types is not a comparison anyone should
 * have to reason about. Non-numeric markers fall back to exact string equality.
 *
 * TOLERANCE IS DELIBERATELY ABSENT. A marker is a stated value; "close enough"
 * is how 245 survived a move to 252 in prose for a month.
 */
export function compare(claimed, live) {
  const a = Number(claimed), b = Number(live)
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b ? 'HOLDS' : 'STALE'
  return String(claimed) === String(live) ? 'HOLDS' : 'STALE'
}

/** @returns HOLDS | STALE | UNCHECKABLE — and UNCHECKABLE is never HOLDS. */
export function stateOf(resolved, claimed) {
  if (!resolved || resolved.unreachable) return 'UNCHECKABLE'
  if (resolved.value === undefined || resolved.value === null) return 'UNCHECKABLE'
  return compare(claimed, resolved.value)
}

// ── Task 3: present-tense production premises ───────────────────────────────
//
// A marker is a number and can be resolved. A PREMISE is a sentence — "the
// FIELD app computes a win-probability away side as `1 - homeWP`" — and it goes
// stale exactly the same way, with nothing to catch it. `Desk.fs:1369` states
// that in the present tense and it was verified false at client HEAD `bf67bad`:
// zero `1 - homeWP` sites, `awayWP` reads `oddsData.awayWin` directly, and the
// two-way case is documented as the EXCEPTION. The defect was fixed; the
// sentence was not.
//
// A DECLARED SUBJECT LIST, NOT A CLASSIFIER. The subjects below are the
// external systems this repo makes assertions about, written down. A general
// "does this sentence sound like a claim" heuristic would flag the F# prose
// this repo is made of — the same reason check-no-foreign-domain.mjs declares
// its hosts instead of guessing at them.
//
// It reports DATED vs UNDATED and does not fail on either. Whether a premise is
// still true is a question only re-probing answers; whether it says WHEN it was
// checked is mechanical, and that is all this claims to measure.
const PREMISE_SUBJECTS = [
  'the FIELD app', 'the FIELD client', 'the client', 'production',
  'the relay', 'field-relay-nba', 'jubilant-bassoon', 'field.js',
  '/quality/report', 'the worker',
]
const PRESENT_VERB = /\b(computes?|uses?|reads?|returns?|applies|applies to|stores?|sends?|posts?|never|always|has no|does not|documents?|reports?|treats?)\b/i
const DATE_RE = /\b20\d\d-\d\d-\d\d\b|\b20\d\d\b/
const WINDOW = 6

export function premisesIn(text, file) {
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // THE SUBJECT MAY BE ON THE PREVIOUS LINE, and the control proves it:
    // Desk.fs:1369 reads "FIELD app computes a win-probability away side as
    // `1 - homeWP`" — the "The" is the last word of line 1368. A line-by-line
    // match finds NOTHING there, which is the same blindness as the naive
    // `^name.field` regex one layer up: an instrument that cannot reach its
    // subject reports a clean result.
    //
    // So the subject is sought across a two-line window and the VERB must be on
    // this line, which keeps the reported location at the sentence's assertion
    // rather than at the wrap.
    // COMMENT MARKERS ARE STRIPPED BEFORE JOINING, and that is not cosmetic.
    // Desk.fs:1368 ends "... OWN surface. The" and 1369 begins "FIELD app
    // computes". Joined raw, the window reads "...surface. the // field app
    // computes" — the `//` sits between the article and its noun, so "the FIELD
    // app" is still absent and the control still escapes. Two fixes were needed
    // for one sentence, and the first one looked like it worked.
    const strip = (x) => String(x || '').replace(/^\s*(\/\/+|\*|>|#)\s?/, ' ')
    // ...AND WHITESPACE IS COLLAPSED, which was the THIRD fix for this one
    // sentence. `strip` substitutes a space for the `//` and the join adds
    // another, so the window read "the  field app" with two spaces and the
    // subject "the FIELD app" still did not match. Each of the three fixes
    // looked correct when read and was confirmed wrong by running it. Reading
    // is a simulation of execution; this is where they diverged, three times.
    const ctx = (strip(lines[i - 1]) + ' ' + strip(line)).toLowerCase().replace(/\s+/g, ' ')
    const subj = PREMISE_SUBJECTS.find(sx => ctx.includes(sx.toLowerCase()))
    if (!subj) continue
    if (!PRESENT_VERB.test(line)) continue
    const lo = Math.max(0, i - WINDOW), hi = Math.min(lines.length, i + WINDOW + 1)
    const near = lines.slice(lo, hi).join(' ')
    const m = near.match(DATE_RE)
    out.push({ file, line: i + 1, subject: subj, dated: Boolean(m), when: m ? m[0] : '',
               text: line.trim().replace(/^\/\/\s?/, '').slice(0, 96) })
  }
  return out
}

// ── self-test ───────────────────────────────────────────────────────────────

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()

  // The parser, against the shape that defeats a naive regex.
  const doc = [
    '# T', '<!-- claim: a.b = 1 -->', '', '```', '<!-- claim: quoted.c = 9 -->', '```',
    '<!-- claim: d.e = 2.5 -->', 'a.b = 1',
  ].join('\n')
  const got = parseClaims(doc)
  check('markers are found inside HTML comments', got.length === 2, JSON.stringify(got))
  check('a marker inside a fenced block is a QUOTATION, not a claim',
    !got.some(c => c.name === 'quoted.c'),
    'CC-CMD-2026-09-11 quotes seven while specifying this harness')
  check('a bare `a.b = 1` line is NOT a marker',
    !got.some(c => c.raw === '1' && c.name === 'a.b' && c.line > 7),
    'the marker form is the comment, not the text')

  // THE FALSE NEGATIVE, ASSERTED RATHER THAN DESCRIBED. The CC-CMD says a naive
  // regex finds zero; this proves it on the real docs, so the claim cannot rot.
  const realDocs = readdirSync('docs').filter(f => f.endsWith('.md'))
  let naive = 0, real = 0
  for (const f of realDocs) {
    const t = readFileSync(`docs/${f}`, 'utf8')
    naive += (t.match(/^\s*[A-Za-z_][\w.]*\s*=\s*[\d.]+\s*$/gm) || []).length
    if (!f.startsWith('CC-CMD-')) real += parseClaims(t).length
  }
  check('the naive `^name.field = value` regex really does find ZERO',
    naive === 0, `naive found ${naive}; this parser found ${real}`)
  check('...and this parser finds markers the naive one missed',
    real > 0, `${real} marker(s) across docs/`)

  // The three states, and the one that must never be confused with success.
  check('agreeing values HOLD', stateOf({ value: 592 }, '592') === 'HOLDS')
  check('disagreeing values are STALE', stateOf({ value: 252 }, '245') === 'STALE')
  check('AN UNREACHABLE SOURCE IS UNCHECKABLE, NOT HOLDS',
    stateOf({ unreachable: 'no relay' }, '245') === 'UNCHECKABLE',
    'reporting a marker as holding when nothing verified it is the failure this file is about')
  // THE LINE ABOVE PASSES FOR THE WRONG REASON ON ITS OWN, and mutation C1
  // proved it: `{unreachable}` also has `value === undefined`, so deleting the
  // unreachable guard entirely left the NEXT guard catching it and the
  // assertion stayed green with the branch it names deleted. The sharp case is
  // a resolver that returns BOTH — an unreachable source that still carries a
  // stale cached value is precisely how "nothing verified it" turns into HOLDS.
  check('...even when the resolver ALSO carries a value',
    stateOf({ unreachable: 'no relay', value: 245 }, '245') === 'UNCHECKABLE',
    'C1: unreachable must win over a value that happens to agree')
  check('an undefined live value is UNCHECKABLE, not a silent match',
    stateOf({ value: undefined }, '245') === 'UNCHECKABLE',
    'a resolver returning nothing must not compare as nothing')
  check('a null live value is UNCHECKABLE too',
    stateOf({ value: null }, '0') === 'UNCHECKABLE',
    'null == 0 in the wrong comparison, which would read as HOLDS')
  check('numeric equality ignores string/number type',
    compare('97.96', 97.96) === 'HOLDS')
  check('NO TOLERANCE: a near miss is STALE',
    compare('97.96', 95.24) === 'STALE',
    '"close enough" is how 245 survived a move to 252')

  // THE PREMISE SCANNER'S OWN CONTROL, asserted rather than described.
  // Desk.fs:1369 is the known present-tense premise CC-CMD-2026-09-11 names. It
  // took three fixes to reach — two-line window, comment-marker strip, whitespace
  // collapse — and each intermediate version looked right and found nothing. A
  // scanner that silently stops reaching it is indistinguishable from a repo
  // with no undated premises, so the control is a check, not a paragraph.
  const wrapped = premisesIn('// ... surface. The\n// FIELD app computes a thing\n', 'x.fs')
  check('a subject that WRAPS across two comment lines is still found',
    wrapped.length === 1 && wrapped[0].line === 2,
    JSON.stringify(wrapped))
  if (existsSync('src/Desk.fs')) {
    const body = readFileSync('src/Desk.fs', 'utf8')
    const real = premisesIn(body, 'src/Desk.fs')

    // ANCHORED ON THE SUBJECT'S TEXT, NOT ITS LINE NUMBER.
    //
    // This control read `real.some(p => p.line === 1369)` and went red on
    // 2026-10-03, where it stayed for six days and took the `claim-sweep` job
    // with it. Nothing was wrong with the scanner: the premise had moved to
    // 1468 and the control could no longer find its own subject. A control
    // pinned to a line number is guaranteed to reach that state eventually,
    // and while it is there it is indistinguishable from the scanner breaking.
    //
    // It is also the exact failure this file's own check:citations guards
    // against in documents — a citation that quotes nothing cannot survive its
    // subject moving — committed in the harness that exists to catch it.
    //
    // The subject is the `1 - homeWP` premise CC-CMD-2026-09-11 names. Its line
    // is looked up, and whether it is THERE is now a separate check from
    // whether the scanner finds it: a deleted subject and a blind scanner are
    // different facts and used to produce the same two failures.
    const SUBJECT = '1 - homeWP'
    const at = body.split('\n').findIndex(l => l.includes(SUBJECT)) + 1
    check(`THE CONTROL HAS A SUBJECT: \`${SUBJECT}\` is in src/Desk.fs`,
      at > 0,
      `the control cannot run — its subject is not in the file at all, so the two checks ` +
      `below would fail for a reason that has nothing to do with the scanner`)
    check(`THE CONTROL: src/Desk.fs:${at || '?'} is found as a present-tense premise`,
      at > 0 && real.some(p => p.line === at),
      `lines found: ${real.map(p => p.line).join(', ') || 'none'}`)
    check('...and it is UNDATED, which is the finding',
      at > 0 && real.some(p => p.line === at && !p.dated),
      'a dated premise carries its verification; this one asserts the present tense with no date')
  }

  // THE TRANSCRIPTION READER, anchored per binding.
  const fsFixture = [
    'let nominal: Scale<Nominal> =',
    '    { Max = 300<point>; Name = "nominal" }',
    'let relayReachable: Scale<RelayReachable> =',
    '    { Max = 245<point>; Name = "relay" }',
  ].join('\n')
  // BOOLEAN FORM, and the first draft of these two got it wrong in both
  // directions: createChecks' `check(name, pass, detail)` takes a boolean, and a
  // (got, want) call passes the VALUE as `pass`. The null case failed correctly;
  // the '300/245' case PASSED on a truthy string without comparing anything.
  // A vacuous assertion in the file whose subject is vacuous assertions.
  check('a transcribed Max is read for the binding it belongs to',
    [transcribedMax(fsFixture, 'nominal'), transcribedMax(fsFixture, 'relayReachable')].join('/') === '300/245',
    'a bare /Max = (\\d+)/ reads the FIRST literal for both bindings')
  check('a binding that is not there reads null, not a neighbour\'s value',
    transcribedMax(fsFixture, 'notABinding') === null,
    'returning some other record\'s number would be a wrong answer, which is worse than none')
  check('equal values MATCH', transcriptionState(245, 245) === 'MATCHES')
  check('DIFFERENT VALUES DIVERGE', transcriptionState(245, 252) === 'DIVERGED',
    'the live case today: src/Ceiling.fs holds 245, the relay reaches 252')
  check('an unreadable local value is UNCHECKABLE, not a match',
    transcriptionState(null, 252) === 'UNCHECKABLE',
    'same discipline as the marker states: nothing verified is never agreement')
  check('an unreachable relay is UNCHECKABLE too',
    transcriptionState(245, null) === 'UNCHECKABLE',
    'without the relay there is nothing to compare the copy against')
  check('every declared transcription names a relay export that exists',
    TRANSCRIPTIONS.every(t => typeof t.relay === 'string' && t.relay.length > 0),
    'a transcription row with no source is a row that can only ever say UNCHECKABLE')

  // Every marker in the repo has a resolver, or the sweep silently shrinks.
  const unresolved = []
  for (const f of realDocs.filter(x => !x.startsWith('CC-CMD-'))) {
    for (const c of parseClaims(readFileSync(`docs/${f}`, 'utf8'))) {
      if (!RESOLVERS[c.name]) unresolved.push(`${f}:${c.name}`)
    }
  }
  check('every marker in docs/ has a resolver',
    unresolved.length === 0,
    unresolved.length ? unresolved.join(', ') : 'all mapped')

  console.log('')
  const failed = summarize()
  console.log('\nCOVERAGE: the parser, the three states and the resolver map. It does NOT')
  console.log('run the resolvers against live sources — that is the sweep below.')
  process.exit(failed ? 1 : 0)
}

if (isMain(import.meta.url) && process.argv.includes('--premises')) {
  const { readdirSync: rd } = await import('node:fs')
  const targets = [
    ...rd('docs').filter(f => f.endsWith('-PROOF.md')).map(f => `docs/${f}`),
    ...rd('src').filter(f => f.endsWith('.fs')).map(f => `src/${f}`),
  ]
  const all = []
  for (const t of targets) all.push(...premisesIn(readFileSync(t, 'utf8'), t))

  console.log(`=== present-tense production premises  ${new Date().toISOString()} ===\n`)
  const undated = all.filter(p => !p.dated)
  console.log(`  ${all.length} premise(s) across ${targets.length} file(s): ` +
              `${all.length - undated.length} DATED, ${undated.length} UNDATED\n`)
  for (const p of all) {
    console.log(`  ${p.dated ? 'DATED  ' : 'UNDATED'}  ${p.file}:${p.line}  [${p.subject}]`)
    console.log(`            ${p.text}`)
    if (p.dated) console.log(`            (nearest date within ${WINDOW} lines: ${p.when})`)
  }
  console.log(`\nRECOMMENDED CONVENTION, not applied in this session:`)
  console.log(`  a present-tense claim about another system carries its verification inline —`)
  console.log(`  "<claim> (verified <YYYY-MM-DD> at <ref>)". Desk.fs:1369 would read`)
  console.log(`  "computed a win-probability away side as 1 - homeWP (true at bf67bad,`)
  console.log(`  2026-09-11; FALSE at HEAD)". Past tense plus a ref cannot go stale —`)
  console.log(`  it stops being a claim about now and becomes a claim about then.`)
  console.log(`\nCOVERAGE: ${targets.length} files — docs/*-PROOF.md and src/*.fs. It does NOT`)
  console.log(`read CC-CMDs, outbox/, HANDOFF.md, or any other repo. DATED means a year or`)
  console.log(`date appears within ${WINDOW} lines — it does NOT mean the claim is still true.`)
  process.exit(0)
}

// ── the sweep ───────────────────────────────────────────────────────────────

// IMPORTING THIS MODULE MUST NOT RUN IT. import-purity-check.mjs rejected the
// first version of this file at the pre-commit hook: the sweep ran at import
// time and called process.exit, so anything importing `parseClaims` or
// `stateOf` would have terminated before its own next line. That check exists
// because three modules already did this, and one of them nearly published the
// results of a probe that never executed.
if (!isMain(import.meta.url)) { /* exported for reuse; the sweep below is CLI-only */ }
else {
const DOCS = readdirSync('docs').filter(f => f.endsWith('.md') && !f.startsWith('CC-CMD-')).sort()

const rows = []
for (const f of DOCS) {
  for (const c of parseClaims(readFileSync(`docs/${f}`, 'utf8'))) {
    const r = RESOLVERS[c.name]
    const resolved = r ? await r() : { unreachable: 'no resolver is defined for this marker' }
    rows.push({
      doc: f, name: c.name, line: c.line, claimed: c.raw,
      live: resolved.unreachable ? '—' : String(resolved.value),
      state: stateOf(resolved, c.raw),
      why: resolved.unreachable || '',
    })
  }
}

const w = (k, min) => Math.max(min, ...rows.map(r => String(r[k]).length))
const wd = w('doc', 3), wn = w('name', 6), wc = w('claimed', 7), wl = w('live', 4)

console.log(`=== claim sweep  ${new Date().toISOString()} ===\n`)
console.log(`${'doc'.padEnd(wd)}  ${'marker'.padEnd(wn)}  ${'claimed'.padEnd(wc)}  ${'live'.padEnd(wl)}  state`)
console.log(`${'-'.repeat(wd)}  ${'-'.repeat(wn)}  ${'-'.repeat(wc)}  ${'-'.repeat(wl)}  -----`)
for (const r of rows) {
  console.log(`${r.doc.padEnd(wd)}  ${r.name.padEnd(wn)}  ${r.claimed.padEnd(wc)}  ${r.live.padEnd(wl)}  ${r.state}` +
              (r.why ? `\n${' '.repeat(wd + wn + wc + wl + 8)}(${r.why})` : ''))
}

// ── transcriptions, printed beside the markers ──────────────────────────────
const tRows = []
for (const t of TRANSCRIPTIONS) {
  const local = existsSync(t.file) ? transcribedMax(readFileSync(t.file, 'utf8'), t.binding) : null
  const live = relay ? relay[t.relay] : null
  tRows.push({
    ...t, local, live,
    state: transcriptionState(local, live),
    why: !relay ? relayError : (local === null ? `no \`let ${t.binding}\` with a Max literal in ${t.file}` : ''),
  })
}
if (tRows.length) {
  console.log(`\nTRANSCRIPTIONS — a local copy of a value this repo does not own`)
  for (const r of tRows) {
    console.log(`  ${r.file}  ${r.binding.padEnd(15)} ${String(r.local ?? '—').padStart(4)}` +
                `   vs relay ${r.relay} ${String(r.live ?? '—').padStart(4)}   ${r.state}` +
                (r.why ? `\n      (${r.why})` : ''))
  }
  const div = tRows.filter(r => r.state === 'DIVERGED')
  if (div.length) {
    console.log(`\n  ${div.length} DIVERGED. This is why scripts/docs-check.mjs can report`)
    console.log(`  "every claim a document makes is still true" while the table above says`)
    console.log(`  STALE: it resolves ceiling.* through build/Ceiling.js, so it compares this`)
    console.log(`  copy against a document holding the same numbers. Two copies agreeing is`)
    console.log(`  not a claim being true.`)
    console.log(`  NOT A FAILURE HERE: whether src/Ceiling.fs is stale or is deliberately`)
    console.log(`  encoding the historical scale the 240 bar was set against is an open`)
    console.log(`  judgement, and this does not make it.`)
  }
}

const n = s => rows.filter(r => r.state === s).length
console.log(`\n  HOLDS ${n('HOLDS')}   STALE ${n('STALE')}   UNCHECKABLE ${n('UNCHECKABLE')}   of ${rows.length} marker(s) in ${DOCS.length} doc(s)`)
console.log(`\nCOVERAGE: ${n('HOLDS') + n('STALE')} of ${rows.length} markers were compared against a live source.`)
if (n('UNCHECKABLE')) {
  console.log(`${n('UNCHECKABLE')} were NOT, and are listed above with the reason. An UNCHECKABLE`)
  console.log(`marker is a gap in this sweep, not a marker that holds.`)
}
console.log(`Markers inside fenced blocks are skipped as quotations; CC-CMD-*.md is excluded.`)

// STALE does not fail the run. The CC-CMD is explicit that detecting drift and
// deciding what a proof document should now argue are different jobs, and a red
// that nobody is permitted to fix is a red everyone learns to skip.
// UNCHECKABLE does not fail it either — but it is never silent.
process.exit(0)
}
