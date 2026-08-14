// AEGIS Node Detail Panel - Comprehensive node inspection
// Zero-slop, information-dense panel for selected nodes

import React, { useMemo } from 'react';
import { useStore, selectSelectedNodes, selectGraph } from '../../store';
import type { GraphNode, NodeId, CryptoProfile, CryptoAlgorithm, RiskSeverity, QuantumResistance } from '../../types';
import { RiskSeverity as RS, CryptoAlgorithm as CA, QuantumResistance as QR, NodeKind as NK } from '../../types';
import { Copy, Shield, AlertTriangle, Key, Network, Database, User, Cpu, Lock, Unlock, ArrowRight, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const SEVERITY_LABELS: Record<RiskSeverity, string> = {
  [RS.INFO]: 'INFO',
  [RS.LOW]: 'LOW',
  [RS.MEDIUM]: 'MEDIUM',
  [RS.HIGH]: 'HIGH',
  [RS.CRITICAL]: 'CRITICAL',
};

const SEVERITY_COLORS: Record<RiskSeverity, string> = {
  [RS.INFO]: 'badge-neutral',
  [RS.LOW]: 'badge-accent',
  [RS.MEDIUM]: 'badge-warning',
  [RS.HIGH]: 'badge-danger',
  [RS.CRITICAL]: 'badge-critical',
};

const QR_LABELS: Record<QuantumResistance, string> = {
  [QR.NONE]: 'NONE',
  [QR.PARTIAL]: 'PARTIAL',
  [QR.FULL]: 'FULL (PQC)',
};

const KIND_ICONS: Record<typeof NK[keyof typeof NK], React.ReactNode> = {
  [NK.AGENT]: <Cpu className="w-4 h-4" />,
  [NK.TOOL]: <Network className="w-4 h-4" />,
  [NK.DATA_SOURCE]: <Database className="w-4 h-4" />,
  [NK.USER]: <User className="w-4 h-4" />,
  [NK.GATEWAY]: <Shield className="w-4 h-4" />,
};

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = true, icon }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="panel border-b border-neutral-700 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800/50 transition-colors"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
      >
        {icon && <span className="text-neutral-400">{icon}</span>}
        <span className="font-medium text-neutral-100">{title}</span>
        <span className="ml-auto text-neutral-500">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const KeyValue: React.FC<{ key: string; value: string | number; copyable?: boolean; mono?: boolean }> = ({
  key, value, copyable, mono = true,
}) => (
  <div className="flex gap-2 py-1 border-b border-neutral-800/50 last:border-0">
    <span className="text-neutral-500 min-w-[120px] flex-shrink-0">{key}</span>
    <span className="text-neutral-100 flex-1 truncate" style={mono ? { fontFamily: 'var(--font-mono)' } : {}}>
      {value}
    </span>
    {copyable && (
      <button
        onClick={() => navigator.clipboard.writeText(String(value))}
        className="text-neutral-600 hover:text-neutral-300 p-1"
        title="Copy"
      >
        <Copy className="w-3 h-3" />
      </button>
    )}
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`badge ${className} px-2 py-0.5`}>{children}</span>
);

