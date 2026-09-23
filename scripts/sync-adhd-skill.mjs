// Install the i-have-adhd skill into SIBLING repos, on a runner, via the GitHub
// API — so the cross-repo install is automated, not a command handed to a human.
//
// WHY THIS EXISTS
//
// `install-adhd-skill.mjs` installs the skill in whatever repo it runs from. That
// covers this repo and anyone who runs one command in theirs. It does NOT cover
// the repos this session cannot push to (field-relay-nba, jubilant-bassoon) — and
// leaving those as "run this curl yourself" is un-automated terminal work. This
// script closes that gap from a runner: given a token with write access, it
// installs the skill into each target repo through the Contents API, committing
// only when the file is absent or has drifted from source.
//
// CONFIG (env)
//   GH_TOKEN       required for any network op — a token with contents:write on
//                  every target repo. Supplied on the runner as a secret; there
//                  is no way to write another repo without one, which is the one
//                  irreducibly manual step (provisioning the credential).
//   TARGET_REPOS   comma-separated owner/repo. Defaults to the two siblings.
//   COMMIT_MESSAGE optional override for the commit subject.
//
// MODES
//   (default)   create-or-update the file on each target's default branch.
//   --dry-run   GET only: report per repo what WOULD happen. No writes.
//   --self-test the pure logic (base64 round-trip, the create/update/skip
//               decision, the front-matter invariant), no network.
//
// Node 22+ (global fetch). Self-test aside, no dependencies beyond node: builtins.

const SRC = 'https://raw.githubusercontent.com/ayghri/i-have-adhd/main/skills/i-have-adhd/SKILL.md'
const SKILL_PATH = '.claude/skills/i-have-adhd/SKILL.md'

const DRY_RUN = process.argv.includes('--dry-run')
const SELF_TEST = process.argv.includes('--self-test')

// IMPORTED, NOT RETYPED. This list held two repos while skill-drift-check.mjs
// watched three, so field-playground was a sibling the sentinel could report
// DRIFTED and this script could never fix. Measured 2026-09-23: all three had
// the pre-2026-09-20 Rule 9 and only two were in this array.
import { SIBLINGS } from './skill-drift-check.mjs'
const DEFAULT_TARGETS = SIBLINGS.map(r => `jeffunglesbee-create/${r}`)

/// utf8 identity — the "verbatim" test, exact to the byte.
const identical = (a, b) => a === b

/// The GitHub Contents API returns file content as base64 with embedded
/// newlines. Decode to the exact bytes so the comparison is real.
const decodeContent = b64 => Buffer.from(String(b64).replace(/\n/g, ''), 'base64').toString('utf8')
const encodeContent = text => Buffer.from(text, 'utf8').toString('base64')

/// What to do with a target, given its current file (or null) and the source.
/// The whole decision, isolated so it can be tested without a network.
const decideAction = (local, source) =>
  local === null ? 'create' : identical(local, source) ? 'skip' : 'update'

/// The front-matter a real i-have-adhd skill must carry. Refusing to push
/// anything that fails this is what stops a broken fetch becoming a broken
/// commit in someone else's repo.
const requiredFrontmatter = text =>
  /^---[\s\S]*?\nname:\s*i-have-adhd\s*(\n|$)/.test(text) &&
  /\ndisable-model-invocation:\s*true\s*(\n|$)/.test(text)

// ── self-test: pure logic, no network ────────────────────────────────────────

