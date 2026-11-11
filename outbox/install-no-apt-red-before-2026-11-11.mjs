#!/usr/bin/env node
// The browser-install audit of scripts/workflow-check.mjs (installAudit), run over the workflows of origin/main and over this tree, with the denominators printed first.
// Run from the repository root:  node outbox/install-no-apt-red-before-2026-11-11.mjs | tee outbox/install-no-apt-red-before-2026-11-11.txt
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installAudit } from '../scripts/workflow-check.mjs'

const BASE = process.argv[2] ?? 'origin/main'
const base = mkdtempSync(join(tmpdir(), 'mainwf-'))
execSync(`git archive ${BASE} .github | tar -x -C ${base}`, { stdio: 'inherit' })
const show = (label, root) => {
  const a = installAudit(root)
  const apt = a.installs.filter(i => i.viaApt), un = a.installs.filter(i => i.bound === null)
  console.log(`${label}: read ${a.steps} run steps in ${a.files} files (workflows and composite actions); ${a.installs.length} install a browser (${a.installs.filter(i => i.bound === 'step').length} bounded by timeout-minutes, ${a.installs.filter(i => i.bound === 'timeout').length} by timeout; ${apt.length} through apt; ${un.length} unbounded); ${a.missed.length} install command(s) the step reader missed`)
  for (const i of a.installs) console.log(`  ${i.at}  apt=${i.viaApt} bound=${i.bound}${i.seconds ? ` ${i.seconds}s` : ''}`)
}
console.log(`tree ${execSync('git rev-parse --short HEAD').toString().trim()} (${execSync('git status --porcelain -- .github scripts').toString().trim() ? 'with uncommitted changes' : 'clean'}); base ${BASE} ${execSync(`git rev-parse --short ${BASE}`).toString().trim()}\n`)
show(`${BASE} (before)`, base)
console.log()
show('this tree (after)', '.')
rmSync(base, { recursive: true, force: true })
