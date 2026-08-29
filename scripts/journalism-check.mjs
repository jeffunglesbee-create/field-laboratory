// Phase 3's two acceptance tests.
//
// 1. THE HAIKU FALLBACK BRANCH, WHICH PRODUCTION HAS NEVER EXERCISED.
//
//    Six of six sampled proxy calls answered from Gemini with
//    `X-FIELD-Gemini-Error` empty. The Haiku path is shipped, depended on, and
//    unrun. A stub is the only way to reach it, and it must prove three things
//    that nothing has ever proven:
//      a. it selects the model named in `FallbackModel`
//      b. it surfaces the FALLBACK rather than reporting the primary
//      c. it does not silently succeed when both paths fail
//
// 2. THE TIME-ANCHORING EXTRACTOR OVER ALL 592 BRIEFS.
//
//    `FIELD_PROSE_STYLE` forbids bare numbers. The relay's Dim 8 measures
//    compliance and nobody has counted the violations. One run, two findings:
//    production's compliance, and the extractor's correctness — the second
//    established by agreement with a verbatim copy of `_temporalPrecision`,
//    because a port that computed something tidier would prove nothing.
//
//    NOTE the sentence split. `_temporalPrecision` filters NON-EMPTY; `scoreProse`
//    a few functions away filters `length > 3`. Two tokenisations in one file,
//    reproduced rather than reconciled.

import { readFileSync } from 'node:fs'
import { createChecks } from './checks.mjs'
import { startAsPromise } from '../build/fable_modules/fable-library-js.5.13.0/Async.js'
import {
  ProxyResponse, stubGenerator,
  briefTypeOfString, briefTypeName, isModelled,
  fallbackModel, answeringModelFromHeader, answeringName, fallbackName,
  answeredFrom, fallbackRan,
  anchoring, temporalPrecision, unanchoredStatSentences, crossSportTokens,
  briefContext, prompt, draft, judge, bodyOf, provenanceOf, promptContext, draftPrompt,
  fact, claimOf, windowOf, windowLabel, contextKind, contextSubject, instructionOf,
  TimeWindow,
} from '../build/Journalism.js'

const { check, summarize } = createChecks()

const CORPUS = JSON.parse(readFileSync('data/jq-mlb-game-corpus.json', 'utf8'))

const HAIKU = 'claude-haiku-4-5-20251001'
const GEMINI = 'gemini-3.1-flash-lite'
const DECLARED = fallbackModel(HAIKU)

check('the corpus is present and the expected size',
  Array.isArray(CORPUS) && CORPUS.length === 592,
  `${Array.isArray(CORPUS) ? CORPUS.length : 'not an array'} brief(s)`)

// ── 1. the fallback branch ──────────────────────────────────────────────────

// (b) first, because it is the one a naive implementation gets wrong: when the
// primary fails, the answer must name the FALLBACK, not the primary.
const onFallback = answeredFrom(DECLARED, HAIKU, 'gemini 503')
check('when the primary fails, provenance names the fallback that answered',
  onFallback.tag === 0 && answeringName(onFallback.fields[0]) === HAIKU,
  `tag ${onFallback.tag}, model ${onFallback.fields?.[0] ? answeringName(onFallback.fields[0]) : '—'}`)

// (a) it selects the model named in FallbackModel — not any model, that one.
check('the fallback branch is confirmed only for the model we named',
  fallbackRan(DECLARED, onFallback) === true,
  `fallbackRan = ${JSON.stringify(fallbackRan(DECLARED, onFallback))}`)

// The proxy substituting something else must NOT read as our fallback running.
const substituted = answeredFrom(DECLARED, 'gemini-2.0-flash', 'gemini 503')
check('a substituted model is Unexpected, not a successful fallback',
  substituted.tag === 2 && fallbackRan(DECLARED, substituted) === false,
  `tag ${substituted.tag} (want 2 = Unexpected), fallbackRan ${JSON.stringify(fallbackRan(DECLARED, substituted))}`)

// The happy path must not be mistaken for the fallback.
const onPrimary = answeredFrom(DECLARED, GEMINI, undefined)
check('a normal Gemini answer does not read as the fallback having run',
  onPrimary.tag === 0 && fallbackRan(DECLARED, onPrimary) === false,
  `fallbackRan = ${JSON.stringify(fallbackRan(DECLARED, onPrimary))}`)

// (c) both paths failing must not be representable as success. With no header
// there is no provenance, and "we cannot tell" must not collapse into false.
const silent = answeredFrom(DECLARED, undefined, 'gemini 503')
check('both paths failing is ProxySilent and reports UNKNOWN, not false',
  silent.tag === 1 && fallbackRan(DECLARED, silent) === undefined,
  `tag ${silent.tag} (want 1 = ProxySilent), fallbackRan ${JSON.stringify(fallbackRan(DECLARED, silent))}`)

