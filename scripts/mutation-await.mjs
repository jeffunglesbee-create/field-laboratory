#!/usr/bin/env node
// Wait for the mutation shards of THIS workflow run to upload their results, then download them.
// docs/CC-CMD-2026-11-03-gate-speed.md, Task 4.
//
//   node scripts/mutation-await.mjs <dir> --of N [--attempts 80] [--interval 30]
//   node scripts/mutation-await.mjs --self-test
//
// WHY THE GATE POLLS INSTEAD OF DEPENDING. `verify-full`'s `full` job does not wait for the shard jobs to start: it builds,
// runs every other row (the proof checks alone are 13 minutes), and only its mutation row needs the shards. `needs:` would
// start the whole gate after the slowest shard and put the two long paths in series again. So the row asks the Actions API
// for the artifacts of this run, which is the same channel a downstream job would have used.
//
// IT FAILS LOUDLY, AND BY NAME. A shard that never uploads is the one input the merge cannot see: its file is simply not
// there. This script is the only place that can say WHICH shard, and why. Two ways to say it:
//   - a shard JOB that has completed with no artifact is dead; the gate stops waiting at the second poll that sees it
//     (one poll is not enough: a job can finish a moment before its upload becomes listable), and names the job and its
//     conclusion. It does not sit out the remaining forty minutes of a wait that cannot succeed.
//   - a shard that is still running when the attempts are spent is named with its job state.
//
// Time is counted in POLLS, not read from a clock: `attempts` x `interval` is the budget (80 x 30 s = 40 min). This script is
// named in the gate's mutation row, and row-confidence.mjs permits a clock read only as a captured constant.
//
// THE TOKEN GOES TO THE API AND NOWHERE ELSE. The artifact download answers with a redirect to blob storage; fetch drops the
// Authorization header across origins, and the self-test asserts the storage side never sees one.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChecks, finish, isMain } from './checks.mjs'

export const artifactName = (i, n) => `mutation-shard-${i}-of-${n}`
export const jobName = (i, n) => `mutation shard ${i} of ${n}`
const indexOf = name => Number(/^mutation-shard-(\d+)-of-/.exec(name)[1])

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** A 4xx cannot heal by waiting (bad token, wrong repository), so it is thrown as-is; a 5xx or a dropped connection is retried. */
class Transient extends Error {}

const getJson = async (url, token, fetchImpl) => {
  let res
  try {
    res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } })
  } catch (e) { throw new Transient(`${url}: ${e.message}`) }
  // Rate limiting heals by waiting: 429, and the 403 GitHub sends for a secondary limit (it carries retry-after or an exhausted x-ratelimit-remaining).
  const limited = res.status === 429 || (res.status === 403 && (res.headers.get('retry-after') || res.headers.get('x-ratelimit-remaining') === '0'))
  if (res.status >= 500 || limited) throw new Transient(`${url}: HTTP ${res.status}`)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}. Waiting longer cannot fix this (the token or the repository), so the wait stops here.`)
  // `await` inside the try: a body that ends early rejects here, and a returned promise would escape the catch.
  try { return await res.json() } catch (e) { throw new Transient(`${url}: the body did not arrive intact: ${e.message}`) }
}

const getAll = async (base, key, token, fetchImpl) => {
  const out = []
  for (let page = 1; ; page++) {
    const body = await getJson(`${base}${base.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token, fetchImpl)
    const items = body[key] ?? []
    out.push(...items)
    if (items.length < 100) return out
  }
}

/** The newest wins when a name appears twice (a re-run attempt uploads the same name again). */
const newestByName = arts => {
  const byName = new Map()
  for (const a of arts) {
    const had = byName.get(a.name)
    if (!had || a.id > had.id) byName.set(a.name, a)
  }
  return byName
}

const DOWNLOAD_TRIES = 3

