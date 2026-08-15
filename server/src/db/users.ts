// AEGIS User & Workspace Store — accounts, sessions, API keys, projects
// Zero-dependency: node:sqlite (built-in since Node 23.4) + node:crypto

import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface UserRow { id: string; email: string; passHash: string; createdAt: number; }
export interface ApiKeyRow {
  id: string; userId: string; name: string; keyHash: string; prefix: string;
  createdAt: number; lastUsed: number | null; revoked: number;
}
export interface ProjectRow {
  id: string; ownerId: string; name: string; sessionId: string;
  createdAt: number; updatedAt: number; meta: string;
}
export interface SessionRow { tokenHash: string; userId: string; createdAt: number; expiresAt: number; }
export interface CollectorRunRow {
  id: string; userId: string; collector: string; ranAt: number; found: number;
  simulated: number; error: string | null; ms: number;
}

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString('hex');
  return safeEqual(candidate, hash);
}

export class UserStore {
  private db: DatabaseSync;

  constructor(dbPath = join(process.cwd(), 'data', 'aegis.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        pass_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used INTEGER,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_keys_user ON api_keys(user_id);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        session_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        meta TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
      CREATE TABLE IF NOT EXISTS collector_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        collector TEXT NOT NULL,
        ran_at INTEGER NOT NULL,
        found INTEGER NOT NULL DEFAULT 0,
        simulated INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_runs_user ON collector_runs(user_id, ran_at);
    `);
  }

  close(): void { this.db.close(); }

  // ---- Users ----
  createUser(email: string, password: string): UserRow {
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO users (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)`,
    ).run(id, email.toLowerCase(), hashPassword(password), Date.now());
    return this.getUserById(id)!;
  }

