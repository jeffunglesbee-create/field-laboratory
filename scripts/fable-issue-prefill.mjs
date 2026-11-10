// Searches the Fable repository for an existing report of the compiler crash, and writes the issue as a one-click link.
//
// WHY THIS EXISTS. outbox/fable-crash-upstream-issue.md is a report for fable-compiler/Fable. Filing it posts as the owner on a
// repository this project does not own, and the session that wrote it was refused access to that repository and has no token
// for it. What a runner CAN do without a credential of that kind is the two things that stood in front of the click: look for
// a duplicate, and put the whole issue into a link that opens GitHub's own new-issue page already filled in.
//
// WHAT IT DOES NOT DO: post anything. It reads the public search API and writes a file. The owner's click is the filing.
//
// THE RULE THIS FILE HOLDS TO. A search that failed must not read as a search that found nothing: every non-200, every body that
// is not JSON, and a response GitHub marks incomplete ends in an error or in the word INCOMPLETE, never in "no duplicate". The
// verdict prints how many queries ran and how many issues they returned, so a quiet result still states what it covered.
//
// Usage:
//   node scripts/fable-issue-prefill.mjs [--issue FILE] [--out FILE]   search, then write the verdict and the link to --out
//   node scripts/fable-issue-prefill.mjs --self-test                   no network
// GITHUB_TOKEN, when set, only raises the search rate limit; it is never printed and never needs a scope.

import { readFileSync, writeFileSync } from 'node:fs'
import { createChecks, finish, isMain } from './checks.mjs'

export const TARGET_REPO = 'fable-compiler/Fable'
// GitHub truncates a new-issue link past about 8 KB; this leaves room for the host and the title.
export const MAX_LINK = 7500

/** `Title: ...` on the first line, then everything after the first line that is exactly `---`. */
export const parseIssue = text => {
  const lines = text.split('\n')
  const first = lines[0] ?? ''
  if (!first.startsWith('Title: ')) throw new Error('the issue file must open with "Title: "')
  const rule = lines.indexOf('---')
  if (rule < 0) throw new Error('the issue file has no "---" line between its instructions and its body')
  const body = lines.slice(rule + 1).join('\n').trim()
  if (body === '') throw new Error('the issue file has an empty body')
  return { title: first.slice('Title: '.length).trim(), body }
}

/** The three ways a report of this crash would be worded. Each is scoped to the repository, or it would search all of GitHub. */
export const queries = (repo = TARGET_REPO) => [
  `repo:${repo} "code 193"`,
  `repo:${repo} "internal error" "Object reference not set to an instance of an object"`,
  `repo:${repo} "internal error" "Thoth.Json"`,
]

/**
 * One query, through an injected fetch so the self-test needs no network. Throws on anything that is not a complete answer.
 * Returns {total, items: [{number, title, state, url}]}.
 */
export const search = async (fetchFn, query, token) => {
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=30`
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'field-laboratory-issue-prefill' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetchFn(url, { headers })
  const text = await res.text()
  if (res.status !== 200) throw new Error(`search ${JSON.stringify(query)} answered ${res.status}: ${text.slice(0, 200)}`)
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`search ${JSON.stringify(query)} answered 200 with a body that is not JSON: ${text.slice(0, 80)}`) }
  if (!Array.isArray(data.items) || typeof data.total_count !== 'number') throw new Error(`search ${JSON.stringify(query)} answered without items and total_count`)
  return {
    total: data.total_count,
    incomplete: data.incomplete_results === true,
    items: data.items.map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url })),
  }
}

/** The union of the queries' issues by number, and what the verdict has to say about how much was covered. */
export const combine = results => {
  const byNumber = new Map()
  for (const r of results) for (const i of r.items) if (!byNumber.has(i.number)) byNumber.set(i.number, i)
  return {
    issues: [...byNumber.values()].sort((a, b) => a.number - b.number),
    queries: results.length,
    // A query whose total is larger than the page it returned has issues this run never read.
    truncated: results.some(r => r.total > r.items.length),
    incomplete: results.some(r => r.incomplete),
  }
}

export const verdictOf = c => {
  if (c.incomplete) return `INCOMPLETE — GitHub marked a search incomplete (${c.queries} queries, ${c.issues.length} distinct issues read); search by hand before filing`
  if (c.truncated) return `INCOMPLETE — a search had more results than one page (${c.queries} queries, ${c.issues.length} distinct issues read); search by hand before filing`
  if (c.issues.length === 0) return `NO DUPLICATE FOUND (${c.queries} queries, 0 issues returned)`
  return `POSSIBLE DUPLICATE: ${c.issues.length} issue(s) (${c.queries} queries) — read them before filing`
}

/** GitHub's own new-issue page, filled in. */
export const prefillLink = (issue, repo = TARGET_REPO) => {
  const link = `https://github.com/${repo}/issues/new?title=${encodeURIComponent(issue.title)}&body=${encodeURIComponent(issue.body)}`
  if (link.length > MAX_LINK) throw new Error(`the prefilled link is ${link.length} characters, over ${MAX_LINK}: GitHub would cut the body; shorten the issue`)
  return link
}

