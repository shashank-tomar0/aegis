// AEGIS Command Palette - Keyboard-driven command interface
// Zero-slop, fuzzy search with categorized commands

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useStore, selectCommandPaletteOpen, selectCommandPaletteQuery } from '../../store';
import type { CommandPaletteItem } from '../../types';
import { NodeKind as NK, EdgeKind as EK } from '../../types';
import { Search, ChevronRight, Zap, Network, Database, Lock, Shield, Cpu, RotateCcw, Download, Upload, Maximize, Minimize, Activity, Key, Plus, X, Trash2 } from 'lucide-react';

const COMMANDS: CommandPaletteItem[] = [
  // Graph Operations
  { id: 'add-agent', label: 'Add Agent Node', description: 'Create a new agent node', shortcut: 'A', action: () => {}, category: 'Graph', keywords: ['add', 'agent', 'node', 'create'] },
  { id: 'add-tool', label: 'Add Tool Node', description: 'Create a new tool node', shortcut: 'T', action: () => {}, category: 'Graph', keywords: ['add', 'tool', 'node', 'create'] },
  { id: 'add-data', label: 'Add Data Source', description: 'Create a new data source node', shortcut: 'D', action: () => {}, category: 'Graph', keywords: ['add', 'data', 'source', 'node', 'create'] },
  { id: 'add-gateway', label: 'Add Gateway', description: 'Create a new gateway node', shortcut: 'G', action: () => {}, category: 'Graph', keywords: ['add', 'gateway', 'node', 'create'] },
  { id: 'connect', label: 'Connect Selected', description: 'Create edge between selected nodes', shortcut: 'E', action: () => {}, category: 'Graph', keywords: ['connect', 'edge', 'link', 'nodes'] },
  { id: 'delete-selected', label: 'Delete Selected', description: 'Remove selected nodes/edges', shortcut: 'Del', action: () => {}, category: 'Graph', keywords: ['delete', 'remove', 'selected'] },

  // View Operations
  { id: 'zoom-fit', label: 'Zoom to Fit', description: 'Fit all nodes in viewport', shortcut: 'F', action: () => {}, category: 'View', keywords: ['zoom', 'fit', 'viewport', 'center'] },
  { id: 'zoom-selected', label: 'Zoom to Selection', description: 'Center on selected nodes', shortcut: 'Z', action: () => {}, category: 'View', keywords: ['zoom', 'selection', 'center', 'focus'] },
  { id: 'toggle-grid', label: 'Toggle Grid', description: 'Show/hide background grid', shortcut: '', action: () => {}, category: 'View', keywords: ['grid', 'background', 'toggle'] },
  { id: 'reset-view', label: 'Reset View', description: 'Reset viewport to default', shortcut: '', action: () => {}, category: 'View', keywords: ['reset', 'viewport', 'default'] },

  // Analysis
  { id: 'blast-radius', label: 'Calculate Blast Radius', description: 'Compute blast radius from selected node', shortcut: 'B', action: () => {}, category: 'Analysis', keywords: ['blast', 'radius', 'reachability', 'impact'] },
  { id: 'centrality', label: 'Recalculate Centrality', description: 'Compute betweenness centrality', shortcut: 'C', action: () => {}, category: 'Analysis', keywords: ['centrality', 'betweenness', 'compute', 'analysis'] },
  { id: 'attack-paths', label: 'Find Attack Paths', description: 'Discover critical attack paths', shortcut: '', action: () => {}, category: 'Analysis', keywords: ['attack', 'paths', 'critical', 'find'] },
  { id: 'risk-assessment', label: 'Full Risk Assessment', description: 'Run complete risk analysis', shortcut: '', action: () => {}, category: 'Analysis', keywords: ['risk', 'assessment', 'full', 'complete'] },

  // Crypto
  { id: 'crypto-inventory', label: 'Show Crypto Inventory', description: 'Display cryptographic algorithm inventory', shortcut: '', action: () => {}, category: 'Crypto', keywords: ['crypto', 'inventory', 'algorithms', 'keys'] },
  { id: 'queue-migration', label: 'Queue Crypto Migration', description: 'Queue PQC migration for selected', shortcut: '', action: () => {}, category: 'Crypto', keywords: ['migration', 'pqc', 'quantum', 'queue'] },
  { id: 'process-migrations', label: 'Process Migrations', description: 'Execute all queued migrations', shortcut: '', action: () => {}, category: 'Crypto', keywords: ['process', 'execute', 'migrations', 'run'] },
  { id: 'rotate-keys', label: 'Rotate Keys', description: 'Rotate keys on selected nodes', shortcut: '', action: () => {}, category: 'Crypto', keywords: ['rotate', 'keys', 'key-rotation'] },

  // Threats
  { id: 'share-intel', label: 'Share Threat Intel', description: 'Share indicators with ZK privacy', shortcut: '', action: () => {}, category: 'Threats', keywords: ['share', 'threat', 'intel', 'zk', 'privacy'] },
  { id: 'verify-intel', label: 'Verify Threat Intel', description: 'Verify ZK proofs on shared intel', shortcut: '', action: () => {}, category: 'Threats', keywords: ['verify', 'zk', 'proof', 'threat'] },

  // Simulation
  { id: 'start-sim', label: 'Start Simulation', description: 'Begin attack simulation', shortcut: 'Space', action: () => {}, category: 'Simulation', keywords: ['start', 'simulation', 'run', 'play'] },
  { id: 'stop-sim', label: 'Stop Simulation', description: 'Stop attack simulation', shortcut: 'Space', action: () => {}, category: 'Simulation', keywords: ['stop', 'simulation', 'pause'] },
  { id: 'step-sim', label: 'Step Simulation', description: 'Single simulation step', shortcut: 'S', action: () => {}, category: 'Simulation', keywords: ['step', 'simulation', 'single', 'tick'] },

  // Session
  { id: 'save-session', label: 'Save Session', description: 'Save current session to storage', shortcut: 'Ctrl+S', action: () => {}, category: 'Session', keywords: ['save', 'session', 'persist', 'storage'] },
  { id: 'new-session', label: 'New Session', description: 'Start fresh session', shortcut: 'Ctrl+N', action: () => {}, category: 'Session', keywords: ['new', 'session', 'clear', 'reset'] },
  { id: 'export-session', label: 'Export Session', description: 'Export session as JSON file', shortcut: '', action: () => {}, category: 'Session', keywords: ['export', 'session', 'json', 'file'] },
  { id: 'import-session', label: 'Import Session', description: 'Import session from JSON file', shortcut: '', action: () => {}, category: 'Session', keywords: ['import', 'session', 'json', 'file', 'load'] },
  { id: 'undo', label: 'Undo', description: 'Undo last action', shortcut: 'Ctrl+Z', action: () => {}, category: 'Session', keywords: ['undo', 'revert', 'back'] },

  // Settings
  { id: 'settings', label: 'Open Settings', description: 'Open settings panel', shortcut: ',', action: () => {}, category: 'Settings', keywords: ['settings', 'preferences', 'config'] },
  { id: 'shortcuts', label: 'Show Shortcuts', description: 'Display keyboard shortcuts', shortcut: '?', action: () => {}, category: 'Settings', keywords: ['shortcuts', 'keys', 'keyboard', 'help'] },
];

