#!/usr/bin/env node
/**
 * live-check census, 2026-11-14.
 *
 * Prints the tables that outbox/live-check-weather-silent-2026-11-14.md quotes.
 *
 * It reads ONE file, outbox/live-check-census-2026-11-14.tsv, and nothing else:
 * no job logs, no network. The TSV holds one row per live-check run that GitHub
 * listed for 2026-10-09 .. 2026-11-14 (300 rows). Its columns were filled on
 * 2026-11-14 from each run's job log by scratch scripts that are NOT committed;
 * this file is the committed artifact and the scratch scripts are its only
 * source. Re-deriving a row means `gh run view <run_id> --log` on that run.
 *
 *   run_id        GitHub run id
 *   event         workflow_run | schedule | workflow_dispatch
 *   created_at    UTC, ISO 8601
 *   conclusion    success | failure | skipped | cancelled
 *   head_sha      first 8 characters of the run's head commit
 *   failing_step  the first failed step's name (failures only)
 *   cloud/region  from the job log's "Hosted Compute Agent" header
 *   image         "<OS>@<runner image version>" from its "Runner Image" header
 *   agent         hosted compute agent version
 *   om_class      from the log line `open-meteo (start+duration): ...`:
 *                   answered    >= 1 request logged, every one lasted < 7000 ms
 *                   SILENT      >= 1 request logged, every one lasted >= 5900 ms
 *                               (the page's cap is 8000 ms; a retry wave's
 *                               remaining budget logs ~5999 ms)
 *                   none        the line says no request was recorded
 *                   reached-not the log has no such line
 *                   (blank)     the job did not run (skipped or cancelled)
 *                 Neither threshold reads an HTTP status. A run with a mixture
 *                 (some < 7000 ms, some >= 7000 ms) would fall into no class;
 *                 the self-check below asserts there is none.
 *   om_requests   how many requests that line listed
 *   om_max_ms     the longest of them
 *   fail_class    a label assigned from the failing step's log text (rules in
 *                 the record); failures only
 *   attribution   the render check's own attribution of a weather red:
 *                 page | host-silent | null (failures that printed one)
 *   node_probe    what the render check's late node probe reported (same rows)
 *
 * usage: node outbox/live-check-census-2026-11-14.mjs [--tsv <path>] [--self-test]
 *   --self-test   runs the checks on the statistics and the tables with synthetic
 *                 input and exits; it includes a deliberately wrong expectation
 *                 that MUST be rejected (Rule 90). Exit 1 if anything is off.
 *   default       prints the tables for the TSV, then checks the figures the
 *                 record quotes against it ("pinned figures"). Exit 1 on a
 *                 mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED = ['run_id', 'event', 'created_at', 'conclusion', 'head_sha', 'failing_step', 'cloud', 'region',
  'image', 'agent', 'om_class', 'om_requests', 'om_max_ms', 'fail_class', 'attribution', 'node_probe'];

// Chosen AFTER the three reds were seen (post hoc): the Azure and AWS regions on the US west coast.
// Azure westcentralus (Wyoming) is not in the set.
const WEST = new Set(['westus', 'westus2', 'westus3', 'us-west-2']);
const NEW_GEN = '20261111';

// ---------------------------------------------------------------- parsing
export function parseTsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
  const head = lines[0].split('\t');
  for (const c of REQUIRED) if (!head.includes(c)) throw new Error(`the TSV has no column "${c}"`);
  return lines.slice(1).map((l, n) => {
    const c = l.split('\t');
    if (c.length !== head.length) throw new Error(`row ${n + 2} has ${c.length} columns; the header has ${head.length}`);
    return Object.fromEntries(head.map((k, i) => [k, c[i]]));
  });
}

const ran = r => r.conclusion === 'success' || r.conclusion === 'failure';
const asked = r => Number(r.om_requests) > 0;
const isSilent = r => r.om_class === 'SILENT';
const osOf = r => r.image.split('@')[0];
const genOf = r => (r.image.split('@')[1] || '').split('.')[0];
const where = r => `${r.cloud}/${r.region}`;
const count = (arr, f) => arr.filter(f).length;
const tally = (arr, f) => arr.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});

// ---------------------------------------------------------------- statistics
const LF = [0];
for (let i = 1; i <= 5000; i++) LF[i] = LF[i - 1] + Math.log(i);
const logC = (n, k) => LF[n] - LF[k] - LF[n - k];

/** Two-sided Fisher exact test on [[a, b], [c, d]]: the sum of every table with the same margins that is no likelier than the observed one. */
export function fisherTwoSided(a, b, c, d) {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const lp = x => logC(r1, x) + logC(r2, c1 - x) - logC(n, c1);
  const observed = lp(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const l = lp(x);
    if (l <= observed + 1e-9) p += Math.exp(l);
  }
  return Math.min(1, p);
}

