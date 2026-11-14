// The shapes of the errors Node's own fetch throws, one real attempt each. Rule 73: written and run 2026-11-14 on Node v22.23.4 in the
// authoring sandbox, against loopback servers it builds itself; nothing here reaches the network except the `.invalid` lookup, which
// is reserved and must not resolve. Cited by docs/CC-CMD-2026-11-14-weather-failure-cause.md, Premises.
//
// Usage:  node outbox/node-fetch-failure-shapes-2026-11-14.mjs
//
// It prints the cause chain as the error carries it, not an interpretation. The connect-hang shape takes about ten seconds because it waits
// for undici's own connect budget; that is the point of it.
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';

const chain = (e, d = 0) => {
  if (e === null || e === undefined) return [];
  const row = { d, ctor: e?.constructor?.name, name: e?.name, code: e?.code, errno: e?.errno, syscall: e?.syscall, hostname: e?.hostname, address: e?.address, port: e?.port, msg: String(e?.message).slice(0, 200) };
  const out = [row];
  if (Array.isArray(e?.errors)) e.errors.forEach((x, i) => out.push(...chain(x, d + 1).map(r => ({ ...r, via: `errors[${i}]` }))));
  if (e?.cause) out.push(...chain(e.cause, d + 1).map(r => ({ ...r, via: 'cause' })));
  return out;
};
const lines = [];
let shapes = 0;
const attempt = async (label, url, ms) => {
  shapes++;
  const t0 = Date.now();
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); lines.push(`\n## ${label}: HTTP ${r.status} in ${Date.now() - t0}ms`); }
  catch (e) {
    lines.push(`\n## ${label}: threw after ${Date.now() - t0}ms; outermost e.message = ${JSON.stringify(e.message)}`);
    for (const r of chain(e)) lines.push('   ' + JSON.stringify(r));
  }
};

const closed = await new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const silent = http.createServer(() => {}); await new Promise(r => silent.listen(0, '127.0.0.1', r));
const rst = net.createServer(s => s.destroy()); await new Promise(r => rst.listen(0, '127.0.0.1', r));

await attempt('A  a name that cannot resolve (.invalid)', 'https://api.open-meteo.invalid/', 5000);
await attempt('B  port 1 (undici refuses it before any network)', 'http://127.0.0.1:1/', 5000);
await attempt('C  accepts and never answers, AbortSignal.timeout(600)', `http://127.0.0.1:${silent.address().port}/`, 600);
await attempt('D  a closed ephemeral port on 127.0.0.1', `http://127.0.0.1:${closed}/`, 5000);
await attempt('E  localhost on that closed port', `http://localhost:${closed}/`, 5000);
await attempt('F  accepts then destroys the socket (reset)', `http://127.0.0.1:${rst.address().port}/`, 5000);
silent.close(); rst.close();

// a real connect hang: a child listens with backlog 1 and blocks its event loop, so nothing is ever accepted and the queue fills
const child = spawn(process.execPath, ['-e', `const s=require('net').createServer().listen({port:0,host:'127.0.0.1',backlog:1},()=>{process.stdout.write(String(s.address().port)+'\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000)})`], { stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise(r => child.stdout.once('data', d => r(Number(String(d).trim()))));
const fillers = []; for (let i = 0; i < 4; i++) { const c = net.connect(port, '127.0.0.1'); c.on('error', () => {}); fillers.push(c); }
await new Promise(r => setTimeout(r, 300));
await attempt('G  connect hang (accept queue full), undici default connect budget, abort at 14s', `http://127.0.0.1:${port}/`, 14000);
fillers.forEach(c => c.destroy()); child.kill('SIGKILL');

console.log(`checked ${shapes} of 7 shapes; node ${process.version}; ${new Date().toISOString().slice(0, 10)}`);
for (const l of lines) console.log(l);
process.exit(shapes === 7 ? 0 : 1);
