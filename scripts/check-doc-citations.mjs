#!/usr/bin/env node
// A `file:line` citation in a document is a claim, and line numbers rot.
//
// WHY THIS EXISTS, measured 2026-08-25
//
// Six citations were published into CC-CMDs that morning. By the afternoon
// FIVE were wrong — not through neglect, but because the same session then
// edited the file it had cited. Insertions above a line move every line below
// it, silently:
//
//     cited          actually now      what was meant
//     :7726          :7779             the LEAGUES golf entry
//     :7750          :1381             teams.find(t => t.homeAway === 'home')
//     :7842          :7906             sport: gm.league
//     :6903          :6934             buildGolfCronContext
//     :8235          :8299             the golf brief's eventId
//
// A stale citation is worse than none: it points confidently at unrelated code,
// and the reader trusts it because it is specific.
//
// THE FIX IS NOT A BETTER NUMBER. It is a better IDENTITY. A document that
// quotes a distinctive fragment beside its citation can be checked — and the
// number becomes redundant, because the fragment finds the line itself. That
// convention also cannot be satisfied from memory, which is the actual defect:
// every wrong figure published that day came from recall rather than a probe.
//
// TWO CHECKS
//
//   FATAL   an ANCHORED citation whose anchor is not in the file. The document
//           makes a specific, checkable claim and the claim is false.
//   RATCHET bare `path:line` citations with no anchor nearby. They cannot be
//           verified and they cannot grow. Existing ones are grandfathered at
//           the measured count, not retroactively fixed.
//
// A missing FILE is reported, never fatal: these repos cite each other, and
// jubilant-bassoon's paths are legitimately absent here.

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { isMain } from './checks.mjs';

// IMPORT PURITY (import-purity-check.mjs). This module exports functions, which
// is a declaration that something else may import it — so it must not run, and
// must not exit, at import time. `isMain` gates both the self-test and the live
// section. Written without it, an importer got this module's output and exit
// code instead of its own, silently.
const IS_MAIN = isMain(import.meta.url);
const SELF_TEST = IS_MAIN && process.argv.includes('--self-test');
const DELETED_BUDGET = 'docs/deleted-citation-budget.txt';
const BUDGET = 'docs/citation-budget.txt';
const SKIP = new Set(['.git', 'node_modules', '.wrangler', 'dist', 'build']);
// Repo-relative paths only. A bare word with a colon and digits is not a
// citation; requiring a known source root and a real extension keeps prose like
// "see 2026-08-25:14" out.
const CITE = /\b((?:src|scripts|workers|\.github)\/[A-Za-z0-9_./-]+\.(?:js|mjs|py|yml|yaml|json|fs|toml))(?::(\d{1,6}))?\b/g;
// How many characters either side of a citation count as "beside it".
const WINDOW = 400;

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`      → ${detail}`); failed++; }
};

