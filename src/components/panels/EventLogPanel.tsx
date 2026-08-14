// AEGIS Event Log Panel - Real-time attack surface event stream
// Zero-slop, append-only event visualization

import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store';
import type { SimulationEvent } from '../../types';
import { EventType } from '../../types';
import { Trash2, Pause, Play, Zap, AlertTriangle, Shield, Lock, RotateCcw, Activity, Key, Network, Database, ChevronUp, ArrowRight, XCircle, CheckCircle } from 'lucide-react';

const EVENT_ICONS: Record<EventType, React.FC<{ className?: string }>> = {
  [EventType.AGENT_SPAWN]: CpuIcon,
  [EventType.AGENT_TERMINATE]: XCircle,
  [EventType.TOOL_REGISTER]: WrenchIcon,
  [EventType.TOOL_UNREGISTER]: XCircle,
  [EventType.INVOCATION]: Zap,
  [EventType.DATA_ACCESS]: Database,
  [EventType.PRIVILEGE_ESCALATION]: AlertTriangle,
  [EventType.ANOMALY_DETECTED]: Activity,
  [EventType.COMPROMISE_ATTEMPT]: Shield,
  [EventType.COMPROMISE_SUCCESS]: CheckCircle,
  [EventType.QUARANTINE]: Lock,
  [EventType.ROTATE_KEY]: Key,
  [EventType.MIGRATE_CRYPTO]: Key,
  [EventType.BLAST_RADIUS_CALCULATED]: Network,
  [EventType.CENTRALITY_UPDATED]: Activity,
  [EventType.THREAT_INTEL_SHARED]: Shield,
  [EventType.ZK_COMMITMENT_VERIFIED]: CheckCircle,
};

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

const SEVERITY_STYLE: Record<number, string> = {
  0: 'text-neutral-500',
  1: 'text-accent',
  2: 'text-warning',
  3: 'text-critical',
  4: 'text-danger',
};

const SEVERITY_LABEL: Record<number, string> = {
  0: 'INFO',
  1: 'LOW',
  2: 'MED',
  3: 'HIGH',
  4: 'CRIT',
};

export const EventLogPanel: React.FC = () => {
  const events = useStore((state: any) => state.eventLog);
  const isSimulating = useStore((state: any) => state.isSimulating);
  const startSimulation = useStore((state: any) => state.startSimulation);
  const stopSimulation = useStore((state: any) => state.stopSimulation);
  const clearEventLog = useStore((state: any) => state.clearEventLog);
  const graph = useStore((state: any) => state.graph);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (latest events first)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [events.length]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">EVENT LOG</span>
          <span className="badge badge-neutral text-[9px]">{events.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => isSimulating ? stopSimulation() : startSimulation()}
            className="btn btn-ghost px-1.5 py-0.5"
            title={isSimulating ? 'Pause' : 'Resume'}
          >
            {isSimulating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <button
            onClick={clearEventLog}
            className="btn btn-ghost px-1.5 py-0.5"
            title="Clear log"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="divider" />

      {/* Event Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {events.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 py-10" style={{ fontSize: '11px' }}>
            <Activity className="w-12 h-12 mb-3 opacity-20" />
            <p>No events recorded</p>
            <p className="text-xs mt-1 text-neutral-700">Start simulation or interact with the graph</p>
          </div>
        ) : (
          events.slice(0, 200).map((event: SimulationEvent) => {
            const Icon = EVENT_ICONS[event.type] || Activity;
            const sourceNode = graph.getNode(event.sourceNode);
            const targetNode = event.targetNode ? graph.getNode(event.targetNode) : null;
            const time = new Date(event.timestamp);
            const timeStr = time.toLocaleTimeString('en-GB', { hour12: false });

            return (
              <div key={event.id} className="panel p-2 flex items-start gap-2 hover:bg-neutral-800/40 transition-colors">
                <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-neutral-800 ${SEVERITY_STYLE[event.severity]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold ${SEVERITY_STYLE[event.severity]}`}>
                      {SEVERITY_LABEL[event.severity]}
                    </span>
                    <span className="text-neutral-400 text-[10px] uppercase tracking-wider truncate">
                      {event.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-neutral-100 truncate">
                    <span className="truncate">{sourceNode?.label || event.sourceNode || 'system'}</span>
                    {targetNode && (
                      <>
                        <ArrowRight className="w-3 h-3 text-neutral-600 flex-shrink-0" />
                        <span className="truncate">{targetNode.label}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-neutral-600 text-[9px] flex-shrink-0">{timeStr}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Legend / Footer */}
      <div className="divider" />
      <div className="flex items-center justify-between text-[9px] text-neutral-600">
        <span>SEVERITY</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(s => (
            <span key={s} className={`font-bold ${SEVERITY_STYLE[s]}`}>{SEVERITY_LABEL[s]}</span>
          ))}
        </div>
      </div>
    </div>
  );
};