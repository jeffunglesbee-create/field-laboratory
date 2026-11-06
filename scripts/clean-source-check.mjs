// No source file carries a harness's injected code.
//
// WHAT HAPPENED
//
// `proof-check.mjs` proves its claims by INJECTING code into a real source file
// and requiring the build to fail. It is careful about cleaning up: it keeps a
// backup, and restores on `exit` (it registers no signal handler, on purpose: see the comment above its exit handler).
//
// On 2026-08-15 a foreground 2-minute timeout killed it mid-run anyway, leaving
//
//     let private __proof23 (g: Game) = ...
//
// in `src/Scoreboard.fs`. A later `git add -A` committed it, and it reached
// main in `217282b`.
//
// WHY NOTHING CAUGHT IT
//
// That injection COMPILED. It passed the build, it passed "fail on any F#
// compiler warning", and it passed fifteen further verify steps. The only thing
// that noticed was proof-check's own marker guard — at step 17, ninety seconds
// into a forty-minute job, and by then it could only refuse to run: its backup
// lived in `tmpdir()` (it has lived in `.proof-state/` since 2026-09-07, see the
// history comment in proof-check.mjs), so on a fresh CI runner the backup could
// never exist and repair was impossible by construction. That is still the CI
// case: `.proof-state/` is gitignored, so a runner never has it.
//
// So the gap was never the signal handling. It was that a stranded injection is
// SILENT everywhere except the one place that cannot fix it.
//
// This check is the cheap, early, always-runnable half: no build, no browser,
// no network — a scan that fails in milliseconds and names the file. It runs
// first in `verify` so a mutated tree costs seconds instead of a job.
//
// It deliberately does NOT try to repair. Repair is proof-check's business and
// it needs the backup; this only has to make the state impossible to miss.
//
// THE PROBE CASE (added 2026-11-05)
//
// `proof-check.mjs` leaves a second kind of injection. Its registry phase writes one line, a second `| NHL`, directly above the Sport union's last case in `src/Desk.fs`, and a kill there strands
// it as the block above is stranded. This scan did not look for it. Measured 2026-11-05: with that line injected the way proof-check writes it, `npm run check:clean-source` printed
// `4/4 checks passed` and exited 0, while `node scripts/proof-check.mjs` on the same tree refused with "src/Desk.fs contains injected proof code (the probe case) and no run state exists".
// It is looked for in every source file, as the block is, and the constants that define it are asserted against proof-check's source, like the marker.
//
// A sport added directly above the union's last case lands between the probe and that case, and the probe is then no longer directly above it (review 6, finding 0: proof-check kept the state for
// such a registry and this scan, which looked only for the adjacent line, passed over it). The probe is a second `    | NHL` line in a union that has one of its own, and a union cannot have a case twice, so
// the same line there twice in one top-level declaration is the probe wherever in the union it sits. Measured 2026-11-05: no declaration in the 49 files of src/ has it twice.
//
// WHAT IT TELLS THE READER TO DO depends on whether proof-check has a run state
// to work from, because the two cases have different remedies and `git checkout`
// is the right answer to neither. It restores a file to the INDEX: that throws
// away every unstaged edit to the file, and when the injection is already
// committed (217282b) it changes nothing at all. Measured 2026-11-05 in a scratch
// repository: with the injection uncommitted `git diff -- file` printed 8 lines
// and the checkout removed it; with it committed `git diff -- file` printed 0
// lines and the marker was still there after the checkout. Measured 2026-11-06 the
// same way: with the injection STAGED, which is what the pre-commit hook runs this
// scan over, the checkout changed nothing either (`git status` still `M `, the
// marker still there); only an edit made after the `git add` was removed.
//
//   state present   proof-check restores the file that still carries its own
//                   injection and refuses otherwise: name it, and the directory.
//   state absent    proof-check refuses and writes nothing (a runner, a pulled
//                   commit): the lines have to be deleted by hand; say how to find
//                   them, and say what the checkout costs.
//
// `--self-test` runs this file as a child process over fixture directories, once
// per case, so it asserts the text a reader actually sees.

