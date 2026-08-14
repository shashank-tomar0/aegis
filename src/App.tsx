// AEGIS Main Application Component
// Zero-slop, production-ready attack surface visualization

import React, { useEffect, useRef } from 'react';
import { GraphCanvas } from './components/graph/GraphCanvas';
import { Sidebar } from './components/panels/Sidebar';
import { CommandPalette } from './components/ui/CommandPalette';
import { useStore, selectViewport, selectMode, selectCommandPaletteOpen } from './store';
import { analyticsEngine } from './engine/analytics';
import { zkThreatIntel } from './engine/zkproof';
import { simRNG } from './engine/seedrandom';
import type { NodeKind, EdgeKind } from './types';
import { NodeKind as NK, EdgeKind as EK } from './types';
import { Plus, Trash2, Download, Upload, RotateCcw, Zap, Network, Database, Lock, Shield, Cpu, Search, Command } from 'lucide-react';

export const App: React.FC = () => {
  const viewport = useStore(selectViewport);
  const mode = useStore(selectMode);
  const isCommandPaletteOpen = useStore(selectCommandPaletteOpen);

  const graph = useStore((state: any) => state.graph);
  const addNode = useStore((state: any) => state.addNode);
  const addEdge = useStore((state: any) => state.addEdge);
  const removeNode = useStore((state: any) => state.removeNode);
  const setMode = useStore((state: any) => state.setMode);
  const zoomToFit = useStore((state: any) => state.zoomToFit);
  const calculateCentrality = useStore((state: any) => state.calculateCentrality);
  const startSimulation = useStore((state: any) => state.startSimulation);
  const stopSimulation = useStore((state: any) => state.stopSimulation);
  const stepSimulation = useStore((state: any) => state.stepSimulation);
  const saveSession = useStore((state: any) => state.saveSession);
  const newSession = useStore((state: any) => state.newSession);
  const undo = useStore((state: any) => state.undo);
  const openCommandPalette = useStore((state: any) => state.openCommandPalette);
  const setSidebarTab = useStore((state: any) => state.setSidebarTab);
  const sidebarOpen = useStore((state: any) => state.sidebarOpen);
  const toggleSidebar = useStore((state: any) => state.toggleSidebar);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize engines
  useEffect(() => {
    analyticsEngine.initialize().catch(console.error);
    // Seed RNG for reproducibility
    simRNG.setState(2916983006);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (true) {
        case e.key === ' ' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          useStore.getState().isSimulating ? stopSimulation() : startSimulation();
          break;
        case e.key === 'f' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          zoomToFit();
          break;
        case e.key === 'z' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          calculateCentrality();
          break;
        case e.key === 'b' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          setMode('blast');
          break;
        case e.key === 'p' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          setMode('path');
          break;
        case e.key === 'c' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          setMode('crypto');
          break;
        case e.key === 'v' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          setMode('select');
          break;
        case e.key === 'h' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          setMode('pan');
          break;
        case e.key === 's' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          stepSimulation();
          break;
        case e.key === 'a' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          addNode(NK.AGENT, `Agent-${Date.now().toString(36).slice(-4)}`);
          break;
        case e.key === 't' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          addNode(NK.TOOL, `Tool-${Date.now().toString(36).slice(-4)}`);
          break;
        case e.key === 'd' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          addNode(NK.DATA_SOURCE, `Data-${Date.now().toString(36).slice(-4)}`);
          break;
        case e.key === 'g' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          addNode(NK.GATEWAY, `Gateway-${Date.now().toString(36).slice(-4)}`);
          break;
        case e.key === 'e' && !e.ctrlKey && !e.metaKey:
          e.preventDefault();
          const sel = Array.from(useStore.getState().selectedNodes);
          if (sel.length >= 2) addEdge(sel[0], sel[1], EK.INVOCATION);
          break;
        case e.key === ',':
          setSidebarTab('settings');
          break;
        case e.key === '?':
          openCommandPalette();
          break;
        case (e.key === 'k' && (e.ctrlKey || e.metaKey)):
          e.preventDefault();
          openCommandPalette();
          break;
        case (e.key === 's' && (e.ctrlKey || e.metaKey)):
          e.preventDefault();
          saveSession();
          break;
        case (e.key === 'n' && (e.ctrlKey || e.metaKey)):
          e.preventDefault();
          newSession();
          break;
        case (e.key === 'z' && (e.ctrlKey || e.metaKey)):
          e.preventDefault();
          undo();
          break;
        case e.key === 'Escape':
          useStore.getState().clearSelection();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomToFit, calculateCentrality, setMode, startSimulation, stopSimulation, stepSimulation,
    addNode, addEdge, saveSession, newSession, undo, openCommandPalette, setSidebarTab]);

  // Simulation loop
  useEffect(() => {
    if (!useStore.getState().isSimulating) return;

    const interval = setInterval(() => {
      const state = useStore.getState();
      if (!state.isSimulating) {
        clearInterval(interval);
        return;
      }
      state.stepSimulation();
    }, 1000 / useStore.getState().simulationSpeed);

    return () => clearInterval(interval);
  }, [useStore.getState().isSimulating]);

  return (
    <div className="h-screen w-screen overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 border-b border-neutral-700"
        style={{ backgroundColor: 'var(--color-bg-elevated)', height: '40px' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="btn btn-ghost p-1.5"
            aria-label="Toggle sidebar"
          >
            <Network className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent)' }}>
              <Zap className="w-5 h-5" style={{ color: 'var(--color-bg)' }} />
            </div>
            <span className="font-bold text-neutral-100" style={{ fontFamily: 'var(--font-mono)', fontSize: '14px' }}>AEGIS</span>
            <span className="text-neutral-600 text-xs uppercase tracking-wider">v0.1.0</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Indicator */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-neutral-800/50 border border-neutral-700">
            <span className="text-neutral-500 text-xs uppercase tracking-wider">MODE</span>
            <span className="text-neutral-100 font-mono text-xs">{mode.toUpperCase()}</span>
          </div>

          {/* Simulation Status */}
          <SimulationIndicator />

          {/* Zoom */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded bg-neutral-800/50 border border-neutral-700">
            <span className="text-neutral-500 text-xs">ZOOM</span>
            <span className="text-neutral-300 font-mono text-xs">{Math.round(viewport.zoom * 100)}%</span>
          </div>

          {/* Command Palette Trigger */}
          <button
            onClick={openCommandPalette}
            className="btn btn-ghost p-2 relative"
            aria-label="Command palette (Ctrl+K)"
          >
            <Command className="w-5 h-5" />
            <kbd className="absolute -top-1 -right-1 kbd text-[8px]">Ctrl+K</kbd>
          </button>
        </div>
      </header>

      {/* Main Graph Area */}
      <main className="h-full w-full pt-10" ref={canvasRef}>
        <GraphCanvas width={viewport.width} height={viewport.height} />
      </main>

      {/* Sidebar */}
      <Sidebar />

      {/* Command Palette */}
      <CommandPalette />

      {/* Context Menu (placeholder) */}
      {/* Could add right-click context menu here */}
    </div>
  );
};

const SimulationIndicator: React.FC = () => {
  const isSimulating = useStore((state: any) => state.isSimulating);
  const simulationSpeed = useStore((state: any) => state.simulationSpeed);
  const simulationTime = useStore((state: any) => state.simulationTime);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-neutral-800/50 border border-neutral-700">
      <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-accent animate-pulse' : 'bg-neutral-600'}`} />
      <span className="text-neutral-500 text-xs uppercase tracking-wider">
        {isSimulating ? 'SIMULATING' : 'PAUSED'}
      </span>
      {isSimulating && (
        <>
          <span className="text-neutral-300 font-mono text-xs">{simulationSpeed.toFixed(1)}x</span>
          <span className="text-neutral-500 text-xs">t={simulationTime}</span>
        </>
      )}
    </div>
  );
};

// Initialize default graph with sample data
export function initializeDefaultGraph() {
  const store = useStore.getState();
  const graph = store.graph;

  // Clear existing
  for (const node of graph.getAllNodes()) {
    graph.removeNode(node.id);
  }

  // Create sample agentic system
  const gateway = graph.addNode(NK.GATEWAY, 'API Gateway', { description: 'External ingress point' }, { x: 200, y: 200 });
  const authAgent = graph.addNode(NK.AGENT, 'Auth Agent', { description: 'Authentication & authorization' }, { x: 400, y: 100 });
  const dataAgent = graph.addNode(NK.AGENT, 'Data Agent', { description: 'Data processing & queries' }, { x: 400, y: 300 });
  const toolAgent = graph.addNode(NK.AGENT, 'Tool Agent', { description: 'Tool orchestration' }, { x: 600, y: 200 });
  const userDb = graph.addNode(NK.DATA_SOURCE, 'User DB', { description: 'User credentials & profiles', sensitivity: 'high' }, { x: 200, y: 400 });
  const auditLog = graph.addNode(NK.DATA_SOURCE, 'Audit Log', { description: 'Security audit trail', sensitivity: 'critical' }, { x: 600, y: 400 });
  const secrets = graph.addNode(NK.DATA_SOURCE, 'Secrets Vault', { description: 'API keys & certificates', sensitivity: 'critical' }, { x: 800, y: 100 });
  const extApi = graph.addNode(NK.TOOL, 'External API', { description: 'Third-party service integration' }, { x: 800, y: 300 });
  const adminUser = graph.addNode(NK.USER, 'Admin User', { description: 'Privileged administrator' }, { x: 100, y: 200 });

  // Connect them
  graph.addEdge(adminUser, gateway, EK.INVOCATION, 1, { protocol: 'HTTPS' });
  graph.addEdge(gateway, authAgent, EK.INVOCATION, 1, { protocol: 'gRPC' });
  graph.addEdge(gateway, dataAgent, EK.INVOCATION, 1, { protocol: 'gRPC' });
  graph.addEdge(authAgent, userDb, EK.DATA_FLOW, 1, { operation: 'read' });
  graph.addEdge(authAgent, secrets, EK.PRIVILEGE, 0.8, { privilege: 'read_secrets' });
  graph.addEdge(dataAgent, userDb, EK.DATA_FLOW, 1, { operation: 'read/write' });
  graph.addEdge(dataAgent, auditLog, EK.DATA_FLOW, 1, { operation: 'write' });
  graph.addEdge(toolAgent, extApi, EK.INVOCATION, 0.7, { protocol: 'REST' });
  graph.addEdge(toolAgent, secrets, EK.PRIVILEGE, 0.5, { privilege: 'read_secrets' });
  graph.addEdge(gateway, toolAgent, EK.DELEGATION, 0.6, { scope: 'tool_execution' });

  // Set crypto profiles
  const cryptoProfiles = {
    [gateway]: { algorithm: 'ML-KEM-768' as any, keySize: 768, quantumResistance: 2, nistLevel: 3 },
    [authAgent]: { algorithm: 'ML-DSA-65' as any, keySize: 65, quantumResistance: 2, nistLevel: 3 },
    [dataAgent]: { algorithm: 'ECDSA-P256' as any, keySize: 256, quantumResistance: 1, nistLevel: 1 },
    [toolAgent]: { algorithm: 'RSA-4096' as any, keySize: 4096, quantumResistance: 0, nistLevel: 0 },
    [userDb]: { algorithm: 'ML-KEM-768' as any, keySize: 768, quantumResistance: 2, nistLevel: 3 },
    [auditLog]: { algorithm: 'ML-DSA-87' as any, keySize: 87, quantumResistance: 2, nistLevel: 5 },
    [secrets]: { algorithm: 'ML-KEM-1024' as any, keySize: 1024, quantumResistance: 2, nistLevel: 5 },
    [extApi]: { algorithm: 'ECDSA-P384' as any, keySize: 384, quantumResistance: 1, nistLevel: 2 },
    [adminUser]: { algorithm: 'Ed25519' as any, keySize: 256, quantumResistance: 1, nistLevel: 1 },
  };

  const now = Date.now();
  for (const [nodeId, profile] of Object.entries(cryptoProfiles)) {
    graph.setCryptoProfile(nodeId as any, {
      ...profile,
      migrationTarget: (profile.quantumResistance < 2 ? 'ML-KEM-768' : undefined) as any,
      migrationPriority: profile.quantumResistance < 2 ? 3 - profile.quantumResistance : 0,
      lastRotated: now - 86400000 * 30,
      expiresAt: now + 86400000 * 90,
      issuer: 'AEGIS CA',
      subject: profile.algorithm,
      fingerprint: `sha256:${Math.random().toString(36).slice(2, 18)}`,
    });
  }

  // Set initial risk scores
  graph.getNode(toolAgent)!.riskScore = 0.7;
  graph.getNode(toolAgent)!.severity = 3;
  graph.getNode(dataAgent)!.riskScore = 0.4;
  graph.getNode(dataAgent)!.severity = 2;

  // Calculate initial layout
  graph.stepLayout(50);

  // Trigger reactivity
  store.setViewport({ x: 1100 / 2 - 500, y: 800 / 2 - 300, zoom: 1 });
}