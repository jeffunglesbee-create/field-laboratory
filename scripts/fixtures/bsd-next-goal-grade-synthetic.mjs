// SYNTHETIC calls and captures for the grader's check. The goal-row keys are the ones the committed real captures carry
// (data/bsd-flow-finished-incidents.json: type, minute, is_home, player, goal_type, added_time, home_score, away_score, where
// the two scores are the running score AFTER the goal) and the call keys are the ones the real ledger rows carry (measured
// 2026-11-22 in field-relay-nba outbox/bsd-next-goal-probe-latest.json: id, event, minute, side, team, probability,
// score_at_call {home, away}, outcome, resolved_minute, called_at, resolved_at). Real captures list incidents newest-first,
// so these do too. Nothing here is vendor data.

// steps: [[side, minute, overrides?], ...] in the order the goals were scored
export const timeline = (steps) => {
  let home = 0
  let away = 0
  return steps.map(([side, minute, extra]) => {
    if (side === 'home') home++
    else away++
    return { type: 'goal', minute, home_score: home, away_score: away, is_home: side === 'home', goal_type: 'regular', player: 'P', ...(extra === undefined ? {} : extra) }
  })
}

// an incidents.json body: the goal rows newest-first (or as given with ascending), among rows that are not goals
export const capture = (goalRows, o = {}) => ({
  event_id: 0,
  incidents: [
    ...(o.ascending ? goalRows : goalRows.slice().reverse()),
    { type: 'period', text: 'HT', minute: 45, is_live: false, home_score: 0, away_score: 0 },
    { type: 'substitution', minute: 60, is_home: true },
  ],
})

export const callOf = (o) => ({
  id: o.id === undefined ? 1 : o.id,
  event: { id: 1 },
  minute: 30,
  side: o.side,
  outcome: o.outcome,
  score_at_call: o.score === undefined ? { home: o.a === undefined ? 0 : o.a, away: o.b === undefined ? 0 : o.b } : o.score,
  resolved_minute: o.rm === undefined ? null : o.rm,
})

export const item = (call, cap, key = 'k', tags = {}) => ({ call, capture: cap, key, tags })

// the world most scenarios use: home 20', away 55', home 80'  (1-0, 1-1, 2-1)
export const T1 = () => timeline([['home', 20], ['away', 55], ['home', 80]])