// ---------------------------------------------------------------- analysis
export function analyze(rows) {
  const ranRows = rows.filter(ran);
  const reds = rows.filter(r => r.conclusion === 'failure');
  const asking = ranRows.filter(asked);
  const newAsk = asking.filter(r => genOf(r) === NEW_GEN);
  const oldAsk = asking.filter(r => genOf(r) !== NEW_GEN);
  const westNew = newAsk.filter(r => WEST.has(r.region));
  const westOld = oldAsk.filter(r => WEST.has(r.region));
  const classes = Object.entries(tally(reds, r => r.fail_class)).map(([cls, n]) => {
    const mine = reds.filter(r => r.fail_class === cls).map(r => r.created_at).sort();
    const last = mine[mine.length - 1];
    const since = ranRows.filter(r => r.created_at > last);
    return { cls, n, first: mine[0], last, sinceRan: since.length, sinceRed: count(since, r => r.conclusion === 'failure') };
  }).sort((x, y) => y.n - x.n || x.cls.localeCompare(y.cls));
  const two = (hit, miss) => ({ hit, miss });
  return {
    rows: rows.length,
    conclusions: tally(rows, r => r.conclusion),
    ran: ranRows.length,
    ranWithCloud: count(ranRows, r => r.cloud !== ''),
    reds: reds.length,
    redsWithClass: count(reds, r => r.fail_class !== ''),
    window: [rows.map(r => r.created_at).sort()[0], rows.map(r => r.created_at).sort().pop()],
    asking: asking.length,
    noRequest: count(ranRows, r => r.om_class === 'none'),
    notReached: count(ranRows, r => r.om_class === 'reached-not'),
    unclassified: count(ranRows, r => !['answered', 'SILENT', 'none', 'reached-not'].includes(r.om_class)),
    classes,
    steps: Object.entries(tally(reds, r => r.failing_step)).sort((x, y) => y[1] - x[1]),
    newAsk, oldAsk, westNew, westOld, asking_rows: asking,
    all: { new: two(count(newAsk, isSilent), count(newAsk, r => !isSilent(r))), old: two(count(oldAsk, isSilent), count(oldAsk, r => !isSilent(r))) },
    west: { new: two(count(westNew, isSilent), count(westNew, r => !isSilent(r))), old: two(count(westOld, isSilent), count(westOld, r => !isSilent(r))) },
  };
}

// ---------------------------------------------------------------- printing
function table(headers, body) {
  const all = [headers, ...body].map(r => r.map(String));
  const w = headers.map((_, i) => Math.max(...all.map(r => r[i].length)));
  const line = r => '  ' + r.map((c, i) => c.padEnd(w[i])).join('  ').trimEnd();
  return [line(all[0]), line(w.map(n => '-'.repeat(n))), ...all.slice(1).map(line)].join('\n');
}
const pFmt = p => (p < 1e-3 ? p.toExponential(1) : p.toFixed(4));
const pct = (n, d) => `${((100 * n) / d).toFixed(0)}%`;
const day = s => s.slice(0, 16) + 'Z';

