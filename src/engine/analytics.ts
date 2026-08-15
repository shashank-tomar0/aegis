// AEGIS Analytics Engine - Real DuckDB-WASM integration
// Zero-slop analytical queries over attack surface data

import type { GraphNode, GraphEdge, AnalyticsQuery } from '../types';
import * as duckdb from '@duckdb/duckdb-wasm';
import { tableToIPC } from 'apache-arrow';
// Same-origin DuckDB-WASM bundle — no CDN worker URLs, so the analytics
// worker works on plain http(s) deploys (CDN workers are blocked as
// cross-origin in many contexts).
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

export interface AnalyticsEvent {
  timestamp: number;
  eventType: string;
  sourceNode: string;
  targetNode?: string;
  severity: number;
  riskScore: number;
  metadata: Record<string, unknown>;
}

export class AnalyticsEngine {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private eventBuffer: AnalyticsEvent[] = [];
  private flushInterval: number = 1000;
  private maxBufferSize: number = 1000;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Local, same-origin bundle (single-threaded MVP flavour)
      const worker = new Worker(mvpWorker);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(mvpWasm, undefined as never);

      // Create connection
      this.conn = await this.db.connect();

      // Create schema
      await this.createSchema();

      this.initialized = true;
      console.log('[Analytics] DuckDB initialized successfully');