/** One try. A dropped connection, a 5xx or 429, a body that ends early, a zip that will not open: Transient. Any other status: a plain Error, no retry. */
const downloadOnce = async ({ api, repo, token, art, name, dir, fetchImpl }) => {
  let res
  try {
    res = await fetchImpl(`${api}/repos/${repo}/actions/artifacts/${art.id}/zip`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }, redirect: 'follow' })
  } catch (e) { throw new Transient(`${name}: the download failed: ${e.message}`) }
  if (res.status >= 500 || res.status === 429) throw new Transient(`${name}: the download answered HTTP ${res.status}`)
  if (!res.ok) throw new Error(`${name}: the download answered HTTP ${res.status}`)
  let bytes
  try { bytes = Buffer.from(await res.arrayBuffer()) } catch (e) { throw new Transient(`${name}: the download body did not arrive intact: ${e.message}`) }
  const zip = join(dir, `${name}.zip`)
  writeFileSync(zip, bytes)
  const un = spawnSync('unzip', ['-o', '-q', zip, '-d', dir], { encoding: 'utf8' })
  rmSync(zip, { force: true })
  if (un.status !== 0) throw new Transient(`${name}: unzip failed (${un.status}): ${un.stderr || un.error?.message}`)
  const file = join(dir, `${name}.json`)
  if (!existsSync(file)) throw new Error(`${name}: the artifact was downloaded and does not contain ${name}.json`)
}

/** The signed address in the redirect is short-lived, so every try asks the API again. Bounded, and the last failure is thrown by name. */
const download = async args => {
  let last = null
  for (let t = 1; t <= DOWNLOAD_TRIES; t++) {
    try { return await downloadOnce(args) } catch (e) {
      if (!(e instanceof Transient)) throw e
      last = e
    }
  }
  throw new Error(`${last.message} (after ${DOWNLOAD_TRIES} tries)`)
}

export const awaitShards = async ({ api, repo, run, token, n, dir, attempts, intervalMs, fetchImpl = fetch, log = () => {} }) => {
  const want = Array.from({ length: n }, (_, k) => artifactName(k + 1, n))
  let deadBefore = new Set()
  let lastError = null
  let lastMissing = want
  let lastJobs = []
  let polls = 0

  for (let attempt = 1; attempt <= attempts; attempt++) {
    polls = attempt
    let byName
    let jobs = []
    try {
      byName = newestByName(await getAll(`${api}/repos/${repo}/actions/runs/${run}/artifacts`, 'artifacts', token, fetchImpl))
      jobs = await getAll(`${api}/repos/${repo}/actions/runs/${run}/jobs`, 'jobs', token, fetchImpl)
    } catch (e) {
      if (!(e instanceof Transient)) throw e
      lastError = e.message
      log(`poll ${attempt}/${attempts}: ${e.message} (retrying)`)
      if (attempt < attempts) await sleep(intervalMs)
      continue
    }

    const expired = want.filter(w => byName.get(w)?.expired)
    if (expired.length) throw new Error(`${expired.join(', ')} expired before the gate could read ${expired.length === 1 ? 'it' : 'them'}: the artifact retention is shorter than the run`)

    // PRESENT = its artifact is listed AND its job has completed. A re-run attempt leaves the previous attempt's artifact listed while the shard runs again, and an
    // artifact read from a job that is still running is the old attempt's. (A job whose name is not found is never present: it is named at the end.)
    const jobOf = w => jobs.find(j => j.name === jobName(indexOf(w), n))
    const present = w => byName.has(w) && jobOf(w)?.status === 'completed'
    const missing = want.filter(w => !present(w))
    if (missing.length === 0) {
      mkdirSync(dir, { recursive: true })
      for (const name of want) await download({ api, repo, token, art: byName.get(name), name, dir, fetchImpl })
      log(`poll ${attempt}/${attempts}: all ${n} shard artifact(s) present and downloaded`)
      return { polls }
    }
    lastMissing = missing
    lastJobs = jobs

    // A shard job that has FINISHED and left nothing is not going to upload. Seen on two polls in a row, not one.
    const dead = new Set(missing.filter(w => !byName.has(w) && jobOf(w)?.status === 'completed'))
    const confirmed = [...dead].filter(w => deadBefore.has(w))
    if (confirmed.length) {
      const detail = confirmed.map(w => {
        const job = jobOf(w)
        return `${w}: its job "${job.name}" finished (${job.conclusion}) and uploaded nothing${job.html_url ? ` — ${job.html_url}` : ''}`
      })
      throw new Error(`a shard will never upload:\n  ${detail.join('\n  ')}`)
    }
    deadBefore = dead

    log(`poll ${attempt}/${attempts}: ${n - missing.length} of ${n} uploaded; waiting for ${missing.join(', ')}`)
    if (attempt < attempts) await sleep(intervalMs)
  }

  const state = w => {
    const job = lastJobs.find(j => j.name === jobName(indexOf(w), n))
    return job ? `job "${job.name}" is ${job.status}${job.conclusion ? ` (${job.conclusion})` : ''}` : `no job named "${jobName(indexOf(w), n)}" was seen in this run`
  }
  throw new Error(`${lastMissing.length} of ${n} shard(s) never uploaded in ${polls} poll(s) of ${intervalMs / 1000}s: ${lastMissing.map(w => `${w} (${state(w)})`).join('; ')}` +
    (lastError ? `\n  last API error: ${lastError}` : ''))
}

