#!/usr/bin/env node
// AEGIS agent-traces — browse Evalon trace databases in the terminal.
// Reads ~/.evalon/evalon-runs.sqlite (or any path) DIRECTLY with Node's
// built-in node:sqlite — no Python required. Structurally identical to how
// evalon's own TUI browses: projects → traces → spans/metrics/expected-vs-actual.
// Flags: --json  --once  --project <name>  --errors

import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const DEFAULT_DB = join(homedir(), '.evalon', 'evalon-runs.sqlite');

const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_ONCE = args.includes('--once');
let errorsOnly = args.includes('--errors');
const projectFilter = (() => { const i = args.indexOf('--project'); return i >= 0 ? args[i + 1] : null; })();
const dbPath = args.find((a) => !a.startsWith('--') && !['--json', '--once', '--errors'].includes(a)) ?? DEFAULT_DB;

// ---------------------------------------------------------------- ANSI utils
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (n, s) => (USE_COLOR ? `\x1b[38;5;${n}m${s}\x1b[0m` : s);
const hue = { orange: 208, green: 40, red: 196, dim: 244, gray: 240, yellow: 220, cyan: 81, white: 255 };

function openDb(path) {
  if (!existsSync(path)) {
    const err = new Error(`evalon database not found: ${path}\n  create one with: uv run python -c "import evalon; evalon.init('demo')"`);
    err.missing = true;
    throw err;
  }
  return new DatabaseSync(path);
}

function load(db) {
  const projects = db.prepare('SELECT DISTINCT project FROM traces ORDER BY project').all().map((r) => String(r.project));
  const traces = db.prepare(`
    SELECT id, project, name, status, input_json, output_json, expected_json, started_at, ended_at
    FROM traces
    ${projectFilter ? 'WHERE project = ?' : ''}
    ORDER BY started_at DESC LIMIT 500
  `).all(projectFilter ? [projectFilter] : []) || [];
  const out = traces.map((t) => {
    const spans = db.prepare('SELECT name, kind, status, latency_ms, error_json, input_json, output_json FROM spans WHERE trace_id = ? ORDER BY started_at').all(t.id);
    const metrics = db.prepare('SELECT name, value FROM metrics WHERE trace_id = ?').all(t.id);
    const events = db.prepare('SELECT type, timestamp, payload_json FROM events WHERE trace_id = ? ORDER BY timestamp').all(t.id);
    const errors = spans.filter((s) => s.error_json);
    return {
      id: t.id,
      project: String(t.project),
      name: String(t.name),
      status: String(t.status),
      started: String(t.started_at ?? ''),
      ended: String(t.ended_at ?? ''),
      input: t.input_json ? safeJson(t.input_json) : null,
      output: t.output_json ? safeJson(t.output_json) : null,
      expected: t.expected_json ? safeJson(t.expected_json) : null,
      spans,
      metrics: metrics.map((m) => ({ name: String(m.name), value: Number(m.value) })),
      events: events.map((e) => ({ type: String(e.type), at: String(e.timestamp ?? ''), payload: e.payload_json ? safeJson(e.payload_json) : null })),
      errors,
    };
  });
  return { projects, traces: out };
}

function safeJson(s) { try { return JSON.parse(String(s)); } catch { return String(s); } }
const pretty = (_v) => '';// eslint-disable-line no-unused-vars
const short = (v, n = 60) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const money = (m) => { const c = m.find((x) => /cost/i.test(x.name)); return c ? `$${c.value.toFixed(4)}` : null; };
const latency = (m) => { const l = m.find((x) => /latency|duration/i.test(x.name)); return l ? `${Math.round(l.value)}ms` : null; };

// ---------------------------------------------------------------- renderers
function renderOnce(data) {
  const out = [];
  out.push('AEGIS agent-traces — Evalon trace database');
  out.push(`db: ${dbPath} · projects: ${data.projects.join(', ') || 'none'}`);
  if (!data.traces.length) { out.push('no traces recorded yet'); return out.join('\n'); }
  const failed = data.traces.filter((t) => t.status === 'failed' || t.errors.length).length;
  out.push(`traces: ${data.traces.length} · failed: ${failed}${errorsOnly ? ' (errors only)' : ''}`);
  out.push('PROJECT         STATUS   NAME                              STARTED             COST      LAT');
  for (const t of data.traces) {
    if (errorsOnly && !(t.status === 'failed' || t.errors.length)) continue;
    const cost = money(t.metrics), lat = latency(t.metrics);
    out.push([
      t.project.slice(0, 15).padEnd(16),
      (t.status).padEnd(7),
      t.name.slice(0, 28).padEnd(29),
      t.started.slice(0, 19).padEnd(18),
      (cost ?? '').padEnd(9),
      lat ?? '',
    ].join(' '));
  }
  return out.join('\n');
}

