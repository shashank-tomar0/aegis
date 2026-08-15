// AEGIS Store - Zustand-based state management with persistence
// Zero-slop, reactive state for attack surface visualization

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  NodeId, EdgeId, AgentId, ToolId, DataSourceId, SessionId,
  GraphNode, GraphEdge, Position, Viewport, SelectionState,
  CryptoProfile, BlastRadiusResult,
  SimulationEvent, QuantumResistance
} from '../types';
import {
  NodeKind, EdgeKind, RiskSeverity, EventType, CryptoAlgorithm,
  nodeId, edgeId, agentId, toolId, dataSourceId, sessionId, eventId
} from '../types';
import { AttackSurfaceGraph } from '../engine/graph';
import { analyticsEngine } from '../engine/analytics';
import { zkThreatIntel, zkKeyRotation } from '../engine/zkproof';
import { simRNG } from '../engine/seedrandom';
import { api, probeServer } from '../lib/api';
import type { ServerStatus, SessionSnapshot, ProjectInfo, ApiKeyInfo, CollectorInfo } from '../../shared/types';

interface AppState {
  // Graph
  graph: AttackSurfaceGraph;
  selectedNodes: Set<NodeId>;
  selectedEdges: Set<EdgeId>;
  hoverNode: NodeId | null;
  hoverEdge: EdgeId | null;

  // Viewport
  viewport: Viewport;
  isPanning: boolean;
  panStart: Position | null;

  // UI State
  mode: 'select' | 'pan' | 'blast' | 'path' | 'crypto';
  sidebarOpen: boolean;
  sidebarTab: import('../components/panels/Sidebar').SidebarTabId;
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;

  // Simulation
  isSimulating: boolean;
  simulationSpeed: number;
  simulationTime: number;
  eventLog: SimulationEvent[];

  // Analytics
  analyticsResults: Map<string, any>;
  isQueryRunning: boolean;

  // Crypto
  cryptoMigrationQueue: Array<{ nodeId: NodeId; targetAlgorithm: CryptoAlgorithm }>;
  isMigrating: boolean;

  // Threat Intel
  threatIntel: any[];
  isSharingIntel: boolean;

  // Server (full-stack backend)
  serverStatus: ServerStatus | null;
  isConnectingServer: boolean;
  serverSession: SessionSnapshot | null;
  serverSessions: SessionSnapshot[];
  isSyncingServer: boolean;

  // Accounts, workspaces & discovery (product layer)
  authUser: { id: string; email: string } | null;
  authBusy: boolean;
  authError: string | null;
  projects: ProjectInfo[];
  currentProjectId: string | null;
  apiKeys: ApiKeyInfo[];
  collectors: CollectorInfo[];
  collectorLog: string[];
  discoveryBusy: boolean;

  // Actions - Graph
  addNode: (kind: NodeKind, label: string, metadata?: Record<string, unknown>, position?: Position) => NodeId;
  addEdge: (source: NodeId, target: NodeId, kind: EdgeKind, weight?: number, metadata?: Record<string, unknown>) => EdgeId;
  removeNode: (id: NodeId) => void;
  removeEdge: (id: EdgeId) => void;
  updateNode: (id: NodeId, updates: Partial<GraphNode>) => void;
  updateEdge: (id: EdgeId, updates: Partial<GraphEdge>) => void;
  setNodePosition: (id: NodeId, position: Position) => void;
  setNodeRisk: (id: NodeId, riskScore: number, severity: RiskSeverity) => void;
  compromiseNode: (id: NodeId, compromised: boolean) => void;
  quarantineNode: (id: NodeId, quarantined: boolean) => void;
  calculateBlastRadius: (sourceId: NodeId) => BlastRadiusResult;
  calculateCentrality: () => void;
  stepLayout: (iterations?: number) => void;
  loadGraph: (data: any) => void;
  exportGraph: () => any;

  // Actions - Selection
  selectNode: (id: NodeId, multi?: boolean) => void;
  selectEdge: (id: EdgeId, multi?: boolean) => void;
  clearSelection: () => void;
  setHoverNode: (id: NodeId | null) => void;
  setHoverEdge: (id: EdgeId | null) => void;