  getUserByEmail(email: string): UserRow | null {
    const row = this.db.prepare(`SELECT id, email, pass_hash, created_at FROM users WHERE email = ?`).get(email.toLowerCase()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), email: String(row.email), passHash: String(row.pass_hash), createdAt: Number(row.created_at) };
  }

  getUserById(id: string): UserRow | null {
    const row = this.db.prepare(`SELECT id, email, pass_hash, created_at FROM users WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { id: String(row.id), email: String(row.email), passHash: String(row.pass_hash), createdAt: Number(row.created_at) };
  }

  // ---- Sessions (cookie/bearer token) ----
  createSession(userId: string): string {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    this.db.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .run(sha256(token), userId, now, now + SESSION_TTL_MS);
    return token;
  }

  getUserBySessionToken(token: string): UserRow | null {
    const row = this.db.prepare(
      `SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token_hash = ?`,
    ).get(sha256(token)) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (Number(row.expires_at) < Date.now()) {
      this.deleteSession(token);
      return null;
    }
    return this.getUserById(String(row.user_id));
  }

  deleteSession(token: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(token));
  }

  // ---- API keys ----
  createApiKey(userId: string, name: string): { key: string; prefix: string; id: string } {
    const id = randomUUID();
    const key = `aeg_${randomBytes(24).toString('hex')}`;
    const prefix = key.slice(0, 12);
    this.db.prepare(
      `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, created_at, last_used, revoked) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(id, userId, name, sha256(key), prefix, Date.now(), null);
    return { key, prefix, id };
  }

  listApiKeys(userId: string): ApiKeyRow[] {
    const rows = this.db.prepare(
      `SELECT id, user_id, name, key_hash, prefix, created_at, last_used, revoked FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    ).all(userId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.id), userId: String(r.user_id), name: String(r.name),
      keyHash: String(r.key_hash), prefix: String(r.prefix), createdAt: Number(r.created_at),
      lastUsed: r.last_used == null ? null : Number(r.last_used), revoked: Number(r.revoked),
    }));
  }

  revokeApiKey(userId: string, keyId: string): boolean {
    const res = this.db.prepare(`UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?`).run(keyId, userId);
    return res.changes > 0;
  }

  getUserByApiKey(rawKey: string): UserRow | null {
    if (!rawKey.startsWith('aeg_')) return null;
    const hash = sha256(rawKey);
    const row = this.db.prepare(`SELECT user_id, revoked FROM api_keys WHERE key_hash = ?`).get(hash) as Record<string, unknown> | undefined;
    if (!row || Number(row.revoked) === 1) return null;
    this.db.prepare(`UPDATE api_keys SET last_used = ? WHERE key_hash = ?`).run(Date.now(), hash);
    return this.getUserById(String(row.user_id));
  }

  // ---- Projects ----
  createProject(ownerId: string, name: string, sessionId: string): ProjectRow {
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO projects (id, owner_id, name, session_id, created_at, updated_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, ownerId, name, sessionId, now, now, '{}');
    return this.getProject(ownerId, id)!;
  }

  getProject(ownerId: string, projectId: string): ProjectRow | null {
    const row = this.db.prepare(
      `SELECT id, owner_id, name, session_id, created_at, updated_at, meta FROM projects WHERE id = ? AND owner_id = ?`,
    ).get(projectId, ownerId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id), ownerId: String(row.owner_id), name: String(row.name),
      sessionId: String(row.session_id), createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at), meta: String(row.meta ?? '{}'),
    };
  }

  getProjectBySession(ownerId: string, sessionId: string): ProjectRow | null {
    const row = this.db.prepare(
      `SELECT id, owner_id, name, session_id, created_at, updated_at, meta FROM projects WHERE session_id = ? AND owner_id = ?`,
    ).get(sessionId, ownerId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id), ownerId: String(row.owner_id), name: String(row.name),
      sessionId: String(row.session_id), createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at), meta: String(row.meta ?? '{}'),
    };
  }

  listProjects(ownerId: string): ProjectRow[] {
    const rows = this.db.prepare(
      `SELECT id, owner_id, name, session_id, created_at, updated_at, meta FROM projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50`,
    ).all(ownerId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: String(r.id), ownerId: String(r.owner_id), name: String(r.name),
      sessionId: String(r.session_id), createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at), meta: String(r.meta ?? '{}'),
    }));
  }

  touchProject(ownerId: string, projectId: string): void {
    this.db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ? AND owner_id = ?`).run(Date.now(), projectId, ownerId);
  }

  deleteProject(ownerId: string, projectId: string): boolean {
    const res = this.db.prepare(`DELETE FROM projects WHERE id = ? AND owner_id = ?`).run(projectId, ownerId);
    return res.changes > 0;
  }

  // ---- Collector runs ----
  recordRun(run: { userId: string; collector: string; found: number; simulated: boolean; error: string | null; ms: number }): void {
    this.db.prepare(
      `INSERT INTO collector_runs (id, user_id, collector, ran_at, found, simulated, error, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), run.userId, run.collector, Date.now(), run.found, run.simulated ? 1 : 0, run.error, run.ms);
  }

  listRuns(userId: string, collector?: string, limit = 20): CollectorRunRow[] {
    const rows = collector
      ? this.db.prepare(
          `SELECT id, user_id, collector, ran_at, found, simulated, error, ms FROM collector_runs WHERE user_id = ? AND collector = ? ORDER BY ran_at DESC LIMIT ?`,
        ).all(userId, collector, limit)
      : this.db.prepare(
          `SELECT id, user_id, collector, ran_at, found, simulated, error, ms FROM collector_runs WHERE user_id = ? ORDER BY ran_at DESC LIMIT ?`,
        ).all(userId, limit);
    return (rows as Record<string, unknown>[]).map(r => ({
      id: String(r.id), userId: String(r.user_id), collector: String(r.collector),
      ranAt: Number(r.ran_at), found: Number(r.found), simulated: Number(r.simulated),
      error: r.error == null ? null : String(r.error), ms: Number(r.ms),
    }));
  }

  latestRun(userId: string, collector: string): CollectorRunRow | null {
    const rows = this.listRuns(userId, collector, 1);
    return rows[0] ?? null;
  }
}