/** Backtick-quoted fragments in a span of document text, long enough to be distinctive. */
export function anchorsIn(text) {
  return [...text.matchAll(/`{1,3}([^`\n]{6,160})`{1,3}/g)]
    .map(m => m[1].trim())
    // A bare path is not an anchor for itself, and neither is a lone identifier
    // that appears everywhere. Require something with structure.
    .filter(a => a.length >= 6 && !/^(?:src|scripts|workers|\.github)\//.test(a));
}

/**
 * Classify every citation in a document.
 * ANCHORED = some fragment quoted within WINDOW chars is present in the file.
 */
export function classify(docText, fileExists, fileText) {
  const out = [];
  for (const m of docText.matchAll(CITE)) {
    const path = m[1], line = m[2] ? Number(m[2]) : null;
    if (!fileExists(path)) { out.push({ path, line, state: 'no-file' }); continue; }
    const span = docText.slice(Math.max(0, m.index - WINDOW), m.index + WINDOW);
    const body = fileText(path);
    const found = anchorsIn(span).filter(a => body.includes(a));
    if (found.length) out.push({ path, line, state: 'anchored', anchor: found[0] });
    else if (line !== null) out.push({ path, line, state: 'bare' });
    else out.push({ path, line, state: 'path-only' });
  }
  return out;
}

/**
 * The line an anchor is actually on now, 1-indexed — or null when the anchor is
 * not there, or is there MORE THAN ONCE.
 *
 * Uniqueness is required for the repair suggestion, not for the anchor to
 * count. The first version returned the first match and produced confident
 * nonsense: `src/analytics-engine.js:1197 → now :8`, because the quoted
 * fragment beside that citation was short enough to appear near the top of the
 * file. A repair hint that points at the wrong line is the same defect this
 * whole check was written about, reintroduced by the check itself.
 */
export function lineOf(body, anchor) {
  const lines = body.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(anchor)) hits.push(i + 1);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Split the "no file" citations into the two things they actually are.
 *
 * THE BUCKET COLLAPSED TWO STATES and reported neither. Its own label said so —
 * "cross-repo or deleted — reported, never fatal" — and 172 citations sat in it.
 * A citation naming a relay or client path this repo has never had is correct
 * and unremarkable. A citation naming a path THIS repo tracked and then deleted
 * is a different animal: the file it points at is gone from the tree it was
 * written about.
 *
 * Git separates them exactly, which is why this is worth a subprocess: a path
 * that was ever added or renamed here is in the log, and one that never existed
 * here is not.
 *
 * MEASURED 2026-08-31 before the split was written: 172 citations, 50 distinct
 * paths, and exactly ONE was deleted-here — `chrome-check.mjs`, 2 citations,
 * removed the same day it was written up. The other 49 are genuinely foreign
 * (the relay's index.js at 41 citations, the client's legacy bundle at 10). So
 * the bucket really was 99% what its label's first word claimed, and the point
 * of splitting it is that nothing would have told you when that stopped being
 * true.
 *
 * NOT FATAL, AND DELIBERATELY SO. Both current deleted-here citations are
 * accurate history — one records the file being wired into verify, the other is
 * captured output naming it. A document describing a deletion has every reason
 * to name what was deleted. Whether such a citation is stale or archival is not
 * mechanically decidable, so this ratchets the count instead, the same way
 * `bare` is ratcheted.
 */
export function splitNoFile(paths, everTracked) {
  const deleted = [], foreign = []
  for (const p of paths) (everTracked.has(p) ? deleted : foreign).push(p)
  return { deleted, foreign }
}

/**
 * Rewrite `path:oldLine` to `path:newLine` in a document. Returns the new text
 * and how many occurrences changed.
 *
 * WHY THIS EXISTS. The stale list below has been printing the exact repair on
 * every run for days, and nothing applied it. That is the failure this repo
 * fixed one level up in field-playground's followups.mjs this morning: a
 * warning nothing acts on becomes a warning nobody reads. The checker already
 * computes the answer; withholding the edit is the only thing standing between
 * a report and a repair.
 *
 * TWO WAYS THIS COULD CORRUPT A DOCUMENT, both closed:
 *
 * 1. A PREFIX MATCH. `src/Desk.fs:79` is a prefix of `src/Desk.fs:792`, and a
 *    plain string replace of the shorter one would rewrite the middle of the
 *    longer, producing a line number that never existed. The trailing `\b`
 *    cannot match between `9` and `2`, so the shorter citation leaves the
 *    longer alone.
 * 2. A PATH READ AS A PATTERN. `src/Desk.fs` contains a `.`, which matches any
 *    character unescaped -- `src/DeskXfs:792` would be rewritten. The path is
 *    escaped before it becomes a regex.
 *
 * It only ever runs against repairs `lineOf` produced, and `lineOf` returns
 * null for an anchor appearing more than once, so an ambiguous anchor yields
 * no repair to apply.
 */
export function applyRepair(docText, path, oldLine, newLine) {
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${esc}:${oldLine}\\b`, 'g');
  let n = 0;
  const text = docText.replace(re, () => { n++; return `${path}:${newLine}`; });
  return { text, changed: n };
}

