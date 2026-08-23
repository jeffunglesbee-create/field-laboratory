// Renders STATUS.md: one place that answers "where does everything stand?"
//
// This exists because the same question kept being asked out loud — is the page
// up, did the secret land, has the sentinel found anything — and answering it
// meant opening four workflows and reading their logs. Every fact below is
// probed live at run time; nothing is asserted from workflow history.
//
// Deliberately writes no timestamp. A "last checked" line would change on every
// run and produce a commit a day saying nothing. The file changes only when a
// real fact changes, so its git history is a log of things actually happening.

import { readFile, writeFile } from 'node:fs/promises'
import { newestDeployableCommit } from './deployable.mjs'

/// The "Serving commit" cell for a live target. The old text said only "(behind
/// `main`)" whenever the published commit differed from HEAD — which is the
/// EXPECTED state when docs/[skip ci] commits sit on top, so it could not tell a
/// correct deploy from a failed one. This answers the real question: is the
/// published artifact the newest DEPLOYABLE commit?
export const deployedCell = (published, deployable, head) => {
  const short = s => s.slice(0, 7)
  if (deployable && published === deployable) return `\`${short(published)}\` — newest deployable ✓`
  if (deployable && published !== deployable) {
    return `\`${short(published)}\` — behind newest deployable \`${short(deployable)}\` (deploy not landed)`
  }
  // No deployable commit found in reach (shallow history) — fall back to the
  // plain HEAD comparison rather than assert something unproven.
  return `\`${short(published)}\`${head && published !== head ? ' (behind `main`)' : ''}`
}

const ROOT = new URL('..', import.meta.url).pathname
const HEAD = (process.env.GITHUB_SHA || '').trim()

// One clock read, captured once at the top, then passed down — the same shape
// `gameStateAt` uses and the one `row-confidence` requires. A second read could
// straddle a boundary between two lines, which is how CI run 31456294086 failed.
const NOW = new Date()

const TARGETS = [
  {
    name: 'Cloudflare Workers',
    url: 'https://field-laboratory.jeffunglesbee.workers.dev',
    blocked: 'needs `CLOUDFLARE_API_TOKEN` as a repository secret — see docs/DEPLOY.md',
  },
  {
    name: 'GitHub Pages',
    url: 'https://jeffunglesbee-create.github.io/field-laboratory/',
    blocked: 'needs Pages switched on: Settings → Pages → Source: GitHub Actions (private repos need a paid plan)',
  },
]

async function probe(target) {
  const out = { ...target, live: false, code: null, commit: null, note: '' }
  try {
    const res = await fetch(target.url, { redirect: 'follow' })
    out.code = res.status
    const body = await res.text()
    // A 200 alone is not proof: an assets host pointed at an empty directory
    // also returns 200. Require the real page.
    out.live = res.ok && body.includes('FIELD Laboratory')
    if (!out.live && res.ok) out.note = 'responded 200 but did not serve the laboratory page'
  } catch (e) {
    out.note = e.message
  }

  if (out.live) {
    try {
      const v = await fetch(new URL('version.txt', target.url.endsWith('/') ? target.url : target.url + '/'))
      if (v.ok) out.commit = (await v.text()).trim()
    } catch { /* version.txt is a nicety, not a requirement */ }
  }
  return out
}

const results = await Promise.all(TARGETS.map(probe))

// Latest drift-sentinel row, if the log exists yet.
let drift = '_no runs recorded yet_'
try {
  const log = await readFile(`${ROOT}outbox/drift-log.md`, 'utf8')
  const rows = log.split('\n').filter(l => l.startsWith('| 20'))
  if (rows.length) {
    const cols = rows[rows.length - 1].split('|').map(c => c.trim())
    // | run | payload date | games | status | malformed | note |
    drift = `\`${cols[4]}\` on ${cols[2]} — ${cols[3]} games, ${cols[5]} malformed (${rows.length} run${rows.length === 1 ? '' : 's'} logged)`
  }
} catch { /* log appears after the sentinel's first run */ }

/**
 * Render the verdict for a verify run. Exported and pure so it can be exercised
 * against recorded API responses — the fetch is the only part that needs a
 * network, and it should not be the only part that is ever tested.
 */
