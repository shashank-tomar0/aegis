// AEGIS Monitor Panel — continuous attack-surface monitoring
// Alerts (rule engine), scan history, run-to-run diff, and scheduled scans.
// Live alerts stream in over SSE — no polling.

import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { SERVER_HOST } from '../../lib/api';
import type { AlertInfo } from '../../lib/api';
import { Activity, RotateCcw, Zap } from 'lucide-react';

// self-healing on fresh loads: restore the session and workspace selection
export const useMonitorBootstrap = () => {
  const refreshAuth = useStore(s => s.refreshAuth);
  const refreshProjects = useStore(s => s.refreshProjects);
  useEffect(() => { refreshAuth(); }, [refreshAuth]);
  const authUser = useStore(s => s.authUser);
  useEffect(() => { if (authUser) refreshProjects(); }, [authUser, refreshProjects]);
};

const SEV_COLOR: Record<string, string> = {
  critical: 'text-red-400 border-red-500/60',
  high: 'text-orange-400 border-orange-500/60',
  medium: 'text-amber-400 border-amber-500/60',
  low: 'text-zinc-500 border-zinc-700',
};

export const MonitorPanel: React.FC = () => {
  const authUser = useStore(s => s.authUser);
  const currentProjectId = useStore(s => s.currentProjectId);
  const projects = useStore(s => s.projects);
  const alerts = useStore(s => s.alerts);
  const scans = useStore(s => s.scans);
  const diff = useStore(s => s.diff);
  const schedules = useStore(s => s.schedules);
  const collectors = useStore(s => s.collectors);
  const monitoringBusy = useStore(s => s.monitoringBusy);

  const refreshAlerts = useStore(s => s.refreshAlerts);
  const markAlertsSeen = useStore(s => s.markAlertsSeen);
  const refreshScans = useStore(s => s.refreshScans);
  const refreshDiff = useStore(s => s.refreshDiff);
  const refreshSchedule = useStore(s => s.refreshSchedule);
  const setProjectSchedule = useStore(s => s.setProjectSchedule);
  const pushLiveAlert = useStore(s => s.pushLiveAlert);

  const [live, setLive] = useState(false);
  const [scheduleVals, setScheduleVals] = useState<Record<string, string>>({});

  const project = projects.find(p => p.id === currentProjectId) ?? null;

  useMonitorBootstrap();

  useEffect(() => {
    if (!authUser || !currentProjectId) return;
    refreshAlerts();
    refreshScans();
    refreshDiff();
    refreshSchedule();
  }, [authUser, currentProjectId, refreshAlerts, refreshScans, refreshDiff, refreshSchedule]);

  // Live SSE alert feed
  useEffect(() => {
    if (!authUser || !currentProjectId) return;
    const es = new EventSource(`${SERVER_HOST}/api/projects/${currentProjectId}/stream`, { withCredentials: true });
    const onAlert = (e: MessageEvent) => {
      try { pushLiveAlert(JSON.parse(e.data) as AlertInfo); } catch { /* ignore */ }
    };
    es.addEventListener('alert', onAlert);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    return () => { es.close(); setLive(false); };
  }, [authUser, currentProjectId, pushLiveAlert]);

  useEffect(() => {
    if (schedules.length === 0) return;
    setScheduleVals(prev => {
      const next = { ...prev };
      for (const s of schedules) next[s.collector] = String(s.everyMinutes);
      return next;
    });
  }, [schedules]);

  if (!authUser) return <div className="p-3 text-neutral-500 text-[11px]">Authenticate in the DISCOVER tab first.</div>;
  if (!project) return <div className="p-3 text-neutral-500 text-[11px]">Create / select a project to monitor.</div>;

  const unread = alerts.filter(a => !a.seen).length;

  return (
    <div className="p-3 space-y-4" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="min-w-0">
          <div className="text-neutral-300 text-[11px] truncate">{project.name}</div>
          <div className="text-neutral-600 text-[9px] uppercase tracking-wider">Continuous monitoring</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-[9px] ${live ? 'text-accent' : 'text-neutral-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-accent animate-pulse' : 'bg-neutral-700'}`} />
            {live ? 'LIVE' : 'OFFLINE'}
          </span>
          <button className="btn btn-ghost p-1" title="Refresh all" onClick={() => { refreshAlerts(); refreshScans(); refreshDiff(); refreshSchedule(); }}>
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Alerts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">Alerts {unread > 0 && <span className="text-alert">· {unread} NEW</span>}</span>
          <button className="btn btn-ghost p-0.5 text-[9px]" onClick={() => void markAlertsSeen()} disabled={unread === 0}>
            MARK SEEN
          </button>
        </div>
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
          {alerts.length === 0 && <p className="text-neutral-600 text-[11px]">no alerts yet — run a collector to establish a baseline</p>}
          {alerts.map(a => (
            <div key={a.id} className={`border-l-2 px-2 py-1.5 ${SEV_COLOR[a.severity] ?? 'border-zinc-700'} ${a.seen ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-neutral-300 truncate flex-1">{a.title}</span>
                <span className="text-[9px] text-neutral-600 uppercase">{a.severity}</span>
              </div>
              <div className="text-neutral-600 text-[10px] mt-0.5 leading-relaxed">{a.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scan history */}
      <div>
        <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-2">Scan history</div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {scans.length === 0 && <p className="text-neutral-600 text-[11px]">no scans yet</p>}
          {scans.map(s => (
            <div key={s.id} className="flex items-center gap-2 border border-neutral-800 px-2 py-1">
              <span className="text-neutral-300 uppercase flex-1">{s.collector}</span>
              {s.simulated === 1 && <span className="badge badge-warning text-[8px]">SIM</span>}
              <span className="text-neutral-500 text-[10px]">{s.found} items</span>
              <span className="text-neutral-600 text-[10px]">{s.ms}ms</span>
              <span className="text-neutral-600 text-[9px]">{new Date(s.ranAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Diff */}
      <div>
        <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-2">Change detection (last two runs)</div>
        {!diff || !diff.hasHistory ? (
          <p className="text-neutral-600 text-[11px]">run the same collector twice to compute a diff</p>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 border border-accent/40 p-2">
              <div className="text-accent text-[9px] uppercase tracking-wider mb-1">+ added</div>
              {diff.added.length === 0 && <div className="text-neutral-600 text-[10px]">—</div>}
              {diff.added.slice(0, 6).map(x => <div key={x.id} className="text-neutral-300 text-[10px] truncate">{x.label}</div>)}
              {diff.added.length > 6 && <div className="text-neutral-600 text-[9px]">+{diff.added.length - 6} more</div>}
            </div>
            <div className="flex-1 border border-red-500/40 p-2">
              <div className="text-red-400 text-[9px] uppercase tracking-wider mb-1">− removed</div>
              {diff.removed.length === 0 && <div className="text-neutral-600 text-[10px]">—</div>}
              {diff.removed.slice(0, 6).map(x => <div key={x.id} className="text-neutral-300 text-[10px] truncate">{x.label}</div>)}
              {diff.removed.length > 6 && <div className="text-neutral-600 text-[9px]">+{diff.removed.length - 6} more</div>}
            </div>
          </div>
        )}
      </div>

      {/* Schedules */}
      <div>
        <div className="text-neutral-500 text-[10px] uppercase tracking-wider mb-2">Scheduled scans</div>
        <div className="space-y-1.5">
          {collectors.filter(c => c.available || c.simulated).map(c => {
            const active = schedules.find(s => s.collector === c.name);
            return (
              <div key={c.name} className="flex items-center gap-2 border border-neutral-800 px-2 py-1.5">
                <span className="flex-1 text-neutral-300 uppercase">{c.name}</span>
                <input
                  type="number" min={1} max={1440}
                  className="input w-16 !py-1 text-center"
                  placeholder="min"
                  value={scheduleVals[c.name] ?? ''}
                  onChange={e => setScheduleVals(v => ({ ...v, [c.name]: e.target.value }))}
                />
                <button
                  className={`btn ${active ? 'btn-danger' : 'btn-secondary'} py-1 text-[9px]`}
                  disabled={monitoringBusy}
                  onClick={() => {
                    const n = scheduleVals[c.name] ? Number(scheduleVals[c.name]) : null;
                    void setProjectSchedule(c.name, active ? null : (n && n > 0 ? n : 60));
                  }}
                >
                  {active ? 'OFF' : 'SET'}
                </button>
                {active && <Zap className="w-3 h-3 text-alert" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-neutral-600 text-[9px] border-t border-neutral-800 pt-2">
        <Activity className="w-3 h-3" /> scans run on the server scheduler (30s tick)
      </div>
    </div>
  );
};