import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createChecks, finish } from './checks.mjs'

const { check, summarize } = createChecks()

// The exact string proof-check writes. Imported by eye rather than by import,
// because this check must keep working if proof-check is the thing that broke.
// Asserted against proof-check's own source below so the two cannot drift.
const MARKER = 'let private __proof'

// proof-check's run state: the directory, and the file in it that makes a run one it can heal.
// Without `active.json` it treats the tree as having no state (measured 2026-11-05: a
// `.proof-state/` holding only `restore-pending`, over an injected file, gave "no run state
// exists" and wrote nothing). Kept by eye and asserted against its source below, like MARKER.
const STATE_DIR = '.proof-state'
const ACTIVE = 'active.json'
const ACTIVE_FILE = join(STATE_DIR, ACTIVE)

// The registry phase's probe case: proof-check's second phase writes one case line directly above the Sport union's last case in src/Desk.fs, and a kill there strands it as silently as a
// stranded block. Kept by eye and asserted against its source below, like MARKER. `asSource` is the text of one of these strings as it is written in a source file (its newline as \n).
const REGISTRY_ANCHOR = '\n    | Unrecognised of raw: string'
const REGISTRY_PROBE = '    | NHL\n'
const SITE_SOURCE = 'REGISTRY_PROBE + REGISTRY_ANCHOR.slice(1)'
const PROBE_SITE = REGISTRY_PROBE + REGISTRY_ANCHOR.slice(1)
const asSource = text => text.replace('\n', '\\n')
// The probe's line twice in one top-level declaration (a line that starts in column 0 starts the next one): the probe, whether or not it is still directly above the union's last case.
const probeDuplicated = text => text.split(/\n(?=\S)/).some(declaration => declaration.split('\n').filter(l => l === REGISTRY_PROBE.trimEnd()).length > 1)