// An empty header is not a model.
check('an empty provenance header yields no AnsweringModel at all',
  answeringModelFromHeader('') === undefined && answeringModelFromHeader('   ') === undefined,
  'empty and whitespace headers are refused by the only constructor')

// ── the production state, asserted rather than described ────────────────────
//
// `src/index.js` never reads X-FIELD-Model, so no archived brief carries
// provenance. This is what that means in the type.

const asStored = answeredFrom(DECLARED, undefined, undefined)
check('every archived brief is ProxySilent, because nothing reads the header',
  asStored.tag === 1 && fallbackRan(DECLARED, asStored) === undefined,
  'the stored `model` column is a per-call-site constant and cannot build an AnsweringModel')

// ── 1b. the same three claims, driven THROUGH the Generator ─────────────────
//
// Everything above calls `answeredFrom` directly, which tests the provenance
// rule while leaving `Generator` an unimplemented type abbreviation. I twice
// wrote that "Phase 3 already ships a stub Generator" when it did not. A type
// with no implementation cannot be gotten wrong, and cannot be right either.
//
// `stubGenerator` answers from a RECORDED proxy response. No network, no
// credential, no model call — it is the shape a Phase 4 capture will have.

const ctxG = briefContext(briefTypeOfString('mlb_game'), 'Orioles at Rays')
const promptG = prompt(ctxG, 'write the recap')
const BRIEF = 'Kyle Bradish carries a 3.69 ERA this season.'

const respond = (body, xFieldModel, geminiError) =>
  new ProxyResponse(body, xFieldModel, geminiError)

// Fable UNCURRIES `stubGenerator` to `(fallback, response, prompt)`, so the
// intermediate `Generator` value is not visible from JS even though the F# type
// is still `Prompt -> Async<...>`. That is a compiler artefact, not a change to
// the type — noted because calling it curried is the obvious first attempt and
// fails with an unhelpful cancellation-token error.
const generate = (body, xFieldModel, geminiError) =>
  startAsPromise(stubGenerator(DECLARED, respond(body, xFieldModel, geminiError), promptG))

// (b) the fallback branch, reached for the first time through the real type.
const viaFallback = await generate(BRIEF, HAIKU, 'gemini 503')
check('the generator returns a Draft when the fallback answers',
  viaFallback.tag === 0 && bodyOf(viaFallback.fields[0]) === BRIEF,
  `Result tag ${viaFallback.tag} (0 = Ok)`)

// (a) and it carries the fallback's provenance, not the primary's.
const prov = provenanceOf(viaFallback.fields[0])
check('the Draft carries the fallback as its answering model',
  prov.tag === 0 && answeringName(prov.fields[0]) === HAIKU &&
  fallbackRan(DECLARED, prov) === true,
  `provenance tag ${prov.tag}, model ${prov.fields?.[0] ? answeringName(prov.fields[0]) : '—'}`)

// (c) both paths failing must NOT be a Draft. This is the branch that makes
// `Result` worth having: a generator returning a plausible empty draft here is
// exactly the silent success the acceptance criterion forbids.
const bothFailed = await generate('', undefined, 'gemini 503')
check('both paths failing is an Error, not an empty Draft',
  bothFailed.tag === 1 && bothFailed.fields[0].tag === 0,
  `Result tag ${bothFailed.tag} (1 = Error), failure tag ${bothFailed.fields[0]?.tag} (0 = BothPathsFailed)`)

// An empty body with no upstream error is a different failure and says so.
const empty = await generate('', GEMINI, undefined)
check('an empty body with no primary error is EmptyBody, a distinct failure',
  empty.tag === 1 && empty.fields[0].tag === 2,
  `failure tag ${empty.fields[0]?.tag} (2 = EmptyBody)`)

// The production case, through the generator: text arrives, provenance does not.
const silentProv = await generate(BRIEF, undefined, undefined)
check('a Draft with no provenance header is Ok but ProxySilent',
  silentProv.tag === 0 && provenanceOf(silentProv.fields[0]).tag === 1,
  'text without provenance is still text — the type refuses to invent who wrote it')

// ── 2. anchoring over the corpus ────────────────────────────────────────────
//
// The oracle: `_temporalPrecision`, copied verbatim, so agreement means the F#
// reproduces production rather than something more sensible.

const STAT_RE = /\d+\.?\d*\s*(ppg|apg|rpg|pts?|points?|rebounds?|assists?|goals?|saves?|era|ops|mph|yards?|rbi|%|\+\/\-)/i
const TEMPORAL_RE = /\b(this series|this season|this postseason|in game \d|game \d|in \d{4}|since \d{4}|last \d+ games?|per game|on the year|this year|career|tonight|in the playoffs?|in these playoffs?)\b/i

