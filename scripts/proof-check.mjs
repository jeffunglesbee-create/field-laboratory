// Compiles the violations that docs/AMNESTY-PROOF.md claims are rejected, and
// asserts the compiler really does reject each one with the stated error.
//
// WHY THIS EXISTS
//
// The amnesty gate shipped with a proof doc claiming `formatDramaPeak` was "the
// only path from a drama score to a string in the entire program." It was not:
// DramaArc was still `Nested<int list>`, so the arc's raw score series could be
// rendered on a live card, straight past a gate the doc said was closed.
//
// Every check in the repo was green through all of it — 40 assertions, none of
// which touch arc values, because nothing in the repo renders them. The claim
// was prose, and prose is not executable, so nothing could contradict it.
//
// A proof document that no one runs is a design document. This turns each
// claimed compiler rejection into a real compile, so the doc cannot drift ahead
// of the code: weaken the gate and the doc's own claims start failing.
//
// HOW IT WORKS
//
// Each proof case in the doc is marked with `<!-- proof: FSxxxx -->` followed by
// an ```fsharp block holding a complete expression body. The body is wrapped in
// a function, injected into a real source file, and compiled. The case passes
// only if the build fails AND the stated error code appears.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks } from './checks.mjs'

import { readdirSync } from 'node:fs'

// Every *-PROOF.md in docs/. A new proof document is picked up automatically
// rather than needing this script edited — the failure being guarded against is
// a claim that no one checks, and requiring registration would recreate it.
const DOCS = () => readdirSync('docs').filter(f => f.endsWith('-PROOF.md')).sort()
const TARGET = 'src/Scoreboard.fs'
// The Sport union lives here, and the registry-completeness phase mutates it.
const REGISTRY = 'src/Desk.fs'
// Outside the repo on purpose. An earlier version kept the backup at
// src/Scoreboard.fs.proofbak, and killing the run mid-compile left BOTH a
// broken tracked source file and an untracked .proofbak sitting in src/. Hit
// for real when a run was killed on a timeout. A checker that corrupts the
// working tree when interrupted is worse than no checker.
const BACKUP = join(tmpdir(), 'field-laboratory-proof-check.fs')
const MARKER = 'let private __proof'
// Any top-level `let` in the target works as an anchor; this one is stable and
// sits below every type the proof cases reference.
const ANCHOR = 'let private dramaText (g: Game) (state: GameState) ='