const SRC = 'src'

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  const sources = readdirSync(SRC).filter(f => f.endsWith('.fs'))

  check('there are F# sources to scan',
    sources.length > 0,
    `${sources.length} file(s) in ${SRC}/`)

  // If proof-check renames its injection, this check would silently scan for a
  // string nobody writes and pass on every mutated tree — vacuously green, which
  // is the failure shape this repo keeps finding. So the marker is verified
  // against the harness that produces it.
  const harness = readFileSync('scripts/proof-check.mjs', 'utf8')
  check('the marker this scans for is the one proof-check injects',
    harness.includes(`const MARKER = '${MARKER}'`),
    `looking for ${JSON.stringify(MARKER)} in scripts/proof-check.mjs`)

  // The same for the run state the remedy below branches on: if proof-check moved it, the
  // remedy would say "no state" over a directory that is there, and advise deleting lines
  // the heal would have restored.
  check('the run state this reads is the one proof-check keeps',
    harness.includes(`const STATE_DIR = '${STATE_DIR}'`) && harness.includes(`const MARKER_FILE = join(STATE_DIR, '${ACTIVE}')`),
    `looking for the constants STATE_DIR = ${JSON.stringify(STATE_DIR)} and MARKER_FILE = join(STATE_DIR, ${JSON.stringify(ACTIVE)}) in scripts/proof-check.mjs`)

  // And for the registry's probe case: the same silent pass if proof-check changed the line it writes, the case it writes it above, or how it composes the two into the text it looks for.
  check('the registry probe this scans for is the one proof-check injects',
    harness.includes(`const REGISTRY_ANCHOR = '${asSource(REGISTRY_ANCHOR)}'`) && harness.includes(`const REGISTRY_PROBE = '${asSource(REGISTRY_PROBE)}'`)
      && harness.includes(`const REGISTRY_PROBE_SITE = ${SITE_SOURCE}`),
    `looking for the constants REGISTRY_ANCHOR = '${asSource(REGISTRY_ANCHOR)}', REGISTRY_PROBE = '${asSource(REGISTRY_PROBE)}' and REGISTRY_PROBE_SITE = ${SITE_SOURCE} in scripts/proof-check.mjs`)

  // Every source file, for each of the two things proof-check leaves: the block of proof functions, and the probe case. (The probe is looked for in every file, as the block is, not only in the
  // registry proof-check names: that file is its business, and a scan that knew it would go blind when it moved. Measured 2026-11-05: no file in src/ carries the probe's site on a clean tree.)
  const where = needle => sources.filter(f => readFileSync(join(SRC, f), 'utf8').includes(needle))
  const blocks = where(MARKER)
  const probes = where(PROBE_SITE)
  // A probe an edit has separated from the last case: not directly above it, but there twice in its declaration.
  const moved = sources.filter(f => !probes.includes(f) && probeDuplicated(readFileSync(join(SRC, f), 'utf8')))
  const dirty = sources.filter(f => blocks.includes(f) || probes.includes(f) || moved.includes(f))
  const at = files => files.map(f => join(SRC, f)).join(' ')
  const paths = at(dirty)
  // More than one file carries an injection (a block and a probe always live in two): the sentence about the checkout is then plural, as proof-check's is for the same state. Kept by eye in both.
  const many = dirty.length > 1
  // What to delete, for each kind that is there. The probe is one line, and its grep shows the line above the union's last case, because that line is the probe: the last case itself is always there.
  const deletions = [
    ...(blocks.length ? [`the injected block (each "${MARKER}N" header and the indented lines under it; \`grep -n "${MARKER}" ${at(blocks)}\` finds them)`] : []),
    ...(probes.length ? [`the probe case (the line "${REGISTRY_PROBE.trimEnd()}" directly above "${REGISTRY_ANCHOR.slice(1)}"; \`grep -n -B1 "^${REGISTRY_ANCHOR.slice(1)}[[:space:]]*$" ${at(probes)}\` shows it)`] : []),
    // Where a sport now sits between the probe and the last case, the line above the last case is that sport: the grep lists the line itself, both of them, and the probe is the second.
    ...(moved.length ? [`the probe case (the second line "${REGISTRY_PROBE.trimEnd()}" in the union: proof-check wrote it directly above "${REGISTRY_ANCHOR.slice(1)}", and a line added since may now sit between them; \`grep -n "^${REGISTRY_PROBE.trimEnd()}[[:space:]]*$" ${at(moved)}\` lists both)`] : []),
  ]
  // The remedy is one line (it is also a GitHub annotation) and depends on whether proof-check has the state it needs.
  const remedy = existsSync(ACTIVE_FILE)
    ? `a proof-check run left this. Run \`node scripts/proof-check.mjs\`: it puts a file back only when that file is exactly its backup plus the injection (edits made before that run are kept), ` +
      `and refuses, writing nothing, when the file has moved on since or that run is still going; after a restore it goes on to run the proofs. The backups are in ${STATE_DIR}/; do not delete it`
    : `${ACTIVE_FILE} does not exist, so \`node scripts/proof-check.mjs\` has nothing to restore from and refuses. Delete ${deletions.join(' and ')}. ` +
      `\`git checkout -- ${paths}\` puts ${many ? 'each file' : 'the file'} back to what is staged: it removes an injection only while that injection is neither staged nor committed (the pre-commit hook sees it staged, where the checkout changes nothing), and it discards every unstaged edit to ${many ? 'those files' : 'the file'}`

  check('no source file carries injected proof code',
    dirty.length === 0,
    dirty.length
      ? `${dirty.join(', ')} — ${remedy}`
      : `${sources.length} file(s) clean`)

  finish(summarize())
}

