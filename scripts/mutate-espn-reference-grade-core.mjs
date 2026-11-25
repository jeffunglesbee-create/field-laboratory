#!/usr/bin/env node
// Mutation harness for scripts/espn-reference-grade-core.mjs and its check (CLAUDE.md Rule 90, written BEFORE the check is trusted): break each rule
// on purpose, run the check on the broken copy, and require it to go red. The harness distrusts itself first: every anchor must occur EXACTLY once in
// the core's text (or the run stops: a mutant that applied nowhere would read as a weak check), every mutated copy must still parse (a syntax error
// turns any check red for the wrong reason), and the unmodified copy and a comment-only copy must PASS with at least MIN_ASSERTIONS assertions.
// A mutant is CAUGHT when the check exits non-zero on it (a crash counts, and is reported as one).
//
// EQUIVALENT (not mutated, with the reason): the `|| (x.v === null || y.v === null ? 0 : x.v - y.v)` tie-break of the sort changes only the order of
// two goals that already share a displayed clock, which is a tie and is reported as one whichever comes first; the `num(...)` guard on clock.value
// (value is only a tie-break); the bookkeeping of `matchesByOutcome`, which no rule reads. FOUND BY THIS HARNESS'S FIRST RUN, each shown equivalent by
// an identity, not by the harness's silence: the `homeAway` value test (anything but 'home' or 'away' leaves no home or no away competitor, which the
// next test rejects with the same reason); `comp.length !== 2` (three competitors are three ids, and `byId.size !== 2` rejects them with the same
// reason); `before.home !== a || before.away !== b` (before.home + before.away is k and a + b is k, so one differing means the other does: `&&` is the
// same test); `t.home === final.home && t.away === final.away` (goals.length equals final.home + final.away is enforced first, so the totals sum
// alike and one side fitting means the other does); and `partitions` (every call is counted through one of two branches, so it holds by construction
// and is kept as a tripwire against a later edit).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MIN_ASSERTIONS = 84
const dir = path.dirname(fileURLToPath(import.meta.url))
const CORE = path.join(dir, 'espn-reference-grade-core.mjs')
const CHECK = path.join(dir, 'check-espn-reference-grade-core.mjs')
const src = fs.readFileSync(CORE, 'utf8')
const M = (name, anchor, replacement) => ({ name, anchor, replacement })
const MUTANTS = [
  // ---- timelineOf: the competitors
  M('competitors: a second home accepted', 'home.length !== 1 || away.length !== 1', 'false'),
  M('competitors: a repeated id accepted', 'byId.size !== 2 || ', ''),
  M('competitors: a fractional score accepted', '|| count(c.score) === null', ''),
  M('competitors: an empty id accepted', "|| c.id === ''", ''),
  // ---- timelineOf: what is a goal
  M('goal: a row without scoringPlay counts', 'r.scoringPlay !== true || r.shootout === true', 'r.scoringPlay === false || r.shootout === true'),
  M('goal: a shootout kick counts', ' || r.shootout === true', ''),
  M('goal: an absent shootout flag is a shootout', 'r.shootout === true', 'r.shootout !== false'),
  M('goal: a team that is not a competitor accepted', 'if (team === undefined || display === null) return', 'if (display === null) return'),
  M('goal: an unreadable clock accepted', 'if (team === undefined || display === null) return', 'if (team === undefined) return'),
  M('goal: the stoppage part of the clock ignored', "(?:\\+(\\d{1,2})')?$/", "$/"),
  M('goal: the clock may have no apostrophe', "/^(\\d{1,3})'", '/^(\\d{1,3})'+"'?"),
  M('goal: a goal count that differs from the score accepted', 'if (goals.length !== final.home + final.away) return', 'if (false) return'),
  M('goal: rows that are not a list accepted', 'if (rows === null) return', 'if (false) return'),
  // ---- timelineOf: own goals
  M('own goal: the flip is the identity', "const flip = (s) => (s === 'home' ? 'away' : 'home')", 'const flip = (s) => s'),
  M('own goal: an own-goal flag is any truthy value', 'own: r.ownGoal === true', 'own: Boolean(r.ownGoal)'),
  M('own goal: one convention is enough, neither is not checked', 'if (!opposite && !same) return', 'if (!opposite) return'),
  M('own goal: both conventions must fit', 'if (!opposite && !same) return', 'if (!opposite || !same) return'),
  M('own goal: an ambiguous own goal gets a side', "convention === 'same' ? g.rowSide : null", "convention === 'same' ? g.rowSide : g.rowSide"),
  M("own goal: 'same' is read as 'opposite'", "convention === 'opposite' ? flip(g.rowSide) : convention === 'same' ? g.rowSide : null", "convention === 'opposite' || convention === 'same' ? flip(g.rowSide) : null"),
  M("own goal: the convention is 'none' with an own goal", "const convention = !hasOwn ? 'none' :", "const convention = false ? 'none' :"),
  M("own goal: an ambiguous pair is called opposite", "opposite && same ? 'ambiguous' : opposite ? 'opposite' : 'same'", "opposite ? 'opposite' : 'same'"),
  M('own goal: no own goal, but neither fits, is read as a convention failure', 'hasOwn ? REASONS.convention : REASONS.sides', 'REASONS.convention'),
  // ---- timelineOf: order and ties
  M('order: by minute only, not the added minutes', '(x.m * 100 + x.a) - (y.m * 100 + y.a)', 'x.m - y.m'),
  M('order: descending', '(x.m * 100 + x.a) - (y.m * 100 + y.a)', '(y.m * 100 + y.a) - (x.m * 100 + x.a)'),
  M('tie: added minutes ignored', 'goals[i].m === goals[i + 1].m && goals[i].a === goals[i + 1].a', 'goals[i].m === goals[i + 1].m'),
  M('tie: minutes ignored', 'goals[i].m === goals[i + 1].m && goals[i].a === goals[i + 1].a', 'goals[i].a === goals[i + 1].a'),
  M('tie: the last goal looks past the end', 'i + 1 < goals.length && ', ''),
  // ---- bsdSidesOf
  M('bsd: a capture that is not sequential trusted', 'bsd.sequential !== true || ', ''),
  M('bsd: a capture that is not ok trusted', 'bsd.ok !== true || ', ''),
  M('bsd: a goal that moves a score by two read', 'dh === 1 && da === 0 ? ', 'dh >= 1 && da === 0 ? '),
  M('bsd: away read as home', "dh === 0 && da === 1 ? 'away'", "dh === 0 && da === 1 ? 'home'"),
  M('bsd: the added minutes ignored', 'g.minute + (num(g.added) === null ? 0 : g.added)', 'g.minute'),
  M('bsd: the extra-time flag dropped', 'extended: bsd.extended === true', 'extended: false'),
  // ---- gradeAgainstEspn: the match
  M('match: an unreached match graded', 'if (!isObj(m.reach) || m.reach.reached !== true)', 'if (false)'),
  M('match: a reach that is not an object is reached', 'if (!isObj(m.reach) || m.reach.reached !== true)', 'if (isObj(m.reach) && m.reach.reached !== true)'),
  M('match: a missing ESPN payload graded', 'if (!isObj(m.espn))', 'if (false)'),
  M('match: an unusable timeline graded', 'if (!tl.ok) {', 'if (false) {'),
  M('match: the reach reason is used as a key unchecked', "`no ESPN id for the match: ${safe(isObj(r) ? r.reason : null)}`", "`no ESPN id for the match: ${isObj(r) ? r.reason : null}`"),
  M('match: the slug is used as a key unchecked', 'const k = safe(slug)', 'const k = slug'),
  M('match: calls are not counted into the population', 'out.population += calls.length', 'out.population += 0'),
  M('match: calls are not counted by directory', 'S.calls += calls.length', 'S.calls += 0'),
  M('match: a not-applicable match is not counted by directory', 's.notApplicable += n', 's.notApplicable += 0'),
  // ---- the guard
  M('guard: any capture compared, extra time included', "bsd.extended ? 'not compared (extra time)' : ", ''),
  M('guard: a capture with no full-time row compared', "bsd.final === null ? 'not compared (no full-time row)' : ", ''),
  M('guard: either score equal is enough', 'bsd.final.home === tl.final.home && bsd.final.away === tl.final.away', 'bsd.final.home === tl.final.home || bsd.final.away === tl.final.away'),
  M('guard: a difference does not stop the match', "if (guard === 'differs')", 'if (false)'),
  // ---- the call
  M('call: a bad side graded', "if (side !== 'home' && side !== 'away') { na(slug, REASONS.side); continue }", ''),
  M('call: a missing score graded', 'if (a === null || b === null) { na(slug, REASONS.score); continue }', ''),
  M('call: an open outcome graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') { na(slug, REASONS.outcome); continue }", ''),
  M('call: the resolving goal is the k-th', 'const resolving = tl.goals[k]', 'const resolving = tl.goals[k > 0 ? k - 1 : 0]'),
  M('call: a missing resolving goal graded', "if (resolving === undefined) { na(slug, REASONS.none); continue }", ''),
  M('call: the join not checked', 'if (beforeKnown && (before.home !== a || before.away !== b)) { na(slug, REASONS.join); continue }', ''),
  M('call: an ambiguous resolving own goal graded', "if (resolving.side === null) { na(slug, REASONS.ownGoal); continue }", ''),
  M('call: an ambiguous earlier own goal graded', "if (!beforeKnown) { na(slug, REASONS.ownGoal); continue }", ''),
  M('call: a tie with the next goal ignored', 'resolving.tieNext || (k > 0 && tl.goals[k - 1].tieNext)', '(k > 0 && tl.goals[k - 1].tieNext)'),
  M('call: a tie with the previous goal ignored', 'resolving.tieNext || (k > 0 && tl.goals[k - 1].tieNext)', 'resolving.tieNext'),
  M('verdict: inverted', "resolving.side === side ? 'hit' : 'miss'", "resolving.side === side ? 'miss' : 'hit'"),
  M('agree: inverted', 'const agree = verdict === call.outcome', 'const agree = verdict !== call.outcome'),
  M('agree: not counted by directory', 'if (agree) { out.agree++; S.agree++ } else { out.disagree++; S.disagree++ }', 'if (agree) { out.agree++ } else { out.disagree++; S.disagree++ }'),
  M('graded: not counted by directory', 'S.graded++', ''),
  // ---- the tallies
  M('distance: nominal minute replaced by the full clock', 'Math.abs(resolving.m - rm)', 'Math.abs(resolving.m + resolving.a - rm)'),
  M('distance: the 3+ bucket starts at 4', "d >= 3 ? (stoppage ? '3+ stoppage' : '3+')", "d >= 4 ? (stoppage ? '3+ stoppage' : '3+')"),
  M('distance: stoppage not told apart', "(stoppage ? '3+ stoppage' : '3+')", "'3+'"),
  M('distance: stoppage read from the wrong goal field', 'resolving.a > 0)', 'resolving.m > 0)'),
  M('distance: an absent minute is a distance', "bucket(rm === null ? null : Math.abs(resolving.m - rm)", "bucket(Math.abs(resolving.m - (rm === null ? 0 : rm))"),
  M('bsd on goal: a minute within two accepted', 'Math.abs(bg.minute - (resolving.m + resolving.a)) <= 1', 'Math.abs(bg.minute - (resolving.m + resolving.a)) <= 2'),
  M('bsd on goal: the side not compared', 'bg.side === resolving.side && bg.minute !== null', 'bg.minute !== null'),
  M('bsd on goal: a goal BSD does not have read as differing', "bg === undefined ? 'BSD has no goal there'", "bg === undefined ? 'BSD differs from ESPN'"),
  // ---- step A
  M('step A: a different number counted as identical', 'if (e.length !== b.length) { a.differentInNumber++; return }', 'if (false) { a.differentInNumber++; return }'),
  M('step A: the order of sides ignored', "if (!sameSides) a.differentInOrder++", "if (false) a.differentInOrder++"),
  M('step A: minutes within two', 'Math.abs((g.m + g.a) - b[i].minute) <= 1', 'Math.abs((g.m + g.a) - b[i].minute) <= 2'),
  M('step A: the added minutes left out of ESPN\'s minute', '(g.m + g.a) - b[i].minute', 'g.m - b[i].minute'),
  M('step A: an own goal with no side counts as agreeing', "g.side === null ? false : g.side === b[i].side", "g.side === null ? true : g.side === b[i].side"),
  M('step A: the E3 comparison inverted', "e[i].rowSide === b[i].side ? 'is the side BSD credits' : 'is the other side'", "e[i].rowSide === b[i].side ? 'is the other side' : 'is the side BSD credits'"),
  M('step A: only own goals compared', 'if (!e[i].own) continue', 'if (e[i].own) continue'),
  M('step A: not run', 'if (bsd !== null) stepA(tl, bsd, out.stepA)', ''),
  // ---- the partition and the line
  M('coverage line: the population left out', 'of ${g.population} calls', 'calls'),
  M('coverage line: step A left out', ' | step A on ${a.matchesCompared} matches', ''),
]

