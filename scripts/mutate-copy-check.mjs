// The seven scripts/mutate-*.mjs and scripts/mutate-push-lands.py never write the tracked tree.
//
// WHY. Until 2026-11-05 each of them broke a tracked file IN PLACE, held the original only in memory, and wrote it back at the end. A SIGKILL between the two
// writes left the mutation in the file: `git status` showed ` M scripts/odds-coverage.mjs` after `mutate-odds-coverage.mjs` was killed inside a mutation window
// (measured 2026-11-05), nothing healed it, and the next run read the mutated file as clean source and reported "--self-test is already red on clean source".
// `mutate-replay-odds-coverage.mjs` also left a `.mutbak` beside it, and `mutate-push-lands.py` refused to start over the file it had stranded. They now break
// a COPY in a temp directory and only read the tracked file (docs/CC-CMD-2026-11-03-gate-hazard-residuals.md, Task 2). This check says so mechanically, so a
// later edit back to `writeFileSync(F, mutated)` is stopped at its first write instead of stranding the tree.
//
// HOW. Each script is run as it is, with $TMPDIR reached through a SYMLINK to a directory of its own (macOS's is: /var is a link), and with a guard that REFUSES any
// write whose path is under <root>/scripts/ and logs every write. For the .mjs scripts the guard is a preload (NODE_OPTIONS --require) that wraps the fs write
// functions; for the .py script it is a sitecustomize.py (PYTHONPATH) that installs an audit hook. Both are inherited by the self-test processes the script starts.
// "Under scripts/" includes scripts/ itself: moving or removing the directory is how a script would swap in a whole mutated tree and put the original back.
// Seven clauses per script, in the order they print:
//   1. it runs to the end and every mutation is caught                    (exit 0 and `N of N mutations caught`, with $TMPDIR behind the symlink)
//   2. it prints `positive control: the unmutated copy passes`
//   3. a copy that cannot run stops the script with its FAIL line         (a second run, in which every --self-test started from outside the repo exits 1)
//   4. so does a copy whose self-test never ran                           (a third run, in which every one of them exits 0 and prints nothing)
//   5. it wrote nothing under scripts/                                    (no BLOCKED line in the log)
//   6. it wrote somewhere else, so clause 5 is not vacuous                (a WROTE line in the log)
//   7. it removes its temporary copy when it ends                         (a write under $TMPDIR was logged, and $TMPDIR is empty after each of the three runs)
// Clause 3 is what makes clause 2 more than a printed sentence: without the control a copy that cannot run reads as every mutation caught. Clause 4 is the same for a copy
// that exits 0 without running. A copy reached through a symlinked path is not the entry point of its own file, so the isMain block of the file it copies is skipped and
// an exit status cannot tell that from a pass: with $TMPDIR behind a symlink six of the seven .mjs scripts printed the control line and then NOT CAUGHT for every
// mutation (reproduced 2026-11-05). The scripts now resolve their temporary directory, and clause 1 under the symlink is what holds them to it.
// Clause 7 exists because deleting the exit handler that removes the copy left every other clause green and leaked a 3.4 MB directory per run (reproduced 2026-11-05); a
// run with no logged write under $TMPDIR fails it, so a script that keeps its copy somewhere else cannot pass it by leaving $TMPDIR empty.
//
// COVERAGE (Rule 91), printed with the verdict. The node guard wraps writeFileSync, appendFileSync, copyFileSync, renameSync, unlinkSync, rmSync and truncateSync with a
// string or Buffer path, and looks at the path that is WRITTEN: the destination of a copy, both ends of a rename; scripts/ itself counts. The python guard sees an open for
// writing (so write_text and shutil.copy) and the audit events os.rename (so os.replace and shutil.move), os.remove (so os.unlink), os.truncate and shutil.rmtree. rmtree has
// an event of its own because it deletes the files in a tree relative to a descriptor, which the remove event cannot place: without it the files go first and only the last
// rmdir is refused. What neither guard sees is the data in UNSEEN_NODE and UNSEEN_PY, printed with the verdict and PROVED by --self-test, which attempts every listed form on a
// fresh fixture and requires each to succeed: the printed list cannot go on saying a form is unseen after a guard has learned it, and what is printed is built from the same
// data. cpSync is in neither list on purpose: on Node v22.22.0 (measured 2026-11-05) a file copy into scripts/ is refused only because cpSync calls the wrapped copyFileSync,
// and a directory copy is not seen, so which of the two a Node does is not something this check promises. The directory itself is probed empty, so that no refused write inside
// it can be what stops the rename or the removal. Clause 6 is the check on an inert guard: a script that is seen writing nothing at all passes clause 5 for the wrong reason, so
// it fails clause 6.
//
// --self-test runs the same verdicts over stand-ins in a root of their own: a probe of each guard over every function it covers, a script that mutates in place,
// one that works on a copy, and copy-based ones that each lack one thing. Each stand-in is pinned to the whole pattern of the seven clauses (T = passes, F = fails), so a
// clause that is wired to the wrong fact, or that cannot fail, changes a pattern.
// --only NAME checks one script.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync, symlinkSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, delimiter, sep } from 'node:path'
import { createChecks, finish } from './checks.mjs'