/**
 * How long a run may sit without an update before "running" stops being news.
 *
 * verify's longest real run today was 9 minutes end to end, and its slowest
 * single step (mutation testing) took 6m37s. 45 minutes is well clear of both
 * and well under the hour that run 31501321990 sat at.
 */
export const STALL_MINUTES = 45

export const verifyVerdict = (run, head, now = null) => {
  const sha = run.head_sha.slice(0, 7)
  const stale = head && run.head_sha !== head
  if (run.status !== 'completed') {
    // A run that has been "running" for an hour is not in progress, and
    // "**running**" reads as neutral — the softening this section exists to
    // prevent, arriving through the one branch that looked harmless.
    //
    // Not hypothetical, and the real cause is worse than the one I first wrote
    // here. Run 31501321990 (771cf8e) FINISHED, successfully, at 14:40:55 — its
    // job reports `completed`/`success` with every step green. The runs
    // endpoint THIS FUNCTION READS reported it `in_progress` with `updated_at`
    // stuck at 14:24:25 for more than ninety minutes afterwards.
    //
    // So this does not guard against a stuck run. It guards against a stale
    // answer from the endpoint the whole section depends on — and the damage
    // runs the other way from what I assumed: the file would have withheld a
    // true green indefinitely, not masked a red. Either way the reader is told
    // something that is not so, which is the 30-point row in the rubric.
    //
    // I called it stuck after reading one endpoint. The jobs endpoint disagreed
    // and I had not asked it. One source, one direction — again.
    const idleMs = now ? new Date(now) - new Date(run.updated_at) : 0
    if (idleMs > STALL_MINUTES * 60_000) {
      return `**STALLED** on \`${sha}\` — no update for ${Math.round(idleMs / 60_000)} minutes`
        + ` — [run ${run.id}](${run.html_url})`
    }
    return `**running** on \`${sha}\``
  }
  if (run.conclusion === 'success') {
    return `**green** on \`${sha}\`${stale ? ' — but that is not `main` HEAD' : ''}`
  }
  // Named and shouted, not softened. A red main is the fact this exists for.
  return `**${run.conclusion.toUpperCase()}** on \`${sha}\` — [run ${run.id}](${run.html_url})`
}

export const verifyRunsUrl = repo =>
  `https://api.github.com/repos/${repo}/actions/workflows/verify.yml/runs?branch=main&per_page=1`

/**
 * Read verify's latest conclusion for main, and say WHY when it cannot be read.
 *
 * The first version wrapped the whole thing in `catch {}` and fell back to one
 * sentence — "unknown — the workflow history could not be read" — for every
 * failure mode there is. That is a check that answers in one direction, which is
 * the failure this repo keeps rediscovering, and it did not stay theoretical for
 * long: the first two runs after it shipped wrote DIFFERENT answers from the
 * same code, minutes apart.
 *
 *   status run 31505791630 -> commit 363dd93 -> "unknown"
 *   status run 31506346702 -> commit 4152f64 -> "**running** on 5d41454"
 *
 * The cause is real and was reconstructible only from outside the repo: a
 * `workflow_run` job uses the workflow FILE from the default branch as of the
 * triggering event, and the first of those two fired from an event created
 * before the commit that added `GITHUB_TOKEN` to this step. So it ran the new
 * script under the old workflow, with no token, and said "unknown" — correctly,
 * for a reason nothing recorded. I had to compare two runs' head_shas against
 * the commit history to learn that. It should have been one line in the log.
 *
 * So every outcome now names itself, and the two that mean something is broken
 * are reported as problems rather than as an absence of news.
 *
 * `fetchImpl` is injected so the classification can be exercised offline against
 * each shape; the call itself is exercised for real against api.github.com by
 * scripts/status-live-check.mjs, on a runner, in both directions.
 */
