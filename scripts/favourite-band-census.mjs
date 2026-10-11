#!/usr/bin/env node
// What is hiding in the band `favouriteAgreement` declines to judge?
//
// WHY
//
// `Desk.favouriteAgreement` refuses to name a favourite when the two moneyline
// prices separate by less than the book's own overround. That threshold is
// right and it is measured, not tuned: MLB_2026-08-10_cardinals_phillies at
// -113/-107 separates by 0.0136 against a vig of 0.0474, and there is no
// favourite there.
//
// But it means a slice of every slate is UNJUDGED. On 2026-08-25 that was 3 of
// 14 MLB games with odds — 21%. A handicap orientation that was systematically
// wrong for close games would live in that slice permanently, because nothing
// looks.
//
// THE SHADOW, AND WHY IT IS NOT A SECOND IMPLEMENTATION
//
// This computes the ML-vs-handicap comparison WITHOUT the vig gate, purely to
// fill the band the real function declines. That shadow is validated against
// the real function on every game the real function DOES judge: wherever
// `favouriteAgreement` returns Agrees or Disagrees, the shadow must say the
// same. A single mismatch voids the census and this script says so and exits
// non-zero, because a shadow that has drifted measures nothing.
//
// Reads the real compiled decoders and the real `favouriteAgreement` from the
// Fable build. There is no second copy of the rubric here.

import { readFileSync, writeFileSync } from 'node:fs';
import { decodePayload, favouriteAgreement } from '../build/Desk.js';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DAYS = Number(arg('--days', '45'));
const RELAY = arg('--relay', 'https://field-relay-nba.jeffunglesbee.workers.dev');
import { isMain } from './checks.mjs';

// IMPORT PURITY (import-purity-check.mjs). This module exports functions, which
// is a declaration that something else may import it — so it must not run, and
// must not exit, at import time. `isMain` gates both the self-test and the live
// section. Written without it, an importer got this module's output and exit
// code instead of its own, silently.
const IS_MAIN = isMain(import.meta.url);
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test');

/** American odds → implied probability. */
const implied = a => (a < 0 ? -a / (-a + 100) : 100 / (a + 100));

/**
 * The shadow verdict: does the moneyline favourite hold the negative handicap,
 * ignoring whether the separation clears the vig?
 * Returns 'agree' | 'disagree' | null (not two comparable numbers at all).
 */
export function shadowVerdict(mh, ma, sh, sa) {
  if (![mh, ma, sh, sa].every(Number.isFinite)) return null;
  if (sh !== -sa || sh === 0) return null;      // unbalanced or pick'em handicap
  const ih = implied(mh), ia = implied(ma);
  if (ih === ia) return null;                    // no favourite at all
  return (ih > ia) === (sh < 0) ? 'agree' : 'disagree';
}

/**
 * Did the corpus COLLAPSE since the last census?
 *
 * Not a guessed floor — a comparison between two measurements. The question a
 * fixed threshold cannot answer is "is 140 games a lot or a little", and the
 * answer depends entirely on the window and the season. The question this CAN
 * answer is "did it fall off a cliff since last time", which is what a relay
 * serving a tenth of its archive looks like.
 *
 * `null` previous means no reference yet: a first run cannot collapse, and
 * saying it did would make the check cry wolf on every fresh checkout.
 *
 * The ratio is games per PRESENT date, so a shorter window is not a collapse.
 */
export function collapsedSince(prev, now, floorRatio = 0.5) {
  if (!prev || !Number.isFinite(prev.gamesSeen) || !Number.isFinite(prev.present)) return null;
  if (prev.present === 0 || now.present === 0) return null;
  const before = prev.gamesSeen / prev.present;
  const after = now.gamesSeen / now.present;
  if (before === 0) return null;
  return after < before * floorRatio
    ? { before: Number(before.toFixed(2)), after: Number(after.toFixed(2)), floorRatio }
    : null;
}

/** The middle value, or NaN for an empty set. */
export function medianOf(xs) {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
}