if (SELF_TEST) {
  const { createChecks } = await import('./checks.mjs')
  const { check, summarize } = createChecks()

  check('base64 round-trips the exact bytes, newlines in the encoded blob and all',
    decodeContent(encodeContent('a\nb\n')) === 'a\nb\n' &&
    decodeContent('YWJj\nCg==') === 'abc\n',
    'the API base64 decode is lossy — the newline-split blob the API returns must decode exactly')
  check('decideAction: absent file → create',
    decideAction(null, 'x') === 'create', 'an absent file is not created')
  check('decideAction: identical file → skip',
    decideAction('x', 'x') === 'skip', 'an identical file is rewritten anyway')
  check('decideAction: drifted file → update',
    decideAction('x', 'y') === 'update', 'a drifted file is left alone')
  check('requiredFrontmatter gates a malformed source out of a cross-repo push',
    requiredFrontmatter('---\nname: i-have-adhd\ndisable-model-invocation: true\n---\nb') &&
    !requiredFrontmatter('not a skill'),
    'a malformed source would be pushed to another repo')

  // THE DENOMINATOR, ASSERTED. The import above makes these lists structurally
  // one, but the failure being prevented is someone re-hardcoding the array —
  // which is how it came to hold two of three siblings in the first place. A
  // sync that cannot reach a repo the sentinel watches is a red nobody can act
  // on. Naming the missed repo explicitly, because it is the one that was lost.
  check('every sibling the drift check watches is a sync target',
    SIBLINGS.every(r => DEFAULT_TARGETS.includes(`jeffunglesbee-create/${r}`)) &&
    DEFAULT_TARGETS.length === SIBLINGS.length,
    'the sync targets and the drift-check siblings disagree')
  check('field-playground specifically is a target',
    DEFAULT_TARGETS.includes('jeffunglesbee-create/field-playground'),
    'field-playground drifted for three days while being outside the sync denominator')

  process.exit(summarize() === 0 ? 0 : 1)
}

// ── live: the API path ───────────────────────────────────────────────────────

const TOKEN = process.env.GH_TOKEN
if (!TOKEN) {
  console.error('::error::GH_TOKEN is required — a token with contents:write on every target repo. On the runner this is a repository secret; there is no way to write another repo without one.')
  process.exit(1)
}

const targets = (process.env.TARGET_REPOS || DEFAULT_TARGETS.join(','))
  .split(',').map(s => s.trim()).filter(Boolean)

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'field-laboratory-adhd-skill-sync',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  return r
}

const source = await (async () => {
  const r = await fetch(SRC, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`source fetch failed: HTTP ${r.status} for ${SRC}`)
  return await r.text()
})()
if (!requiredFrontmatter(source)) {
  throw new Error('fetched source failed the skill front-matter invariant; refusing to push a malformed skill anywhere')
}

const commitMessage = process.env.COMMIT_MESSAGE ||
  'Add i-have-adhd skill (verbatim from ayghri/i-have-adhd)'

let failures = 0
let wrote = 0

for (const repo of targets) {
  const label = repo.padEnd(40)
  try {
    // Default branch — the file is committed there, matching "push to main".
    const meta = await api(`/repos/${repo}`)
    if (!meta.ok) { console.log(`${label} ERROR   repo lookup HTTP ${meta.status}`); failures++; continue }
    const branch = (await meta.json()).default_branch

    // Current file, if any.
    const cur = await api(`/repos/${repo}/contents/${encodeURIComponent(SKILL_PATH).replace(/%2F/g, '/')}?ref=${branch}`)
    let local = null, sha
    if (cur.ok) { const j = await cur.json(); local = decodeContent(j.content); sha = j.sha }
    else if (cur.status !== 404) { console.log(`${label} ERROR   file GET HTTP ${cur.status}`); failures++; continue }

    const action = decideAction(local, source)
    if (action === 'skip') { console.log(`${label} skip    already byte-identical on ${branch}`); continue }

    if (DRY_RUN) { console.log(`${label} WOULD ${action.toUpperCase()} on ${branch} (dry-run)`); continue }

    const put = await api(`/repos/${repo}/contents/${SKILL_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: commitMessage,
        content: encodeContent(source),
        branch,
        ...(sha ? { sha } : {}),
      }),
    })
    if (!put.ok) { console.log(`${label} ERROR   PUT HTTP ${put.status} ${(await put.text()).slice(0, 120)}`); failures++; continue }
    console.log(`${label} ${action === 'create' ? 'CREATED' : 'UPDATED'} on ${branch}`)
    wrote++
  } catch (e) {
    console.log(`${label} ERROR   ${String(e).slice(0, 100)}`)
    failures++
  }
}

console.log(`\n${wrote} written, ${failures} failed, across ${targets.length} target(s)${DRY_RUN ? ' (dry-run)' : ''}`)
process.exit(failures ? 1 : 0)
