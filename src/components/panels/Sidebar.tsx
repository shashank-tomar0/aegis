// AEGIS Sidebar - Main navigation and control panel
// Zero-slop, dense information architecture

import React, { useState } from 'react';
import { useStore, selectSidebarOpen, selectSidebarTab, selectMode, selectSimulationRunning, selectSimulationSpeed, selectSimulationTime, selectGraph, selectViewport } from '../../store';
import { NodeDetailPanel } from './NodeDetailPanel';
import { TopologyPanel } from './TopologyPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { CryptoPanel } from './CryptoPanel';
import { ThreatsPanel } from './ThreatsPanel';
import { EventLogPanel } from './EventLogPanel';
import { ServerPanel } from './ServerPanel';
import { SettingsPanel } from './SettingsPanel';
import { ChevronLeft, ChevronRight, Cpu, Network, Database, Activity, Lock, Shield, Settings, Play, Pause, RotateCcw, Maximize, Minimize, Zap, Download, Terminal, Server } from 'lucide-react';

const TABS = [
  { id: 'topology', label: 'TOPOLOGY', icon: Network },
  { id: 'details', label: 'DETAILS', icon: Cpu },
  { id: 'events', label: 'EVENTS', icon: Terminal },
  { id: 'analytics', label: 'ANALYTICS', icon: Activity },
  { id: 'crypto', label: 'CRYPTO', icon: Lock },
  { id: 'threats', label: 'THREATS', icon: Shield },
  { id: 'server', label: 'SERVER', icon: Server },
  { id: 'settings', label: 'SETTINGS', icon: Settings },
] as const;

// Export for store type references
export type SidebarTabId = (typeof TABS)[number]['id'];