// The real script, run as a child over fixture directories: it reads `src/` and
// `scripts/proof-check.mjs` relative to its working directory, and nothing else of the
// repository, so each fixture is a temp directory holding just those. `GITHUB_ACTIONS` is
// cleared so the output is the log a person reads, not the annotations a runner adds.
//
// Not `process.exit(summarize())` here: check-exit-drains counts those against a budget, and
// `finish` sets the status without cutting the output short.
function selfTest () {
  const here = fileURLToPath(import.meta.url)
  const dirs = []
  // What proof-check's source has to say for the scan to accept it. Built from this file's own constants, so a fixture that drifts changes exactly one of them.
  const harnessOf = ({ marker = MARKER, stateDir = STATE_DIR, active = ACTIVE, anchor = asSource(REGISTRY_ANCHOR), probe = asSource(REGISTRY_PROBE), site = SITE_SOURCE } = {}) =>
    `const STATE_DIR = '${stateDir}'\nconst MARKER_FILE = join(STATE_DIR, '${active}')\nconst MARKER = '${marker}'\n`
    + `const REGISTRY_ANCHOR = '${anchor}'\nconst REGISTRY_PROBE = '${probe}'\nconst REGISTRY_PROBE_SITE = ${site}\n`
  const run = ({ files, state = null, harness = harnessOf() }) => {
    const dir = mkdtempSync(join(tmpdir(), 'clean-source-'))
    dirs.push(dir)
    mkdirSync(join(dir, SRC)); mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts', 'proof-check.mjs'), harness)
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, SRC, f), text)
    // state: null = no directory; a file name = a directory holding just that file.
    if (state !== null) { mkdirSync(join(dir, STATE_DIR)); writeFileSync(join(dir, STATE_DIR, state), '{}') }
    const r = spawnSync(process.execPath, [here], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' }, timeout: 30000 })
    const out = `${r.stdout}${r.stderr}`
    // What a failure prints: the exit status and the FAIL lines with their detail, not the child's whole output.
    const verdict = `exit ${r.status}: ${out.split('\n').filter(l => /^FAIL|^ {6}→ /.test(l)).join(' | ') || 'no FAIL line'}`
    return { status: r.status, out, verdict, dir }
  }
  try {
    const injected = { 'A.fs': 'let a = 1\n', 'B.fs': `let b = 2\n${MARKER}23 (g: int) = 1\n` }
    const clean = run({ files: { 'A.fs': 'let a = 1\n' } })
    const noState = run({ files: injected })
    const withState = run({ files: injected, state: ACTIVE })
    const strayState = run({ files: injected, state: 'restore-pending' })
    const markerDrift = run({ files: injected, harness: harnessOf({ marker: 'let private __renamed' }) })
    const stateDirDrift = run({ files: injected, harness: harnessOf({ stateDir: '.proof-run' }) })
    const stateFileDrift = run({ files: injected, harness: harnessOf({ active: 'marker.json' }) })
    const empty = run({ files: {} })
    // The registry's probe case. A union as src/Desk.fs has it: `| NHL` is a real case in the middle, and the case above the last one is another (the probe is a SECOND `| NHL`, directly above the last case).
    const unionOf = cases => `type Sport =\n${cases.map(c => `    | ${c}`).join('\n')}\n    | Unrecognised of raw: string\n`
    const cleanUnion = unionOf(['MLB', 'NHL', 'UFL'])
    const probedUnion = unionOf(['MLB', 'NHL', 'UFL', 'NHL'])
    const probed = run({ files: { 'A.fs': 'let a = 1\n', 'D.fs': probedUnion } })
    const bothKinds = run({ files: { ...injected, 'D.fs': probedUnion } })
    const unionClean = run({ files: { 'A.fs': 'let a = 1\n', 'D.fs': cleanUnion } })
    const probeDrift = run({ files: { 'D.fs': probedUnion }, harness: harnessOf({ probe: asSource('    | NFL\n') }) })
    const anchorDrift = run({ files: { 'D.fs': probedUnion }, harness: harnessOf({ anchor: asSource('\n    | Other of raw: string') }) })
    const siteDrift = run({ files: { 'D.fs': probedUnion }, harness: harnessOf({ site: 'REGISTRY_PROBE + REGISTRY_ANCHOR' }) })
    // A sport added directly above the last case lands between the probe and that case: the probe is then the second `| NHL`, no longer directly above the last case.
    const movedUnion = unionOf(['MLB', 'NHL', 'UFL', 'NHL', 'MyNewSport'])
    const movedProbe = run({ files: { 'A.fs': 'let a = 1\n', 'D.fs': movedUnion } })
    const movedWithState = run({ files: { 'D.fs': movedUnion }, state: ACTIVE })
    const probeKinds = run({ files: { 'D.fs': probedUnion, 'E.fs': movedUnion } })
    const twoDeclarations = run({ files: { 'A.fs': 'let a = 1\n', 'D.fs': 'type A =\n    | NHL\n    | X\n\ntype B =\n    | NHL\n    | Y\n' } })
    const FAILS = /FAIL  no source file carries injected proof code/
    // A Windows checkout with autocrlf: every line ends in a carriage return, and proof-check's probe is inserted after the existing newline as a bare `\n` line, so the probe is the one line without it.
    const crlfProbed = unionOf(['MLB', 'NHL', 'UFL']).replace(/\n/g, '\r\n').replace('\r\n    | Unrecognised', '\r\n    | NHL\n    | Unrecognised')
    const probedCrlf = run({ files: { 'A.fs': 'let a = 1\n', 'D.fs': crlfProbed } })
    // The grep a remedy prints, run by sh over `text` written where the grep names its file. Its output lines are what a reader would see.
    const haveGrep = spawnSync('grep', ['-V']).status === 0
    const printedGrep = (r, text) => {
      const cmd = /`(grep [^`]*)`/.exec(r.out)?.[1]
      if (!cmd) return { cmd: null, lines: [] }
      writeFileSync(join(r.dir, cmd.split(' ').pop()), text)
      const g = spawnSync('sh', ['-c', cmd], { cwd: r.dir, encoding: 'utf8' })
      return { cmd, status: g.status, lines: g.stdout.split('\n').filter(l => l) }
    }
    // The checkout sentence as a reader sees it, typed by hand here and not built from the scan's template, so that a drift in either shows.
    const checkoutSentence = (files, many) => `\`git checkout -- ${files}\` puts ${many ? 'each file' : 'the file'} back to what is staged: it removes an injection only while that injection is neither staged nor committed `
      + `(the pre-commit hook sees it staged, where the checkout changes nothing), and it discards every unstaged edit to ${many ? 'those files' : 'the file'}`

    // Coverage (Rule 91): 19 fixtures, each the real script in a directory of its own (the 19th, a probe on a CRLF tree, is listed with the greps it feeds, below): clean, injected with no state, with active.json, with a state directory that holds no active.json,
    // a renamed marker, a renamed state directory, a renamed state file, and no sources; then the registry's probe case: carried, carried beside an injected block, a clean union that has `| NHL`
    // in the middle, and a probe line, a last-case anchor and a site definition that proof-check no longer uses; then a probe a sport has been added in front of: alone, with a run state, beside
    // a probe that is directly above the last case, and the same line in two declarations that each have one of their own.
    check('a clean tree passes all 5 checks (fixture: one clean file)',
      clean.status === 0 && /5\/5 checks passed/.test(clean.out), clean.verdict)
    check('an injected file fails, and is the one named (fixtures: src/A.fs clean, src/B.fs injected)',
      noState.status === 1 && FAILS.test(noState.out) && /→ B\.fs — /.test(noState.out) && !/A\.fs/.test(noState.out), noState.verdict)
    check('WITH a run state (.proof-state/active.json), the remedy is proof-check, and it says to keep the state directory',
      withState.status === 1 && /node scripts\/proof-check\.mjs/.test(withState.out) && /backups are in \.proof-state\/; do not delete it/.test(withState.out), withState.verdict)
    // Not `git checkout` alone: that is one spelling of the hazard, and a remedy that said `git reset --hard HEAD -- <files>` or `git restore --source=HEAD -- <files>` instead passed this clause (review 6,
    // test-vacuity lens, finding 1c). With a run state the remedy is proof-check; any git command in it discards uncommitted work.
    check('WITH a run state, no git command is recommended (a checkout, a restore, a reset, a clean or a stash each discards uncommitted work)',
      withState.status === 1 && FAILS.test(withState.out) && !/\bgit\b/.test(withState.out), withState.verdict)
    check('WITH a run state, it says what proof-check does when the file has moved on, or the run is still going',
      /refuses, writing nothing, when the file has moved on since or that run is still going/.test(withState.out), withState.verdict)
    check('WITHOUT a run state, it says proof-check has nothing to restore from, and how to find the lines',
      noState.status === 1 && /\.proof-state\/active\.json does not exist, so \`node scripts\/proof-check\.mjs\` has nothing to restore from and refuses/.test(noState.out)
        && /grep -n "let private __proof" src\/B\.fs/.test(noState.out), noState.verdict)
    check('WITHOUT a run state, a checkout is named with where it works (not once the injection is staged or committed) and what it costs',
      noState.out.includes(checkoutSentence('src/B.fs', false)), noState.verdict)
    check('a .proof-state/ that holds no active.json counts as no run state, as it does to proof-check',
      strayState.status === 1 && /does not exist, so \`node scripts\/proof-check\.mjs\` has nothing to restore from/.test(strayState.out) && !/backups are in/.test(strayState.out), strayState.verdict)
    check('a marker that proof-check no longer writes fails the scan, so it cannot pass vacuously',
      markerDrift.status === 1 && /FAIL  the marker this scans for is the one proof-check injects/.test(markerDrift.out), markerDrift.verdict)
    check('a run state that proof-check keeps elsewhere fails the scan: a renamed directory, and a renamed file',
      stateDirDrift.status === 1 && /FAIL  the run state this reads is the one proof-check keeps/.test(stateDirDrift.out)
        && stateFileDrift.status === 1 && /FAIL  the run state this reads is the one proof-check keeps/.test(stateFileDrift.out), `${stateDirDrift.verdict} // ${stateFileDrift.verdict}`)
    check('no F# sources at all fails',
      empty.status === 1 && /FAIL  there are F# sources to scan/.test(empty.out), empty.verdict)
    check('a stranded registry probe fails the scan, and is the file named (fixtures: src/A.fs clean, src/D.fs carries the probe directly above the union\'s last case)',
      probed.status === 1 && FAILS.test(probed.out) && /→ D\.fs — /.test(probed.out) && !/A\.fs/.test(probed.out), probed.verdict)
    check('WITHOUT a run state, the probe\'s remedy names the line and a grep that shows it with the line above, and says nothing of an injected block',
      /Delete the probe case \(the line "    \| NHL" directly above "    \| Unrecognised of raw: string"; \`grep -n -B1 "\^    \| Unrecognised of raw: string\[\[:space:\]\]\*\$" src\/D\.fs\` shows it\)\./.test(probed.out)
        && probed.out.includes(checkoutSentence('src/D.fs', false)) && !/injected block/.test(probed.out), probed.verdict)
    check('a probe and an injected block in one tree each get their own instruction, naming only their own file, and one checkout names both',
      bothKinds.status === 1 && /→ B\.fs, D\.fs — /.test(bothKinds.out)
        && /Delete the injected block \(each "let private __proofN" header and the indented lines under it; \`grep -n "let private __proof" src\/B\.fs\` finds them\) and the probe case \(the line/.test(bothKinds.out)
        && /\`grep -n -B1 "\^    \| Unrecognised of raw: string\[\[:space:\]\]\*\$" src\/D\.fs\` shows it\)\./.test(bothKinds.out)
        && bothKinds.out.includes(checkoutSentence('src/B.fs src/D.fs', true)), bothKinds.verdict)
    check('a union that has `| NHL` in the middle and another case above its last is clean, as the real one is (the probe is a second `| NHL`, directly above the last case)',
      unionClean.status === 0 && /5\/5 checks passed/.test(unionClean.out), unionClean.verdict)
    check('a probe a sport has been added in front of fails the scan, and is the file named (fixtures: src/A.fs clean, src/D.fs carries `| NHL` twice with a sport above the last case)',
      movedProbe.status === 1 && FAILS.test(movedProbe.out) && /→ D\.fs — /.test(movedProbe.out) && !/A\.fs/.test(movedProbe.out), movedProbe.verdict)
    check('WITHOUT a run state, its remedy names the line by what it is (the second `| NHL`) and a grep that lists both, and does not say the grep shows the line above the last case',
      /Delete the probe case \(the second line "    \| NHL" in the union: proof-check wrote it directly above "    \| Unrecognised of raw: string", and a line added since may now sit between them; \`grep -n "\^    \| NHL\[\[:space:\]\]\*\$" src\/D\.fs\` lists both\)\./.test(movedProbe.out)
        && movedProbe.out.includes(checkoutSentence('src/D.fs', false)) && !/-B1/.test(movedProbe.out) && !/injected block/.test(movedProbe.out), movedProbe.verdict)
    check('WITH a run state, a probe a sport has been added in front of gets the proof-check remedy and no git command, as a block does',
      movedWithState.status === 1 && FAILS.test(movedWithState.out) && /node scripts\/proof-check\.mjs/.test(movedWithState.out) && !/\bgit\b/.test(movedWithState.out), movedWithState.verdict)
    check('a probe directly above the last case in one file and a separated one in another each get their own instruction, naming only their own file, and one checkout names both',
      probeKinds.status === 1 && /→ D\.fs, E\.fs — /.test(probeKinds.out)
        && /Delete the probe case \(the line "    \| NHL" directly above "    \| Unrecognised of raw: string"; \`grep -n -B1 "\^    \| Unrecognised of raw: string\[\[:space:\]\]\*\$" src\/D\.fs\` shows it\) and the probe case \(the second line/.test(probeKinds.out)
        && /\`grep -n "\^    \| NHL\[\[:space:\]\]\*\$" src\/E\.fs\` lists both\)\./.test(probeKinds.out)
        && probeKinds.out.includes(checkoutSentence('src/D.fs src/E.fs', true)), probeKinds.verdict)
    check('the same line in two declarations that each have it as a case of their own is clean: it is counted per declaration, not per file',
      twoDeclarations.status === 0 && /5\/5 checks passed/.test(twoDeclarations.out), twoDeclarations.verdict)
    check('a probe line, a last-case anchor or a site definition that proof-check no longer uses fails the scan: three renamed constants',
      [probeDrift, anchorDrift, siteDrift].every(r => r.status === 1 && /FAIL  the registry probe this scans for is the one proof-check injects/.test(r.out)),
      `${probeDrift.verdict} // ${anchorDrift.verdict} // ${siteDrift.verdict}`)
    // The greps the remedies print, RUN (review 7, finding L11). A grep that ends in `$` printed nothing on a tree whose lines end in a carriage return, so "shows it" and "lists both" were false on a
    // Windows checkout with autocrlf (measured 2026-11-06: exit 1, no output, on the real script's own fixture with CRLF line ends). Each is run by sh over both kinds of line end.
    const adjacentLf = printedGrep(probed, probedUnion)
    const adjacentCrlf = printedGrep(probedCrlf, crlfProbed)
    const movedLf = printedGrep(movedProbe, movedUnion)
    const movedCrlf = printedGrep(movedProbe, movedUnion.replace(/\n/g, '\r\n'))
    check(`the grep the probe remedy prints shows the probe and the last case under it on LF and on CRLF line ends, and the scan itself fires on the CRLF tree (2 greps run, 1 scan; asserted: ${haveGrep})`,
      !haveGrep || (probedCrlf.status === 1 && FAILS.test(probedCrlf.out)
        && [adjacentLf, adjacentCrlf].every(g => g.status === 0 && g.lines.length === 2 && /\| NHL/.test(g.lines[0]) && /\| Unrecognised of raw: string/.test(g.lines[1]))),
      `LF ${JSON.stringify(adjacentLf.lines)}, CRLF ${JSON.stringify(adjacentCrlf.lines)}; ${probedCrlf.verdict}`)
    check(`the grep the separated-probe remedy prints lists both \`| NHL\` lines on LF and on CRLF line ends (2 greps run; asserted: ${haveGrep})`,
      !haveGrep || [movedLf, movedCrlf].every(g => g.status === 0 && g.lines.length === 2 && g.lines.every(l => /\| NHL/.test(l))),
      `LF ${JSON.stringify(movedLf.lines)}, CRLF ${JSON.stringify(movedCrlf.lines)}`)
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  }
  finish(summarize())
}
