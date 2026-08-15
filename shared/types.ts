// AEGIS Shared Types — consumed by both server/ and src/
// Single source of truth for API contracts

export interface PqcKeyPairResult {
  algorithm: string; // e.g. ML-KEM-768
  keySizeBytes: number;
  publicKeyB64: string;
  secretKeyB64: string;
  fingerprint: string; // sha256 of public key
  generatedAt: number;
}

export interface PqcSignResult {
  algorithm: string;
  signatureB64: string;
  signatureBytes: number;
  messageHash: string;
  publicKeyB64: string;
  verified: boolean;
}

export interface PqcCapsuleResult {
  algorithm: string;
  cipherTextB64: string;
  sharedSecretB64: string;
  sharedSecretBytes: number;
}

export interface CertificateSigningRequest {
  subject: string;
  algorithm: string; // ML-DSA-65, SLH-DSA-SHAKE-128F
  validityDays: number;
  attributes?: Record<string, string>;
}

export interface IssuedCertificate {
  serial: string;
  subject: string;
  issuer: string;
  algorithm: string;
  publicKeyB64: string;
  notBefore: number;
  notAfter: number;
  fingerprint: string;
  signatureB64: string;
  pem: string;
}

export interface ThreatIntelRecord {
  id: string;
  source: string;
  timestamp: number;
  indicators: Array<{
    type: string;
    value: string;
    confidence: number;
    tags: string[];
  }>;
  merkleRoot: string;
  verified: boolean;
}

export interface SessionSnapshot {
  id: string;
  createdAt: number;
  updatedAt: number;
  graphJson: string;
  eventCount: number;
  nodeCount: number;
  edgeCount: number;
  meta: Record<string, unknown>;
}

export interface ApiHealth {
  status: 'ok';
  name: string;
  version: string;
  uptimeSeconds: number;
  timestamp: number;
  pqcAlgorithms: string[];
  capabilities: string[];
}

export interface CreateSessionRequest {
  name?: string;
}

export interface SaveSessionRequest extends SessionSnapshot {
  sessionId: string;
}

export interface CreateNodeRequest {
  sessionId: string;
  kind: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface QueryRequest {
  sessionId: string;
  sql: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  executionTimeMs: number;
  rowCount: number;
}

export interface ServerStatus {
  connected: boolean;
  baseUrl: string;
  latencyMs?: number;
  health?: ApiHealth;
  error?: string;
}

export const API_ENDPOINTS = {
  health: '/api/health',
  pqc: '/api/pqc',
  keys: '/api/pqc/keys',
  sign: '/api/pqc/sign',
  capsule: '/api/pqc/capsule',
  certs: '/api/certs',
  sessions: '/api/sessions',
  threats: '/api/threats',
  nodes: '/api/nodes',
  query: '/api/query',
} as const;

// ---- Accounts, workspaces, discovery (product layer) ----
export interface AuthUser { id: string; email: string; }

export interface ProjectCounts { nodes: number; edges: number; events: number; }

export interface ProjectInfo {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  counts: ProjectCounts;
  meta: Record<string, unknown>;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsed: number | null;
  revoked: boolean;
}

export interface CollectorInfo {
  name: string;
  description: string;
  simulated: boolean;
  available: boolean;
  note?: string;
  running: boolean;
  lastRun: { at: number; found: number; error: string | null; simulated: boolean; ms: number } | null;
}

export interface CollectorRunResponse {
  collector: string;
  simulated: boolean;
  available: boolean;
  note?: string;
  found: number;
  upserted: { nodes: number; edges: number } | null;
  ms: number;
  counts: ProjectCounts;
  log: string[];
}