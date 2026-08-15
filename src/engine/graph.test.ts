// AEGIS Graph Engine unit tests — node:test via tsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttackSurfaceGraph } from './graph.js';
import { NodeKind, EdgeKind, RiskSeverity } from '../types/index.js';

function tinyGraph() {
  const g = new AttackSurfaceGraph();
  const gw = g.addNode(NodeKind.GATEWAY, 'GW', {}, { x: 100, y: 100 });
  const a1 = g.addNode(NodeKind.AGENT, 'A1', {}, { x: 200, y: 100 });
  const a2 = g.addNode(NodeKind.AGENT, 'A2', {}, { x: 300, y: 150 });
  const d1 = g.addNode(NodeKind.DATA_SOURCE, 'SECRETS', { sensitivity: 'critical' }, { x: 300, y: 250 });
  const d2 = g.addNode(NodeKind.DATA_SOURCE, 'PUBLIC', { sensitivity: 'low' }, { x: 400, y: 100 });
  g.addEdge(gw, a1, EdgeKind.DELEGATION, 1);
  g.addEdge(a1, a2, EdgeKind.DELEGATION, 0.9);
  g.addEdge(a1, d2, EdgeKind.DATA_FLOW, 0.5);
  g.addEdge(gw, a2, EdgeKind.INVOCATION, 0.8);
  g.addEdge(a2, d1, EdgeKind.DATA_FLOW, 0.95);
  return { g, gw, a1, a2, d1, d2 };
}

test('blast radius reaches connected data and reports min-cut', () => {
  const { g, gw, d1, d2 } = tinyGraph();
  const blast = g.calculateBlastRadius(gw);
  assert.ok(blast.reachableNodes.includes(d1), 'secrets should be reachable from gateway');
  assert.ok(blast.reachableNodes.includes(d2), 'public data reachable');
  assert.equal(blast.affectedDataSources.length, 2);
  assert.ok(blast.minCutCapacity >= 0);
  assert.ok(blast.criticalPaths.length >= 1, 'critical path toward sensitive data');
});

test('blast radius from isolated node stays local', () => {
  const { g, a1 } = tinyGraph();
  const blast = g.calculateBlastRadius(a1);
  assert.ok(blast.affectedDataSources.length >= 1);
  assert.ok(blast.timeToCompromise.get(a1) === 0);
});

test('betweenness centrality ranks chokepoints highest', () => {
  const { g, a2 } = tinyGraph();
  const central = g.calculateCentrality();
  const entries = [...central.entries()].sort((a, b) => b[1] - a[1]);
  // A2 bridges both shortest paths (gw→d1 and a1→d1) — the real chokepoint
  assert.equal(entries[0][0], a2, 'A2 should be the betweenness chokepoint');
  assert.ok(entries[0][1] >= 0 && entries[0][1] <= 1);
});

test('loadExternal maps ids and builds edges', () => {
  const g = new AttackSurfaceGraph();
  g.loadExternal(
    [
      { id: 'n1', kind: NodeKind.AGENT, label: 'AGENT-1' },
      { id: 'n2', kind: NodeKind.DATA_SOURCE, label: 'D1' },
    ],
    [{ id: 'e1', source: 'n1', target: 'n2', kind: EdgeKind.DATA_FLOW, weight: 0.7 }],
  );
  assert.equal(g.getAllNodes().length, 2);
  const edges = g.getAllEdges();
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source, 'n1');
  assert.equal(edges[0].weight, 0.7);
  // unknown edge target is skipped
  const g2 = new AttackSurfaceGraph();
  g2.loadExternal(
    [{ id: 'x', kind: NodeKind.AGENT, label: 'X' }],
    [{ id: 'bad', source: 'x', target: 'missing', kind: EdgeKind.DATA_FLOW }],
  );
  assert.equal(g2.getAllEdges().length, 0);
});

test('crypto profile drives migration priority', () => {
  const { g, d1 } = tinyGraph();
  g.setCryptoProfile(d1, {
    algorithm: 'ECDSA-P256' as never,
    keySize: 256,
    quantumResistance: 1 as never,
    nistLevel: 1,
    migrationTarget: undefined,
    migrationPriority: 0,
    lastRotated: Date.now(),
    expiresAt: Date.now() + 86400000,
    issuer: 'AEGIS CA',
    subject: 'ECDSA-P256',
    fingerprint: 'sha256:test',
  });
  const ok = g.migrateCrypto(d1, 'ML-KEM-768' as never);
  assert.ok(ok);
  assert.equal(g.getNode(d1)!.cryptoProfile!.migrationPriority, 1);
});

test('undo restores previous topology', () => {
  const { g, a1, d1 } = tinyGraph();
  const before = g.getAllNodes().length;
  g.addNode(NodeKind.TOOL, 'TEMP', {}, { x: 500, y: 500 });
  assert.equal(g.getAllNodes().length, before + 1);
  assert.ok(g.undo());
  assert.equal(g.getAllNodes().length, before);
});

test('risk severity constants are sane', () => {
  assert.ok(RiskSeverity.CRITICAL >= RiskSeverity.HIGH);
});