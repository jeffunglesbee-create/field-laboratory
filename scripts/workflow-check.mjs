// Asserts that every workflow job can actually run the scripts it invokes.
//
// The bug this exists for: `check:window` imports the compiled `fieldDayAt`
// from build/Desk.js, and it was added as a step in live-check.yml — a job that
// deliberately installs no .NET and runs no build, because its whole purpose is
// to test the DEPLOYED artifact rather than a local one. Two runs failed with
// ERR_MODULE_NOT_FOUND before anyone looked.
//
// Nothing in the repo could have caught that. The script was correct, the
// workflow was valid YAML, and every local check passed; the mismatch lived
// only in the pairing of the two. So this check reads the pairing directly:
// resolve each job's script invocations, follow their relative imports, and
// fail if any of them reaches build/ from a job that never builds.
//
// Usage:  node scripts/workflow-check.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { createChecks, isMain, finish } from './checks.mjs'

const WORKFLOWS = '.github/workflows'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const npmScripts = pkg.scripts ?? {}

/**
 * Split a workflow into jobs by indentation.
 *
 * Deliberately not a YAML parser — there is no YAML dependency in this repo and
 * adding one to read six files would be the larger cost. Jobs are the keys at
 * exactly two spaces under `jobs:`, which is true of every workflow here and is
 * asserted below rather than assumed: a file that yields zero jobs fails.
 */
const jobsOf = text => {
  // Comment-only lines are dropped first. Without this the detector reads
  // prose: the note in live-check.yml explaining WHY the window check is not
  // there mentions `npm run check:window`, and the first run of this script
  // flagged that comment as the invocation it was warning about.
  const lines = text.split('\n').filter(l => !/^\s*#/.test(l))
  const start = lines.findIndex(l => /^jobs:\s*$/.test(l))
  if (start === -1) return []
  const jobs = []
  let current = null
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (header) {
      current = { name: header[1], body: [] }
      jobs.push(current)
    } else if (/^\S/.test(line) && line.trim() !== '') {
      break // back to top level — out of `jobs:`
    } else if (current) {
      current.body.push(line)
    }
  }
  return jobs.map(j => ({ name: j.name, text: j.body.join('\n') }))
}

/** Every script file a job's commands reach, following relative imports. */
const scriptsReachedBy = jobText => {
  const seeds = new Set()

  // Direct: `node scripts/foo.mjs`
  for (const m of jobText.matchAll(/node\s+(scripts\/[\w.-]+\.mjs)/g)) seeds.add(m[1])

  // Indirect: `npm run foo` -> whatever package.json says that is.
  for (const m of jobText.matchAll(/npm run ([\w:-]+)/g)) {
    const body = npmScripts[m[1]]
    if (!body) continue
    for (const s of body.matchAll(/node\s+(scripts\/[\w.-]+\.mjs)/g)) seeds.add(s[1])
  }

  // Transitive closure over relative imports, so a helper that pulls in build/
  // is not invisible just because the entry point looks innocent.
  const seen = new Set()
  const queue = [...seeds]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
      if (m[1].startsWith('../build/')) continue // that's the thing we're detecting
      queue.push(`scripts/${m[1].replace(/^\.\//, '').replace(/^\.\.\//, '')}`)
    }
  }
  return [...seen]
}

