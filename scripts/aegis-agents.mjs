#!/usr/bin/env node
// AEGIS agents — live terminal console for everything running on this machine
// Keyboard-driven TUI (htop × lazygit): full process/agent inventory with real
// detail — command line, path, parent, CPU, memory, threads, handles, session,
// start time — plus AI-agent detection, live sort/filter, kill, and JSON export.
// Zero dependencies. Flags: --json  --once  --interval <sec>

import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------- ANSI utils
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', inv: '\x1b[7m',
  rev: '\x1b[30;48;5;250m',
  fg: (n) => `\x1b[38;5;${n}m`, bg: (n) => `\x1b[48;5;${n}m`,
  clear: '\x1b[2J', home: '\x1b[H',
};
const hue = {
  orange: 208, red: 196, green: 40, dim: 244, gray: 240, yellow: 220, cyan: 81, white: 255,
};
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const col = (n, s) => (USE_COLOR ? C.fg(n) + s + C.reset : s);

const isWin = process.platform === 'win32';
const powershell = (script) => new Promise((resolve, reject) => {
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 25000, windowsHide: true, maxBuffer: 96 * 1024 * 1024 },
    (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
});

// ------------------------------------------------------- process enumeration
async function loadProcesses() {
  const cimScript = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine,ExecutablePath,ParentProcessId,CreationDate,SessionId | ConvertTo-Json -Compress -Depth 2`;
  const perfScript = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Select-Object Id,ProcessName,CPU,WS,PM,Threads,Handles,StartTime,SessionId | ConvertTo-Json -Compress -Depth 2`;
  const [cimRaw, perfRaw] = await Promise.all([powershell(cimScript), powershell(perfScript)]);
  const cim = JSON.parse(cimRaw || '[]');
  const perf = new Map();
  for (const p of JSON.parse(perfRaw || '[]')) {
    if (p && p.Id != null) perf.set(Number(p.Id), p);
  }
  const procs = cim.map((p) => {
    const id = Number(p.ProcessId);
    const g = perf.get(id) || {};
    const name = String(p.Name || g.ProcessName || '').replace(/\.exe$/i, '');
    const cmd = String(p.CommandLine || '');
    return {
      pid: id,
      name: name.toLowerCase(),
      label: name.toUpperCase(),
      cmd,
      path: String(p.ExecutablePath || ''),
      parent: p.ParentProcessId == null ? null : Number(p.ParentProcessId),
      session: p.SessionId == null ? '?' : String(p.SessionId),
      started: (() => { const d = new Date(String(g.StartTime ?? p.CreationDate ?? '')); return isNaN(d.getTime()) ? null : d; })(),
      cpuSec: Number(g.CPU) || 0,
      wsBytes: Number(g.WS) || 0,
      pmBytes: Number(g.PM) || 0,
      threads: Number(g.Threads) || 0,
      handles: Number(g.Handles) || 0,
    };
  }).filter((p) => p.pid > 0);

  // docker containers merged in as agent/tool rows (best effort; absent → skip)
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      execFile('docker', ['ps', '--no-trunc', '--format', '{{json .}}'], { timeout: 10000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, so) => (err ? reject(err) : resolve({ stdout: so })));
    });
    dockerNote = null;
    stdout.split(/\r?\n/).filter(Boolean).forEach((line, i) => {
      let c = null;
      try { c = JSON.parse(line); } catch { return; }
      const name = String(c.Names || c.name || `ctr-${i}`).split(',')[0];
      const img = String(c.Image || '');
      procs.push({
        pid: dockerBase + i,
        docker: true,
        name: name.toLowerCase(),
        label: name.toUpperCase().slice(0, 30),
        cmd: `${name} → ${c.Command ?? ''}`.slice(0, 300),
        path: img,
        parent: null,
        session: 'docker',
        started: null,
        startedText: String(c.Status || '').slice(0, 20),
        cpuSec: 0, wsBytes: 0, pmBytes: 0, threads: 0, handles: 0,
        image: img,
        networks: String(c.Networks || '').split(',').map((s) => s.trim()).filter(Boolean),
      });
    });
  } catch {
    dockerNote = 'docker CLI not available — containers skipped';
  }
  return procs;
}

