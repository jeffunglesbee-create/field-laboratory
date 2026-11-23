#!/usr/bin/env node
// Rule 90 for scripts/check-bsd-next-goal-grade-core.mjs. HALF 1 breaks a temp copy of the REAL scripts/bsd-next-goal-grade-core.mjs
// the ways a grade, a reason or a count can be wrong, and requires the check to go red on each. HALF 2 breaks the check itself:
// mutations that must leave it BLIND on a broken grader (so its red depends on that line), and mutations that tighten a gate and
// must turn it red on the real grader.
//
// Each anchor occurs exactly once and its replacement differs; a mutant that does not parse is NOT APPLIED (a SyntaxError would
// otherwise count as caught for the wrong reason); CAUGHT needs exit 1 and a FAIL line in the check's own output; the baseline
// runs first; the real files are hashed before and after and must not move.
//
// Left out as EQUIVALENT, each for a stated reason, so no reader counts them as missed:
//   `prev.home !== a || prev.away !== b` to `||` -> `&&` or to either half: the capture's total before the resolving goal is k and
//     a + b is k, so one side differs exactly when the other does.
//   `dh === 1 && da === 0` to `dh === 1` (and the away twin): the resolving goal's total is its predecessor's plus one, so
//     dh + da is 1 and dh is 1 exactly when da is 0.
//   `p.ok &&` in the two distinct-capture counters: an unreadable capture has no withoutScore, and `undefined > 0` and
//     `undefined === 0` are both false.
//   `{ home: 0, away: 0 }` -> `{ home: a, away: b }` for k === 0: k is a + b of two whole numbers that are 0 or more, so both are 0.
//   `latest !== null &&` before `g.minute < latest`: a minute is never below null (0) unless it is negative, and a minute cannot be.
//   `!parsed.ok ||` and `parsed.withoutScore > 0 ||` in finalAgreement (removed from the code): `sequential` is undefined for an unreadable
//     capture and false for one with a goal row lacking a score, so `!parsed.sequential` already says it.
//   from the second-round reviewers' 203 mutants, the 29 that still survive were each read and are equivalent or out of scope: `bump` with `+ 1`
//     for `+ n` (n is always 1); a sort that breaks ties by minute, by home score, or never returns 0 (totals are unique in a trusted capture, and
//     an untrusted one is never graded); a join that compares one score instead of two (see above); a draw verdict (a side is home or away by
//     then); `added > 0` against `added >= 1`, a distance bucket at 2.5 or 2.9 against 3, and `Math.abs(rm - minute) + 0` (minutes are whole);
//     a tag looked up with `in` or read with `for-in`, or a tag value kept as text when it is text (plain objects, and `String` of text is text);
//     a goal-type `i` flag (the class holds both cases); `coverageLine` printing n/a for a null census count or an array census (decisions, not
//     defects: the runner passes numbers or nothing); `unreadable` tested in two steps; `list.sort(() => 0)` on the input (a stable no-op).
//   the parse cache: recomputing a capture's goals for every call changes the cost, not a count.
//
// Usage: node scripts/mutate-bsd-next-goal-grade-core.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import R2_MUTATIONS from './fixtures/bsd-next-goal-grade-mutants-r2.mjs'

const SRC = 'scripts/bsd-next-goal-grade-core.mjs'
const CHECK = 'scripts/check-bsd-next-goal-grade-core.mjs'
const FIX = 'scripts/fixtures/bsd-next-goal-grade-synthetic.mjs'
const REAL = [SRC, CHECK, FIX]
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const before = Object.fromEntries(REAL.map((f) => [f, sha(f)]))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mut-ngg-'))

