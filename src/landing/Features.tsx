// AEGIS Feature Grid — dense, high-information cards with REAL engine output
// Betweenness (Brandes), blast radius (min-cut), live telemetry (SSE), live DuckDB query,
// real PQC inventory, and migration planning computed from actual crypto profiles.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AttackSurfaceGraph } from '../engine/graph';
import { NodeKind, EdgeKind, RiskSeverity } from '../types';
import type { NodeId } from '../types';
import { Eyebrow, Reveal, useTelemetryStream, getJson, SERVER_HOST } from './kit';

// ---- small real fixture used by the engine widgets -------------------------
function buildMini(): AttackSurfaceGraph {
  const g = new AttackSurfaceGraph();
  const gw = g.addNode(NodeKind.GATEWAY, 'GW', {}, { x: 200, y: 200 });
  const a1 = g.addNode(NodeKind.AGENT, 'A1', {}, { x: 380, y: 120 });
  const a2 = g.addNode(NodeKind.AGENT, 'A2', {}, { x: 380, y: 320 });
  const t1 = g.addNode(NodeKind.TOOL, 'T1', {}, { x: 560, y: 80 });
  const t2 = g.addNode(NodeKind.TOOL, 'T2', {}, { x: 560, y: 260 });
  const d1 = g.addNode(NodeKind.DATA_SOURCE, 'D1', { sensitivity: 'critical' }, { x: 740, y: 200 });
  const a3 = g.addNode(NodeKind.AGENT, 'A3', {}, { x: 380, y: 500 });
  const d2 = g.addNode(NodeKind.DATA_SOURCE, 'D2', { sensitivity: 'high' }, { x: 560, y: 460 });
  const d3 = g.addNode(NodeKind.DATA_SOURCE, 'D3', { sensitivity: 'high' }, { x: 200, y: 420 });
  g.addEdge(gw, a1, EdgeKind.DELEGATION, 0.9);
  g.addEdge(gw, a2, EdgeKind.DELEGATION, 0.8);
  g.addEdge(a1, t1, EdgeKind.INVOCATION, 0.8);
  g.addEdge(a1, t2, EdgeKind.INVOCATION, 0.6);
  g.addEdge(a2, t2, EdgeKind.INVOCATION, 0.9);
  g.addEdge(t1, d1, EdgeKind.DATA_FLOW, 0.7);
  g.addEdge(t2, d1, EdgeKind.DATA_FLOW, 0.8);
  g.addEdge(gw, a3, EdgeKind.INVOCATION, 0.6);
  g.addEdge(a3, d2, EdgeKind.DATA_FLOW, 0.9);
  g.addEdge(a3, d3, EdgeKind.DATA_FLOW, 0.7);
  g.stepLayout(120, { width: 900, height: 600 });
  g.getNode(a2)!.riskScore = 0.65;
  g.getNode(a2)!.severity = RiskSeverity.HIGH;
  return g;
}

