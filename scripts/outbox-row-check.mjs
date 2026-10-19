// The outbox row's two halves, on fixtures.
//
// "This session wrote its outbox" asks whether a session wrote that day's
// write-up. verify-full's weekly cron is not a session, so on a `schedule` run
// the row is NOT APPLICABLE: out of the score, printed, recorded, and never a
// pass. docs/CC-CMD-2026-10-17-verify-full-scheduled-outbox-row.md, option 1.
//
// The danger in that change is the obvious one: a not-applicable that leaks
// past `schedule` turns a real miss into a quiet pass. So this proves the miss
// still fails for every other event, and that the real `run-row.mjs` exits 3,
// not 0, when it is not applicable.
//
// Usage:  node scripts/outbox-row-check.mjs --self-test

import { spawnSync } from 'node:child_process'
import { createChecks, finish } from './checks.mjs'
import { outboxVerdict, NOT_APPLICABLE } from './gate-checks.mjs'

if (!process.argv.includes('--self-test')) {
  console.error('usage: node scripts/outbox-row-check.mjs --self-test')
  process.exit(2)
}

const { check, summarize } = createChecks()
const DAY = '2026-10-26'
const LONG = 'x'.repeat(1501)
const world = files => ({ files: Object.keys(files), read: f => files[f] })
const none = world({ 'cc-session-2026-10-19-other.md': LONG })
const written = world({ [`cc-session-${DAY}-work.md`]: LONG })
const stub = world({ [`cc-session-${DAY}-work.md`]: 'stub' })

// The miss still fails wherever a session could have written one.
for (const event of [undefined, 'workflow_dispatch', 'push'])
  check(`no dated entry FAILS on a ${event ?? 'local'} run`,
    outboxVerdict({ ...none, day: DAY, event }) === false,
    `got ${JSON.stringify(outboxVerdict({ ...none, day: DAY, event }))}`)
check('a stub under the length floor still FAILS on a dispatched run',
  outboxVerdict({ ...stub, day: DAY, event: 'workflow_dispatch' }) === false,
  `got ${JSON.stringify(outboxVerdict({ ...stub, day: DAY, event: 'workflow_dispatch' }))}`)
check('a dated entry over the floor passes on a dispatched run',
  outboxVerdict({ ...written, day: DAY, event: 'workflow_dispatch' }) === true,
  `got ${JSON.stringify(outboxVerdict({ ...written, day: DAY, event: 'workflow_dispatch' }))}`)

// Not applicable ONLY under schedule, and never `true`, even with an entry present.
check('on a scheduled run it is NOT APPLICABLE with no entry',
  outboxVerdict({ ...none, day: DAY, event: 'schedule' }) === NOT_APPLICABLE,
  `got ${JSON.stringify(outboxVerdict({ ...none, day: DAY, event: 'schedule' }))}`)
check('on a scheduled run it is NOT APPLICABLE even with an entry, never a pass',
  outboxVerdict({ ...written, day: DAY, event: 'schedule' }) === NOT_APPLICABLE,
  `got ${JSON.stringify(outboxVerdict({ ...written, day: DAY, event: 'schedule' }))}`)

// The real runner, end to end: exit 3 under schedule, not 0.
const row = event => spawnSync('node', ['scripts/run-row.mjs', 'this session wrote its outbox'],
  { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: event } })
const scheduled = row('schedule')
check('run-row exits 3 (not applicable), not 0, on a scheduled run',
  scheduled.status === 3 && /^N\/A/m.test(scheduled.stdout),
  `exit ${scheduled.status}: ${scheduled.stdout.trim()}`)
const dispatched = row('workflow_dispatch')
check('run-row exits 0 or 1 on a dispatched run, never 3',
  dispatched.status === 0 || dispatched.status === 1,
  `exit ${dispatched.status}: ${dispatched.stdout.trim()}`)

finish(summarize())
