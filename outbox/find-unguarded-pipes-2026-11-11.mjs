// Lists every `run:` step in .github/workflows/*.yml that pipes into tee with nothing that carries the left side's exit status:
// no PIPESTATUS, no pipefail, no explicit `shell: bash` in the step (an explicit bash shell runs with -eo pipefail).
// Usage: node outbox/find-unguarded-pipes-2026-11-11.mjs <repo-root>
// SUPERSEDED by the check in scripts/workflow-check.mjs (`npm run check:workflows` prints the same denominators and fails on an unguarded step). This
// counter is kept as the independent first count: both read 337 run steps, 30 piping into tee, 9 unguarded at a6b282a and 6 at f4b6103. It differs from
// the check in one way that matters: it looks for PIPESTATUS/pipefail in the step's raw text, so a COMMENT that says pipefail counts as a guard here and
// does not in the check.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = process.argv[2]
const dir = join(root, '.github/workflows')
const out = []
let steps = 0, withTee = 0
for (const f of readdirSync(dir).filter(f => f.endsWith('.yml')).sort()) {
  const lines = readFileSync(join(dir, f), 'utf8').split('\n')
  // step boundaries: a line "<indent>- name:|uses:|run:" starts a step; it ends at the next such line of the same indent
  const starts = []
  lines.forEach((l, i) => { const m = /^(\s*)- (name|uses|run|id|if|env|with|shell):/.exec(l); if (m) starts.push({ i, indent: m[1].length }) })
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k]
    let end = lines.length
    for (let j = k + 1; j < starts.length; j++) if (starts[j].indent <= s.indent) { end = starts[j].i; break }
    const seg = lines.slice(s.i, end)
    const runAt = seg.findIndex(l => /^\s*(- )?run:/.test(l))
    if (runAt < 0) continue
    steps++
    const runIndent = /^(\s*)/.exec(seg[runAt])[1].length + (/^\s*- run:/.test(seg[runAt]) ? 2 : 0)
    const first = seg[runAt].replace(/^\s*(- )?run:\s*/, '')
    const body = [first]
    if (/^[|>]/.test(first)) { body.length = 0; for (let j = runAt + 1; j < seg.length; j++) { const l = seg[j]; if (l.trim() === '' || /^(\s*)/.exec(l)[1].length > runIndent) body.push(l); else break } }
    const text = body.join('\n')
    if (!/\|\s*tee\b/.test(text)) continue
    withTee++
    const guarded = /PIPESTATUS|pipefail/.test(text) || seg.some(l => /^\s*shell:\s*bash\b/.test(l))
    if (!guarded) out.push(`${f}:${s.i + runAt + 1}  ${(seg.find(l => /- name:/.test(l)) || '').trim().replace(/^- name:\s*/, '').slice(0, 70)}`)
  }
}
console.log(`run steps read: ${steps}; steps that pipe into tee: ${withTee}; of those with nothing carrying the left side's exit status: ${out.length}`)
for (const o of out) console.log('  ' + o)
