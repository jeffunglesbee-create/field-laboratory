// The seven scripts/mutate-*.mjs and scripts/mutate-push-lands.py never write the tracked tree.
//
// WHY. Until 2026-11-05 each of them broke a tracked file IN PLACE, held the original only in memory, and wrote it back at the end. A SIGKILL between the two
// writes left the mutation in the file: `git status` showed ` M scripts/odds-coverage.mjs` after `mutate-odds-coverage.mjs` was killed inside a mutation window
// (measured 2026-11-05), nothing healed it, and the next run read the mutated file as clean source and reported "--self-test is already red on clean source".
// `mutate-replay-odds-coverage.mjs` also left a `.mutbak` beside it, and `mutate-push-lands.py` refused to start over the file it had stranded. They now break
// a COPY in a temp directory and only read the tracked file (docs/CC-CMD-2026-11-03-gate-hazard-residuals.md, Task 2). This check says so mechanically, so a
// later edit back to `writeFileSync(F, mutated)` is stopped at its first write instead of stranding the tree.
//
// HOW. Each script is run as it is, with a guard that REFUSES any write whose path is under <root>/scripts/ and logs every write. For the .mjs scripts the guard is
// a preload (NODE_OPTIONS --require) that wraps the fs write functions; for the .py script it is a sitecustomize.py (PYTHONPATH) that installs an audit hook. Both
// are inherited by the self-test processes the script starts. Five clauses per script:
//   1. it runs to the end and every mutation is caught                    (exit 0 and `N of N mutations caught`)
//   2. it prints `positive control: the unmutated copy passes`
//   3. it wrote nothing under scripts/                                    (no BLOCKED line in the log)
//   4. it wrote somewhere else, so clause 3 is not vacuous                (a WROTE line in the log)
//   5. a copy that cannot run stops the script with its FAIL line         (a second run, in which every --self-test started from outside the repo fails)
// Clause 5 is what makes clause 2 more than a printed sentence: without the control a copy that cannot run reads as every mutation caught.
//
// COVERAGE (Rule 91), printed with the verdict. The node guard wraps writeFileSync, appendFileSync, copyFileSync, renameSync, unlinkSync, rmSync and truncateSync
// with a string or Buffer path, and looks at the path that is WRITTEN: the destination of a copy, both ends of a rename. It does NOT see fs.promises, write
// streams, cpSync or mkdirSync into scripts/, openSync with a write flag, a URL path, or a shell-out. The python guard sees an open for writing (so write_text and
// shutil.copy) and the audit events os.rename (so os.replace and shutil.move), os.remove (so os.unlink), os.truncate and shutil.rmtree, on a path under scripts/.
// It does NOT see os.mkdir or os.rmdir, a remove relative to a directory descriptor, a file descriptor, chmod or utime, or a shell-out. rmtree has an event of its
// own because it deletes the files in a tree relative to a descriptor, which the remove event cannot place: without it the files go first and only the last rmdir is
// refused. Clause 4 is the check on an inert guard: a script that is seen writing nothing at all passes clause 3 for the wrong reason, so it fails clause 4.
//
// --self-test runs the same verdicts over stand-ins in a root of their own: a probe of each guard over every function it covers, a script that mutates in place,
// one that works on a copy, and copy-based ones that each lack exactly one thing. Each stand-in is pinned to the whole pattern of the five clauses (T = passes,
// F = fails), so a clause that is wired to the wrong fact, or that cannot fail, changes a pattern.
// --only NAME checks one script.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { createChecks, finish } from './checks.mjs'