// [name, anchor, replacement] or [name, [[anchor, replacement], ...]]
const OWN_MUTATIONS = [
  // ---- readGoals: which rows are read
  ['a non-array incidents is read', 'isObj(json) && Array.isArray(json.incidents) ? json.incidents : null', 'isObj(json) ? json.incidents : null'],
  ['a body with no incidents is readable', 'if (rows === null) return { ok: false }', ''],
  ['a row that is not an object is read', "if (!isObj(r)) continue\n    if (r.type === 'period') {", "if (r.type === 'period') {"],
  ['every row with scores is a goal', "if (r.type !== 'goal') continue", ''],
  // ---- readGoals: the full-time row
  ['a live full-time row is a full-time row', "if (final === null && r.is_live === false && typeof r.text === 'string' && FULL_TIME.test(r.text)) {", "if (final === null && typeof r.text === 'string' && FULL_TIME.test(r.text)) {"],
  ['any period row is a full-time row', "if (final === null && r.is_live === false && typeof r.text === 'string' && FULL_TIME.test(r.text)) {", 'if (final === null && r.is_live === false) {'],
  ['the last full-time row wins', "if (final === null && r.is_live === false", 'if (r.is_live === false'],
  ['FT is not full time', 'const FULL_TIME = /^(ft|aet|ap|pen)/i', 'const FULL_TIME = /^(aet|ap|pen)/i'],
  ['AET is not full time', 'const FULL_TIME = /^(ft|aet|ap|pen)/i', 'const FULL_TIME = /^(ft|ap|pen)/i'],
  ['AP is not full time', 'const FULL_TIME = /^(ft|aet|ap|pen)/i', 'const FULL_TIME = /^(ft|aet|pen)/i'],
  ['PEN is not full time', 'const FULL_TIME = /^(ft|aet|ap|pen)/i', 'const FULL_TIME = /^(ft|aet|ap)/i'],
  ['full time is case sensitive', 'const FULL_TIME = /^(ft|aet|ap|pen)/i', 'const FULL_TIME = /^(ft|aet|ap|pen)/'],
  ['full time may begin anywhere in the text', 'const FULL_TIME = /^(ft|aet|ap|pen)/i', 'const FULL_TIME = /(ft|aet|ap|pen)/i'],
  ['a full-time row with no scores has a score', 'if (h !== null && a !== null) final = { home: h, away: a }', 'final = { home: h, away: a }'],
  ['half a full-time score is a score', 'if (h !== null && a !== null) final', 'if (h !== null || a !== null) final'],
  ['the full-time home score is the away score', 'const h = num(r.home_score)\n        const a = num(r.away_score)\n        if (h', 'const h = num(r.away_score)\n        const a = num(r.away_score)\n        if (h'],
  ['the full-time away score is the home score', 'const h = num(r.home_score)\n        const a = num(r.away_score)\n        if (h', 'const h = num(r.home_score)\n        const a = num(r.home_score)\n        if (h'],
  // ---- readGoals: a goal row
  ['half a score is a score', 'if (home === null || away === null) {', 'if (home === null && away === null) {'],
  ['a goal row without a score is not counted', '{ withoutScore++; continue }', '{ continue }'],
  ['a goal row without a score is kept as a goal', '{ withoutScore++; continue }', '{ withoutScore++ }'],
  ['the home score is read from the away field', 'const home = num(r.home_score)\n    const away = num(r.away_score)\n    if (home === null', 'const home = num(r.away_score)\n    const away = num(r.away_score)\n    if (home === null'],
  ['the away score is read from the home field', 'const home = num(r.home_score)\n    const away = num(r.away_score)\n    if (home === null', 'const home = num(r.home_score)\n    const away = num(r.home_score)\n    if (home === null'],
  ['a text minute is a minute', 'minute: num(r.minute),', 'minute: r.minute,'],
  ['a text added_time is added time', 'added: num(r.added_time),', 'added: r.added_time,'],
  ['the total is the home score', 'total: home + away,', 'total: home,'],
  ['the goal type is read unsanitised', "type: typeof r.goal_type === 'string' && GOAL_TYPE.test(r.goal_type) ? r.goal_type : typeof r.goal_type === 'string' ? '(other)' : '(none)',", "type: typeof r.goal_type === 'string' ? r.goal_type : '(none)',"],
  ['a goal type that is not text is (other)', "? r.goal_type : typeof r.goal_type === 'string' ? '(other)' : '(none)'", "? r.goal_type : typeof r.goal_type === 'string' ? '(none)' : '(other)'"],
  ['a goal type that is odd text is (none)', "? '(other)' : '(none)',", "? '(none)' : '(none)',"],
  ['a goal type may start with a digit', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/"],
  ['a goal type may be 25 characters', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,24}$/"],
  ['a goal type may be 23 characters at most', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,22}$/"],
  ['a goal type has no underscore', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9-]{0,23}$/"],
  ['a goal type has no hyphen', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/"],
  ['a goal type is not anchored at its end', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}/"],
  ['a goal type is not anchored at its start', "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/", "const GOAL_TYPE = /[A-Za-z][A-Za-z0-9_-]{0,23}$/"],
  ['is_home is read as it comes', "isHome: typeof r.is_home === 'boolean' ? r.is_home : null,", 'isHome: r.is_home === undefined ? null : r.is_home,'],
  // ---- readGoals: order, sequence, diagnostics
  ['goals are not ordered', 'goals.sort((x, y) => x.total - y.total)', ''],
  ['goals are ordered newest first', 'goals.sort((x, y) => x.total - y.total)', 'goals.sort((x, y) => y.total - x.total)'],
  ['goals are ordered by minute', 'goals.sort((x, y) => x.total - y.total)', 'goals.sort((x, y) => x.minute - y.minute)'],
  ['a goal row without a score is sequential', 'const sequential = withoutScore === 0 && goals.every(', 'const sequential = goals.every('],
  ['totals start at zero', 'g.total === i + 1', 'g.total === i'],
  ['any increasing totals are sequential', 'g.total === i + 1', 'g.total >= i + 1'],
  ['sequential is always true', 'const sequential = withoutScore === 0 && goals.every((g, i) => g.total === i + 1)', 'const sequential = true'],
  ['a goal with no minute is a tie', 'if (g.minute === null) continue', ''],
  ['ties are not seen', 'if (seen.has(clock)) twoInOneMinute = true', ''],
  ['every minute is a tie', 'if (seen.has(clock)) twoInOneMinute = true', 'twoInOneMinute = true'],
  ['a tie is out of order', 'if (latest !== null && clock < latest) minuteOrderBroken = true', 'if (latest !== null && clock <= latest) minuteOrderBroken = true'],
  ['a descent is not seen', 'if (latest !== null && clock < latest) minuteOrderBroken = true', ''],
  ['an ascent is out of order', 'if (latest !== null && clock < latest) minuteOrderBroken = true', 'if (latest !== null && clock > latest) minuteOrderBroken = true'],
  ['the clock ignores added time', 'const clock = g.minute * 1000 + (g.added === null ? 0 : g.added)', 'const clock = g.minute * 1000'],
  ['the clock is only the added time', 'const clock = g.minute * 1000 + (g.added === null ? 0 : g.added)', 'const clock = g.added === null ? 0 : g.added'],
  ['the clock weighs a minute as one added minute', 'const clock = g.minute * 1000 + (g.added === null ? 0 : g.added)', 'const clock = g.minute + (g.added === null ? 0 : g.added)'],
  ['the clock weighs added time out of all proportion', 'const clock = g.minute * 1000 + (g.added === null ? 0 : g.added)', 'const clock = g.minute * 1000 + 1000 * (g.added === null ? 0 : g.added)'],
  // ---- finalAgreement
  ['a missing capture is evaluated', "export function finalAgreement (parsed) {\n  if (!parsed || !parsed.sequential) return 'not evaluated'", "export function finalAgreement (parsed) {\n  if (!parsed.sequential) return 'not evaluated'"],
  ['a missing capture is evaluated for the live row', "export function liveAgreement (parsed) {\n  if (!parsed || !parsed.sequential) return 'not evaluated'", "export function liveAgreement (parsed) {\n  if (!parsed.sequential) return 'not evaluated'"],
  ['a gap in the totals is evaluated', "export function finalAgreement (parsed) {\n  if (!parsed || !parsed.sequential) return 'not evaluated'", "export function finalAgreement (parsed) {\n  if (!parsed) return 'not evaluated'"],
  ['a gap in the totals is evaluated for the live row', "export function liveAgreement (parsed) {\n  if (!parsed || !parsed.sequential) return 'not evaluated'", "export function liveAgreement (parsed) {\n  if (!parsed) return 'not evaluated'"],
  ['extra time is compared with the full-time row', "if (parsed.extended) return 'not evaluated (extra time)'\n  if (parsed.final === null)", "if (parsed.final === null)"],
  ['extra time is compared with the live row', "if (parsed.extended) return 'not evaluated (extra time)'\n  if (parsed.live === null)", "if (parsed.live === null)"],
  ['extra time has no label for the full-time row', "if (parsed.extended) return 'not evaluated (extra time)'\n  if (parsed.final === null)", "if (parsed.extended) return 'not evaluated'\n  if (parsed.final === null)"],
  ['extra time has no label for the live row', "if (parsed.extended) return 'not evaluated (extra time)'\n  if (parsed.live === null)", "if (parsed.extended) return 'not evaluated'\n  if (parsed.live === null)"],
  ['no live row score is evaluated', "if (parsed.live === null) return 'no live row score'", ''],
  ['the live row has the full-time label', "if (parsed.live === null) return 'no live row score'", "if (parsed.live === null) return 'no full-time score'"],
  ['a live row is compared by home only', "return last.home === parsed.live.home && last.away === parsed.live.away ? 'matches' : 'differs'", "return last.home === parsed.live.home ? 'matches' : 'differs'"],
  ['a live row is compared by away only', "return last.home === parsed.live.home && last.away === parsed.live.away ? 'matches' : 'differs'", "return last.away === parsed.live.away ? 'matches' : 'differs'"],
  ['a live row matches when either score does', "return last.home === parsed.live.home && last.away === parsed.live.away ? 'matches' : 'differs'", "return last.home === parsed.live.home || last.away === parsed.live.away ? 'matches' : 'differs'"],
  ['the live row matches and differs are swapped', "last.away === parsed.live.away ? 'matches' : 'differs'", "last.away === parsed.live.away ? 'differs' : 'matches'"],
  ['no goals is not 0-0 for the last score', 'const lastScore = (parsed) => (parsed.goals.length === 0 ? { home: 0, away: 0 } :', 'const lastScore = (parsed) => (parsed.goals.length === 0 ? { home: 9, away: 9 } :'],
  ['the last score is the first goal', 'parsed.goals[parsed.goals.length - 1])', 'parsed.goals[0])'],
  ['no full-time row is evaluated', "if (parsed.final === null) return 'no full-time score'", ''],
  ['no goals is not 0-0', 'parsed.goals.length === 0 ? { home: 0, away: 0 } :', 'parsed.goals.length === 0 ? { home: 1, away: 0 } :'],
  ['the last goal is the first', 'parsed.goals[parsed.goals.length - 1]', 'parsed.goals[0]'],
  ['only the home score is compared', 'last.home === parsed.final.home && last.away === parsed.final.away ? \'matches\'', "last.home === parsed.final.home ? 'matches'"],
  ['only the away score is compared', 'last.home === parsed.final.home && last.away === parsed.final.away ? \'matches\'', "last.away === parsed.final.away ? 'matches'"],
  ['either score matching is a match', 'last.home === parsed.final.home && last.away === parsed.final.away ? \'matches\'', "last.home === parsed.final.home || last.away === parsed.final.away ? 'matches'"],
  ['the full-time matches and differs are swapped', "last.away === parsed.final.away ? 'matches' : 'differs'", "last.away === parsed.final.away ? 'differs' : 'matches'"],
  // ---- gradeCall
  ['a call may be on no side', "if (side !== 'home' && side !== 'away') return", "if (false) return"],
  ['only home calls are sided', "if (side !== 'home' && side !== 'away') return", "if (side !== 'home') return"],
  ['any text is a side', "if (side !== 'home' && side !== 'away') return", "if (typeof side !== 'string') return"],
  ['the side of no call is read', 'const side = isObj(call) ? call.side : undefined', 'const side = call.side'],
  ['a fraction is a score', 'const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null)', 'const count = (v) => (num(v) !== null && v >= 0 ? v : null)'],
  ['a negative number is a score', 'Number.isInteger(v) && v >= 0 ? v : null', 'Number.isInteger(v) ? v : null'],
  ['NaN is a score', 'Number.isInteger(v) && v >= 0 ? v : null', "typeof v === 'number' && v >= 0 ? v : null"],
  ['text is a score', 'Number.isInteger(v) && v >= 0 ? v : null', "Number.isInteger(Number(v)) && v >= 0 ? v : null"],
  ['the home score of the call is read from away', 'const a = isObj(sc) ? count(sc.home) : null', 'const a = isObj(sc) ? count(sc.away) : null'],
  ['the away score of the call is read from home', 'const b = isObj(sc) ? count(sc.away) : null', 'const b = isObj(sc) ? count(sc.home) : null'],
  ['one side of the score is enough', 'if (a === null || b === null) return', 'if (a === null && b === null) return'],
  ['the score is not required', 'if (a === null || b === null) return', 'if (false) return'],
  ['an open call is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", 'if (false) return'],
  ['only hit is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", "if (call.outcome !== 'hit') return"],
  ['only miss is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", "if (call.outcome !== 'miss') return"],
  ['nogoal is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", "if (call.outcome !== 'hit' && call.outcome !== 'miss' && call.outcome !== 'nogoal') return"],
  ['unclear is graded', "if (call.outcome !== 'hit' && call.outcome !== 'miss') return", "if (call.outcome !== 'hit' && call.outcome !== 'miss' && call.outcome !== 'unclear') return"],
  ['an unreadable capture is read', 'if (!parsed || !parsed.ok) return', 'if (!parsed) return'],
  ['a missing capture is read', 'if (!parsed || !parsed.ok) return', 'if (!parsed.ok) return'],
  ['a goal row without a score is trusted', 'if (parsed.withoutScore > 0) return', 'if (false) return'],
  ['a gap in the totals is trusted', 'if (!parsed.sequential) return', 'if (false) return'],
  ['the score is the home score alone', 'const k = a + b', 'const k = a'],
  ['the resolving goal is the one after', 'const resolving = parsed.goals[k]', 'const resolving = parsed.goals[k + 1]'],
  ['the resolving goal is the one before', 'const resolving = parsed.goals[k]', 'const resolving = parsed.goals[k - 1]'],
  ['no resolving goal is an error elsewhere', 'if (resolving === undefined) return', 'if (false) return'],
  ['the state before the goal is the goal itself', 'parsed.goals[k - 1]', 'parsed.goals[k]'],
  ['the join is not checked', 'if (prev.home !== a || prev.away !== b) return', 'if (false) return'],
  ['a join mismatch is reported as a rise', "return { graded: false, reason: REASONS.join }", "return { graded: false, reason: REASONS.rise }"],
  ['the home side is the score-down side', 'if (dh === 1 && da === 0) fieldSide', 'if (dh === -1 && da === 0) fieldSide'],
  ['any rise on the home side is home', 'if (dh === 1 && da === 0) fieldSide', 'if (dh >= 1) fieldSide'],
  ['any rise on the away side is away', 'else if (dh === 0 && da === 1) fieldSide', 'else if (da >= 1) fieldSide'],
  ['the sides are swapped', "if (dh === 1 && da === 0) fieldSide = 'home'", "if (dh === 1 && da === 0) fieldSide = 'away'"],
  ['the away side is home', "fieldSide = 'away'\n", "fieldSide = 'home'\n"],
  ['no rise is a rise', 'if (fieldSide === null) return', 'if (false) return'],
  ['the verdict is inverted', "const verdict = fieldSide === side ? 'hit' : 'miss'", "const verdict = fieldSide === side ? 'miss' : 'hit'"],
  ['the verdict is always hit', "const verdict = fieldSide === side ? 'hit' : 'miss'", "const verdict = 'hit'"],
  ['agreement is disagreement', 'agree: verdict === call.outcome,', 'agree: verdict !== call.outcome,'],
  ['agreement is always true', 'agree: verdict === call.outcome,', 'agree: true,'],
  ['the goal index is not carried', '    k,\n    goalType: resolving.type,', '    k: 0,\n    goalType: resolving.type,'],
  ['the goal type is lost', 'goalType: resolving.type,', 'goalType: undefined,'],
  ['is_home agreement is inverted', 'resolving.isHome === (fieldSide === \'home\')', 'resolving.isHome !== (fieldSide === \'home\')'],
  ['is_home absent counts as agreeing', 'resolving.isHome === null ? null :', 'resolving.isHome === null ? true :'],
  ['the distance has a sign', 'Math.abs(resolving.minute - rm)', '(resolving.minute - rm)'],
  ['a call with no resolved minute has a distance', 'rm === null || resolving.minute === null ? null', 'resolving.minute === null ? null'],
  ['a goal with no minute has a distance', 'rm === null || resolving.minute === null ? null', 'rm === null ? null'],
  ['the resolved minute is not read', 'const rm = num(call.resolved_minute)', 'const rm = call.resolved_minute'],
  ['added time of zero is stoppage', 'stoppage: resolving.added !== null && resolving.added > 0,', 'stoppage: resolving.added !== null && resolving.added >= 0,'],
  ['no added time is stoppage', 'stoppage: resolving.added !== null && resolving.added > 0,', 'stoppage: true,'],
  ['added time is never stoppage', 'stoppage: resolving.added !== null && resolving.added > 0,', 'stoppage: false,'],
  // ---- the buckets
  ['no minute is bucket zero', "d === null ? 'no minute'", "d === null ? '0'"],
  ['three is its own bucket', "d >= 3 ? (stoppage", "d > 3 ? (stoppage"],
  ['two is far', "d >= 3 ? (stoppage", "d >= 2 ? (stoppage"],
  ['four is far', "d >= 3 ? (stoppage", "d >= 4 ? (stoppage"],
  ['stoppage is never told apart', "(stoppage ? '3+ stoppage' : '3+')", "'3+'"],
  ['stoppage is always told apart', "(stoppage ? '3+ stoppage' : '3+')", "'3+ stoppage'"],
  ['a near distance on a stoppage goal is stoppage', "d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : String(d)", "stoppage ? '3+ stoppage' : d >= 3 ? '3+' : String(d)"],
  // ---- gradeCalls
  ['a non-array is read as a list', 'const list = Array.isArray(items) ? items : []', 'const list = items'],
  ['every capture is the first one', "if (!parsedByKey.has(k)) parsedByKey.set(k, readGoals(it.capture))\n    return parsedByKey.get(k)", "if (!parsedByKey.has(0)) parsedByKey.set(0, readGoals(it.capture))\n    return parsedByKey.get(0)"],
  ['a missing key aliases every capture', "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture", "it.key"],
  ['a null key is a key', "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture", "it.key !== undefined ? it.key : it.capture"],
  ['a string key is not a key', "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture", "typeof it.key === 'number' ? it.key : it.capture"],
  ['an item that is not an object is read', 'if (!isObj(it)) {', 'if (false) {'],
  ['an item that is not an object is not counted', "      out.notApplicable.total++\n      bump(out.notApplicable.byReason, REASONS.item)", "      bump(out.notApplicable.byReason, REASONS.item)"],
  ['an item that is not an object has no reason', "      out.notApplicable.total++\n      bump(out.notApplicable.byReason, REASONS.item)", "      out.notApplicable.total++"],
  ['the population is not counted', 'population: list.length,', 'population: 0,'],
  ['tallies have a prototype', 'const tally = () => Object.create(null)', 'const tally = () => ({})'],
  ['a graded call is not counted', '    out.graded++\n', ''],
  ['agreement is not counted', '    if (r.agree) out.agree++\n', '    if (r.agree) out.graded += 0\n'],
  ['disagreement is counted as agreement', '    else out.disagree++\n    bump(out.confusion', '    else out.agree++\n    bump(out.confusion'],
  ['a not-applicable call is not counted', "      out.notApplicable.total++\n      bump(out.notApplicable.byReason, r.reason)", "      bump(out.notApplicable.byReason, r.reason)"],
  ['the reasons are not tallied', '      bump(out.notApplicable.byReason, r.reason)\n', ''],
  ['the not-applicable tags are not tallied', '        cell(name, tags[name]).notApplicable++\n', ''],
  ['the not-applicable reasons are not tallied by tag', '        bump(out.notApplicable.byTagAndReason[name][t], r.reason)\n', ''],
  ['the not-applicable reasons by tag are never created', '        if (out.notApplicable.byTagAndReason[name] === undefined) out.notApplicable.byTagAndReason[name] = tally()\n', '        if (out.notApplicable.byTagAndReason[name] === undefined) out.notApplicable.byTagAndReason[name] = out.notApplicable.byTagAndReason[name]\n'],
  ['one value hides another in the reasons by tag', '        if (out.notApplicable.byTagAndReason[name][t] === undefined) out.notApplicable.byTagAndReason[name][t] = tally()\n', '        out.notApplicable.byTagAndReason[name][t] = tally()\n'],
  ['the graded tags are not tallied', "      const c = cell(name, tags[name])\n      c.graded++\n      c[r.agree ? 'agree' : 'disagree']++", ''],
  ['agreement by tag is always agree', "c[r.agree ? 'agree' : 'disagree']++", 'c.agree++'],
  ['tags that are not an object are read', 'const tags = isObj(it.tags) ? it.tags : {}', 'const tags = it.tags'],
  ['the tag cell is shared across values', "      const t = String(value)\n      if (out.byTag[name][t] === undefined)", "      const t = 'x'\n      if (out.byTag[name][t] === undefined)"],
  ['the confusion matrix is not kept', 'bump(out.confusion, `ledger ${it.call.outcome}, FIELD ${r.verdict}`)', ''],
  ['the confusion swaps the sides', 'bump(out.confusion, `ledger ${it.call.outcome}, FIELD ${r.verdict}`)', 'bump(out.confusion, `ledger ${r.verdict}, FIELD ${it.call.outcome}`)'],
  ['by ledger outcome counts everything as agree', "out.byLedgerOutcome[it.call.outcome][r.agree ? 'agree' : 'disagree']++", 'out.byLedgerOutcome[it.call.outcome].agree++'],
  ['by ledger outcome does not count graded', '    out.byLedgerOutcome[it.call.outcome].graded++\n', ''],
  ['the goal types are not tallied', '    out.resolvingGoalType[r.goalType].graded++\n', ''],
  ['goal types count everything as agree', "out.resolvingGoalType[r.goalType][r.agree ? 'agree' : 'disagree']++", 'out.resolvingGoalType[r.goalType].agree++'],
  ['is_home absent counts as agrees', 'if (r.isHomeAgreesWithRise === null) out.isHomeVersusScoreRise.absent++', 'if (r.isHomeAgreesWithRise === null) out.isHomeVersusScoreRise.agrees++'],
  ['is_home disagreement is not counted', '    else out.isHomeVersusScoreRise.disagrees++\n', ''],
  ['the distance is not tallied', '    out.resolvedMinuteDistance[b].graded++\n', ''],
  ['the distance is not split by verdict', "out.resolvedMinuteDistance[b][r.agree ? 'agree' : 'disagree']++", 'out.resolvedMinuteDistance[b].agree++'],
  ['the distance ignores stoppage', 'const b = bucket(r.distance, r.stoppage)', 'const b = bucket(r.distance, false)'],
  ['the distance is never recorded', 'const b = bucket(r.distance, r.stoppage)', "const b = 'x'"],
  ['a disagreeing call on a goal is forgotten', 'goalsSeen.get(gk).set(r.k, goalsSeen.get(gk).get(r.k) === true || !r.agree)', 'goalsSeen.get(gk).set(r.k, !r.agree)'],
  ['an agreeing call is a disagreement', 'goalsSeen.get(gk).set(r.k, goalsSeen.get(gk).get(r.k) === true || !r.agree)', 'goalsSeen.get(gk).set(r.k, goalsSeen.get(gk).get(r.k) === true || r.agree)'],
  ['every call is its own goal', 'goalsSeen.get(gk).set(r.k, goalsSeen.get(gk).get(r.k) === true || !r.agree)', 'goalsSeen.get(gk).set(out.graded, goalsSeen.get(gk).get(out.graded) === true || !r.agree)'],
  ['every capture shares its goals', 'const gk = keyOf(it)\n', 'const gk = 0\n'],
  ['distinct goals are not counted', '      out.distinctGoals.graded++\n', ''],
  ['goals with a disagreeing call are not counted', '      if (anyDisagreement) out.distinctGoals.withADisagreeingCall++\n', ''],
  ['every goal has a disagreeing call', 'if (anyDisagreement) out.distinctGoals', 'if (true) out.distinctGoals'],
  ['the side-or-score premise is not counted', 'if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises.callsWithoutSideOrScore++', ''],
  ['the side premise ignores the score', 'if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises', 'if (r.reason === REASONS.side) out.premises'],
  ['the score premise ignores the side', 'if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises', 'if (r.reason === REASONS.score) out.premises'],
  ['a call with no minute is not counted', 'if (isObj(it.call) && num(it.call.minute) === null) out.premises.callsWithoutACallMinute++', ''],
  ['a text minute is a minute on a call', 'if (isObj(it.call) && num(it.call.minute) === null)', 'if (isObj(it.call) && it.call.minute === undefined)'],
  ['a call that is not an object has a minute', 'if (isObj(it.call) && num(it.call.minute) === null)', 'if (num(it.call.minute) === null)'],
  ['every call is without a minute', 'if (isObj(it.call) && num(it.call.minute) === null)', 'if (isObj(it.call))'],
  ['the full-time score is not tallied per call', '    bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))\n', ''],
  ['the missing-score premise is not counted', 'if (r.reason === REASONS.noScore) out.premises.callsOnCapturesWithAGoalRowLackingAScore++', ''],
  ['the sequence premise is not counted', 'if (r.reason === REASONS.sequence) out.premises.callsOnCapturesWhoseTotalsAreNotOneToN++', ''],
  ['the join premise is not counted', 'if (r.reason === REASONS.join) out.premises.callsWhoseScoreAtCallDisagreesWithTheCapture++', ''],
  ['the join premise counts the rise', 'if (r.reason === REASONS.join) out.premises', 'if (r.reason === REASONS.rise) out.premises'],
  ['distinct captures are not counted', 'out.premises.distinctCaptures = parsedByKey.size', ''],
  ['the full-time score is not tallied per capture', '    bump(out.premises.fullTimeScoreVersusLastGoal.distinctCaptures, finalAgreement(p))\n', ''],
  ['an unreadable capture is examined for its goals', '    if (!p.ok) continue\n', ''],
  ['a capture lacking a score is not counted', '    if (p.withoutScore > 0) out.premises.distinctCapturesWithAGoalRowLackingAScore++\n', '    if (p.withoutScore > 0) out.premises.distinctCapturesWithAGoalRowLackingAScore += 0\n'],
  ['a capture lacking a score counts when it has none', '    if (p.withoutScore > 0) out.premises', '    if (p.withoutScore >= 0) out.premises'],
  ['a capture with a gap is not counted', '    else if (!p.sequential) out.premises.distinctCapturesWhoseTotalsAreNotOneToN++\n', ''],
  ['a capture with no score is also a gap', '    else if (!p.sequential) out.premises', '    if (!p.sequential) out.premises'],
  ['a sequential capture is a gap', '    else if (!p.sequential) out.premises', '    else if (p.sequential) out.premises'],
  ['ties are not counted per capture', '    if (p.twoInOneMinute) out.premises.distinctCapturesWithTwoGoalsInOneMinute++\n', ''],
  ['minutes out of order are not counted per capture', '    if (p.minuteOrderBroken) out.premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder++\n', ''],
  ['ties are counted as order', '    if (p.twoInOneMinute) out.premises.distinctCapturesWithTwoGoalsInOneMinute++\n', '    if (p.twoInOneMinute) out.premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder++\n'],
  // ---- the line
  ['the line has no denominator', '`graded ${grade.graded} of ${grade.population} gradeable calls', '`graded ${grade.graded} gradeable calls'],
  ['the line swaps graded and population', '`graded ${grade.graded} of ${grade.population} gradeable calls', '`graded ${grade.population} of ${grade.graded} gradeable calls'],
  ['the line states agree as disagree', 'agree ${grade.agree}, disagree ${grade.disagree}', 'agree ${grade.disagree}, disagree ${grade.agree}'],
  ['the line states not applicable as graded', 'not applicable ${grade.notApplicable.total}', 'not applicable ${grade.graded}'],
  ['the line omits the rule', ' | rule ${grade.ruleVersion}`', '`'],
  ['the line has the census numbers swapped', '(census: ${c.gradeable === undefined ? \'n/a\' : c.gradeable} gradeable of ${c.uniqueCalls === undefined ? \'n/a\' : c.uniqueCalls})', '(census: ${c.uniqueCalls === undefined ? \'n/a\' : c.uniqueCalls} gradeable of ${c.gradeable === undefined ? \'n/a\' : c.gradeable})'],
  ['a missing census prints undefined', "c.gradeable === undefined ? 'n/a' : c.gradeable", 'c.gradeable'],
  ['a missing census call count prints undefined', "c.uniqueCalls === undefined ? 'n/a' : c.uniqueCalls", 'c.uniqueCalls'],
  ['a missing census block throws', 'const c = isObj(census) ? census : {}', 'const c = census'],
  ['the exact count is the number graded', "grade.resolvedMinuteDistance['0'] === undefined ? 0 : grade.resolvedMinuteDistance['0'].graded", "grade.resolvedMinuteDistance['0'] === undefined ? 0 : grade.graded"],
  ['no goal at distance 0 throws', "grade.resolvedMinuteDistance['0'] === undefined ? 0 :", "false ? 0 :"],
  ['the exact count is the agreeing ones', "grade.resolvedMinuteDistance['0'].graded", "grade.resolvedMinuteDistance['0'].agree"],
  ['the distance-0 phrase is lost', ' | resolving goal at the ledger\'s resolved_minute for ${exact} of ${grade.graded} graded', ''],
  ['the rule version has no date', "export const RULE_VERSION = '2026-11-23.3'", "export const RULE_VERSION = 'v1'"],
  ['the rule changed and the version did not', "export const RULE_VERSION = '2026-11-23.3'", "export const RULE_VERSION = '2026-11-23.1'"],
  // ---- readGoals: extra time, the live row (added after the second review)
  ['extra time is never detected', "if (typeof r.text === 'string' && EXTENDED.test(r.text)) extended = true", ''],
  ['every period row is extra time', "if (typeof r.text === 'string' && EXTENDED.test(r.text)) extended = true", 'extended = true'],
  ['extra time ignores an ET row', 'const EXTENDED = /^(et|extra|pen)/i', 'const EXTENDED = /^(extra|pen)/i'],
  ['extra time ignores an Extra time row', 'const EXTENDED = /^(et|extra|pen)/i', 'const EXTENDED = /^(et|pen)/i'],
  ['extra time ignores a shootout row', 'const EXTENDED = /^(et|extra|pen)/i', 'const EXTENDED = /^(et|extra)/i'],
  ['extra time is case sensitive', 'const EXTENDED = /^(et|extra|pen)/i', 'const EXTENDED = /^(et|extra|pen)/'],
  ['extra time may begin anywhere in the text', 'const EXTENDED = /^(et|extra|pen)/i', 'const EXTENDED = /(et|extra|pen)/i'],
  ['the live row is not read', 'if (live === null && r.is_live === true) {', 'if (false) {'],
  ['a row with no is_live flag is the live row', 'if (live === null && r.is_live === true) {', 'if (live === null && r.is_live !== false) {'],
  ['the last live row wins', 'if (live === null && r.is_live === true) {', 'if (r.is_live === true) {'],
  ['half a live score is a score', 'if (lh !== null && la !== null) live', 'if (lh !== null || la !== null) live'],
  ['the live home score is the away score', 'const lh = num(r.home_score)\n        const la = num(r.away_score)', 'const lh = num(r.away_score)\n        const la = num(r.away_score)'],
  ['the live away score is the home score', 'const lh = num(r.home_score)\n        const la = num(r.away_score)', 'const lh = num(r.home_score)\n        const la = num(r.home_score)'],
  ['a live row that is not live is read', "if (live === null && r.is_live === true) {\n        const lh", "if (live === null) {\n        const lh"],
  ['readGoals does not return the live row', 'return { ok: true, goals, withoutScore, sequential, final, live, extended, twoInOneMinute, minuteOrderBroken }', 'return { ok: true, goals, withoutScore, sequential, final, live: null, extended, twoInOneMinute, minuteOrderBroken }'],
  ['readGoals does not return extra time', 'return { ok: true, goals, withoutScore, sequential, final, live, extended, twoInOneMinute, minuteOrderBroken }', 'return { ok: true, goals, withoutScore, sequential, final, live, extended: false, twoInOneMinute, minuteOrderBroken }'],
  // ---- gradeCalls: the stoppage tally and the live-row tally
  ['stoppage goals are not counted', '      out.stoppageResolvingGoals.graded++\n', ''],
  ['stoppage agreement is not split', "out.stoppageResolvingGoals[r.agree ? 'agree' : 'disagree']++", 'out.stoppageResolvingGoals.agree++'],
  ['every graded call is a stoppage goal', '    if (r.stoppage) {\n      out.stoppageResolvingGoals', '    if (true) {\n      out.stoppageResolvingGoals'],
  ['no graded call is a stoppage goal', '    if (r.stoppage) {\n      out.stoppageResolvingGoals', '    if (false) {\n      out.stoppageResolvingGoals'],
  ['the live-row score is not tallied per call', '    bump(out.premises.liveRowScoreVersusLastGoal.calls, liveAgreement(parsed))\n', ''],
  ['the live-row score is not tallied per capture', '    bump(out.premises.liveRowScoreVersusLastGoal.distinctCaptures, liveAgreement(p))\n', ''],
  ['the live-row tally uses the full-time answer for calls', 'bump(out.premises.liveRowScoreVersusLastGoal.calls, liveAgreement(parsed))', 'bump(out.premises.liveRowScoreVersusLastGoal.calls, finalAgreement(parsed))'],
  ['the live-row tally uses the full-time answer for captures', 'bump(out.premises.liveRowScoreVersusLastGoal.distinctCaptures, liveAgreement(p))', 'bump(out.premises.liveRowScoreVersusLastGoal.distinctCaptures, finalAgreement(p))'],
  ['the full-time tally uses the live answer for calls', 'bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))', 'bump(out.premises.fullTimeScoreVersusLastGoal.calls, liveAgreement(parsed))'],
  ['the full-time tally uses the live answer for captures', 'bump(out.premises.fullTimeScoreVersusLastGoal.distinctCaptures, finalAgreement(p))', 'bump(out.premises.fullTimeScoreVersusLastGoal.distinctCaptures, liveAgreement(p))'],
  ['the live-row tally has a prototype', 'liveRowScoreVersusLastGoal: { calls: tally(), distinctCaptures: tally() },', 'liveRowScoreVersusLastGoal: { calls: {}, distinctCaptures: tally() },'],
  ['the stoppage tally is not in the output', '    stoppageResolvingGoals: { graded: 0, agree: 0, disagree: 0 },\n', ''],
  // ---- the source may not reach out (each is asserted of the source text)
  ['the source imports something', 'export const RULE_VERSION', "import os from 'node:os'\nexport const RULE_VERSION"],
  ['the source reads the environment', 'const isObj = (v) =>', 'const _env = typeof process\nconst isObj = (v) =>'],
  ['the source calls the network', 'const isObj = (v) =>', 'const _net = typeof fetch\nconst isObj = (v) =>'],
  ['the source reads the clock', 'const isObj = (v) =>', 'const _clock = typeof Date\nconst isObj = (v) =>'],
  ['the source is random', 'const isObj = (v) =>', 'const _rnd = typeof Math.random\nconst isObj = (v) =>'],
]

// the second-round reviewers' mutants (see the file), each caught by the check
const SOURCE_MUTATIONS = [...OWN_MUTATIONS, ...R2_MUTATIONS.map(([name, a, b]) => [`reviewer: ${name}`, a, b])]

// The check's own purity list, one broken grader per pattern: a source holding exactly that token must turn the real check red,
// and the check with that one pattern removed must stay green on it. `import` cannot be a bare identifier, so it is a statement.
const FORBIDDEN = [
  ['import', "import os from 'node:os'", '/\\bimport\\b/, '],
  ['require', 'typeof require', '/\\brequire\\b/, '],
  ['fetch', 'typeof fetch', '/\\bfetch\\b/, '],
  ['process', 'typeof process', '/\\bprocess\\b/, '],
  ['globalThis', 'typeof globalThis', '/\\bglobalThis\\b/, '],
  ['eval', 'typeof eval', '/\\beval\\b/, '],
  ['Function', 'typeof Function', '/\\bFunction\\b/, '],
  ['XMLHttpRequest', 'typeof XMLHttpRequest', '/\\bXMLHttpRequest\\b/, '],
  ['WebSocket', 'typeof WebSocket', '/\\bWebSocket\\b/, '],
  ['Deno', 'typeof Deno', '/\\bDeno\\b/, '],
  ['Bun', 'typeof Bun', '/\\bBun\\b/, '],
  ['Buffer', 'typeof Buffer', '/\\bBuffer\\b/, '],
  ['fs', 'typeof fs', '/\\bfs\\b/, '],
  ['child_process', 'typeof child_process', '/\\bchild_process\\b/, '],
  ['Date', 'typeof Date', '/\\bDate\\b/, '],
  ['Math.random', 'typeof Math.random', '/\\bMath\\.random\\b/, '],
  ['setTimeout', 'typeof setTimeout', ', /\\bsetTimeout\\b/'],
]

const BROKEN_FOR_ANALYSIS = ["const verdict = fieldSide === side ? 'hit' : 'miss'", "const verdict = fieldSide === side ? 'miss' : 'hit'"]
const BROKEN_EXITS_AT_IMPORT = ['const isObj = (v) =>', 'process.exit(0)\nconst isObj = (v) =>']

const CHECK_MUTATIONS = [
  ['blind', 'eq never fails', 'if (stable(got) !== stable(want)) {', 'if (false) {', BROKEN_FOR_ANALYSIS],
  ['blind', 'the exit code ignores failures', 'finished = true\nprocess.exit(failed === 0 ? 0 : 1)', 'finished = true\nprocess.exit(0)', BROKEN_FOR_ANALYSIS],
  ['blind', 'an early exit is not noticed', "process.on('exit', (code) => {", "process.on('never', (code) => {", BROKEN_EXITS_AT_IMPORT],
  ['red', 'MIN_SCENARIOS is one above the real count', 'const MIN_SCENARIOS = 22', 'const MIN_SCENARIOS = 23'],
  ['red', 'MIN_ASSERTIONS is one above the real count', 'const MIN_ASSERTIONS = 200', 'const MIN_ASSERTIONS = 201'],
  ['red', 'the finished capture pin is wrong', "'cf327cb385aa3c18ef473d607b3c371fb047307f3f9f274bf50a48ad3ad59922'", "'0000000000000000000000000000000000000000000000000000000000000000'"],
  ['red', 'the in-play capture pin is wrong', "'c4a96597e2925eb52cfa3434d6688ac3a667f8f049e04cbc356e607e3c352eb0'", "'0000000000000000000000000000000000000000000000000000000000000000'"],
  ['red', 'the rule version pin is wrong', "RULE_VERSION, '2026-11-23.3'", "RULE_VERSION, '2026-11-23.4'"],
  ['red', 'the comment stripper is removed (the real source has forbidden words in its comments)', ".replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|[^:])\\/\\/.*$/gm, '$1')", ''],
]

const applyEdits = (text, edits, label) => {
  let out = text
  for (const [anchor, replacement] of edits) {
    const n = out.split(anchor).length - 1
    if (n !== 1) return { error: `NOT APPLIED: anchor matched ${n} times, not 1 (${label}): ${JSON.stringify(anchor.slice(0, 70))}` }
    if (anchor === replacement) return { error: `NOT APPLIED: replacement equals anchor (${label})` }
    out = out.replace(anchor, () => replacement)
  }
  return { text: out }
}
const exec = (checkFile, srcFile) => new Promise((resolve) => {
  const c = spawn(process.execPath, [checkFile, '--source', srcFile])
  let stdout = ''
  c.stdout.on('data', (d) => { stdout += d })
  c.stderr.on('data', () => {})
  const timer = setTimeout(() => c.kill('SIGKILL'), 120000)
  c.on('close', (status, signal) => { clearTimeout(timer); resolve({ status, signal, stdout }) })
})
const red = (r) => r.status === 1 && /^FAIL/m.test(r.stdout)
const parses = (file) => spawnSync(process.execPath, ['--check', file]).status === 0
async function pool (items, n, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i) } }))
  return results
}

const srcText = fs.readFileSync(SRC, 'utf8')
let caught = 0
let notCaught = 0
let notApplied = 0

const b1 = await exec(CHECK, SRC)
console.log(`baseline: the check on the real grader exits ${b1.status}`)
if (b1.status !== 0) { console.log('FAIL  the check is already red; every mutation would be "caught" for the wrong reason'); process.exit(1) }

console.log(`\nHALF 1: the grader, broken (${SOURCE_MUTATIONS.length} mutations)`)
const lines = []
await pool(SOURCE_MUTATIONS, 4, async ([name, a, b], i) => {
  const r = applyEdits(srcText, Array.isArray(a) ? a : [[a, b]], name)
  if (r.error) { notApplied++; lines[i] = `  ${r.error}  [${name}]`; return }
  const f = path.join(tmp, `core-${i}.mjs`)
  fs.writeFileSync(f, r.text)
  if (!parses(f)) { notApplied++; lines[i] = `  NOT APPLIED: the mutant does not parse  [${name}]`; return }
  const x = await exec(CHECK, f)
  if (red(x)) { caught++; lines[i] = `  caught       ${name}` } else { notCaught++; lines[i] = `  NOT CAUGHT   ${name}  (exit ${x.status})` }
})
console.log(lines.join('\n'))

console.log('\nHALF 2: the check, broken')
const brokenFiles = new Map()
const brokenFile = (spec) => {
  const k = spec[0] + '\u0000' + spec[1]
  if (!brokenFiles.has(k)) {
    const r = applyEdits(srcText, [spec], 'broken grader')
    if (r.error) { console.log(`  ${r.error}`); process.exit(1) }
    const f = path.join(tmp, `broken-${brokenFiles.size}.mjs`)
    fs.writeFileSync(f, r.text)
    brokenFiles.set(k, f)
  }
  return brokenFiles.get(k)
}
const checkText = fs.readFileSync(CHECK, 'utf8')
const half2 = []
const purity = FORBIDDEN.map(([token, snippet, pattern]) => ['blind', `the purity list loses ${token}`, pattern, '', ['const isObj = (v) =>', `${snippet}\nconst isObj = (v) =>`]])
await pool([...CHECK_MUTATIONS, ...purity], 3, async ([kind, name, a, b, broken], i) => {
  const r = applyEdits(checkText, [[a, b]], name)
  if (r.error) { notApplied++; half2[i] = `  ${r.error}  [${name}]`; return }
  const f = path.join(tmp, `check-${i}.mjs`)
  fs.writeFileSync(f, r.text)
  if (!parses(f)) { notApplied++; half2[i] = `  NOT APPLIED: the mutant does not parse  [${name}]`; return }
  let ok
  let shown
  if (kind === 'blind') {
    const real = await exec(CHECK, brokenFile(broken))
    const mutated = await exec(f, brokenFile(broken))
    ok = red(real) && mutated.status === 0 && !red(mutated)
    shown = `real check exit ${real.status}, mutated check exit ${mutated.status} on the broken grader`
  } else {
    const mutated = await exec(f, SRC)
    ok = red(mutated)
    shown = `mutated check exit ${mutated.status} on the real grader`
  }
  if (ok) { caught++; half2[i] = `  caught       ${name}  (${kind}: ${shown})` } else { notCaught++; half2[i] = `  NOT CAUGHT   ${name}  (${kind}: ${shown})` }
})
console.log(half2.join('\n'))

const moved = REAL.filter((f) => sha(f) !== before[f])
fs.rmSync(tmp, { recursive: true, force: true })
const total = SOURCE_MUTATIONS.length + CHECK_MUTATIONS.length + purity.length
console.log(`\nmutations ${total}: caught ${caught}, NOT CAUGHT ${notCaught}, NOT APPLIED ${notApplied}; real files moved: ${moved.length}`)
if (moved.length) console.log(`FAIL  the real file(s) changed: ${moved.join(', ')}`)
process.exit(notCaught === 0 && notApplied === 0 && moved.length === 0 ? 0 : 1)
