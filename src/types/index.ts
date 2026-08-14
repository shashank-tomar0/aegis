// AEGIS Core Type Definitions
// Zero-slop, precision types for agentic attack-surface + PQC crypto-agility

export type NodeId = string & { readonly __brand: unique symbol };
export type EdgeId = string & { readonly __brand: unique symbol };
export type AgentId = string & { readonly __brand: unique symbol };
export type ToolId = string & { readonly __brand: unique symbol };
export type DataSourceId = string & { readonly __brand: unique symbol };
export type SessionId = string & { readonly __brand: unique symbol };
export type EventId = string & { readonly __brand: unique symbol };

export const nodeId = (s: string): NodeId => s as NodeId;
export const edgeId = (s: string): EdgeId => s as EdgeId;
export const agentId = (s: string): AgentId => s as AgentId;
export const toolId = (s: string): ToolId => s as ToolId;
export const dataSourceId = (s: string): DataSourceId => s as DataSourceId;
export const sessionId = (s: string): SessionId => s as SessionId;
export const eventId = (s: string): EventId => s as EventId;

export enum NodeKind {
  AGENT = 'agent',
  TOOL = 'tool',
  DATA_SOURCE = 'data_source',
  USER = 'user',
  GATEWAY = 'gateway',
}

export enum EdgeKind {
  INVOCATION = 'invocation',
  DATA_FLOW = 'data_flow',
  PRIVILEGE = 'privilege',
  DELEGATION = 'delegation',
  OBSERVATION = 'observation',
}

export enum RiskSeverity {
  INFO = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export enum CryptoAlgorithm {
  RSA_2048 = 'RSA-2048',
  RSA_4096 = 'RSA-4096',
  ECDSA_P256 = 'ECDSA-P256',
  ECDSA_P384 = 'ECDSA-P384',
  ED25519 = 'Ed25519',
  ML_KEM_512 = 'ML-KEM-512',
  ML_KEM_768 = 'ML-KEM-768',
  ML_KEM_1024 = 'ML-KEM-1024',
  ML_DSA_44 = 'ML-DSA-44',
  ML_DSA_65 = 'ML-DSA-65',
  ML_DSA_87 = 'ML-DSA-87',
  SLH_DSA_SHAKE_128F = 'SLH-DSA-SHAKE-128F',
  SLH_DSA_SHAKE_192F = 'SLH-DSA-SHAKE-192F',
  SLH_DSA_SHAKE_256F = 'SLH-DSA-SHAKE-256F',
  UNKNOWN = 'UNKNOWN',
}

export enum QuantumResistance {
  NONE = 0,
  PARTIAL = 1,
  FULL = 2,
}

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export interface GraphNode {
  id: NodeId;
  kind: NodeKind;
  label: string;
  metadata: Record<string, unknown>;
  position: Position;
  velocity: Velocity;
  riskScore: number;
  severity: RiskSeverity;
  cryptoProfile?: CryptoProfile;
  isCompromised: boolean;
  isQuarantined: boolean;
  blastRadius: number;
  centrality: number;
  createdAt: number;
  updatedAt: number;
}

export interface GraphEdge {
  id: EdgeId;
  source: NodeId;
  target: NodeId;
  kind: EdgeKind;
  weight: number;
  metadata: Record<string, unknown>;
  isActive: boolean;
  riskContribution: number;
  createdAt: number;
  updatedAt: number;
}

export interface CryptoProfile {
  algorithm: CryptoAlgorithm;
  keySize: number;
  quantumResistance: QuantumResistance;
  nistLevel: number;
  migrationTarget?: CryptoAlgorithm;
  migrationPriority: number;
  lastRotated: number;
  expiresAt: number;
  issuer: string;
  subject: string;
  fingerprint: string;
}

export interface BlastRadiusResult {
  sourceNode: NodeId;
  reachableNodes: NodeId[];
  criticalPaths: NodeId[][];
  minCut: EdgeId[];
  minCutCapacity: number;
  riskPropagation: Map<NodeId, number>;
  timeToCompromise: Map<NodeId, number>;
  affectedDataSources: DataSourceId[];
  affectedAgents: AgentId[];
}

export interface SimulationEvent {
  id: EventId;
  timestamp: number;
  type: EventType;
  severity: RiskSeverity;
  sourceNode: NodeId;
  targetNode?: NodeId;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export enum EventType {
  AGENT_SPAWN = 'agent_spawn',
  AGENT_TERMINATE = 'agent_terminate',
  TOOL_REGISTER = 'tool_register',
  TOOL_UNREGISTER = 'tool_unregister',
  INVOCATION = 'invocation',
  DATA_ACCESS = 'data_access',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  ANOMALY_DETECTED = 'anomaly_detected',
  COMPROMISE_ATTEMPT = 'compromise_attempt',
  COMPROMISE_SUCCESS = 'compromise_success',
  QUARANTINE = 'quarantine',
  ROTATE_KEY = 'rotate_key',
  MIGRATE_CRYPTO = 'migrate_crypto',
  BLAST_RADIUS_CALCULATED = 'blast_radius_calculated',
  CENTRALITY_UPDATED = 'centrality_updated',
  THREAT_INTEL_SHARED = 'threat_intel_shared',
  ZK_COMMITMENT_VERIFIED = 'zk_commitment_verified',
}

export interface ThreatIntel {
  id: string;
  source: string;
  timestamp: number;
  indicators: Indicator[];
  merkleRoot: string;
  zkProof: string;
  verified: boolean;
}

export interface Indicator {
  type: 'ip' | 'domain' | 'hash' | 'pubkey' | 'agent_id' | 'tool_id';
  value: string;
  confidence: number;
  tags: string[];
}

export interface ZKCommitment {
  commitment: string;
  nullifier: string;
  proof: string;
  publicInputs: string[];
}

export interface AnalyticsQuery {
  sql: string;
  params: unknown[];
  resultColumns: string[];
  resultRows: unknown[][];
  executionTimeMs: number;
  rowCount: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

export interface SelectionState {
  nodes: Set<NodeId>;
  edges: Set<EdgeId>;
  mode: 'select' | 'pan' | 'blast' | 'path';
}

export interface CommandPaletteItem {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: () => void;
  category: string;
  keywords: string[];
}