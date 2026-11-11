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
 * The shell text of a step, read the way bash reads it: returns `{ code, bare }`.
 *
 * `code` has comments (a `#` that begins a word, outside quotes) and heredoc bodies removed and keeps quotes: a guard is looked for here, so
 * `exit "${PIPESTATUS[0]}"` is seen and a comment or a heredoc that SAYS pipefail is not. `bare` is `code` with the inside of every quoted string
 * emptied, so `echo "a | tee b"` is not a pipe, and an apostrophe in a comment or in heredoc prose cannot pair with a quote on a later line and swallow
 * a real pipe (the first version blanked quotes with one regular expression and did exactly that: found by review, 2026-11-11).
 *
 * NOT READ, and said here so the check's silence is not read as more than it is: a pipe inside `$( )` within double quotes, inside a nested
 * `sh -c '...'` string, and `$'...'` quoting. A step that needs those writes the convention instead.
 */
export const shellViews = script => {
  const out = []
  const bare = []
  const heredocs = [] // { delim, dash } waiting for their closing line
  let single = false
  let double = false
  for (const line of script.split('\n')) {
    if (heredocs.length && !single && !double) {
      const h = heredocs[0]
      if ((h.dash ? line.replace(/^\t+/, '') : line) === h.delim) heredocs.shift()
      continue
    }
    let code = ''
    let plain = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (single) {
        code += c
        if (c === "'") { single = false; plain += c } // the content is dropped from `plain`, the quotes stay
      } else if (double) {
        code += c
        if (c === '\\' && i + 1 < line.length) { code += line[++i] } else if (c === '"') { double = false; plain += c }
      } else if (c === '\\' && i + 1 < line.length) {
        code += c + line[i + 1]
        plain += c + line[i + 1]
        i++
      } else if (c === "'") { single = true; code += c; plain += c } else if (c === '"') { double = true; code += c; plain += c } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
        break // a comment to the end of the line
      } else {
        if (c === '<' && line[i + 1] === '<' && line[i - 1] !== '<') { // not <<<word, which is a here-string; <<< "x" has no identifier after << and never matches below
          const m = /^<<(-?)\s*(['"]?)([A-Za-z_][\w]*)\2/.exec(line.slice(i))
          if (m) heredocs.push({ delim: m[3], dash: m[1] === '-' })
        }
        code += c
        plain += c
      }
    }
    out.push(code)
    bare.push(plain)
  }
  return { code: out.join('\n'), bare: bare.join('\n') }
}

/**
 * Every `run:` step of a workflow, with the script it runs.
 *
 * Same reading as `jobsOf`: indentation, not YAML. A step is a `- key:` item of a `steps:` list (a matrix `include:` entry with a `run:` key is not one);
 * it ends at the next item of the same or a shallower indent, or at the first line that dedents out of the list (so the next job's keys are not read
 * as this step's). Its `run:` is the sibling key at the step's key indent. A block scalar (`|`, `>`), a quoted scalar and a plain scalar that continues
 * on the next lines are all read to the end; CRLF is normalised.
 */
