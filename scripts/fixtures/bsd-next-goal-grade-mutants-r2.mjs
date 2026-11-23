// Mutants of scripts/bsd-next-goal-grade-core.mjs written by the second-round reviewers (2026-11-23), kept because each one was found to
// change an output on an input the check had not built, and each is now caught by the check. [name, anchor, replacement] or
// [name, [[anchor, replacement], ...]]; the harness requires each anchor to occur exactly once. Of the reviewers' 203, the ones that
// the revised core no longer contains (the code changed), that do not parse, or that are equivalent (a sort tie that cannot occur
// because totals are unique, a clause that repeats a neighbour, a regex flag on a class that holds both cases, a fraction threshold
// for a minute that is always whole) are left out, and the equivalent ones are listed in scripts/mutate-bsd-next-goal-grade-core.mjs.
// Importing this file runs nothing.
export default [
 [
  "num accepts NaN and Infinity",
  "typeof v === 'number' && Number.isFinite(v) ? v : null",
  "typeof v === 'number' ? v : null"
 ],
 [
  "num accepts numeric text",
  "typeof v === 'number' && Number.isFinite(v) ? v : null",
  "typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)"
 ],
 [
  "num accepts any non-null",
  "const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)",
  "const num = (v) => (v === undefined ? null : v)"
 ],
 [
  "count accepts 2**53 and up",
  "Number.isInteger(v) && v >= 0 ? v : null",
  "Number.isSafeInteger(v) && v >= 0 ? v : null"
 ],
 [
  "goal type allows a dot",
  "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/",
  "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_.-]{0,23}$/"
 ],
 [
  "goal type regex is multiline",
  "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/",
  "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/m"
 ],
 [
  "goal type may start with underscore",
  "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/",
  "const GOAL_TYPE = /^[A-Za-z_][A-Za-z0-9_-]{0,23}$/"
 ],
 [
  "goal type allows non-ASCII letters",
  "const GOAL_TYPE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/",
  "const GOAL_TYPE = /^\\p{L}[\\p{L}0-9_-]{0,23}$/u"
 ],
 [
  "goal type is case-folded",
  "? r.goal_type : typeof r.goal_type === 'string' ? '(other)' : '(none)'",
  "? r.goal_type.toLowerCase() : typeof r.goal_type === 'string' ? '(other)' : '(none)'"
 ],
 [
  "goal type is never none",
  "typeof r.goal_type === 'string' ? '(other)' : '(none)',",
  "'(other)',"
 ],
 [
  "full-time regex has a word boundary",
  "const FULL_TIME = /^(ft|aet|ap|pen)/i",
  "const FULL_TIME = /^(ft|aet|ap|pen)\\b/i"
 ],
 [
  "full-time regex is exact",
  "const FULL_TIME = /^(ft|aet|ap|pen)/i",
  "const FULL_TIME = /^(ft|aet|ap|pen)$/i"
 ],
 [
  "full-time regex gains ET",
  "const FULL_TIME = /^(ft|aet|ap|pen)/i",
  "const FULL_TIME = /^(ft|aet|et|ap|pen)/i"
 ],
 [
  "full-time regex gains Full",
  "const FULL_TIME = /^(ft|aet|ap|pen)/i",
  "const FULL_TIME = /^(ft|aet|ap|pen|full)/i"
 ],
 [
  "full-time regex loses PEN but gains P",
  "const FULL_TIME = /^(ft|aet|ap|pen)/i",
  "const FULL_TIME = /^(ft|aet|ap|p)/i"
 ],
 [
  "incidents may be any iterable text",
  "Array.isArray(json.incidents) ? json.incidents : null",
  "json.incidents && typeof json.incidents.length === \"number\" ? Array.from(json.incidents) : null"
 ],
 [
  "final text need not be a string",
  "r.is_live === false && typeof r.text === 'string' && FULL_TIME.test(r.text)",
  "r.is_live === false && FULL_TIME.test(r.text)"
 ],
 [
  "is_live absent counts as not live",
  "r.is_live === false && typeof r.text",
  "r.is_live !== true && typeof r.text"
 ],
 [
  "is_live falsy counts as not live",
  "r.is_live === false && typeof r.text",
  "!r.is_live && typeof r.text"
 ],
 [
  "full-time scores need not be numbers",
  "const h = num(r.home_score)\n        const a = num(r.away_score)\n        if (h",
  "const h = r.home_score ?? null\n        const a = r.away_score ?? null\n        if (h"
 ],
 [
  "full-time row keeps its text",
  "final = { home: h, away: a }",
  "final = { home: h, away: a, text: r.text }"
 ],
 [
  "a full-time row ends the scan",
  "      continue\n    }\n    if (r.type !== 'goal') continue",
  "      if (final !== null) break\n      continue\n    }\n    if (r.type !== 'goal') continue"
 ],
 [
  "goal rows are found by goal_type",
  "if (r.type !== 'goal') continue",
  "if (r.type !== 'goal' && typeof r.goal_type !== 'string') continue"
 ],
 [
  "goal rows include var rows",
  "if (r.type !== 'goal') continue",
  "if (r.type !== 'goal' && r.type !== 'varDecision') continue"
 ],
 [
  "goal rows include card rows",
  "if (r.type !== 'goal') continue",
  "if (r.type !== 'goal' && r.type !== 'card') continue"
 ],
 [
  "goal rows with is_home but no type are goals",
  "if (r.type !== 'goal') continue",
  "if (r.type !== 'goal' && typeof r.is_home !== 'boolean') continue"
 ],
 [
  "a null minute becomes zero",
  "minute: num(r.minute),",
  "minute: num(r.minute) ?? 0,"
 ],
 [
  "a null added_time becomes zero",
  "added: num(r.added_time),",
  "added: num(r.added_time) ?? 0,"
 ],
 [
  "the goal rows keep the player",
  "isHome: typeof r.is_home === 'boolean' ? r.is_home : null,",
  "isHome: typeof r.is_home === 'boolean' ? r.is_home : null,\n      player: r.player,"
 ],
 [
  "running scores must be integers",
  "const home = num(r.home_score)\n    const away = num(r.away_score)\n    if (home === null || away === null) {",
  "const home = Number.isInteger(r.home_score) ? r.home_score : null\n    const away = Number.isInteger(r.away_score) ? r.away_score : null\n    if (home === null || away === null) {"
 ],
 [
  "running scores must be non-negative",
  "const home = num(r.home_score)\n    const away = num(r.away_score)\n    if (home === null || away === null) {",
  "const home = num(r.home_score) >= 0 ? num(r.home_score) : null\n    const away = num(r.away_score) >= 0 ? num(r.away_score) : null\n    if (home === null || away === null) {"
 ],
 [
  "sequential rounds the total",
  "g.total === i + 1",
  "Math.round(g.total) === i + 1"
 ],
 [
  "sequential tolerates a unit",
  "g.total === i + 1",
  "Math.abs(g.total - (i + 1)) <= 0.5"
 ],
 [
  "sequential is only checked for the first goal",
  "goals.every((g, i) => g.total === i + 1)",
  "goals.every((g, i) => i > 0 || g.total === 1)"
 ],
 [
  "sequential is only checked for the last goal",
  "goals.every((g, i) => g.total === i + 1)",
  "goals.every((g, i) => i < goals.length - 1 || g.total === goals.length)"
 ],
 [
  "sequential is only checked on even positions",
  "goals.every((g, i) => g.total === i + 1)",
  "goals.every((g, i) => i % 2 === 1 || g.total === i + 1)"
 ],
 [
  "sequential is some, not every",
  "goals.every((g, i) => g.total === i + 1)",
  "goals.some((g, i) => g.total === i + 1)"
 ],
 [
  "sequential needs at least one goal",
  "withoutScore === 0 && goals.every(",
  "withoutScore === 0 && goals.length > 0 && goals.every("
 ],
 [
  "withoutScore is a boolean",
  "return { ok: true, goals, withoutScore, sequential",
  "return { ok: true, goals, withoutScore: withoutScore > 0, sequential"
 ],
 [
  "a tie is only seen between neighbours",
  "const seen = new Set()",
  "const seen = { has: (m) => m === latest, add: () => {} }"
 ],
 [
  "a null minute resets the order",
  "if (g.minute === null) continue",
  "if (g.minute === null) { latest = null; continue }"
 ],
 [
  "a null minute clears the ties",
  "if (g.minute === null) continue",
  "if (g.minute === null) { seen.clear(); continue }"
 ],
 [
  "diagnostics are skipped for an untrusted capture",
  "let twoInOneMinute = false",
  "let twoInOneMinute = false\n  if (!sequential) return { ok: true, goals, withoutScore, sequential, final, twoInOneMinute: false, minuteOrderBroken: false }"
 ],
 [
  "no goals matches any full-time score",
  "parsed.goals.length === 0 ? { home: 0, away: 0 } :",
  "parsed.goals.length === 0 ? parsed.final :"
 ],
 [
  "no goals compares only the home score",
  "parsed.goals.length === 0 ? { home: 0, away: 0 } :",
  "parsed.goals.length === 0 ? { home: 0, away: parsed.final.away } :"
 ],
 [
  "no goals compares only the away score",
  "parsed.goals.length === 0 ? { home: 0, away: 0 } :",
  "parsed.goals.length === 0 ? { home: parsed.final.home, away: 0 } :"
 ],
 [
  "the last goal is the largest minute",
  "parsed.goals[parsed.goals.length - 1]",
  "[...parsed.goals].sort((x, y) => (x.minute ?? 0) - (y.minute ?? 0))[parsed.goals.length - 1]"
 ],
 [
  "the last goal is the second to last",
  "parsed.goals[parsed.goals.length - 1]",
  "parsed.goals[Math.max(0, parsed.goals.length - 2)]"
 ],
 [
  "a trusted capture with no full-time row is evaluated against 0-0",
  "if (parsed.final === null) return 'no full-time score'",
  "if (parsed.final === null) return parsed.goals.length === 0 ? 'matches' : 'no full-time score'"
 ],
 [
  "side is case-insensitive",
  "const side = isObj(call) ? call.side : undefined",
  "const side = isObj(call) && typeof call.side === 'string' ? call.side.toLowerCase() : undefined"
 ],
 [
  "side is trimmed",
  "const side = isObj(call) ? call.side : undefined",
  "const side = isObj(call) && typeof call.side === 'string' ? call.side.trim() : undefined"
 ],
 [
  "outcome is case-insensitive",
  "if (call.outcome !== 'hit' && call.outcome !== 'miss') return",
  "if (String(call.outcome).toLowerCase() !== 'hit' && String(call.outcome).toLowerCase() !== 'miss') return"
 ],
 [
  "the outcome check precedes the side check",
  "const side = isObj(call) ? call.side : undefined\n",
  "const side = isObj(call) ? call.side : undefined\n  if (isObj(call) && call.outcome !== 'hit' && call.outcome !== 'miss') return { graded: false, reason: REASONS.outcome }\n"
 ],
 [
  "the score check is skipped when the side is away",
  "if (a === null || b === null) return",
  "if ((a === null || b === null) && side === 'home') return"
 ],
 [
  "the capture check precedes the score check",
  "const sc = call.score_at_call\n",
  "if (!parsed || !parsed.ok) return { graded: false, reason: REASONS.unreadable }\n  const sc = call.score_at_call\n"
 ],
 [
  "the capture check follows the sequence check",
  "if (!parsed || !parsed.ok) return { graded: false, reason: REASONS.unreadable }\n",
  ""
 ],
 [
  "the not-trusted checks are swapped",
  "if (parsed.withoutScore > 0) return { graded: false, reason: REASONS.noScore }\n  if (!parsed.sequential) return { graded: false, reason: REASONS.sequence }",
  "if (!parsed.sequential) return { graded: false, reason: REASONS.sequence }\n  if (parsed.withoutScore > 0) return { graded: false, reason: REASONS.noScore }"
 ],
 [
  "the none and join checks are swapped",
  "if (resolving === undefined) return { graded: false, reason: REASONS.none }\n  const prev = k === 0 ? { home: 0, away: 0 } : parsed.goals[k - 1]\n  if (prev.home !== a || prev.away !== b) return { graded: false, reason: REASONS.join }",
  "const prev = k === 0 ? { home: 0, away: 0 } : parsed.goals[k - 1]\n  if (prev && (prev.home !== a || prev.away !== b)) return { graded: false, reason: REASONS.join }\n  if (resolving === undefined) return { graded: false, reason: REASONS.none }"
 ],
 [
  "a join check against the total only",
  "if (prev.home !== a || prev.away !== b) return",
  "if (prev.home + prev.away !== a + b) return"
 ],
 [
  "the rise is any positive move on one side",
  "if (dh === 1 && da === 0) fieldSide = 'home'\n  else if (dh === 0 && da === 1) fieldSide = 'away'",
  "if (dh > 0 && da <= 0) fieldSide = 'home'\n  else if (da > 0 && dh <= 0) fieldSide = 'away'"
 ],
 [
  "the rise is a net rise",
  "if (dh === 1 && da === 0) fieldSide = 'home'\n  else if (dh === 0 && da === 1) fieldSide = 'away'",
  "if (dh > da) fieldSide = 'home'\n  else if (da > dh) fieldSide = 'away'"
 ],
 [
  "the rise is by the is_home flag",
  "if (dh === 1 && da === 0) fieldSide = 'home'\n  else if (dh === 0 && da === 1) fieldSide = 'away'",
  "if (dh === 1 && da === 0) fieldSide = 'home'\n  else if (dh === 0 && da === 1) fieldSide = 'away'\n  if (fieldSide !== null && resolving.isHome !== null) fieldSide = resolving.isHome ? 'home' : 'away'"
 ],
 [
  "agree is checked against the verdict string only for hit",
  "agree: verdict === call.outcome,",
  "agree: verdict === 'hit' ? call.outcome === 'hit' : true,"
 ],
 [
  "agree is checked against the verdict only for miss",
  "agree: verdict === call.outcome,",
  "agree: verdict === 'miss' ? call.outcome === 'miss' : true,"
 ],
 [
  "the resolved minute is read from minute",
  "const rm = num(call.resolved_minute)",
  "const rm = num(call.minute)"
 ],
 [
  "the goal minute is the nominal minute plus added",
  "distance: rm === null || resolving.minute === null ? null : Math.abs(resolving.minute - rm),",
  "distance: rm === null || resolving.minute === null ? null : Math.abs(resolving.minute + (resolving.added ?? 0) - rm),"
 ],
 [
  "the distance is rounded",
  "Math.abs(resolving.minute - rm)",
  "Math.round(Math.abs(resolving.minute - rm))"
 ],
 [
  "stoppage needs a nominal minute of 45 or 90",
  "stoppage: resolving.added !== null && resolving.added > 0,",
  "stoppage: resolving.added !== null && resolving.added > 0 && (resolving.minute === 45 || resolving.minute === 90),"
 ],
 [
  "stoppage needs a nominal minute of 45 90 105 or 120",
  "stoppage: resolving.added !== null && resolving.added > 0,",
  "stoppage: resolving.added !== null && resolving.added > 0 && resolving.minute !== null && resolving.minute % 15 === 0,"
 ],
 [
  "stoppage is any non-null added time",
  "stoppage: resolving.added !== null && resolving.added > 0,",
  "stoppage: resolving.added !== null,"
 ],
 [
  "the bucket rounds fractions",
  ": String(d))",
  ": String(Math.round(d)))"
 ],
 [
  "the bucket has a 10+ cell",
  "d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : String(d)",
  "d >= 10 ? '10+' : d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : String(d)"
 ],
 [
  "a stoppage far goal is a stoppage even when near",
  "d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : String(d)",
  "d >= 3 ? (stoppage ? '3+ stoppage' : '3+') : stoppage ? 'near stoppage' : String(d)"
 ],
 [
  "keys are stringified",
  "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture",
  "typeof it.key === 'string' || typeof it.key === 'number' ? String(it.key) : it.capture"
 ],
 [
  "a boolean key is a key",
  "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture",
  "typeof it.key === 'string' || typeof it.key === 'number' || typeof it.key === 'boolean' ? it.key : it.capture"
 ],
 [
  "an empty key is no key",
  "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture",
  "(typeof it.key === 'string' && it.key !== '') || typeof it.key === 'number' ? it.key : it.capture"
 ],
 [
  "a key is looked up by the capture first",
  "const keyOf = (it) => (typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture)",
  "const keyOf = (it) => (isObj(it.capture) ? it.capture : (typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture))"
 ],
 [
  "the parse is cached by call",
  "const k = keyOf(it)\n    if (!parsedByKey.has(k))",
  "const k = it.call\n    if (!parsedByKey.has(k))"
 ],
 [
  "byTag top-level has a prototype",
  "byTag: tally(),",
  "byTag: {},"
 ],
 [
  "byTagAndReason top-level has a prototype",
  "byTagAndReason: tally() }",
  "byTagAndReason: {} }"
 ],
 [
  "byTagAndReason per tag name has a prototype",
  "out.notApplicable.byTagAndReason[name] = tally()",
  "out.notApplicable.byTagAndReason[name] = {}"
 ],
 [
  "byTagAndReason per tag value has a prototype",
  "out.notApplicable.byTagAndReason[name][t] = tally()",
  "out.notApplicable.byTagAndReason[name][t] = {}"
 ],
 [
  "byTag per tag name has a prototype",
  "out.byTag[name] = tally()",
  "out.byTag[name] = {}"
 ],
 [
  "byReason has a prototype",
  "notApplicable: { total: 0, byReason: tally(),",
  "notApplicable: { total: 0, byReason: {},"
 ],
 [
  "confusion has a prototype",
  "confusion: tally(),",
  "confusion: {},"
 ],
 [
  "byLedgerOutcome has a prototype",
  "byLedgerOutcome: tally(),",
  "byLedgerOutcome: {},"
 ],
 [
  "resolvingGoalType has a prototype",
  "resolvingGoalType: tally(),",
  "resolvingGoalType: {},"
 ],
 [
  "resolvedMinuteDistance has a prototype",
  "resolvedMinuteDistance: tally(),",
  "resolvedMinuteDistance: {},"
 ],
 [
  "fullTime calls has a prototype",
  "fullTimeScoreVersusLastGoal: { calls: tally(), distinctCaptures: tally() }",
  "fullTimeScoreVersusLastGoal: { calls: {}, distinctCaptures: tally() }"
 ],
 [
  "fullTime captures has a prototype",
  "fullTimeScoreVersusLastGoal: { calls: tally(), distinctCaptures: tally() }",
  "fullTimeScoreVersusLastGoal: { calls: tally(), distinctCaptures: {} }"
 ],
 [
  "tag value is lower-cased",
  "const t = String(value)\n",
  "const t = String(value).toLowerCase()\n"
 ],
 [
  "tag value is truncated to 8 characters",
  "const t = String(value)\n",
  "const t = String(value).slice(0, 8)\n"
 ],
 [
  "byTag cell has a notApplicable on graded",
  "{ graded: 0, agree: 0, disagree: 0, notApplicable: 0 }",
  "{ graded: 0, agree: 0, disagree: 0, notApplicable: 0, total: 0 }"
 ],
 [
  "the full-time premise is only per graded call",
  "    bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))\n",
  "    if (r.graded) bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))\n"
 ],
 [
  "the full-time premise is only per not-applicable call",
  "    bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))\n",
  "    if (!r.graded) bump(out.premises.fullTimeScoreVersusLastGoal.calls, finalAgreement(parsed))\n"
 ],
 [
  "the side-or-score premise includes the outcome",
  "if (r.reason === REASONS.side || r.reason === REASONS.score) out.premises",
  "if (r.reason === REASONS.side || r.reason === REASONS.score || r.reason === REASONS.outcome) out.premises"
 ],
 [
  "the join premise includes none",
  "if (r.reason === REASONS.join) out.premises",
  "if (r.reason === REASONS.join || r.reason === REASONS.none) out.premises"
 ],
 [
  "the sequence premise includes the rise",
  "if (r.reason === REASONS.sequence) out.premises",
  "if (r.reason === REASONS.sequence || r.reason === REASONS.rise) out.premises"
 ],
 [
  "the no-score premise includes unreadable",
  "if (r.reason === REASONS.noScore) out.premises",
  "if (r.reason === REASONS.noScore || r.reason === REASONS.unreadable) out.premises"
 ],
 [
  "distinct captures counts the items instead",
  "out.premises.distinctCaptures = parsedByKey.size",
  "out.premises.distinctCaptures = list.length"
 ],
 [
  "distinct captures counts only the readable",
  "out.premises.distinctCaptures = parsedByKey.size",
  "out.premises.distinctCaptures = [...parsedByKey.values()].filter((p) => p.ok).length"
 ],
 [
  "distinct captures counts only the trusted",
  "out.premises.distinctCaptures = parsedByKey.size",
  "out.premises.distinctCaptures = [...parsedByKey.values()].filter((p) => p.ok && p.sequential).length"
 ],
 [
  "the capture diagnostics skip an untrusted capture",
  "    if (p.twoInOneMinute) out.premises.distinctCapturesWithTwoGoalsInOneMinute++",
  "    if (p.sequential && p.twoInOneMinute) out.premises.distinctCapturesWithTwoGoalsInOneMinute++"
 ],
 [
  "the order diagnostic skips an untrusted capture",
  "    if (p.minuteOrderBroken) out.premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder++",
  "    if (p.sequential && p.minuteOrderBroken) out.premises.distinctCapturesWhoseMinuteOrderIsNotTotalOrder++"
 ],
 [
  "the gap counter counts an untrusted capture that lacks a score as a gap too",
  "    if (p.withoutScore > 0) out.premises.distinctCapturesWithAGoalRowLackingAScore++\n    else if (!p.sequential)",
  "    if (p.withoutScore > 0) out.premises.distinctCapturesWithAGoalRowLackingAScore++\n    if (!p.sequential)"
 ],
 [
  "the item reason text is changed",
  "item: 'the item is not an object',",
  "item: 'the item is not usable',"
 ],
 [
  "the side reason text is changed",
  "side: 'the ledger row has no home or away side',",
  "side: 'the ledger row has no side',"
 ],
 [
  "the score reason text is changed",
  "score: 'the ledger row has no whole-number score_at_call',",
  "score: 'bad score',"
 ],
 [
  "the outcome reason text is changed",
  "outcome: 'the outcome is not hit or miss',",
  "outcome: 'the outcome is open',"
 ],
 [
  "the unreadable reason text is changed",
  "unreadable: 'the capture has no incidents array',",
  "unreadable: 'unreadable',"
 ],
 [
  "the noScore reason text is changed",
  "noScore: 'a goal row in the capture has no running score',",
  "noScore: 'a goal has no score',"
 ],
 [
  "the sequence reason text is changed",
  "sequence: 'the capture goal rows are not running totals 1 to n',",
  "sequence: 'the capture is out of order',"
 ],
 [
  "the none reason text is changed",
  "none: 'the capture holds no goal after the score at the call',",
  "none: 'no next goal',"
 ],
 [
  "the join reason text is changed",
  "join: 'score_at_call does not match the capture score before that goal',",
  "join: 'join',"
 ],
 [
  "the rise reason text is changed",
  "rise: 'the running score did not rise by one on one side',",
  "rise: 'bad rise',"
 ],
 [
  "the item and unreadable reasons collide",
  "item: 'the item is not an object',",
  "item: 'the capture has no incidents array',"
 ],
 [
  "the join and rise reasons collide",
  "rise: 'the running score did not rise by one on one side',",
  "rise: 'score_at_call does not match the capture score before that goal',"
 ],
 [
  "the none and join reasons collide",
  "none: 'the capture holds no goal after the score at the call',",
  "none: 'score_at_call does not match the capture score before that goal',"
 ],
 [
  "join compares crosswise",
  "if (prev.home !== a || prev.away !== b) return",
  "if (prev.home !== b || prev.away !== a) return"
 ],
 [
  "dh is reversed",
  "const dh = resolving.home - prev.home",
  "const dh = prev.home - resolving.home"
 ],
 [
  "da is reversed",
  "const da = resolving.away - prev.away",
  "const da = prev.away - resolving.away"
 ],
 [
  "da reads the home score",
  "const da = resolving.away - prev.away",
  "const da = resolving.away - prev.home"
 ],
 [
  "dh reads the away score",
  "const dh = resolving.home - prev.home",
  "const dh = resolving.home - prev.away"
 ],
 [
  "the resolving goal is k plus zero but prev is k-2",
  "parsed.goals[k - 1]",
  "parsed.goals[k - 2]"
 ],
 [
  "sequential starts at 2",
  "g.total === i + 1",
  "g.total === i + 2"
 ],
 [
  "a capture with more than 15 goals is untrusted",
  "const sequential = withoutScore === 0 && goals.every(",
  "const sequential = withoutScore === 0 && goals.length <= 15 && goals.every("
 ],
 [
  "a capture with more than 40 goals is untrusted",
  "const sequential = withoutScore === 0 && goals.every(",
  "const sequential = withoutScore === 0 && goals.length <= 40 && goals.every("
 ],
 [
  "a capture with more than 5000 incident rows is unreadable",
  "const rows = isObj(json) && Array.isArray(json.incidents) ? json.incidents : null",
  "const rows = isObj(json) && Array.isArray(json.incidents) && json.incidents.length < 5000 ? json.incidents : null"
 ],
 [
  "a score of 100 is not a score",
  "Number.isInteger(v) && v >= 0 ? v : null",
  "Number.isInteger(v) && v >= 0 && v < 1000 ? v : null"
 ],
 [
  "a score_at_call of 20 or more total has no goal",
  "const resolving = parsed.goals[k]",
  "const resolving = k > 30 ? undefined : parsed.goals[k]"
 ],
 [
  "keys longer than 64 characters are not keys",
  "typeof it.key === 'string' || typeof it.key === 'number' ? it.key : it.capture",
  "(typeof it.key === 'string' && it.key.length <= 64) || typeof it.key === 'number' ? it.key : it.capture"
 ],
 [
  "more than 1000 distinct captures are not parsed",
  "if (!parsedByKey.has(k)) parsedByKey.set(k, readGoals(it.capture))",
  "if (!parsedByKey.has(k)) parsedByKey.set(k, parsedByKey.size > 1000 ? { ok: false } : readGoals(it.capture))"
 ],
 [
  "tags beyond the fourth name are ignored",
  "for (const name of Object.keys(tags)) {\n        cell(name, tags[name]).notApplicable++",
  "for (const name of Object.keys(tags).slice(0, 4)) {\n        cell(name, tags[name]).notApplicable++"
 ],
 [
  "tags beyond the fourth name are ignored for graded",
  "    for (const name of Object.keys(tags)) {\n      const c = cell(name, tags[name])",
  "    for (const name of Object.keys(tags).slice(0, 4)) {\n      const c = cell(name, tags[name])"
 ],
 [
  "a tag value longer than 40 characters is cut",
  "const t = String(value)\n",
  "const t = String(value).slice(0, 40)\n"
 ],
 [
  "absent is renamed",
  "isHomeVersusScoreRise: { agrees: 0, disagrees: 0, absent: 0 },",
  "isHomeVersusScoreRise: { agrees: 0, disagrees: 0, missing: 0 },"
 ],
 [
  "withADisagreeingCall is renamed",
  "distinctGoals: { graded: 0, withADisagreeingCall: 0 },",
  "distinctGoals: { graded: 0, withDisagreement: 0 },"
 ],
 [
  "byLedgerOutcome is renamed in the init only",
  "byLedgerOutcome: tally(),",
  "byOutcome: tally(),"
 ],
 [
  "ruleVersion is named rule",
  "ruleVersion: RULE_VERSION,",
  "rule: RULE_VERSION,"
 ],
 [
  "the premises block is named premise",
  "    premises: {\n",
  "    premise: {\n"
 ],
 [
  "the graded cell of byTag is named n",
  "{ graded: 0, agree: 0, disagree: 0, notApplicable: 0 }",
  "{ n: 0, agree: 0, disagree: 0, notApplicable: 0 }"
 ],
 [
  "the gradeCall result drops isHomeAgreesWithRise",
  "    isHomeAgreesWithRise: resolving.isHome === null ? null : resolving.isHome === (fieldSide === 'home'),\n",
  ""
 ],
 [
  "the gradeCall result drops stoppage",
  "    stoppage: resolving.added !== null && resolving.added > 0,\n",
  ""
 ],
 [
  "the gradeCall reason is named why",
  "return { graded: false, reason: REASONS.rise }",
  "return { graded: false, why: REASONS.rise }"
 ],
 [
  "coverageLine uses a different separator",
  " | agree ${grade.agree}",
  " / agree ${grade.agree}"
 ],
 [
  "coverageLine has a trailing space",
  " | rule ${grade.ruleVersion}`",
  " | rule ${grade.ruleVersion} `"
 ],
 [
  "coverageLine counts exact over population",
  "resolving goal at the ledger's resolved_minute for ${exact} of ${grade.graded} graded",
  "resolving goal at the ledger's resolved_minute for ${exact} of ${grade.population} graded"
 ],
 [
  "premises count rise as a join",
  "if (r.reason === REASONS.join) out.premises.callsWhoseScoreAtCallDisagreesWithTheCapture++",
  "if (r.reason === REASONS.join || r.reason === REASONS.rise) out.premises.callsWhoseScoreAtCallDisagreesWithTheCapture++"
 ],
 [
  "the confusion is keyed by the verdict first",
  "bump(out.confusion, `ledger ${it.call.outcome}, FIELD ${r.verdict}`)",
  "bump(out.confusion, `ledger ${it.call.outcome} FIELD ${r.verdict}`)"
 ],
 [
  "graded calls skip tags when the tag value is empty",
  "    for (const name of Object.keys(tags)) {\n      const c = cell(name, tags[name])",
  "    for (const name of Object.keys(tags)) {\n      if (tags[name] === '') continue\n      const c = cell(name, tags[name])"
 ],
 [
  "not-applicable calls skip tags when the tag value is empty",
  "      for (const name of Object.keys(tags)) {\n        cell(name, tags[name]).notApplicable++",
  "      for (const name of Object.keys(tags)) {\n        if (tags[name] === '') continue\n        cell(name, tags[name]).notApplicable++"
 ],
 [
  "a not-applicable call with a nullish tag is skipped",
  "      for (const name of Object.keys(tags)) {\n        cell(name, tags[name]).notApplicable++",
  "      for (const name of Object.keys(tags)) {\n        if (tags[name] == null) continue\n        cell(name, tags[name]).notApplicable++"
 ],
 [
  "the parse cache is module-level",
  [
   [
    "  const parsedByKey = new Map()\n",
    ""
   ],
   [
    "const isObj = (v) =>",
    "const parsedByKey = new Map()\nconst isObj = (v) =>"
   ]
  ],
  null
 ],
 [
  "the goalsSeen map is module-level",
  [
   [
    "  const goalsSeen = new Map()\n",
    ""
   ],
   [
    "const isObj = (v) =>",
    "const goalsSeen = new Map()\nconst isObj = (v) =>"
   ]
  ],
  null
 ],
 [
  "graded count carries over calls",
  [
   [
    "    graded: 0,\n    agree: 0,",
    "    graded: _carry,\n    agree: 0,"
   ],
   [
    "const isObj = (v) =>",
    "let _carry = 0\nconst isObj = (v) =>"
   ],
   [
    "    out.graded++\n",
    "    out.graded++; _carry = out.graded\n"
   ]
  ],
  null
 ],
 [
  "the input tags are mutated",
  "const tags = isObj(it.tags) ? it.tags : {}",
  "const tags = isObj(it.tags) ? it.tags : {}\n    if (isObj(it.tags)) it.tags.__seen = 1"
 ],
 [
  "the input capture is annotated",
  "if (!parsedByKey.has(k)) parsedByKey.set(k, readGoals(it.capture))",
  "if (!parsedByKey.has(k)) { parsedByKey.set(k, readGoals(it.capture)); if (isObj(it.capture)) it.capture.__parsed = true }"
 ],
 [
  "purity: a computed global name",
  "const isObj = (v) =>",
  "const _n = ['pro', 'cess'].join('')\nconst _h = globalThis[_n]\nconst isObj = (v) =>"
 ],
 [
  "purity: a dynamic import by variable",
  "const isObj = (v) =>",
  "const _m = 'node:fs'\nconst _i = typeof import.meta\nconst isObj = (v) =>"
 ]
]