// ------------------------------------------------------------ agent detection
const AGENT_NAMES = new Set([
  'ollama', 'llama-server', 'llama-cli', 'llama-llama-cli', 'lmstudio', 'lms', 'koboldcpp',
  'claude', 'claude-code', 'cursor', 'copilot', 'copilot-agent', 'aider', 'codex', 'opencode',
  'goose', 'gemini', 'gemini-cli', 'deepseek-r1', 'uvicorn', 'agents', 'agent', 'ragapp',
  'text-generation-webui', 'oobabooga', 'mlx-lm', 'llamafile',
]);
const AGENT_HINTS = [
  '--agent', 'langchain', 'openai', 'anthropic', 'claude', 'copilot', 'crewai', 'autogen',
  'mcp-server', 'llamaindex', 'agent.py', 'agents/', 'aider', 'codex', 'gemini',
  'ollama run', 'llama-cpp', '--model', 'agentic',
];
const TOOL_NAMES = new Set([
  'node', 'npm', 'npx', 'python', 'python3', 'pip', 'uv', 'deno', 'bun', 'docker', 'git',
  'code', 'code-insiders', 'powershell', 'pwsh', 'cmd', 'wt', 'ssh', 'kubectl', 'redis-server',
  'postgres', 'postgres.exe', 'nginx', 'java', 'mongod', 'mysql',
]);
const SYSTEM_NAMES = new Set([
  'svchost', 'system', 'lsass', 'csrss', 'services', 'wininit', 'winlogon', 'dwm', 'explorer',
  'runtimebroker', 'dllhost', 'taskhostw', 'fontdrvhost', 'conhost', 'registry', 'spoolsv',
  'searchindexer', 'startmenuexperiencehost', 'sihost', 'widgets', 'securityhealthservice',
  'ntoskrnl', 'audiodg', 'memory compression',
]);
const FLAG_PATTERNS = [
  [/api[_-]?key/i, 'API key in args'], [/secret/i, 'secret in args'],
  [/token/i, 'token in args'], [/passw[o0]rd/i, 'password in args'],
  [/\.env/i, '.env referenced'], [/github_token/i, 'GITHUB_TOKEN'],
  [/aws_(secret|access)/i, 'AWS credential'], [/azure_/i, 'Azure credential'],
  [/\b(nc|netcat|ssh -R|socat)\b/, 'network tunneling'],
];

function classify(p) {
  const name = p.name, cmd = p.cmd.toLowerCase();
  let cls = 'unknown', reason = 'no matches';
  if (p.docker) {
    cls = /agent|worker|bot|runner/i.test(name) ? 'agent' : 'tool';
    reason = `docker container (${p.image ?? '?'})`;
  } else if (AGENT_NAMES.has(name)) {
    cls = 'agent'; reason = `recognized agent stack (${name})`;
  } else if (AGENT_HINTS.some((h) => cmd.includes(h))) {
    cls = 'agent'; reason = 'agent markers in command line';
  } else if (SYSTEM_NAMES.has(name)) {
    cls = 'system'; reason = 'operating system process';
  } else if (TOOL_NAMES.has(name)) {
    cls = 'tool'; reason = `runtime / tool (${name})`;
  }
  const flags = [];
  for (const [re, label] of FLAG_PATTERNS) if (re.test(cmd)) flags.push(label);
  // anomaly flags (labeled heuristics, from real sampling)
  if (p.isNew) flags.push('new since last scan');
  if (p.cpuPct > 40) flags.push(`cpu ~${Math.round(p.cpuPct)}%`);
  if (p.childrenCount >= 5) flags.push(`${p.childrenCount} children`);
  return { cls, reason, flags };
}