/**
 * Is this total an outlier BY ITS OWN SPORT'S DISTRIBUTION?
 *
 * Derived, not asserted. Writing "MLB totals are 5 to 15" would be a constant
 * chosen to make the known-bad rows fail, which is the shape this project
 * refuses; the comparison comes from the data in front of it, the same way
 * `favouriteAgreement`'s threshold is the book's own overround.
 */
export function isTotalOutlier(total, median) {
  if (!Number.isFinite(total) || !Number.isFinite(median) || median <= 0) return false;
  return total < median / 2 || total > median * 2;
}

/**
 * Was this "opening" line captured at the moment the row was FINALISED?
 *
 * No threshold to argue about: the two timestamps are either the same moment or
 * they are not. A minute of slack covers the write ordering between the odds
 * fetch and the row update; it is not a tuning knob.
 *
 * `finalized_at` is stored space-separated and without a zone, so it is
 * normalised to ISO-with-Z rather than handed to Date.parse as-is, which reads
 * it as LOCAL time and silently shifts it by the runner's offset.
 */
export function capturedAtFinalisation(capturedAt, finalizedAt) {
  if (!capturedAt || !finalizedAt) return false;
  const c = Date.parse(capturedAt);
  const f = Date.parse(String(finalizedAt).replace(' ', 'T') + 'Z');
  return Number.isFinite(c) && Number.isFinite(f) && Math.abs(c - f) < 60_000;
}

/** Separation and overround, for reporting the band each game sits in. */
export function bandOf(mh, ma) {
  const ih = implied(mh), ia = implied(ma);
  const vig = ih + ia - 1;
  return { sep: Math.abs(ih - ia), vig, ratio: vig === 0 ? Infinity : Math.abs(ih - ia) / vig };
}

// ── ADJUDICATION BY PRICE ───────────────────────────────────────────────────
//
// Reading `point` alone made thirteen games over sixty days look as though the
// moneyline and the handicap disagreed, all of them home, all of them holding
// +1.5. `+1.5 at -240` is a favourite's ordinary alternate line; `+1.5 at +130`
// is a contradiction. The point cannot tell them apart and the price can.
//
// NO THRESHOLD IS INVENTED. Both sides are converted to implied probability and
// compared to each other, which is the same comparison `favouriteAgreement`
// already makes on the moneyline. If the handicap's own prices favour the side
// the moneyline favours, the two agree after all and the disagreement was an
// artefact of reading one number instead of two.
export const impliedProb = american =>
  american == null ? null : american < 0 ? -american / (-american + 100) : 100 / (american + 100);

export function adjudicate(mh, ma, shp, sap) {
  if (shp == null || sap == null) return 'no price';           // pre-2026-08-26 capture
  const ph = impliedProb(shp), pa = impliedProb(sap);
  if (ph === pa) return 'price is even';
  const mlHomeFavoured = mh < ma, spHomeFavoured = ph > pa;
  return mlHomeFavoured === spHomeFavoured ? 'agrees on price' : 'contradicted by price';
}


