// AEGIS API Routes — REST endpoints for PQC, sessions, analytics, threats

import type { FastifyInstance } from 'fastify';
import type { AnalyticsStore } from './db/store.js';
import {
  generateKeyPair, signMessage, verifyMessage, encapsulate, decapsulate, issueCertificate, listAlgorithms,
} from './services/pqc.js';
import * as telemetry from './services/telemetry.js';
import type {
  SessionSnapshot, CertificateSigningRequest, ThreatIntelRecord,
} from '@aegis/shared/types.js';

function badRequest(msg: string): Error & { statusCode: number } {
  const err = new Error(msg) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

function notFound(msg: string): Error & { statusCode: number } {
  const err = new Error(msg) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

export function registerRoutes(app: FastifyInstance, store: AnalyticsStore): void {
  // ---- Health / capabilities ----
  app.get('/api/health', async () => ({
    status: 'ok',
    name: 'aegis-server',
    version: '0.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
    pqcAlgorithms: listAlgorithms().map(a => a.name),
    capabilities: ['pqc-keygen', 'pqc-sign', 'pqc-kem', 'cert-issuance', 'duckdb-analytics', 'sessions', 'threat-intel'],
  }));

  // ---- Live telemetry (counters + SSE stream) ----
  app.get('/api/stats', async () => telemetry.snapshot());

  app.get('/api/stream', (req, reply) => {
    reply.hijack();
    // hijack bypasses fastify-lifecycle CORS headers — reflect origin manually
    const origin = req.headers.origin;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    });
    reply.raw.write(`data: ${JSON.stringify(telemetry.snapshot())}\n\n`);
    const unsub = telemetry.subscribe(s => {
      if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(s)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(`: hb\n\n`);
    }, 15_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });

  // ---- PQC ----
  app.get<{ Querystring: { algorithm?: string } }>('/api/pqc/keys', async (req) => {
    const r = generateKeyPair(req.query.algorithm ?? 'ML-KEM-768');
    telemetry.bump('pqcOperations');
    return r;
  });

  app.post<{ Body: { algorithm?: string } }>('/api/pqc/keys', async (req) => {
    const r = generateKeyPair(req.body?.algorithm ?? 'ML-KEM-768');
    telemetry.bump('pqcOperations');
    return r;
  });

  app.post<{ Body: { message: string; algorithm?: string } }>('/api/pqc/sign', async (req) => {
    if (!req.body?.message) throw badRequest('message is required');
    const r = signMessage(req.body.message, req.body.algorithm ?? 'ML-DSA-65');
    telemetry.bump('pqcOperations');
    return r;
  });

  app.post<{ Body: { message: string; signatureB64: string; publicKeyB64: string; algorithm?: string } }>('/api/pqc/verify', async (req) => {
    const b = req.body ?? ({} as { message: string; signatureB64: string; publicKeyB64: string; algorithm?: string });
    if (!b.message || !b.signatureB64 || !b.publicKeyB64) {
      throw badRequest('message, signatureB64, publicKeyB64 required');
    }
    const r = verifyMessage(b.message, b.signatureB64, b.publicKeyB64, b.algorithm ?? 'ML-DSA-65');
    telemetry.bump('pqcOperations');
    return r;
  });

  app.post<{ Body: { publicKeyB64: string; algorithm?: string } }>('/api/pqc/capsule', async (req) => {
    if (!req.body?.publicKeyB64) throw badRequest('publicKeyB64 is required');
    const r = encapsulate(req.body.publicKeyB64, req.body.algorithm ?? 'ML-KEM-768');
    telemetry.bump('pqcOperations');
    return r;
  });

  app.post<{ Body: { publicKeyB64: string; secretKeyB64: string; cipherTextB64: string; algorithm?: string } }>('/api/pqc/decapsulate', async (req) => {
    const b = req.body ?? ({} as { publicKeyB64: string; secretKeyB64: string; cipherTextB64: string; algorithm?: string });
    if (!b.publicKeyB64 || !b.secretKeyB64 || !b.cipherTextB64) {
      throw badRequest('publicKeyB64, secretKeyB64, cipherTextB64 required');
    }
    const r = { sharedSecretB64: decapsulate(b.publicKeyB64, b.secretKeyB64, b.cipherTextB64, b.algorithm ?? 'ML-KEM-768') };
    telemetry.bump('pqcOperations');
    return r;
  });

  app.get('/api/pqc/algorithms', async () => listAlgorithms());

  // ---- Certificate issuance ----
  app.post<{ Body: CertificateSigningRequest }>('/api/certs', async (req) => {
    const b = req.body ?? ({} as CertificateSigningRequest);
    if (!b.subject) throw badRequest('subject is required');
    const r = issueCertificate({
      subject: b.subject,
      algorithm: b.algorithm ?? 'ML-DSA-65',
      validityDays: b.validityDays ?? 90,
      attributes: b.attributes,
    });
    telemetry.bump('pqcOperations');
    return r;
  });

  // ---- Sessions ----
  app.get('/api/sessions', async () => store.listSessions());

  app.post<{ Body: { name?: string } }>('/api/sessions', async (req) => {
    const r = await store.createSession(req.body?.name ?? 'Default');
    telemetry.bump('sessionsCreated');
    return r;
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req) => {
    const s = await store.getSession(req.params.id);
    if (!s) throw notFound('session not found');
    return s;
  });

  app.put<{ Params: { id: string }; Body: Partial<SessionSnapshot> }>('/api/sessions/:id', async (req) => {
    const existing = await store.getSession(req.params.id);
    if (!existing) throw notFound('session not found');
    const b = req.body ?? ({} as Partial<SessionSnapshot>);
    await store.saveSession({
      ...existing,
      graphJson: typeof b.graphJson === 'string' ? b.graphJson : existing.graphJson,
      meta: b.meta ?? existing.meta,
    });
    return { ok: true };
  });

  // ---- Graph sync ----
  app.post<{ Body: { sessionId: string; nodes?: any[]; edges?: any[] } }>('/api/graph/sync', async (req) => {
    const b = req.body ?? ({} as { sessionId: string; nodes?: any[]; edges?: any[] });
    if (!b.sessionId) throw badRequest('sessionId required');
    return store.upsertGraph(b.sessionId, { nodes: b.nodes ?? [], edges: b.edges ?? [] });
  });

  // ---- Events ----
  app.post<{ Body: { sessionId: string; type: string; source: string; severity?: number; payload?: unknown } }>('/api/events', async (req) => {
    const b = req.body ?? ({} as { sessionId: string; type: string; source: string; severity?: number; payload?: unknown });
    if (!b.sessionId || !b.type) throw badRequest('sessionId and type required');
    await store.pushEvent({ sessionId: b.sessionId, type: b.type, source: b.source ?? 'system', severity: b.severity ?? 0, payload: b.payload });
    telemetry.bump('eventsIngested');
    return { ok: true };
  });

  // ---- Query (DuckDB analytics) ----
  app.post<{ Body: { sql: string } }>('/api/query', async (req) => {
    const b = req.body ?? ({} as { sql: string });
    if (!b.sql || !/select|show|with|describe/i.test(b.sql)) {
      throw badRequest('only SELECT/SHOW/WITH/DESCRIBE queries allowed');
    }
    const safeSql = b.sql.replace(/;.*/s, '');
    const r = await store.runQuery('', safeSql);
    telemetry.bump('queriesExecuted');
    return r;
  });

  // ---- Threat intel ----
  app.get('/api/threats', async () => store.listThreats());

  app.post<{ Body: ThreatIntelRecord }>('/api/threats', async (req) => {
    const b = req.body ?? ({} as ThreatIntelRecord);
    if (!b.indicators || b.indicators.length === 0) throw badRequest('indicators required');
    return store.addThreat({
      ...b,
      id: b.id ?? `intel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: b.timestamp ?? Date.now(),
      verified: b.verified ?? false,
    });
  });

  // ---- Export session ----
  app.get<{ Params: { id: string } }>('/api/sessions/:id/export', async (req) => {
    return store.exportSession(req.params.id);
  });

  }