export const readVerify = async ({ token, repo, head, inCI, now = null, fetchImpl = fetch }) => {
  if (!token || !repo) {
    // On a runner this is a misconfigured step, not a missing fact — and it is
    // exactly what happened above. Outside CI there is no history to read and
    // nothing is wrong.
    return inCI
      ? { text: 'unreadable — this step ran without `GITHUB_TOKEN`/`GITHUB_REPOSITORY`, so no read was attempted',
          problem: 'no token on a runner' }
      : { text: 'not read — rendered outside CI, where there is no workflow history to read',
          problem: null }
  }

  let res
  try {
    res = await fetchImpl(verifyRunsUrl(repo),
      { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } })
  } catch (e) {
    return { text: `unreadable — the workflow-history request failed: ${e.message}`, problem: e.message }
  }
  if (!res.ok) {
    return { text: `unreadable — the workflow-history API answered ${res.status}`, problem: `HTTP ${res.status}` }
  }

  let run
  try {
    run = (await res.json()).workflow_runs?.[0]
  } catch (e) {
    return { text: `unreadable — the workflow-history response did not parse: ${e.message}`, problem: e.message }
  }
  // An empty list is an answer, not a failure: a repo with no verify run yet.
  if (!run) return { text: 'no verify run has been recorded for `main` yet', problem: null }
  return { text: verifyVerdict(run, head, now), problem: null }
}

// Nothing below runs on import.
//
// `status-verdict-check.mjs` imports `verifyVerdict` from this file, and without
// this guard that import EXECUTED the whole script — probing from a sandbox with
// no egress and overwriting STATUS.md with "not published" for every target.
// A check that rewrites the artifact it is checking is the same failure as the
// mutation whose unquoted glob CREATED the file it then measured.
if (import.meta.url === `file://${process.argv[1]}`) {

  // --- is main actually green? -------------------------------------------------
  //
  // The ONE fact here that cannot be probed live, and the one whose absence let a
  // false claim stand. On 2026-08-11 I reported "main at 73ffdd0, gate 420/420"
  // from a LOCAL run while CI on that commit was red, and nothing in the repo
  // disagreed — because this file deliberately never read workflow history.
  //
  // "Probe live rather than trust history" is the right default and it has no
  // answer for "did the suite pass for this commit". That is history by nature.
  // So it is read, and labelled as the exception rather than smuggled in beside
  // the probes.
  const { text: verify, problem } = await readVerify({
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPOSITORY,
    head: HEAD,
    inCI: process.env.GITHUB_ACTIONS === 'true',
    now: NOW,
  })

  const liveOnes = results.filter(r => r.live)

  // The newest deployable commit — computed once, so the table can say whether a
  // published artifact that is behind HEAD is correctly behind (docs on top) or
  // a deploy that did not land.
  const deployable = newestDeployableCommit()

  const lines = [
    '# Status',
    '',
    '_Generated by `.github/workflows/status.yml`. Every line below is probed live,',
    'not read from workflow history — with one labelled exception, `verify` below,',
    'which is history by nature. Edits here will be overwritten._',
    '',
    '## Did the suite pass on main?',
    '',
    verify,
    '',
    '## Is it published?',
    '',
    liveOnes.length
      ? liveOnes.map(r => `**Yes** — ${r.name}: <${r.url}>`).join('\n\n')
      : '**No.** Neither deploy target is serving the page yet. Both are built and waiting on one human action each; whichever is unblocked first goes live on its own within the hour.',
    '',
    '| Target | State | Serving commit |',
    '| --- | --- | --- |',
    ...results.map(r => {
      const state = r.live
        ? 'live'
        : `not published — ${r.blocked}`
      const commit = r.live
        ? (r.commit ? deployedCell(r.commit, deployable, HEAD) : 'unknown')
        : '—'
      return `| ${r.name} | ${state} | ${commit} |`
    }),
    '',
    '## Drift sentinel',
    '',
    drift,
    '',
    'Full history: [`outbox/drift-log.md`](outbox/drift-log.md)',
    '',
  ]

  await writeFile(`${ROOT}STATUS.md`, lines.join('\n'))

  console.log(lines.join('\n'))

  // The file is written FIRST and the job fails after, so the reason lands on
  // main rather than only in a run log that has to be gone looking for. The
  // steps after this one are `if: always()` for the same reason.
  //
  // This is deliberately a failure and not a warning. The whole point of the
  // section above is to be the thing that contradicts a false "main is green",
  // and a status file that quietly cannot read history is back to being unable
  // to contradict anything.
  if (problem) {
    console.log(`::error::verify's conclusion for main could not be read (${problem})`)
    process.exit(1)
  }
}