if (SELF_TEST) {
  let bad = 0;
  const t = (name, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { console.log('      → ' + d); bad++; } };

  // ── adjudication by price ────────────────────────────────────────────────
  // Reading `point` alone made thirteen games look as though the moneyline and
  // the handicap disagreed. `+1.5 at -240` is a favourite's ordinary alternate
  // line; `+1.5 at +130` is a contradiction. No threshold is invented — both
  // sides become implied probabilities and are compared to each other, the same
  // comparison favouriteAgreement already makes on the moneyline.
  t('a home ML favourite whose spread price also favours home AGREES',
    adjudicate(-140, 120, -240, 190) === 'agrees on price');
  t('a home ML favourite taking plus money on the handicap is CONTRADICTED',
    adjudicate(-140, 120, 130, -160) === 'contradicted by price');
  t('a capture with no price says so rather than guessing',
    adjudicate(-140, 120, null, null) === 'no price',
    'every capture before 2026-08-26 has none, and guessing would invent data');
  t('one price missing is still no price',
    adjudicate(-140, 120, -240, null) === 'no price');
  t('implied probability is the standard conversion',
    Math.abs(impliedProb(-200) - 2 / 3) < 1e-9 && Math.abs(impliedProb(100) - 0.5) < 1e-9);
  t('an even price on both sides is named, not forced to a side',
    adjudicate(-140, 120, -110, -110) === 'price is even');
  t('a home ML favourite holding the negative handicap agrees',
    shadowVerdict(-156, 129, -1.5, 1.5) === 'agree', shadowVerdict(-156, 129, -1.5, 1.5));
  t('the 2026-08-25 Padres row disagrees',
    shadowVerdict(-124, 103, 1.5, -1.5) === 'disagree', shadowVerdict(-124, 103, 1.5, -1.5));
  t('an away ML favourite holding the negative handicap agrees',
    shadowVerdict(141, -171, 1.5, -1.5) === 'agree', shadowVerdict(141, -171, 1.5, -1.5));
  // The near-pickem the real function refuses. The shadow still answers, which
  // is the entire point -- it fills the band, it does not re-judge it.
  t('a near-pickem still yields a shadow verdict',
    shadowVerdict(-113, -107, 1.5, -1.5) === 'disagree', shadowVerdict(-113, -107, 1.5, -1.5));
  t('an unbalanced handicap is not comparable', shadowVerdict(-150, 130, -1.5, 2.5) === null, 'expected null');
  t('a zero handicap is not comparable', shadowVerdict(-150, 130, 0, 0) === null, 'expected null');
  t('equal prices name no favourite', shadowVerdict(-110, -110, -1.5, 1.5) === null, 'expected null');
  // ── the plausibility pass ────────────────────────────────────────────────
  t('the median of an odd set is its middle', medianOf([7.5, 8.5, 9.5]) === 8.5, medianOf([7.5, 8.5, 9.5]));
  t('an empty set has no median', Number.isNaN(medianOf([])), medianOf([]));
  // The real 2026-06-28 value against a real MLB median.
  t('a 3.5 total is an outlier against an 8.5 median',
    isTotalOutlier(3.5, 8.5) === true, isTotalOutlier(3.5, 8.5));
  t('a normal MLB total is not', isTotalOutlier(8.5, 8.5) === false, isTotalOutlier(8.5, 8.5));
  t('the high end of a real slate is not', isTotalOutlier(10.5, 8.5) === false, isTotalOutlier(10.5, 8.5));
  t('a WNBA total against a WNBA median is not',
    isTotalOutlier(169.5, 168) === false, isTotalOutlier(169.5, 168));
  // Cross-sport contamination is exactly what a per-sport median prevents.
  t('a WNBA total against an MLB median IS', isTotalOutlier(169.5, 8.5) === true, 'missed');
  t('a missing total is not an outlier', isTotalOutlier(null, 8.5) === false, 'flagged a null');

  // The real 2026-06-28 pair: captured_at 20:35:24.440Z, finalized_at 20:35:22.
  t('odds captured at finalisation are caught',
    capturedAtFinalisation('2026-06-28T20:35:24.440Z', '2026-06-28 20:35:22') === true, 'missed');
  // A normal row: captured 10:01 pre-game, finalised 20:16 after.
  t('a genuine opening line is not caught',
    capturedAtFinalisation('2026-08-09T10:01:24.241Z', '2026-08-09 20:16:03') === false, 'false positive');
  t('a row with no finalized_at is not caught',
    capturedAtFinalisation('2026-08-09T10:01:24.241Z', null) === false, 'flagged an unfinalised row');
  // finalized_at carries no zone. Parsed as local it shifts by the runner's
  // offset and a real match reads as hours apart.
  t('finalized_at is read as UTC, not local',
    capturedAtFinalisation('2026-06-28T20:35:24.440Z', '2026-06-28 20:35:22') ===
    capturedAtFinalisation('2026-06-28T20:35:24.440Z', '2026-06-28T20:35:22'), 'zone handling differs');

  const b = bandOf(-124, 103);
  t('the band ratio matches the hand calculation',
    Math.abs(b.ratio - 1.32) < 0.01, `ratio ${b.ratio.toFixed(3)}`);

  // ── the collapse ratchet ─────────────────────────────────────────────────
  //
  // Built from the real numbers. Run 38145971449 saw 140 games over 120
  // present dates; run 38164136622 saw 1341 over the same window. The first is
  // the degraded one, so the collapse runs healthy -> degraded.
  const healthy = { present: 120, gamesSeen: 1341 };
  const degraded = { present: 120, gamesSeen: 140 };

  t('THE REAL COLLAPSE IS CAUGHT — 11.2 games a date down to 1.17',
    collapsedSince(healthy, degraded) !== null,
    JSON.stringify(collapsedSince(healthy, degraded)));
  t('...and it reports both sides, so a reader can judge it',
    collapsedSince(healthy, degraded)?.before === 11.18 &&
    collapsedSince(healthy, degraded)?.after === 1.17,
    JSON.stringify(collapsedSince(healthy, degraded)));
  t('A HEALTHY RUN IS NOT A COLLAPSE, or the census cries wolf every time',
    collapsedSince(degraded, healthy) === null);
  t('an identical reading is not a collapse',
    collapsedSince(healthy, healthy) === null);
  t('a mild dip is not a collapse — the floor is half, not any decrease',
    collapsedSince(healthy, { present: 120, gamesSeen: 1000 }) === null,
    JSON.stringify(collapsedSince(healthy, { present: 120, gamesSeen: 1000 })));
  t('...but just under half is', collapsedSince(healthy, { present: 120, gamesSeen: 600 }) !== null);

  // A SHORTER WINDOW IS NOT A COLLAPSE. The ratio is per present date, so
  // running --days 45 after --days 120 must not read as the relay failing.
  t('a shorter window is not a collapse',
    collapsedSince(healthy, { present: 45, gamesSeen: Math.round(1341 * 45 / 120) }) === null,
    JSON.stringify(collapsedSince(healthy, { present: 45, gamesSeen: 503 })));

  // No reference yet, and the degenerate cases. A first run cannot collapse.
  t('no previous reading means no verdict, not a false alarm',
    collapsedSince(null, degraded) === null);
  t('a reference missing its fields is ignored rather than half-used',
    collapsedSince({ present: 120 }, degraded) === null);
  t('zero present dates on either side yields no verdict',
    collapsedSince({ present: 0, gamesSeen: 0 }, healthy) === null &&
    collapsedSince(healthy, { present: 0, gamesSeen: 0 }) === null);

  process.exit(bad === 0 ? 0 : 1);
}

