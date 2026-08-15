#!/usr/bin/env node
// AEGIS CLI — drive the AEGIS server from the terminal / CI
// Zero dependencies. Usage:
//   aegis login <email> <password>      aegis register <email> <password>
//   aegis whoami                        aegis logout
//   aegis projects                      aegis project-create <name>
//   aegis scan <collector> --project <id> [--force]
//   aegis keys                           aegis key-create <name>
//   aegis key-revoke <id>                aegis export <projectId> [--out file.json]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.aegis');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_BASE = process.env.AEGIS_BASE_URL ?? 'http://localhost:8787';

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return { baseUrl: DEFAULT_BASE, token: null };
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch { return { baseUrl: DEFAULT_BASE, token: null }; }
}
function saveConfig(cfg) { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }

async function api(cfg, method, path, body) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'message' in data ? data.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const fmt = (n) => n.toLocaleString('en-US');

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const cfg = loadConfig();
  if (!cmd || cmd === '--help' || cmd === 'help') {
    console.log(`aegis — attack-surface intelligence CLI (server: ${cfg.baseUrl})`);
    console.log(`  aegis register <email> <password>`);
    console.log(`  aegis login <email> <password>`);
    console.log(`  aegis whoami | logout`);
    console.log(`  aegis projects`);
    console.log(`  aegis project-create <name>`);
    console.log(`  aegis scan <collector> --project <id>`);
    console.log(`  aegis keys | key-create <name> | key-revoke <id>`);
    console.log(`  aegis export <projectId> [--out file.json]`);
    return;
  }

  switch (cmd) {
    case 'register': {
      const [email, password] = rest;
      if (!email || !password) throw new Error('usage: aegis register <email> <password>');
      const r = await api(cfg, 'POST', '/api/auth/register', { email, password });
      cfg.token = r.token; saveConfig(cfg);
      console.log(`✓ registered ${r.user.email} — session saved`);
      break;
    }
    case 'login': {
      const [email, password] = rest;
      if (!email || !password) throw new Error('usage: aegis login <email> <password>');
      const r = await api(cfg, 'POST', '/api/auth/login', { email, password });
      cfg.token = r.token; saveConfig(cfg);
      console.log(`✓ logged in as ${r.user.email}`);
      break;
    }
    case 'logout': {
      if (cfg.token) await api(cfg, 'POST', '/api/auth/logout');
      cfg.token = null; saveConfig(cfg);
      console.log('✓ logged out');
      break;
    }
    case 'whoami': {
      const { user } = await api(cfg, 'GET', '/api/auth/me');
      console.log(user ? `✓ ${user.email}` : 'not logged in');
      break;
    }
    case 'projects': {
      const projects = await api(cfg, 'GET', '/api/projects');
      if (!projects.length) { console.log('no projects — create one: aegis project-create <name>'); break; }
      for (const p of projects) {
        console.log(`${p.id}  ${p.name.padEnd(24)} nodes:${String(p.counts.nodes).padStart(5)}  edges:${String(p.counts.edges).padStart(5)}  updated:${new Date(p.updatedAt).toISOString().slice(0, 16)}`);
      }
      break;
    }
    case 'project-create': {
      const name = rest[0] ?? 'Untitled';
      const p = await api(cfg, 'POST', '/api/projects', { name });
      console.log(`✓ project created: ${p.id}  "${p.name}"`);
      break;
    }
    case 'scan': {
      const collector = rest[0];
      const projectIdx = rest.indexOf('--project');
      const projectId = projectIdx >= 0 ? rest[projectIdx + 1] : null;
      if (!collector || !projectId) throw new Error('usage: aegis scan <collector> --project <id>');
      console.log(`scanning with "${collector}" into ${projectId}…`);
      const r = await api(cfg, 'POST', '/api/collectors/run', { collector, projectId });
      if (!r.available) {
        console.log(`✗ collector unavailable: ${r.note ?? 'unknown'}`);
        process.exitCode = 1;
        break;
      }
      console.log(`✓ ${collector}: ${r.found} items found (${fmt(r.upserted?.nodes ?? 0)} nodes, ${fmt(r.upserted?.edges ?? 0)} edges) in ${r.ms}ms`);
      if (r.simulated) console.log(`  ⚠ ${r.note ?? 'SIMULATED dataset'}`);
      for (const line of r.log ?? []) console.log(`  ${line}`);
      console.log(`  project totals: ${r.counts.nodes} nodes / ${r.counts.edges} edges`);
      break;
    }
    case 'keys': {
      const keys = await api(cfg, 'GET', '/api/api-keys');
      if (!keys.length) { console.log('no API keys — create one: aegis key-create <name>'); break; }
      for (const k of keys) {
        console.log(`${k.revoked ? '✗' : '✓'} ${k.id}  ${k.name.padEnd(16)} ${k.prefix}…  created:${new Date(k.createdAt).toISOString().slice(0, 10)}`);
      }
      break;
    }
    case 'key-create': {
      const name = rest[0] ?? 'default';
      const k = await api(cfg, 'POST', '/api/api-keys', { name });
      console.log(`✓ key created — store it now, it is shown once:\n  ${k.key}`);
      break;
    }
    case 'key-revoke': {
      const id = rest[0];
      if (!id) throw new Error('usage: aegis key-revoke <id>');
      const r = await api(cfg, 'POST', `/api/api-keys/${id}/revoke`);
      console.log(r.ok ? '✓ key revoked' : '! no change');
      break;
    }
    case 'export': {
      const projectId = rest[0];
      if (!projectId) throw new Error('usage: aegis export <projectId> [--out file.json]');
      const outIdx = rest.indexOf('--out');
      const out = outIdx >= 0 ? rest[outIdx + 1] : null;
      const g = await api(cfg, 'GET', `/api/projects/${projectId}/graph`);
      const payload = JSON.stringify(g, null, 2);
      if (out) {
        writeFileSync(out, payload);
        console.log(`✓ exported ${g.nodes.length} nodes / ${g.edges.length} edges → ${out}`);
      } else {
        console.log(payload);
      }
      break;
    }
    default:
      throw new Error(`unknown command: ${cmd} — run 'aegis --help'`);
  }
}

main().catch(err => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});