const CLS_ORDER = { agent: 0, tool: 1, system: 2, unknown: 3 };

// sample CPU % (delta of total CPU time between polls), mark new processes,
// count children — real signals, labeled heuristics
function augment(list) {
  const now = Date.now();
  const childCounts = new Map();
  for (const p of list) if (p.parent != null) childCounts.set(p.parent, (childCounts.get(p.parent) ?? 0) + 1);
  for (const p of list) {
    p.childrenCount = childCounts.get(p.pid) ?? 0;
    const prev = samples.get(p.pid);
    if (prev && now > prev.t) {
      const dtSec = (now - prev.t) / 1000;
      const dCpu = p.cpuSec - prev.cpu;
      p.cpuPct = Math.max(0, (dCpu / Math.max(dtSec, 0.1)) * 100);
    } else {
      p.cpuPct = 0;
    }
    // only flag "new" once we have a real baseline (2nd+ refresh)
    p.isNew = prevPids.size > 0 && !prevPids.has(p.pid);
    samples.set(p.pid, { t: now, cpu: p.cpuSec, ws: p.wsBytes });
  }
  const alive = new Set(list.map((p) => p.pid));
  for (const k of samples.keys()) if (!alive.has(k)) samples.delete(k);
  if (samples.size > 4000) samples.clear();
  prevPids = alive;
}

// --------------------------------------------------------------- helpers
const humanBytes = (b) => {
  if (!b) return '0';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)}${u[i]}`;
};
const humanSec = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)}h` : s >= 60 ? `${Math.floor(s / 60)}m${Math.floor(s % 60)}s` : `${s.toFixed(1)}s`);

// --------------------------------------------------------------- TUI state
const args = process.argv.slice(2);
const FLAG_JSON = args.includes('--json');
const FLAG_ONCE = args.includes('--once');
const ivArg = args.find((a) => a.startsWith('--interval='));
let intervalSec = Math.max(1, Number(ivArg ? ivArg.split('=')[1] : 3) || 3);

let processes = [];
let rows = [];
let sel = 0, scrollTop = 0;
let sortKey = 'ws';
let filter = '';
let detailOn = false;
let usage = { total: 0, agents: 0, tools: 0, system: 0, unknown: 0, flagged: 0 };
let message = 'welcome — press ? for keys';
let lastLoad = 0;
let loading = true;
let maxWs = 1;
let inputMode = null; // 'filter' | 'kill'
let samples = new Map(); // pid -> {t, cpu, ws}
let prevPids = new Set();
let treeMode = false;
let indents = [];
let dockerNote = null;
const dockerBase = 9_000_000;
let inputBuf = '';
let ollama = null;

function rebuild() {
  let list = processes.slice();
  if (filter) {
    const f = filter.toLowerCase();
    list = list.filter((p) => p.label.toLowerCase().includes(f) || p.cmd.toLowerCase().includes(f) || String(p.pid).includes(f));
  }
  indents = [];
  if (treeMode) {
    // parent-child tree (preorder, children by ws desc)
    const byParent = new Map();
    for (const p of list) {
      const k = p.parent ?? 'root';
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(p);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => b.wsBytes - a.wsBytes);
    const roots = list.filter((p) => !list.some((x) => x.pid === p.parent));
    const flat = [];
    const walk = (node, depth, isLast, prefix) => {
      const branch = depth === 0 ? '' : (isLast ? '└─ ' : '├─ ');
      flat.push(node);
      indents.push(prefix + branch);
      const kids = (byParent.get(node.pid) ?? []).filter((k) => k !== node);
      const childPrefix = prefix + (depth === 0 ? '' : (isLast ? '   ' : '│  '));
      kids.forEach((kid, i) => walk(kid, depth + 1, i === kids.length - 1, childPrefix, true));
    };
    roots.sort((a, b) => b.wsBytes - a.wsBytes);
    roots.forEach((r, i) => walk(r, 0, i === roots.length - 1, '', true));
    rows = flat.filter(Boolean);
  } else {
    const keyFn = {
      ws: (p) => p.wsBytes, cpu: (p) => p.cpuSec, pid: (p) => p.pid, name: (p) => p.label,
      cls: (p) => CLS_ORDER[classify(p).cls],
    }[sortKey] ?? ((p) => p.wsBytes);
    list.sort((a, b) => (sortKey === 'name' || sortKey === 'cls' ? String(keyFn(a)).localeCompare(String(keyFn(b))) : keyFn(b) - keyFn(a)));
    rows = list;
    indents = rows.map(() => '');
  }
  if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
  usage = processes.reduce(
    (acc, p) => {
      const { cls, flags } = classify(p);
      acc.total++;
      acc[cls === 'unknown' ? 'unknown' : cls]++;
      if (flags.length) acc.flagged++;
      return acc;
    },
    { total: 0, agents: 0, tools: 0, system: 0, unknown: 0, flagged: 0 },
  );
  maxWs = Math.max(1, ...processes.map((p) => p.wsBytes));
}