function printTables(rows, A) {
  const out = [];
  const P = s => out.push(s);
  P('live-check census, 2026-11-14   source: the TSV only (no logs read, no network)');
  P('');
  P('COVERAGE');
  P(`  rows read                     ${A.rows} of ${A.rows} data rows in the TSV`);
  P(`  conclusions                   ${Object.entries(A.conclusions).sort().map(([k, v]) => `${v} ${k}`).join(', ')}`);
  P(`  created_at window (UTC)       ${day(A.window[0])} .. ${day(A.window[1])}`);
  P(`  ran a job (success|failure)   ${A.ran} of ${A.rows}   (the other ${A.rows - A.ran} were skipped or cancelled and carry no log)`);
  P(`  ... with a cloud/region read  ${A.ranWithCloud} of ${A.ran}`);
  P(`  reds with a fail_class        ${A.redsWithClass} of ${A.reds}`);
  P(`  made >= 1 Open-Meteo request  ${A.asking} of ${A.ran}   (none ${A.noRequest}, step not reached ${A.notReached}, unclassified ${A.unclassified})`);
  P('');
  P(`REDS BY CLASS (${A.reds} reds)`);
  P(table(['fail_class', 'reds', 'share', 'first (UTC)', 'last (UTC)', 'runs since last', 'red of those'],
    A.classes.map(c => [c.cls, c.n, pct(c.n, A.reds), day(c.first), day(c.last), c.sinceRan, c.sinceRed])));
  P('');
  P('REDS BY FAILING STEP');
  P(table(['failing step', 'reds'], A.steps.map(([k, v]) => [k, v])));
  P('');
  P(`WEATHER: RUNS THAT MADE >= 1 OPEN-METEO REQUEST (${A.asking} runs), BY RUNNER IMAGE`);
  const imgs = tally(A.asking_rows, r => r.image);
  P(table(['image', 'runs', 'SILENT', 'answered'],
    Object.keys(imgs).sort().map(k => {
      const rs = A.asking_rows.filter(r => r.image === k);
      return [k, rs.length, count(rs, isSilent), count(rs, r => !isSilent(r))];
    })));
  P('');
  P('WEATHER: THE SAME RUNS BY CLOUD/REGION');
  const regs = tally(A.asking_rows, where);
  P(table(['cloud/region', 'runs', 'SILENT', `on the ${NEW_GEN} build`],
    Object.keys(regs).sort().map(k => {
      const rs = A.asking_rows.filter(r => where(r) === k);
      return [k + (WEST.has(rs[0].region) ? '  (west)' : ''), rs.length, count(rs, isSilent), count(rs, r => genOf(r) === NEW_GEN)];
    })));
  P('');
  P(`THE ${A.newAsk.length} RUNS ON THE ${NEW_GEN} BUILD THAT MADE REQUESTS`);
  P(table(['created (UTC)', 'run_id', 'event', 'cloud/region', 'image', 'om_class', 'requests', 'max ms', 'conclusion'],
    [...A.newAsk].sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map(r => [day(r.created_at), r.run_id, r.event, where(r), r.image, r.om_class, r.om_requests, r.om_max_ms, r.conclusion])));
  P('');
  const fmt2 = (n, o) => `  ${NEW_GEN} build: ${n.hit} SILENT, ${n.miss} not    older builds: ${o.hit} SILENT, ${o.miss} not    Fisher exact two-sided p = ${pFmt(fisherTwoSided(n.hit, n.miss, o.hit, o.miss))}`;
  P('2 x 2: SILENT or not, among runs that made requests');
  P('  all regions');
  P(fmt2(A.all.new, A.all.old));
  P(`  west only (${[...WEST].join(', ')}; chosen after the three reds were seen)`);
  P(fmt2(A.west.new, A.west.old));
  P('  The p-values are descriptive. The runs share commits and hours, so they are not independent,');
  P('  and the west grouping was chosen after the data were read. Neither 2 x 2 separates the build,');
  P('  the region and a concurrent Open-Meteo outage from one another.');
  P('');
  P('LATE NODE PROBE (printed only in the failure text of a weather assertion), BY RUNNER OS');
  const probed = rows.filter(r => r.conclusion === 'failure' && r.node_probe !== '' && r.node_probe !== 'not probed');
  P(table(['OS', 'node probe', 'attribution', 'reds'],
    Object.entries(tally(probed, r => `${osOf(r)}|${r.node_probe}|${r.attribution}`)).sort()
      .map(([k, v]) => [...k.split('|'), v])));
  P(`  ${probed.length} reds ran the probe; ${count(rows, r => r.conclusion === 'failure' && r.node_probe === 'not probed')} more printed "not probed"; ${A.reds - probed.length - count(rows, r => r.conclusion === 'failure' && r.node_probe === 'not probed')} reds printed no attribution text.`);
  P('');
  P('THE REDS THAT RAN THE PROBE, ONE PER LINE');
  P(table(['created (UTC)', 'run_id', 'image', 'cloud/region', 'attribution', 'node probe', 'fail_class'],
    probed.sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map(r => [day(r.created_at), r.run_id, r.image, where(r), r.attribution, r.node_probe, r.fail_class])));
  return out.join('\n');
}