  // Actions - Viewport
  setViewport: (viewport: Partial<Viewport>) => void;
  startPan: (position: Position) => void;
  updatePan: (position: Position) => void;
  endPan: () => void;
  zoomToFit: () => void;
  zoomToNode: (id: NodeId) => void;

  // Actions - UI
  setMode: (mode: AppState['mode']) => void;
  toggleSidebar: () => void;
  setSidebarTab: (tab: AppState['sidebarTab']) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteQuery: (query: string) => void;

  // Actions - Simulation
  startSimulation: () => void;
  stopSimulation: () => void;
  setSimulationSpeed: (speed: number) => void;
  stepSimulation: () => void;
  addEvent: (event: Omit<SimulationEvent, 'id' | 'timestamp'>) => void;
  clearEventLog: () => void;

  // Actions - Analytics
  runQuery: (key: string, sql: string, params?: unknown[]) => Promise<void>;
  getAnalytics: (key: string) => any;
  refreshAnalytics: () => Promise<void>;

  // Actions - Crypto
  setCryptoProfile: (nodeId: NodeId, profile: CryptoProfile) => void;
  queueCryptoMigration: (nodeId: NodeId, targetAlgorithm: CryptoAlgorithm) => void;
  processCryptoMigrations: () => Promise<void>;
  rotateKey: (nodeId: NodeId) => Promise<void>;

  // Actions - Threat Intel
  addThreatIntel: (intel: any) => void;
  shareThreatIntel: (indicators: any[], secret: Uint8Array) => Promise<void>;
  verifyThreatIntel: (intel: any) => boolean;

  // Actions - Server
  connectServer: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  createServerSession: (name?: string) => Promise<SessionSnapshot | null>;
  syncGraphToServer: () => Promise<boolean>;
  pushEventToServer: (type: string, source: string, severity?: number, payload?: unknown) => Promise<void>;

  // Actions - Accounts / workspaces / discovery
  refreshAuth: () => Promise<void>;
  register: (email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  createProject: (name: string) => Promise<ProjectInfo | null>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;
  refreshCollectors: () => Promise<void>;
  runCollector: (collector: string) => Promise<boolean>;
  refreshApiKeys: () => Promise<void>;
  createApiKey: (name: string) => Promise<string | null>;
  revokeApiKey: (id: string) => Promise<void>;
  loadDiscoveredGraph: (projectId?: string) => Promise<boolean>;
  clearProjectGraph: () => Promise<void>;
  appendCollectorLog: (line: string) => void;
  clearCollectorLog: () => void;

  // Actions - Persistence
  saveSession: () => Promise<void>;
  loadSession: (sessionData: any) => void;
  newSession: () => void;
  undo: () => boolean;
  redo: () => boolean;
}

const defaultViewport: Viewport = { x: 0, y: 0, zoom: 1, width: 1200, height: 800 };

export const useStore = create<AppState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial State
        graph: new AttackSurfaceGraph(),
        selectedNodes: new Set(),
        selectedEdges: new Set(),
        hoverNode: null,
        hoverEdge: null,
        viewport: defaultViewport,
        isPanning: false,
        panStart: null,
        mode: 'select',
        sidebarOpen: true,
        sidebarTab: 'topology',
        commandPaletteOpen: false,
        commandPaletteQuery: '',
        isSimulating: false,
        simulationSpeed: 1,
        simulationTime: 0,
        eventLog: [],
        analyticsResults: new Map(),
        isQueryRunning: false,
        cryptoMigrationQueue: [],
        isMigrating: false,
        threatIntel: [],
        isSharingIntel: false,
        serverStatus: null,
        isConnectingServer: false,
        serverSession: null,
        serverSessions: [],
        isSyncingServer: false,

        // Accounts / workspaces / discovery
        authUser: null,
        authBusy: false,
        authError: null,
        projects: [],
        currentProjectId: null,
        apiKeys: [],
        collectors: [],
        collectorLog: [],
        discoveryBusy: false,

        // Graph Actions
        addNode: (kind, label, metadata = {}, position) => {
          const id = get().graph.addNode(kind, label, metadata, position);
          set({ graph: get().graph }); // Trigger reactivity
          return id;
        },