const SCRIPTS = ['claim-check', 'deploy-gate', 'deploy-landed', 'odds-coverage', 'odds-shape-census', 'run-steps', 'replay-odds-coverage', 'push-lands']
const fileOf = name => (name === 'push-lands' ? 'scripts/mutate-push-lands.py' : `scripts/mutate-${name}.mjs`)
const WRITERS = ['writeFileSync', 'appendFileSync', 'copyFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'truncateSync']
const TIMEOUT_MS = 180000

// What neither guard sees: [key, what the verdict prints, the attempt]. --self-test runs every attempt on a fresh fixture (the files named are made for it) and requires it to
// SUCCEED, and the verdict prints the second column, so the text cannot drift from the proof. A node attempt runs inside an async function with fs, path, pathToFileURL and
// execFileSync in scope and cb(done => ...) for the callback forms; a python attempt is the body of a function with os and subprocess in scope.
const CB_FORMS = 'the callback forms of those seven (fs.writeFile, fs.appendFile, fs.copyFile, fs.rename, fs.unlink, fs.rm, fs.truncate)'
const UNSEEN_NODE = [
  ['writeFile-cb', CB_FORMS, "await cb(done => fs.writeFile('scripts/w-cb', 'x', done))"],
  ['appendFile-cb', CB_FORMS, "await cb(done => fs.appendFile('scripts/w-cb2', 'x', done))"],
  ['copyFile-cb', CB_FORMS, "await cb(done => fs.copyFile('other/o1', 'scripts/copied-cb', done))"],
  ['rename-cb', CB_FORMS, "await cb(done => fs.rename('other/o2', 'scripts/renamed-cb', done))"],
  ['unlink-cb', CB_FORMS, "await cb(done => fs.unlink('scripts/del-cb', done))"],
  ['rm-cb', CB_FORMS, "await cb(done => fs.rm('scripts/rm-cb-dir', { recursive: true }, done))"],
  ['truncate-cb', CB_FORMS, "await cb(done => fs.truncate('scripts/trunc-cb', 0, done))"],
  ['promises', 'fs.promises', "await fs.promises.writeFile('scripts/w-promise', 'x')"],
  ['stream', 'write streams (fs.createWriteStream)', "await new Promise((ok, no) => { const s = fs.createWriteStream('scripts/w-stream'); s.on('error', no); s.on('close', ok); s.end('x') })"],
  ['openSync-w', 'openSync with a write flag, and the writeSync on its descriptor', "const fd = fs.openSync('scripts/w-fd', 'w'); fs.writeSync(fd, 'x'); fs.closeSync(fd)"],
  ['mkdirSync', 'mkdirSync, mkdtempSync and rmdirSync of a directory under scripts/', "fs.mkdirSync('scripts/new-dir')"],
  ['mkdtempSync', 'mkdirSync, mkdtempSync and rmdirSync of a directory under scripts/', "fs.mkdtempSync('scripts/tmp-')"],
  ['rmdirSync', 'mkdirSync, mkdtempSync and rmdirSync of a directory under scripts/', "fs.rmdirSync('scripts/empty-dir')"],
  ['symlinkSync', 'symlinkSync and linkSync into scripts/', "fs.symlinkSync('other/o3', 'scripts/sym')"],
  ['linkSync', 'symlinkSync and linkSync into scripts/', "fs.linkSync('other/o4', 'scripts/hard')"],
  ['chmodSync', 'chmodSync and utimesSync', "fs.chmodSync('scripts/mode', 0o600)"],
  ['utimesSync', 'chmodSync and utimesSync', "fs.utimesSync('scripts/stamp', 1, 1)"],
  ['url', 'a URL path', "fs.writeFileSync(pathToFileURL(path.resolve('scripts/w-url')), 'x')"],
  ['symlinked-dir', 'a path that reaches scripts/ through a symlinked directory', "fs.writeFileSync('other/via/w-via', 'x')"],
  ['shell-out', 'a shell-out', "execFileSync('sh', ['-c', 'echo x > scripts/w-sh'])"],
]
const UNSEEN_PY = [
  ['os.symlink', 'os.symlink and os.link into scripts/', "os.symlink('../other/o3', 'scripts/sym')"],
  ['os.link', 'os.symlink and os.link into scripts/', "os.link('other/o4', 'scripts/hard')"],
  ['os.mkdir', 'os.mkdir and os.rmdir of a directory under scripts/', "os.mkdir('scripts/new-dir')"],
  ['os.rmdir', 'os.mkdir and os.rmdir of a directory under scripts/', "os.rmdir('scripts/empty-dir')"],
  ['os.chmod', 'os.chmod and os.utime', "os.chmod('scripts/mode', 0o600)"],
  ['os.utime', 'os.chmod and os.utime', "os.utime('scripts/stamp', (1, 1))"],
  ['open-dir_fd', 'an open or a remove relative to a directory descriptor (dir_fd)', "dfd = os.open('scripts', os.O_RDONLY); fd = os.open('w-dirfd', os.O_WRONLY | os.O_CREAT, dir_fd=dfd); os.write(fd, b'x'); os.close(fd); os.close(dfd)"],
  ['remove-dir_fd', 'an open or a remove relative to a directory descriptor (dir_fd)', "dfd = os.open('scripts', os.O_RDONLY); os.remove('del-dirfd', dir_fd=dfd); os.close(dfd)"],
  ['symlinked-dir', 'a path that reaches scripts/ through a symlinked directory', "open('other/via/w-via', 'w').close()"],
  ['shell-out', 'a shell-out', "subprocess.run(['sh', '-c', 'echo x > scripts/w-sh'], check=True)"],
]
const labelsOf = list => [...new Set(list.map(e => e[1]))]
/** The test of a list against one probe: every listed form was attempted and succeeded, and the guard logged no refusal. */
const listIsTrue = (probe, list) => list.every(([key]) => probe.out.includes(`${key}: written\n`)) && probe.blocked.length === 0
/** What is printed after the verdict. */
const coverageLines = () => [
  `COVERAGE: the node guard wraps ${WRITERS.join(', ')} (string or Buffer path) on scripts/ itself and under it.`,
  `It does NOT see: ${labelsOf(UNSEEN_NODE).join('; ')}. --self-test attempts ${UNSEEN_NODE.length} forms under those statements, each on a fresh fixture, and requires every one to succeed.`,
  'cpSync is in neither list: on Node v22.22.0 (measured 2026-11-05) a file copy into scripts/ is refused only because cpSync calls the wrapped copyFileSync, and a directory copy is not seen; which of the two a Node does is not promised.',
  'The python guard sees an open for writing, os.rename, os.remove, os.truncate and shutil.rmtree, on scripts/ itself and under it.',
  `It does NOT see: ${labelsOf(UNSEEN_PY).join('; ')}. --self-test attempts ${UNSEEN_PY.length} forms under those statements, each on a fresh fixture, and requires every one to succeed.`,
]
const { check, summarize } = createChecks()

const work = mkdtempSync(join(tmpdir(), 'mutate-copy-'))
// The preload. The log is written with openSync/writeSync taken BEFORE the others are replaced: appendFileSync calls the patched writeFileSync, and the first
// version of this guard recursed on its own log line.
const guard = join(work, 'guard.cjs')
writeFileSync(guard, `
const fs = require('node:fs'), path = require('node:path')
const root = fs.realpathSync(process.env.MC_ROOT)
const tracked = path.join(root, 'scripts') + path.sep
const under = abs => abs.startsWith(tracked) || abs + path.sep === tracked
const { openSync, writeSync, closeSync } = fs
const append = (file, line) => { const fd = openSync(file, 'a'); writeSync(fd, line); closeSync(fd) }
// A second and a third run in which a copy cannot run: every --self-test started from outside the repo exits 1, as a broken copy would, or exits 0 saying nothing, as a
// copy does that is not its own entry point.
const fault = process.env.MC_COPY_FAULT
if (fault && process.argv.includes('--self-test') && process.argv[1] && !path.resolve(process.argv[1]).startsWith(root + path.sep)) process.exit(fault === 'silent' ? 0 : 1)
// Which arguments are paths that get written: a copy changes only its destination, a rename removes its source and writes its destination.
const written = { copyFileSync: [1], renameSync: [0, 1] }
for (const name of ${JSON.stringify(WRITERS)}) {
  const real = fs[name]
  fs[name] = function (...args) {
    const paths = (written[name] ?? [0]).map(i => path.resolve(String(args[i])))
    const hit = paths.find(under)
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
def under(p):
    return p.startswith(tracked) or p + os.sep == tracked
argv = sys.orig_argv
# A second and a third run in which a copy cannot run: every --self-test started from outside the repo exits 1, as a broken copy would, or exits 0 saying nothing.
fault = os.environ.get('MC_COPY_FAULT')
if fault and '--self-test' in argv and len(argv) > 1 and not os.path.abspath(argv[1]).startswith(root + os.sep):
    os._exit(0 if fault == 'silent' else 1)
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
    hit = next((p for p in paths if under(p)), None)
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
/** One run of a script from `root` under the guard: what it printed, how it ended and what it tried to write. `fault` is '' for a plain run, 'red' when every copy's
 *  self-test exits 1 and 'silent' when every copy's self-test exits 0 saying nothing. $TMPDIR is a symlink to a directory of this run's own. */
const run = (file, root, fault = '') => {
  const n = seq++
  const log = join(work, `run-${n}.log`)
  writeFileSync(log, '')
  const tmp = realpathSync(mkdtempSync(join(work, 'tmp-')))
  const link = join(work, `tmp-link-${n}`)
  symlinkSync(tmp, link)
  const { cmd, env } = launch(file)
  const r = spawnSync(cmd, [file], {
    cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
    env: { ...process.env, ...env, MC_LOG: log, MC_ROOT: realpathSync(root), MC_COPY_FAULT: fault, TMPDIR: link },
  })
  const out = r.stdout ?? ''
  const lines = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  const blocked = lines.filter(l => l.startsWith('BLOCKED '))
  const tally = /(\d+) of (\d+) mutations caught/.exec(out)
  const crash = (r.stderr ?? '').split('\n').findLast(l => /^\w*Error: /.test(l)) ?? ''
  // What the script left in its $TMPDIR, and whether the guard saw it write there at all (a script that keeps its copy elsewhere leaves $TMPDIR empty for the wrong reason).
  const leftover = readdirSync(tmp)
  const usedTmp = lines.some(l => [tmp, link].some(d => l.startsWith(`WROTE ${d}${sep}`)))
  return {
    out, lines, blocked, tally, status: r.status, leftover, usedTmp,
    detail: `exit ${r.status}; ${tally ? tally[0] : 'no tally'}${blocked.length ? `; ${blocked.length} write(s) refused, first: ${blocked[0]}` : ''}${crash ? `; ${crash.slice(0, 160)}` : ''}`,
  }
}

/** The seven facts about a mutate script. */
const evaluate = (file, root) => {
  const a = run(file, root)
  const b = run(file, root, 'red')
  const c = run(file, root, 'silent')
  return {
    completes: a.status === 0 && Boolean(a.tally) && a.tally[1] === a.tally[2],
    controlled: /^positive control: the unmutated copy passes$/m.test(a.out),
    refusesRedCopy: b.status === 1 && /UNMUTATED/.test(b.out),
    refusesSilentCopy: c.status === 1 && /UNMUTATED/.test(c.out),
    cleanTree: a.blocked.length === 0,
    wroteElsewhere: a.lines.some(l => l.startsWith('WROTE ')),
    cleansUp: a.usedTmp && [a, b, c].every(r => r.leftover.length === 0),
    caught: a.tally ? Number(a.tally[1]) : 0,
    total: a.tally ? Number(a.tally[2]) : 0,
    detail: a.detail,
    redDetail: `second run, every copy made red: ${b.detail}`,
    silentDetail: `third run, every copy's self-test made to exit 0 saying nothing: ${c.detail}`,
    cleanupDetail: `a write under $TMPDIR was ${a.usedTmp ? '' : 'NOT '}logged; left in $TMPDIR by the three runs: ${[...a.leftover, ...b.leftover, ...c.leftover].join(', ') || 'nothing'}`,
  }
}

