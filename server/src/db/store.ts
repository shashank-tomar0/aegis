// AEGIS Server Analytics Store — DuckDB on the server for real analytical queries
// Sessions, nodes, and events persist in DuckDB with a REST-facing query API

import { DuckDBInstance } from '@duckdb/node-api';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionSnapshot, ThreatIntelRecord } from '@aegis/shared/types.js';

export class AnalyticsStore {
  private dbPath: string;
  private instance: DuckDBInstance | null = null;
  private threats: ThreatIntelRecord[] = [];

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    await mkdir(this.dbPath, { recursive: true });
    this.instance = await DuckDBInstance.create(':memory:');
    const conn = await this.instance.connect();
    await conn.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR PRIMARY KEY,
        name VARCHAR,
        created_at BIGINT,
        updated_at BIGINT,
        graph_json TEXT,
        meta JSON
      )
    `);
    await conn.run(`
      CREATE TABLE IF NOT EXISTS nodes (
        id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        kind VARCHAR,
        label VARCHAR,
        metadata JSON,
        risk_score DOUBLE,
        severity INTEGER,
        created_at BIGINT
      )
    `);
    await conn.run(`
      CREATE TABLE IF NOT EXISTS edges (
        id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        source_id VARCHAR,
        target_id VARCHAR,
        kind VARCHAR,
        weight DOUBLE
      )
    `);
    await conn.run(`
      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR PRIMARY KEY,
        session_id VARCHAR,
        timestamp BIGINT,
        event_type VARCHAR,
        source_node VARCHAR,
        severity INTEGER,
        payload JSON
      )
    `);
    await conn.run(`CREATE INDEX IF NOT EXISTS idx_nodes_session ON nodes(session_id)`);
    await conn.run(`CREATE INDEX IF NOT EXISTS idx_edges_session ON edges(session_id)`);
    await conn.run(`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, timestamp)`);
    conn.closeSync();
  }

  private async getConn() {
    if (!this.instance) throw new Error('Store not initialized');
    return this.instance.connect();
  }

  // ---- Sessions ----
  async createSession(name = 'Default'): Promise<SessionSnapshot> {
    const conn = await this.getConn();
    const id = randomUUID();
    const now = Date.now();
    try {
      await conn.run(
        `INSERT INTO sessions (id, name, created_at, updated_at, graph_json, meta) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, now, now, '{}', '{}'],
      );
    } finally {
      conn.closeSync();
    }
    const s = await this.getSession(id);
    return s!;
  }

  async getSession(id: string): Promise<SessionSnapshot | null> {
    const conn = await this.getConn();
    try {
      const reader = await conn.runAndReadAll(`SELECT id, name, created_at, updated_at, graph_json, meta FROM sessions WHERE id = ?`, [id]);
      const row = reader.getRowObjects()[0];
      if (!row) return null;
      return {
        id: String(row.id),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        graphJson: String(row.graph_json ?? '{}'),
        nodeCount: 0,
        edgeCount: (await this.countEdges(id)),
        eventCount: await this.countEvents(id),
        meta: JSON.parse(String(row.meta ?? '{}')),
      };
    } finally {
      conn.closeSync();
    }
  }

  async listSessions(): Promise<SessionSnapshot[]> {
    const conn = await this.getConn();
    try {
      const reader = await conn.runAndReadAll(`SELECT id, name, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 100`);
      const rows = reader.getRowObjects();
      return rows.map(r => ({
        id: String(r.id),
        createdAt: Number(r.created_at),
        updatedAt: Number(r.updated_at),
        graphJson: '{}',
        nodeCount: 0,
        edgeCount: 0,
        eventCount: 0,
        meta: {},
      }));
    } finally {
      conn.closeSync();
    }
  }

  async saveSession(s: SessionSnapshot): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.run(
        `INSERT INTO sessions (id, name, created_at, updated_at, graph_json, meta)
         VALUES (?, 'Default', ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET graph_json = EXCLUDED.graph_json, updated_at = EXCLUDED.updated_at`,
        [s.id, s.createdAt, Date.now(), s.graphJson, JSON.stringify(s.meta ?? {})],
      );
    } finally {
      conn.closeSync();
    }
  }

  private async countEvents(sessionId: string): Promise<number> {
    const conn = await this.getConn();
    try {
      const reader = await conn.runAndReadAll(`SELECT COUNT(*) as c FROM events WHERE session_id = ?`, [sessionId]);
      return Number(reader.getRowObjects()[0].c);
    } finally {
      conn.closeSync();
    }
  }

  private async countEdges(sessionId: string): Promise<number> {
    const conn = await this.getConn();
    try {
      const reader = await conn.runAndReadAll(`SELECT COUNT(*) as c FROM edges WHERE session_id = ?`, [sessionId]);
      return Number(reader.getRowObjects()[0].c);
    } finally {
      conn.closeSync();
    }
  }

  // ---- Nodes / Edges (append from client graph sync) ----
  async upsertGraph(sessionId: string, graph: { nodes: any[]; edges: any[] }): Promise<{ nodes: number; edges: number }> {
    const conn = await this.getConn();
    try {
      for (const n of graph.nodes ?? []) {
        await conn.run(
          `INSERT INTO nodes (id, session_id, kind, label, metadata, risk_score, severity, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, risk_score = EXCLUDED.risk_score, severity = EXCLUDED.severity`,
          [String(n.id), sessionId, String(n.kind), String(n.label), JSON.stringify(n.metadata ?? {}), Number(n.riskScore ?? 0), Number(n.severity ?? 0), Date.now()],
        );
      }
      for (const e of graph.edges ?? []) {
        await conn.run(
          `INSERT INTO edges (id, session_id, source_id, target_id, kind, weight)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO NOTHING`,
          [String(e.id), sessionId, String(e.source), String(e.target), String(e.kind), Number(e.weight ?? 1)],
        );
      }
      return { nodes: (graph.nodes ?? []).length, edges: (graph.edges ?? []).length };
    } finally {
      conn.closeSync();
    }
  }

  // ---- Events ----
  async pushEvent(evt: { sessionId: string; type: string; source: string; severity: number; payload: unknown }): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.run(
        `INSERT INTO events (id, session_id, timestamp, event_type, source_node, severity, payload) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), evt.sessionId, Date.now(), evt.type, evt.source, evt.severity, JSON.stringify(evt.payload ?? {})],
      );
    } finally {
      conn.closeSync();
    }
  }

  // ---- Query ----
  async runQuery(_sessionId: string, sql: string): Promise<{ columns: string[]; rows: unknown[][]; executionTimeMs: number; rowCount: number }> {
    const conn = await this.getConn();
    const start = performance.now();
    try {
      const reader = await conn.runAndReadAll(sql);
      const rows = reader.getRowObjects();
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const safe = (v: unknown): unknown => {
        if (typeof v === 'bigint') return Number(v);
        if (v instanceof Uint8Array) return Buffer.from(v).toString('hex');
        if (typeof v === 'object' && v !== null) {
          // Deep-copy to replace nested bigints (e.g. structs)
          try {
            return JSON.parse(JSON.stringify(v, (_key, val) =>
              typeof val === 'bigint' ? Number(val) : val,
            ));
          } catch { return String(v); }
        }
        return v;
      };
      return {
        columns,
        rows: rows.map(r => columns.map(c => safe((r as Record<string, unknown>)[c]))),
        executionTimeMs: performance.now() - start,
        rowCount: rows.length,
      };
    } finally {
      conn.closeSync();
    }
  }

  // ---- Threats ----
  addThreat(intel: ThreatIntelRecord): ThreatIntelRecord {
    this.threats.unshift(intel);
    this.threats = this.threats.slice(0, 200);
    return intel;
  }

  listThreats(): ThreatIntelRecord[] {
    return this.threats;
  }

  // ---- Export / persistence ----
  async exportSession(id: string): Promise<{ nodes: any[]; edges: any[]; events: any[] }> {
    const conn = await this.getConn();
    try {
      const nodes = (await conn.runAndReadAll(`SELECT * FROM nodes WHERE session_id = ?`, [id])).getRowObjects();
      const edges = (await conn.runAndReadAll(`SELECT * FROM edges WHERE session_id = ?`, [id])).getRowObjects();
      const events = (await conn.runAndReadAll(`SELECT * FROM events WHERE session_id = ?`, [id])).getRowObjects();
      return { nodes, edges, events };
    } finally {
      conn.closeSync();
    }
  }

  async shutdown(): Promise<void> {
    if (this.instance) {
      try { this.instance.closeSync(); } catch { /* ignore */ }
      this.instance = null;
    }
  }
}

export function createAnalyticsStore(dbDir = join(process.cwd(), 'data')): AnalyticsStore {
  return new AnalyticsStore(dbDir);
}