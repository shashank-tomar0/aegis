#!/usr/bin/env node
// AEGIS Fly.io deploy — one command from a logged-in machine.
//   npm run deploy:fly [-- --app NAME --region REGION]
// Steps: auth check → patch fly.toml → create app → create volume →
//         set secrets (optional) → remote build + deploy → print URL.
// The only manual step remains `fly auth login` (opens your browser once).

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLY_TOML = join(root, 'fly.toml');

const args = process.argv.slice(2);
const valueOf = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const FLY = process.env.FLY_BIN || 'flyctl';
function fly(...cmd) {
  const res = spawnSync(FLY, cmd, { stdio: 'inherit', cwd: root, env: process.env });
  return res.status;
}
function flyOut(...cmd) {
  const res = spawnSync(FLY, ['--json', ...cmd], { encoding: 'utf8', cwd: root, env: process.env });
  if (res.status !== 0) return null;
  try { return JSON.parse(res.stdout); } catch { return null; }
}

(async () => {
  // 1) flyctl present?
  for (const bin of ['flyctl', 'fly']) {
    try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }); console.log(`✓ flyctl: ${bin}`); process.env.FLY_BIN = bin; break; }
    catch { if (bin === 'fly') { console.error('✗ flyctl not found — install first:\n  winget install flyctl\n  (see docs/DEPLOY-FLY.md)'); process.exit(1); } }
  }

  // 2) logged in?
  const who = spawnSync(FLY, ['auth', 'whoami'], { encoding: 'utf8' });
  if (who.status !== 0) {
    console.error('✗ not logged in to Fly.io — run:  fly auth login   (opens your browser)');
    process.exit(1);
  }
  console.log(`✓ logged in as ${who.stdout.trim()}`);

  // 3) app identity
  let app = valueOf('app', null) ?? process.env.FLY_APP;
  if (!app) {
    const raw = readFileSync(FLY_TOML, 'utf8');
    const m = raw.match(/^app\s*=\s*"([^"]+)"/m);
    app = m ? m[1] : null;
  }
  if (!app) {
    const slug = 'aegis-' + Math.random().toString(36).slice(2, 8);
    console.log(`no app name set — using ${slug}`);
    app = slug;
  }
  const region = valueOf('region', process.env.FLY_REGION, 'iad');

  // patch fly.toml (idempotent)
  let toml = readFileSync(FLY_TOML, 'utf8').replace(/^app\s*=.*$/m, `app = "${app}"`).replace(/^primary_region\s*=.*$/m, `primary_region = "${region}"`);
  writeFileSync(FLY_TOML, toml);

  // 4) app exists?
  const list = flyOut('apps', 'list');
  const exists = list?.some((a) => a.Name === app || a.name === app);
  if (!exists) {
    console.log(`→ creating app ${app}…`);
    const r = spawnSync(FLY, ['apps', 'create', app, '--name', app], { stdio: 'inherit' });
    if (r.status !== 0 && !String(r.stderr || '').includes('already exists')) process.exit(1);
  } else {
    console.log(`✓ app ${app} exists`);
  }

  // 5) volume
  const vols = flyOut('volumes', 'list', '--app', app);
  const hasVol = Array.isArray(vols) && vols.some((v) => (v.Name || v.name || '').includes('aegis_data'));
  if (!hasVol) {
    console.log('→ creating persistent volume aegis_data (1GB)…');
    if (fly('volumes', 'create', 'aegis_data', '--app', app, '--size', '1', '--region', region) !== 0) {
      console.error('✗ volume creation failed — see logs above');
      process.exit(1);
    }
  } else {
    console.log('✓ volume aegis_data exists');
  }

  // 6) secrets (optional, from env)
  const token = process.env.AEGIS_GITHUB_TOKEN;
  if (token) {
    console.log('→ setting AEGIS_GITHUB_TOKEN secret…');
    const r = spawnSync(FLY, ['secrets', 'set', `AEGIS_GITHUB_TOKEN=${token}`, '--app', app], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('⚠ secret set failed (continuing)');
  }
  const org = process.env.AEGIS_GITHUB_ORG;
  if (org) {
    spawnSync(FLY, ['secrets', 'set', `AEGIS_GITHUB_ORG=${org}`, '--app', app], { stdio: 'inherit' });
  }

  // 7) deploy (remote build — no local docker needed)
  console.log('→ deploying (remote build, this takes a few minutes)…');
  const dep = spawnSync(FLY, ['deploy', '--app', app, '--remote-only', '--strategy', 'immediate'], { stdio: 'inherit', cwd: root });
  if (dep.status !== 0) {
    console.error('✗ deploy failed — fix errors above and re-run');
    process.exit(1);
  }

  console.log('');
  console.log('✅ AEGIS is live');
  console.log(`   https://${app}.fly.dev`);
  console.log(`   manage:    fly open --app ${app}`);
  console.log(`   logs:      fly logs --app ${app}`);
  console.log('   (first page load compiles nothing; data persists in the volume)');
})();