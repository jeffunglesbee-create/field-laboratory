// BREAK-IT-ON-PURPOSE PROOF FOR THE GREEN-RUN SECTION of outbox/venue-us-bank-stadium-evidence-2026-11-09.mjs (Rule 90).
//
// WHY. The generator writes "Verified on the runner" into outbox/venue-us-bank-stadium-2026-11-09.md only if a chain of `must`
// assertions holds on the saved job list, the saved job log and git. An assertion that has only ever passed has proved nothing: it
// may be unable to match the input it is aimed at. Each case below edits ONE input in a COPY of the scratch directory, runs the
// generator on the copy, and expects a non-zero exit whose error message names the cause that case planted (a throw for another
// reason does not count as caught). The unedited copy is the control: it must exit 0 and print exactly the committed document.
//
// THE HARNESS CHECKS ITSELF. A case whose anchor does not occur exactly the declared number of times, or whose edit changed nothing,
// is reported BROKEN and fails the run: a mutation that was not applied would print "not caught" for the wrong reason.
//
// COVERAGE, printed at the end: the assertions this harness does not exercise are listed there, not left to be inferred from a green run.
//
// USAGE. node outbox/venue-us-bank-stadium-evidence-controls-2026-11-09.mjs <repo> <scratch>     (exit 0 only if the control holds and every case is caught)
//   <scratch> is the directory the generator's header describes.

import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const [repo, sp] = process.argv.slice(2)
if (!repo || !sp) { console.error('usage: node outbox/venue-us-bank-stadium-evidence-controls-2026-11-09.mjs <repo> <scratch>'); process.exit(2) }

const GEN_REL = 'outbox/venue-us-bank-stadium-evidence-2026-11-09.mjs'
const GEN = join(repo, GEN_REL)
const DOC = join(repo, 'outbox/venue-us-bank-stadium-2026-11-09.md')
const JOBS = 'jobs-42631741258.json'
const LOG = 'verify-42631741258-job.log'
const INPUTS = ['verify-failed.log', 'livecheck-42613880170.log', JOBS, LOG]
const count = (t, s) => t.split(s).length - 1

// edit = [file, anchor, replacement, declaredCount]
function run(edit) {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-controls-'))
  try {
    for (const f of INPUTS) copyFileSync(join(sp, f), join(dir, f))
    if (edit) {
      const [file, anchor, replacement, declared = 1] = edit
      const before = readFileSync(join(dir, file), 'utf8')
      const n = count(before, anchor)
      if (n !== declared) return { broken: `the anchor ${JSON.stringify(anchor)} occurs ${n} times in ${file}, declared ${declared}. Nothing was edited.` }
      writeFileSync(join(dir, file), before.split(anchor).join(replacement))
      if (readFileSync(join(dir, file), 'utf8') === before) return { broken: 'the edit left the file unchanged' }
    }
    const r = spawnSync('node', [GEN, repo, dir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return { status: r.status, out: r.stdout, err: r.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const firstError = err => (err.split('\n').find(l => /^Error: /.test(l)) ?? err.split('\n').find(l => l.trim()) ?? '(no message)').slice(0, 200)

const CASES = [
  ['the step concluded failure',                       [JOBS, '"name":"Render check against the LIVE slate","status":"completed","conclusion":"success"', '"name":"Render check against the LIVE slate","status":"completed","conclusion":"failure"'], 'is completed/failure, not completed/success'],
  ['the job ran another commit (5 job records)',       [JOBS, '"head_sha":"a18e26a', '"head_sha":"b18e26a', 5],                                                                      'not a18e26a'],
  ['the job belongs to another run (5 job records)',   [JOBS, '"run_id":42631741258', '"run_id":42631741259', 5],                                                                      'not 42631741258'],
  ['no job is named verify',                           [JOBS, '"name":"verify"', '"name":"verifx"'],                                                                                  'want exactly one job named verify, found 0'],
  ['no step has the name',                             [JOBS, '"name":"Render check against the LIVE slate"', '"name":"Render check against the live slate"'],                         'want exactly one step named'],
  ['the coverage line reads FAIL',                     [LOG, 'PASS  the venue table covers at least one venue on this slate', 'FAIL  the venue table covers at least one venue on this slate'], 'FAIL line(s)'],
  ['the coverage line is gone (not FAIL)',             [LOG, 'PASS  the venue table covers at least one venue on this slate', 'PASS  the venue table covers at least one venue on this slat'],  'want exactly one "PASS  the venue table covers'],
  ['the step marker line is changed',                  [LOG, '> node scripts/render-check.mjs --tolerate-unreachable', '> node scripts/render-check.mjs --tolerate-unreachable --x'],  'want exactly one line "> node scripts/render-check.mjs --tolerate-unreachable"'],
  ['the totals line reads 23/24',                      [LOG, '14:13:20.0089809Z 24/24 checks passed', '14:13:20.0089809Z 23/24 checks passed'],                                           'the totals line reads "23/24 checks passed"'],
  ['one PASS line stops being a PASS line',            [LOG, '14:13:20.0085522Z PASS  no page or console errors', '14:13:20.0085522Z ok    no page or console errors'],                    'but the step has 23 PASS lines'],
  ['the step was built from another commit',           [LOG, '14:13:20.0042470Z built from:    a18e26a', '14:13:20.0042470Z built from:    b18e26a'],                                     'does not name a18e26a'],
]

console.log(`generator: ${GEN_REL}`)
console.log(`scratch inputs copied per case: ${INPUTS.join(', ')}`)
console.log('')

let problems = 0

const control = run(null)
const committed = readFileSync(DOC, 'utf8')
const controlOk = control.status === 0 && control.out === committed
console.log(`${controlOk ? 'PASS' : 'FAIL'}  control: unedited inputs, exit ${control.status}, output ${control.out === committed ? 'equals' : 'DIFFERS FROM'} the committed document (${control.out?.length ?? 0} of ${committed.length} characters)`)
if (!controlOk) { problems++; console.log(`        ${firstError(control.err ?? '')}`) }

let caught = 0
for (const [name, edit, fragment] of CASES) {
  const r = run(edit)
  if (r.broken) { problems++; console.log(`BROKEN      ${name}: ${r.broken}`); continue }
  const msg = firstError(r.err)
  if (r.status !== 0 && msg.includes(fragment)) { caught++; console.log(`CAUGHT      ${name}\n              exit ${r.status}: ${msg}`) }
  else if (r.status !== 0) { problems++; console.log(`WRONG CAUSE ${name}\n              exit ${r.status}: ${msg}\n              wanted a message containing: ${fragment}`) }
  else { problems++; console.log(`NOT CAUGHT  ${name}  (exit 0: the generator printed a document from the doctored input)`) }
}

console.log('')
console.log(`${caught} of ${CASES.length} cases caught; control ${controlOk ? 'holds' : 'FAILS'}; ${problems} problem(s)`)
console.log('coverage: 11 edited inputs; 4 job-list assertions (job name, run id, head sha, step conclusion), 1 step-name assertion, 6 log assertions (marker, FAIL line,')
console.log('  coverage line, totals line, PASS count, built-from) are exercised. NOT exercised here: more than one verify job; more than one step of the name; no group header after')
console.log('  the step; a missing or unreadable git history for the range; a table-row diff other than the one U.S. Bank Stadium row; the decode-status, chip-line and')
console.log('  roof-caveat lines going missing (onlyOne). Those assertions exist in the generator and have not been made to fail.')
process.exitCode = problems === 0 && caught === CASES.length ? 0 : 1
