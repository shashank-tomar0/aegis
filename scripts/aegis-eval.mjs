#!/usr/bin/env node
// AEGIS eval — local evaluation harness for agent outputs (evalon-style).
//   aegis eval init
//   aegis eval run <input.jsonl> --app <name> [--config eval.config.json]
//   aegis eval list | apps
//   aegis eval compare <app> [--v1 N --v2 N]
//   aegis eval export <app> [--version N] [--out file.json]
//   aegis eval datasets [evalon-evals.sqlite]
//
// Deterministic checks (exact/contains/regex) run automatically; rubric checks
// aggregate per-criterion scores provided by your judge (human/other tool) via
// each record's "scores": {criterion: 0..5}. Versioned datasets + scoring live
// in SQLite (default ~/.aegis/eval.db). Zero dependencies.

import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';


const DEFAULT_DB = process.env.AEGIS_EVAL_DB ?? join(homedir(), '.aegis', 'eval.db');
const DEFAULT_EVALON = join(homedir(), '.evalon', 'evalon-evals.sqlite');

const args = process.argv.slice(2);
const cmd = args[0];

const flag = (names, def) => {
  for (const n of names) { const i = args.indexOf(n); if (i >= 0) return args[i + 1]; }
  return def;
};

// ------------------------------------------------------------------- storage
function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      stats_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(app_id, version)
    );
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      case_id TEXT,
      input TEXT,
      output TEXT,
      expected TEXT,
      score REAL NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      results_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_cases_run ON cases(run_id);
  `);
  return db;
}

function nextVersion(db, appId) {
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM runs WHERE app_id = ?').get(appId);
  return Number(row.v) + 1;
}

// ------------------------------------------------------------------- checks
const fmtVal = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

function runChecks(record, config) {
  const output = record.output ?? record.response ?? record.answer ?? record.result ?? '';
  const expected = record.expected;
  const scores = record.scores ?? {};
  const results = [];
  for (const ch of config.checks ?? []) {
    const field = ch.field ?? 'output';
    const val = field === 'output' ? fmtVal(output) : field === 'input' ? fmtVal(record.input ?? record.prompt ?? '') : field === 'expected' ? fmtVal(expected ?? '') : fmtVal(record[field] ?? '');
    if (ch.type === 'exact') {
      const pass = String(val).trim() === String(ch.expected ?? expected ?? '').trim();
      results.push({ check: ch.name, type: 'exact', passed: pass, value: short(val), expected: short(ch.expected ?? expected) });
    } else if (ch.type === 'contains') {
      const pass = String(val).includes(String(ch.expected ?? ''));
      results.push({ check: ch.name, type: 'contains', passed: pass, value: short(val), expected: String(ch.expected ?? '') });
    } else if (ch.type === 'regex') {
      // node:test-style shim: allow python-ish inline (?i) flag
      let pattern = String(ch.expected ?? ''), flags = '';
      if (pattern.startsWith('(?i)')) { pattern = pattern.slice(4); flags = 'i'; }
      let pass = false;
      try { pass = new RegExp(pattern, flags).test(String(val)); } catch { /* invalid regex → fail */ }
      if (ch.negate) pass = !pass; // "must NOT match"
      results.push({ check: ch.name, type: 'regex', passed: pass, value: short(val), expected: String(ch.expected ?? '') });
    } else if (ch.type === 'rubric') {
      const criteria = ch.criteria ?? [];
      const scored = criteria.map((c) => ({ criterion: c, score: Number(scores[c] ?? NaN) })).filter((s) => Number.isFinite(s.score));
      const avg = scored.length ? scored.reduce((a, s) => a + s.score, 0) / scored.length / 5 : NaN;
      const pass = Number.isFinite(avg) ? avg >= (ch.threshold ?? 0.6) : null; // null = not scored
      results.push({ check: ch.name, type: 'rubric', passed: pass, value: scored.length ? `${avg.toFixed(2)} (${scored.length}/${criteria.length} scored)` : 'not scored', expected: `${criteria.join('+')} ≥threshold` });
    } else {
      results.push({ check: ch.name ?? ch.type, type: ch.type, passed: false, value: 'unknown check', expected: '' });
    }
  }
  const applicable = results.filter((r) => r.passed !== null);
  const passed = applicable.filter((r) => r.passed).length;
  const score = applicable.length ? passed / applicable.length : 0;
  return { results, passed: applicable.length ? passed : 1, score };
}

const short = (s) => { const x = String(s ?? ''); return x.length > 48 ? x.slice(0, 47) + '…' : x; };

function loadRecords(path) {
  const raw = readFileSync(path, 'utf8');
  if (path.endsWith('.jsonl') || path.endsWith('.ndjson')) {
    return raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  }
  const arr = JSON.parse(raw);
  return Array.isArray(arr) ? arr : [arr];
}

// ------------------------------------------------------------------- run
function doRun(dbPath, inputPath, appName, configPath) {
  const db = openDb(dbPath);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const checks = config.checks ?? [];
  const records = loadRecords(inputPath);

  db.prepare('INSERT OR IGNORE INTO apps (name, created_at) VALUES (?, ?)').run(appName, Date.now());
  const app = db.prepare('SELECT id FROM apps WHERE name = ?').get(appName);
  const version = nextVersion(db, app.id);
  const runId = db.prepare('INSERT INTO runs (app_id, version, created_at, config_json, stats_json) VALUES (?, ?, ?, ?, ?)')
    .run(app.id, version, Date.now(), JSON.stringify(config), '{}').lastInsertRowid;

  const caseIns = db.prepare('INSERT INTO cases (run_id, case_id, input, output, expected, score, passed, results_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  let total = 0, passedCases = 0, scored = 0;
  const failures = [];
  records.forEach((rec, i) => {
    const { results, passed, score } = runChecks(rec, config);
    const anyApplicable = results.some((r) => r.passed !== null);
    caseIns.run(runId,
      String(rec.id ?? rec.case_id ?? `case_${i}`),
      short(rec.input ?? rec.prompt ?? ''),
      short(rec.output ?? rec.response ?? ''),
      short(rec.expected ?? null),
      score, passed ? 1 : 0, JSON.stringify(results));
    if (anyApplicable) { scored++; total += score; if (!passed) failures.push(rec.id ?? `#${i}`); if (passed) passedCases++; }
  });

  const stats = {
    cases: records.length, scored, passed: passedCases,
    failed: scored - passedCases,
    aggregate: scored ? +(total / scored).toFixed(3) : 0,
  };
  const runIdNum = Number(runId);
  db.prepare('UPDATE runs SET stats_json = ? WHERE id = ?').run(JSON.stringify(stats), runIdNum);
  db.close();

  // print
  const out = [];
  out.push(`AEGIS eval — ${appName} v${version}`);
  out.push(`  records        ${records.length}`);
  out.push(`  scored cases   ${stats.scored}`);
  out.push(`  passed         ${stats.passed} · failed ${stats.failed}`);
  out.push(`  aggregate      ${(stats.aggregate * 100).toFixed(1)}%`);
  if (failures.length) out.push(`  failures       ${failures.slice(0, 8).join(', ')}${failures.length > 8 ? ` +${failures.length - 8}` : ''}`);
  for (const ch of checks) {
    const hit = records.map((r) => runChecks(r, config).results.find((x) => x.check === ch.name)).filter(Boolean);
    const p = hit.filter((h) => h.passed === true).length;
    const n = hit.filter((h) => h.passed === false).length;
    out.push(`  check ${ch.name.padEnd(20)} pass ${p}/${p + n}${ch.type === 'rubric' ? ' (rubric)' : ''}`);
  }
  out.push(`  dataset        ${inputPath}`);
  process.stdout.write(out.join('\n') + '\n');
  return { app: appName, version, ...stats };
}