// Not the entry point? Then the CLI below must not run. Wrapped rather than
// re-indented so the body stays byte-identical to what was reviewed.
if (IS_MAIN) await (async () => {

const iso = d => d.toISOString().slice(0, 10);
const dates = [];
for (let i = 1; i <= DAYS; i++) dates.push(iso(new Date(Date.now() - i * 86_400_000)));

// A 200 IS NOT A CORPUS, and this census learned that the expensive way.
//
// Run 38145971449 read 120 dates, reported "0 unavailable", and saw 140 games
// where the healthy relay serves 1341 — 94 MLB games across 120 days, which no
// MLB season produces. Every response was a 200, so `r.ok` was true 120 times
// and nothing objected. The run sits between two FAILED relay deploys
// (14:07:33Z and 14:12:44Z; the census ran at 14:08:24Z), and that reading was
// then recorded as a BASELINE in field-relay-nba's
// docs/CC-CMD-2026-08-25-misjoined-opening-odds.md.
//
// `scripts/probe-epl-substrate.mjs` in this repo already classifies `empty`
// separately from `present` and says why: "/soccer-fbref/epl.json returns HTTP
// 200 with teams: {} — the empty-not-present case. A boolean 'reachable' check
// calls both successes." This census was the boolean.
//
// So three states, counted separately, and the raw game count kept BEFORE the
// comparable-pair filter — a date serving games none of which carry a
// moneyline+handicap pair is `present`, not `empty`, and conflating those would
// swap one blind spot for another.
const rows = [];
let present = 0, empty = 0, failed = 0, gamesSeen = 0;
for (const d of dates) {
  let text;
  try {
    const r = await fetch(`${RELAY}/context/date/${d}`, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) { failed++; continue; }
    text = await r.text();
  } catch { failed++; continue; }
  const res = decodePayload(text);
  if (res.tag !== 0) { failed++; continue; }
  const p = res.fields[0];
  const served = Array.from(p.Regular).length + Array.from(p.Postseason).length;
  gamesSeen += served;
  if (served === 0) { empty++; } else { present++; }
  for (const g of [...Array.from(p.Regular), ...Array.from(p.Postseason)]) {
    const oo = g.OpeningOdds;
    if (oo.cases()[oo.tag] !== 'Decoded') continue;
    const o = oo.fields[0];
    const mh = o.MoneylineHome, ma = o.MoneylineAway, sh = o.SpreadHome, sa = o.SpreadAway;
    if (mh == null || ma == null || sh == null || sa == null) continue;
    const fa = favouriteAgreement(o);
    rows.push({
      id: g.Id, sport: g.Sport.cases?.()[g.Sport.tag] ?? String(g.Sport), date: d,
      real: fa.cases()[fa.tag],
      shadow: shadowVerdict(mh, ma, sh, sa),
      ...bandOf(mh, ma), mh, ma, sh,
      // The prices beside the handicap. Absent on every capture before
      // 2026-08-26, which is most of the corpus and always will be.
      shp: o.SpreadHomePrice ?? null, sap: o.SpreadAwayPrice ?? null,
      // For the plausibility pass below. `RawCapturedAt` is the string the
      // relay stored, not a reparse, so a comparison against `FinalizedAt` is
      // between two values the relay itself wrote.
      total: o.TotalOver ?? null,
      capturedAt: o.RawCapturedAt ?? null,
      finalizedAt: g.FinalizedAt ?? null,
    });
  }
}

// ── the validation that makes the shadow trustworthy ────────────────────────
const drift = rows.filter(r =>
  (r.real === 'Agrees' && r.shadow !== 'agree') ||
  (r.real === 'Disagrees' && r.shadow !== 'disagree'));

const fetched = present + empty;
console.log(`\n${fetched} date(s) read, ${failed} unavailable, ${rows.length} game(s) with a comparable moneyline+handicap pair`);
// Rule 91 — the denominator prints where the result is read, not in a comment.
console.log(`  served games: ${present} date(s) present, ${empty} EMPTY (200 with no games), ${gamesSeen} game(s) seen before the comparable-pair filter\n`);

if (drift.length) {
  console.error(`CENSUS VOID — the shadow disagrees with favouriteAgreement on ${drift.length} judged game(s).`);
  for (const r of drift.slice(0, 5)) console.error(`  ${r.id}: real=${r.real} shadow=${r.shadow} ML ${r.mh}/${r.ma} H ${r.sh}`);
  console.error('A shadow that has drifted from the real rubric measures nothing.');
  process.exit(1);
}
console.log(`shadow validated against favouriteAgreement on ${rows.filter(r => r.real !== 'NotComparable').length} judged game(s): 0 drift\n`);

const band = rows.filter(r => r.real === 'NotComparable');
const judged = rows.filter(r => r.real !== 'NotComparable');
const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
const agree = xs => xs.filter(r => r.shadow === 'agree').length;

console.log('THE BAND favouriteAgreement DECLINES TO JUDGE');
console.log(`  ${band.length} game(s), ${pct(band.length, rows.length)} of the corpus`);
console.log(`  shadow agrees    ${agree(band)}  (${pct(agree(band), band.length)})`);
console.log(`  shadow disagrees ${band.filter(r => r.shadow === 'disagree').length}`);
console.log('\n  ~50% means the handicap carries no information there, which is what a');
console.log('  true pick’em looks like. Far below 50% would mean a systematic');
console.log('  inversion living inside the band, invisible to the gate.\n');

console.log('WHAT THE GATE DOES JUDGE');
console.log(`  ${judged.length} game(s): ${agree(judged)} agree, ${judged.filter(r => r.shadow === 'disagree').length} disagree (${pct(judged.filter(r => r.shadow === 'disagree').length, judged.length)})\n`);

const sports = [...new Set(rows.map(r => r.sport))].sort();
console.log('BY SPORT'.padEnd(34) + 'band   band-agree   judged  judged-disagree');
for (const s of sports) {
  const rs = rows.filter(r => r.sport === s);
  const b = rs.filter(r => r.real === 'NotComparable'), j = rs.filter(r => r.real !== 'NotComparable');
  console.log(`  ${s.padEnd(30)} ${String(b.length).padStart(4)}   ${pct(agree(b), b.length).padStart(9)}   ${String(j.length).padStart(6)}   ${pct(j.filter(r => r.shadow === 'disagree').length, j.length).padStart(14)}`);
}

// ── the asymmetry test ──────────────────────────────────────────────────────
//
// The first run's four judged disagreements were ALL home-favourite, all in a
// narrow price band (-114 to -122), all holding +1.5. Zero were away-favourite.
//
// If that is a feed or adapter artefact -- a handicap that defaults to
// `home: +1.5` when the market is near even -- then away-side slim favourites
// should show the mirror and they do not. If it is market behaviour at the
// boundary, both sides should behave alike. This is the number that separates
// them, and it is why the census reports by SIDE rather than only in total.
const slim = rows.filter(r => r.real !== 'NotComparable' && r.ratio < 3);
const bySide = side => {
  const xs = slim.filter(r => (implied(r.mh) > implied(r.ma)) === (side === 'home'));
  const dis = xs.filter(r => r.shadow === 'disagree').length;
  return { n: xs.length, dis, pct: pct(dis, xs.length) };
};
const H = bySide('home'), A = bySide('away');
console.log('\nTHE ASYMMETRY TEST — judged games inside 3x the vig, by which side is favoured');
console.log(`  home favourite   ${String(H.n).padStart(4)} game(s), ${H.dis} disagree (${H.pct})`);
console.log(`  away favourite   ${String(A.n).padStart(4)} game(s), ${A.dis} disagree (${A.pct})`);
console.log('  A one-sided rate is a feed or adapter artefact. A matching rate is the');
console.log('  market behaving the same way on both sides near the boundary.');

const worst = rows.filter(r => r.shadow === 'disagree').sort((a, b) => b.ratio - a.ratio).slice(0, 12);
if (worst.length) {
  const adj = worst.map(r => adjudicate(r.mh, r.ma, r.shp, r.sap));
  const withPrice = adj.filter(v => v !== 'no price').length;
  console.log(`\nADJUDICABLE BY PRICE: ${withPrice} of ${worst.length}`);
  if (withPrice === 0)
    console.log('  Every disagreement here predates the 2026-08-26 spread-price capture,');
    console.log('  so none can be settled yet. This number rises as new ones accrue.');
  console.log('\nEVERY DISAGREEMENT, widest separation first');
  for (const r of worst) {
    const verdict = adjudicate(r.mh, r.ma, r.shp, r.sap);
    const priced = r.shp == null ? '' : ` @ ${String(r.shp).padStart(5)}/${String(r.sap).padStart(5)}`;
    console.log(`  ${r.date}  ${r.id.slice(0, 44).padEnd(44)} ML ${String(r.mh).padStart(5)}/${String(r.ma).padStart(5)}  H ${String(r.sh).padStart(5)}${priced}  ratio ${r.ratio.toFixed(2)}  ${r.real}  ${verdict}`);
  }
}
// ── ODDS PLAUSIBILITY ───────────────────────────────────────────────────────
//
// CC-CMD-2026-08-25-misjoined-opening-odds opens by asking for a D1 query and
// calls it credentialled. IT IS NOT NEEDED. `/context/date` serves
// `opening_odds` verbatim and publicly -- which is how the three rows were
// found in the first place. The blocker was stated, not measured.
//
// TWO SIGNALS, AND THE RANGE IS DERIVED
//
// The plausible total for a sport is taken from that sport's own median rather
// than asserted ("MLB is 5 to 15"). A row outside [median/2, median*2] is an
// outlier BY ITS OWN SPORT'S DISTRIBUTION, which is the same discipline the vig
// threshold uses: the comparison comes from the data in front of it.
//
// The second signal needs no threshold at all. `opening_odds` captured at the
// instant the row was FINALISED is not an opening line by definition, whatever
// the numbers say.
const withTotal = rows.filter(r => Number.isFinite(r.total));

console.log('\n\nODDS PLAUSIBILITY — the same payloads, a different question\n');
console.log('BY SPORT'.padEnd(34) + '  n   median   min    max   outside [med/2, med*2]');
const outliers = [];
for (const sp of [...new Set(withTotal.map(r => r.sport))].sort()) {
  const rs = withTotal.filter(r => r.sport === sp);
  const med = medianOf(rs.map(r => r.total));
  const out = rs.filter(r => isTotalOutlier(r.total, med));
  outliers.push(...out);
  console.log(`  ${sp.padEnd(30)} ${String(rs.length).padStart(4)}  ${String(med).padStart(6)}  ` +
    `${String(Math.min(...rs.map(r => r.total))).padStart(5)}  ${String(Math.max(...rs.map(r => r.total))).padStart(5)}  ${String(out.length).padStart(6)}`);
}

// `captured_at` within a minute of `finalized_at`: an opening line written at
// completion. No threshold to argue about -- the two timestamps are either the
// same moment or they are not.
const postHoc = rows.filter(r => capturedAtFinalisation(r.capturedAt, r.finalizedAt));

console.log(`\n  totals outside their sport's range   ${outliers.length} of ${withTotal.length}`);
console.log(`  opening odds captured at finalisation ${postHoc.length} of ${rows.length}`);

const flagged = [...new Set([...outliers, ...postHoc])];
if (flagged.length) {
  console.log('\nEVERY FLAGGED ROW');
  for (const r of flagged.sort((a, b) => a.date.localeCompare(b.date))) {
    const why = [outliers.includes(r) && `total ${r.total}`, postHoc.includes(r) && 'captured at finalisation']
      .filter(Boolean).join(' + ');
    console.log(`  ${r.date}  ${r.id.slice(0, 44).padEnd(44)} ML ${String(r.mh).padStart(5)}/${String(r.ma).padStart(5)}  ${why}`);
  }
} else {
  console.log('\n  no row flagged by either signal.');
}

// ── the reference, and the one reading that must not become it ──────────────
//
// THE OLD BASELINE BECAME THE BASELINE BECAUSE NOTHING STOPPED IT. A degraded
// run was recorded as the reference figure in another repo's done condition,
// and every later reading was then compared against a tenth of the archive. So
// a collapsed run REFUSES, and refuses to write the sidecar — a run that cannot
// be trusted must not become the thing the next run trusts.
const REF = 'outbox/favourite-band-census-latest.json';
const now = { days: DAYS, present, empty, failed, gamesSeen, comparableRows: rows.length };
let prev = null;
try { prev = JSON.parse(readFileSync(REF, 'utf8')); } catch { prev = null; }

const collapse = collapsedSince(prev, now);
if (collapse) {
  console.error('');
  console.error(`CENSUS REFUSED — the corpus collapsed since the last census.`);
  console.error(`  games per present date: ${collapse.before} before, ${collapse.after} now`);
  console.error(`  floor: ${collapse.floorRatio * 100}% of the previous reading`);
  console.error(`  ${present} date(s) present, ${empty} empty, ${failed} unavailable, ${gamesSeen} game(s) seen`);
  console.error('');
  console.error(`  A 200 is not a corpus. Run 38145971449 read 120 dates, reported 0`);
  console.error(`  unavailable, and saw 140 games where the healthy relay serves 1341 —`);
  console.error(`  it sat between two FAILED relay deploys. Check the relay's deploy`);
  console.error(`  history for this window before trusting any number above.`);
  console.error('');
  console.error(`  ${REF} NOT updated: a refused reading must not become the reference.`);
  process.exit(1);
}

if (prev === null) {
  console.log(`  ${REF} absent — writing the first reference. A first run cannot collapse.`);
}
writeFileSync(REF, JSON.stringify(now, null, 1) + '\n');
console.log(`  wrote ${REF} — ${(gamesSeen / Math.max(1, present)).toFixed(2)} game(s) per present date\n`);

process.exit(0);
})()