      // Start periodic flush
      setInterval(() => this.flushBuffer(), this.flushInterval);
    } catch (error) {
      console.error('[Analytics] Failed to initialize DuckDB:', error);
      throw error;
    }
  }

  private async createSchema(): Promise<void> {
    if (!this.conn) throw new Error('No connection');

    // Nodes table
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS nodes (
        id VARCHAR PRIMARY KEY,
        kind VARCHAR NOT NULL,
        label VARCHAR NOT NULL,
        metadata JSON,
        pos_x DOUBLE,
        pos_y DOUBLE,
        risk_score DOUBLE DEFAULT 0,
        severity INTEGER DEFAULT 0,
        is_compromised BOOLEAN DEFAULT FALSE,
        is_quarantined BOOLEAN DEFAULT FALSE,
        blast_radius INTEGER DEFAULT 0,
        centrality DOUBLE DEFAULT 0,
        crypto_algorithm VARCHAR,
        crypto_key_size INTEGER,
        crypto_quantum_resistance INTEGER,
        crypto_nist_level INTEGER,
        crypto_migration_target VARCHAR,
        crypto_migration_priority INTEGER,
        crypto_last_rotated BIGINT,
        crypto_expires_at BIGINT,
        crypto_issuer VARCHAR,
        crypto_subject VARCHAR,
        crypto_fingerprint VARCHAR,
        created_at BIGINT,
        updated_at BIGINT
      )
    `);

    // Edges table
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS edges (
        id VARCHAR PRIMARY KEY,
        source_id VARCHAR NOT NULL,
        target_id VARCHAR NOT NULL,
        kind VARCHAR NOT NULL,
        weight DOUBLE DEFAULT 1,
        metadata JSON,
        is_active BOOLEAN DEFAULT TRUE,
        risk_contribution DOUBLE DEFAULT 0,
        created_at BIGINT,
        updated_at BIGINT,
        FOREIGN KEY (source_id) REFERENCES nodes(id),
        FOREIGN KEY (target_id) REFERENCES nodes(id)
      )
    `);

    // Events table (append-only, time-series)
    await this.conn.query(`
      CREATE TABLE IF NOT EXISTS events (
        id VARCHAR PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        event_type VARCHAR NOT NULL,
        source_node VARCHAR NOT NULL,
        target_node VARCHAR,
        severity INTEGER DEFAULT 0,
        risk_score DOUBLE DEFAULT 0,
        payload JSON,
        metadata JSON
      )
    `);

    // Create indexes for performance
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_nodes_risk ON nodes(risk_score DESC)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`);
    await this.conn.query(`CREATE INDEX IF NOT EXISTS idx_events_source ON events(source_node)`);
  }

  // Sync graph state to DuckDB (incremental)
  async syncGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<void> {
    if (!this.conn) await this.initialize();

    // Upsert nodes
    for (const node of nodes) {
      await this.upsertNode(node);
    }

    // Upsert edges
    for (const edge of edges) {
      await this.upsertEdge(edge);
    }
  }

  private async upsertNode(node: GraphNode): Promise<void> {
    if (!this.conn) return;

    const crypto = node.cryptoProfile;
    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    await this.conn.query(`
      INSERT INTO nodes VALUES (
        ${esc(node.id)}, ${esc(node.kind)}, ${esc(node.label)}, ${esc(JSON.stringify(node.metadata))},
        ${esc(node.position.x)}, ${esc(node.position.y)},
        ${esc(node.riskScore)}, ${esc(node.severity)},
        ${esc(node.isCompromised)}, ${esc(node.isQuarantined)},
        ${esc(node.blastRadius)}, ${esc(node.centrality)},
        ${esc(crypto?.algorithm ?? null)}, ${esc(crypto?.keySize ?? null)},
        ${esc(crypto?.quantumResistance ?? null)}, ${esc(crypto?.nistLevel ?? null)},
        ${esc(crypto?.migrationTarget ?? null)}, ${esc(crypto?.migrationPriority ?? null)},
        ${esc(crypto?.lastRotated ?? null)}, ${esc(crypto?.expiresAt ?? null)},
        ${esc(crypto?.issuer ?? null)}, ${esc(crypto?.subject ?? null)},
        ${esc(crypto?.fingerprint ?? null)}, ${esc(node.updatedAt)}
      )
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind, label = EXCLUDED.label, metadata = EXCLUDED.metadata,
        pos_x = EXCLUDED.pos_x, pos_y = EXCLUDED.pos_y,
        risk_score = EXCLUDED.risk_score, severity = EXCLUDED.severity,
        is_compromised = EXCLUDED.is_compromised, is_quarantined = EXCLUDED.is_quarantined,
        blast_radius = EXCLUDED.blast_radius, centrality = EXCLUDED.centrality,
        crypto_algorithm = EXCLUDED.crypto_algorithm, crypto_key_size = EXCLUDED.crypto_key_size,
        crypto_quantum_resistance = EXCLUDED.crypto_quantum_resistance, crypto_nist_level = EXCLUDED.crypto_nist_level,
        crypto_migration_target = EXCLUDED.crypto_migration_target, crypto_migration_priority = EXCLUDED.crypto_migration_priority,
        crypto_last_rotated = EXCLUDED.crypto_last_rotated, crypto_expires_at = EXCLUDED.crypto_expires_at,
        crypto_issuer = EXCLUDED.crypto_issuer, crypto_subject = EXCLUDED.crypto_subject,
        crypto_fingerprint = EXCLUDED.crypto_fingerprint, updated_at = EXCLUDED.updated_at
    `);
  }

  private async upsertEdge(edge: GraphEdge): Promise<void> {
    if (!this.conn) return;

    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    await this.conn.query(`
      INSERT INTO edges VALUES (
        ${esc(edge.id)}, ${esc(edge.source)}, ${esc(edge.target)}, ${esc(edge.kind)},
        ${esc(edge.weight)}, ${esc(JSON.stringify(edge.metadata))},
        ${esc(edge.isActive)}, ${esc(edge.riskContribution)}, ${esc(edge.updatedAt)}
      )
      ON CONFLICT (id) DO UPDATE SET
        source_id = EXCLUDED.source_id, target_id = EXCLUDED.target_id,
        kind = EXCLUDED.kind, weight = EXCLUDED.weight, metadata = EXCLUDED.metadata,
        is_active = EXCLUDED.is_active, risk_contribution = EXCLUDED.risk_contribution,
        updated_at = EXCLUDED.updated_at
    `);
  }

  // Record event (buffered for performance)
  recordEvent(event: AnalyticsEvent): void {
    this.eventBuffer.push(event);

    if (this.eventBuffer.length >= this.maxBufferSize) {
      this.flushBuffer();
    }
  }

  async flushBuffer(): Promise<void> {
    if (!this.conn || this.eventBuffer.length === 0) return;

    const events = this.eventBuffer.splice(0, this.eventBuffer.length);

    for (const e of events) {
      const eventId = `evt_${e.timestamp}_${Math.random().toString(36).slice(2, 10)}`;
      await this.conn.query(
        `INSERT INTO events VALUES ('${eventId}', ${e.timestamp}, '${e.eventType}', '${e.sourceNode}', ` +
        `${e.targetNode ? `'${e.targetNode}'` : 'NULL'}, ${e.severity}, ${e.riskScore}, ` +
        `'${JSON.stringify(e.metadata).replace(/'/g, "''")}')`
      );
    }
  }

  // Execute arbitrary analytical query
  async query(sql: string, params: unknown[] = []): Promise<AnalyticsQuery> {
    if (!this.conn) await this.initialize();
    if (!this.conn) throw new Error('Database not initialized');

    const start = performance.now();
    // Substitute parameters safely for testing; production should use prepared statements
    let finalSql = sql;
    if (params.length > 0) {
      let idx = 0;
      finalSql = sql.replace(/\?/g, () => {
        const p = params[idx++];
        if (typeof p === 'string') return `'${p.replace(/'/g, "''")}'`;
        if (typeof p === 'number') return String(p);
        if (p === null || p === undefined) return 'NULL';
        if (typeof p === 'boolean') return p ? 'TRUE' : 'FALSE';
        return `'${String(p).replace(/'/g, "''")}'`;
      });
    }
    const result = await this.conn.query(finalSql);
    const executionTimeMs = performance.now() - start;

    const columns = result.schema.fields.map((f: any) => f.name);
    const rows: unknown[][] = [];
    const numRows = result.numRows;

    for (let i = 0; i < numRows; i++) {
      const row: unknown[] = [];
      for (const col of columns) {
        try {
          row.push((result.getChild(col) as any)?.get(i));
        } catch {
          row.push(null);
        }
      }
      rows.push(row);
    }

    return {
      sql,
      params,
      resultColumns: columns,
      resultRows: rows,
      executionTimeMs,
      rowCount: numRows,
    };
  }

  // Pre-built analytical queries
  async getTopRiskNodes(limit: number = 20): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT id, label, kind, risk_score, severity, is_compromised, blast_radius, centrality
      FROM nodes
      ORDER BY risk_score DESC, blast_radius DESC
      LIMIT ?
    `, [limit]);
  }

  async getCryptoInventory(): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT
        crypto_algorithm as algorithm,
        COUNT(*) as count,
        AVG(crypto_key_size) as avg_key_size,
        MAX(crypto_quantum_resistance) as max_qr,
        SUM(CASE WHEN crypto_migration_target IS NOT NULL THEN 1 ELSE 0 END) as pending_migrations,
        AVG(crypto_migration_priority) as avg_migration_priority
      FROM nodes
      WHERE crypto_algorithm IS NOT NULL
      GROUP BY crypto_algorithm
      ORDER BY count DESC
    `);
  }

  async getCryptoMigrationPlan(): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT
        id, label, kind,
        crypto_algorithm as current_algorithm,
        crypto_migration_target as target_algorithm,
        crypto_migration_priority as priority,
        crypto_expires_at as expires_at,
        (crypto_expires_at - ?) / 86400000 as days_until_expiry
      FROM nodes
      WHERE crypto_migration_target IS NOT NULL
      ORDER BY crypto_migration_priority DESC, crypto_expires_at ASC
    `, [Date.now()]);
  }

  async getBlastRadiusSummary(): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT
        n.id, n.label, n.kind, n.risk_score, n.blast_radius,
        COUNT(e.id) as out_degree,
        SUM(e.weight) as total_weight
      FROM nodes n
      LEFT JOIN edges e ON n.id = e.source_id AND e.is_active = TRUE
      WHERE n.blast_radius > 0
      GROUP BY n.id
      ORDER BY n.blast_radius DESC
      LIMIT 50
    `);
  }

  async getAttackPaths(sourceKind: string = 'agent'): Promise<AnalyticsQuery> {
    return this.query(`
      WITH RECURSIVE paths AS (
        SELECT
          n.id as source_id,
          n.label as source_label,
          n.kind as source_kind,
          e.target_id as current_id,
          1 as depth,
          e.weight as path_risk,
          n.id || ' -> ' || e.target_id as path
        FROM nodes n
        JOIN edges e ON n.id = e.source_id AND e.is_active = TRUE
        WHERE n.kind = ?
        AND e.weight > 0.5

        UNION ALL

        SELECT
          p.source_id,
          p.source_label,
          p.source_kind,
          e.target_id,
          p.depth + 1,
          p.path_risk * e.weight * 0.7,
          p.path || ' -> ' || e.target_id
        FROM paths p
        JOIN edges e ON p.current_id = e.source_id AND e.is_active = TRUE
        WHERE p.depth < 6
        AND p.path_risk * e.weight * 0.7 > 0.1
      )
      SELECT DISTINCT
        source_id, source_label, source_kind,
        current_id as target_id,
        depth,
        path_risk,
        path
      FROM paths
      ORDER BY path_risk DESC
      LIMIT 100
    `, [sourceKind]);
  }

  async getEventTimeline(hours: number = 24): Promise<AnalyticsQuery> {
    const since = Date.now() - hours * 3600000;
    return this.query(`
      SELECT
        timestamp,
        event_type,
        source_node,
        target_node,
        severity,
        risk_score
      FROM events
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 500
    `, [since]);
  }

  async getSeverityDistribution(): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT
        severity,
        COUNT(*) as count,
        AVG(risk_score) as avg_risk
      FROM nodes
      GROUP BY severity
      ORDER BY severity
    `);
  }

  async getNodeKindDistribution(): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT
        kind,
        COUNT(*) as count,
        AVG(risk_score) as avg_risk,
        SUM(CASE WHEN is_compromised THEN 1 ELSE 0 END) as compromised,
        SUM(CASE WHEN is_quarantined THEN 1 ELSE 0 END) as quarantined
      FROM nodes
      GROUP BY kind
    `);
  }

  async getEdgeKindDistribution(): Promise<AnalyticsQuery> {
    return this.query(`
      SELECT
        kind,
        COUNT(*) as count,
        AVG(weight) as avg_weight,
        SUM(weight) as total_weight
      FROM edges
      WHERE is_active = TRUE
      GROUP BY kind
    `);
  }

  async getCentralityOutliers(stdDevThreshold: number = 2): Promise<AnalyticsQuery> {
    return this.query(`
      WITH stats AS (
        SELECT AVG(centrality) as mean, STDDEV(centrality) as stddev FROM nodes
      )
      SELECT n.id, n.label, n.kind, n.centrality, n.risk_score,
             (n.centrality - s.mean) / s.stddev as z_score
      FROM nodes n, stats s
      WHERE n.centrality > s.mean + ? * s.stddev
      ORDER BY n.centrality DESC
    `, [stdDevThreshold]);
  }

  // Export data for external analysis
  async exportToArrow(): Promise<Uint8Array> {
    if (!this.conn) await this.initialize();
    if (!this.conn) throw new Error('Database not initialized');

    const result = await this.conn.query(`SELECT * FROM nodes`);
    // Serialize Arrow table as IPC buffer
    return tableToIPC(result);
  }

  async exportToParquet(path: string): Promise<void> {
    if (!this.conn) await this.initialize();
    if (!this.conn) throw new Error('Database not initialized');

    await this.conn.query(`COPY (SELECT * FROM nodes) TO '${path}' (FORMAT PARQUET)`);
    await this.conn.query(`COPY (SELECT * FROM edges) TO '${path.replace('.parquet', '_edges.parquet')}' (FORMAT PARQUET)`);
    await this.conn.query(`COPY (SELECT * FROM events) TO '${path.replace('.parquet', '_events.parquet')}' (FORMAT PARQUET)`);
  }

  // Cleanup
  async close(): Promise<void> {
    await this.flushBuffer();
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
    this.initialized = false;
  }
}

// Singleton instance
export const analyticsEngine = new AnalyticsEngine();