function renderInteractive(data) {
  const cols = process.stdout.columns || 120;
  const rowsH = process.stdout.rows || 30;
  const list = data.traces.filter((t) => !errorsOnly || t.status === 'failed' || t.errors.length);
  const sel = Math.min(Math.max(selIdx, 0), Math.max(0, list.length - 1));
  const vis = rowsH - 5;
  const out = [];
  out.push(`\x1b[2J\x1b[H${data.projects.length ? ` ${col(hue.orange, 'AEGIS')} ${col(hue.white, 'traces')} — projects: ${col(hue.dim, data.projects.join(' · ') || 'none')}` : ` ${col(hue.orange, 'AEGIS')} traces — no projects yet`}`);
  out.push(` ${col(hue.dim, 'j/k select · e errors-only(' + (errorsOnly?'on':'off') + ') · r reload · q quit')}${' '.repeat(Math.max(1, cols - 80))}${col(hue.dim, list.length + ' traces')}`);
  const start = Math.max(0, sel - Math.floor(vis / 2));
  for (let i = start; i < Math.min(list.length, start + vis); i++) {
    const t = list[i];
    const cost = money(t.metrics), lat = latency(t.metrics);
    const flag = t.status;
    const line = ` ${t.project.padEnd(16)} ${col(flag === 'failed' ? hue.red : flag === 'running' ? hue.yellow : hue.green, flag.padEnd(7))} ${t.name.padEnd(28).slice(0, 28)} ${t.started.slice(0, 19).padEnd(18)} ${(cost ?? '').padEnd(9)} ${lat ?? ''}`;
    const padded = line.length < cols ? line + ' '.repeat(cols - line.length) : line.slice(0, cols);
    out.push(i === sel ? `\x1b[7m${padded}\x1b[0m` : padded);
  }
  if (list[sel]) {
    const t = list[sel];
    const p = (obj) => obj == null ? '—' : short(obj, 52);
    out.push('');
    out.push(` ${col(hue.orange, 'NAME')} ${t.name}   ${col(hue.dim, `status ${t.status} · spans ${t.spans.length} · errors ${t.errors.length}`)}`);
    out.push(` ${col(hue.dim, 'input   ')} ${p(t.input).slice(0, cols - 12)}`);
    out.push(` ${col(hue.dim, 'output  ')} ${p(t.output).slice(0, cols - 12)}`);
    if (t.expected !== null) out.push(` ${col(hue.dim, 'expected')} ${short(t.expected, 60).slice(0, cols - 12)}`);
    for (const s of t.spans.slice(0, 8)) {
      const colr = s.error_json ? hue.red : s.kind === 'llm' ? hue.cyan : hue.dim;
      out.push(` ${col(hue.dim, 'span')} ${col(colr, String(s.kind || 'node').padEnd(6))} ${String(s.name || '').slice(0, 36).padEnd(36)} ${s.latency_ms != null ? col(hue.dim, `${Math.round(Number(s.latency_ms))}ms`) : ''}${s.error_json ? ` ${col(hue.red, short(s.error_json, 40))}` : ''}`.slice(0, cols));
    }
    const metrics = t.metrics.map((m) => `${m.name}=${m.value}`).join(' · ');
    if (metrics) out.push(` ${col(hue.dim, 'metrics ')} ${metrics.slice(0, cols - 10)}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- interactive state
let data = null;
let selIdx = 0;

function draw() { process.stdout.write(renderInteractive(data)); }

function keypress(buf) {
  const key = buf.toString('utf8');
  switch (key) {
    case 'q': case '\x03': process.stdout.write('\x1b[?1049l\x1b[?25h\x1b[0m'); process.exit(0);
    case 'j': case '\x1b[B': selIdx++; draw(); break;
    case 'k': case '\x1b[A': selIdx = Math.max(0, selIdx - 1); draw(); break;
    case 'r': selIdx = 0; loadData(); draw(); break;
    case 'e': errorsOnly = !errorsOnly; selIdx = 0; draw(); break;
    default: break;
  }
}

function loadData() {
  try {
    const db = openDb(dbPath);
    data = load(db);
    db.close();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- main
if (FLAG_JSON) {
  loadData();
  process.stdout.write(JSON.stringify(data, null, 2));
} else if (FLAG_ONCE) {
  loadData();
  process.stdout.write(renderOnce(data) + '\n');
} else {
  if (!process.stdin.isTTY) {
    console.error('no tty — use --json or --once');
    process.exit(1);
  }
  loadData();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', keypress);
  process.stdout.on('resize', () => draw());
  process.stdout.write('\x1b[?1049h\x1b[?25l');
  process.on('exit', () => process.stdout.write('\x1b[?1049l\x1b[?25h\x1b[0m'));
  draw();
}