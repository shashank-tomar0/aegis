// AEGIS Discover Panel — accounts, workspaces, and real-world discovery
// Login/register → create/select project → run collectors → load the discovered
// graph into the canvas. Everything hits the real backend.

import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Plus, Trash2, Play, Download, RotateCcw, KeyRound } from 'lucide-react';

const inputCls = 'input mb-2';
const btnCls = 'btn w-full mb-2';

export const DiscoverPanel: React.FC = () => {
  const authUser = useStore(s => s.authUser);
  const authBusy = useStore(s => s.authBusy);
  const authError = useStore(s => s.authError);
  const projects = useStore(s => s.projects);
  const currentProjectId = useStore(s => s.currentProjectId);
  const collectors = useStore(s => s.collectors);
  const collectorLog = useStore(s => s.collectorLog);
  const discoveryBusy = useStore(s => s.discoveryBusy);
  const apiKeys = useStore(s => s.apiKeys);

  const refreshAuth = useStore(s => s.refreshAuth);
  const register = useStore(s => s.register);
  const login = useStore(s => s.login);
  const logout = useStore(s => s.logout);
  const refreshProjects = useStore(s => s.refreshProjects);
  const createProject = useStore(s => s.createProject);
  const deleteProject = useStore(s => s.deleteProject);
  const selectProject = useStore(s => s.selectProject);
  const refreshCollectors = useStore(s => s.refreshCollectors);
  const runCollector = useStore(s => s.runCollector);
  const refreshApiKeys = useStore(s => s.refreshApiKeys);
  const createApiKey = useStore(s => s.createApiKey);
  const revokeApiKey = useStore(s => s.revokeApiKey);
  const loadDiscoveredGraph = useStore(s => s.loadDiscoveredGraph);
  const clearProjectGraph = useStore(s => s.clearProjectGraph);
  const clearCollectorLog = useStore(s => s.clearCollectorLog);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [newProject, setNewProject] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [lastKey, setLastKey] = useState<string | null>(null);

  useEffect(() => { refreshAuth(); }, [refreshAuth]);
  useEffect(() => {
    if (!authUser) return;
    refreshProjects();
    refreshCollectors();
    refreshApiKeys();
  }, [authUser, refreshProjects, refreshCollectors, refreshApiKeys]);

  if (!authUser) {
    return (
      <div className="p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">ACCOUNT GATEWAY</span>
          <KeyRound className="w-3.5 h-3.5 text-neutral-500" />
        </div>
        <p className="text-neutral-500 text-[11px] leading-relaxed">
          Connect the console to a real account. Projects, scans, and API keys are stored on the server.
        </p>
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setAuthMode('login')}
            className={`btn flex-1 py-1 ${authMode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
          >LOGIN</button>
          <button
            onClick={() => setAuthMode('register')}
            className={`btn flex-1 py-1 ${authMode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
          >REGISTER</button>
        </div>
        <input
          className={inputCls} type="email" placeholder="email" value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className={inputCls} type="password" placeholder="password (min 8 chars)" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void (authMode === 'login' ? login(email, password) : register(email, password)); }}
        />
        {authError && <p className="text-red-400 text-[11px]">{authError}</p>}
        <button
          className={`${btnCls} btn-primary`}
          disabled={authBusy || !email || !password}
          onClick={() => void (authMode === 'login' ? login(email, password) : register(email, password))}
        >
          {authBusy ? '…' : authMode === 'login' ? 'LOGIN →' : 'CREATE ACCOUNT →'}
        </button>
      </div>
    );
  }

  const project = projects.find(p => p.id === currentProjectId) ?? null;

  return (
    <div className="p-3 space-y-4" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="min-w-0">
          <div className="text-neutral-300 text-[11px] truncate">{authUser.email}</div>
          <div className="text-neutral-600 text-[9px] uppercase tracking-wider">Authenticated</div>
        </div>
        <button onClick={() => void logout()} className="btn btn-secondary py-0.5 px-2" title="Logout">EXIT</button>
      </div>

      {/* Projects */}
      <div>
        <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-2">Projects</div>
        <div className="space-y-1 mb-2">
          {projects.length === 0 && <p className="text-neutral-600 text-[11px]">no projects yet — create one</p>}
          {projects.map(p => (
            <div key={p.id} className={`flex items-center gap-2 border px-2 py-1.5 cursor-pointer ${p.id === currentProjectId ? 'border-neutral-500 bg-neutral-900' : 'border-neutral-800 hover:border-neutral-600'}`} onClick={() => selectProject(p.id)}>
              <span className={`w-1.5 h-1.5 rounded-full ${p.id === currentProjectId ? 'bg-accent' : 'bg-neutral-700'}`} />
              <span className="flex-1 truncate text-neutral-300">{p.name}</span>
              <span className="text-neutral-600 text-[10px]">{p.counts.nodes}N/{p.counts.edges}E</span>
              <button
                title="Delete project"
                className="text-neutral-600 hover:text-red-400"
                onClick={e => { e.stopPropagation(); if (confirm(`Delete project "${p.name}"?`)) void deleteProject(p.id); }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            className="input flex-1" placeholder="new project name" value={newProject}
            onChange={e => setNewProject(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newProject.trim()) { void createProject(newProject.trim()); setNewProject(''); } }}
          />
          <button
            className="btn btn-secondary px-2"
            disabled={!newProject.trim()}
            onClick={() => { void createProject(newProject.trim()); setNewProject(''); }}
            title="Create project"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {project && (
          <div className="flex gap-1 mt-2">
            <button className="btn btn-primary flex-1 py-1.5" disabled={discoveryBusy} onClick={() => void loadDiscoveredGraph()}>
              <Download className="w-3 h-3" /> LOAD GRAPH
            </button>
            <button className="btn btn-secondary px-2" disabled={discoveryBusy} onClick={() => void clearProjectGraph()} title="Clear project graph on server">
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Collectors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Discovery collectors</span>
          <button className="btn btn-ghost p-0.5" onClick={() => void refreshCollectors()} title="Refresh status">
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
        {!project && <p className="text-neutral-600 text-[11px]">select a project to run collectors</p>}
        <div className="space-y-1.5">
          {collectors.map(c => (
            <div key={c.name} className="border border-neutral-800 p-2">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${c.running ? 'bg-warning animate-pulse' : c.available ? 'bg-accent' : 'bg-red-500'}`} />
                <span className="text-neutral-300 uppercase">{c.name}</span>
                {c.simulated && <span className="badge badge-warning text-[8px]">SIMULATED</span>}
                <span className="ml-auto text-[10px] text-neutral-600">
                  {c.running ? 'RUNNING…' : c.lastRun ? `last: ${c.lastRun.found} · ${new Date(c.lastRun.at).toLocaleTimeString()}` : 'never run'}
                </span>
              </div>
              <p className="text-neutral-600 text-[10px] mt-1 leading-relaxed">{c.description}</p>
              {!c.available && c.note && <p className="text-neutral-600 text-[10px] mt-1">⚠ {c.note}</p>}
              <button
                className="btn btn-secondary w-full mt-1.5 py-1"
                disabled={discoveryBusy || !project || c.running || !c.available}
                onClick={() => void runCollector(c.name)}
              >
                <Play className="w-3 h-3" /> RUN
              </button>
            </div>
          ))}
        </div>

        {/* Collector log */}
        <div className="mt-2 border border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between px-2 py-1 border-b border-neutral-800">
            <span className="text-neutral-600 text-[9px] uppercase tracking-wider">Run log</span>
            <button className="btn btn-ghost p-0.5" onClick={clearCollectorLog} title="Clear log">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto px-2 py-1.5 text-[10px] leading-relaxed">
            {collectorLog.length === 0 && <span className="text-neutral-700">— idle —</span>}
            {collectorLog.map((line, i) => (
              <div key={i} className={line.startsWith('✓') ? 'text-accent' : line.startsWith('✗') || line.startsWith('⚠') ? 'text-warning' : 'text-neutral-500'}>{line}</div>
            ))}
          </div>
        </div>
      </div>

      {/* API keys */}
      <div>
        <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-2">API keys</div>
        <div className="flex gap-1">
          <input
            className="input flex-1" placeholder="key name (e.g. ci-runner)" value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newKeyName.trim()) { void createApiKey(newKeyName.trim()).then(k => { if (k) { setLastKey(k); setNewKeyName(''); } }); } }}
          />
          <button
            className="btn btn-secondary px-2"
            disabled={!newKeyName.trim()}
            onClick={() => { void createApiKey(newKeyName.trim()).then(k => { if (k) { setLastKey(k); setNewKeyName(''); } }); }}
            title="Create API key"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
        </div>
        {lastKey && (
          <div className="mt-2 border border-accent/50 p-2 text-[10px] leading-relaxed">
            <div className="text-accent uppercase tracking-wider mb-1">Key created — copy now, shown once</div>
            <div className="text-neutral-300 break-all select-all">{lastKey}</div>
            <button className="btn btn-ghost p-0.5 mt-1" onClick={() => setLastKey(null)}>dismiss</button>
          </div>
        )}
        <div className="mt-2 space-y-1">
          {apiKeys.map(k => (
            <div key={k.id} className="flex items-center gap-2 border border-neutral-800 px-2 py-1">
              <span className={`flex-1 truncate ${k.revoked ? 'line-through text-neutral-600' : 'text-neutral-300'}`}>{k.name}</span>
              <span className="text-neutral-600 text-[10px]">{k.prefix}…</span>
              {!k.revoked && (
                <button className="text-neutral-600 hover:text-red-400" title="Revoke" onClick={() => void revokeApiKey(k.id)}>
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {apiKeys.length === 0 && <p className="text-neutral-600 text-[11px]">no keys — used by the CLI / CI</p>}
        </div>
        {authError && <p className="text-red-400 text-[11px] mt-2">{authError}</p>}
      </div>
    </div>
  );
};