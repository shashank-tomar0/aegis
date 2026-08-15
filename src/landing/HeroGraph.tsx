// AEGIS Hero — live attack-surface graph driving the REAL engine
// Force layout (Fruchterman-Reingold), Brandes centrality, and click-to-compute
// blast radius (max-flow/min-cut) — every number on screen is computed, not faked.

import { useEffect, useRef, useState } from 'react';
import { AttackSurfaceGraph } from '../engine/graph';
import { simRNG } from '../engine/seedrandom';
import { NodeKind, EdgeKind, RiskSeverity } from '../types';
import type { BlastRadiusResult, GraphNode, NodeId } from '../types';

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  agent: { label: 'AGENT', color: '#e4e4e7' },
  tool: { label: 'TOOL', color: '#71717a' },
  data_source: { label: 'DATA', color: '#a1a1aa' },
  gateway: { label: 'GATEWAY', color: '#ff4d00' },
  user: { label: 'USER', color: '#a1a1aa' },
};

function buildFixture(): AttackSurfaceGraph {
  simRNG.setState(20260815);
  const g = new AttackSurfaceGraph();

  const gw = g.addNode(NodeKind.GATEWAY, 'API-GW-01', { description: 'External ingress' }, { x: 300, y: 250 });
  const edge = g.addNode(NodeKind.GATEWAY, 'LLM-EDGE', { description: 'Model inference edge' }, { x: 300, y: 560 });

  const agents: Record<string, NodeId> = {};
  const defs: Array<[string, string, { x: number; y: number }]> = [
    ['SWE-AGENT', 'Code & review pipeline', { x: 640, y: 110 }],
    ['DATA-AGENT', 'Warehouse queries', { x: 640, y: 250 }],
    ['WEB-AGENT', 'Browsing / scraping', { x: 900, y: 190 }],
    ['MAIL-AGENT', 'Inbound triage', { x: 900, y: 400 }],
    ['FIN-OPS', 'Billing automation', { x: 620, y: 430 }],
    ['HR-BOT', 'Recruiting ops', { x: 1180, y: 240 }],
    ['QUERY-ORCH', 'NL→SQL orchestration', { x: 880, y: 620 }],
    ['RECRUITER', 'Candidate outreach', { x: 1200, y: 520 }],
  ];
  for (const [label, desc, pos] of defs) {
    agents[label] = g.addNode(NodeKind.AGENT, label, { description: desc }, pos);
  }

  const tools: Record<string, NodeId> = {};
  const tdefs: Array<[string, string, { x: number; y: number }]> = [
    ['GITHUB', 'Source control', { x: 640, y: -30 }],
    ['SLACK', 'Messaging', { x: 900, y: 60 }],
    ['WEBHOOK-FANOUT', 'Event dispatch', { x: 300, y: 430 }],
    ['POSTGRES', 'OLTP store', { x: 1200, y: 80 }],
    ['REDIS', 'Cache layer', { x: 1180, y: 400 }],
    ['S3-BUCKET', 'Object storage', { x: 1500, y: 300 }],
    ['STRIPE-PAY', 'Payments', { x: 900, y: 780 }],
  ];
  for (const [label, desc, pos] of tdefs) {
    tools[label] = g.addNode(NodeKind.TOOL, label, { description: desc }, pos);
  }

  const data: Record<string, NodeId> = {};
  const ddefs: Array<[string, string, { x: number; y: number }, string]> = [
    ['PII-STORE', 'Personal data', { x: 1500, y: 620 }, 'high'],
    ['CREDENTIALS', 'Secrets vault', { x: 640, y: 620 }, 'critical'],
    ['AUDIT-LOG', 'Security trail', { x: 1200, y: 700 }, 'critical'],
    ['MODEL-ARTIFACTS', 'Weights & prompts', { x: 1500, y: 440 }, 'medium'],
    ['CLIENT-DB', 'Customer records', { x: 900, y: 540 }, 'high'],
  ];
  for (const [label, desc, pos, sens] of ddefs) {
    data[label] = g.addNode(NodeKind.DATA_SOURCE, label, { description: desc, sensitivity: sens }, pos);
  }

  const admin = g.addNode(NodeKind.USER, 'ADMIN', {}, { x: 60, y: 60 });
  const ext = g.addNode(NodeKind.USER, 'EXTERNAL', {}, { x: 60, y: 440 });

  const E = EdgeKind;
  const conn: Array<[NodeId, NodeId, EdgeKind, number]> = [
    [admin, gw, E.INVOCATION, 1], [ext, gw, E.INVOCATION, 1],
    [gw, agents['SWE-AGENT'], E.DELEGATION, 0.9], [gw, agents['DATA-AGENT'], E.DELEGATION, 0.8],
    [gw, agents['MAIL-AGENT'], E.INVOCATION, 0.6], [gw, agents['FIN-OPS'], E.INVOCATION, 0.7],
    [edge, agents['QUERY-ORCH'], E.INVOCATION, 0.9], [edge, agents['WEB-AGENT'], E.INVOCATION, 0.8],
    [agents['SWE-AGENT'], tools['GITHUB'], E.INVOCATION, 1],
    [agents['SWE-AGENT'], tools['SLACK'], E.INVOCATION, 0.6],
    [agents['WEB-AGENT'], tools['S3-BUCKET'], E.DATA_FLOW, 0.8],
    [agents['MAIL-AGENT'], tools['WEBHOOK-FANOUT'], E.INVOCATION, 0.7],
    [agents['MAIL-AGENT'], data['PII-STORE'], E.DATA_FLOW, 0.9],
    [agents['DATA-AGENT'], tools['POSTGRES'], E.DATA_FLOW, 1],
    [agents['DATA-AGENT'], data['CLIENT-DB'], E.DATA_FLOW, 0.9],
    [agents['FIN-OPS'], tools['STRIPE-PAY'], E.PRIVILEGE, 0.8],
    [agents['FIN-OPS'], data['CREDENTIALS'], E.PRIVILEGE, 0.7],
    [agents['QUERY-ORCH'], tools['POSTGRES'], E.DATA_FLOW, 0.9],
    [agents['QUERY-ORCH'], data['CLIENT-DB'], E.DATA_FLOW, 0.8],
    [agents['HR-BOT'], agents['RECRUITER'], E.DELEGATION, 0.7],
    [agents['RECRUITER'], tools['SLACK'], E.INVOCATION, 0.6],
    [agents['RECRUITER'], data['PII-STORE'], E.DATA_FLOW, 0.8],
    [agents['QUERY-ORCH'], tools['REDIS'], E.INVOCATION, 0.5],
    [tools['WEBHOOK-FANOUT'], agents['FIN-OPS'], E.INVOCATION, 0.5],
    [gw, data['AUDIT-LOG'], E.DATA_FLOW, 0.9],
    [agents['SWE-AGENT'], data['AUDIT-LOG'], E.DATA_FLOW, 0.8],
    [tools['REDIS'], data['CREDENTIALS'], E.DATA_FLOW, 0.4],
    [edge, data['MODEL-ARTIFACTS'], E.DATA_FLOW, 0.9],
    [data['MODEL-ARTIFACTS'], agents['WEB-AGENT'], E.DATA_FLOW, 0.7],
    [gw, data['CREDENTIALS'], E.PRIVILEGE, 0.5],
  ];
  for (const [s, t, k, w] of conn) g.addEdge(s, t, k, w);

  // Real crypto profiles (mirrors the console domain)
  const profileFor: Record<string, { algorithm: string; keySize: number; qr: number; nist: number }> = {
    [gw]: { algorithm: 'ML-KEM-768', keySize: 768, qr: 2, nist: 3 },
    [edge]: { algorithm: 'ML-KEM-1024', keySize: 1024, qr: 2, nist: 5 },
    [agents['SWE-AGENT']]: { algorithm: 'ML-DSA-65', keySize: 65, qr: 2, nist: 3 },
    [agents['DATA-AGENT']]: { algorithm: 'ECDSA-P256', keySize: 256, qr: 1, nist: 1 },
    [agents['WEB-AGENT']]: { algorithm: 'Ed25519', keySize: 256, qr: 1, nist: 1 },
    [agents['MAIL-AGENT']]: { algorithm: 'RSA-4096', keySize: 4096, qr: 0, nist: 0 },
    [agents['FIN-OPS']]: { algorithm: 'RSA-2048', keySize: 2048, qr: 0, nist: 0 },
    [agents['HR-BOT']]: { algorithm: 'ML-DSA-44', keySize: 44, qr: 2, nist: 2 },
    [agents['QUERY-ORCH']]: { algorithm: 'ML-KEM-768', keySize: 768, qr: 2, nist: 3 },
    [agents['RECRUITER']]: { algorithm: 'ECDSA-P384', keySize: 384, qr: 1, nist: 2 },
    [data['PII-STORE']]: { algorithm: 'ML-KEM-1024', keySize: 1024, qr: 2, nist: 5 },
    [data['CREDENTIALS']]: { algorithm: 'ML-DSA-87', keySize: 87, qr: 2, nist: 5 },
    [data['AUDIT-LOG']]: { algorithm: 'ML-DSA-65', keySize: 65, qr: 2, nist: 3 },
    [data['MODEL-ARTIFACTS']]: { algorithm: 'ML-KEM-768', keySize: 768, qr: 2, nist: 3 },
    [data['CLIENT-DB']]: { algorithm: 'ECDSA-P384', keySize: 384, qr: 1, nist: 2 },
    [tools['GITHUB']]: { algorithm: 'Ed25519', keySize: 256, qr: 1, nist: 1 },
    [tools['SLACK']]: { algorithm: 'RSA-4096', keySize: 4096, qr: 0, nist: 0 },
    [tools['POSTGRES']]: { algorithm: 'ML-KEM-768', keySize: 768, qr: 2, nist: 3 },
    [tools['STRIPE-PAY']]: { algorithm: 'ECDSA-P256', keySize: 256, qr: 1, nist: 1 },
  };
  const now = Date.now();
  for (const [id, p] of Object.entries(profileFor)) {
    g.setCryptoProfile(id as NodeId, {
      algorithm: p.algorithm as never,
      keySize: p.keySize,
      quantumResistance: p.qr as never,
      nistLevel: p.nist,
      migrationTarget: p.qr < 2 ? 'ML-KEM-768' as never : undefined,
      migrationPriority: p.qr < 2 ? 3 - p.qr : 0,
      lastRotated: now - 86400000 * 30,
      expiresAt: now + 86400000 * 90,
      issuer: 'AEGIS CA',
      subject: p.algorithm,
      fingerprint: `sha256:${simRNG.nextFloat(1e8, 9e8).toString(16).slice(0, 12)}`,
    });
  }

  // One compromised node + one quarantined (pinned in layout)
  const fin = g.getNode(agents['FIN-OPS']);
  if (fin) { fin.isCompromised = true; fin.riskScore = 0.92; fin.severity = RiskSeverity.CRITICAL; }
  const s3 = g.getNode(tools['S3-BUCKET']);
  if (s3) { s3.isQuarantined = true; s3.riskScore = 0.6; s3.severity = RiskSeverity.HIGH; }
  const mail = g.getNode(agents['MAIL-AGENT']);
  if (mail) { mail.riskScore = 0.74; mail.severity = RiskSeverity.HIGH; }

  return g;
}

