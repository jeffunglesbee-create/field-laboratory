// The gate's two git steps must land BOTH ledger lines when the branch moved during the run.
//
// docs/CC-CMD-2026-10-28-gate-baseline-step-autostash.md. verify-full run 40621860549 scored 530/530 and lost both its ledger
// lines: a cancelled earlier run pushed its own record to the branch while this one ran, `Keep the mutation baseline` then ran
// `git pull --rebase --autostash` over the dirty ledgers, the stash pop conflicted (two appends to the end of one file), and
// `Record this measurement` read the conflict markers as three records and exited 1.
//
// This runs the REAL text of the two steps, extracted from the workflow by name, against a bare origin and two clones:
// the runner (ledgers dirty with this run's one line each, the baseline artifact changed) and a racer that pushes its own
// ledger lines first. It then reads the origin back. The old step text is kept as a fixture and must FAIL the race.
//
// Usage:  node scripts/gate-ledger-step-check.mjs --self-test
//         node scripts/gate-ledger-step-check.mjs [--workflow FILE]

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks, finish, isMain } from './checks.mjs'

const WORKFLOW = '.github/workflows/verify-full.yml'
const BEFORE = 'scripts/fixtures/verify-full-baseline-step-before.yml'
const BASELINE = 'Keep the mutation baseline'
const RECORD = 'Record this measurement'
const CONF = 'docs/confidence-log.jsonl'
const SCALE = 'docs/scale-log.jsonl'
const ART = 'outbox/mutation-baseline-latest.json'