/** The seven clauses, in this order. `say` is `check`, or in the self-test a recorder that turns them into a pattern. */
const verdict = (label, e, say = check) => {
  say(`${label}: runs to the end and every mutation is caught, with $TMPDIR behind a symlink`, e.completes, e.detail)
  say(`${label}: prints the positive control`, e.controlled, e.detail)
  say(`${label}: a copy that cannot run stops it (the control is enforced, not only printed)`, e.refusesRedCopy, e.redDetail)
  say(`${label}: a copy whose self-test never ran stops it too (exit 0 and no output is not a pass)`, e.refusesSilentCopy, e.silentDetail)
  say(`${label}: writes nothing under scripts/ that its guard can see (the coverage is printed at the end)`, e.cleanTree, e.detail)
  say(`${label}: wrote somewhere else, so the clause above is not vacuous`, e.wroteElsewhere, e.detail)
  say(`${label}: removes its temporary copy when it ends, whether it passes or stops (nothing is left in $TMPDIR)`, e.cleansUp, e.cleanupDetail)
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
    // A self-test that prints its tally only when it is reached by its real path, as one gated on isMain() does: the file Node runs through a symlinked path stays silent.
    const TRACKED = "import { realpathSync } from 'node:fs'\nif (realpathSync(process.argv[1]) === process.argv[1]) console.log('1/1 checks passed')\n"
    writeFileSync(join(root, 'scripts', 'target.mjs'), TRACKED)
    writeFileSync(join(root, 'scripts', 'other.mjs'), '// other\n')
    // ...and the same for python: a target that exits 0 under --self-test, a second file, and a directory to remove.
    const TRACKED_PY = "print('self-test: 1/1')\n"
    writeFileSync(join(root, 'scripts', 'target.py'), TRACKED_PY)
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
    const ON_A_COPY = `import { writeFileSync, mkdtempSync, realpathSync, cpSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'sf-')))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
cpSync('scripts', join(TMP, 'scripts'), { recursive: true })
const COPY = join(TMP, 'scripts', 'target.mjs')
const passes = () => { try { return /^([1-9]\\d*)\\/\\1 checks passed$/m.test(execFileSync(process.execPath, [COPY, '--self-test'], { stdio: 'pipe', encoding: 'utf8' })) } catch { return false } }
if (!passes()) { console.log('FAIL — the UNMUTATED copy is red'); process.exit(1) }
console.log('positive control: the unmutated copy passes')
writeFileSync(COPY, 'mutated')
console.log('1 of 1 mutations caught.')
`
    const PY_ON_A_COPY = `import pathlib, shutil, subprocess, sys, tempfile
with tempfile.TemporaryDirectory(prefix='sf-') as td:
    copy = pathlib.Path(td) / 'target.py'
    shutil.copyfile('scripts/target.py', copy)
    done = subprocess.run([sys.executable, str(copy), '--self-test'], capture_output=True, text=True)
    if done.returncode != 0 or 'self-test: 1/1' not in done.stdout:
        print('FAIL — the UNMUTATED copy is red')
        sys.exit(1)
    print('positive control: the unmutated copy passes')
    copy.write_text('mutated')
    print('1 of 1 mutations caught.')
`
    const CONTROL = "if (!passes()) { console.log('FAIL — the UNMUTATED copy is red'); process.exit(1) }\n"
    const PRINT = "console.log('positive control: the unmutated copy passes')\n"
    const WRITE = "writeFileSync(COPY, 'mutated')\n"
    const EXIT_HANDLER = "process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))\n"
    // The clauses a copy-based stand-in lacks are the ones that fail. A control that is missing altogether fails both enforcement clauses (a red copy and a silent one).
    const STAND_INS = [
      ['on-a-copy.py', PY_ON_A_COPY, 'TTTTTTT', 'A PYTHON STAND-IN THAT WORKS ON A COPY, PROVES IT FIRST AND STOPS ON A BROKEN COPY PASSES ALL SEVEN CLAUSES'],
      ['on-a-copy.mjs', ON_A_COPY, 'TTTTTTT', 'A STAND-IN THAT WORKS ON A COPY, PROVES IT FIRST AND STOPS ON A BROKEN COPY PASSES ALL SEVEN CLAUSES'],
      ['misses.mjs', variant(ON_A_COPY, '1 of 1', '1 of 2'), 'FTTTTTT', 'A COPY-BASED STAND-IN THAT PRINTS 1 of 2 FAILS ONLY THE COMPLETION CLAUSE'],
      ['tally-then-fails.mjs', variant(ON_A_COPY, "console.log('1 of 1 mutations caught.')\n", "console.log('1 of 1 mutations caught.')\nprocess.exit(1)\n"), 'FTTTTTT', 'A COPY-BASED STAND-IN THAT PRINTS N of N AND THEN EXITS NON-ZERO FAILS ONLY THE COMPLETION CLAUSE (the tally alone is not the exit status)'],
      ['unannounced.mjs', variant(ON_A_COPY, PRINT, ''), 'TFTTTTT', 'A COPY-BASED STAND-IN THAT NEVER PRINTS THE POSITIVE CONTROL FAILS ONLY THE PRINT CLAUSE'],
      // Three lines that are NEARLY the control: another verdict, the sentence with something before it, and with something after it. Only an exact line is the control.
      ['near-miss-control.mjs', variant(ON_A_COPY, PRINT, "console.log('positive control: the unmutated copy FAILED')\nconsole.log('NOT positive control: the unmutated copy passes')\nconsole.log('positive control: the unmutated copy passes, NOT')\n"), 'TFTTTTT', 'A COPY-BASED STAND-IN WHOSE CONTROL LINES ARE ONLY NEAR MISSES (another verdict, a prefix, a suffix) FAILS ONLY THE PRINT CLAUSE'],
      ['print-only.mjs', variant(ON_A_COPY, CONTROL, ''), 'TTFFTTT', 'A COPY-BASED STAND-IN THAT PRINTS THE POSITIVE CONTROL WITHOUT RUNNING IT FAILS BOTH ENFORCEMENT CLAUSES (it would read as every mutation caught on a broken copy)'],
      ['reports-and-goes-on.mjs', variant(ON_A_COPY, CONTROL, "if (!passes()) console.log('FAIL — the UNMUTATED copy is red')\n"), 'TTFFTTT', 'A STAND-IN THAT SAYS THE COPY IS RED AND CARRIES ON FAILS BOTH ENFORCEMENT CLAUSES (the exit status)'],
      ['stops-silently.mjs', variant(ON_A_COPY, CONTROL, 'if (!passes()) process.exit(1)\n'), 'TTFFTTT', 'A STAND-IN THAT STOPS ON A RED COPY WITHOUT SAYING WHY FAILS BOTH ENFORCEMENT CLAUSES (the FAIL line)'],
      // The control as it was before 2026-11-05: an exit status alone. A copy whose self-test never ran exits 0, so this one carries on and reports every mutation caught.
      ['accepts-silence.py', variant(PY_ON_A_COPY, "if done.returncode != 0 or 'self-test: 1/1' not in done.stdout:", 'if done.returncode != 0:'), 'TTTFTTT', 'A PYTHON STAND-IN WHOSE CONTROL IS AN EXIT STATUS ALONE FAILS ONLY THE SILENT-COPY CLAUSE (a self-test that never ran exits 0)'],
      ['accepts-silence.mjs', variant(ON_A_COPY, "return /^([1-9]\\d*)\\/\\1 checks passed$/m.test(execFileSync(process.execPath, [COPY, '--self-test'], { stdio: 'pipe', encoding: 'utf8' }))", "execFileSync(process.execPath, [COPY, '--self-test'], { stdio: 'pipe' }); return true"), 'TTTFTTT', 'A STAND-IN WHOSE CONTROL IS AN EXIT STATUS ALONE FAILS ONLY THE SILENT-COPY CLAUSE (a self-test that never ran exits 0)'],
      // TMP is not resolved: with $TMPDIR behind a symlink the copy is reached by a symlinked path, the target stays silent, and the control (correctly) stops the script.
      ['tmp-not-resolved.mjs', variant(ON_A_COPY, "realpathSync(mkdtempSync(join(tmpdir(), 'sf-')))", "mkdtempSync(join(tmpdir(), 'sf-'))"), 'FFTTTTT', 'A STAND-IN WHOSE TEMPORARY DIRECTORY IS NOT RESOLVED FAILS THE COMPLETION AND PRINT CLAUSES WHEN $TMPDIR IS A SYMLINK (the macOS case)'],
      // The exit handler that removes the copy is gone: the review's reproduction. Every run leaves its directory behind.
      ['leaks-its-copy.mjs', variant(ON_A_COPY, EXIT_HANDLER, ''), 'TTTTTTF', 'A STAND-IN THAT NEVER REMOVES ITS COPY FAILS ONLY THE CLEANUP CLAUSE'],
      // The copy is removed only if the script gets past its control: a run that stops on a broken copy leaves the directory behind.
      ['leaks-on-refusal.mjs', variant(variant(ON_A_COPY, EXIT_HANDLER, ''), CONTROL, CONTROL + EXIT_HANDLER), 'TTTTTTF', 'A STAND-IN THAT REMOVES ITS COPY ONLY WHEN IT GETS PAST THE CONTROL FAILS ONLY THE CLEANUP CLAUSE (the runs that stop at the control leave it behind)'],
      ['tracked-write-swallowed.mjs', variant(ON_A_COPY, WRITE, WRITE + "try { writeFileSync('scripts/target.mjs', 'x') } catch {}\n"), 'TTTTFTT', 'A COPY-BASED STAND-IN THAT TRIES TO WRITE THE TRACKED FILE AND SWALLOWS THE REFUSAL FAILS ONLY THE TRACKED-TREE CLAUSE'],
      // No write and no guarded cleanup either (the exit handler's rmSync is a logged write): to the guard this script does nothing, which is what an inert guard looks like.
      ['writes-nothing.mjs', variant(variant(ON_A_COPY, WRITE, ''), "rmSync(TMP, { recursive: true, force: true })", "execFileSync('rm', ['-rf', TMP])"), 'TTTTTFF', 'A COPY-BASED STAND-IN THAT THE GUARD SEES WRITING NOTHING FAILS THE WROTE-ELSEWHERE CLAUSE AND THE CLEANUP CLAUSE (with no logged write under $TMPDIR the cleanup cannot be vouched for)'],
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

    // The directory itself, in a root of its own where scripts/ is EMPTY: nothing inside it could be what refuses the move or the removal.
    const dirRoot = join(root, 'dir-root')
    mkdirSync(dirRoot)
    writeFileSync(join(dirRoot, 'probe.mjs'), `import fs from 'node:fs'
const attempt = (label, fn) => { try { fn(); console.log(label + ': written') } catch (e) { console.log(label + ': ' + e.code) } }
attempt('renameDir', () => fs.renameSync('scripts', 'moved'))
attempt('rmDir', () => fs.rmSync('scripts', { recursive: true }))
`)
    writeFileSync(join(dirRoot, 'probe.py'), `import os, shutil
def attempt(label, fn):
    try:
        fn()
        print(label + ': written')
    except PermissionError:
        print(label + ': EACCES')
attempt('renameDir', lambda: os.rename('scripts', 'moved'))
attempt('rmtreeDir', lambda: shutil.rmtree('scripts'))
`)
    const probe = run('probe.mjs', root)
    const probed = Object.keys(PROBED)
    const refused = probed.filter(w => probe.out.includes(`${w}: EACCES\n`))
    check(`THE NODE GUARD REFUSES EACH OF THE ${probed.length} WRITE FUNCTIONS ON A TRACKED PATH (a copy by its destination, a rename by either end), ALLOWS A WRITE ELSEWHERE AND A COPY THAT ONLY READS THE TRACKED FILE, AND LOGS BOTH`,
      refused.length === probed.length && probe.out.includes('renameOut: EACCES\n') && probe.out.includes('copyOut: written\n') && probe.out.includes('elsewhere: written\n') &&
      probe.blocked.length === probed.length + 1 && probe.lines.some(l => l.startsWith('WROTE ')) && tracked('target.mjs') === TRACKED,
      `refused ${refused.length} of ${probed.length}: ${refused.join(',')}; logged ${probe.blocked.length} refusals; ${probe.out.replace(/\n/g, ' | ')}`)

    const pyProbe = run('probe.py', root)
    const pyRefused = PROBED_PY.filter(w => pyProbe.out.includes(`${w}: EACCES\n`))
    check(`THE PYTHON GUARD REFUSES EACH OF THE ${PROBED_PY.length} WAYS TO WRITE A TRACKED PATH (a rename by either end), ALLOWS A READ, A WRITE ELSEWHERE AND A COPY THAT ONLY READS THE TRACKED FILE, AND LOGS BOTH`,
      pyRefused.length === PROBED_PY.length && ['renameOut: EACCES', 'copyOut: written', 'read: written', 'elsewhere: written'].every(l => pyProbe.out.includes(`${l}\n`)) &&
      pyProbe.blocked.length === PROBED_PY.length + 1 && pyProbe.lines.some(l => l.startsWith('WROTE ')) && tracked('target.py') === TRACKED_PY && existsSync(join(root, 'scripts', 'sub', 'x.py')),
      `refused ${pyRefused.length} of ${PROBED_PY.length}: ${pyRefused.join(',')}; logged ${pyProbe.blocked.length} refusals; ${pyProbe.out.replace(/\n/g, ' | ')}`)

    mkdirSync(join(dirRoot, 'scripts'))
    const dirProbe = run('probe.mjs', dirRoot)
    const pyDirProbe = run('probe.py', dirRoot)
    check('BOTH GUARDS REFUSE TO MOVE OR REMOVE THE scripts/ DIRECTORY ITSELF (an empty one, so no write inside it can be what refuses): a rename and a recursive removal, in node and in python, and log all four as refused',
      ['renameDir: EACCES', 'rmDir: EACCES'].every(l => dirProbe.out.includes(`${l}\n`)) && ['renameDir: EACCES', 'rmtreeDir: EACCES'].every(l => pyDirProbe.out.includes(`${l}\n`)) &&
      dirProbe.blocked.length === 2 && pyDirProbe.blocked.length === 2,
      `node: ${dirProbe.out.replace(/\n/g, ' | ')} ${dirProbe.blocked.length} refused; python: ${pyDirProbe.out.replace(/\n/g, ' | ')} ${pyDirProbe.blocked.length} refused`)

    // The forms the guards are said not to see, each attempted on a fresh fixture in a root of its own per language: an attempt that succeeds changes its fixtures.
    const seedUnseen = name => {
      const dir = join(root, name)
      mkdirSync(join(dir, 'scripts', 'rm-cb-dir'), { recursive: true })
      mkdirSync(join(dir, 'scripts', 'empty-dir'))
      mkdirSync(join(dir, 'other'))
      for (const f of ['other/o1', 'other/o2', 'other/o3', 'other/o4', 'scripts/del-cb', 'scripts/trunc-cb', 'scripts/mode', 'scripts/stamp', 'scripts/del-dirfd', 'scripts/rm-cb-dir/f']) writeFileSync(join(dir, f), 'x\n')
      symlinkSync(join(dir, 'scripts'), join(dir, 'other', 'via'))
      return dir
    }
    const uNode = seedUnseen('unseen-node')
    writeFileSync(join(uNode, 'unseen.mjs'), `import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const cb = fn => new Promise((ok, no) => fn(e => (e ? no(e) : ok())))
const attempt = async (key, fn) => { try { await fn(); console.log(key + ': written') } catch (e) { console.log(key + ': ' + (e.code ?? e.message)) } }
${UNSEEN_NODE.map(([key, , code]) => `await attempt(${JSON.stringify(key)}, async () => { ${code} })`).join('\n')}
`)
    const uPy = seedUnseen('unseen-py')
    writeFileSync(join(uPy, 'unseen.py'), `import os, subprocess
def attempt(key, fn):
    try:
        fn()
        print(key + ': written')
    except PermissionError:
        print(key + ': EACCES')
    except Exception as e:
        print(key + ': ' + type(e).__name__)
${UNSEEN_PY.map(([key, , code], i) => `def t${i}(): ${code}\nattempt(${JSON.stringify(key)}, t${i})`).join('\n')}
`)
    const unseenNode = run('unseen.mjs', uNode)
    const unseenPy = run('unseen.py', uPy)
    const notWritten = (probe, list) => list.filter(([key]) => !probe.out.includes(`${key}: written\n`)).map(e => e[0])
    check(`EVERY ONE OF THE ${UNSEEN_NODE.length} FORMS THE PRINTED COVERAGE SAYS THE NODE GUARD DOES NOT SEE IS NOT SEEN (each attempted on a fresh fixture: it succeeds and nothing is logged as refused)`,
      listIsTrue(unseenNode, UNSEEN_NODE), `not written: ${notWritten(unseenNode, UNSEEN_NODE).join(', ') || 'none'}; ${unseenNode.blocked.length} refused; ${unseenNode.out.replace(/\n/g, ' | ')}`)
    check(`EVERY ONE OF THE ${UNSEEN_PY.length} FORMS THE PRINTED COVERAGE SAYS THE PYTHON GUARD DOES NOT SEE IS NOT SEEN (each attempted on a fresh fixture: it succeeds and nothing is logged as refused)`,
      listIsTrue(unseenPy, UNSEEN_PY), `not written: ${notWritten(unseenPy, UNSEEN_PY).join(', ') || 'none'}; ${unseenPy.blocked.length} refused; ${unseenPy.out.replace(/\n/g, ' | ')}`)
    const allWritten = list => list.map(([key]) => `${key}: written\n`).join('')
    check('THE TEST OF THE LIST HOLDS WHEN EVERY FORM SUCCEEDED AND FAILS WHEN ONE IS REFUSED, ONE WAS NEVER ATTEMPTED, OR A REFUSAL WAS LOGGED (the same test the two clauses above apply)',
      listIsTrue({ out: allWritten(UNSEEN_NODE), blocked: [] }, UNSEEN_NODE) &&
      !listIsTrue({ out: allWritten(UNSEEN_NODE).replace('mkdirSync: written', 'mkdirSync: EACCES'), blocked: [] }, UNSEEN_NODE) &&
      !listIsTrue({ out: allWritten(UNSEEN_NODE).replace('mkdirSync: written\n', ''), blocked: [] }, UNSEEN_NODE) &&
      !listIsTrue({ out: allWritten(UNSEEN_NODE), blocked: ['BLOCKED x'] }, UNSEEN_NODE),
      'the four cases of listIsTrue over the node list')
    const printed = coverageLines().join('\n')
    check(`THE PRINTED COVERAGE NAMES EVERY ONE OF THE ${labelsOf(UNSEEN_NODE).length + labelsOf(UNSEEN_PY).length} STATEMENTS IN BOTH LISTS, AND SAYS WHAT cpSync DOES ONLY AS A DATED MEASUREMENT`,
      [...UNSEEN_NODE, ...UNSEEN_PY].every(e => printed.includes(e[1])) && /cpSync[^\n]*v22\.22\.0 \(measured 2026-11-05\)/.test(printed), printed)

    const inPlace = evaluate('in-place.mjs', root)
    check('A STAND-IN THAT MUTATES IN PLACE FAILS EVERY CLAUSE (the guard stopped it at its first write), and its tracked file is byte-identical',
      pattern(inPlace) === 'FFFFFFF' && tracked('target.mjs') === TRACKED, `${pattern(inPlace)} ${JSON.stringify(inPlace)}`)
    const pyInPlace = evaluate('in-place.py', root)
    check('A PYTHON STAND-IN THAT MUTATES IN PLACE FAILS EVERY CLAUSE (the guard stopped it at its first write), and its tracked file is byte-identical',
      pattern(pyInPlace) === 'FFFFFFF' && tracked('target.py') === TRACKED_PY, `${pattern(pyInPlace)} ${JSON.stringify(pyInPlace)}`)
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
    for (const line of coverageLines()) console.log(line)
    console.log()
  }
} finally { rmSync(work, { recursive: true, force: true }) }
finish(summarize())