export const render = ({ issue, combined, link, repo = TARGET_REPO }) => [
  '# The Fable crash report: duplicate search and one-click link',
  '',
  `**${verdictOf(combined)}**`,
  '',
  ...(combined.issues.length
    ? ['| # | state | title |', '|---|---|---|', ...combined.issues.map(i => `| [${i.number}](${i.url}) | ${i.state} | ${i.title.replace(/\|/g, '\\|')} |`), '']
    : []),
  `Repository: ${repo}. Report: \`outbox/fable-crash-upstream-issue.md\`. Nothing was posted: this file is the search and the link.`,
  '',
  `**Open this link and press "Submit new issue"** (${link.length} characters; the title and the body are already in it):`,
  '',
  link,
  '',
].join('\n')

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  const { check, summarize } = createChecks()
  const fakeFetch = (status, body) => async () => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
  const hit = n => ({ number: n, title: `t${n}`, html_url: `https://x/${n}`, state: 'open' })
  // A rejection test passes only when the error says WHY: a call that throws for a second reason would let the clause under test
  // be deleted without a test noticing (the first sweep of this file found three such).
  const rejects = async (p, why) => { try { await p; return false } catch (e) { return why.test(String(e.message)) } }
  const throwsWith = (fn, why) => { try { fn(); return false } catch (e) { return why.test(String(e.message)) } }

  const file = 'Title: `dotnet fable` 5.13.0: sporadic crash\n\n(Paste below)\n\n---\n\n**What happens.** A.\n\nSecond paragraph.\n'
  const p = parseIssue(file)
  check('parseIssue: the title is the rest of the first line', p.title === '`dotnet fable` 5.13.0: sporadic crash', p.title)
  check('parseIssue: the body is everything after the first --- line, trimmed', p.body === '**What happens.** A.\n\nSecond paragraph.', JSON.stringify(p.body))
  check('parseIssue: a file with no Title line is refused FOR THAT (it has its --- line)', throwsWith(() => parseIssue('intro\n---\nbody'), /must open with "Title: "/), 'must throw about the title')
  check('parseIssue: a file with no --- line is refused FOR THAT (it has its Title)', throwsWith(() => parseIssue('Title: x\nbody'), /no "---" line/), 'must throw about the rule')
  check('parseIssue: an empty body is refused FOR THAT', throwsWith(() => parseIssue('Title: x\n---\n\n'), /empty body/), 'must throw about the body')
  check('parseIssue: a --- inside the body does not end the instructions early', parseIssue('Title: x\n\n---\n\nA\n---\nB').body === 'A\n---\nB', 'the FIRST rule splits')

  const qs = queries()
  check('queries: three, each scoped to the repository', qs.length === 3 && qs.every(q => q.startsWith(`repo:${TARGET_REPO} `)), JSON.stringify(qs))
  check('queries: they ask for the crash by its code and by its words', /code 193/.test(qs[0]) && /Object reference not set/.test(qs[1]), JSON.stringify(qs))

  const ok = await search(fakeFetch(200, { total_count: 1, incomplete_results: false, items: [hit(7)] }), qs[0], 'tok')
  check('search: a 200 with items is read', ok.total === 1 && ok.items[0].number === 7 && ok.items[0].url === 'https://x/7' && ok.incomplete === false, JSON.stringify(ok))
  // The 403 and 422 bodies are VALID search answers on purpose: only the status can reject them.
  check('search: a 403 (rate limit) is an error, never "none found", whatever the body says', await rejects(search(fakeFetch(403, { total_count: 0, items: [] }), qs[0]), /answered 403/), 'must reject on the status')
  check('search: a 422 is an error', await rejects(search(fakeFetch(422, { total_count: 0, items: [] }), qs[0]), /answered 422/), 'must reject on the status')
  check('search: a 200 that is not JSON is an error', await rejects(search(fakeFetch(200, '<html>'), qs[0]), /not JSON/), 'must reject on the body')
  check('search: a 200 JSON with no items is an error, said so', await rejects(search(fakeFetch(200, { message: 'x' }), qs[0]), /without items and total_count/), 'must reject on the shape')
  check('search: a 200 JSON whose items is not a list is an error, said so', await rejects(search(fakeFetch(200, { total_count: 1, items: null }), qs[0]), /without items and total_count/), 'must reject on the shape')
  let sent
  await search(async (u, o) => { sent = { u, o }; return { status: 200, text: async () => '{"total_count":0,"items":[]}' } }, 'repo:a/b "x y"', 'secret-token')
  check('search: the query is URL-encoded and the token goes in the header only', sent.u.includes(encodeURIComponent('repo:a/b "x y"')) && !sent.u.includes('secret-token') && sent.o.headers.Authorization === 'Bearer secret-token', sent.u)
  await search(async (u, o) => { sent = { u, o }; return { status: 200, text: async () => '{"total_count":0,"items":[]}' } }, 'q')
  check('search: no token, no Authorization header', !('Authorization' in sent.o.headers), JSON.stringify(sent.o.headers))

  const r = (items, total = items.length, incomplete = false) => ({ total, incomplete, items })
  const both = combine([r([hit(2), hit(1)]), r([hit(2), hit(3)])])
  check('combine: the union by number, sorted', both.issues.map(i => i.number).join() === '1,2,3' && both.queries === 2, JSON.stringify(both.issues.map(i => i.number)))
  check('verdict: nothing found says so WITH its denominator', /^NO DUPLICATE FOUND \(3 queries, 0 issues returned\)$/.test(verdictOf(combine([r([]), r([]), r([])]))), verdictOf(combine([r([]), r([]), r([])])))
  check('verdict: something found says POSSIBLE DUPLICATE', /^POSSIBLE DUPLICATE: 3 issue/.test(verdictOf(both)), verdictOf(both))
  check('verdict: an incomplete search is INCOMPLETE, not "no duplicate"', /^INCOMPLETE/.test(verdictOf(combine([r([], 0, true)]))), verdictOf(combine([r([], 0, true)])))
  check('verdict: more results than the page read is INCOMPLETE', /^INCOMPLETE/.test(verdictOf(combine([r([hit(1)], 60)]))), verdictOf(combine([r([hit(1)], 60)])))
  check('verdict: ZERO results found but a total above zero is INCOMPLETE too', /^INCOMPLETE/.test(verdictOf(combine([r([], 4)]))), verdictOf(combine([r([], 4)])))

  const link = prefillLink({ title: 'a & b', body: 'line one\nline "two" % 100' })
  const u = new URL(link)
  check('prefillLink: the title and body survive a round trip through the URL', u.searchParams.get('title') === 'a & b' && u.searchParams.get('body') === 'line one\nline "two" % 100', link)
  check('prefillLink: it points at the new-issue page of the repository', u.origin + u.pathname === `https://github.com/${TARGET_REPO}/issues/new`, u.origin + u.pathname)
  check('prefillLink: a body that would be cut by GitHub is refused', throwsWith(() => prefillLink({ title: 't', body: 'x'.repeat(MAX_LINK) }), /over 7500/), 'must throw about the length')

  const real = parseIssue(readFileSync(new URL('../outbox/fable-crash-upstream-issue.md', import.meta.url), 'utf8'))
  const realLink = prefillLink(real)
  check('the real report parses and fits in one link', real.title.length > 20 && real.body.length > 500 && realLink.length <= MAX_LINK, `${real.body.length} characters of body, ${realLink.length} of link`)
  check('the real report has no leftover instruction text in its body', !/Paste everything below/.test(real.body) && !/^Title:/m.test(real.body), real.body.slice(0, 60))

  const out = render({ issue: p, combined: both, link })
  check('render: the verdict is the first thing and the link is in the file', out.split('\n')[2].startsWith('**POSSIBLE DUPLICATE') && out.includes(link), out.split('\n').slice(0, 4).join(' | '))
  check('render: a title with a pipe does not break the table', render({ issue: p, combined: combine([r([{ ...hit(1), title: 'a|b' }])]), link }).includes('a\\|b'), 'escaped')
  finish(summarize())
} else if (isMain(import.meta.url)) {
  const arg = n => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
  const issueFile = arg('--issue') ?? 'outbox/fable-crash-upstream-issue.md'
  const outFile = arg('--out') ?? 'outbox/fable-issue-prefill-latest.md'
  const issue = parseIssue(readFileSync(issueFile, 'utf8'))
  const token = process.env.GITHUB_TOKEN || undefined
  const results = []
  for (const q of queries()) results.push(await search(fetch, q, token))
  const combined = combine(results)
  const md = render({ issue, combined, link: prefillLink(issue) })
  writeFileSync(outFile, md)
  console.log(md)
  console.log(`wrote ${outFile}`)
}