export const NodeDetailPanel: React.FC = () => {
  const selectedNodes = useStore(selectSelectedNodes);
  const graph = useStore(selectGraph);

  const nodeId = Array.from(selectedNodes)[0];
  const node = nodeId ? graph.getNode(nodeId) : null;

  if (!node) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-neutral-500" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Select a node to inspect</p>
          <p className="text-xs mt-1">Click any node in the graph</p>
        </div>
      </div>
    );
  }

  const outgoingEdges = graph.getOutgoingEdges(node.id);
  const incomingEdges = graph.getIncomingEdges(node.id);
  const neighbors = graph.getNeighbors(node.id);

  const crypto = node.cryptoProfile;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: `var(--color-${node.kind === NK.AGENT ? 'accent' : node.kind === NK.TOOL ? 'blue' : node.kind === NK.DATA_SOURCE ? 'amber' : node.kind === NK.USER ? 'pink' : 'purple'})` }}>
          {KIND_ICONS[node.kind]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-neutral-100 truncate" style={{ fontSize: '13px' }}>{node.label}</h3>
            <Badge className={`capitalize ${node.kind === NK.AGENT ? 'badge-accent' : node.kind === NK.TOOL ? 'badge-neutral' : node.kind === NK.DATA_SOURCE ? 'badge-warning' : node.kind === NK.USER ? 'badge-danger' : 'badge-neutral'}`}>
              {node.kind}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={SEVERITY_COLORS[node.severity]}>
              {SEVERITY_LABELS[node.severity]}
            </Badge>
            {node.isCompromised && <Badge className="badge-critical">COMPROMISED</Badge>}
            {node.isQuarantined && <Badge className="badge-neutral">QUARANTINED</Badge>}
            {node.cryptoProfile && node.cryptoProfile.migrationTarget && <Badge className="badge-warning">MIGRATION PENDING</Badge>}
          </div>
        </div>
        {node.cryptoProfile && (
          <Badge className={node.cryptoProfile.quantumResistance === QR.FULL ? 'badge-accent' : node.cryptoProfile.quantumResistance === QR.PARTIAL ? 'badge-warning' : 'badge-danger'}>
            {QR_LABELS[node.cryptoProfile.quantumResistance]}
          </Badge>
        )}
      </div>

      <div className="divider" />

      {/* Core Properties */}
      <CollapsibleSection title="CORE PROPERTIES" icon={<Key className="w-3 h-3" />}>
        <KeyValue key="Node ID" value={node.id} copyable />
        <KeyValue key="Risk Score" value={`${(node.riskScore * 100).toFixed(1)}%`} />
        <KeyValue key="Blast Radius" value={node.blastRadius.toString()} />
        <KeyValue key="Centrality" value={node.centrality.toFixed(6)} />
        <KeyValue key="Position" value={`${node.position.x.toFixed(1)}, ${node.position.y.toFixed(1)}`} />
        <KeyValue key="Created" value={new Date(node.createdAt).toISOString()} />
        <KeyValue key="Updated" value={new Date(node.updatedAt).toISOString()} />
      </CollapsibleSection>

      {/* Connectivity */}
      <CollapsibleSection title={`CONNECTIVITY (${outgoingEdges.length} out / ${incomingEdges.length} in)`} icon={<Network className="w-3 h-3" />}>
        <div className="space-y-2">
          {outgoingEdges.length > 0 && (
            <div>
              <div className="text-neutral-500 text-xs mb-1">OUTGOING</div>
              {outgoingEdges.slice(0, 10).map(edge => {
                const target = graph.getNode(edge.target);
                return (
                  <div key={edge.id} className="flex items-center gap-2 text-xs text-neutral-300 hover:text-neutral-100 cursor-pointer px-2 py-1 rounded hover:bg-neutral-800/50">
                    <span className="text-neutral-500">{edge.kind}</span>
                    <span className="flex-1 truncate">{target?.label || edge.target}</span>
                    <span className="text-neutral-500">{edge.weight.toFixed(2)}x</span>
                  </div>
                );
              })}
              {outgoingEdges.length > 10 && <div className="text-neutral-500 text-xs px-2">+{outgoingEdges.length - 10} more</div>}
            </div>
          )}
          {incomingEdges.length > 0 && (
            <div className="pt-2 border-t border-neutral-800">
              <div className="text-neutral-500 text-xs mb-1">INCOMING</div>
              {incomingEdges.slice(0, 10).map(edge => {
                const source = graph.getNode(edge.source);
                return (
                  <div key={edge.id} className="flex items-center gap-2 text-xs text-neutral-300 hover:text-neutral-100 cursor-pointer px-2 py-1 rounded hover:bg-neutral-800/50">
                    <span className="text-neutral-500">{edge.kind}</span>
                    <span className="flex-1 truncate">{source?.label || edge.source}</span>
                    <span className="text-neutral-500">{edge.weight.toFixed(2)}x</span>
                  </div>
                );
              })}
              {incomingEdges.length > 10 && <div className="text-neutral-500 text-xs px-2">+{incomingEdges.length - 10} more</div>}
            </div>
          )}
          {(outgoingEdges.length === 0 && incomingEdges.length === 0) && (
            <div className="text-neutral-500 text-center py-4">No connections</div>
          )}
        </div>
      </CollapsibleSection>

      {/* Crypto Profile */}
      {crypto && (
        <CollapsibleSection title="CRYPTO PROFILE" icon={<Lock className="w-3 h-3" />}>
          <KeyValue key="Algorithm" value={crypto.algorithm} />
          <KeyValue key="Key Size" value={`${crypto.keySize} bits`} />
          <KeyValue key="Quantum Resistance" value={QR_LABELS[crypto.quantumResistance]} />
          <KeyValue key="NIST Level" value={crypto.nistLevel.toString()} />
          <KeyValue key="Issuer" value={crypto.issuer} />
          <KeyValue key="Subject" value={crypto.subject} copyable />
          <KeyValue key="Fingerprint" value={crypto.fingerprint} copyable />
          <KeyValue key="Last Rotated" value={new Date(crypto.lastRotated).toISOString()} />
          <KeyValue key="Expires" value={new Date(crypto.expiresAt).toISOString()} />
          {crypto.migrationTarget && (
            <>
              <div className="divider-strong my-2" />
              <KeyValue key="Migration Target" value={crypto.migrationTarget} />
              <KeyValue key="Migration Priority" value={crypto.migrationPriority.toString()} />
            </>
          )}
        </CollapsibleSection>
      )}

      {/* Metadata */}
      {Object.keys(node.metadata).length > 0 && (
        <CollapsibleSection title="METADATA" icon={<Database className="w-3 h-3" />}>
          {Object.entries(node.metadata).map(([key, value]) => (
            <KeyValue key={key} value={typeof value === 'object' ? JSON.stringify(value) : String(value)} />
          ))}
        </CollapsibleSection>
      )}

      {/* Actions */}
      <div className="pt-2 border-t border-neutral-700 space-y-2">
        <button
          onClick={() => graph.calculateBlastRadius(node.id)}
          className="btn btn-secondary w-full justify-start gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          Calculate Blast Radius
        </button>
        {crypto && !crypto.migrationTarget && (
          <button
            onClick={() => {
              const algorithms = Object.values(CA).filter(a => a !== crypto.algorithm && a !== CA.UNKNOWN);
              const target = algorithms[Math.floor(Math.random() * algorithms.length)];
              graph.migrateCrypto(node.id, target);
            }}
            className="btn btn-secondary w-full justify-start gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Queue Crypto Migration
          </button>
        )}
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(node, null, 2))}
          className="btn btn-ghost w-full justify-start gap-2"
        >
          <Copy className="w-4 h-4" />
          Copy Node JSON
        </button>
      </div>
    </div>
  );
};