const build = () => {
  try {
    return execSync('dotnet build src/Laboratory.fsproj --no-restore -clp:NoSummary', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    // A failed build is the expected outcome for a proof case, not an error.
    return `${e.stdout || ''}${e.stderr || ''}`
  }
}

/** Extracts `<!-- proof: FSxxxx -->` + the following fsharp block. */
const parseCases = doc => {
  const cases = []
  const re = /<!--\s*proof:\s*(FS\d+)\s*-->\s*\n+```fsharp\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(doc)) !== null) cases.push({ code: m[1], body: m[2].trimEnd() })
  return cases
}

const cases = DOCS().flatMap(f =>
  parseCases(readFileSync(`docs/${f}`, 'utf8')).map(c => ({ ...c, doc: f })))
const { check, summarize } = createChecks()

// Repair before doing anything else, so a previous interrupted run cannot make
// this one report against an injected tree.
if (readFileSync(TARGET, 'utf8').includes(MARKER)) {
  if (existsSync(BACKUP)) {
    writeFileSync(TARGET, readFileSync(BACKUP, 'utf8'))
    console.error(`proof-check: repaired ${TARGET} from a previous interrupted run`)
  } else {
    console.error(`proof-check: ${TARGET} contains injected proof code and no backup exists.`)
    console.error('Restore it (git checkout) before re-running.')
    process.exit(1)
  }
}

const source = readFileSync(TARGET, 'utf8')
const registrySource = readFileSync(REGISTRY, 'utf8')
writeFileSync(BACKUP, source)
writeFileSync(`${BACKUP}.registry`, registrySource)

// The original is held in memory AND on disk outside the repo, and restored on
// every exit path including signals — a plain try/finally does not run on
// SIGTERM, which is exactly how the tree got left broken.
// NOT one-shot. An earlier version guarded this with a `restored` flag, so the
// second phase's `finally` was a no-op after the first phase had already
// restored — leaving the mutated Sport union on disk and every later run
// failing its own baseline. Writing the originals back is idempotent; the
// unlinks are existence-checked. There is nothing to guard against.
const restore = () => {
  try {
    writeFileSync(TARGET, source)
    writeFileSync(REGISTRY, registrySource)
    if (existsSync(BACKUP)) unlinkSync(BACKUP)
    if (existsSync(`${BACKUP}.registry`)) unlinkSync(`${BACKUP}.registry`)
  } catch { /* best effort — the on-disk backups are the fallback */ }
}
process.on('exit', restore)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { restore(); process.exit(130) })
}

// The baseline matters more than it looks. If the tree did not compile, every
// violation below would "fail to build" and the whole suite would pass while
// proving nothing at all.
const baseline = build()
const baselineClean = !/error FS\d+/.test(baseline)
check('baseline tree compiles', baselineClean,
  (baseline.match(/error FS\d+.*/g) || []).slice(0, 2).join(' | '))

check('the proof doc contains machine-checkable cases', cases.length > 0,
  `${cases.length} case(s) across ${DOCS().join(', ')}`)

if (baselineClean && cases.length > 0 && source.includes(ANCHOR)) {
  try {
    for (const [i, c] of cases.entries()) {
      const indented = c.body.split('\n').map(l => (l ? `    ${l}` : l)).join('\n')
      const injected = `let private __proof${i} (g: Game) =\n${indented}\n\n${ANCHOR}`
      writeFileSync(TARGET, source.replace(ANCHOR, injected))

      const out = build()
      const rejected = /error FS\d+/.test(out)
      const codes = [...new Set(out.match(/error FS\d+/g) || [])].join(', ')
      // Label with the line that actually carries the violation, not the
      // `match ... with` every case opens on — otherwise all four read alike.
      const lines = c.body.split('\n').map(l => l.trim()).filter(Boolean)
      const salient = lines.find(l => l.startsWith('|') && !/^\|\s*(None|_)\s*->\s*""$/.test(l))
        || lines[0]

      check(`${c.doc} case ${i + 1} rejected with ${c.code}: ${salient.slice(0, 34)}`,
        rejected && out.includes(`error ${c.code}`),
        rejected ? `compiler said ${codes}, doc claims ${c.code}` : 'COMPILED CLEANLY — the gate does not hold')
    }
  } finally {
    restore()
  }
} else if (!source.includes(ANCHOR)) {
  check('injection anchor still exists in the target', false, `not found in ${TARGET}: ${ANCHOR}`)
}

// --- registry completeness ---------------------------------------------------
// The Sport union's headline claim is "add a sport and the compiler makes you
// update the registry". That cannot be expressed as an injected expression
// body — it needs the type itself edited — so it gets its own phase rather than
// being asserted in prose and left unchecked, which is the exact failure this
// whole script exists to prevent.
if (baselineClean) {
  try {
    const withCase = registrySource.replace(
      /(\n    \| MLB\n)(    \| Unrecognised)/, '$1    | NHL\n$2')
    if (withCase === registrySource) {
      check('registry mutation applied', false, 'could not add a probe case to the Sport union')
    } else {
      writeFileSync(REGISTRY, withCase)
      const out = build()
      check('adding a Sport case without the registry does not compile',
        /error FS0025/.test(out) && /NHL/.test(out),
        /error FS0025/.test(out) ? 'FS0025 raised but did not name the new case'
                                 : 'COMPILED CLEANLY — the registry is not exhaustive')
    }
  } finally {
    restore()
  }
}

console.log(`\ndocs/*-PROOF.md: ${cases.length} claimed rejection(s), each compiled for real\n`)
process.exit(summarize() === 0 ? 0 : 1)
