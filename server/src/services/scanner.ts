// AEGIS Scanner Service — run collectors, compute diffs, emit alerts
// Shared by the HTTP route and the scheduled-scan loop.

import type { AnalyticsStore } from '../db/store.js';
import type { UserStore, ProjectRow, UserRow } from '../db/users.js';
import { getCollector, type CollectorDef } from '../collectors/index.js';
import * as telemetry from './telemetry.js';
import { publishAlert } from './alertsHub.js';

export interface ScanOutcome {
  collector: string;
  simulated: boolean;
  available: boolean;
  note?: string;
  found: number;
  upserted: { nodes: number; edges: number } | null;
  ms: number;
  counts: { nodes: number; edges: number; events: number };
  log: string[];
  diff: { added: string[]; removed: string[] };
  alerts: Array<{ severity: 'critical' | 'high' | 'medium' | 'low'; title: string; detail: string }>;
}

function ruleSeverity(n: { kind: string; label: string; riskScore?: number; severity?: number }): 'critical' | 'high' | 'medium' | 'low' | null {
  if (n.kind === 'data_source' && (n.riskScore ?? 0) >= 0.8) return 'critical';
  if (n.kind === 'data_source') return 'high';
  if ((n.severity ?? 0) >= 4) return 'critical';
  if (n.kind === 'gateway') return 'medium';
  return null;
}

async function executeScan(
  store: AnalyticsStore,
  users: UserStore,
  project: ProjectRow,
  owner: UserRow,
  def: CollectorDef,
): Promise<ScanOutcome> {
  const started = Date.now();
  let result;
  try {
    result = await def.run();
  } catch (err) {
    result = {
      name: def.name,
      source: `collector:${def.name}`,
      simulated: def.simulated,
      available: false,
      note: err instanceof Error ? err.message : String(err),
      nodes: [], edges: [], log: [`✗ ${String(err)}`],
    };
  }
  const ms = Date.now() - started;
  const now = Date.now();

  // diff against the previous run of the same collector in this project
  const prev = users.latestRunByProject(owner.id, project.id, def.name);
  const prevIds = new Set(Object.keys(prev ? JSON.parse(prev.nodeIds) : {}));
  const curIds: Record<string, string> = {};
  for (const n of result.nodes) curIds[n.id] = n.label;
  const curSet = new Set(Object.keys(curIds));
  const added = [...curSet].filter(id => !prevIds.has(id));
  const removed = [...prevIds].filter(id => !curSet.has(id));

  // alert rules
  const alerts: ScanOutcome['alerts'] = [];
  if (result.available) {
    for (const id of added) {
      const n = result.nodes.find(x => x.id === id);
      if (!n) continue;
      const sev = ruleSeverity(n);
      if (sev === 'critical') {
        alerts.push({ severity: 'critical', title: `Critical asset discovered: ${n.label}`, detail: `${n.kind.replace('_', ' ')} appeared in ${project.name} (risk ${(n.riskScore ?? 0).toFixed(2)})` });
      } else if (sev === 'high') {
        alerts.push({ severity: 'high', title: `High-value data source discovered: ${n.label}`, detail: `${n.kind.replace('_', ' ')} appeared in ${project.name}` });
      } else if (sev === 'medium') {
        alerts.push({ severity: 'medium', title: `New gateway: ${n.label}`, detail: `new ${n.kind.replace('_', ' ')} in ${project.name}` });
      }
    }
    if (removed.length > 0 && added.length === 0) {
      alerts.push({ severity: 'low', title: `${removed.length} asset${removed.length === 1 ? '' : 's'} disappeared`, detail: `previous run of ${def.name} found ${removed.length} node(s) no longer present` });
    }
  }
  for (const a of alerts) {
    const row = users.insertAlert({ userId: owner.id, projectId: project.id, severity: a.severity, title: a.title, detail: a.detail });
    publishAlert(row);
  }

  users.recordRun({
    userId: owner.id,
    projectId: project.id,
    collector: def.name,
    found: result.nodes.length + result.edges.length,
    simulated: result.simulated,
    error: result.available ? null : (result.note ?? 'unavailable'),
    ms,
    nodeIds: curIds,
    edgeIds: Object.fromEntries(result.edges.map(e => [e.id, '1'])),
  });

  let upserted: { nodes: number; edges: number } | null = null;
  if (result.available) {
    upserted = await store.upsertGraph(project.sessionId, { nodes: result.nodes, edges: result.edges });
    users.touchProject(owner.id, project.id);
    telemetry.bump('eventsIngested', result.nodes.length + result.edges.length);
  }

  return {
    collector: def.name,
    simulated: result.simulated,
    available: result.available,
    note: result.note,
    found: result.nodes.length + result.edges.length,
    upserted,
    ms,
    counts: await store.graphCounts(project.sessionId),
    log: result.log,
    diff: { added: added.map(id => curIds[id] ?? id), removed },
    alerts,
  };
}

export async function runCollectorForProject(
  store: AnalyticsStore,
  users: UserStore,
  project: ProjectRow,
  owner: UserRow,
  collector: string,
): Promise<ScanOutcome> {
  const def = getCollector(collector);
  if (!def) throw Object.assign(new Error(`unknown collector: ${collector}`), { statusCode: 400 });
  return executeScan(store, users, project, owner, def);
}