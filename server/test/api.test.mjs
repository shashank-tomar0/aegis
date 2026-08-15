// AEGIS Server API integration tests — node:test
// Spins up the real server with a temp data dir and exercises the product flow.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', reject);
  });
}

const base = `http://127.0.0.1:${await freePort()}`;
const dataDir = mkdtempSync(join(tmpdir(), 'aegis-test-'));
let proc = null;

async function waitHealthy(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not become healthy');
}

before(async () => {
  proc = spawn(process.execPath, [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server/src/index.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(new URL(base).port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      AEGIS_SCHEDULER: 'off',
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });
  await waitHealthy();
});

after(() => {
  proc?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

const post = (p, b, token) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(b),
  });
const get = (p, token) => fetch(`${base}${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const ok = async r => { assert.ok(r.ok, `HTTP ${r.status}`); return r.json(); };

const email = `it${Date.now()}@aegis.test`;

test('health is public', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
});

test('protected routes 401 without auth', async () => {
  assert.equal((await get('/api/projects')).status, 401);
  assert.equal((await get('/api/collectors')).status, 401);
  assert.equal((await post('/api/query', { sql: 'select 1' })).status, 401);
});

test('auth + project + collector + monitoring flow', async () => {
  const reg = await ok(await post('/api/auth/register', { email, password: 'hunter2hunter' }));
  const token = reg.token;

  const me = await ok(await get('/api/auth/me', token));
  assert.equal(me.user.email, email);

  const project = await ok(await post('/api/projects', { name: 'IT Project' }, token));
  assert.ok(project.id);

  // first run -> baseline + alerts
  const r1 = await ok(await post('/api/collectors/run', { collector: 'simulated', projectId: project.id }, token));
  assert.equal(r1.available, true);
  assert.equal(r1.upserted.nodes, 17);
  const danger = r1.alerts.find(a => a.severity === 'critical');
  assert.ok(danger && /CREDENTIALS|risk/i.test(danger.title), 'critical alert for high-risk asset');

  const alerts = await ok(await get(`/api/projects/${project.id}/alerts`, token));
  assert.ok(alerts.length >= 1);
  assert.ok(alerts.some(a => !a.seen));

  // identical second run -> NO new alerts (idempotent)
  const r2 = await ok(await post('/api/collectors/run', { collector: 'simulated', projectId: project.id }, token));
  assert.equal(r2.alerts.length, 0);

  const diff = await ok(await get(`/api/projects/${project.id}/diff`, token));
  assert.equal(diff.hasHistory, true);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);

  // schedule set + clear
  const sched = await ok(await post(`/api/projects/${project.id}/schedule`, { collector: 'simulated', everyMinutes: 1 }, token));
  assert.deepEqual(sched.schedules, [{ collector: 'simulated', everyMinutes: 1 }]);
  const off = await ok(await post(`/api/projects/${project.id}/schedule`, { collector: 'simulated', everyMinutes: null }, token));
  assert.equal(off.schedules.length, 0);

  // report is real markdown
  const rep = await ok(await post(`/api/projects/${project.id}/report`, {}, token));
  assert.match(rep.markdown, /# AEGIS Scan Report/);
  assert.equal(rep.summary.nodes, 17);

  // API key grants access, revoke kills it
  const keyRes = await ok(await post('/api/api-keys', { name: 'it-key' }, token));
  assert.match(keyRes.key, /^aeg_/);
  const viaKey = await ok(await get('/api/projects', keyRes.key));
  assert.equal(viaKey.length, 1);
  await ok(await post(`/api/api-keys/${keyRes.id}/revoke`, {}, token));
  assert.equal((await get('/api/projects', keyRes.key)).status, 401);

  // project graph is readable and loadable by consumers
  const graph = await ok(await get(`/api/projects/${project.id}/graph`, token));
  assert.equal(graph.nodes.length, 17);
  assert.equal(graph.edges.length, 17);
});