if (SELF_TEST) {
  const FILE = "one\ntwo\nconst k = teams.find(t => t.homeAway === 'home');\nfour\n";
  const ex = p => p === 'src/index.js';
  const tx = () => FILE;

  const anchored = classify(
    "See `src/index.js:3` — `teams.find(t => t.homeAway === 'home')` is the fallback.", ex, tx);
  check('a citation with a matching quoted fragment is anchored',
    anchored[0]?.state === 'anchored', JSON.stringify(anchored));

  const bare = classify('See src/index.js:3 for the fallback.', ex, tx);
  check('a citation with nothing quoted beside it is bare',
    bare[0]?.state === 'bare', JSON.stringify(bare));

  // The case this whole check exists for: the number is wrong, the anchor is
  // right, and the anchor is what lets it be repaired.
  const moved = classify(
    "See `src/index.js:9999` — `teams.find(t => t.homeAway === 'home')` moved.", ex, tx);
  check('a WRONG line number with a right anchor still resolves',
    moved[0]?.state === 'anchored' && lineOf(FILE, moved[0].anchor) === 3,
    `${JSON.stringify(moved)} lineOf=${lineOf(FILE, moved[0]?.anchor)}`);

  const broken = classify(
    'See `src/index.js:3` — `noSuchFragmentAnywhere()` is gone.', ex, tx);
  check('a quoted fragment that is NOT in the file does not count as an anchor',
    broken[0]?.state === 'bare', JSON.stringify(broken));

  check('a citation to a file this repo does not have is its own state',
    classify('see src/legacy/field.js:12', () => false, tx)[0]?.state === 'no-file',
    'a cross-repo path was treated as a local failure');

  // The path itself must never anchor its own citation, or every bare citation
  // would pass by quoting the path.
  // A repair hint is only worth printing when it is unambiguous.
  check('an anchor appearing twice yields no repair line',
    lineOf('x\nfoo bar\nfoo bar\n', 'foo bar') === null,
    'an ambiguous anchor produced a confident line number');
  check('...and appearing exactly once still does',
    lineOf('x\nfoo bar\ny\n', 'foo bar') === 2, 'a unique anchor lost its line');

  check('quoting the path is not an anchor',
    classify('See `src/index.js:3` — `src/index.js` has it.', ex, tx)[0]?.state === 'bare',
    'a path quoted itself into an anchor');

  // The split, including the state that must never read as the other one.
  const ever = new Set(['scripts/gone.mjs']);
  const sp = splitNoFile(['scripts/gone.mjs', 'src/index.js'], ever);
  check('a path this repo tracked and deleted is deleted-here',
    sp.deleted.join() === 'scripts/gone.mjs');
  check('a path this repo never had is foreign, not deleted',
    sp.foreign.join() === 'src/index.js',
    'the relay\'s index.js has 41 citations here and none of them are broken');
  check('AN EMPTY HISTORY MAKES EVERYTHING LOOK FOREIGN',
    splitNoFile(['scripts/gone.mjs'], new Set()).deleted.length === 0,
    'which is why a shallow clone must abort rather than report a confident zero');

  // --fix's edit, and the two ways it could corrupt a document.
  const doc = 'see `src/Desk.fs:792` and also src/Desk.fs:792, plus src/Desk.fs:79 elsewhere';
  const r = applyRepair(doc, 'src/Desk.fs', 792, 819);
  check('a repair rewrites every occurrence of that exact citation',
    r.changed === 2 && r.text.includes('src/Desk.fs:819'), `changed ${r.changed}`);
  check('A SHORTER CITATION DOES NOT REWRITE THE MIDDLE OF A LONGER ONE',
    r.text.includes('src/Desk.fs:79 elsewhere'),
    'src/Desk.fs:79 is a prefix of :792; a plain replace would invent a line number');
  check('...and repairing the SHORT one leaves the long one alone',
    applyRepair(doc, 'src/Desk.fs', 79, 5).text.includes('src/Desk.fs:792'),
    'the trailing word boundary cannot match between 9 and 2');
  check('THE PATH IS ESCAPED, NOT USED AS A PATTERN',
    applyRepair('src/DeskXfs:792', 'src/Desk.fs', 792, 819).changed === 0,
    'an unescaped dot matches any character and would rewrite an unrelated path');
  check('a repair that matches nothing changes nothing',
    applyRepair(doc, 'src/Other.fs', 792, 819).changed === 0);

  process.exit(failed === 0 ? 0 : 1);
}

// Not the entry point? Then the CLI below must not run. Wrapped rather than
// re-indented so the body stays byte-identical to what was reviewed.
if (IS_MAIN) await (async () => {

const docs = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p);
    else if (p.endsWith('.md') && st.size < 4_000_000) docs.push(p);
  }
})('.');

const cache = new Map();
const bodyOf = p => {
  if (!cache.has(p)) { try { cache.set(p, readFileSync(p, 'utf8')); } catch { cache.set(p, ''); } }
  return cache.get(p);
};