function Card({ index, title, tag, tagTone, children, className = '' }: {
  index: string; title: string; tag: string; tagTone: 'live' | 'engine' | 'api'; children: React.ReactNode; className?: string;
}) {
  const tagColor = tagTone === 'live' ? 'text-alert border-alert/40' : tagTone === 'api' ? 'text-verify border-verify/40' : 'text-ink-dim border-hairline-strong';
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={`group flex flex-col border border-hairline bg-carbon p-5 transition-colors hover:border-hairline-strong ${className}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="font-geist-mono text-[10px] tracking-widest text-ink-mute">{index}</span>
        <span className={`border px-2 py-0.5 font-geist-mono text-[9px] tracking-widest ${tagColor}`}>{tag}</span>
      </div>
      <h3 className="font-geist-mono text-[13px] font-medium tracking-widest text-ink">{title}</h3>
      <div className="mt-3 flex-1 text-[13px] leading-relaxed text-ink-dim">{children}</div>
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-hairline py-1 last:border-0">
      <span className="font-geist-mono text-[10px] tracking-wider text-ink-mute">{label}</span>
      <span className="font-geist-mono text-[11px] text-ink">{value}</span>
    </div>
  );
}

export function Features() {
  const mini = useRef<AttackSurfaceGraph | null>(null);
  if (!mini.current) mini.current = buildMini();
  const graph = mini.current;

  // 1 — blast radius: cycle through source nodes on click
  const sources = useMemo(() => graph.getAllNodes().map(n => n.id), []);
  const [srcIdx, setSrcIdx] = useState(0);
  const source = sources[srcIdx % sources.length];
  const blast = useMemo(() => graph.calculateBlastRadius(source), [source]);
  const blastNode = graph.getNode(source);

  // 2 — betweenness (Brandes) once
  const central = useMemo(() => {
    const c = graph.calculateCentrality();
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, []);
  const maxC = central[0]?.[1] ?? 1;

  // 3 — real PQC inventory
  const [algos, setAlgos] = useState<Array<{ name: string; nistLevel: number; klass: string }> | null>(null);
  const [algoErr, setAlgoErr] = useState(false);
  useEffect(() => {
    getJson<Array<{ name: string; nistLevel: number; klass: string }>>('/api/pqc/algorithms')
      .then(setAlgos)
      .catch(() => setAlgoErr(true));
  }, []);

  // 4 — live telemetry via SSE
  const { stats, live } = useTelemetryStream();

  // 5 — real DuckDB query
  const [q, setQ] = useState<{ version: string; ms: number } | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [qBusy, setQBusy] = useState(false);
  const runQuery = async () => {
    setQBusy(true); setQErr(null);
    try {
      const t0 = performance.now();
      const res = await getJson<{ version: string; executionTimeMs: number }>('/api/demo/duckdb-version');
      setQ({ version: res.version, ms: res.executionTimeMs || Math.round(performance.now() - t0) });
    } catch (e) {
      setQErr(e instanceof Error ? e.message : String(e));
    } finally { setQBusy(false); }
  };

  // 6 — migration planner over real profiles
  const migration = useMemo(() => {
    const rows = graph.getAllNodes().map(n => {
      const p = n.cryptoProfile;
      return { label: n.label, algo: p?.algorithm ?? 'NONE', qr: p?.quantumResistance ?? 0, nist: p?.nistLevel ?? 0 };
    });
    const toMigrate = rows.filter(r => r.qr < 2);
    return { rows, toMigrate };
  }, [graph]);

  return (
    <section id="features" className="relative mx-auto max-w-[1280px] px-6 py-20 lg:py-28">
      <Reveal>
        <Eyebrow>Capabilities — computed, not claimed</Eyebrow>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-[34px] leading-[1.05] text-ink sm:text-[44px]">
            Every number below is <em className="italic text-alert">computed live.</em>
          </h2>
          <p className="max-w-[36ch] font-geist text-[14px] leading-relaxed text-ink-dim">
            The same engine that powers the console powers this page. Click, query, and inspect —
            nothing is staged.
          </p>
        </div>
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 1 */}
        <Card index="01" title="BLAST RADIUS" tag="ENGINE" tagTone="engine">
          <p className="font-geist text-[12px] text-ink-mute">Max-flow / min-cut (Edmonds-Karp) from source node:</p>
          <div className="mt-2 flex items-baseline justify-between font-geist-mono text-[11px] text-ink">
            <span className="text-alert">{blastNode?.label ?? '?'}</span>
            <span>{blast.reachableNodes.length} REACHABLE</span>
          </div>
          <Metric label="MIN-CUT CAPACITY" value={blast.minCutCapacity.toFixed(1)} />
          <Metric label="AGENTS AFFECTED" value={String(blast.affectedAgents.length)} />
          <Metric label="DATA AFFECTED" value={String(blast.affectedDataSources.length)} />
          <Metric label="CRITICAL PATHS" value={String(blast.criticalPaths.length)} />
          <button
            onClick={() => setSrcIdx(i => i + 1)}
            className="mt-3 w-full border border-hairline-strong px-3 py-2 font-geist-mono text-[10px] tracking-widest text-ink-dim transition-colors hover:border-alert hover:text-alert"
          >
            RE-RUN FROM NEXT SOURCE →
          </button>
        </Card>

        {/* 2 */}
        <Card index="02" title="BETWEENNESS CENTRALITY" tag="ENGINE" tagTone="engine">
          <p className="font-geist text-[12px] text-ink-mute">Brandes algorithm, O(V·E). Normalized scores:</p>
          <div className="mt-3 space-y-2.5">
            {central.map(([id, v]) => {
              const n = graph.getNode(id);
              return (
                <div key={id}>
                  <div className="flex items-baseline justify-between font-geist-mono text-[10px] tracking-wider">
                    <span className="text-ink">{n?.label ?? '?'}</span>
                    <span className="text-ink-mute">{v.toFixed(3)}</span>
                  </div>
                  <div className="mt-1 h-[3px] w-full bg-hairline">
                    <div className="h-full bg-alert" style={{ width: `${Math.max(4, (v / maxC) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-geist-mono text-[10px] text-ink-mute">TOP-3 HIGH-VALUE TARGETS</p>
        </Card>

        {/* 3 */}
        <Card index="03" title="PQC INVENTORY" tag="API" tagTone="api">
          <p className="font-geist text-[12px] text-ink-mute">Live from <span className="font-geist-mono text-[10px]">/api/pqc/algorithms</span>:</p>
          <div className="mt-2.5 space-y-1">
            {algoErr && <p className="font-geist-mono text-[10px] text-danger">API OFFLINE — npm start</p>}
            {!algoErr && !algos && <p className="font-geist-mono text-[10px] text-ink-mute">FETCHING…</p>}
            {algos?.map(a => (
              <div key={a.name} className="flex items-baseline justify-between border-b border-hairline py-1 font-geist-mono text-[10px] last:border-0">
                <span className="text-ink-dim">{a.name}</span>
                <span className="text-ink-mute">{a.klass.toUpperCase()} · NIST-{a.nistLevel}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 font-geist-mono text-[10px] text-ink-mute">{algos?.length ?? 0} ALGORITHMS · 3 NIST FAMILIES</p>
        </Card>

        {/* 4 */}
        <Card index="04" title="LIVE TELEMETRY" tag="LIVE" tagTone="live">
          <p className="font-geist text-[12px] text-ink-mute">Streaming over Server-Sent Events:</p>
          <div className="mt-2.5">
            <Metric label="EVENTS INGESTED" value={stats ? String(stats.eventsIngested) : '—'} />
            <Metric label="QUERIES EXECUTED" value={stats ? String(stats.queriesExecuted) : '—'} />
            <Metric label="PQC OPERATIONS" value={stats ? String(stats.pqcOperations) : '—'} />
            <Metric label="SSE CLIENTS" value={stats ? String(stats.sseClients) : '—'} />
          </div>
          <p className="mt-3 flex items-center gap-2 font-geist-mono text-[10px] text-ink-mute">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-verify animate-pulse' : 'bg-danger'}`} />
            {live ? 'STREAM OPEN — /api/stream' : 'STREAM CLOSED'}
          </p>
        </Card>

        {/* 5 */}
        <Card index="05" title="DUCKDB ANALYTICS" tag="API" tagTone="api">
          <p className="font-geist text-[12px] text-ink-mute">A real query through the server's DuckDB engine:</p>
          <pre className="mt-2.5 overflow-x-auto border border-hairline bg-obsidian p-2.5 font-geist-mono text-[10px] leading-relaxed text-ink-dim">
{`SELECT version()
AS duckdb_version;`}
          </pre>
          <button
            onClick={() => void runQuery()}
            disabled={qBusy}
            className="mt-3 w-full border border-hairline-strong px-3 py-2 font-geist-mono text-[10px] tracking-widest text-ink-dim transition-colors hover:border-verify hover:text-verify"
          >
            {qBusy ? 'EXECUTING…' : q ? 'RE-RUN QUERY' : 'RUN QUERY →'}
          </button>
          {q && (
            <p className="mt-2.5 font-geist-mono text-[10px] leading-relaxed text-verify">
              ✓ {q.version} · {q.ms}ms
            </p>
          )}
          {qErr && <p className="mt-2.5 font-geist-mono text-[10px] text-danger">✗ {qErr}</p>}
        </Card>

        {/* 6 */}
        <Card index="06" title="MIGRATION PLANNER" tag="ENGINE" tagTone="engine">
          <p className="font-geist text-[12px] text-ink-mute">Computed from real crypto profiles:</p>
          <div className="mt-2.5">
            <Metric label="NODES AUDITED" value={String(migration.rows.length)} />
            <Metric label="PQC-CLEAN (QR-2)" value={String(migration.rows.length - migration.toMigrate.length)} />
            <Metric label="SCHEDULED TO MIGRATE" value={String(migration.toMigrate.length)} />
            <Metric label="TARGET" value="ML-KEM-768" />
          </div>
          <div className="mt-3 space-y-1">
            {migration.toMigrate.slice(0, 3).map(r => (
              <div key={r.label} className="flex items-baseline justify-between font-geist-mono text-[10px]">
                <span className="text-ink-dim">{r.label}</span>
                <span className="text-ink-mute">{r.algo} → <span className="text-alert">ML-KEM-768</span></span>
              </div>
            ))}
            {migration.toMigrate.length > 3 && (
              <div className="font-geist-mono text-[10px] text-ink-mute">+{migration.toMigrate.length - 3} MORE</div>
            )}
          </div>
        </Card>
      </div>

      <Reveal className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border border-hairline bg-carbon px-5 py-4">
        <span className="font-geist-mono text-[10px] tracking-widest text-ink-mute">STACK</span>
        {['FASTIFY', 'DUCKDB', '@NOBLE/POST-QUANTUM', 'ZUSTAND', 'FRAMER-MOTION', 'TYPESCRIPT'].map(s => (
          <span key={s} className="font-geist-mono text-[10px] tracking-wider text-ink-dim">{s}</span>
        ))}
        <span className="ml-auto hidden font-geist-mono text-[10px] text-ink-mute sm:inline">ALL REAL · {SERVER_HOST}</span>
      </Reveal>
    </section>
  );
}
