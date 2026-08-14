// AEGIS Topology Panel - Attack surface inventory & structure
// Zero-slop, dense system overview

import React from 'react';
import { useStore } from '../../store';
import { NodeKind as NK, EdgeKind as EK, RiskSeverity as RS } from '../../types';
import { Cpu, Network, Database, User, Shield, AlertTriangle, ArrowRight, Search } from 'lucide-react';

const KIND_META: Record<string, { label: string; icon: React.FC<{ className?: string }>; color: string }> = {
  [NK.AGENT]: { label: 'AGENTS', icon: Cpu, color: 'text-accent' },
  [NK.TOOL]: { label: 'TOOLS', icon: Network, color: 'text-blue-400' },
  [NK.DATA_SOURCE]: { label: 'DATA SOURCES', icon: Database, color: 'text-amber-400' },
  [NK.USER]: { label: 'USERS', icon: User, color: 'text-pink-400' },
  [NK.GATEWAY]: { label: 'GATEWAYS', icon: Shield, color: 'text-purple-400' },
};

const SEVERITY_RING: Record<number, string> = {
  [RS.INFO]: 'text-neutral-500',
  [RS.LOW]: 'text-accent',
  [RS.MEDIUM]: 'text-warning',
  [RS.HIGH]: 'text-critical',
  [RS.CRITICAL]: 'text-danger',
};

export const TopologyPanel: React.FC = () => {
  const graph = useStore((state: any) => state.graph);
  const selectNode = useStore((state: any) => state.selectNode);
  const selectedNodes = useStore((state: any) => state.selectedNodes);
  const setMode = useStore((state: any) => state.setMode);

  const nodes = graph.getAllNodes();
  const edges = graph.getAllEdges();

  const byKind = Object.keys(KIND_META).map(kind => ({
    kind,
    ...KIND_META[kind],
    items: nodes.filter((n: any) => n.kind === kind),
  })).filter(g => g.items.length > 0);

  const riskCounts = {
    high: nodes.filter((n: any) => n.severity >= RS.HIGH || n.isCompromised).length,
    medium: nodes.filter((n: any) => n.severity === RS.MEDIUM && !n.isCompromised).length,
    total: nodes.length,
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="TOTAL" value={nodes.length} />
        <SummaryCard label="EDGES" value={edges.length} />
        <SummaryCard label="AT RISK" value={riskCounts.high + riskCounts.medium} variant={riskCounts.high > 0 ? 'danger' : riskCounts.medium > 0 ? 'warning' : 'ok'} />
      </div>

      {/* High Risk Alert */}
      {riskCounts.high > 0 && (
        <div className="panel p-3 border-danger/40 flex items-start gap-2 bg-danger/5">
          <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-danger font-bold text-xs">HIGH-RISK ASSETS DETECTED</div>
            <div className="text-neutral-400 text-[10px] mt-0.5">
              {riskCounts.high} node{riskCounts.high !== 1 ? 's' : ''} with high/critical severity. Investigate immediately.
            </div>
          </div>
          <button onClick={() => setMode('select')} className="btn btn-danger px-2 py-0.5 text-[10px]">
            REVIEW
          </button>
        </div>
      )}

      <div className="divider" />

      {/* Search */}
      <div className="relative">
        <Search className="w-3 h-3 text-neutral-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Filter nodes..."
          className="input pl-7 text-[11px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      </div>

      {/* Node Groups */}
      {byKind.map((group) => (
        <div key={group.kind}>
          <div className={`flex items-center gap-2 mb-1.5 text-[9px] uppercase tracking-wider ${group.color}`}>
            <group.icon className="w-3 h-3" />
            <span>{group.label}</span>
            <span className="ml-auto text-neutral-600">{group.items.length}</span>
          </div>
          <div className="space-y-1">
            {group.items.map((node: any) => {
              const outCount = graph.getOutgoingEdges(node.id).length;
              const inCount = graph.getIncomingEdges(node.id).length;
              const isSelected = selectedNodes.has(node.id);
              return (
                <button
                  key={node.id}
                  onClick={() => selectNode(node.id, true)}
                  className={`w-full panel p-2 text-left transition-colors flex items-center gap-2 ${
                    isSelected ? 'border-accent bg-accent/10' : 'hover:bg-neutral-800/40'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_RING[node.severity]}`}
                    style={{ backgroundColor: 'currentColor' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-[11px] ${node.isCompromised ? 'text-danger font-bold' : 'text-neutral-100'}`}>
                        {node.label}
                      </span>
                      {node.isCompromised && <span className="badge badge-danger text-[8px]">COMP</span>}
                      {node.isQuarantined && <span className="badge badge-neutral text-[8px]">ISO</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-neutral-600 mt-0.5">
                      <span title="outgoing">{outCount} →</span>
                      <span title="incoming">← {inCount}</span>
                      {node.cryptoProfile && (
                        <span className={node.cryptoProfile.quantumResistance >= 2 ? 'text-accent' : node.cryptoProfile.quantumResistance === 1 ? 'text-warning' : 'text-danger'}>
                          {node.cryptoProfile.algorithm}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] font-mono text-neutral-300">
                      {(node.riskScore * 100).toFixed(0)}%
                    </div>
                    <div className="w-12 h-0.5 bg-neutral-700 mt-0.5">
                      <div
                        className={`h-full ${node.riskScore > 0.8 ? 'bg-danger' : node.riskScore > 0.5 ? 'bg-warning' : 'bg-accent'}`}
                        style={{ width: `${Math.min(100, node.riskScore * 100)}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Edge Summary */}
      <div className="divider" />
      <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5">CONNECTION TYPES</div>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        {Object.values(EK).map(kind => {
          const count = edges.filter((e: any) => e.kind === kind).length;
          return (
            <div key={kind} className="panel p-1.5 flex items-center justify-between px-2">
              <span className="text-neutral-400">{kind.replace(/_/g, ' ')}</span>
              <span className="text-neutral-100 font-mono">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number; variant?: 'ok' | 'warning' | 'danger' }> = ({ label, value, variant = 'ok' }) => (
  <div className="panel p-2.5 text-center">
    <div className={`text-xl font-mono font-bold ${variant === 'danger' ? 'text-danger' : variant === 'warning' ? 'text-warning' : 'text-neutral-100'}`}>
      {value}
    </div>
    <div className="text-[8px] uppercase tracking-wider text-neutral-600 mt-0.5">{label}</div>
  </div>
);