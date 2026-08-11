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

const ROOT = new URL('..', import.meta.url).pathname
const HEAD = (process.env.GITHUB_SHA || '').trim()

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
export const verifyVerdict = (run, head) => {
  const sha = run.head_sha.slice(0, 7)
  const stale = head && run.head_sha !== head
  if (run.status !== 'completed') return `**running** on \`${sha}\``
  if (run.conclusion === 'success') {
    return `**green** on \`${sha}\`${stale ? ' — but that is not `main` HEAD' : ''}`
  }
  // Named and shouted, not softened. A red main is the fact this exists for.
  return `**${run.conclusion.toUpperCase()}** on \`${sha}\` — [run ${run.id}](${run.html_url})`
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
  let verify = 'unknown — the workflow history could not be read'
  try {
    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPOSITORY
    if (token && repo) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/verify.yml/runs?branch=main&per_page=1`,
        { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } })
      if (res.ok) {
        const run = (await res.json()).workflow_runs?.[0]
        if (run) verify = verifyVerdict(run, HEAD)
      }
    }
  } catch { /* leave the unknown text, which is itself the honest answer */ }

  const liveOnes = results.filter(r => r.live)

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
        ? (r.commit ? `\`${r.commit.slice(0, 7)}\`${HEAD && r.commit !== HEAD ? ' (behind `main`)' : ''}` : 'unknown')
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

}