async function refresh(mode) {
  loading = true; draw();
  try {
    const list = await loadProcesses();
    augment(list);
    processes = list;
    lastLoad = Date.now();
    loading = false;
    if (ollama === undefined && isWin) {
      try {
        const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(1200) });
        if (res.ok) ollama = await res.json();
        else ollama = null;
      } catch { ollama = null; }
    }
    message = `${list.length} processes · ${Date.now() - lastLoad}ms load · updated ${new Date().toLocaleTimeString()}`;
    rebuild(); draw();
  } catch (err) {
    loading = false;
    message = `load error: ${err.message}`;
    draw();
  }
  if (mode === 'once') drawOnce();
}

// --------------------------------------------------------------- rendering
function drawOnce() {
  rebuild();
  const out = [];
  out.push('AEGIS agents — local agent inventory');
  out.push(`total=${usage.total} agents=${usage.agents} tools=${usage.tools} system=${usage.system} unknown=${usage.unknown} flagged=${usage.flagged}`);
  out.push('PID     CLASS   MEM       CPU      THREADS  NAME                    STARTED     PARENT  FLAGS');
  for (const p of rows.slice(0, 80)) {
    const { cls, flags } = classify(p);
    out.push([
      String(p.pid).padEnd(7),
      cls.padEnd(7),
      humanBytes(p.wsBytes).padEnd(9),
      humanSec(p.cpuSec).padEnd(8),
      String(p.threads).padEnd(8),
      p.label.slice(0, 22).padEnd(23),
      (p.started ? p.started.toLocaleTimeString() : '?').padEnd(9),
      String(p.parent ?? '').padEnd(7),
      flags.join(',').slice(0, 24),
    ].join(' '));
  }
  process.stdout.write(out.join('\n') + '\n');
}

