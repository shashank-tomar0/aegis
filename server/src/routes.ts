// AEGIS API Routes — REST endpoints for PQC, sessions, analytics, threats

import type { FastifyInstance } from 'fastify';
import type { AnalyticsStore } from './db/store.js';
import type { UserStore } from './db/users.js';
import { verifyPassword } from './db/users.js';
import { setSessionCookie, clearSessionCookie, getUser, requireUser } from './auth.js';
import {
  generateKeyPair, signMessage, verifyMessage, encapsulate, decapsulate, issueCertificate, listAlgorithms,
} from './services/pqc.js';
import * as telemetry from './services/telemetry.js';
import { getCollector, COLLECTORS } from './collectors/index.js';
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

export function registerRoutes(app: FastifyInstance, store: AnalyticsStore, users: UserStore): void {
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
  app.get('/api/sessions', async (req) => {
    requireUser(users, req);
    return store.listSessions();
  });

  app.post<{ Body: { name?: string } }>('/api/sessions', async (req) => {
    requireUser(users, req);
    const r = await store.createSession(req.body?.name ?? 'Default');
    telemetry.bump('sessionsCreated');
    return r;
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req) => {
    requireUser(users, req);
    const s = await store.getSession(req.params.id);
    if (!s) throw notFound('session not found');
    return s;
  });

  app.put<{ Params: { id: string }; Body: Partial<SessionSnapshot> }>('/api/sessions/:id', async (req) => {
    requireUser(users, req);
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
    requireUser(users, req);
    const b = req.body ?? ({} as { sessionId: string; nodes?: any[]; edges?: any[] });
    if (!b.sessionId) throw badRequest('sessionId required');
    return store.upsertGraph(b.sessionId, { nodes: b.nodes ?? [], edges: b.edges ?? [] });
  });

  // ---- Events ----
  app.post<{ Body: { sessionId: string; type: string; source: string; severity?: number; payload?: unknown } }>('/api/events', async (req) => {
    requireUser(users, req);
    const b = req.body ?? ({} as { sessionId: string; type: string; source: string; severity?: number; payload?: unknown });
    if (!b.sessionId || !b.type) throw badRequest('sessionId and type required');
    await store.pushEvent({ sessionId: b.sessionId, type: b.type, source: b.source ?? 'system', severity: b.severity ?? 0, payload: b.payload });
    telemetry.bump('eventsIngested');
    return { ok: true };
  });

  // ---- Query (DuckDB analytics) ----
  app.post<{ Body: { sql: string } }>('/api/query', async (req) => {
    requireUser(users, req);
    const b = req.body ?? ({} as { sql: string });
    if (!b.sql || !/select|show|with|describe/i.test(b.sql)) {
      throw badRequest('only SELECT/SHOW/WITH/DESCRIBE queries allowed');
    }
    const safeSql = b.sql.replace(/;.*/s, '');
    const r = await store.runQuery('', safeSql);
    telemetry.bump('queriesExecuted');
    return r;
  });


  // ---- Public demo endpoint: fixed DuckDB query for the landing page ----
  app.get('/api/demo/duckdb-version', async () => {
    const r = await store.runQuery('', 'SELECT version() AS duckdb_version');
    return { version: String(r.rows[0]?.[0] ?? ''), executionTimeMs: r.executionTimeMs };
  });

  // ---- Threat intel ----
  app.get('/api/threats', async (req) => {
    requireUser(users, req);
    return store.listThreats();
  });

  app.post<{ Body: ThreatIntelRecord }>('/api/threats', async (req) => {
    requireUser(users, req);
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
    requireUser(users, req);
    return store.exportSession(req.params.id);
  });

  // ---- Auth (accounts, sessions, API keys) ----
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  app.post<{ Body: { email?: string; password?: string } }>('/api/auth/register', async (req, reply) => {
    const b = req.body ?? ({} as { email?: string; password?: string });
    if (!b.email || !emailRe.test(b.email)) throw badRequest('valid email required');
    if (!b.password || b.password.length < 8) throw badRequest('password must be at least 8 characters');
    if (users.getUserByEmail(b.email)) throw badRequest('account already exists — try logging in');
    const user = users.createUser(b.email, b.password);
    const token = users.createSession(user.id);
    setSessionCookie(reply, token);
    telemetry.bump('usersCreated');
    return { user: { id: user.id, email: user.email }, token };
  });

  app.post<{ Body: { email?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
    const b = req.body ?? ({} as { email?: string; password?: string });
    if (!b.email || !b.password) throw badRequest('email and password required');
    const user = users.getUserByEmail(b.email);
    if (!user || !verifyPassword(b.password, user.passHash)) {
      const err = new Error('invalid credentials') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }
    const token = users.createSession(user.id);
    setSessionCookie(reply, token);
    return { user: { id: user.id, email: user.email }, token };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const cookie = req.headers.cookie;
    if (cookie) {
      const m = cookie.split(';').map(s => s.trim()).find(s => s.startsWith('aegis_token='));
      if (m) users.deleteSession(m.slice('aegis_token='.length));
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    const user = getUser(users, req);
    return user ? { user: { id: user.id, email: user.email } } : { user: null };
  });

  // ---- Projects (workspaces, each backed by a DuckDB session) ----
  const publicProject = async (p: NonNullable<ReturnType<UserStore['getProject']>>) => {
    const counts = await store.graphCounts(p.sessionId);
    return {
      id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt,
      counts, meta: JSON.parse(p.meta ?? '{}'),
    };
  };

  app.get('/api/projects', async (req) => {
    const user = requireUser(users, req);
    const rows = users.listProjects(user.id);
    return Promise.all(rows.map(publicProject));
  });

  app.post<{ Body: { name?: string } }>('/api/projects', async (req) => {
    const user = requireUser(users, req);
    const name = (req.body?.name ?? 'Untitled project').slice(0, 80) || 'Untitled project';
    const session = await store.createSession(`project:${name}`);
    const project = users.createProject(user.id, name, session.id);
    telemetry.bump('sessionsCreated');
    return publicProject(project);
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const user = requireUser(users, req);
    const p = users.getProject(user.id, req.params.id);
    if (!p) throw notFound('project not found');
    return publicProject(p);
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/graph', async (req) => {
    const user = requireUser(users, req);
    const p = users.getProject(user.id, req.params.id);
    if (!p) throw notFound('project not found');
    const { nodes, edges } = await store.exportSession(p.sessionId);
    return { projectId: p.id, nodes, edges };
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req) => {
    const user = requireUser(users, req);
    const p = users.getProject(user.id, req.params.id);
    if (!p) throw notFound('project not found');
    users.deleteProject(user.id, p.id);
    return { ok: true };
  });

  // ---- API keys ----
  app.get('/api/api-keys', async (req) => {
    const user = requireUser(users, req);
    return users.listApiKeys(user.id).map(k => ({
      id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt,
      lastUsed: k.lastUsed, revoked: k.revoked === 1,
    }));
  });

  app.post<{ Body: { name?: string } }>('/api/api-keys', async (req) => {
    const user = requireUser(users, req);
    const name = (req.body?.name ?? 'default').slice(0, 60) || 'default';
    const { key, prefix, id } = users.createApiKey(user.id, name);
    return { id, name, prefix, key, createdAt: Date.now(), revoked: false };
  });

  app.post<{ Params: { id: string } }>('/api/api-keys/:id/revoke', async (req) => {
    const user = requireUser(users, req);
    const ok = users.revokeApiKey(user.id, req.params.id);
    if (!ok) throw notFound('key not found');
    return { ok: true };
  });

  // ---- Collectors (real-world discovery) ----
  const running = new Set<string>();

  app.get('/api/collectors', async (req) => {
    const user = requireUser(users, req);
    return COLLECTORS.map(c => {
      const probe = c.probe();
      const last = users.latestRun(user.id, c.name);
      return {
        name: c.name,
        description: c.description,
        simulated: c.simulated,
        available: probe.available,
        note: probe.note,
        running: running.has(c.name),
        lastRun: last
          ? { at: last.ranAt, found: last.found, error: last.error, simulated: last.simulated === 1, ms: last.ms }
          : null,
      };
    });
  });

  app.post<{ Body: { collector?: string; projectId?: string } }>('/api/collectors/run', async (req) => {
    const user = requireUser(users, req);
    const b = req.body ?? ({} as { collector?: string; projectId?: string });
    if (!b.collector || !b.projectId) throw badRequest('collector and projectId required');
    const def = getCollector(b.collector);
    if (!def) throw badRequest(`unknown collector: ${b.collector}`);
    const project = users.getProject(user.id, b.projectId);
    if (!project) throw notFound('project not found');
    if (running.has(def.name)) throw badRequest(`collector '${def.name}' is already running`);

    running.add(def.name);
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
    } finally {
      running.delete(def.name);
    }
    const ms = Date.now() - started;

    users.recordRun({
      userId: user.id,
      collector: def.name,
      found: result.nodes.length + result.edges.length,
      simulated: result.simulated,
      error: result.available ? null : (result.note ?? 'unavailable'),
      ms,
    });

    let upsert: { nodes: number; edges: number } | null = null;
    if (result.available) {
      upsert = await store.upsertGraph(project.sessionId, { nodes: result.nodes, edges: result.edges });
      users.touchProject(user.id, project.id);
      telemetry.bump('eventsIngested', result.nodes.length + result.edges.length);
    }

    return {
      collector: def.name,
      simulated: result.simulated,
      available: result.available,
      note: result.note,
      found: result.nodes.length + result.edges.length,
      upserted: upsert ?? null,
      ms,
      counts: await store.graphCounts(project.sessionId),
      log: result.log,
    };
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id/graph', async (req) => {
    const user = requireUser(users, req);
    const p = users.getProject(user.id, req.params.id);
    if (!p) throw notFound('project not found');
    await store.clearGraph(p.sessionId);
    return { ok: true };
  });
}