// EVERY PATH THIS REPO HAS EVER TRACKED, from full history.
//
// A SHALLOW CLONE MUST ABORT, not report zero. `splitNoFile` against an empty
// history classifies everything as foreign, so a truncated log turns the whole
// deleted-here state off and leaves the check passing — the precise failure
// that wasted a pass on jubilant-bassoon two days ago, where 201 grafted
// commits were read as the repo's history and a conclusion drawn from them.
// check:workflows enforces the precondition at the door: this file now contains
// `git log`, so its historyReaders detector requires fetch-depth: 0 on any job
// that runs it. Both jobs that do already carry it.
let everTracked = null, historyProblem = null;
try {
  if (execSync('git rev-parse --is-shallow-repository', { encoding: 'utf8' }).trim() === 'true') {
    historyProblem = 'the clone is SHALLOW — deleted-here cannot be told from cross-repo';
  } else {
    everTracked = new Set(
      execSync('git log --all --pretty=format: --name-only --diff-filter=AR',
               { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        .split('\n').map(x => x.trim()).filter(Boolean));
  }
} catch (e) {
  historyProblem = `git history unreadable: ${String(e.message || e).slice(0, 80)}`;
}

let anchored = 0, bare = 0, noFile = 0, pathOnly = 0;
const brokenAnchors = [], stale = [], repairs = [], noFilePaths = new Set();
for (const d of docs) {
  let text; try { text = readFileSync(d, 'utf8'); } catch { continue; }
  for (const c of classify(text, existsSync, bodyOf)) {
    if (c.state === 'anchored') {
      anchored++;
      // Only an unambiguous anchor earns a repair line -- see lineOf.
      const now = lineOf(bodyOf(c.path), c.anchor);
      if (c.line !== null && now !== null && now !== c.line) {
        stale.push(`${d}: ${c.path}:${c.line} → now :${now}   (${c.anchor.slice(0, 48)})`);
        repairs.push({ doc: d, path: c.path, from: c.line, to: now });
      }
    } else if (c.state === 'bare') { bare++; }
    else if (c.state === 'no-file') { noFile++; noFilePaths.add(c.path); }
    else pathOnly++;
  }
}

const budget = existsSync(BUDGET)
  ? Number((readFileSync(BUDGET, 'utf8').match(/^\s*(\d+)\s*$/m) || [])[1])
  : NaN;

console.log(`\n${docs.length} document(s) scanned`);
console.log(`  anchored   ${anchored}  (a quoted fragment beside the citation is present in the file)`);
console.log(`  bare       ${bare}  (a line number and nothing to verify it against)`);
const split = everTracked ? splitNoFile([...noFilePaths], everTracked) : null;
console.log(`  no file    ${noFile}  across ${noFilePaths.size} distinct path(s)`);
if (split) {
  console.log(`    cross-repo   ${split.foreign.length} path(s)  (the relay, the client — correct and unremarkable)`);
  console.log(`    DELETED HERE ${split.deleted.length} path(s)  ${split.deleted.join(', ') || '(none)'}`);
} else {
  console.log(`    NOT SPLIT — ${historyProblem}`);
}
console.log(`  path only  ${pathOnly}\n`);

if (stale.length) {
  console.log('ANCHORED BUT THE NUMBER MOVED — the anchor gives the repair:');
  for (const s of stale.slice(0, 20)) console.log(`  ${s}`);
  console.log('');
}

// --fix APPLIES what the block above has only ever printed.
//
// Deliberately opt-in and never run in CI: rewriting committed prose without
// anyone asking is a different and worse habit than leaving a line number
// stale. `npm run fix:citations`, then read the diff.
if (process.argv.includes('--fix')) {
  if (!repairs.length) {
    console.log('nothing to repair — every anchored citation is on its stated line\n');
  } else {
    const byDoc = new Map();
    for (const r of repairs) {
      if (!byDoc.has(r.doc)) byDoc.set(r.doc, readFileSync(r.doc, 'utf8'));
      const { text, changed } = applyRepair(byDoc.get(r.doc), r.path, r.from, r.to);
      byDoc.set(r.doc, text);
      console.log(`  ${r.doc}: ${r.path}:${r.from} → :${r.to}   (${changed} occurrence(s))`);
    }
    for (const [doc, text] of byDoc) writeFileSync(doc, text);
    console.log(`\nrepaired ${repairs.length} citation(s) across ${byDoc.size} document(s).`);
    console.log('Read the diff before committing — a repair is an edit to committed prose.\n');
  }
}

const deletedBudget = existsSync(DELETED_BUDGET)
  ? Number((readFileSync(DELETED_BUDGET, 'utf8').match(/^\s*(\d+)\s*$/m) || [])[1])
  : NaN;

check('every anchored citation resolves', brokenAnchors.length === 0, brokenAnchors.join('; '));
check('the history needed to split cross-repo from deleted-here was readable',
  split !== null,
  `${historyProblem}. Without it every deleted-here citation reads as cross-repo and this ` +
  `state silently switches off. Run with a full clone (fetch-depth: 0).`);
check(`deleted-here citations do not grow (budget ${deletedBudget})`,
  split === null || (Number.isFinite(deletedBudget) && split.deleted.length <= deletedBudget),
  `${split?.deleted.length} path(s) cite a file this repo deleted: ${split?.deleted.join(', ')}. ` +
  `Not automatically wrong — a document about a deletion has every reason to name what was ` +
  `deleted, and both current ones are accurate history. A ratchet, like bare: if you REDUCED ` +
  `the count, lower the number in ${DELETED_BUDGET} in this commit.`);
check(`bare citations do not grow (budget ${budget})`,
  Number.isFinite(budget) && bare <= budget,
  `${bare} bare against a budget of ${budget}. A ratchet: new citations must quote what ` +
  `they cite. If you REDUCED the count, lower the number in ${BUDGET} in this commit.`);

process.exit(failed === 0 ? 0 : 1);
})()
