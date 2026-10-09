// The block a human is told to paste into the cloud environment's Setup script
// field, checked before they paste it.
//
// WHY THIS IS THE ONE AUTOMATABLE PART. The field itself cannot be written from
// inside a session: environment-manager receives it as an inbound stdin payload
// from the API and talking back needs ENVIRONMENT_SERVICE_KEY, which is unset.
// What CAN be checked is the text docs/SETUP-SCRIPT.md tells a human to paste —
// and that text is the only thing a future session will copy.
//
// WHAT IT IS GUARDING AGAINST, measured rather than imagined:
//
//   2026-08-09  docs/CC-CMD-2026-08-09-fix-cloud-setup-and-scaffold-fable.md
//               records `Setup script failed with exit code 254` and names the
//               cause: "a bare `npm install`".
//   2026-09-22  the only session_mode:"new" boot this environment has logged
//               died. Its fossil is still on disk: /home/user/package-lock.json
//               reading {"name":"user","packages":{}} — the lockfile `npm
//               install` writes in an empty directory, named after the cwd's
//               basename — born 00:36:55.760, 26.6 ms before
//               environment_init_failed.
//   2026-10-09  a human read the field's log. Same eight lines, same exit 254,
//               61 days later. The field had never been corrected.
//
// So the two things that must never be in that block are npm and a repo path:
// the setup script runs with cwd /home/user, where no package.json exists and
// never will, because the four repos clone into SUBDIRECTORIES and npm resolves
// a package.json only by walking UP.
import { readFileSync } from 'node:fs'
import { createChecks, isMain } from './checks.mjs'

const DOC = 'docs/SETUP-SCRIPT.md'

/** The first fenced bash block in the doc — the thing a human copies. */
export const pasteBlock = (text) => {
  const m = /```bash\n([\s\S]*?)```/.exec(text)
  return m ? m[1] : null
}

// THE SHARED BUDGET, which is why this number is not 240.
//
// `timeout 240` was chosen when the setup script was believed to run before and
// apart from the repository checkout. It does not: the init script runs INSIDE
// the same env_init phase, AFTER checkout. Measured on this environment's only
// new-mode boot — sources_processing 51.855 s, of which jubilant-bassoon alone
// was 42.49 s for 465,871,184 bytes — so 52 + 240 leaves roughly 8 seconds of
// margin against the ~300 s phase budget, on an environment whose largest clone
// keeps growing. A slow clone day would convert the remedy into a phase timeout:
// the same dead container, with no npm error left to point at.
export const PHASE_BUDGET_S = 300
export const MEASURED_CHECKOUT_S = 52
export const MAX_TIMEOUT_S = 120

export const timeoutOf = (block) => {
  const m = /\btimeout\s+(\d+)\b/.exec(block ?? '')
  return m ? Number(m[1]) : null
}

/** Every reason this block must not be pasted. Empty array = safe. */
export const objections = (block) => {
  const out = []
  if (block == null) return ['no fenced bash block found in the doc']
  if (/\bnpm\b/.test(block)) out.push('names npm — the field runs with cwd /home/user, where no package.json exists (exit 254, measured 2026-08-09 and again 2026-10-09)')
  if (/\byarn\b|\bpnpm\b/.test(block)) out.push('names another node package manager, same failure as npm')
  if (/field-laboratory|field-playground|field-relay-nba|jubilant-bassoon/.test(block)) out.push('names a repository path — the field provisions the VM, and a block that depends on one repo breaks every session attached to the others')
  const t = timeoutOf(block)
  if (t == null) out.push('declares no timeout, so a hang spends the whole env_init budget')
  else if (t > MAX_TIMEOUT_S) out.push(`timeout ${t}s exceeds ${MAX_TIMEOUT_S}s; env_init is shared with checkout (measured ${MEASURED_CHECKOUT_S}s) against a ~${PHASE_BUDGET_S}s budget`)
  if (!/\nexit 0\s*$/.test(block)) out.push('does not end with a bare `exit 0`, so its status depends on operator precedence')
  return out
}

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const SAFE = "#!/bin/bash\ntimeout 120 bash -c 'apt-get update'\ndotnet --version || true\nexit 0\n"

  check('the documented block is extracted from its fence',
    pasteBlock('intro\n```bash\nexit 0\n```\ntail') === 'exit 0\n')
  check('a doc with no bash fence yields null, which is its own objection',
    pasteBlock('no fences here') === null && objections(null).length === 1)
  check('a safe block raises no objection', objections(SAFE).length === 0,
    JSON.stringify(objections(SAFE)))

  // THE 2026-08-09 / 2026-09-22 / 2026-10-09 FAILURE, as a fixture.
  check('A BARE npm install IS REFUSED — the actual 61-day outage',
    objections(SAFE.replace('apt-get update', 'npm install')).some(o => /names npm/.test(o)),
    'this is the exact content that killed every new session for 61 days')
  check('yarn and pnpm are refused for the same reason',
    objections(SAFE.replace('apt-get update', 'yarn install')).some(o => /package manager/.test(o)) &&
    objections(SAFE.replace('apt-get update', 'pnpm i')).some(o => /package manager/.test(o)))
  check('a repo path is refused',
    objections(SAFE.replace('apt-get update', 'cd /home/user/jubilant-bassoon'))
      .some(o => /repository path/.test(o)),
    'the field provisions the VM; a session attached to another repo would get nothing')

  check('THE SHARED BUDGET IS ENFORCED: timeout 240 is refused',
    objections(SAFE.replace('timeout 120', 'timeout 240')).some(o => /exceeds 120s/.test(o)),
    '240 was sized as if the setup script had its own clock; it shares env_init with checkout')
  check('...and 120 is accepted', timeoutOf(SAFE) === 120 && objections(SAFE).length === 0)
  check('a missing timeout is its own objection, not silence',
    objections(SAFE.replace('timeout 120 ', '')).some(o => /declares no timeout/.test(o)))
  check('the budget arithmetic leaves real margin',
    MEASURED_CHECKOUT_S + MAX_TIMEOUT_S < PHASE_BUDGET_S &&
    MEASURED_CHECKOUT_S + 240 > PHASE_BUDGET_S - 10,
    `${MEASURED_CHECKOUT_S}+${MAX_TIMEOUT_S} must fit in ${PHASE_BUDGET_S}; ${MEASURED_CHECKOUT_S}+240 must not`)
  check('a block not ending in exit 0 is refused',
    objections("#!/bin/bash\ntimeout 120 true\n").some(o => /exit 0/.test(o)))

  process.exit(summarize() === 0 ? 0 : 1)
}

if (isMain(import.meta.url)) {
  const { check, summarize } = createChecks()
  const block = pasteBlock(readFileSync(DOC, 'utf8'))
  const bad = objections(block)
  console.log(`\n  ${DOC}: the block a human is told to paste is ${block ? `${block.split('\n').length} lines` : 'ABSENT'}\n`)
  check('the documented paste block cannot kill a session the way the field did',
    bad.length === 0,
    bad.map(o => `\n        - ${o}`).join(''))
  process.exit(summarize() === 0 ? 0 : 1)
}