/** Does any reached script import from build/? Returns the culprits. */
const buildImporters = files =>
  files.filter(f => /from\s+'\.\.\/build\//.test(readFileSync(f, 'utf8')))

/**
 * Does any reached script walk git history? Returns the culprits.
 *
 * The second dependency in this family, and the one FIELD's production gate
 * tripped over: `actions/checkout` clones shallow by default, so `git log -20`
 * silently sees one commit. Their fix was `fetch-depth: 25` — a number that is
 * deep enough until the day it isn't. Anything that reads history needs all of
 * it. `git diff`/`git status` are excluded: they read the working tree.
 */
const historyReaders = files =>
  files.filter(f => /git (log|rev-list)\b/.test(readFileSync(f, 'utf8')))

/** A job builds if it runs the build, or invokes Fable directly. `scripts/build-steady.mjs` IS the build (`npm run build`, repeated when the F# compiler crashes). */
const jobBuilds = jobText =>
  /npm run build/.test(jobText) || /dotnet fable/.test(jobText) || /node scripts\/build-steady\.mjs/.test(jobText)

/** A job has full history only with an explicit `fetch-depth: 0`. */
const jobHasFullHistory = jobText => /fetch-depth:\s*0\b/.test(jobText)

/**
 * Every cron literal a workflow declares, from its `on: schedule:` block.
 *
 * Same indentation reading as `jobsOf` — no YAML parser in this repo — and the
 * assertion below fails if a file that plainly has crons yields none.
 */
export const cronsOf = text =>
  [...text.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map(m => m[1])

/** Every cron string a step's `if:` compares `github.event.schedule` against. */
export const scheduleGuardsOf = text =>
  [...text.matchAll(/github\.event\.schedule\s*==\s*['"]([^'"]+)['"]/g)].map(m => m[1])

/**
 * A step gated on `github.event.schedule == 'X'` where X is not one of the
 * workflow's own crons.
 *
 * THE FAILURE IS SILENCE. drift-sentinel has two daily crons and the red-main
 * rehearsal is pinned to one of them, so it runs weekly instead of twice a
 * Sunday. Change the cron -- retime it, add a minute offset -- and the guard
 * stops matching anything. The step then never runs again, the workflow stays
 * green, and the only symptom is a rehearsal that quietly stopped happening.
 * That is precisely the rot the rehearsal was scheduled to prevent.
 */
export const danglingScheduleGuards = (text) => {
  const crons = cronsOf(text)
  return scheduleGuardsOf(text).filter(g => !crons.includes(g))
}

/**
 * Every `run:` step of a workflow, with the script it runs.
 *
 * Same reading as `jobsOf`: indentation, not YAML. A step starts at a `- key:` line and ends at the next one of the same or a shallower indent;
 * its `run:` is the sibling key at the step's own key indent (a `run:` nested under `with:` is not a step's script). `script` has the
 * comment-only lines of a block scalar removed: a comment that SAYS "pipefail" or "PIPESTATUS" must not read as a guard (the first version of
 * the offline counter did exactly that, and called two fixed steps guarded after their real line was deleted).
 */
export const runStepsOf = text => {
  const lines = text.split('\n')
  const starts = []
  lines.forEach((l, i) => { const m = /^(\s*)- [A-Za-z_-]+:/.exec(l); if (m) starts.push({ i, indent: m[1].length }) })
  const steps = []
  starts.forEach((st, k) => {
    let end = lines.length
    for (let j = k + 1; j < starts.length; j++) if (starts[j].indent <= st.indent) { end = starts[j].i; break }
    const seg = lines.slice(st.i, end)
    const keyIndent = st.indent + 2
    let runAt = -1
    let value = ''
    for (let j = 0; j < seg.length; j++) {
      const m = j === 0 ? /^(\s*)- run:\s*(.*)$/.exec(seg[j]) : /^(\s*)run:\s*(.*)$/.exec(seg[j])
      if (m && (j === 0 || m[1].length === keyIndent)) { runAt = j; value = m[2]; break }
    }
    if (runAt < 0) return
    let script = value
    if (/^[|>][+-]?\s*(#.*)?$/.test(value)) {
      const body = []
      for (let j = runAt + 1; j < seg.length; j++) {
        if (seg[j].trim() === '' || /^(\s*)/.exec(seg[j])[1].length > keyIndent) body.push(seg[j])
        else break
      }
      script = body.filter(l => !/^\s*#/.test(l)).join('\n')
    }
    const keyValue = key => {
      for (let j = 0; j < seg.length; j++) {
        const m = (j === 0 ? new RegExp(`^(\\s*)- ${key}:\\s*(.*?)(?:\\s+#.*)?$`) : new RegExp(`^(\\s*)${key}:\\s*(.*?)(?:\\s+#.*)?$`)).exec(seg[j])
        if (m && (j === 0 || m[1].length === keyIndent)) return m[2]
      }
      return null
    }
    steps.push({ line: st.i + runAt + 1, name: keyValue('name'), shell: keyValue('shell'), script })
  })
  return steps
}

/** A quoted span is blanked before the pipe is looked for, so `echo "a | tee b"` is not a pipe. Multi-line quotes (`node -e '...'`) are one span. */
const blankQuotes = text => text.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""')

/**
 * `undefined` if the step does not pipe into `tee`; otherwise what carries the left side's exit status: 'PIPESTATUS', 'pipefail', 'shell', or `null`: nothing.
 *
 * THE FAILURE IS A GREEN STEP OVER A FAILED SCRIPT. A step with no `shell:` runs `bash -e {0}`, with no pipefail, so in `node script | tee f` the
 * step's status is tee's. A script that throws leaves the step green, and whatever it should have written is whatever the last run left. Measured on a
 * real run (forecast-run.yml:62), reproduced offline on fable-issue-prefill.yml (2026-11-10), and present in nine of 337 steps on 2026-11-11.
 * `||` is not a pipe, `|&` is, and `shell: bash -e {0}` or `shell: sh` is not a guard (an explicit bash adds -o pipefail; those do not).
 */
export const teePipeGuard = step => {
  if (!/(?<!\|)\|&?\s*tee\b/.test(blankQuotes(step.script))) return undefined
  if (/\bPIPESTATUS\b/.test(step.script)) return 'PIPESTATUS'
  if (/\bset\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*o\s+pipefail\b/.test(step.script)) return 'pipefail'
  if (step.shell === 'bash' || /\bpipefail\b/.test(step.shell ?? '')) return 'shell'
  return null
}

export const unguardedTeePipes = text => runStepsOf(text).filter(st => teePipeGuard(st) === null)

const teeAudit = () => {
  let steps = 0
  let piped = 0
  const unguarded = []
  const byGuard = {}
  for (const file of readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f))) {
    for (const st of runStepsOf(readFileSync(`${WORKFLOWS}/${file}`, 'utf8'))) {
      steps++
      const g = teePipeGuard(st)
      if (g === undefined) continue
      piped++
      if (g === null) unguarded.push(`${file}:${st.line}${st.name ? `  ${st.name}` : ''}`)
      else byGuard[g] = (byGuard[g] ?? 0) + 1
    }
  }
  return { steps, piped, unguarded, byGuard }
}

const audit = () => {
  const problems = []
  let jobCount = 0
  for (const file of readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f))) {
    const text = readFileSync(`${WORKFLOWS}/${file}`, 'utf8')
    for (const job of jobsOf(text)) {
      jobCount++
      const reached = scriptsReachedBy(job.text)
      const needsBuild = buildImporters(reached)
      if (needsBuild.length && !jobBuilds(job.text)) {
        problems.push(`${file}:${job.name} runs ${needsBuild.join(', ')} — which import build/ — but never builds`)
      }
      const needsHistory = historyReaders(reached)
      if (needsHistory.length && !jobHasFullHistory(job.text)) {
        problems.push(`${file}:${job.name} runs ${needsHistory.join(', ')} — which read git history — without fetch-depth: 0`)
      }
    }
    for (const dangling of danglingScheduleGuards(text)) {
      problems.push(`${file} gates a step on github.event.schedule == '${dangling}', which is not one of its crons (${cronsOf(text).map(c => `'${c}'`).join(', ') || 'none'}) — that step can never run`)
    }
  }
  return { problems, jobCount }
}