        addEdge: (source, target, kind, weight = 1, metadata = {}) => {
          const id = get().graph.addEdge(source, target, kind, weight, metadata);
          set({ graph: get().graph });
          return id;
        },

        removeNode: (id) => {
          get().graph.removeNode(id);
          const { selectedNodes, selectedEdges } = get();
          selectedNodes.delete(id);
          // Remove edges connected to this node
          for (const edgeId of selectedEdges) {
            const edge = get().graph.getEdge(edgeId);
            if (edge && (edge.source === id || edge.target === id)) {
              selectedEdges.delete(edgeId);
            }
          }
          set({ graph: get().graph, selectedNodes: new Set(selectedNodes), selectedEdges: new Set(selectedEdges) });
        },

        removeEdge: (id) => {
          get().graph.removeEdge(id);
          const { selectedEdges } = get();
          selectedEdges.delete(id);
          set({ graph: get().graph, selectedEdges: new Set(selectedEdges) });
        },

        updateNode: (id, updates) => {
          const node = get().graph.getNode(id);
          if (node) {
            Object.assign(node, updates, { updatedAt: Date.now() });
            set({ graph: get().graph });
          }
        },

        updateEdge: (id, updates) => {
          const edge = get().graph.getEdge(id);
          if (edge) {
            Object.assign(edge, updates, { updatedAt: Date.now() });
            set({ graph: get().graph });
          }
        },

        setNodePosition: (id, position) => {
          const node = get().graph.getNode(id);
          if (node) {
            node.position = position;
            node.updatedAt = Date.now();
            set({ graph: get().graph });
          }
        },

        setNodeRisk: (id, riskScore, severity) => {
          const node = get().graph.getNode(id);
          if (node) {
            node.riskScore = Math.max(0, Math.min(1, riskScore));
            node.severity = severity;
            node.updatedAt = Date.now();
            set({ graph: get().graph });
          }
        },

        compromiseNode: (id, compromised) => {
          const node = get().graph.getNode(id);
          if (node) {
            node.isCompromised = compromised;
            if (compromised) node.severity = Math.max(node.severity, RiskSeverity.CRITICAL);
            node.updatedAt = Date.now();
            get().addEvent({
              type: compromised ? EventType.COMPROMISE_SUCCESS : EventType.COMPROMISE_ATTEMPT,
              severity: compromised ? RiskSeverity.CRITICAL : RiskSeverity.HIGH,
              sourceNode: id,
              payload: { compromised },
              metadata: {},
            });
            set({ graph: get().graph });
          }
        },

        quarantineNode: (id, quarantined) => {
          const node = get().graph.getNode(id);
          if (node) {
            node.isQuarantined = quarantined;
            node.updatedAt = Date.now();
            get().addEvent({
              type: EventType.QUARANTINE,
              severity: RiskSeverity.HIGH,
              sourceNode: id,
              payload: { quarantined },
              metadata: {},
            });
            set({ graph: get().graph });
          }
        },

        calculateBlastRadius: (sourceId) => {
          const result = get().graph.calculateBlastRadius(sourceId);
          // Update node blast radius values
          for (const [nodeId, risk] of result.riskPropagation) {
            const node = get().graph.getNode(nodeId);
            if (node) {
              node.blastRadius = result.reachableNodes.length;
              node.riskScore = Math.max(node.riskScore, risk);
            }
          }
          get().addEvent({
            type: EventType.BLAST_RADIUS_CALCULATED,
            severity: RiskSeverity.MEDIUM,
            sourceNode: sourceId,
            payload: { reachableCount: result.reachableNodes.length, minCutCapacity: result.minCutCapacity },
            metadata: {},
          });
          set({ graph: get().graph });
          return result;
        },

        calculateCentrality: () => {
          get().graph.calculateCentrality();
          get().addEvent({
            type: EventType.CENTRALITY_UPDATED,
            severity: RiskSeverity.INFO,
            sourceNode: '' as NodeId,
            payload: {},
            metadata: {},
          });
          set({ graph: get().graph });
        },