export const Sidebar: React.FC = () => {
  const open = useStore(selectSidebarOpen);
  const tab = useStore(selectSidebarTab);
  const mode = useStore(selectMode);
  const simulationIsRunning = useStore(selectSimulationRunning);
  const simulationSpeed = useStore(selectSimulationSpeed);
  const simulationTime = useStore(selectSimulationTime);
  const graph = useStore(selectGraph);
  const viewport = useStore(selectViewport);
  const toggleSidebar = useStore(state => state.toggleSidebar);
  const setSidebarTab = useStore(state => state.setSidebarTab);
  const setMode = useStore(state => state.setMode);
  const startSimulation = useStore(state => state.startSimulation);
  const stopSimulation = useStore(state => state.stopSimulation);
  const stepSimulation = useStore(state => state.stepSimulation);
  const setSimulationSpeed = useStore(state => state.setSimulationSpeed);
  const zoomToFit = useStore(state => state.zoomToFit);
  const calculateCentrality = useStore(state => state.calculateCentrality);
  const newSession = useStore(state => state.newSession);
  const saveSession = useStore(state => state.saveSession);
  const undo = useStore(state => state.undo);

  const [collapsed, setCollapsed] = useState(!open);

  // Render active panel
  const renderPanel = () => {
    switch (tab) {
      case 'topology': return <TopologyPanel />;
      case 'details': return <NodeDetailPanel />;
      case 'events': return <EventLogPanel />;
      case 'analytics': return <AnalyticsPanel />;
      case 'crypto': return <CryptoPanel />;
      case 'threats': return <ThreatsPanel />;
      case 'server': return <ServerPanel />;
      case 'settings': return <SettingsPanel />;
      default: return <TopologyPanel />;
    }
  };

  return (
    <>
      {/* Sidebar Toggle Button (when collapsed) */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 btn btn-secondary rounded-r-lg border-l-0"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-30 flex flex-col transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-96'
        } panel border-r border-neutral-700`}
        style={{ backgroundColor: 'var(--color-bg-elevated)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-neutral-700">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent)' }}>
                <Zap className="w-5 h-5" style={{ color: 'var(--color-bg)' }} />
              </div>
              <span className="font-bold text-neutral-100" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>AEGIS</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn btn-ghost p-1.5"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Mode Selector */}
        {!collapsed && (
          <div className="p-3 space-y-2 border-b border-neutral-700">
            <div className="text-neutral-500 text-xs uppercase tracking-wider">MODE</div>
            <div className="grid grid-cols-2 gap-1">
              {(['select', 'pan', 'blast', 'path', 'crypto'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'} py-1.5 text-xs`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Simulation Controls */}
        {!collapsed && (
          <div className="p-3 space-y-2 border-b border-neutral-700">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 text-xs uppercase tracking-wider">SIMULATION</span>
              <span className={`badge ${simulationIsRunning ? 'badge-accent' : 'badge-neutral'} text-[9px]`}>
                {simulationIsRunning ? 'RUNNING' : 'PAUSED'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={simulationIsRunning ? stopSimulation : startSimulation}
                className={`btn ${simulationIsRunning ? 'btn-danger' : 'btn-primary'} flex-1 justify-center py-1.5`}
              >
                {simulationIsRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span className="ml-1">{simulationIsRunning ? 'STOP' : 'START'}</span>
              </button>
              <button
                onClick={stepSimulation}
                disabled={simulationIsRunning}
                className="btn btn-secondary py-1.5"
                title="Step"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">SPEED</span>
                <span className="text-neutral-300 font-mono">{simulationSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={simulationSpeed}
                onChange={e => setSimulationSpeed(parseFloat(e.target.value))}
                className="w-full h-1 bg-neutral-800 appearance-none rounded accent-accent"
              />
              <div className="text-neutral-500 text-xs">Time: {simulationTime}</div>
            </div>
          </div>
        )}

        {/* Graph Stats */}
        {!collapsed && (
          <div className="p-3 space-y-1 border-b border-neutral-700" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
            <div className="text-neutral-500 text-xs uppercase tracking-wider">GRAPH STATS</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat key="nodes" label="NODES" value={graph.getAllNodes().length} />
              <Stat key="edges" label="EDGES" value={graph.getAllEdges().length} />
              <Stat key="agents" label="AGENTS" value={graph.getAllNodes().filter(n => n.kind === 'agent').length} />
              <Stat key="tools" label="TOOLS" value={graph.getAllNodes().filter(n => n.kind === 'tool').length} />
              <Stat key="data" label="DATA" value={graph.getAllNodes().filter(n => n.kind === 'data_source').length} />
              <Stat key="comp" label="COMPROMISED" value={graph.getAllNodes().filter(n => n.isCompromised).length} variant="danger" />
              <Stat key="quar" label="QUARANTINED" value={graph.getAllNodes().filter(n => n.isQuarantined).length} variant="warning" />
              <Stat key="zoom" label="ZOOM" value={`${Math.round(viewport.zoom * 100)}%`} />
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex-1 overflow-y-auto p-2">
          {!collapsed ? (
            <div className="space-y-1" role="tablist">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setSidebarTab(id)}
                  role="tab"
                  aria-selected={tab === id}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left transition-colors ${
                    tab === id
                      ? 'bg-neutral-800 border-l-2 border-accent text-neutral-100'
                      : 'text-neutral-500 hover:bg-neutral-800/50 hover:text-neutral-200'
                  }`}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2" role="tablist">
              {TABS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setSidebarTab(id); setCollapsed(false); }}
                  role="tab"
                  aria-selected={tab === id}
                  className={`p-2 rounded transition-colors ${
                    tab === id
                      ? 'bg-neutral-800 text-accent'
                      : 'text-neutral-500 hover:bg-neutral-800/50 hover:text-neutral-200'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active Panel Content */}
        {!collapsed && (
          <div className="flex-1 min-h-0 border-t border-neutral-700">
            {renderPanel()}
          </div>
        )}

        {/* Footer Actions */}
        {!collapsed && (
          <div className="p-3 space-y-1 border-t border-neutral-700">
            <button onClick={zoomToFit} className="btn btn-secondary w-full justify-start gap-2 py-1.5 text-xs">
              <Maximize className="w-4 h-4" />
              ZOOM TO FIT
            </button>
            <button onClick={calculateCentrality} className="btn btn-secondary w-full justify-start gap-2 py-1.5 text-xs">
              <Activity className="w-4 h-4" />
              RECALCULATE CENTRALITY
            </button>
            <button onClick={undo} className="btn btn-ghost w-full justify-start gap-2 py-1.5 text-xs">
              <RotateCcw className="w-4 h-4" />
              UNDO
            </button>
            <button onClick={saveSession} className="btn btn-secondary w-full justify-start gap-2 py-1.5 text-xs">
              <Download className="w-4 h-4" />
              SAVE SESSION
            </button>
            <button onClick={newSession} className="btn btn-danger w-full justify-start gap-2 py-1.5 text-xs">
              <RotateCcw className="w-4 h-4" />
              NEW SESSION
            </button>
          </div>
        )}

        {/* Collapsed footer */}
        {collapsed && (
          <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-neutral-700">
            <button onClick={newSession} className="btn btn-danger w-full justify-center py-1.5" title="New Session">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

const Stat: React.FC<{ label: string; value: number | string; variant?: 'danger' | 'warning' }> = ({
  label, value, variant,
}) => (
  <div className="text-center p-1.5 rounded bg-neutral-800/50">
    <div className={`font-mono font-bold ${variant === 'danger' ? 'text-danger' : variant === 'warning' ? 'text-warning' : 'text-neutral-100'}`}>
      {value}
    </div>
    <div className="text-neutral-500 text-[9px] uppercase">{label}</div>
  </div>
);