const SCRIPTS = ['claim-check', 'deploy-gate', 'deploy-landed', 'odds-coverage', 'odds-shape-census', 'run-steps', 'replay-odds-coverage', 'push-lands']
const fileOf = name => (name === 'push-lands' ? 'scripts/mutate-push-lands.py' : `scripts/mutate-${name}.mjs`)
const WRITERS = ['writeFileSync', 'appendFileSync', 'copyFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'truncateSync']
const TIMEOUT_MS = 180000
const { check, summarize } = createChecks()

const work = mkdtempSync(join(tmpdir(), 'mutate-copy-'))
// The preload. The log is written with openSync/writeSync taken BEFORE the others are replaced: appendFileSync calls the patched writeFileSync, and the first
// version of this guard recursed on its own log line.
const guard = join(work, 'guard.cjs')
writeFileSync(guard, `
const fs = require('node:fs'), path = require('node:path')
const root = fs.realpathSync(process.env.MC_ROOT)
const tracked = path.join(root, 'scripts') + path.sep
const { openSync, writeSync, closeSync } = fs
const append = (file, line) => { const fd = openSync(file, 'a'); writeSync(fd, line); closeSync(fd) }
// A second run in which a copy cannot run: every --self-test started from outside the repo fails, as a broken copy would.
if (process.env.MC_RED_COPY && process.argv.includes('--self-test') && process.argv[1] && !path.resolve(process.argv[1]).startsWith(root + path.sep)) process.exit(1)
// Which arguments are paths that get written: a copy changes only its destination, a rename removes its source and writes its destination.
const written = { copyFileSync: [1], renameSync: [0, 1] }
for (const name of ${JSON.stringify(WRITERS)}) {
  const real = fs[name]
  fs[name] = function (...args) {
    const paths = (written[name] ?? [0]).map(i => path.resolve(String(args[i])))
    const hit = paths.find(abs => abs.startsWith(tracked))
    append(process.env.MC_LOG, (hit ? 'BLOCKED ' : 'WROTE ') + (hit ?? paths[0]) + '\\n')
    if (hit) throw Object.assign(new Error('EACCES: a mutate script wrote the tracked tree: ' + hit), { code: 'EACCES' })
    return real.apply(this, args)
  }
}
`)

// The same guard for python: an audit hook cannot be removed once it is installed, and it sees every way the interpreter opens, renames, removes or copies a file.
// An open is judged by its flags (a read of the tracked file is allowed); the log is written with os.open, which fires an open event of its own, hence `busy`.
const pyGuardDir = join(work, 'pyguard')
mkdirSync(pyGuardDir)
writeFileSync(join(pyGuardDir, 'sitecustomize.py'), String.raw`
import os, sys
root = os.path.realpath(os.environ['MC_ROOT'])
tracked = os.path.join(root, 'scripts') + os.sep
argv = sys.orig_argv
# A second run in which a copy cannot run: every --self-test started from outside the repo fails, as a broken copy would.
if os.environ.get('MC_RED_COPY') and '--self-test' in argv and len(argv) > 1 and not os.path.abspath(argv[1]).startswith(root + os.sep):
    os._exit(1)
WRITE = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC
# audit event -> the arguments that are paths being written
PATHS = {'os.rename': (0, 1), 'os.remove': (0,), 'os.truncate': (0,), 'shutil.rmtree': (0,)}
busy = False
def hook(event, args):
    global busy
    if busy:
        return
    if event == 'open':
        if not (isinstance(args[2], int) and args[2] & WRITE):
            return
        which = (0,)
    elif event in PATHS:
        which = PATHS[event]
    else:
        return
    paths = [os.path.abspath(os.fsdecode(args[i])) for i in which if not isinstance(args[i], int)]
    if not paths:
        return
    hit = next((p for p in paths if p.startswith(tracked)), None)
    busy = True
    try:
        fd = os.open(os.environ['MC_LOG'], os.O_WRONLY | os.O_APPEND | os.O_CREAT)
        os.write(fd, (('BLOCKED ' + hit) if hit else ('WROTE ' + paths[0])).encode() + b'\n')
        os.close(fd)
    finally:
        busy = False
    if hit:
        raise PermissionError(13, 'a mutate script wrote the tracked tree', hit)
sys.addaudithook(hook)
`)

/** How to start a script under its guard. */
const launch = file => (file.endsWith('.py')
  ? { cmd: 'python3', env: { PYTHONPATH: [pyGuardDir, process.env.PYTHONPATH].filter(Boolean).join(delimiter), PYTHONDONTWRITEBYTECODE: '1' } }
  : { cmd: process.execPath, env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(guard)}`.trim() } })

let seq = 0
/** One run of a script from `root` under the guard: what it printed, how it ended and what it tried to write. */
const run = (file, root, redCopy) => {
  const log = join(work, `run-${seq++}.log`)
  writeFileSync(log, '')
  const { cmd, env } = launch(file)
  const r = spawnSync(cmd, [file], {
    cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
    env: { ...process.env, ...env, MC_LOG: log, MC_ROOT: realpathSync(root), MC_RED_COPY: redCopy ? '1' : '' },
  })
  const out = r.stdout ?? ''
  const lines = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  const blocked = lines.filter(l => l.startsWith('BLOCKED '))
  const tally = /(\d+) of (\d+) mutations caught/.exec(out)
  const crash = (r.stderr ?? '').split('\n').findLast(l => /^\w*Error: /.test(l)) ?? ''
  return {
    out, lines, blocked, tally, status: r.status,
    detail: `exit ${r.status}; ${tally ? tally[0] : 'no tally'}${blocked.length ? `; ${blocked.length} write(s) refused, first: ${blocked[0]}` : ''}${crash ? `; ${crash.slice(0, 160)}` : ''}`,
  }
}

/** The five facts about a mutate script. */
const evaluate = (file, root) => {
  const a = run(file, root, false)
  const b = run(file, root, true)
  return {
    completes: a.status === 0 && Boolean(a.tally) && a.tally[1] === a.tally[2],
    controlled: /^positive control: the unmutated copy passes$/m.test(a.out),
    cleanTree: a.blocked.length === 0,
    wroteElsewhere: a.lines.some(l => l.startsWith('WROTE ')),
    refusesRedCopy: b.status === 1 && /UNMUTATED/.test(b.out),
    caught: a.tally ? Number(a.tally[1]) : 0,
    total: a.tally ? Number(a.tally[2]) : 0,
    detail: a.detail,
    redDetail: `second run, every copy made red: ${b.detail}`,
  }
}

/** The five clauses, in this order. `say` is `check`, or in the self-test a recorder that turns them into a pattern. */
const verdict = (label, e, say = check) => {
  say(`${label}: runs to the end and every mutation is caught`, e.completes, e.detail)
  say(`${label}: prints the positive control`, e.controlled, e.detail)
  say(`${label}: a copy that cannot run stops it (the control is enforced, not only printed)`, e.refusesRedCopy, e.redDetail)
  say(`${label}: writes nothing under scripts/ that its guard can see (the coverage is printed at the end)`, e.cleanTree, e.detail)
  say(`${label}: wrote somewhere else, so the clause above is not vacuous`, e.wroteElsewhere, e.detail)
}
const pattern = e => { const out = []; verdict('', e, (_name, ok) => out.push(ok ? 'T' : 'F')); return out.join('') }

const variant = (source, from, to) => {
  if (!source.includes(from)) throw new Error(`stand-in anchor not found: ${from.slice(0, 60)}`)
  return source.replace(from, () => to)
}

const selfTest = () => {
  // A root of its own: scripts/target.mjs is the tracked file, and it exits 0 under --self-test, as a real target does.
  const root = mkdtempSync(join(tmpdir(), 'mutate-copy-root-'))
  try {
    mkdirSync(join(root, 'scripts'))
    // What a fixture holds now, or null if it is gone: a guard that lets a remove through must fail a clause, not crash the check on the read.
    const tracked = name => { try { return readFileSync(join(root, 'scripts', name), 'utf8') } catch { return null } }
    const TRACKED = '// tracked\n'
    writeFileSync(join(root, 'scripts', 'target.mjs'), TRACKED)
    writeFileSync(join(root, 'scripts', 'other.mjs'), '// other\n')
    // ...and the same for python: a target that exits 0 under --self-test, a second file, and a directory to remove.
    writeFileSync(join(root, 'scripts', 'target.py'), '# tracked\n')
    writeFileSync(join(root, 'scripts', 'other.py'), '# other\n')
    mkdirSync(join(root, 'scripts', 'sub'))
    writeFileSync(join(root, 'scripts', 'sub', 'x.py'), '# x\n')

    // The oracle for the guard, written out here and not taken from WRITERS: a function dropped from the guard must still be probed. Every one is aimed at a tracked
    // path as the thing written ('@away' is a file outside the root). Then what the guard must let through: a write elsewhere, and a copy that only READS the tracked file.
    const PROBED = {
      writeFileSync: ['scripts/target.mjs', 'x'], appendFileSync: ['scripts/target.mjs', 'x'], copyFileSync: ['@away', 'scripts/target.mjs'], renameSync: ['@away', 'scripts/target.mjs'],
      unlinkSync: ['scripts/target.mjs'], rmSync: ['scripts/target.mjs'], truncateSync: ['scripts/target.mjs'],
    }
    writeFileSync(join(root, 'probe.mjs'), `import fs from 'node:fs'
import { join } from 'node:path'
const dir = fs.mkdtempSync(join(process.cwd(), 'probe-'))
const away = join(dir, 'away')
fs.writeFileSync(away, 'x')
const attempt = (label, name, args) => { try { fs[name](...args.map(a => (a === '@away' ? away : a))); console.log(label + ': written') } catch (e) { console.log(label + ': ' + e.code) } }
for (const [name, args] of Object.entries(${JSON.stringify(PROBED)})) attempt(name, name, args)
attempt('renameOut', 'renameSync', ['scripts/other.mjs', join(dir, 'gone')])
attempt('copyOut', 'copyFileSync', ['scripts/other.mjs', join(dir, 'copy')])
attempt('elsewhere', 'writeFileSync', [join(dir, 'x'), 'x'])
`)
    writeFileSync(join(root, 'in-place.mjs'), "import { writeFileSync } from 'node:fs'\nwriteFileSync('scripts/target.mjs', 'mutated')\nconsole.log('positive control: the unmutated copy passes')\nconsole.log('1 of 1 mutations caught.')\n")
    const ON_A_COPY = `import { writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const TMP = mkdtempSync(join(tmpdir(), 'sf-'))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
const COPY = join(TMP, 'scripts', 'target.mjs')
const passes = () => { try { execFileSync(process.execPath, [COPY, '--self-test'], { stdio: 'pipe' }); return true } catch { return false } }
if (!passes()) { console.log('FAIL — the UNMUTATED copy is red'); process.exit(1) }
console.log('positive control: the unmutated copy passes')
writeFileSync(COPY, 'mutated')
console.log('1 of 1 mutations caught.')
`
    const PY_ON_A_COPY = `import pathlib, shutil, subprocess, sys, tempfile
with tempfile.TemporaryDirectory(prefix='sf-') as td:
    copy = pathlib.Path(td) / 'target.py'
    shutil.copyfile('scripts/target.py', copy)
    if subprocess.run([sys.executable, str(copy), '--self-test'], capture_output=True).returncode != 0:
        print('FAIL — the UNMUTATED copy is red')
        sys.exit(1)
    print('positive control: the unmutated copy passes')
    copy.write_text('mutated')
    print('1 of 1 mutations caught.')
`
    const CONTROL = "if (!passes()) { console.log('FAIL — the UNMUTATED copy is red'); process.exit(1) }\n"
    const PRINT = "console.log('positive control: the unmutated copy passes')\n"
    const WRITE = "writeFileSync(COPY, 'mutated')\n"
    // Each copy-based stand-in lacks exactly one thing, so exactly one clause may fail.
    const STAND_INS = [
      ['on-a-copy.py', PY_ON_A_COPY, 'TTTTT', 'A PYTHON STAND-IN THAT WORKS ON A COPY, PROVES IT FIRST AND STOPS ON A BROKEN COPY PASSES ALL FIVE CLAUSES'],
      ['on-a-copy.mjs', ON_A_COPY, 'TTTTT', 'A STAND-IN THAT WORKS ON A COPY, PROVES IT FIRST AND STOPS ON A BROKEN COPY PASSES ALL FIVE CLAUSES'],
      ['misses.mjs', variant(ON_A_COPY, '1 of 1', '1 of 2'), 'FTTTT', 'A COPY-BASED STAND-IN THAT PRINTS 1 of 2 FAILS ONLY THE COMPLETION CLAUSE'],
      ['unannounced.mjs', variant(ON_A_COPY, PRINT, ''), 'TFTTT', 'A COPY-BASED STAND-IN THAT NEVER PRINTS THE POSITIVE CONTROL FAILS ONLY THE PRINT CLAUSE'],
      ['print-only.mjs', variant(ON_A_COPY, CONTROL, ''), 'TTFTT', 'A COPY-BASED STAND-IN THAT PRINTS THE POSITIVE CONTROL WITHOUT RUNNING IT FAILS ONLY THE ENFORCEMENT CLAUSE (it would read as every mutation caught on a broken copy)'],
      ['reports-and-goes-on.mjs', variant(ON_A_COPY, CONTROL, "if (!passes()) console.log('FAIL — the UNMUTATED copy is red')\n"), 'TTFTT', 'A STAND-IN THAT SAYS THE COPY IS RED AND CARRIES ON FAILS ONLY THE ENFORCEMENT CLAUSE (the exit status)'],
      ['stops-silently.mjs', variant(ON_A_COPY, CONTROL, 'if (!passes()) process.exit(1)\n'), 'TTFTT', 'A STAND-IN THAT STOPS ON A RED COPY WITHOUT SAYING WHY FAILS ONLY THE ENFORCEMENT CLAUSE (the FAIL line)'],
      ['tracked-write-swallowed.mjs', variant(ON_A_COPY, WRITE, WRITE + "try { writeFileSync('scripts/target.mjs', 'x') } catch {}\n"), 'TTTFT', 'A COPY-BASED STAND-IN THAT TRIES TO WRITE THE TRACKED FILE AND SWALLOWS THE REFUSAL FAILS ONLY THE TRACKED-TREE CLAUSE'],
      // No write and no guarded cleanup either (the exit handler's rmSync is a logged write): to the guard this script does nothing, which is what an inert guard looks like.
      ['writes-nothing.mjs', variant(variant(ON_A_COPY, WRITE, ''), "rmSync(TMP, { recursive: true, force: true })", "execFileSync('rm', ['-rf', TMP])"), 'TTTTF', 'A COPY-BASED STAND-IN THAT THE GUARD SEES WRITING NOTHING FAILS ONLY THE WROTE-ELSEWHERE CLAUSE'],
    ]
    for (const [file, source] of STAND_INS) writeFileSync(join(root, file), source)

    // The same for python. Each label is one way to write: an open for writing three ways, a rename onto, a remove, a truncate, a copy onto and a tree removal. The tree
    // removal must be refused BEFORE it deletes the file inside it, so the clause below also asks that scripts/sub/x.py is still there.
    const PROBED_PY = ['open-w', 'open-a', 'write_text', 'rename', 'remove', 'truncate', 'copyfile', 'rmtree']
    writeFileSync(join(root, 'probe.py'), `import os, pathlib, shutil, tempfile
dir = tempfile.mkdtemp(dir=os.getcwd(), prefix='probe-')
away = os.path.join(dir, 'away')
open(away, 'w').close()
def attempt(label, fn):
    try:
        fn()
        print(label + ': written')
    except PermissionError:
        print(label + ': EACCES')
    except Exception as e:
        print(label + ': ' + type(e).__name__)
attempt('open-w', lambda: open('scripts/target.py', 'w').close())
attempt('open-a', lambda: open('scripts/target.py', 'a').close())
attempt('write_text', lambda: pathlib.Path('scripts/target.py').write_text('x'))
attempt('rename', lambda: os.rename(away, 'scripts/target.py'))
attempt('remove', lambda: os.remove('scripts/target.py'))
attempt('truncate', lambda: os.truncate('scripts/target.py', 0))
attempt('copyfile', lambda: shutil.copyfile(away, 'scripts/target.py'))
attempt('rmtree', lambda: shutil.rmtree('scripts/sub'))
attempt('renameOut', lambda: os.rename('scripts/other.py', os.path.join(dir, 'gone')))
attempt('copyOut', lambda: shutil.copyfile('scripts/other.py', os.path.join(dir, 'copy')))
attempt('read', lambda: open('scripts/target.py').read())
attempt('elsewhere', lambda: open(os.path.join(dir, 'x'), 'w').close())
`)
    writeFileSync(join(root, 'in-place.py'), "import pathlib\npathlib.Path('scripts/target.py').write_text('mutated')\nprint('positive control: the unmutated copy passes')\nprint('1 of 1 mutations caught.')\n")

    const probe = run('probe.mjs', root, false)
    const probed = Object.keys(PROBED)
    const refused = probed.filter(w => probe.out.includes(`${w}: EACCES\n`))
    check(`THE NODE GUARD REFUSES EACH OF THE ${probed.length} WRITE FUNCTIONS ON A TRACKED PATH (a copy by its destination, a rename by either end), ALLOWS A WRITE ELSEWHERE AND A COPY THAT ONLY READS THE TRACKED FILE, AND LOGS BOTH`,
      refused.length === probed.length && probe.out.includes('renameOut: EACCES\n') && probe.out.includes('copyOut: written\n') && probe.out.includes('elsewhere: written\n') &&
      probe.blocked.length === probed.length + 1 && probe.lines.some(l => l.startsWith('WROTE ')) && tracked('target.mjs') === TRACKED,
      `refused ${refused.length} of ${probed.length}: ${refused.join(',')}; logged ${probe.blocked.length} refusals; ${probe.out.replace(/\n/g, ' | ')}`)

    const pyProbe = run('probe.py', root, false)
    const pyRefused = PROBED_PY.filter(w => pyProbe.out.includes(`${w}: EACCES\n`))
    check(`THE PYTHON GUARD REFUSES EACH OF THE ${PROBED_PY.length} WAYS TO WRITE A TRACKED PATH (a rename by either end), ALLOWS A READ, A WRITE ELSEWHERE AND A COPY THAT ONLY READS THE TRACKED FILE, AND LOGS BOTH`,
      pyRefused.length === PROBED_PY.length && ['renameOut: EACCES', 'copyOut: written', 'read: written', 'elsewhere: written'].every(l => pyProbe.out.includes(`${l}\n`)) &&
      pyProbe.blocked.length === PROBED_PY.length + 1 && pyProbe.lines.some(l => l.startsWith('WROTE ')) && tracked('target.py') === '# tracked\n' && existsSync(join(root, 'scripts', 'sub', 'x.py')),
      `refused ${pyRefused.length} of ${PROBED_PY.length}: ${pyRefused.join(',')}; logged ${pyProbe.blocked.length} refusals; ${pyProbe.out.replace(/\n/g, ' | ')}`)

    const inPlace = evaluate('in-place.mjs', root)
    check('A STAND-IN THAT MUTATES IN PLACE FAILS ALL FIVE CLAUSES (the guard stopped it at its first write), and its tracked file is byte-identical',
      pattern(inPlace) === 'FFFFF' && tracked('target.mjs') === TRACKED, `${pattern(inPlace)} ${JSON.stringify(inPlace)}`)
    const pyInPlace = evaluate('in-place.py', root)
    check('A PYTHON STAND-IN THAT MUTATES IN PLACE FAILS ALL FIVE CLAUSES (the guard stopped it at its first write), and its tracked file is byte-identical',
      pattern(pyInPlace) === 'FFFFF' && tracked('target.py') === '# tracked\n', `${pattern(pyInPlace)} ${JSON.stringify(pyInPlace)}`)
    for (const [file, , want, label] of STAND_INS) {
      const e = evaluate(file, root)
      check(`${label}`, pattern(e) === want, `wanted ${want}, got ${pattern(e)} ${JSON.stringify(e)}`)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

try {
  if (process.argv.includes('--self-test')) {
    selfTest()
  } else {
    const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
    const names = process.argv.includes('--only') ? SCRIPTS.filter(n => n === only) : SCRIPTS
    check('there are scripts to check', names.length > 0, `--only ${only} names none of: ${SCRIPTS.join(', ')}`)
    let caught = 0, total = 0
    for (const n of names) {
      const e = evaluate(fileOf(n), process.cwd())
      verdict(n, e)
      caught += e.caught
      total += e.total
    }
    console.log(`\nchecked ${names.length} of ${SCRIPTS.length} mutate scripts; ${caught} of ${total} mutations caught inside them`)
    console.log(`COVERAGE: the node guard wraps ${WRITERS.join(', ')} (string or Buffer path) under scripts/.`)
    console.log('It does NOT see fs.promises, write streams, cpSync or mkdirSync into scripts/, openSync with a write flag, a URL path, or a shell-out.')
    console.log('The python guard sees an open for writing, os.rename, os.remove, os.truncate and shutil.rmtree; not os.mkdir, os.rmdir, a remove relative to a directory descriptor, chmod, utime, a file descriptor, or a shell-out.\n')
  }
} finally { rmSync(work, { recursive: true, force: true }) }
finish(summarize())