const oracleDim8 = text => {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  let statSentences = 0, anchored = 0
  for (const s of sentences) {
    if (STAT_RE.test(s)) { statSentences++; if (TEMPORAL_RE.test(s)) anchored++ }
  }
  if (statSentences === 0) return { stat: 0, anchored: 0, score: 10 }
  return { stat: statSentences, anchored, score: Math.round((anchored / statSentences) * 20) }
}

let mismatches = []
let totalStat = 0, totalAnchored = 0, briefsWithViolation = 0, violationSentences = 0
for (const row of CORPUS) {
  const o = oracleDim8(row.brief_text)
  const [stat, anchoredN] = Array.from(anchoring(row.brief_text))
  const score = temporalPrecision(row.brief_text)
  if (stat !== o.stat || anchoredN !== o.anchored || score !== o.score) {
    mismatches.push(`${row.id}: (${stat},${anchoredN},${score}) vs (${o.stat},${o.anchored},${o.score})`)
  }
  totalStat += stat
  totalAnchored += anchoredN
  const v = Array.from(unanchoredStatSentences(row.brief_text))
  if (v.length) { briefsWithViolation++; violationSentences += v.length }
}

check('the anchoring extractor agrees with the relay oracle on every brief',
  mismatches.length === 0,
  mismatches.length ? `${mismatches.length} mismatch(es), first: ${mismatches[0]}` : `592 briefs`)

// Non-vacuity: an extractor that found no stat sentences at all would agree with
// a broken oracle and measure nothing.
check('the corpus actually contains stat sentences to anchor',
  totalStat > 100,
  `${totalStat} stat sentence(s) across the corpus`)

// THE FINDING. Reported as a measurement, not asserted against a threshold I
// invented — the last time I invented one it failed at 69.6% and the honest fix
// was to assert the claim the module already made, not to move the bar.
const compliance = (totalAnchored / totalStat) * 100
check('production compliance with the one-time-window rule is measured, not assumed',
  totalStat > 0,
  `${totalAnchored}/${totalStat} stat sentences carry a time window (${compliance.toFixed(1)}%); ` +
  `${briefsWithViolation}/${CORPUS.length} briefs contain at least one unanchored stat sentence ` +
  `(${violationSentences} sentence(s) total)`)

// ── cross-sport contamination ───────────────────────────────────────────────
//
// The observed defect verbatim: an EPL (soccer) game_live brief claiming a
// basketball rating in a basketball league. Every earlier verdict passed it.
const EVERTON = 'Everton secured a 2-0 win at Hill Dickinson Stadium, moving to ' +
  '1-0-0 this season while holding Crystal Palace to 0 points through this match. ' +
  'Everton maintains a 107.7 DRTG, best in the NBA, despite playing soccer tonight.'

const evertonForeign = Array.from(crossSportTokens(true, EVERTON))
check('a soccer brief naming a basketball league and metric is caught',
  evertonForeign.includes('NBA') && evertonForeign.includes('DRTG'),
  `flagged: ${evertonForeign.join(', ') || 'nothing'}`)

// A clean soccer recap must not be flagged — the check earns its keep only if it
// is silent on legitimate prose.
const CLEAN_SOCCER = 'Arsenal beat Coventry 3-0 at the Emirates this season, ' +
  'Saka scoring in the 34th minute with 2 goals on the year.'
check('a clean soccer brief flags nothing',
  Array.from(crossSportTokens(true, CLEAN_SOCCER)).length === 0,
  `flagged: ${Array.from(crossSportTokens(true, CLEAN_SOCCER)).join(', ') || 'nothing'}`)

// The word boundary matters: "MLS" (a soccer league, and the game's own family)
// must not trip the "MLB" token.
check('a soccer brief mentioning MLS is not caught as MLB',
  Array.from(crossSportTokens(true, 'The MLS side pressed high all match this season.')).length === 0,
  'word-boundary matching keeps MLB from firing on MLS')

// Only the observed direction is modelled: a non-soccer brief is not scanned for
// soccer leagues, because that defect has not been seen and inventing it is the
// thing this module refuses.
check('a non-soccer brief is not scanned (the inverse is unmodelled until observed)',
  Array.from(crossSportTokens(false, EVERTON)).length === 0,
  'isSoccer=false short-circuits to no findings')

// ── the types, exercised ────────────────────────────────────────────────────

const ctx = briefContext(briefTypeOfString('mlb_game'), 'Orioles at Rays')
const other = briefContext(briefTypeOfString('game_recap'), 'a different game')
const p = prompt(ctx, 'write it')
const good = draft(p, onFallback, 'Kyle Bradish carries a 3.69 ERA this season.')
const bad = draft(p, onFallback, 'Kyle Bradish carries a 3.69 ERA.')