// ------------------------------------------------------------------- list/compare/export
function doList(dbPath) {
  if (!existsSync(dbPath)) { console.log('no eval database yet — run: aegis eval run …'); return; }
  const db = openDb(dbPath);
  const apps = db.prepare(`
    SELECT a.name, r.version, r.created_at, r.stats_json FROM apps a
    LEFT JOIN runs r ON r.id = (SELECT id FROM runs WHERE app_id = a.id ORDER BY version DESC LIMIT 1)
    ORDER BY r.created_at DESC
  `).all();
  for (const a of apps) {
    const s = JSON.parse(a.stats_json ?? '{}');
    console.log(`${String(a.name).padEnd(24)} v${a.version} · score ${s.aggregate != null ? (s.aggregate * 100).toFixed(1) + '%' : '—'} · ${s.scored ?? 0}/${s.cases ?? 0} scored · ${new Date(a.created_at ?? 0).toISOString().slice(0, 16)}`);
  }
  db.close();
}

function doCompare(dbPath, appName, v1, v2) {
  const db = openDb(dbPath);
  const app = db.prepare('SELECT id FROM apps WHERE name = ?').get(appName);
  if (!app) { console.log(`no app: ${appName}`); return; }
  const runs = db.prepare('SELECT version, stats_json, config_json, created_at FROM runs WHERE app_id = ? AND version IN (?, ?) ORDER BY version').all(app.id, v1 ?? 1, v2 ?? 2);
  if (runs.length < 2) { console.log('need two versions — pass --v1 and --v2 or run the app twice'); return; }
  const [a, b] = runs;
  const sa = JSON.parse(a.stats_json), sb = JSON.parse(b.stats_json);
  console.log(`AEGIS eval compare — ${appName}`);
  console.log(`  v${a.version} (${new Date(a.created_at).toISOString().slice(0, 16)}): ${(sa.aggregate * 100).toFixed(1)}% · ${sa.passed}/${sa.scored} passed`);
  console.log(`  v${b.version} (${new Date(b.created_at).toISOString().slice(0, 16)}): ${(sb.aggregate * 100).toFixed(1)}% · ${sb.passed}/${sb.scored} passed`);
  console.log(`  Δ aggregate: ${((sb.aggregate - sa.aggregate) * 100).toFixed(1)}pp ${sb.aggregate >= sa.aggregate ? '▲ improved' : '▼ regressed'}`);
  const ca = JSON.parse(a.config_json).checks ?? [], cb = JSON.parse(b.config_json).checks ?? [];
  const names = [...new Set([...ca, ...cb].map((c) => c.name))];
  for (const n of names) {
    const countPassed = (version) => db.prepare(
      `SELECT COUNT(*) c FROM cases WHERE run_id = (SELECT id FROM runs WHERE app_id=? AND version=?) AND EXISTS(
         SELECT 1 FROM json_each(results_json) WHERE json_extract(value,'$.check')=? AND json_extract(value,'$.passed')=1
       )`,
    ).get(app.id, version, n);
    const pa = countPassed(a.version), pb = countPassed(b.version);
    console.log(`  ${n.padEnd(20)} v${a.version}: ${pa?.c ?? 0} cases  →  v${b.version}: ${pb?.c ?? 0} cases`);
  }
  db.close();
}