// Simple fuzzy matching
function fuzzyMatch(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 1;
  let score = 0;
  let qIdx = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      score++;
      qIdx++;
    }
  }
  return score / q.length;
}

export const CommandPalette: React.FC = () => {
  const isOpen = useStore(selectCommandPaletteOpen);
  const query = useStore(selectCommandPaletteQuery);
  const setQuery = useStore(state => state.setCommandPaletteQuery);
  const closeCommandPalette = useStore(state => state.closeCommandPalette);
  const graph = useStore(state => state.graph);
  const selectedNodes = useStore(state => state.selectedNodes);
  const addNode = useStore(state => state.addNode);
  const addEdge = useStore(state => state.addEdge);
  const removeNode = useStore(state => state.removeNode);
  const zoomToFit = useStore(state => state.zoomToFit);
  const calculateCentrality = useStore(state => state.calculateCentrality);
  const startSimulation = useStore(state => state.startSimulation);
  const stopSimulation = useStore(state => state.stopSimulation);
  const stepSimulation = useStore(state => state.stepSimulation);
  const saveSession = useStore(state => state.saveSession);
  const newSession = useStore(state => state.newSession);
  const undo = useStore(state => state.undo);
  const setMode = useStore(state => state.setMode);
  const setSidebarTab = useStore(state => state.setSidebarTab);
  const sidebarOpen = useStore(state => state.sidebarOpen);

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Bind commands to actual actions
  const commandsWithActions = useMemo(() => COMMANDS.map(cmd => ({
    ...cmd,
    action: () => {
      executeCommand(cmd.id);
      closeCommandPalette();
    }
  })), [graph, selectedNodes, addNode, addEdge, removeNode, zoomToFit, calculateCentrality,
    startSimulation, stopSimulation, stepSimulation, saveSession, newSession, undo,
    setMode, setSidebarTab, sidebarOpen, closeCommandPalette]);

  const executeCommand = (id: string) => {
    switch (id) {
      case 'add-agent':
        addNode(NK.AGENT, `Agent-${Date.now().toString(36).slice(-4)}`);
        break;
      case 'add-tool':
        addNode(NK.TOOL, `Tool-${Date.now().toString(36).slice(-4)}`);
        break;
      case 'add-data':
        addNode(NK.DATA_SOURCE, `Data-${Date.now().toString(36).slice(-4)}`);
        break;
      case 'add-gateway':
        addNode(NK.GATEWAY, `Gateway-${Date.now().toString(36).slice(-4)}`);
        break;
      case 'connect': {
        const sel = Array.from(selectedNodes);
        if (sel.length >= 2) addEdge(sel[0], sel[1], EK.INVOCATION);
        break;
      }
      case 'delete-selected':
        for (const id of selectedNodes) removeNode(id);
        break;
      case 'zoom-fit':
        zoomToFit();
        break;
      case 'centrality':
        calculateCentrality();
        break;
      case 'start-sim':
        startSimulation();
        break;
      case 'stop-sim':
        stopSimulation();
        break;
      case 'step-sim':
        stepSimulation();
        break;
      case 'save-session':
        saveSession();
        break;
      case 'new-session':
        newSession();
        break;
      case 'undo':
        undo();
        break;
      case 'settings':
        setSidebarTab('settings');
        break;
      default:
        break;
    }
  };

  const filteredCommands = useMemo(() => {
    if (!query) return commandsWithActions;
    return commandsWithActions
      .map(cmd => ({
        ...cmd,
        score: fuzzyMatch(query, `${cmd.label} ${cmd.description} ${cmd.category} ${cmd.keywords.join(' ')}`)
      }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query, commandsWithActions]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        closeCommandPalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filteredCommands[selectedIndex]?.action();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, closeCommandPalette]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={closeCommandPalette}>
      <div className="bg-black/60 w-full" onClick={closeCommandPalette} />
      <div className="panel panel-elevated w-full max-w-2xl max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b border-neutral-700">
          <Search className="w-5 h-5 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent border-none outline-none text-neutral-100 placeholder-neutral-500"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
            autoFocus
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              No commands match "{query}"
            </div>
          ) : (
            <div className="p-2 space-y-1" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors ${
                    idx === selectedIndex
                      ? 'bg-neutral-800 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-100'
                  }`}
                >
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-neutral-800 flex-shrink-0">
                    {CATEGORY_ICONS[cmd.category]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{cmd.label}</span>
                      {cmd.shortcut && <kbd className="kbd ml-auto">{cmd.shortcut}</kbd>}
                    </div>
                    <div className="text-neutral-500 text-xs truncate">{cmd.description}</div>
                  </div>
                  <span className="text-neutral-600 text-[9px] uppercase tracking-wider">{cmd.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-neutral-700 text-neutral-500 text-xs text-center" style={{ fontFamily: 'var(--font-mono)' }}>
          {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''} • ↑��� navigate • Enter execute • Esc close
        </div>
      </div>
    </div>
  );
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Graph: <Network className="w-3 h-3" />,
  View: <Maximize className="w-3 h-3" />,
  Analysis: <Activity className="w-3 h-3" />,
  Crypto: <Lock className="w-3 h-3" />,
  Threats: <Shield className="w-3 h-3" />,
  Simulation: <Zap className="w-3 h-3" />,
  Session: <Database className="w-3 h-3" />,
  Settings: <Key className="w-3 h-3" />,
};