// THE MUTATION IS MADE ON A COPY in a temp directory, and the tracked scripts/ is only read (scripts/mutate-copy-check.mjs holds every mutate-* script to it). The
// check is run FROM THAT COPY with --self-test: the flag changes nothing in the check, but a process started from outside the repo with it is the one the copy-check
// makes fail (a second run) or silent (a third), so a copy that cannot run stops this script at its control instead of reading as every mutation caught. TMP is the
// REAL path: reached through a symlink a copy is not the entry point of its own file (macOS's $TMPDIR is under /var, which is one).
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'espn-ref-mutate-')))
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }))
fs.cpSync(dir, path.join(TMP, 'scripts'), { recursive: true })
const CHECK_COPY = path.join(TMP, 'scripts', 'check-espn-reference-grade-core.mjs')
const tmpCore = path.join(TMP, 'espn-reference-grade-core.mjs')
function runWith (text) {
  fs.writeFileSync(tmpCore, text)
  const parse = spawnSync(process.execPath, ['--check', tmpCore], { encoding: 'utf8' })
  if (parse.status !== 0) return { invalid: true, detail: (parse.stderr || '').split('\n').slice(0, 3).join(' | ') }
  const r = spawnSync(process.execPath, [CHECK_COPY, '--self-test'], { encoding: 'utf8', timeout: 30000, env: { ...process.env, CORE_FILE: tmpCore } })
  return { status: r.status, out: `${r.stdout}${r.stderr}`, timedOut: r.error !== undefined && r.error.code === 'ETIMEDOUT' }
}
let bad = 0
const problems = []
const clean = runWith(src)
const m = clean.invalid ? null : /^ok (\d+) assertions/m.exec(clean.out)
// POSITIVE CONTROL, ENFORCED: the unmutated copy must pass and must PRINT its tally (a copy that exits 0 saying nothing is not a pass), or every "caught" below could
// mean only that the copy cannot run. The script stops here, with UNMUTATED in its line, which is what scripts/mutate-copy-check.mjs looks for.
if (clean.invalid || clean.status !== 0 || m === null || Number(m[1]) < MIN_ASSERTIONS) {
  console.log(`FAIL — the UNMUTATED copy is red, or ran fewer than ${MIN_ASSERTIONS} assertions, so no verdict below would be about the mutation: ${clean.invalid ? clean.detail : clean.out.slice(0, 300)}`)
  process.exit(1)
}
console.log('positive control: the unmutated copy passes\n')
const comment = runWith(`${src}\n// harmless\n`)
if (comment.invalid || comment.status !== 0) { bad++; problems.push('CONTROL a comment-only change turned the check red') }
let caught = 0
for (const mu of MUTANTS) {
  const count = src.split(mu.anchor).length - 1
  if (count !== 1) { console.error(`ANCHOR for "${mu.name}" occurs ${count} times, not once`); process.exit(2) }
  const mutated = src.replace(mu.anchor, () => mu.replacement)
  if (mutated === src) { console.error(`mutant "${mu.name}" did not change the text`); process.exit(2) }
  const r = runWith(mutated)
  if (r.invalid) { console.error(`mutant "${mu.name}" does not parse: ${r.detail}`); process.exit(2) }
  const crashed = r.status !== 0 && !/FAIL /.test(r.out)
  if (r.status !== 0 && !r.timedOut) { caught++; console.log(`CAUGHT   ${mu.name}${crashed ? '  (crash)' : ''}`) } else { bad++; problems.push(`NOT CAUGHT ${mu.name}`); console.log(`NOT CAUGHT ${mu.name}`) }
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught; controls ${clean.status === 0 && comment.status === 0 ? 'ok' : 'FAILED'}; ${MIN_ASSERTIONS} assertions required of the clean copy`)
if (bad) { console.log(problems.join('\n')); process.exit(1) }