// ---------------------------------------------------------------- the figures the record quotes
const PINS = [
  ['data rows', A => A.rows, 300],
  ['success', A => A.conclusions.success, 192],
  ['failure', A => A.conclusions.failure, 76],
  ['skipped', A => A.conclusions.skipped, 31],
  ['cancelled', A => A.conclusions.cancelled, 1],
  ['ran a job', A => A.ran, 268],
  ['ran a job with a cloud read', A => A.ranWithCloud, 268],
  ['reds with a fail_class', A => A.redsWithClass, 76],
  ['runs with an om_class outside the four defined', A => A.unclassified, 0],
  ['runs that made requests', A => A.asking, 214],
  ['... on the 20261111 build', A => A.newAsk.length, 5],
  ['... of those SILENT', A => A.all.new.hit, 3],
  ['... on older builds', A => A.oldAsk.length, 209],
  ['... of those SILENT', A => A.all.old.hit, 0],
  ['west: runs on the 20261111 build', A => A.westNew.length, 5],
  ['west: runs on older builds', A => A.westOld.length, 76],
  ['Fisher p, all regions, 3/2 vs 0/209 (x1e6, rounded)', A => Math.round(1e6 * fisherTwoSided(A.all.new.hit, A.all.new.miss, A.all.old.hit, A.all.old.miss)), 6],
  ...Object.entries({
    'brief-game_live-on-final': 23, 'axis-desk-card-timeout-30s': 19, 'deploy-not-landed': 12, 'venue-table-covers-none': 8,
    'weather-silent-whole-window': 3, 'weather-partial-fill': 3, 'fable-crash-signature': 2, 'brief-card-not-rendered': 2,
    'page-not-ready-30s': 2, 'playwright-install-exit': 1, 'state-transition-no-change': 1,
  }).map(([cls, n]) => [`class ${cls}`, A => (A.classes.find(c => c.cls === cls) || { n: 0 }).n, n]),
];

function checkPins(A) {
  const bad = PINS.map(([label, f, want]) => ({ label, got: f(A), want })).filter(x => x.got !== x.want);
  return { total: PINS.length, bad };
}