function render() {
  const cols = process.stdout.columns || 120;
  const rowsH = process.stdout.rows || 30;
  const paneW = detailOn ? Math.min(52, Math.floor(cols * 0.42)) : 0;
  const tableW = cols - paneW - 1;
  const headerH = 4;
  const listH = rowsH - headerH - 3;
  const out = [];
  out.push(C.clear + C.home);

  // header — title, stats, clock
  const title = `${C.bold}${col(hue.white, ' AEGIS')} ${col(hue.orange, 'agents')}${C.reset} — live local agent console`;
  const stats = `${usage.total} procs · ${col(hue.green, usage.agents + ' agents')} · ${col(hue.cyan, usage.tools + ' tools')} · ${col(hue.gray, usage.system + ' sys')}${usage.flagged ? ` · ${col(hue.red, usage.flagged + ' flagged')}` : ''}`;
  out.push(`${title}${' '.repeat(Math.max(2, tableW - title.length - stats.length))}${stats}`);
  const clock = `${loading ? ' scanning…' : ''} ${new Date().toLocaleTimeString()}  INT ${intervalSec}s`;
  out.push(`${col(hue.dim, ' device agent inventory — detail: ')}${col(hue.orange, 'ENTER')}${col(hue.dim, ' · sort: 1mem 2cpu 3pid 4name 5class · filter ')}${col(hue.orange, 'f')}${col(hue.dim, ' · export ')}${col(hue.orange, 'e')}${col(hue.dim, ' · kill ')}${col(hue.orange, 'K')}${col(hue.dim, ' · refresh ')}${col(hue.orange, 'r')}${col(hue.dim, ' · quit ')}${col(hue.orange, 'q')}${' '.repeat(Math.max(1, tableW - 120))}${col(hue.dim, clock)}`);
  out.push(C.bold + col(hue.gray, ' PID    CLASS  MEM      CPU       TH').slice(0, tableW) + col(hue.dim, `  NAME ${filter ? `[filter: ${filter}]` : ''}${' '.repeat(Math.max(1, tableW - 16 - (filter ? 12 + filter.length : 0)))}  STARTED     PARENT`) + C.reset);

  // rows
  const vis = Math.min(listH, rows.length);
  if (sel < scrollTop) scrollTop = sel;
  if (sel >= scrollTop + vis) scrollTop = sel - vis + 1;
  scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, rows.length - vis)));
  for (let i = 0; i < vis; i++) {
    const idx = scrollTop + i;
    const p = rows[idx];
    if (!p) { out.push(''); continue; }
    const { cls, flags } = classify(p);
    const selRow = idx === sel;
    const clsC = cls === 'agent' ? hue.green : cls === 'tool' ? hue.cyan : cls === 'system' ? hue.gray : hue.dim;
    const memBar = Math.min(8, Math.round((p.wsBytes / maxWs) * 8));
    const bar = '█'.repeat(memBar) + '░'.repeat(8 - memBar);
    const indent = indents[idx] ?? '';
    const st = p.docker ? (p.startedText || '?') : (p.started ? p.started.toLocaleTimeString() : '?');
    const line =
      ` ${String(p.pid).padEnd(5)} ${col(clsC, cls.padEnd(5))} ${humanBytes(p.wsBytes).padEnd(9)} ${humanSec(p.cpuSec).padEnd(8)} ${String(p.threads).padEnd(4)}` +
      `${indent}${p.isNew ? col(hue.yellow, '★') : ' '} ${p.label.slice(0, Math.max(6, 22 - indent.length)).padEnd(22)} ${st.padEnd(9)} ${String(p.parent ?? '').padEnd(7)}` +
      `${flags.length ? col(hue.red, '⚠') : ' '} ${bar}`;
    const padded = line.length < tableW ? line + ' '.repeat(tableW - line.length) : line.slice(0, tableW);
    if (selRow) out.push(C.inv + padded.slice(0, tableW) + C.reset);
    else out.push(padded);
  }
  for (let i = vis; i < listH; i++) out.push('');

  // message + filter/confirm input + detail pane
  if (inputMode === 'kill' && rows[sel]) {
    out[listH + headerH + 0] = `${col(hue.red, ` kill ${rows[sel].label} (pid ${rows[sel].pid})?`) } ${inputBuf}_ (y/n/esc)`;
  } else if (inputMode === 'filter') {
    out[listH + headerH + 0] = `${col(hue.orange, ' filter: ')}${inputBuf}_`;
  } else {
    out[listH + headerH + 0] = `${col(hue.dim, message)}${' '.repeat(Math.max(1, tableW - message.length - 10))}${col(hue.gray, `row ${sel + 1}/${rows.length}`)}`;
  }
  out[listH + headerH + 1] = col(hue.dim, ` ${ollama ? `OLLAMA: ${ollama.models.map((m) => m.name).join(', ')}` : ' agent profile: '}${rows[sel] ? `${rows[sel].label} → ${classify(rows[sel]).reason}${classify(rows[sel]).flags.length ? ' · ' + classify(rows[sel]).flags.join(' · ') : ''}` : ''}${dockerNote ? ` · ${dockerNote}` : ''} · ${treeMode ? 'TREE' : 'FLAT'}`.slice(0, tableW));

  if (detailOn && rows[sel]) {
    const p = rows[sel];
    const { cls, reason, flags } = classify(p);
    const det = [
      ` ${C.bold}${col(hue.white, p.label)}${C.reset}  ${col(hue.orange, cls.toUpperCase())}`,
      '',
      `${col(hue.dim, 'detect  ')} ${reason}`,
      `${col(hue.dim, 'pid     ')} ${p.pid}`,
      `${col(hue.dim, 'parent  ')} ${p.parent} ${(() => { const par = processes.find((x) => x.pid === p.parent); return par ? `(${par.label})` : ''; })()}`,
      `${col(hue.dim, 'session ')} ${p.session}`,
      `${col(hue.dim, 'started ')} ${p.started ? p.started.toLocaleString() : '?'}`,
      `${col(hue.dim, 'cpu     ')} ${humanSec(p.cpuSec)} total`,
      `${col(hue.dim, 'mem     ')} ${humanBytes(p.wsBytes)} ws · ${humanBytes(p.pmBytes)} pm`,
      `${col(hue.dim, 'threads ')} ${p.threads} · ${col(hue.dim, 'handles ')} ${p.handles}`,
      `${p.cpuPct != null ? `${col(hue.dim, 'cpu~    ')} ${p.cpuPct.toFixed(0)}% live` : ''}${p.docker ? ` ${col(hue.dim, '· docker')} ${(p.networks ?? []).join(',')}` : ''}`,
      '',
      `${col(hue.dim, 'path    ')} ${p.path || '—'}`.slice(0, paneW - 2),
      '',
    ];
    const wrap = (s, w) => { const words = s.split(/\s+/); const lines = []; let cur = ''; for (const wd of words) { if ((cur + ' ' + wd).length > w) { lines.push(cur); cur = wd; } else cur = cur ? cur + ' ' + wd : wd; } if (cur) lines.push(cur); return lines; };
    const cmdLines = wrap(`${col(hue.dim, 'cmd     ')} ${p.cmd || '—'}`, paneW - 4).slice(0, 8);
    det.push(...cmdLines);
    if (flags.length) det.push('', col(hue.red, ' ⚠ ' + flags.join(' · ')));
    for (let i = 0; i < det.length; i++) {
      out[i + headerH] = (out[i + headerH] || '') + ' │ ' + det[i].slice(0, paneW);
    }
    out[listH + headerH + 0] = ` ${col(hue.dim, message)}${' '.repeat(Math.max(1, tableW - message.length - 10))}${col(hue.gray, `row ${sel + 1}/${rows.length}`)} ─ detail`;
  }
  process.stdout.write(out.join('\n'));
}