        stepLayout: (iterations = 1) => {
          get().graph.stepLayout(iterations);
          set({ graph: get().graph });
        },

        loadGraph: (data) => {
          const graph = AttackSurfaceGraph.fromJSON(data);
          set({ graph, selectedNodes: new Set(), selectedEdges: new Set() });
        },

        exportGraph: () => {
          return get().graph.toJSON();
        },

        // Selection Actions
        selectNode: (id, multi = false) => {
          const { selectedNodes } = get();
          const newSelection = multi ? new Set<NodeId>(selectedNodes) : new Set<NodeId>();
          if (id && newSelection.has(id)) {
            newSelection.delete(id);
          } else if (id) {
            newSelection.add(id);
          }
          set({ selectedNodes: newSelection });
        },

        selectEdge: (id, multi = false) => {
          const { selectedEdges } = get();
          const newSelection = multi ? new Set<EdgeId>(selectedEdges) : new Set<EdgeId>();
          if (newSelection.has(id)) {
            newSelection.delete(id);
          } else {
            newSelection.add(id);
          }
          set({ selectedEdges: newSelection });
        },

        clearSelection: () => {
          set({ selectedNodes: new Set(), selectedEdges: new Set() });
        },

        setHoverNode: (id) => set({ hoverNode: id }),
        setHoverEdge: (id) => set({ hoverEdge: id }),

        // Viewport Actions
        setViewport: (viewport) => set(state => ({ viewport: { ...state.viewport, ...viewport } })),
        startPan: (position) => set({ isPanning: true, panStart: position }),
        updatePan: (position) => {
          const { panStart, viewport } = get();
          if (panStart && get().isPanning) {
            const dx = (position.x - panStart.x) / viewport.zoom;
            const dy = (position.y - panStart.y) / viewport.zoom;
            set({ viewport: { ...viewport, x: viewport.x - dx, y: viewport.y - dy }, panStart: position });
          }
        },
        endPan: () => set({ isPanning: false, panStart: null }),
        zoomToFit: () => {
          const { graph, viewport } = get();
          const nodes = graph.getAllNodes();
          if (nodes.length === 0) return;

          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const node of nodes) {
            minX = Math.min(minX, node.position.x);
            maxX = Math.max(maxX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxY = Math.max(maxY, node.position.y);
          }

          const padding = 100;
          const graphWidth = maxX - minX + padding * 2;
          const graphHeight = maxY - minY + padding * 2;
          const zoom = Math.min(viewport.width / graphWidth, viewport.height / graphHeight, 2);
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;

          set({
            viewport: {
              ...viewport,
              x: centerX - viewport.width / 2 / zoom,
              y: centerY - viewport.height / 2 / zoom,
              zoom,
            }
          });
        },
        zoomToNode: (id) => {
          const { graph, viewport } = get();
          const node = graph.getNode(id);
          if (!node) return;
          set({
            viewport: {
              ...viewport,
              x: node.position.x - viewport.width / 2 / viewport.zoom,
              y: node.position.y - viewport.height / 2 / viewport.zoom,
            }
          });
        },

        // UI Actions
        setMode: (mode) => set({ mode }),
        toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
        setSidebarTab: (tab) => set({ sidebarTab: tab }),
        openCommandPalette: () => set({ commandPaletteOpen: true, commandPaletteQuery: '' }),
        closeCommandPalette: () => set({ commandPaletteOpen: false }),
        setCommandPaletteQuery: (query) => set({ commandPaletteQuery: query }),