export const runStepsOf = text => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const indentOf = l => /^(\s*)/.exec(l)[1].length
  const blank = l => l.trim() === '' || /^\s*#/.test(l)
  const starts = []
  lines.forEach((l, i) => {
    const m = /^(\s*)- [A-Za-z_-]+:/.exec(l)
    if (!m) return
    for (let j = i - 1; j >= 0; j--) {
      if (blank(lines[j]) || indentOf(lines[j]) >= m[1].length) continue
      if (/^\s*steps:\s*(#.*)?$/.test(lines[j])) starts.push({ i, indent: m[1].length })
      break
    }
  })
  const steps = []
  starts.forEach((st, k) => {
    let end = lines.length
    for (let j = st.i + 1; j < lines.length; j++) {
      if (!blank(lines[j]) && indentOf(lines[j]) < st.indent) { end = j; break }
      if (j === (starts[k + 1]?.i ?? -1)) { end = j; break }
    }
    const seg = lines.slice(st.i, end)
    const keyIndent = st.indent + 2
    const keyLine = (j, key) => (j === 0 ? new RegExp(`^(\\s*)- ${key}:\\s*(.*)$`) : new RegExp(`^(\\s*)${key}:\\s*(.*)$`)).exec(seg[j])
    let runAt = -1
    let value = ''
    for (let j = 0; j < seg.length; j++) {
      const m = keyLine(j, 'run')
      if (m && (j === 0 || m[1].length === keyIndent)) { runAt = j; value = m[2]; break }
    }
    if (runAt < 0) return
    const continuation = []
    for (let j = runAt + 1; j < seg.length; j++) {
      if (seg[j].trim() === '' || indentOf(seg[j]) > keyIndent) continuation.push(seg[j])
      else break
    }
    let script
    if (/^[|>][+-]?\s*(#.*)?$/.test(value)) {
      // YAML strips the block's own indentation (the first content line's) before the shell sees the text; a heredoc's closing line only matches without it
      const first = continuation.find(l => l.trim() !== '')
      const base = first === undefined ? 0 : indentOf(first)
      script = continuation.map(l => l.slice(Math.min(base, indentOf(l)))).join('\n') // comment lines are removed by shellViews
    }
    else {
      // plain and quoted scalars fold their continuation lines into one line
      script = [value, ...continuation.map(l => l.trim())].filter(l => l !== '').join(' ')
      const q = /^(["'])([\s\S]*)\1\s*(#.*)?$/.exec(script)
      if (q) script = q[1] === '"' ? q[2].replace(/\\(["\\])/g, '$1') : q[2].replace(/''/g, "'")
    }
    const keyValue = key => {
      for (let j = 0; j < seg.length; j++) {
        const m = keyLine(j, key)
        if (!(m && (j === 0 || m[1].length === keyIndent))) continue
        let v = m[2].replace(/\s+#.*$/, '').trim()
        const q = /^(["'])(.*)\1$/.exec(v)
        if (q) v = q[2]
        return v
      }
      return null
    }
    steps.push({ line: st.i + runAt + 1, name: keyValue('name'), shell: keyValue('shell'), script })
  })
  return steps
}

/**
 * `undefined` if the step does not pipe into `tee`; otherwise what handles the left side's exit status: 'PIPESTATUS', 'pipefail', 'shell', or `null`: nothing.
 *
 * THE FAILURE IS A GREEN STEP OVER A FAILED SCRIPT. A step with no `shell:` runs `bash -e {0}`, with no pipefail, so in `node script | tee f` the
 * step's status is tee's. A script that throws leaves the step green, and whatever it should have written is whatever the last run left. Measured on a
 * real run (forecast-run.yml:62), reproduced offline on fable-issue-prefill.yml (2026-11-10), and present in nine of 337 steps on 2026-11-11 (three of
 * them fixed the same day, the other six by this check).
 *
 * WHAT IS TESTED IS TEXT, PER STEP, NOT PER PIPELINE: the step must contain PIPESTATUS, `set ... -o pipefail`, or an explicit `shell: bash` (which adds
 * -o pipefail) or a shell value that says pipefail, in code that is not a comment or a heredoc. It does not prove the guard reaches EVERY pipe of a step
 * that has two. `||` is not a pipe, `|&` is, a `sudo`/`command`/path prefix or a backslash-newline before `tee` is still tee, and `shell: bash -e {0}`
 * and `shell: sh` are not guards. `defaults.run.shell` is not read: a workflow that sets it writes `shell: bash` on the step or uses the convention.
 */
export const teePipeGuard = step => {
  const { code, bare } = shellViews(step.script)
  if (!/(?<!\|)\|&?[\s\\]*(?:(?:sudo|command|exec|env|time|nice|stdbuf)\s+(?:-\S+\s+)*)?(?:\S*\/)?tee\b/.test(bare)) return undefined
  if (/\bPIPESTATUS\b/.test(code)) return 'PIPESTATUS'
  if (/\bset\s+(?:[^\n;|&]*?\s)?-[A-Za-z]*o\s+pipefail\b/.test(code)) return 'pipefail'
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
check('no run step pipes into tee without PIPESTATUS, pipefail or an explicit bash shell', tee.unguarded.length === 0,
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

// The shapes review found (2026-11-11) that the first version got wrong, each with the reading that must now hold.
const pipeStep = (...lines) => ['- name: p', '  run: |', ...lines.map(l => '    ' + l)]
check('tee: an apostrophe in a TRAILING comment does not hide a real pipe',
  flagged(...pipeStep("echo ok # it's fine", 'node a.mjs | tee f', "echo 'done'")) === 1
    && flagged(...pipeStep('echo ok # say "hi', 'node a.mjs | tee f', 'echo "done"')) === 1,
  'a quote in a comment paired with a later quote and swallowed the pipe')
check('tee: heredoc prose with an apostrophe does not hide a real pipe, and a | tee INSIDE heredoc data is not a pipe',
  flagged(...pipeStep('cat > n.md <<EOF', "it's a note", 'EOF', 'node a.mjs | tee f', "echo 'x'")) === 1
    && flagged(...pipeStep('cat > n.md <<EOF', 'echo a | tee b', 'EOF')) === 0
    && flagged(...pipeStep('cat > n.md <<-"EOF"', '\techo a | tee b', '\tEOF', 'echo done')) === 0
    && flagged(...pipeStep('cat > n.md <<-"EOF"', '\techo a | tee b', '\tEOF', 'node a.mjs | tee f')) === 1
    && flagged(...pipeStep('cat <<< "a | tee b"')) === 0,
  'the heredoc reader is wrong')
check('tee: a pipe after a heredoc has closed is read, and a here-string (<<< "x" and <<<EOF) is not a heredoc',
  flagged(...pipeStep('cat <<< "x"', 'node a.mjs | tee f')) === 1 && flagged(...pipeStep('cat <<<EOF', 'node a.mjs | tee f')) === 1,
  'a here-string was read as a heredoc and swallowed the rest')
check('tee: a double-quoted, a single-quoted and a plain multi-line run scalar are read',
  flagged('- name: p', '  run: "node a.mjs | tee f"') === 1
    && flagged('- name: p', "  run: 'node a.mjs | tee f'") === 1
    && flagged('- name: p', '  run: node a.mjs', '    | tee f') === 1
    && flagged('- name: p', '  run: "node a.mjs | tee f; exit ${PIPESTATUS[0]}"') === 0,
  'a YAML scalar form hid the pipe')
check('tee: set -o errexit -o pipefail (long form) guards',
  flagged(...pipeStep('set -o errexit -o pipefail', 'node a.mjs | tee f')) === 0, 'the long form was not recognised')
check('tee: shell: "bash" (quoted) and shell: bash with trailing spaces guard',
  flagged('- name: p', '  shell: "bash"', '  run: node a.mjs | tee f') === 0 && flagged('- name: p', '  shell: bash   ', '  run: node a.mjs | tee f') === 0,
  'a quoted or padded bash shell was not recognised')
check('tee: | sudo tee, | /usr/bin/tee and a backslash-newline before tee are tee pipes',
  flagged('- name: p', '  run: node a.mjs | sudo tee f') === 1
    && flagged('- name: p', '  run: node a.mjs | /usr/bin/tee f') === 1
    && flagged(...pipeStep('node a.mjs |\\', '  tee f')) === 1,
  'a prefixed or split tee was missed')
check('tee: a CRLF workflow is read the same as an LF one',
  unguardedTeePipes(wf(...bare).replace(/\n/g, '\r\n')).length === 1, 'CRLF yielded no steps')
check('tee: a matrix include entry with a run: key is not a step, and the next job\'s keys are not this step\'s',
  unguardedTeePipes(['jobs:', '  a:', '    strategy:', '      matrix:', '        include:', '          - run: node a.mjs | tee f',
    '    steps:', '      - name: ok', '        run: echo hi'].join('\n') + '\n').length === 0
    && unguardedTeePipes(['jobs:', '  a:', '    steps:', '      - name: p', '        run: node a.mjs | tee f',
      '  b:', '    defaults:', '      run:', '        shell: bash'].join('\n') + '\n').length === 1,
  'a matrix entry was read as a step, or a later job bled into the last step')
check('tee: # inside ${#x} or $# is not a comment',
  flagged(...pipeStep('echo ${#x} $# | tee f')) === 1, 'a # that does not begin a word was read as a comment')
check('tee: an escaped quote inside a double-quoted string does not end it',
  flagged(...pipeStep('echo "a \\" | tee b"')) === 0 && flagged(...pipeStep('echo "a \\"" | tee b')) === 1,
  'a \\" was read as the end of the string')
check('tee: the guard is looked for in code only: PIPESTATUS inside a heredoc is not a guard',
  flagged(...pipeStep('cat > n.md <<EOF', 'exit ${PIPESTATUS[0]}', 'EOF', 'node a.mjs | tee f')) === 1, 'a heredoc body passed for a guard')

finish(summarize())

}