// EXECUTABLE HALF, GUARDED, and NOT REINDENTED.
//
// This file gained exports (`cronsOf`, `scheduleGuardsOf`,
// `danglingScheduleGuards`) with the schedule-guard detector, and an exporting
// module that does its work at import time terminates whatever imports it --
// caught by check:import-purity at the pre-commit door, the third file this
// session.
//
// The first attempt wrapped the block AND indented it by two spaces, which is
// normally cosmetic. Here it broke two detector fixtures: they are YAML inside
// template literals, and `jobsOf` identifies a job as a key at EXACTLY two
// spaces under `jobs:`. Adding two spaces made every fixture job invisible and
// the teeth tests went green-by-vacuity in the direction that matters --
// "the detector still catches the original mistake" started failing because the
// detector was handed nothing to catch. Braces, no reindent.
if (isMain(import.meta.url)) {

const { problems, jobCount } = audit()
const { check, summarize } = createChecks()

console.log(`\nScanned ${jobCount} jobs across ${readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f)).length} workflows\n`)

check('at least one job was parsed', jobCount > 0,
  'the job splitter found nothing — the indentation assumption above is wrong')

check('no job runs a build-dependent script without building',
  problems.length === 0, problems.join('\n      → '))

// A step that pipes into tee must carry the left side's exit status. The denominators print where the result is read (Rule 91).
const tee = teeAudit()
console.log(`Read ${tee.steps} run steps; ${tee.piped} pipe into tee (${Object.entries(tee.byGuard).map(([k, v]) => `${v} by ${k}`).join(', ') || 'none guarded'}; ${tee.unguarded.length} unguarded)\n`)
check('the tee audit read run steps and found tee pipes, so it is not vacuous', tee.steps > 0 && tee.piped > 0,
  `${tee.steps} run steps read, ${tee.piped} piping into tee: the step reader found nothing`)
check('no run step pipes into tee without carrying the left side\'s exit status', tee.unguarded.length === 0,
  `${tee.unguarded.length} step(s): under the default shell (bash -e) the step's status is tee's, so a script that throws leaves it green. Add \`exit \${PIPESTATUS[0]}\` after the pipeline, \`set -o pipefail\` before it, or \`shell: bash\` to the step:\n      → ${tee.unguarded.join('\n      → ')}`)

// A guard shown only to pass is half-tested. This replays the exact historical
// mistake against the real detector: a job with no build step that runs the
// window check. If the detector cannot see that, it cannot see anything.
const replay = `
  live:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
      - run: npm run check:window
`
const detected = jobsOf(`jobs:${replay}`)
  .some(j => buildImporters(scriptsReachedBy(j.text)).length > 0 && !jobBuilds(j.text))
check('the detector still catches the original mistake', detected,
  'a build-less job running check:window was NOT flagged — the detector has no teeth')

// And the other direction, so it is not simply flagging everything.
const withBuild = jobsOf(`jobs:${replay.replace('- run: npm ci', '- run: npm run build')}`)
  .some(j => buildImporters(scriptsReachedBy(j.text)).length > 0 && !jobBuilds(j.text))
const withSteadyBuild = jobsOf(`jobs:${replay.replace('- run: npm ci', '- run: node scripts/build-steady.mjs')}`)
  .some(j => buildImporters(scriptsReachedBy(j.text)).length > 0 && !jobBuilds(j.text))
check('the detector knows the steady build wrapper is a build', !withSteadyBuild,
  'a job running node scripts/build-steady.mjs was flagged as never building')
check('the detector does not flag a job that does build', !withBuild,
  'the same job WITH a build step was still flagged — the detector fails everything')

// Same two directions for the history dependency. The shallow-clone default is
// the trap: a job that reads git log on a depth-1 checkout sees one commit.
const shallow = `
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run check:history
`
check('the detector catches a history reader on a shallow checkout',
  jobsOf(`jobs:${shallow}`).some(j =>
    historyReaders(scriptsReachedBy(j.text)).length > 0 && !jobHasFullHistory(j.text)),
  'a git-log script on a default checkout was NOT flagged')

check('the detector does not flag fetch-depth: 0',
  !jobsOf(`jobs:${shallow.replace('- uses: actions/checkout@v4', '- uses: actions/checkout@v4\n        with:\n          fetch-depth: 0')}`)
    .some(j => historyReaders(scriptsReachedBy(j.text)).length > 0 && !jobHasFullHistory(j.text)),
  'the same job WITH fetch-depth: 0 was still flagged')

// The schedule-guard detector, both directions. Added with the weekly red-main
// rehearsal, whose gate is a string that has to keep matching a cron literal
// four lines away in the same file.
const scheduled = `
on:
  schedule:
    - cron: '0 12 * * *'
    - cron: '30 1 * * *'
jobs:
  x:
    steps:
      - if: github.event.schedule == '0 12 * * *'
        run: echo hi
`
check('a guard matching a declared cron is not flagged',
  danglingScheduleGuards(scheduled).length === 0,
  'the detector flags a correct gate — it would fail every scheduled step')
check('THE DETECTOR CATCHES A GUARD THAT MATCHES NO CRON',
  danglingScheduleGuards(scheduled.replace("- cron: '0 12 * * *'", "- cron: '0 13 * * *'"))
    .join() === '0 12 * * *',
  'retiming the cron leaves the step permanently skipped, and green')
check('a workflow with crons yields them',
  cronsOf(scheduled).length === 2, cronsOf(scheduled).join(', '))

// The tee guard, clause by clause, each with its must-fail twin (Rule 90). A workflow is built from step lines; the strings use no template
// literal so that `${PIPESTATUS[0]}` stays text.
const wf = (...lines) => ['jobs:', '  x:', '    steps:', ...lines.map(l => '      ' + l)].join('\n') + '\n'
const flagged = (...lines) => unguardedTeePipes(wf(...lines)).length
const bare = ['- name: p', '  run: |', '    node a.mjs 2>&1 | tee -a "$GITHUB_STEP_SUMMARY"']
check('tee: a bare pipe into tee is flagged', flagged(...bare) === 1, 'node a | tee with nothing after it was NOT flagged')
check('tee: exit ${PIPESTATUS[0]} on the next line is a guard', flagged(...bare, '    exit ${PIPESTATUS[0]}') === 0, 'a guarded step was flagged')
check('tee: ; exit ${PIPESTATUS[0]} on a single-line run is a guard',
  flagged('- name: p', '  run: node a.mjs 2>&1 | tee f; exit ${PIPESTATUS[0]}') === 0 && flagged('- name: p', '  run: node a.mjs 2>&1 | tee f') === 1,
  'the single-line form is mishandled')
check('tee: PIPESTATUS inside double quotes still guards (exit "${PIPESTATUS[0]}")', flagged(...bare, '    exit "${PIPESTATUS[0]}"') === 0, 'quote blanking leaked into the guard test')
check('tee: set -o pipefail, set -eo pipefail, set -euo pipefail and set -e -o pipefail each guard',
  ['set -o pipefail', 'set -eo pipefail', 'set -euo pipefail', 'set -e -o pipefail'].every(g =>
    flagged('- name: p', '  run: |', '    ' + g, '    node a.mjs | tee f') === 0),
  'a pipefail form was not recognised')
check('tee: set -e alone is not a guard', flagged('- name: p', '  run: |', '    set -e', '    node a.mjs | tee f') === 1, 'set -e was read as pipefail')
check('tee: an explicit shell: bash guards, shell: bash -eo pipefail {0} guards',
  flagged('- name: p', '  shell: bash', '  run: node a.mjs | tee f') === 0 && flagged('- name: p', '  shell: bash -eo pipefail {0}', '  run: node a.mjs | tee f') === 0,
  'a bash shell key was not recognised')
check('tee: shell: bash -e {0} and shell: sh are NOT guards',
  flagged('- name: p', '  shell: bash -e {0}', '  run: node a.mjs | tee f') === 1 && flagged('- name: p', '  shell: sh', '  run: node a.mjs | tee f') === 1,
  'a shell without pipefail was read as a guard')
check('tee: A COMMENT THAT MENTIONS PIPESTATUS AND PIPEFAIL IS NOT A GUARD',
  flagged('- name: p', '  run: |', '    node a.mjs | tee f', '    # exit ${PIPESTATUS[0]} would carry it; set -o pipefail would too') === 1,
  'a comment passed for a guard: the line that carried the status can be deleted and the check stays green')
check('tee: tee that is not a pipe target is not flagged', flagged('- name: p', '  run: |', '    tee -a "$GITHUB_OUTPUT" <<< "a=b"') === 0, 'a tee with no pipe was flagged')
check('tee: || before tee is not a pipe', flagged('- name: p', '  run: false || tee f') === 0, '|| was read as a pipe')
check('tee: |& tee is a pipe', flagged('- name: p', '  run: node a.mjs |& tee f') === 1, '|& was not recognised')
check('tee: a pipe on a continuation line is a pipe',
  flagged('- name: p', '  run: |', '    node a.mjs --x \\', '      | tee out.txt') === 1, 'a line that begins with | was missed')
check('tee: "| tee" inside quotes is not a pipe, and a pipe after a multi-line quoted script is',
  flagged('- name: p', '  run: echo "a | tee b"') === 0
    && flagged('- name: p', '  run: |', "    node -e '", '      console.log("x | tee")', "    ' | tee f") === 1
    && flagged('- name: p', '  run: |', "    node -e '", '      console.log("x")', "    ' | tee f", '    exit ${PIPESTATUS[0]}') === 0,
  'quote blanking is wrong')
const two = wf('- name: ok', '  run: node a.mjs | tee f; exit ${PIPESTATUS[0]}', '- name: bad', '  run: |', '    echo hi', '    node b.mjs | tee g')
const found = unguardedTeePipes(two)
check('tee: only the unguarded step of two is reported, with its name and the line of its run:',
  found.length === 1 && found[0].name === 'bad' && two.split('\n')[found[0].line - 1].trim() === 'run: |',
  JSON.stringify(found.map(f => [f.name, f.line])))
check('tee: a name containing # is read whole (it is not a comment)',
  unguardedTeePipes(wf('- name: Fail on any F# compiler warning', '  run: node a.mjs | tee f'))[0]?.name === 'Fail on any F# compiler warning', 'the name was cut at #')
check('tee: a run: nested under with: is not a step script',
  flagged('- uses: some/action@v1', '  with:', '    run: node a.mjs | tee f') === 0, 'a with: input named run was read as a script')
check('tee: steps are counted, with or without a tee',
  runStepsOf(wf('- name: a', '  run: echo 1', '- uses: x/y@v1', '- name: b', '  run: echo 2 | tee f')).length === 2, 'the step reader miscounts')

finish(summarize())

}