interface Analysis {
  nodeId: NodeId;
  result: BlastRadiusResult;
}

export function HeroGraph() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const graphRef = useRef<AttackSurfaceGraph | null>(null);
  if (!graphRef.current) graphRef.current = buildFixture();

  useEffect(() => {
    const graph = graphRef.current!;
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let w = 0, h = 0, dpr = 1;
    const mouse = { x: -9999, y: -9999, active: false };
    let hoverId: NodeId | null = null;
    let emaDt = 16;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Settle the layout once so the first frame is legible
    if (w > 0) graph.stepLayout(160, { width: w, height: h });

    const hitTest = (px: number, py: number): NodeId | null => {
      let best: NodeId | null = null;
      let bestD = 26;
      for (const n of graph.getAllNodes()) {
        const dx = n.position.x - px, dy = n.position.y - py;
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = n.id; }
      }
      return best;
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = true;
      const hit = hitTest(mouse.x, mouse.y);
      if (hit !== hoverId) {
        hoverId = hit;
        canvas.style.cursor = hit ? 'pointer' : 'default';
      }
    };
    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const hit = hitTest(px, py);
      if (hit) {
        setAnalysis({ nodeId: hit, result: graph.calculateBlastRadius(hit) });
      } else {
        setAnalysis(null);
      }
    };
    const onLeave = () => { mouse.active = false; mouse.x = -9999; mouse.y = -9999; hoverId = null; canvas.style.cursor = 'default'; };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerleave', onLeave);

    const draw = (now: number) => {
      emaDt = emaDt * 0.9 + (now - (lastFrame ?? now)) * 0.1;
      lastFrame = now;
      if (fpsRef.current) {
        const fps = Math.round(1000 / Math.max(emaDt, 0.1));
        if (fpsRef.current.textContent !== String(fps)) fpsRef.current.textContent = String(fps);
      }

      // One real force-layout step per frame
      graph.stepLayout(1, { width: w, height: h });

      // Mouse repulsion — inject into velocities (engine stays authoritative)
      if (mouse.active) {
        for (const n of graph.getAllNodes()) {
          if (n.isQuarantined) continue;
          const dx = n.position.x - mouse.x, dy = n.position.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < 150 && d > 0.01) {
            const f = (150 - d) / 150 * 6;
            n.velocity.vx += (dx / d) * f;
            n.velocity.vy += (dy / d) * f;
          }
        }
      }

      render(ctx, graph, w, h, hoverId, analysisRef.current);
      raf = requestAnimationFrame(draw);
    };

    let lastFrame: number | undefined;
    if (reduced) {
      render(ctx, graph, w, h, null, null);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerleave', onLeave);
    };
    // analysisRef keeps the draw loop from re-subscribing on every click
  }, []);

  const analysisRef = useRef<Analysis | null>(null);
  useEffect(() => { analysisRef.current = analysis; }, [analysis]);

  const graph = graphRef.current;
  const stats = graph.getStats() as {
    nodeCount: number;
    edgeCount: number;
    agentCount: number;
    toolCount: number;
    dataSourceCount: number;
    compromisedCount: number;
    quarantinedCount: number;
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 select-none" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0" aria-label="Interactive attack surface graph" />
      {/* instrument overlays */}
      <div className="pointer-events-none absolute inset-0 landing-hgrid opacity-70" aria-hidden />
      <div className="pointer-events-none absolute inset-0 landing-scanlines" aria-hidden />

      {/* HUD — top left: live legend */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5 font-geist-mono text-[10px] tracking-wider text-ink-dim">
        <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 border border-ink" />AGENT&nbsp;<span className="text-ink-mute">({stats.agentCount})</span></div>
        <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full border border-ink-mute" />TOOL&nbsp;<span className="text-ink-mute">({stats.toolCount})</span></div>
        <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rotate-45 border border-ink-mute" />DATA&nbsp;<span className="text-ink-mute">({stats.dataSourceCount})</span></div>
        <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rotate-45 border border-alert" />GATEWAY</div>
        <div className="mt-1 text-ink-mute">NODES {graph.getAllNodes().length} · EDGES {graph.getAllEdges().length}</div>
        <div className="text-alert">● {stats.compromisedCount} COMPROMISED</div>
      </div>

      {/* HUD — top right: fps (real) */}
      <div className="pointer-events-none absolute right-4 top-4 hidden items-center gap-2 font-geist-mono text-[10px] tracking-wider text-ink-mute sm:flex">
        <span>FORCE LAYOUT</span>
        <span className="text-ink-dim"><span ref={fpsRef}>60</span> FPS</span>
        <span className="h-1.5 w-1.5 rounded-full bg-verify animate-pulse" />
      </div>

      {/* HUD — bottom right hint */}
      <div className="pointer-events-none absolute bottom-4 right-4 font-geist-mono text-[10px] tracking-wider text-ink-mute">
        CLICK A NODE → REAL BLAST-RADIUS ANALYSIS
      </div>

      {/* Analysis card — real engine output */}
      {analysis && (
        <div className="absolute bottom-4 left-4 w-[300px] border border-alert/50 bg-carbon/95 p-3 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between font-geist-mono text-[10px] tracking-widest text-alert">
            <span>BLAST RADIUS // REAL</span>
            <button
              onClick={() => setAnalysis(null)}
              className="text-ink-mute hover:text-ink"
              aria-label="Close analysis"
            >ESC ✕</button>
          </div>
          {(() => {
            const node = graph.getNode(analysis.nodeId);
            const r = analysis.result;
            return (
              <div className="space-y-1.5 font-geist-mono text-[11px] leading-relaxed">
                <div className="text-ink">{node?.label.toUpperCase()} <span className="text-ink-mute">· {KIND_STYLE[node?.kind ?? '']?.label ?? node?.kind}</span></div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-ink-dim">
                  <span>REACH</span><span className="text-right text-ink">{r.reachableNodes.length} NODES</span>
                  <span>MIN-CUT CAP</span><span className="text-right text-ink">{r.minCutCapacity.toFixed(1)}</span>
                  <span>AGENTS</span><span className="text-right text-ink">{r.affectedAgents.length}</span>
                  <span>DATA</span><span className="text-right text-ink">{r.affectedDataSources.length}</span>
                  <span>CRIT PATHS</span><span className="text-right text-ink">{r.criticalPaths.length}</span>
                </div>
                {r.criticalPaths[0] && (
                  <div className="border-t border-hairline pt-1.5 text-[10px] text-ink-mute">
                    <span className="text-alert">TOP PATH:</span> {r.criticalPaths[0].map(id => graph.getNode(id)?.label.toUpperCase() ?? '?').join(' → ')}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ---- canvas renderer -------------------------------------------------------

function render(
  ctx: CanvasRenderingContext2D,
  graph: AttackSurfaceGraph,
  w: number, h: number,
  hoverId: NodeId | null,
  analysis: Analysis | null,
) {
  ctx.clearRect(0, 0, w, h);

  const reach = analysis ? new Set(analysis.result.reachableNodes) : null;
  const onPath = analysis ? new Set(analysis.result.criticalPaths.flat()) : null;

  // Edges
  for (const e of graph.getAllEdges()) {
    const s = graph.getNode(e.source), t = graph.getNode(e.target);
    if (!s || !t) continue;
    const active = onPath && (onPath.has(s.id) && onPath.has(t.id));
    const dimmed = reach && reach.size > 0 && !reach.has(s.id) && !reach.has(t.id) && !(s.id === analysis!.nodeId) && !(t.id === analysis!.nodeId);

    ctx.strokeStyle = active ? 'rgba(255,77,0,0.85)' : dimmed ? 'rgba(58,58,64,0.25)' : '#2e2e33';
    ctx.lineWidth = active ? 1.4 : 1;
    ctx.globalAlpha = dimmed ? 0.5 : 1;
    if (e.kind === EdgeKind.DATA_FLOW) ctx.setLineDash([3, 4]);
    else if (e.kind === EdgeKind.PRIVILEGE) ctx.setLineDash([1, 4]);
    else ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(s.position.x, s.position.y);
    ctx.lineTo(t.position.x, t.position.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Nodes
  for (const n of graph.getAllNodes()) {
    const { x, y } = n.position;
    const isHover = hoverId === n.id;
    const isSource = analysis?.nodeId === n.id;
    const isReach = reach?.has(n.id) ?? false;
    const isDim = reach && reach.size > 0 && !isReach && !isSource;
    const st = KIND_STYLE[n.kind] ?? { label: 'NODE', color: '#71717a' };

    ctx.globalAlpha = isDim ? 0.22 : 1;
    ctx.strokeStyle = st.color;
    ctx.fillStyle = '#0d0d0f';
    ctx.lineWidth = isSource || isHover ? 1.6 : 1;

    const sz = n.kind === NodeKind.USER ? 5 : n.kind === NodeKind.GATEWAY ? 9 : 7;
    ctx.beginPath();
    if (n.kind === NodeKind.AGENT) {
      ctx.rect(x - sz, y - sz, sz * 2, sz * 2);
    } else if (n.kind === NodeKind.TOOL) {
      ctx.arc(x, y, sz, 0, Math.PI * 2);
    } else if (n.kind === NodeKind.DATA_SOURCE) {
      ctx.moveTo(x, y + sz);
      ctx.lineTo(x - sz, y - sz);
      ctx.lineTo(x + sz, y - sz);
      ctx.closePath();
    } else if (n.kind === NodeKind.USER) {
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fillStyle = st.color;
    } else {
      ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y); ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // Compromised pulse
    if (n.isCompromised) {
      ctx.strokeStyle = 'rgba(255,42,0,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, sz + 5 + Math.sin(performance.now() / 180) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff2a00';
      ctx.font = '10px "Geist Mono", monospace';
      ctx.fillText('!', x - 2.5, y + 3.5);
    }

    // Blast highlight ring
    if (isReach && !isSource) {
      ctx.strokeStyle = 'rgba(255,77,0,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, sz + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (isSource) {
      ctx.strokeStyle = '#ff4d00';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, sz + 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Quarantined marker
    if (n.isQuarantined) {
      ctx.strokeStyle = '#ff4d00';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - sz - 4, y - sz - 4); ctx.lineTo(x + sz + 4, y + sz + 4);
      ctx.moveTo(x + sz + 4, y - sz - 4); ctx.lineTo(x - sz - 4, y + sz + 4);
      ctx.stroke();
    }

    // Label
    if (n.kind !== NodeKind.USER) {
      ctx.fillStyle = isDim ? '#3a3a40' : isHover || isSource || isReach ? '#f4f4f5' : '#71717a';
      ctx.font = '10px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.label.toUpperCase(), x, y + sz + 13);
    }
    ctx.globalAlpha = 1;
  }
}
