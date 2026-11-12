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

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

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
 * WHICH HISTORY "DELETED HERE" IS DECIDED FROM, and why it is the commit under test's.
 *
 * It used to be `git log --all`, every ref the clone had. That made the verdict
 * on a commit depend on which branches other sessions had pushed: a path that
 * existed only on an UNMERGED branch counted as "tracked here, then deleted"
 * the moment the branch was pushed, and a document on main that cited it went
 * red in `guards` and `verify` until the branch merged (E1 of
 * docs/CC-CMD-2026-11-06-gate-residuals-remaining.md; twice on 2026-11-11:
 * live-scores-t1 pushed 05:42Z and merged 07:56Z, live-scores-t3 pushed 22:41Z and
 * merged 23:39Z; `verify` was red at 4f0da01 and at b3bceaa and `deploy` held back).
 * The same tree read DELETED HERE 1 with the remote branches not fetched and 4
 * with them fetched: a check whose answer changes with the
 * checkout is not a check of the commit.
 *
 * The history REACHABLE FROM `rev` (HEAD) is the history of the tree being
 * judged. A file added on a side branch and merged is reachable through the
 * merge; a file that exists only on a branch that has not landed is foreign,
 * which is what a path this tree never had is.
 *
 * A shallow clone, or a log that cannot be read, is a PROBLEM and not an empty
 * set: against an empty history everything reads as foreign and the deleted-here
 * state silently switches off.
 *
 * `env` is the environment git runs in (the process's, by default). The self-test
 * passes a cleaned one: a hook running in a LINKED WORKTREE (where these sessions
 * work) has GIT_DIR naming the real repository, and a reader that inherited it
 * read the real history while being asked about a fixture. A hook in a plain
 * checkout sets GIT_INDEX_FILE and GIT_PREFIX and no GIT_DIR (measured by a
 * reviewer on git 2.43.0); the self-test poisons both, so it does not depend on
 * which kind of checkout runs it.
 */
export const HISTORY_REV = 'HEAD'
/**
 * The environment a throwaway repository's git commands run in. Every GIT_*
 * variable of the caller is dropped: this script runs from the pre-commit hook,
 * where GIT_INDEX_FILE names the REAL repository's index (and GIT_DIR its
 * repository, in a linked worktree), and a fixture `git add` that inherited
 * them would write into the repository being committed.
 */
export const cleanGitEnv = env => ({
  ...Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
})
export function everTrackedPaths({ cwd = '.', rev = HISTORY_REV, env = process.env } = {}) {
  try {
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (shallow === 'true') {
      return { paths: null, problem: 'the clone is SHALLOW — deleted-here cannot be told from cross-repo' }
    }
    const out = execFileSync('git', ['log', rev, '--pretty=format:', '--name-only', '--diff-filter=AR', '--'],
      { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    return { paths: new Set(out.split('\n').map(x => x.trim()).filter(Boolean)), problem: null }
  } catch (e) {
    // git's own reason (its stderr's first line), not the command line that carries it: the prefix of
    // e.message is already longer than any cut that kept the reason.
    const why = String(e.stderr || '').trim().split('\n')[0] || String(e.message || e).split('\n')[0]
    return { paths: null, problem: `git history unreadable (git log ${rev}): ${why.slice(0, 160)}` }
  }
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

  // WHICH HISTORY THE SPLIT IS READ FROM (E1 of docs/CC-CMD-2026-11-06-gate-residuals-remaining.md).
  //
  // Real git repositories, built here and removed after: the defect was in WHICH
  // COMMITS were read, and a predicate over an in-memory set cannot show that.
  //
  // THE PROCESS ENVIRONMENT IS POISONED while the fixtures run: GIT_DIR and
  // GIT_INDEX_FILE name a harmless decoy repository, as they would name the real
  // one under a pre-commit hook. Anything that reaches git with the process's
  // environment instead of the cleaned one then reads or writes the decoy, and a
  // check fails. Without this the wiring was only tested when the hook happened to
  // set those variables, and a regression to `process.env` was green in CI.
  const root = mkdtempSync(join(tmpdir(), 'cit-hist-'));
  const tidy = () => rmSync(root, { recursive: true, force: true });
  const onSignal = sig => { tidy(); process.exit(sig === 'SIGINT' ? 130 : 143); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const saved = {};
  const poison = vars => { for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v; } };
  try {
    const plainEnv = cleanGitEnv(process.env);
    const decoy = join(root, 'decoy.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', decoy], { env: plainEnv });
    const emptyTree = execFileSync('git', ['--git-dir', decoy, 'hash-object', '-t', 'tree', '/dev/null'], { env: plainEnv, encoding: 'utf8' }).trim();
    const decoyCommit = execFileSync('git', ['--git-dir', decoy, 'commit-tree', emptyTree, '-m', 'decoy'], { env: plainEnv, encoding: 'utf8' }).trim();
    execFileSync('git', ['--git-dir', decoy, 'update-ref', 'refs/heads/main', decoyCommit], { env: plainEnv });
    poison({ GIT_DIR: decoy, GIT_INDEX_FILE: join(root, 'decoy-index'), GIT_PREFIX: '' });

    const gitEnv = cleanGitEnv(process.env);
    const leaked = cleanGitEnv({ GIT_INDEX_FILE: '/real/.git/index', GIT_DIR: '/real/.git', GIT_WORK_TREE: '/real', PATH: '/bin' });
    check('a fixture never inherits the caller\'s git variables (a pre-commit hook points GIT_INDEX_FILE, and in a linked worktree GIT_DIR, at the real repository)',
      !('GIT_INDEX_FILE' in leaked) && !('GIT_DIR' in leaked) && !('GIT_WORK_TREE' in leaked) &&
      leaked.PATH === '/bin' && leaked.GIT_CONFIG_GLOBAL === '/dev/null' && !('GIT_DIR' in gitEnv) && !('GIT_INDEX_FILE' in gitEnv),
      JSON.stringify(leaked));
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const put = (cwd, rel, body = 'x\n') => { mkdirSync(join(cwd, rel, '..'), { recursive: true }); writeFileSync(join(cwd, rel), body); };
    const cli = cwd => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd, env: gitEnv, encoding: 'utf8' });
    const read = (cwd, extra = {}) => everTrackedPaths({ cwd, env: gitEnv, ...extra });
    const has = (r, p) => r.paths?.has(p) === true;

    const repo = join(root, 'repo');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    put(repo, 'scripts/gone.mjs'); put(repo, 'scripts/stays.mjs');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'add two scripts');
    git(repo, 'rm', '-q', 'scripts/gone.mjs'); put(repo, 'scripts/at-head.mjs');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'delete one, add one');
    const shaB = git(repo, 'rev-parse', 'HEAD').trim();
    git(repo, 'mv', 'scripts/stays.mjs', 'scripts/moved.mjs'); git(repo, 'commit', '-q', '-m', 'rename one');
    // A document on main cites the script a task says it will create, and the file that was deleted.
    put(repo, 'docs/note.md', 'The task adds `scripts/side-only.mjs`; `scripts/gone.mjs` was removed.\n');
    put(repo, 'docs/citation-budget.txt', '0\n'); put(repo, 'docs/deleted-citation-budget.txt', '1\n');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'a document that cites both');

    const before = cli(repo);
    // ... and ANOTHER SESSION PUSHES BRANCHES that add scripts. main is untouched.
    git(repo, 'checkout', '-q', '-b', 'side'); put(repo, 'scripts/side-only.mjs');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'the branch adds the script');
    put(repo, 'scripts/inside.mjs'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'the branch adds another');
    git(repo, 'rm', '-q', 'scripts/inside.mjs'); git(repo, 'commit', '-q', '-m', 'and deletes it again');
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'checkout', '-q', '-b', 'tagged'); put(repo, 'scripts/tag-only.mjs');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'reachable only by a tag'); git(repo, 'tag', 'only-tagged');
    git(repo, 'checkout', '-q', 'main'); git(repo, 'branch', '-q', '-D', 'tagged');
    git(repo, 'checkout', '-q', '-b', 'other'); put(repo, 'scripts/remote-only.mjs');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'a branch a clone will see only as a remote-tracking ref');
    git(repo, 'checkout', '-q', 'main');
    const after = cli(repo);

    const atHead = read(repo);
    check('a path added only on a side branch is NOT in the history HEAD reads',
      atHead.paths && !has(atHead, 'scripts/side-only.mjs'),
      'an unmerged branch must not change what main is judged against');
    check('a path this branch tracked and deleted IS',
      atHead.paths && has(atHead, 'scripts/gone.mjs') && has(atHead, 'scripts/stays.mjs'));
    check('a rename\'s new name is in the history too (renamed-to counts as added)',
      has(atHead, 'scripts/moved.mjs'), 'git log reports the new name under status R');
    const sp2 = splitNoFile(['scripts/gone.mjs', 'scripts/side-only.mjs'], atHead.paths ?? new Set());
    check('the split calls the deleted one deleted-here and the unmerged one foreign',
      sp2.deleted.join() === 'scripts/gone.mjs' && sp2.foreign.join() === 'scripts/side-only.mjs',
      `deleted ${sp2.deleted} foreign ${sp2.foreign}`);
    const everyRef = read(repo, { rev: '--all' });
    check('THE FIXTURE CAN FAIL: reading every ref counts the unmerged branch\'s path and the tagged one (the E1 incident)',
      has(everyRef, 'scripts/side-only.mjs') && has(everyRef, 'scripts/tag-only.mjs'),
      'if this passes with HEAD only, the fixture proves nothing');
    check('a path reachable only through a TAG is not in the history HEAD reads',
      atHead.paths && !has(atHead, 'scripts/tag-only.mjs'), 'tags are refs too; --all reads them');
    check('the command-line result does not move when another session pushes a branch',
      before.status === 0 && after.status === 0 &&
      /DELETED HERE 1 path\(s\)  scripts\/gone\.mjs/.test(before.stdout) &&
      /DELETED HERE 1 path\(s\)  scripts\/gone\.mjs/.test(after.stdout),
      `before exit ${before.status}: ${(before.stdout.match(/DELETED HERE.*/) || [before.stderr.slice(0, 120)])[0]} / after exit ${after.status}: ${(after.stdout.match(/DELETED HERE.*/) || [after.stderr.slice(0, 120)])[0]}`);
    check('the report says which history it read',
      /history    read from HEAD/.test(after.stdout), 'a verdict must say what it was read from');

    // What a developer's clone actually has: the other session's branches as REMOTE-TRACKING refs.
    git(root, 'clone', '-q', 'file://' + repo, 'clone');
    const clone = join(root, 'clone');
    git(clone, 'fetch', '-q', '--all', '--tags');
    const cloneRefs = git(clone, 'for-each-ref', '--format=%(refname)').split('\n').filter(r => /refs\/remotes\/origin\/(other|side)$/.test(r)).length;
    const inClone = read(clone);
    check('a clone that has fetched other sessions\' branches does not read them (remote-tracking refs and tags are not HEAD\'s history)',
      cloneRefs === 2 && inClone.paths && !has(inClone, 'scripts/remote-only.mjs') && !has(inClone, 'scripts/side-only.mjs') && !has(inClone, 'scripts/tag-only.mjs') && has(inClone, 'scripts/gone.mjs'),
      `remote-tracking refs seen ${cloneRefs}`);
    check('...and the fixture can fail there too: --all in the clone does read the remote-tracking branch',
      has(read(clone, { rev: '--all' }), 'scripts/remote-only.mjs'));

    // A branch that LANDED is history: its commits are reachable through the merge, including a file the
    // branch added and deleted again before the merge (which a first-parent log never shows).
    git(repo, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
    git(repo, 'rm', '-q', 'scripts/side-only.mjs'); git(repo, 'commit', '-q', '-m', 'then delete it');
    const merged = read(repo);
    check('a merged branch\'s files are reachable, so deleting one later reads as deleted-here',
      has(merged, 'scripts/side-only.mjs'), 'a log narrowed to the first parent drops commits that came in by a merge');
    check('...including one the branch added and deleted before the merge (only a first-parent log misses it)',
      has(merged, 'scripts/inside.mjs'), 'git log --first-parent shows only the merge\'s own diff, which never had it');

    // HEAD means HEAD: not main, and not its parent.
    git(repo, 'checkout', '-q', '--detach', shaB);
    const old = read(repo);
    check('the history is that of HEAD wherever HEAD is: detached on an older commit it holds that commit\'s own additions and nothing later',
      has(old, 'scripts/at-head.mjs') && has(old, 'scripts/gone.mjs') && !has(old, 'scripts/moved.mjs'),
      'a reader that names a branch, or HEAD^, differs here');
    git(repo, 'checkout', '-q', 'main');
    put(repo, 'HEAD', 'a file named like the revision\n');
    check('a work-tree file named HEAD does not make the revision ambiguous',
      has(read(repo), 'scripts/gone.mjs'), 'git log HEAD without `--` refuses when a path of that name exists');
    rmSync(join(repo, 'HEAD'));

    // The states that must stay a PROBLEM, never an empty history, on the function AND on the command line.
    git(root, 'clone', '-q', '--depth', '1', 'file://' + repo, 'shallow');
    const sh = read(join(root, 'shallow'));
    check('a shallow clone is a problem, not an empty history',
      sh.paths === null && /SHALLOW/.test(sh.problem ?? ''), JSON.stringify(sh).slice(0, 120));
    const shCli = cli(join(root, 'shallow'));
    check('...and the command line fails on it, naming why',
      shCli.status === 1 && /SHALLOW/.test(shCli.stdout + shCli.stderr), `exit ${shCli.status}`);
    mkdirSync(join(root, 'not-a-repo'));
    // GIT_CEILING_DIRECTORIES: a temp directory that sits inside some work tree must not find THAT repository.
    const nr = read(join(root, 'not-a-repo'), { env: { ...gitEnv, GIT_CEILING_DIRECTORIES: root } });
    check('a directory with no history is a problem, not an empty history, and says why',
      nr.paths === null && /unreadable \(git log HEAD\)/.test(nr.problem ?? '') && /not a git repository/.test(nr.problem ?? ''), JSON.stringify(nr).slice(0, 160));

    // workflow-check requires fetch-depth: 0 on a job that runs a file containing `git log` (its historyReaders
    // regex reads the file's text). The call is now an argument list, so the text has to be here on purpose.
    const code = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    check('this script still contains `git log` in code, so workflow-check keeps requiring a full clone of any job that runs it',
      /git (log|rev-list)\b/.test(code), 'the historyReaders detector matches file text; a refactor of the call must not hide the reader from it');
  } catch (e) {
    check('the fixture repositories could be built and read', false, String((e && e.stderr) || (e && e.message) || e).trim().split('\n')[0].slice(0, 200));
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    tidy();
  }

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

// EVERY PATH THE HISTORY BEHIND HEAD HAS EVER TRACKED (see everTrackedPaths for
// which history, and why it is not every ref).
//
// A SHALLOW CLONE MUST ABORT, not report zero. `splitNoFile` against an empty
// history classifies everything as foreign, so a truncated log turns the whole
// deleted-here state off and leaves the check passing — the precise failure
// that wasted a pass on jubilant-bassoon two days ago, where 201 grafted
// commits were read as the repo's history and a conclusion drawn from them.
// check:workflows enforces the precondition at the door: this file now contains
// `git log`, so its historyReaders detector requires fetch-depth: 0 on any job
// that runs it. Both jobs that do already carry it.
const { paths: everTracked, problem: historyProblem } = everTrackedPaths();

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
if (everTracked) console.log(`  history    read from ${HISTORY_REV}: ${everTracked.size} path(s) ever added or renamed-to in what is reachable from it (not from other branches)`);
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