// ---------------------------------------------------------------- self-test (Rule 90)
function selfTest() {
  const results = [];
  const check = (name, ok) => results.push({ name, ok: !!ok });
  const near = (a, b, tol = 5e-7) => Math.abs(a - b) <= tol;

  // known values: the tea-tasting table, and the worked example in the Wikipedia article on Fisher's exact test
  check('Fisher [[3,1],[1,3]] two-sided = 34/70', near(fisherTwoSided(3, 1, 1, 3), 34 / 70));
  check('Fisher [[1,9],[11,3]] two-sided = 0.0027594', near(fisherTwoSided(1, 9, 11, 3), 0.0027594, 5e-7));
  check('Fisher [[5,0],[0,5]] two-sided = 2/252', near(fisherTwoSided(5, 0, 0, 5), 2 / 252));
  check('Fisher is symmetric in rows', near(fisherTwoSided(3, 2, 0, 209), fisherTwoSided(0, 209, 3, 2)));
  check('Fisher of an even split is 1', near(fisherTwoSided(5, 5, 5, 5), 1));

  // the deliberately wrong expectation: this check asserts the harness can REJECT. If the wrong value passes, the test is vacuous.
  const wrong = near(fisherTwoSided(3, 1, 1, 3), 0.5);
  check('a deliberately wrong expectation (0.5 for the tea table) is REJECTED', wrong === false);

  // the tables, on synthetic rows with known counts
  const base = { event: 'schedule', head_sha: 'aaaaaaaa', failing_step: '', cloud: 'Azure', region: 'eastus', agent: '1', om_requests: '0', om_max_ms: '', fail_class: '', attribution: '', node_probe: '' };
  const mk = (o) => ({ ...base, ...o });
  const rows = [
    mk({ run_id: '1', created_at: '2026-11-01T00:00:00Z', conclusion: 'success', image: 'ubuntu-24.04@20261004.1.1', om_class: 'answered', om_requests: '6', om_max_ms: '500' }),
    mk({ run_id: '2', created_at: '2026-11-02T00:00:00Z', conclusion: 'success', image: 'ubuntu-24.04@20261004.1.1', om_class: 'answered', om_requests: '6', om_max_ms: '500', region: 'westus3' }),
    mk({ run_id: '3', created_at: '2026-11-03T00:00:00Z', conclusion: 'failure', failing_step: 'Render the deployed page and assert on it', image: 'ubuntu-26.04@20261111.2.1', om_class: 'SILENT', om_requests: '6', om_max_ms: '8001', region: 'westus3', fail_class: 'weather-silent-whole-window', attribution: 'host-silent', node_probe: 'unreachable — fetch failed' }),
    mk({ run_id: '4', created_at: '2026-11-04T00:00:00Z', conclusion: 'success', image: 'ubuntu-26.04@20261111.2.1', om_class: 'answered', om_requests: '6', om_max_ms: '400', region: 'westus' }),
    mk({ run_id: '5', created_at: '2026-11-05T00:00:00Z', conclusion: 'skipped', cloud: '', region: '', image: '', agent: '', om_class: '' }),
    mk({ run_id: '6', created_at: '2026-11-06T00:00:00Z', conclusion: 'failure', failing_step: 'Build (x)', image: 'ubuntu-26.04@20261111.2.1', om_class: 'reached-not', fail_class: 'fable-crash-signature' }),
    mk({ run_id: '7', created_at: '2026-11-07T00:00:00Z', conclusion: 'success', image: 'ubuntu-26.04@20261111.2.1', om_class: 'none' }),
  ];
  const A = analyze(rows);
  check('rows = 7', A.rows === 7);
  check('ran = 6 (the skipped row is not a run)', A.ran === 6);
  check('ran with a cloud = 6 of 6', A.ranWithCloud === 6);
  check('reds = 2, both with a class', A.reds === 2 && A.redsWithClass === 2);
  check('runs that made requests = 4', A.asking === 4);
  check('on the new build: 2 runs (ids 3 and 4), 1 SILENT', A.newAsk.length === 2 && A.all.new.hit === 1 && A.all.new.miss === 1);
  check('on older builds: 2 runs, 0 SILENT', A.oldAsk.length === 2 && A.all.old.hit === 0);
  check('west runs on the new build = 2; west runs on older builds = 1', A.westNew.length === 2 && A.westOld.length === 1);
  const weather = A.classes.find(c => c.cls === 'weather-silent-whole-window');
  check('"runs since last" for the weather class = 3 runs that ran after 2026-11-03 (ids 4, 6, 7), 1 red', weather.sinceRan === 3 && weather.sinceRed === 1);
  check('no run falls outside the four om_class values', A.unclassified === 0);
  const mixed = analyze([mk({ run_id: '8', created_at: '2026-11-08T00:00:00Z', conclusion: 'success', image: 'ubuntu-26.04@20261111.2.1', om_class: 'mixed', om_requests: '6', om_max_ms: '8001' })]);
  check('a run in no defined om_class is counted as unclassified', mixed.unclassified === 1);
  let threw = false;
  try { parseTsv('run_id\tevent\n1\tschedule\n'); } catch { threw = true; }
  check('a TSV missing required columns is refused', threw);

  // the pins must be able to fail: shift one figure by one and the pin check must report it
  const shifted = { ...A, rows: A.rows + 1 };
  check('the pinned-figure check reports a figure that is off by one', checkPins(shifted).bad.some(x => x.label === 'data rows'));

  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`\nself-test: ${results.length - failed.length} of ${results.length} checks passed`);
  return failed.length === 0;
}

// ---------------------------------------------------------------- main
function main() {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const i = process.argv.indexOf('--tsv');
  const file = i >= 0 ? process.argv[i + 1] : path.join(HERE, 'live-check-census-2026-11-14.tsv');
  const rows = parseTsv(fs.readFileSync(file, 'utf8'));
  const A = analyze(rows);
  console.log(printTables(rows, A));
  const { total, bad } = checkPins(A);
  console.log('');
  console.log(`PINNED FIGURES (the numbers the record quotes): ${total - bad.length} of ${total} match`);
  for (const b of bad) console.log(`  MISMATCH  ${b.label}: the TSV gives ${b.got}, the record quotes ${b.want}`);
  process.exit(bad.length === 0 ? 0 : 1);
}

main();
