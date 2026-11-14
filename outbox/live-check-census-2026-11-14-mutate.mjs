#!/usr/bin/env node
/**
 * Rule 90 for outbox/live-check-census-2026-11-14.mjs: break it on purpose and require its checks to go red.
 *
 * usage: node outbox/live-check-census-2026-11-14-mutate.mjs <census script> <census tsv> <scratch dir>
 *   e.g. node outbox/live-check-census-2026-11-14-mutate.mjs outbox/live-check-census-2026-11-14.mjs \
 *          outbox/live-check-census-2026-11-14.tsv "$(mktemp -d)"
 *
 * Seven mutations of the script's logic (the self-test must go red) and three of the data (the pinned figures must
 * report a MISMATCH line; a run that exits non-zero without one failed for another reason and is INVALID, never
 * "caught"). A mutation whose anchor is not unique, or that changes nothing, is INVALID. The unmutated script must
 * pass both modes first, or "red" proves nothing. Exit 0 only when every mutation is caught and none is invalid.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const [, , SRC, TSV, SCRATCH] = process.argv;
const src = fs.readFileSync(SRC, 'utf8');
const dir = path.join(SCRATCH, 'mut');
fs.mkdirSync(dir, { recursive: true });

const run = (file, args) => {
  const r = spawnSync('node', [file, ...args], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { code: r.status, fails: (out.match(/^FAIL /gm) || []).length, mism: (out.match(/^  MISMATCH /gm) || []).length, out };
};

// the unmutated script must pass both modes first, otherwise "red" would prove nothing
const clean = path.join(dir, 'clean.mjs'); fs.writeFileSync(clean, src);
const c1 = run(clean, ['--self-test']); const c2 = run(clean, ['--tsv', TSV]);
console.log(`unmutated: self-test exit ${c1.code}, default exit ${c2.code}`);
if (c1.code !== 0 || c2.code !== 0) { console.log('BASELINE NOT GREEN: stop'); process.exit(2); }

const mutations = [
  ['M1 Fisher keeps the likelier tables', `if (l <= observed + 1e-9) p += Math.exp(l);`, `if (l >= observed + 1e-9) p += Math.exp(l);`],
  ['M2 a skipped run counts as a run', `const ran = r => r.conclusion === 'success' || r.conclusion === 'failure';`, `const ran = r => r.conclusion !== 'cancelled';`],
  ['M3 a run with 0 requests counts as asking', `const asked = r => Number(r.om_requests) > 0;`, `const asked = r => Number(r.om_requests) >= 0;`],
  ['M4 the build generation reads the wrong field', `(r.image.split('@')[1] || '').split('.')[0]`, `(r.image.split('@')[1] || '').split('.')[1]`],
  ['M5 SILENT is read as answered', `const isSilent = r => r.om_class === 'SILENT';`, `const isSilent = r => r.om_class === 'answered';`],
  ['M6 "runs since last" includes the red itself', `ranRows.filter(r => r.created_at > last)`, `ranRows.filter(r => r.created_at >= last)`],
  ['M7 the unclassified count is blinded', `unclassified: count(ranRows, r => !['answered', 'SILENT', 'none', 'reached-not'].includes(r.om_class)),`, `unclassified: 0,`],
];
let caught = 0, invalid = 0;
for (const [name, from, to] of mutations) {
  const n = src.split(from).length - 1;
  if (n !== 1 || from === to) { console.log(`INVALID   ${name}: anchor found ${n} time(s)`); invalid++; continue; }
  const f = path.join(dir, name.slice(0, 2) + '.mjs');
  fs.writeFileSync(f, src.replace(from, to));
  if (fs.readFileSync(f, 'utf8') === src) { console.log(`INVALID   ${name}: nothing changed`); invalid++; continue; }
  const st = run(f, ['--self-test']); const df = run(f, ['--tsv', TSV]);
  const red = st.code !== 0 || df.code !== 0;
  if (red) caught++;
  console.log(`${red ? 'CAUGHT   ' : 'NOT CAUGHT'} ${name}: self-test exit ${st.code} (${st.fails} FAIL), default exit ${df.code} (${df.mism} MISMATCH)`);
}

// mutations of the data: the pinned figures must notice
const tsv = fs.readFileSync(TSV, 'utf8').split('\n'); if (tsv[tsv.length - 1] === '') tsv.pop(); // not trimEnd(): trailing tabs are blank columns
const writeTsv = (name, lines) => { const f = path.join(dir, name); fs.writeFileSync(f, lines.join('\n') + '\n'); return f; };
const dataMut = [
  ['T1 one data row deleted', writeTsv('t1.tsv', tsv.filter((l, i) => i !== 5))],
  ['T2 one fail_class relabelled', writeTsv('t2.tsv', tsv.map(l => l.startsWith('43587347908') ? l.replace('\tweather-silent-whole-window\t', '\tweather-partial-fill\t') : l))],
  ['T3 one SILENT run read as answered', writeTsv('t3.tsv', tsv.map(l => l.startsWith('43587347908') ? l.replace('\tSILENT\t', '\tanswered\t') : l))],
];
for (const [name, f] of dataMut) {
  const before = fs.readFileSync(f, 'utf8') === tsv.join('\n') + '\n';
  if (before) { console.log(`INVALID   ${name}: file identical to the real TSV`); invalid++; continue; }
  const d = run(clean, ['--tsv', f]);
  if (d.code !== 0 && d.mism === 0) { console.log(`INVALID   ${name}: exit ${d.code} but no MISMATCH line, so it failed for another reason:\n${d.out.split('\n').slice(0, 4).join('\n')}`); invalid++; continue; }
  const red = d.code !== 0;
  if (red) caught++;
  console.log(`${red ? 'CAUGHT   ' : 'NOT CAUGHT'} ${name}: default exit ${d.code} (${d.mism} MISMATCH)`);
}
console.log(`\n${caught} caught, ${invalid} invalid, of ${mutations.length + dataMut.length} mutations`);
process.exit(invalid ? 3 : caught === mutations.length + dataMut.length ? 0 : 1);