const need = (env, name) => {
  if (!env[name]) throw new Error(`${name} is not set. This script runs inside a workflow run (the API address, repository, run id and token come from it); there is no default to fall back to.`)
  return env[name]
}

// --- self-test ---------------------------------------------------------------------

const selfTest = async () => {
  const { check, summarize } = createChecks()
  const scratch = mkdtempSync(join(tmpdir(), 'await-selftest-'))
  const N = 3

  // A real zip holding the real file name, made by the same `zip` the runners have.
  const zips = {}
  for (let i = 1; i <= N; i++) {
    const name = artifactName(i, N)
    const dir = join(scratch, `src-${i}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ shard: `${i}/${N}` }))
    const z = join(scratch, `${name}.zip`)
    const made = spawnSync('zip', ['-j', '-q', z, join(dir, `${name}.json`)])
    if (made.status !== 0) throw new Error(`the self-test needs the zip command: ${made.error?.message ?? made.stderr}`)
    zips[i] = readFileSync(z)
  }
  const wrongDir = join(scratch, 'wrong')
  mkdirSync(wrongDir, { recursive: true })
  writeFileSync(join(wrongDir, 'something-else.json'), '{}')
  spawnSync('zip', ['-j', '-q', join(scratch, 'wrong.zip'), join(wrongDir, 'something-else.json')])
  const wrongZip = readFileSync(join(scratch, 'wrong.zip'))

  // Two servers on two ports: the "API" and the "blob storage" it redirects to. They are different origins, so the blob side
  // can prove the token did not follow the redirect.
  const listen = handler => new Promise(resolve => {
    const s = createServer(handler)
    s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }))
  })

  // `script` decides what each poll sees. Called with the poll number, returns { artifacts, jobs, status }.
  const world = async (script, { zipFor = i => zips[i], zipStatus = () => 0 } = {}) => {
    const seen = { polls: 0, blobAuth: [], apiAuth: [], paths: [] }
    const blob = await listen((req, res) => {
      seen.blobAuth.push(req.headers.authorization ?? null)
      const i = Number(/\/(\d+)$/.exec(req.url)[1]) - 100
      const body = zipFor(i)
      if (body === null) return req.socket.destroy()
      res.end(body)
    })
    const api = await listen((req, res) => {
      seen.apiAuth.push(req.headers.authorization ?? null)
      seen.paths.push(req.url)
      const m = /^\/repos\/o\/r\/actions\/artifacts\/(\d+)\/zip$/.exec(req.url)
      if (m) { const st = zipStatus(Number(m[1]) - 100); if (st) { res.statusCode = st; return res.end() }
        res.statusCode = 302; res.setHeader('location', `${blob.url}/blob/${m[1]}`); return res.end() }
      const kind = /\/(artifacts|jobs)\?/.exec(req.url)?.[1]
      if (kind === 'artifacts') seen.polls++
      const out = script(seen.polls, kind)
      res.statusCode = out.status ?? 200
      res.setHeader('content-type', 'application/json')
      for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v)
      if (out.truncate) { res.setHeader('content-length', '1000'); res.write('{"artifacts":[{"id"'); return setTimeout(() => res.destroy(), 20) }
      res.end(JSON.stringify({ [kind]: out[kind] ?? [] }))
    })
    return { seen, api: api.url, close: () => { api.s.close(); blob.s.close() } }
  }
  const art = (i, extra = {}) => ({ id: 100 + i, name: artifactName(i, N), expired: false, ...extra })
  const job = (i, status, conclusion = null) => ({ name: jobName(i, N), status, conclusion, html_url: `job-${i}` })
  let runs = 0
  const run = async (script, opts = {}, awaitOpts = {}) => {
    const w = await world(script, opts)
    const dir = join(scratch, `out-${++runs}`)
    let result = null, error = null
    try { result = await awaitShards({ api: w.api, repo: 'o/r', run: 7, token: 'SECRET-TOKEN', n: N, dir, attempts: 4, intervalMs: 0, ...awaitOpts }) } catch (e) { error = e }
    w.close()
    return { result, error, seen: w.seen, dir }
  }

  const done = (...is) => is.map(i => job(i, 'completed', 'success'))
  const ALL = done(1, 2, 3)

  // 1. everything is there at once
  const a = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }))
  check('all shards present on the first poll are downloaded and unzipped', a.error === null && a.result.polls === 1 &&
    [1, 2, 3].every(i => existsSync(join(a.dir, `${artifactName(i, N)}.json`))), String(a.error))
  check('the unzipped file is the shard the artifact held', JSON.parse(readFileSync(join(a.dir, artifactName(2, N) + '.json'), 'utf8')).shard === '2/3')
  check('the token went to the API', a.seen.apiAuth.length > 0 && a.seen.apiAuth.every(h => h === 'Bearer SECRET-TOKEN'))
  check('MUTATION: the token did not follow the redirect to blob storage', a.seen.blobAuth.length === 3 && a.seen.blobAuth.every(h => h === null), JSON.stringify(a.seen.blobAuth))

  // 2. they arrive over several polls
  const b = await run((p, kind) => ({
    artifacts: [art(1), ...(p >= 2 ? [art(2)] : []), ...(p >= 3 ? [art(3)] : [])],
    jobs: [job(1, 'completed', 'success'), job(2, p >= 2 ? 'completed' : 'in_progress', p >= 2 ? 'success' : null), job(3, p >= 3 ? 'completed' : 'in_progress', p >= 3 ? 'success' : null)],
  }))
  check('shards that arrive over three polls are waited for', b.error === null && b.result.polls === 3, String(b.error))

  // 3. one never uploads and its job is still running when the polls are spent
  const c = await run((p, kind) => ({ artifacts: [art(1), art(3)], jobs: [job(1, 'completed', 'success'), job(2, 'in_progress'), job(3, 'completed', 'success')] }))
  check('MUTATION: a shard that never uploads fails the wait, by name and by job state',
    c.error && /1 of 3 shard\(s\) never uploaded in 4 poll\(s\)/.test(c.error.message) && /mutation-shard-2-of-3 \(job "mutation shard 2 of 3" is in_progress\)/.test(c.error.message), String(c.error))
  check('the wait spent every poll it was given', c.seen.polls === 4, `polls ${c.seen.polls}`)

  // 4. one never uploads and its job has finished: stops at the second poll that sees it, not the fourth
  const d = await run((p, kind) => ({ artifacts: [art(1), art(3)], jobs: [job(1, 'completed', 'success'), job(2, 'completed', 'failure'), job(3, 'completed', 'success')] }), {}, { attempts: 10 })
  check('MUTATION: a finished job with no artifact fails the wait, naming the job and its conclusion',
    d.error && /a shard will never upload/.test(d.error.message) && /mutation-shard-2-of-3: its job "mutation shard 2 of 3" finished \(failure\)/.test(d.error.message), String(d.error))
  check('it stopped after two polls, not ten', d.seen.polls === 2, `polls ${d.seen.polls}`)
  const d1 = await run((p, kind) => ({ artifacts: [art(1), ...(p >= 2 ? [art(2)] : []), art(3)], jobs: ALL }))
  check('one poll that sees a finished job with no artifact is not enough to give up on it', d1.error === null && d1.result.polls === 2, String(d1.error))

  // 4b. an artifact is listed but its job is still running: that is the previous attempt's artifact (a re-run), not this run's result
  const d2 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: [job(1, 'completed', 'success'), job(2, p >= 2 ? 'completed' : 'in_progress', p >= 2 ? 'success' : null), job(3, 'completed', 'success')] }))
  check('MUTATION: an artifact whose job is still running is not read (a re-run attempt\'s old artifact), the wait continues until the job completes', d2.error === null && d2.result.polls === 2, `${d2.error} polls ${d2.result?.polls}`)
  const d3 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: done(1, 3) }))
  check('MUTATION: an artifact with no job of that name in the run is never present, and is named at the end', d3.error && /mutation-shard-2-of-3 \(no job named "mutation shard 2 of 3" was seen in this run\)/.test(d3.error.message), String(d3.error))

  // 5. an expired artifact
  const e = await run((p, kind) => ({ artifacts: [art(1), art(2, { expired: true }), art(3)], jobs: ALL }))
  check('MUTATION: an expired artifact is refused by name', e.error && /mutation-shard-2-of-3 expired/.test(e.error.message), String(e.error))

  // 6. the API: a 5xx, a 429, a rate-limit 403 and a truncated body are retried and recover; a plain 403 stops at once; a 500 that never ends is reported with its error
  const f = await run((p, kind) => (p === 1 && kind === 'artifacts' ? { status: 503 } : { artifacts: [art(1), art(2), art(3)], jobs: ALL }))
  check('a 503 on the first poll is retried and the wait recovers', f.error === null, String(f.error))
  const f2 = await run((p, kind) => (p === 1 && kind === 'artifacts' ? { status: 429 } : { artifacts: [art(1), art(2), art(3)], jobs: ALL }))
  check('MUTATION: a 429 is rate limiting and heals by waiting', f2.error === null, String(f2.error))
  const f3 = await run((p, kind) => (p === 1 && kind === 'artifacts' ? { status: 403, headers: { 'retry-after': '1' } } : { artifacts: [art(1), art(2), art(3)], jobs: ALL }))
  check('MUTATION: a 403 that carries retry-after is the secondary rate limit and heals by waiting', f3.error === null, String(f3.error))
  const f4 = await run((p, kind) => (p === 1 && kind === 'artifacts' ? { truncate: true } : { artifacts: [art(1), art(2), art(3)], jobs: ALL }))
  check('MUTATION: a body that ends early is retried, not a permanent failure', f4.error === null, String(f4.error))
  const g = await run(() => ({ status: 403 }))
  check('MUTATION: a 403 without a rate-limit sign stops the wait on the first poll', g.error && /HTTP 403/.test(g.error.message) && g.seen.polls === 1, String(g.error))
  const h = await run(() => ({ status: 500 }))
  check('MUTATION: a 500 that never clears is reported with its error after every poll', h.error && /never uploaded in 4 poll/.test(h.error.message) && /last API error: .*HTTP 500/.test(h.error.message), String(h.error))

  // 7. an artifact that is not the shard it claims, bytes that are not a zip, and a download that drops once
  const i2 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }), { zipFor: i => (i === 2 ? wrongZip : zips[i]) })
  check('MUTATION: an artifact without its shard file is refused by name', i2.error && /mutation-shard-2-of-3: the artifact was downloaded and does not contain mutation-shard-2-of-3\.json/.test(i2.error.message), String(i2.error))
  const i3 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }), { zipFor: i => (i === 2 ? Buffer.from('this is not a zip archive') : zips[i]) })
  check('MUTATION: bytes that are not a zip are refused as an unzip failure, by name, after the tries', i3.error && /mutation-shard-2-of-3: unzip failed/.test(i3.error.message) && /after 3 tries/.test(i3.error.message), String(i3.error))
  let dropped = 0
  const i4 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }), { zipFor: i => (i === 2 && dropped++ === 0 ? null : zips[i]) })
  check('MUTATION: one dropped download is retried and the shard arrives', i4.error === null && existsSync(join(i4.dir, artifactName(2, N) + '.json')), String(i4.error))
  const i5 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }), { zipFor: i => (i === 2 ? null : zips[i]) })
  check('MUTATION: a download that always drops fails by name after the tries, not silently', i5.error && /mutation-shard-2-of-3: the download failed/.test(i5.error.message) && /after 3 tries/.test(i5.error.message), String(i5.error))

  let busy = 0
  const i6 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }), { zipStatus: i => (i === 2 && busy++ === 0 ? 503 : 0) })
  check('MUTATION: a 503 on the download itself is retried and the shard arrives', i6.error === null && existsSync(join(i6.dir, artifactName(2, N) + '.json')), String(i6.error))
  const i7 = await run((p, kind) => ({ artifacts: [art(1), art(2), art(3)], jobs: ALL }), { zipStatus: i => (i === 2 ? 404 : 0) })
  check('MUTATION: a 404 on the download is not retried: it fails by name at once', i7.error && /mutation-shard-2-of-3: the download answered HTTP 404/.test(i7.error.message) && !/after 3 tries/.test(i7.error.message), String(i7.error))

  // 8. the newest artifact of a name wins
  const j = await run((p, kind) => ({ artifacts: [art(1), art(2, { id: 50, expired: true }), art(2), art(3)], jobs: ALL }))
  check('when a name appears twice the newest is the one read', j.error === null, String(j.error))

  // 9. the environment
  const envErr = (() => { try { need({}, 'GITHUB_RUN_ID'); return null } catch (x) { return x } })()
  check('MUTATION: a missing environment variable is named, with no default to fall back to', envErr && /GITHUB_RUN_ID is not set/.test(envErr.message))

  rmSync(scratch, { recursive: true, force: true })
  return summarize()
}

// --- the command -------------------------------------------------------------------

if (isMain(import.meta.url) && process.argv.includes('--self-test')) {
  finish(await selfTest())
} else if (isMain(import.meta.url)) {
  const arg = name => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : undefined }
  const dir = process.argv[2]
  const n = Number(arg('--of'))
  const attempts = Number(arg('--attempts') ?? 80)
  const interval = Number(arg('--interval') ?? 30)
  if (!dir || dir.startsWith('--') || !Number.isInteger(n) || n < 1 || !Number.isInteger(attempts) || attempts < 1 || !(interval >= 0)) {
    console.error('usage: node scripts/mutation-await.mjs <dir> --of N [--attempts 80] [--interval 30]')
    process.exit(2)
  }
  try {
    const { polls } = await awaitShards({
      api: need(process.env, 'GITHUB_API_URL'), repo: need(process.env, 'GITHUB_REPOSITORY'), run: need(process.env, 'GITHUB_RUN_ID'), token: need(process.env, 'GITHUB_TOKEN'),
      n, dir, attempts, intervalMs: interval * 1000, log: m => console.log(`  ${m}`),
    })
    console.log(`\n  ${n} of ${n} shard artifact(s) downloaded to ${dir} after ${polls} poll(s)`)
  } catch (e) {
    // FAIL and arrow lines: they are what the gate's failure summary keeps (gate-checks.mjs `ok` filters for them); the annotation is for the runner's UI.
    console.log(String(e.message).split('\n').map((l, k) => (k === 0 ? `FAIL  ${l}` : `      → ${l.trim()}`)).join('\n'))
    console.log(`::error::${String(e.message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`)
    process.exitCode = 1
  }
}