function doExport(dbPath, appName, version, out) {
  const db = openDb(dbPath);
  const app = db.prepare('SELECT id FROM apps WHERE name = ?').get(appName);
  if (!app) { console.log(`no app: ${appName}`); return; }
  const run = db.prepare('SELECT version, created_at, config_json, stats_json FROM runs WHERE app_id = ? AND version = ?').get(app.id, version ?? null);
  const rows = run
    ? db.prepare('SELECT case_id, input, output, expected, score, passed, results_json FROM cases WHERE run_id = (SELECT id FROM runs WHERE app_id=? AND version=?)').all(app.id, run.version)
    : db.prepare('SELECT version, created_at, config_json, stats_json FROM runs WHERE app_id = ? ORDER BY version DESC LIMIT 50').all(app.id);
  const payload = { app: appName, run, cases: rows.map((r) => ({ ...r, results: JSON.parse(r.results_json) })) };
  const text = JSON.stringify(payload, null, 2);
  if (out) { writeFileSync(out, text); console.log(`✓ exported → ${out}`); } else console.log(text);
  db.close();
}

function doDatasets(evalonDb) {
  if (!existsSync(evalonDb)) { console.log(`evalon evals db not found: ${evalonDb}`); return; }
  const db = new DatabaseSync(evalonDb);
  const datasets = db.prepare('SELECT name, current_version, created_at FROM datasets ORDER BY created_at DESC LIMIT 50').all();
  for (const d of datasets) {
    const cases = db.prepare(`SELECT COUNT(*) c FROM dataset_cases dc JOIN dataset_versions dv ON dv.id = dc.dataset_version_id WHERE dv.dataset_id = (SELECT id FROM datasets WHERE name = ?)`).get(d.name);
    const runs = db.prepare('SELECT COUNT(*) c FROM eval_runs er WHERE er.dataset_id = (SELECT id FROM datasets WHERE name = ?)').get(d.name);
    console.log(`${String(d.name).padEnd(24)} v${d.current_version} · ${cases?.c ?? 0} cases · ${runs?.c ?? 0} eval runs · ${String(d.created_at ?? '').slice(0, 16)}`);
  }
  db.close();
}

// ------------------------------------------------------------------- main
switch (cmd) {
  case 'init': {
    mkdirSync(dirname(DEFAULT_DB), { recursive: true });
    const db = openDb(DEFAULT_DB);
    db.close();
    console.log(`✓ eval database ready: ${DEFAULT_DB}`);
    break;
  }
  case 'run': {
    const inputPath = args[1];
    const appName = flag(['--app', '-a'], 'default');
    const configPath = flag(['--config', '-c'], 'eval.config.json');
    if (!inputPath) { console.error('usage: aegis eval run <input.jsonl> --app <name> [--config eval.config.json]'); process.exit(1); }
    if (!existsSync(inputPath)) { console.error(`input not found: ${inputPath}`); process.exit(1); }
    if (!existsSync(configPath)) { console.error(`config not found: ${configPath} — create eval.config.json {"checks":[...]}`); process.exit(1); }
    doRun(DEFAULT_DB, inputPath, appName, configPath);
    break;
  }
  case 'list': case 'apps': doList(DEFAULT_DB); break;
  case 'compare': {
    const appName = args[1];
    if (!appName) { console.error('usage: aegis eval compare <app> [--v1 N --v2 N]'); process.exit(1); }
    doCompare(DEFAULT_DB, appName, Number(flag(['--v1'], '1')), Number(flag(['--v2'], '2')));
    break;
  }
  case 'export': {
    const appName = args[1];
    if (!appName) { console.error('usage: aegis eval export <app> [--version N] [--out file.json]'); process.exit(1); }
    doExport(DEFAULT_DB, appName, Number(flag(['--version'], '')), flag(['--out'], null));
    break;
  }
  case 'datasets':
    doDatasets(flag(['--db'], DEFAULT_EVALON));
    break;
  default:
    console.log(`aegis eval — agent evaluation harness (db: ${DEFAULT_DB})\n  init · run <file.jsonl> --app <name> [--config c.json] · list · compare <app> [--v1 N --v2 N] · export <app> · datasets [--db evalon-evals.sqlite]`);
    break;
}