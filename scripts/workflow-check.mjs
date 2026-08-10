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
import { createChecks } from './checks.mjs'

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

/** A job builds if it runs the build, or invokes Fable directly. */
const jobBuilds = jobText =>
  /npm run build/.test(jobText) || /dotnet fable/.test(jobText)

/** A job has full history only with an explicit `fetch-depth: 0`. */
const jobHasFullHistory = jobText => /fetch-depth:\s*0\b/.test(jobText)

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
  }
  return { problems, jobCount }
}

const { problems, jobCount } = audit()
const { check, summarize } = createChecks()

console.log(`\nScanned ${jobCount} jobs across ${readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f)).length} workflows\n`)

check('at least one job was parsed', jobCount > 0,
  'the job splitter found nothing — the indentation assumption above is wrong')

check('no job runs a build-dependent script without building',
  problems.length === 0, problems.join('\n      → '))

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

process.exit(summarize() === 0 ? 0 : 1)
