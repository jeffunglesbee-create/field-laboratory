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

import { decodePayload, favouriteAgreement } from '../build/Desk.js';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DAYS = Number(arg('--days', '45'));
const RELAY = arg('--relay', 'https://field-relay-nba.jeffunglesbee.workers.dev');
const SELF_TEST = process.argv.includes('--self-test');

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

/** Separation and overround, for reporting the band each game sits in. */
export function bandOf(mh, ma) {
  const ih = implied(mh), ia = implied(ma);
  const vig = ih + ia - 1;
  return { sep: Math.abs(ih - ia), vig, ratio: vig === 0 ? Infinity : Math.abs(ih - ia) / vig };
}

if (SELF_TEST) {
  let bad = 0;
  const t = (name, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { console.log('      → ' + d); bad++; } };
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
  const b = bandOf(-124, 103);
  t('the band ratio matches the hand calculation',
    Math.abs(b.ratio - 1.32) < 0.01, `ratio ${b.ratio.toFixed(3)}`);
  process.exit(bad === 0 ? 0 : 1);
}

const iso = d => d.toISOString().slice(0, 10);
const dates = [];
for (let i = 1; i <= DAYS; i++) dates.push(iso(new Date(Date.now() - i * 86_400_000)));

const rows = [];
let fetched = 0, failed = 0;
for (const d of dates) {
  let text;
  try {
    const r = await fetch(`${RELAY}/context/date/${d}`, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) { failed++; continue; }
    text = await r.text();
  } catch { failed++; continue; }
  const res = decodePayload(text);
  if (res.tag !== 0) { failed++; continue; }
  fetched++;
  const p = res.fields[0];
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
    });
  }
}

// ── the validation that makes the shadow trustworthy ────────────────────────
const drift = rows.filter(r =>
  (r.real === 'Agrees' && r.shadow !== 'agree') ||
  (r.real === 'Disagrees' && r.shadow !== 'disagree'));

console.log(`\n${fetched} date(s) read, ${failed} unavailable, ${rows.length} game(s) with a comparable moneyline+handicap pair\n`);

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
  console.log('\nEVERY DISAGREEMENT, widest separation first');
  for (const r of worst) {
    console.log(`  ${r.date}  ${r.id.slice(0, 44).padEnd(44)} ML ${String(r.mh).padStart(5)}/${String(r.ma).padStart(5)}  H ${String(r.sh).padStart(5)}  ratio ${r.ratio.toFixed(2)}  ${r.real}`);
  }
}
process.exit(0);