/** The `run: |` block of the step called `name`, dedented. Indentation-based, like workflow-check.mjs: no YAML dependency here. */
export function stepRun(text, name) {
  const lines = text.split('\n')
  const at = lines.findIndex(l => new RegExp(`^(\\s*)- name: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l))
  if (at === -1) return null
  const stepIndent = /^(\s*)/.exec(lines[at])[1].length
  let runAt = -1, end = lines.length
  for (let i = at + 1; i < lines.length; i++) {
    const indent = /^(\s*)/.exec(lines[i])[1].length
    if (lines[i].trim() !== '' && indent <= stepIndent && /^\s*- /.test(lines[i])) { end = i; break }
    if (runAt === -1 && /^\s*run: \|\s*$/.test(lines[i])) runAt = i
  }
  if (runAt === -1) return null
  const runIndent = /^(\s*)/.exec(lines[runAt])[1].length
  const body = []
  for (let i = runAt + 1; i < end; i++) {
    if (lines[i].trim() === '') { body.push(''); continue }
    if (/^(\s*)/.exec(lines[i])[1].length <= runIndent) break
    body.push(lines[i])
  }
  const strip = Math.min(...body.filter(l => l !== '').map(l => /^(\s*)/.exec(l)[1].length))
  return body.map(l => l.slice(strip)).join('\n').trimEnd() + '\n'
}

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`)
  return r.stdout.trim()
}
const write = (dir, rel, text) => { mkdirSync(join(dir, rel, '..'), { recursive: true }); writeFileSync(join(dir, rel), text) }
const append = (dir, rel, line) => writeFileSync(join(dir, rel), readFileSync(join(dir, rel), 'utf8') + line + '\n')
const lines = (dir, rel) => readFileSync(join(dir, rel), 'utf8').split('\n').filter(Boolean)

/** One scenario. Returns what the origin holds afterwards and how the two steps exited. */
export function scenario({ baselineStep, recordStep, race, otherDirty = false, gateRecorded = true }) {
  const root = mkdtempSync(join(tmpdir(), 'gate-ledger-'))
  try {
    const origin = join(root, 'origin.git'), seed = join(root, 'seed'), runner = join(root, 'runner'), racer = join(root, 'racer')
    git(root, 'init', '-q', '--bare', '--initial-branch=main', origin)
    git(root, 'clone', '-q', origin, seed)
    write(seed, CONF, '{"id":"seed-conf"}\n'); write(seed, SCALE, '{"id":"seed-scale"}\n'); write(seed, ART, 'v1\n'); write(seed, 'outbox/other.txt', 'o1\n')
    git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'seed'); git(seed, 'push', '-q', 'origin', 'HEAD:main')
    const sha = git(seed, 'rev-parse', 'HEAD')

    git(root, 'clone', '-q', origin, runner)
    if (gateRecorded) append(runner, CONF, '{"id":"run-conf"}')
    append(runner, SCALE, '{"id":"run-scale"}')
    write(runner, ART, 'v2\n')
    if (otherDirty) write(runner, 'outbox/other.txt', 'o2\n')

    if (race) {
      git(root, 'clone', '-q', origin, racer)
      append(racer, CONF, '{"id":"racer-conf"}'); append(racer, SCALE, '{"id":"racer-scale"}')
      git(racer, 'commit', '-q', '-am', 'Record CI measurement of 9b58ef2'); git(racer, 'push', '-q', 'origin', 'HEAD:main')
    }

    const env = { ...process.env, GITHUB_REF_NAME: 'main', GITHUB_SHA: sha, GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }
    const run = script => {
      const r = spawnSync('bash', ['-e', '-c', script], { cwd: runner, env, encoding: 'utf8' })
      return { code: r.status, out: (r.stdout + r.stderr).trim() }
    }
    const first = run(baselineStep), second = run(recordStep)

    const view = join(root, 'view')
    git(root, 'clone', '-q', origin, view)
    const conf = lines(view, CONF), scale = lines(view, SCALE)
    const count = (arr, id) => arr.filter(l => l.includes(`"${id}"`)).length
    return {
      codes: [first.code, second.code], messages: [first.out, second.out],
      confRunOnce: count(conf, 'run-conf') === (gateRecorded ? 1 : 0), scaleRunOnce: count(scale, 'run-scale') === 1,
      confRacer: !race || count(conf, 'racer-conf') === 1, scaleRacer: !race || count(scale, 'racer-scale') === 1,
      markers: [...conf, ...scale].some(l => /^(<<<<<<<|=======|>>>>>>>)/.test(l)),
      artifact: readFileSync(join(view, ART), 'utf8').trim(), other: readFileSync(join(view, 'outbox/other.txt'), 'utf8').trim(),
      confLines: conf.length, scaleLines: scale.length,
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

/** The verdict on a scenario result: everything that must be true on the origin once both steps ran. */
export const landed = (r, { otherDirty = false } = {}) =>
  r.codes[0] === 0 && r.codes[1] === 0 && r.confRunOnce && r.scaleRunOnce && r.confRacer && r.scaleRacer && !r.markers && r.artifact === 'v2' &&
  (!otherDirty || r.other === 'o1')

const SCENARIOS = [
  ['quiet branch (nothing raced)', { race: false }],
  ['the branch moved: a cancelled run appended to both ledgers', { race: true }],
  ['the branch moved, and another tracked file is dirty too', { race: true, otherDirty: true }],
  ['the branch moved, and the gate recorded no confidence line (its gate step failed)', { race: true, gateRecorded: false }],
]

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const at = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
  const recordStep = stepRun(readFileSync(WORKFLOW, 'utf8'), RECORD)

  if (process.argv.includes('--self-test')) {
    const synth = ['jobs:', '  j:', '    steps:', '      - name: First', '        run: |', '          echo one', '', '          echo two', '      - name: Second one', '        if: always()', '        run: |', '          echo 2', '      - uses: x'].join('\n')
    check('the step extractor returns a step\'s run block, dedented, blank line kept', stepRun(synth, 'First') === 'echo one\n\necho two\n', JSON.stringify(stepRun(synth, 'First')))
    check('...stops at the next step', stepRun(synth, 'Second one') === 'echo 2\n', JSON.stringify(stepRun(synth, 'Second one')))
    check('...and answers null for a step that is not there', stepRun(synth, 'Third') === null)
    check('the real workflow has both steps', stepRun(readFileSync(WORKFLOW, 'utf8'), BASELINE) !== null && recordStep !== null)

    const before = stepRun(readFileSync(BEFORE, 'utf8'), BASELINE)
    check('the old step text is in the fixture and still carries --autostash', before !== null && /--autostash/.test(before))
    // The must-fail inputs: the OLD text has to lose the line on a moved branch, and has to be fine on a quiet one.
    const oldQuiet = scenario({ baselineStep: before, recordStep, race: false })
    check('MUTATION: the old text lands both lines on a quiet branch (the scenario can pass)', landed(oldQuiet), JSON.stringify(oldQuiet))
    const oldRace = scenario({ baselineStep: before, recordStep, race: true })
    check('MUTATION: the old text FAILS when the branch moved — the 2026-10-28 loss, reproduced',
      !landed(oldRace) && oldRace.codes[1] === 1 && /expected exactly one new record/.test(oldRace.messages[1]), JSON.stringify({ codes: oldRace.codes, msg: oldRace.messages[1].slice(0, 200) }))

    const fixed = stepRun(readFileSync(WORKFLOW, 'utf8'), BASELINE)
    // The mutation harness rule: an anchor must be unique and applied before the result means anything.
    const anchor = /for LEDGER in docs\/confidence-log\.jsonl docs\/scale-log\.jsonl; do\n\s+\[ -s "\$SAVED\/\$\(basename "\$LEDGER"\)" \] && cat [^\n]*\n\s*done/
    const hits = fixed.match(new RegExp(anchor, 'g'))
    check('the re-append loop is found exactly once in the fixed text (the mutation below mutates something)', hits !== null && hits.length === 1, String(hits && hits.length))
    if (hits && hits.length === 1) {
      const mutated = fixed.replace(anchor, ': # re-append removed')
      const m = scenario({ baselineStep: mutated, recordStep, race: false })
      check('MUTATION: the fixed text without its re-append loses this run\'s ledger lines', !landed(m), JSON.stringify({ codes: m.codes, scaleRunOnce: m.scaleRunOnce }))
    }
  }

  const text = at('--workflow') ? readFileSync(at('--workflow'), 'utf8') : readFileSync(WORKFLOW, 'utf8')
  const baselineStep = stepRun(text, BASELINE)
  check('the workflow has the baseline step and the record step', baselineStep !== null && recordStep !== null)
  if (baselineStep !== null && recordStep !== null) {
    for (const [name, opts] of SCENARIOS) {
      const r = scenario({ baselineStep, recordStep, ...opts })
      check(`${name}: both steps exit 0, every ledger line lands once, no conflict markers, artifact lands${opts.otherDirty ? ', the other dirty file is not clobbered' : ''}`,
        landed(r, opts), JSON.stringify({ codes: r.codes, confRunOnce: r.confRunOnce, scaleRunOnce: r.scaleRunOnce, confRacer: r.confRacer, scaleRacer: r.scaleRacer, markers: r.markers, artifact: r.artifact, other: r.other, msg: r.messages.join(' | ').slice(0, 300) }))
    }
    console.log(`  ${SCENARIOS.length} scenarios run against the real step text of ${at('--workflow') ?? WORKFLOW}`)
  }
  finish(summarize())
}
