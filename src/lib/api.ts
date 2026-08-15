// AEGIS API Client — typed HTTP client for the AEGIS server
// Zero-slop fetch wrapper with auto-JSON, error typing, and retry

import type {
  ApiHealth, CertificateSigningRequest, IssuedCertificate, PqcCapsuleResult,
  PqcKeyPairResult, PqcSignResult, QueryResult, ServerStatus, SessionSnapshot,
  ThreatIntelRecord,
} from '../../shared/types';

export const SERVER_HOST = import.meta.env.VITE_AEGIS_SERVER ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${SERVER_HOST}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* non-JSON error */ }
    const msg = (body as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  // Health & server status
  health: () => request<ApiHealth>('/api/health'),

  // PQC key management
  generateKeyPair: (algorithm = 'ML-KEM-768') =>
    request<PqcKeyPairResult>('/api/pqc/keys', { method: 'POST', body: JSON.stringify({ algorithm }) }),

  signMessage: (message: string, algorithm = 'ML-DSA-65') =>
    request<PqcSignResult>('/api/pqc/sign', { method: 'POST', body: JSON.stringify({ message, algorithm }) }),

  encapsulate: (publicKeyB64: string, algorithm = 'ML-KEM-768') =>
    request<PqcCapsuleResult>('/api/pqc/capsule', { method: 'POST', body: JSON.stringify({ publicKeyB64, algorithm }) }),

  decapsulate: (publicKeyB64: string, secretKeyB64: string, cipherTextB64: string, algorithm = 'ML-KEM-768') =>
    request<{ sharedSecretB64: string }>('/api/pqc/decapsulate', { method: 'POST', body: JSON.stringify({ publicKeyB64, secretKeyB64, cipherTextB64, algorithm }) }),

  // Certificate issuance
  issueCertificate: (csr: CertificateSigningRequest) =>
    request<IssuedCertificate>('/api/certs', { method: 'POST', body: JSON.stringify(csr) }),

  // Sessions
  listSessions: () => request<SessionSnapshot[]>('/api/sessions'),
  createSession: (name = 'Default') =>
    request<SessionSnapshot>('/api/sessions', { method: 'POST', body: JSON.stringify({ name }) }),
  getSession: (id: string) => request<SessionSnapshot>(`/api/sessions/${id}`),

  // Graph & events (server-side DuckDB mirror)
  syncGraph: (sessionId: string, nodes: unknown[], edges: unknown[]) =>
    request<{ nodes: number; edges: number }>('/api/graph/sync', { method: 'POST', body: JSON.stringify({ sessionId, nodes, edges }) }),

  pushEvent: (evt: { sessionId: string; type: string; source: string; severity?: number; payload?: unknown }) =>
    request<{ ok: boolean }>('/api/events', { method: 'POST', body: JSON.stringify(evt) }),

  // Analytics query
  runQuery: (sql: string) =>
    request<QueryResult>('/api/query', { method: 'POST', body: JSON.stringify({ sql }) }),

  // Threat intel
  listThreats: () => request<ThreatIntelRecord[]>('/api/threats'),
  addThreat: (intel: ThreatIntelRecord) =>
    request<ThreatIntelRecord>('/api/threats', { method: 'POST', body: JSON.stringify(intel) }),
};

// Probe server availability (non-throwing)
export async function probeServer(): Promise<ServerStatus> {
  const started = performance.now();
  try {
    const health = await api.health();
    return {
      connected: true,
      baseUrl: SERVER_HOST,
      latencyMs: Math.round(performance.now() - started),
      health,
    };
  } catch (err) {
    return {
      connected: false,
      baseUrl: SERVER_HOST,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}