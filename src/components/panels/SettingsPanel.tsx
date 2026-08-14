// AEGIS Settings Panel - Configuration & Preferences
// Zero-slop, comprehensive settings management

import React, { useState } from 'react';
import { useStore } from '../../store';
import { Download, Upload, RotateCcw, Trash2, Eye, EyeOff, Key, Shield, Network, Database, Cpu, Zap, Save as SaveIcon } from 'lucide-react';

export const SettingsPanel: React.FC = () => {
  const graph = useStore(state => state.graph);
  const viewport = useStore(state => state.viewport);
  const mode = useStore(state => state.mode);
  const simulationSpeed = useStore(state => state.simulationSpeed);
  const sidebarOpen = useStore(state => state.sidebarOpen);
  const sidebarTab = useStore(state => state.sidebarTab);
  const setViewport = useStore(state => state.setViewport);
  const setMode = useStore(state => state.setMode);
  const setSimulationSpeed = useStore(state => state.setSimulationSpeed);
  const toggleSidebar = useStore(state => state.toggleSidebar);
  const setSidebarTab = useStore(state => state.setSidebarTab);
  const saveSession = useStore(state => state.saveSession);
  const newSession = useStore(state => state.newSession);
  const loadSession = useStore(state => state.loadSession);
  const exportGraph = useStore(state => state.exportGraph);
  const undo = useStore(state => state.undo);

  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState('');

  const handleExport = () => {
    const data = exportGraph();
    const json = JSON.stringify(data, null, 2);
    setExportData(json);
    setShowExport(true);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        loadSession({ graph: data });
      } catch (err) {
        alert('Failed to import: Invalid JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveFile = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_session_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportData);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* General Settings */}
      <SettingsSection title="GENERAL" icon={Shield}>
        <SettingRow label="Sidebar" description="Show/hide sidebar panel">
          <button onClick={toggleSidebar} className={`btn ${sidebarOpen ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}>
            {sidebarOpen ? 'OPEN' : 'CLOSED'}
          </button>
        </SettingRow>
        <SettingRow label="Default Tab" description="Sidebar tab on startup">
          <select
            value={sidebarTab}
            onChange={e => setSidebarTab(e.target.value as any)}
            className="input px-2 py-1 text-xs w-auto"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
          >
            <option value="details">DETAILS</option>
            <option value="analytics">ANALYTICS</option>
            <option value="crypto">CRYPTO</option>
            <option value="threats">THREATS</option>
            <option value="settings">SETTINGS</option>
          </select>
        </SettingRow>
        <SettingRow label="Default Mode" description="Initial interaction mode">
          <select
            value={mode}
            onChange={e => setMode(e.target.value as any)}
            className="input px-2 py-1 text-xs w-auto"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
          >
            <option value="select">SELECT</option>
            <option value="pan">PAN</option>
            <option value="blast">BLAST</option>
            <option value="path">PATH</option>
            <option value="crypto">CRYPTO</option>
          </select>
        </SettingRow>
      </SettingsSection>

      {/* Viewport Settings */}
      <SettingsSection title="VIEWPORT" icon={Eye}>
        <SettingRow label="Zoom" description="Current zoom level">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.05"
              value={viewport.zoom}
              onChange={e => setViewport({ zoom: parseFloat(e.target.value) })}
              className="flex-1 h-1 bg-neutral-800 appearance-none rounded accent-accent"
            />
            <span className="text-neutral-300 font-mono w-16 text-right">{Math.round(viewport.zoom * 100)}%</span>
          </div>
        </SettingRow>
        <SettingRow label="Pan Position" description="Viewport offset">
          <div className="flex items-center gap-1">
            <span className="text-neutral-500 text-xs">X</span>
            <input
              type="number"
              value={Math.round(viewport.x)}
              onChange={e => setViewport({ x: parseFloat(e.target.value) })}
              className="input px-2 py-1 text-xs w-20"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
            />
            <span className="text-neutral-500 text-xs ml-2">Y</span>
            <input
              type="number"
              value={Math.round(viewport.y)}
              onChange={e => setViewport({ y: parseFloat(e.target.value) })}
              className="input px-2 py-1 text-xs w-20"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
            />
          </div>
        </SettingRow>
      </SettingsSection>

      {/* Simulation Settings */}
      <SettingsSection title="SIMULATION" icon={Zap}>
        <SettingRow label="Speed" description="Simulation speed multiplier">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={simulationSpeed}
              onChange={e => setSimulationSpeed(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-neutral-800 appearance-none rounded accent-accent"
            />
            <span className="text-neutral-300 font-mono w-16 text-right">{simulationSpeed.toFixed(1)}x</span>
          </div>
        </SettingRow>
      </SettingsSection>

      {/* Graph Management */}
      <SettingsSection title="GRAPH MANAGEMENT" icon={Network}>
        <div className="space-y-2">
          <button onClick={undo} className="btn btn-secondary w-full justify-start gap-2">
            <RotateCcw className="w-4 h-4" />
            UNDO LAST ACTION
          </button>
          <button onClick={newSession} className="btn btn-danger w-full justify-start gap-2">
            <Trash2 className="w-4 h-4" />
            NEW SESSION (CLEAR ALL)
          </button>
        </div>
      </SettingsSection>

      {/* Import/Export */}
      <SettingsSection title="IMPORT / EXPORT" icon={Database}>
        <div className="space-y-2">
          <button onClick={handleExport} className="btn btn-secondary w-full justify-start gap-2">
            <Download className="w-4 h-4" />
            EXPORT SESSION
          </button>
          <label className="btn btn-secondary w-full justify-start gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            IMPORT SESSION
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </SettingsSection>

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowExport(false)}>
          <div className="panel panel-elevated w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-neutral-700">
              <h3 className="font-medium text-neutral-100" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>EXPORT SESSION</h3>
              <button onClick={() => setShowExport(false)} className="btn btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              <pre className="text-neutral-300 whitespace-pre-wrap">{exportData}</pre>
            </div>
            <div className="flex items-center justify-end gap-2 p-3 border-t border-neutral-700">
              <button onClick={handleCopyExport} className="btn btn-secondary px-3 py-1.5 text-xs">
                <Copy className="w-3 h-3 mr-1" />
                COPY
              </button>
              <button onClick={handleSaveFile} className="btn btn-primary px-3 py-1.5 text-xs">
                <SaveIcon className="w-3 h-3 mr-1" />
                SAVE TO FILE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts */}
      <SettingsSection title="KEYBOARD SHORTCUTS" icon={Key}>
        <div className="space-y-1 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between py-1 border-b border-neutral-800/50">
              <span className="text-neutral-500">{s.desc}</span>
              <kbd className="kbd">{s.key}</kbd>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="ABOUT" icon={Cpu}>
        <div className="space-y-1 text-xs text-neutral-500" style={{ fontFamily: 'var(--font-mono)' }}>
          <div><span className="text-neutral-300">AEGIS</span> v0.1.0</div>
          <div>Agentic Attack Surface + PQC Crypto-Agility</div>
          <div className="pt-2 border-t border-neutral-800">
            Zero-slop. High-precision. Real algorithms.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};

const SHORTCUTS = [
  { key: 'V', desc: 'Select Mode' },
  { key: 'H', desc: 'Pan Mode' },
  { key: 'B', desc: 'Blast Radius Mode' },
  { key: 'P', desc: 'Path Mode' },
  { key: 'C', desc: 'Crypto Mode' },
  { key: 'Space', desc: 'Start/Stop Simulation' },
  { key: 'S', desc: 'Step Simulation' },
  { key: 'F', desc: 'Zoom to Fit' },
  { key: 'Z', desc: 'Recalculate Centrality' },
  { key: 'Ctrl+Z', desc: 'Undo' },
  { key: 'Ctrl+S', desc: 'Save Session' },
  { key: 'Ctrl+N', desc: 'New Session' },
  { key: 'Cmd+K', desc: 'Command Palette' },
  { key: 'Esc', desc: 'Close Panels/Deselect' },
];

interface SettingsSectionProps {
  title: string;
  icon: React.FC<{ className?: string }>;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ title, icon: Icon, children }) => (
  <div className="panel space-y-3">
    <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700">
      <Icon className="w-4 h-4 text-neutral-400" />
      <span className="text-neutral-500 text-xs uppercase tracking-wider">{title}</span>
    </div>
    <div className="px-3 pb-3">{children}</div>
  </div>
);

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="flex-1 min-w-0">
      <div className="text-neutral-100 text-xs">{label}</div>
      <div className="text-neutral-500 text-[9px] mt-0.5">{description}</div>
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const X = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const Copy = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const Save = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);