function draw() {
  if (!FLAG_JSON && !FLAG_ONCE) render();
}

// --------------------------------------------------------------- input
function keypress(buf) {
  const key = buf.toString('utf8');
  if (inputMode === 'filter') {
    if (key === '\x1b' || key === '\r') { filter = inputMode === 'filter' ? inputBuf : filter; if (key === '\x1b') filter = ''; inputMode = null; inputBuf = ''; sel = 0; rebuild(); draw(); return; }
    if (key === '\x7f' || key === '\b') { inputBuf = inputBuf.slice(0, -1); }
    else if (key.length === 1 && key >= ' ' && key !== '\x1b') inputBuf += key;
    else if (key === '\r') {}
    rebuild(); draw();
    return;
  }
  if (inputMode === 'kill') {
    if (key === 'y' || key === 'Y') {
      const p = rows[sel];
      execFile('taskkill', ['/PID', String(p.pid), '/F'], { windowsHide: true }, (err) => {
        message = err ? `kill failed: ${err.message}` : `${p.label} (pid ${p.pid}) terminated`;
        killArmed = false;
        refresh();
      });
      inputMode = null; inputBuf = '';
    } else if (key === 'n' || key === 'N' || key === '\x1b') { inputMode = null; inputBuf = ''; message = 'kill aborted'; draw(); }
    return;
  }
  switch (key) {
    case 'q': case '\x03': cleanup(); process.exit(0);
    case 'j': case '\x1b[B': sel = Math.min(rows.length - 1, sel + 1); draw(); break;
    case 'k': case '\x1b[A': sel = Math.max(0, sel - 1); draw(); break;
    case 'g': sel = 0; scrollTop = 0; draw(); break;
    case 'G': sel = rows.length - 1; draw(); break;
    case '\x1b[6~': sel = Math.min(rows.length - 1, sel + (process.stdout.rows || 30) - 7); draw(); break;
    case '\x1b[5~': sel = Math.max(0, sel - ((process.stdout.rows || 30) - 7)); draw(); break;
    case '1': sortKey = 'ws'; message = 'sorted by memory'; rebuild(); draw(); break;
    case '2': sortKey = 'cpu'; message = 'sorted by cpu time'; rebuild(); draw(); break;
    case '3': sortKey = 'pid'; message = 'sorted by pid'; rebuild(); draw(); break;
    case '4': sortKey = 'name'; message = 'sorted by name'; rebuild(); draw(); break;
    case '5': sortKey = 'cls'; message = 'sorted by class'; rebuild(); draw(); break;
    case 't': treeMode = !treeMode; message = treeMode ? 'tree view (parent → children)' : 'flat view'; sel = 0; rebuild(); draw(); break;
    case 'f': inputMode = 'filter'; inputBuf = filter; draw(); break;
    case 'd': case '\r': case '\n': detailOn = !detailOn; draw(); break;
    case 'r': refresh(); break;
    case '+': case '=': intervalSec = Math.min(15, intervalSec + 1); message = `interval ${intervalSec}s`; draw(); break;
    case '-': case '_': intervalSec = Math.max(1, intervalSec - 1); message = `interval ${intervalSec}s`; draw(); break;
    case 'K': if (rows[sel]) { inputMode = 'kill'; inputBuf = ''; draw(); } break;
    case 'e': {
      const out = `aegis-agents-export-${Date.now()}.json`;
      writeFileSync(out, JSON.stringify(processes.map((p) => ({ ...p, started: p.started ? p.started.toISOString() : null, ...classify(p) })), null, 2));
      message = `exported ${processes.length} processes → ${out}`;
      draw();
      break;
    }
    case '?': message = 'keys: j/k/↑/↓ select · g/G top/bottom · d/ENTER detail · f filter · 1-5 sort · r refresh · +/− interval · k kill · e export · q quit'; draw(); break;
    default: break;
  }
}

function cleanup() {
  process.stdout.write('\x1b[?1049l\x1b[?25h\x1b[0m');
}

// --------------------------------------------------------------- main
const snapshot = (list) => list.map((p) => ({ ...p, started: p.started ? p.started.toISOString() : null, ...classify(p) }));

if (FLAG_JSON) {
  loadProcesses()
    .then((list) => { augment(list); process.stdout.write(JSON.stringify(snapshot(list), null, 2)); })
    .catch((err) => { console.error(err.message); process.exit(1); });
} else if (FLAG_ONCE) {
  loadProcesses()
    .then(() => { refresh('once'); })
    .catch((err) => { console.error(err.message); process.exit(1); });
} else {
  if (!process.stdin.isTTY) {
    console.error('no tty — use --json or --once (or run interactively)');
    process.exit(1);
  }
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', keypress);
  process.stdout.on('resize', () => draw());
  process.stdout.write('\x1b[?1049h\x1b[?25l');
  process.on('exit', cleanup);
  process.on('SIGINT', () => process.exit(0));

  refresh();
  setInterval(() => refresh(), intervalSec * 1000);
}