        // Simulation Actions
        startSimulation: () => set({ isSimulating: true }),
        stopSimulation: () => set({ isSimulating: false }),
        setSimulationSpeed: (speed) => set({ simulationSpeed: Math.max(0.1, Math.min(10, speed)) }),
        stepSimulation: () => {
          const { graph, simulationSpeed } = get();
          graph.stepLayout(1);
          const nodes = graph.getAllNodes();
          for (const node of nodes) {
            // Random walk for agents
            if (node.kind === NodeKind.AGENT && !node.isQuarantined && simRNG.next() < 0.01 * simulationSpeed) {
              const neighbors = graph.getNeighbors(node.id, 'out');
              if (neighbors.length > 0) {
                const target = neighbors[simRNG.nextInt(0, neighbors.length)];
                const edge = graph.getOutgoingEdges(node.id).find(e => e.target === target);
                if (edge && simRNG.next() < 0.3) {
                  // Simulate invocation
                  get().addEvent({
                    type: EventType.INVOCATION,
                    severity: RiskSeverity.LOW,
                    sourceNode: node.id,
                    targetNode: target,
                    payload: { tool: target },
                    metadata: {},
                  });
                }
              }
            }
          }
          set({ simulationTime: get().simulationTime + 1, graph: graph });
        },
        addEvent: (event) => {
          const fullEvent: SimulationEvent = {
            ...event,
            id: eventId(`evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            timestamp: Date.now(),
          };
          set(state => ({
            eventLog: [fullEvent, ...state.eventLog].slice(0, 1000)
          }));
        },
        clearEventLog: () => set({ eventLog: [] }),

        // Analytics Actions
        runQuery: async (key, sql, params = []) => {
          set({ isQueryRunning: true });
          try {
            const result = await analyticsEngine.query(sql, params);
            set(state => {
              const newResults = new Map(state.analyticsResults);
              newResults.set(key, result);
              return { analyticsResults: newResults, isQueryRunning: false };
            });
          } catch (error) {
            console.error('Query failed:', error);
            set({ isQueryRunning: false });
          }
        },

        getAnalytics: (key) => get().analyticsResults.get(key),

        refreshAnalytics: async () => {
          const { graph } = get();
          await analyticsEngine.syncGraph(graph.getAllNodes(), graph.getAllEdges());

          // Run standard queries
          await get().runQuery('topRisk', `SELECT * FROM nodes ORDER BY risk_score DESC LIMIT 20`);
          await get().runQuery('cryptoInventory', `SELECT crypto_algorithm, COUNT(*) as count FROM nodes WHERE crypto_algorithm IS NOT NULL GROUP BY crypto_algorithm`);
          await get().runQuery('blastRadius', `SELECT id, label, blast_radius FROM nodes WHERE blast_radius > 0 ORDER BY blast_radius DESC LIMIT 50`);
          await get().runQuery('events', `SELECT * FROM events ORDER BY timestamp DESC LIMIT 100`);
        },

        // Crypto Actions
        setCryptoProfile: (nodeId, profile) => {
          get().graph.setCryptoProfile(nodeId, profile);
          get().addEvent({
            type: EventType.ROTATE_KEY,
            severity: RiskSeverity.MEDIUM,
            sourceNode: nodeId,
            payload: { algorithm: profile.algorithm },
            metadata: {},
          });
          set({ graph: get().graph });
        },

        queueCryptoMigration: (nodeId, targetAlgorithm) => {
          set(state => ({
            cryptoMigrationQueue: [...state.cryptoMigrationQueue, { nodeId, targetAlgorithm }]
          }));
        },

        processCryptoMigrations: async () => {
          set({ isMigrating: true });
          const { cryptoMigrationQueue, graph } = get();

          for (const { nodeId, targetAlgorithm } of cryptoMigrationQueue) {
            const success = graph.migrateCrypto(nodeId, targetAlgorithm);
            if (success) {
              get().addEvent({
                type: EventType.MIGRATE_CRYPTO,
                severity: RiskSeverity.MEDIUM,
                sourceNode: nodeId,
                payload: { targetAlgorithm },
                metadata: {},
              });
              // Generate ZK proof of rotation
              const node = graph.getNode(nodeId);
              if (node?.cryptoProfile) {
                const oldKey = new TextEncoder().encode(node.cryptoProfile.algorithm);
                const newKey = new TextEncoder().encode(targetAlgorithm);
                const secret = crypto.getRandomValues(new Uint8Array(32));
                await zkKeyRotation.proveRotation(oldKey, newKey, secret);
              }
            }
          }

          set({ cryptoMigrationQueue: [], isMigrating: false, graph });
        },

        rotateKey: async (nodeId) => {
          const node = get().graph.getNode(nodeId);
          if (!node?.cryptoProfile) return;

          const algorithms = Object.values(CryptoAlgorithm).filter(a =>
            a !== node.cryptoProfile?.algorithm && a !== CryptoAlgorithm.UNKNOWN
          );
          const targetAlgorithm = algorithms[simRNG.nextInt(0, algorithms.length)];

          get().graph.migrateCrypto(nodeId, targetAlgorithm);
          get().addEvent({
            type: EventType.ROTATE_KEY,
            severity: RiskSeverity.MEDIUM,
            sourceNode: nodeId,
            payload: { oldAlgorithm: node.cryptoProfile.algorithm, newAlgorithm: targetAlgorithm },
            metadata: {},
          });
          set({ graph: get().graph });
        },

        // Threat Intel Actions
        addThreatIntel: (intel) => {
          set(state => ({ threatIntel: [intel, ...state.threatIntel].slice(0, 100) }));
        },

        shareThreatIntel: async (indicators, secret) => {
          set({ isSharingIntel: true });
          try {
            const intel = await zkThreatIntel.batchAddIndicators(indicators, secret);
            get().addThreatIntel(intel);
            get().addEvent({
              type: EventType.THREAT_INTEL_SHARED,
              severity: RiskSeverity.INFO,
              sourceNode: '' as NodeId,
              payload: { indicatorCount: indicators.length, merkleRoot: intel.merkleRoot },
              metadata: {},
            });
          } finally {
            set({ isSharingIntel: false });
          }
        },

        verifyThreatIntel: (intel) => {
          return zkThreatIntel.verifyIntel(intel);
        },

        // Server Actions (full-stack backend)
        connectServer: async () => {
          set({ isConnectingServer: true });
          try {
            const status = await probeServer();
            set({ serverStatus: status, isConnectingServer: false });
            if (status.connected) {
              await get().refreshSessions();
            }
          } catch (err) {
            set({
              serverStatus: { connected: false, baseUrl: '', error: String(err) },
              isConnectingServer: false,
            });
          }
        },

        refreshSessions: async () => {
          try {
            const sessions = await api.listSessions();
            set({ serverSessions: sessions });
          } catch (err) {
            console.error('[Server] refresh sessions failed:', err);
          }
        },

        createServerSession: async (name) => {
          try {
            const session = await api.createSession(name);
            set({ serverSession: session });
            await get().refreshSessions();
            return session;
          } catch (err) {
            console.error('[Server] create session failed:', err);
            return null;
          }
        },

        syncGraphToServer: async () => {
          const { serverSession, graph } = get();
          if (!serverSession) return false;
          set({ isSyncingServer: true });
          try {
            const result = await api.syncGraph(
              serverSession.id,
              graph.getAllNodes(),
              graph.getAllEdges(),
            );
            set({ isSyncingServer: false });
            return result.nodes >= 0;
          } catch (err) {
            console.error('[Server] sync failed:', err);
            set({ isSyncingServer: false });
            return false;
          }
        },

        pushEventToServer: async (type, source, severity = 0, payload = {}) => {
          const { serverSession } = get();
          if (!serverSession) return;
          try {
            await api.pushEvent({
              sessionId: serverSession.id,
              type,
              source,
              severity,
              payload,
            });
          } catch (err) {
            console.error('[Server] push event failed:', err);
          }
        },

        // ---- Accounts / workspaces / discovery ----
        refreshAuth: async () => {
          try {
            const { user } = await api.authMe();
            set({ authUser: user });
          } catch { set({ authUser: null }); }
        },
        register: async (email, password) => {
          set({ authBusy: true, authError: null });
          try {
            const { user } = await api.authRegister(email, password);
            set({ authUser: user, authBusy: false });
            return true;
          } catch (err) {
            set({ authBusy: false, authError: err instanceof Error ? err.message : String(err) });
            return false;
          }
        },
        login: async (email, password) => {
          set({ authBusy: true, authError: null });
          try {
            const { user } = await api.authLogin(email, password);
            set({ authUser: user, authBusy: false });
            return true;
          } catch (err) {
            set({ authBusy: false, authError: err instanceof Error ? err.message : String(err) });
            return false;
          }
        },
        logout: async () => {
          try { await api.authLogout(); } catch { /* ignore */ }
          set({ authUser: null, projects: [], currentProjectId: null, apiKeys: [], collectors: [] });
        },
        refreshProjects: async () => {
          try {
            const projects = await api.listProjects();
            set({ projects });
            if (!get().currentProjectId && projects.length > 0) {
              set({ currentProjectId: projects[0].id });
            }
          } catch { set({ projects: [] }); }
        },
        createProject: async (name) => {
          try {
            const project = await api.createProject(name);
            set(s => ({ projects: [project, ...s.projects.filter(p => p.id !== project.id)], currentProjectId: project.id }));
            return project;
          } catch (err) {
            set({ authError: err instanceof Error ? err.message : String(err) });
            return null;
          }
        },
        deleteProject: async (id) => {
          try {
            await api.deleteProject(id);
            set(s => {
              const projects = s.projects.filter(p => p.id !== id);
              return { projects, currentProjectId: s.currentProjectId === id ? (projects[0]?.id ?? null) : s.currentProjectId };
            });
          } catch { /* ignore */ }
        },
        selectProject: (id) => set({ currentProjectId: id }),
        refreshCollectors: async () => {
          try { set({ collectors: await api.listCollectors() }); }
          catch { set({ collectors: [] }); }
        },
        runCollector: async (collector) => {
          const projectId = get().currentProjectId;
          if (!projectId) { set({ authError: 'select a project first' }); return false; }
          set({ discoveryBusy: true, authError: null });
          get().appendCollectorLog(`> running "${collector}" into ${projectId.slice(0, 8)}…`);
          try {
            const r = await api.runCollector(collector, projectId);
            get().appendCollectorLog(r.available
              ? `✓ ${collector}: ${r.found} items · ${r.upserted?.nodes ?? 0} nodes / ${r.upserted?.edges ?? 0} edges · ${r.ms}ms${r.simulated ? ' · SIMULATED' : ''}`
              : `✗ ${collector}: ${r.note ?? 'unavailable'}`);
            for (const line of (r.log ?? [])) get().appendCollectorLog(`  ${line}`);
            await get().refreshProjects();
            await get().refreshCollectors();
            return r.available;
          } catch (err) {
            get().appendCollectorLog(`✗ ${err instanceof Error ? err.message : String(err)}`);
            return false;
          } finally {
            set({ discoveryBusy: false });
          }
        },
        refreshApiKeys: async () => {
          try { set({ apiKeys: await api.listApiKeys() }); }
          catch { set({ apiKeys: [] }); }
        },
        createApiKey: async (name) => {
          try {
            const k = await api.createApiKey(name);
            await get().refreshApiKeys();
            return k.key;
          } catch (err) {
            set({ authError: err instanceof Error ? err.message : String(err) });
            return null;
          }
        },
        revokeApiKey: async (id) => {
          try { await api.revokeApiKey(id); await get().refreshApiKeys(); } catch { /* ignore */ }
        },
        loadDiscoveredGraph: async (projectId) => {
          const id = projectId ?? get().currentProjectId;
          if (!id) { set({ authError: 'select a project first' }); return false; }
          try {
            const { nodes, edges } = await api.getProjectGraph(id);
            if (nodes.length === 0) { get().appendCollectorLog('⚠ project graph is empty — run a collector first'); return false; }
            // DuckDB rows use snake_case column names — map to engine shape
            const mappedNodes = nodes.map((n: any) => ({
              id: n.id, kind: n.kind, label: n.label,
              metadata: n.metadata ?? {}, riskScore: n.risk_score ?? 0, severity: n.severity ?? 0,
            }));
            const mappedEdges = edges.map((e: any) => ({
              id: e.id, source: e.source_id, target: e.target_id,
              kind: e.kind, weight: e.weight ?? 1, metadata: e.metadata ?? {},
            }));
            const graph = new AttackSurfaceGraph();
            graph.loadExternal(mappedNodes as any, mappedEdges as any);
            set({ graph, selectedNodes: new Set(), selectedEdges: new Set() });
            get().appendCollectorLog(`✓ loaded ${nodes.length} nodes / ${edges.length} edges into the canvas`);
            return true;
          } catch (err) {
            get().appendCollectorLog(`✗ ${err instanceof Error ? err.message : String(err)}`);
            return false;
          }
        },
        clearProjectGraph: async () => {
          const projectId = get().currentProjectId;
          if (!projectId) return;
          try {
            await api.clearProjectGraph(projectId);
            await get().refreshProjects();
            get().appendCollectorLog('✓ project graph cleared on server');
          } catch { /* ignore */ }
        },
        appendCollectorLog: (line) => set(s => ({ collectorLog: [...s.collectorLog.slice(-60), line] })),
        clearCollectorLog: () => set({ collectorLog: [] }),

        // Persistence Actions
        saveSession: async () => {
          const state = get();
          const sessionData = {
            graph: state.graph.toJSON(),
            viewport: state.viewport,
            mode: state.mode,
            sidebarTab: state.sidebarTab,
            simulationTime: state.simulationTime,
            eventLog: state.eventLog.slice(0, 100),
            timestamp: Date.now(),
          };
          localStorage.setItem('aegis_session', JSON.stringify(sessionData));
        },

        loadSession: (sessionData) => {
          if (sessionData.graph) {
            get().loadGraph(sessionData.graph);
          }
          if (sessionData.viewport) {
            set({ viewport: sessionData.viewport });
          }
          if (sessionData.mode) {
            set({ mode: sessionData.mode });
          }
          if (sessionData.sidebarTab) {
            set({ sidebarTab: sessionData.sidebarTab });
          }
          if (sessionData.eventLog) {
            set({ eventLog: sessionData.eventLog });
          }
        },

        newSession: () => {
          set({
            graph: new AttackSurfaceGraph(),
            selectedNodes: new Set(),
            selectedEdges: new Set(),
            viewport: defaultViewport,
            mode: 'select',
            eventLog: [],
            analyticsResults: new Map(),
            cryptoMigrationQueue: [],
            threatIntel: [],
            simulationTime: 0,
          });
          localStorage.removeItem('aegis_session');
        },

        undo: () => {
          const success = get().graph.undo();
          if (success) set({ graph: get().graph });
          return success;
        },

        redo: () => {
          // Not implemented - would need redo stack
          return false;
        },
      }),
      {
        name: 'aegis-store',
        partialize: (state) => ({
          viewport: state.viewport,
          mode: state.mode,
          sidebarTab: state.sidebarTab,
          simulationSpeed: state.simulationSpeed,
        }),
      }
    )
  )
);

// Selectors for performance
export const selectGraph = (state: AppState) => state.graph;
export const selectSelectedNodes = (state: AppState) => state.selectedNodes;
export const selectSelectedEdges = (state: AppState) => state.selectedEdges;
export const selectViewport = (state: AppState) => state.viewport;
export const selectMode = (state: AppState) => state.mode;
// NOTE: React 19.2's useSyncExternalStore requires selector results to be
// referentially stable — object/array literals in selectors cause an infinite
// forceStoreRerender loop. Always select primitives (or use useShallow).
export const selectSidebarOpen = (state: AppState) => state.sidebarOpen;
export const selectSidebarTab = (state: AppState) => state.sidebarTab;
export const selectSimulationRunning = (state: AppState) => state.isSimulating;
export const selectSimulationSpeed = (state: AppState) => state.simulationSpeed;
export const selectSimulationTime = (state: AppState) => state.simulationTime;
export const selectEvents = (state: AppState) => state.eventLog;
export const selectAnalytics = (state: AppState) => state.analyticsResults;
export const selectCryptoQueue = (state: AppState) => state.cryptoMigrationQueue;
export const selectCryptoMigrating = (state: AppState) => state.isMigrating;
export const selectThreats = (state: AppState) => state.threatIntel;
export const selectCommandPaletteOpen = (state: AppState) => state.commandPaletteOpen;
export const selectCommandPaletteQuery = (state: AppState) => state.commandPaletteQuery;
export const selectHoverNode = (state: AppState) => state.hoverNode;
export const selectHoverEdge = (state: AppState) => state.hoverEdge;