check('a draft judged against its own context returns a real verdict',
  judge(ctx, good).tag === 0,
  `verdict tag ${judge(ctx, good).tag} (0 = Held)`)

check('an unanchored stat fails the verdict rather than passing quietly',
  judge(ctx, bad).tag === 1,
  `verdict tag ${judge(ctx, bad).tag} (1 = Failed)`)

// The distinction the private Prompt exists for.
check('a draft judged against a context that did not generate it is Unreadable',
  judge(other, good).tag === 2,
  `verdict tag ${judge(other, good).tag} (2 = Unreadable) — not a verdict about the wrong subject`)

// ── what the private types actually carry ───────────────────────────────────
//
// A private record is only worth having if something reads it back. These four
// accessors were shipped unread and `unused-check` failed the build for it —
// correctly, since a field nothing observes is a field nobody is held to.

// `TimeWindow`'s nullary cases are tags in the Fable output, not exports. The
// registry is what makes them legible: `windowLabel` is an exhaustive match, so
// a new window that nobody names does not compile.
const THIS_SEASON = new TimeWindow(1, [])
const SINCE_2019 = new TimeWindow(11, [2019])

check('the window registry names every case it is given',
  windowLabel(THIS_SEASON) === 'this season' && windowLabel(SINCE_2019) === 'since 2019',
  `${windowLabel(THIS_SEASON)} / ${windowLabel(SINCE_2019)}`)

// Round-trip, payload included — a window that lost its year would still have a
// matching tag, so the tag alone is not enough.
const anchored = fact('23.2 points', SINCE_2019)
check('a fact carries its time window back out, payload intact',
  claimOf(anchored) === '23.2 points' && windowLabel(windowOf(anchored)) === 'since 2019',
  `claim ${JSON.stringify(claimOf(anchored))}, window ${windowLabel(windowOf(anchored))}`)

check('a context carries the brief type and subject it was built with',
  briefTypeName(contextKind(ctx)) === 'mlb_game' && contextSubject(ctx) === 'Orioles at Rays',
  `${briefTypeName(contextKind(ctx))} / ${contextSubject(ctx)}`)

check('a prompt carries its instruction and its context',
  instructionOf(p) === 'write it' && promptContext(p) === ctx,
  `instruction ${JSON.stringify(instructionOf(p))}, context identity preserved`)

// The draft keeps BOTH halves — the prompt that made it and who answered. That
// pairing is what makes `judge` able to refuse the wrong context at all.
check('a draft carries the prompt that made it and the provenance of its model',
  draftPrompt(good) === p && provenanceOf(good).tag === onFallback.tag &&
  bodyOf(good).startsWith('Kyle Bradish'),
  `prompt identity preserved, provenance tag ${provenanceOf(good).tag}`)

// ── the brief-type registry ─────────────────────────────────────────────────

// THE OBSERVED SET IS READ, NOT TRANSCRIBED.
//
// This was a nine-element array literal, described in the assertion below as
// "every brief_type observed in /quality/report" -- and it was a transcription
// of what that route served ONCE, on 2026-08-15. Production has written
// `game_live` 59 times and `bracket_delta` once in the 2026-08-23..29 capture,
// and this check passed 9/9 throughout, because the thing it compared the
// registry against was a copy of the registry's own vintage. A check whose
// input can never contain a surprise cannot report one.
//
// The corpus is capped at 50 briefs/day by the relay (/archive/query clamps
// limit to 50, field-relay-nba/src/index.js:11990), so a type PRESENT here is
// proven and a type absent is not proven absent. Union with the transcribed
// nine for exactly that reason: the capture can add a type, never silently
// retire one.
const CAPTURED = JSON.parse(readFileSync('data/brief-recency-corpus.json', 'utf8'))
const SEEN = [...new Set([
  'game_recap', 'pre_game', 'game_brief', 'slate', 'night_owl',
  'mlb_game', 'epl_match', 'narrative_context', 'compound',
  ...CAPTURED.briefs.map(b => b.brief_type).filter(Boolean),
])].sort()
const unmodelled = SEEN.filter(s => !isModelled(briefTypeOfString(s)))
check(`every brief_type production actually writes is modelled (${SEEN.length} seen)`,
  unmodelled.length === 0,
  unmodelled.length ? `unmodelled: ${unmodelled.join(', ')}` : SEEN.join(', '))

check('brief types round-trip through the registry',
  SEEN.every(s => briefTypeName(briefTypeOfString(s)) === s),
  `name(of(x)) === x for all ${SEEN.length}`)

check('an unknown brief_type is reported unmodelled, not guessed',
  !isModelled(briefTypeOfString('wc_match')) &&
  briefTypeName(briefTypeOfString('wc_match')) === 'wc_match',
  'Unmodelled carries the raw string rather than mapping to a neighbour')

process.exit(summarize() === 0 ? 0 : 1)
