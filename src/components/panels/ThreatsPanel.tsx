// AEGIS Threats Panel - Threat Intelligence & ZK-Proof Sharing
// Zero-slop, privacy-preserving threat intel exchange

import React, { useState, useEffect } from 'react';
import { useStore, selectThreats } from '../../store';
import { zkThreatIntel } from '../../engine/zkproof';
import type { Indicator, ThreatIntel } from '../../types';
import { Shield, AlertTriangle, Eye, EyeOff, Copy, Download, Upload, Share2, Lock, Unlock, Plus, X, Search, Filter } from 'lucide-react';

const INDICATOR_TYPES = ['ip', 'domain', 'hash', 'pubkey', 'agent_id', 'tool_id'] as const;
const TYPE_ICONS: Record<string, React.ReactNode> = {
  ip: <Network className="w-3 h-3" />,
  domain: <Globe className="w-3 h-3" />,
  hash: <Fingerprint className="w-3 h-3" />,
  pubkey: <Key className="w-3 h-3" />,
  agent_id: <Cpu className="w-3 h-3" />,
  tool_id: <Wrench className="w-3 h-3" />,
};

import { Network, Globe, Fingerprint, Key, Cpu, Wrench } from 'lucide-react';

interface NewIndicatorForm {
  type: string;
  value: string;
  confidence: number;
  tags: string;
}

export const ThreatsPanel: React.FC = () => {
  const threatIntel = useStore(selectThreats);
  const addThreatIntel = useStore(state => state.addThreatIntel);
  const shareThreatIntel = useStore(state => state.shareThreatIntel);
  const verifyThreatIntel = useStore(state => state.verifyThreatIntel);
  const isSharingIntel = useStore(state => state.isSharingIntel);

  const [newIndicator, setNewIndicator] = useState<NewIndicatorForm>({
    type: 'ip',
    value: '',
    confidence: 0.8,
    tags: '',
  });
  const [localIndicators, setLocalIndicators] = useState<Indicator[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddIndicator = () => {
    if (!newIndicator.value.trim()) return;
    const indicator: Indicator = {
      type: newIndicator.type as any,
      value: newIndicator.value.trim(),
      confidence: newIndicator.confidence,
      tags: newIndicator.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    setLocalIndicators(prev => [...prev, indicator]);
    setNewIndicator({ type: 'ip', value: '', confidence: 0.8, tags: '' });
  };

  const handleShare = async () => {
    if (localIndicators.length === 0) return;
    const secret = crypto.getRandomValues(new Uint8Array(32));
    await shareThreatIntel(localIndicators, secret);
    setLocalIndicators([]);
    setShowForm(false);
  };

  const handleVerify = (intel: ThreatIntel) => {
    const verified = verifyThreatIntel(intel);
    alert(verified ? '��� Threat intel verified - ZK proof valid' : '��� Verification failed');
  };

  const exportIntel = (intel: ThreatIntel) => {
    const blob = new Blob([JSON.stringify(intel, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threat_intel_${intel.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredIntel = threatIntel.filter(intel => {
    if (filterType !== 'all') {
      return intel.indicators.some(i => i.type === filterType);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return intel.indicators.some(i =>
        i.value.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-neutral-500 text-xs uppercase tracking-wider">THREAT INTELLIGENCE</span>
        <div className="flex items-center gap-1">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="input px-2 py-1 text-xs w-auto"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
          >
            <option value="all">ALL TYPES</option>
            {INDICATOR_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="input px-2 py-1 text-xs w-[150px]"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
          />
        </div>
      </div>

      {/* New Indicator Form */}
      <div className="space-y-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className={`btn btn-secondary w-full justify-start gap-2 ${showForm ? 'bg-neutral-800' : ''}`}
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'HIDE' : 'ADD INDICATOR'}
        </button>

        {showForm && (
          <div className="panel p-3 space-y-2" style={{ fontSize: '10px' }}>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newIndicator.type}
                onChange={e => setNewIndicator(prev => ({ ...prev, type: e.target.value }))}
                className="input px-2 py-1"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
              >
                {INDICATOR_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t.toUpperCase()}</option>)}
              </select>
              <input
                type="number"
                value={newIndicator.confidence}
                onChange={e => setNewIndicator(prev => ({ ...prev, confidence: parseFloat(e.target.value) }))}
                min={0}
                max={1}
                step={0.1}
                className="input px-2 py-1"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
                placeholder="Confidence (0-1)"
              />
            </div>
            <input
              type="text"
              value={newIndicator.value}
              onChange={e => setNewIndicator(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Value (IP, domain, hash, etc.)"
              className="input px-2 py-1"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
            />
            <input
              type="text"
              value={newIndicator.tags}
              onChange={e => setNewIndicator(prev => ({ ...prev, tags: e.target.value }))}
              placeholder="Tags (comma-separated)"
              className="input px-2 py-1"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddIndicator}
                className="btn btn-primary flex-1 justify-center"
              >
                ADD TO BATCH
              </button>
              {localIndicators.length > 0 && (
                <button
                  onClick={handleShare}
                  disabled={isSharingIntel}
                  className="btn btn-secondary flex-1 justify-center"
                >
                  {isSharingIntel ? 'SHARING...' : `SHARE (${localIndicators.length})`}
                </button>
              )}
            </div>

            {localIndicators.length > 0 && (
              <div className="border-t border-neutral-700 pt-2 space-y-1">
                <div className="text-neutral-500 text-xs">BATCH ({localIndicators.length} indicators)</div>
                {localIndicators.map((ind, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs px-2 py-1 bg-neutral-800/50 rounded">
                    <span className="badge badge-neutral">{ind.type}</span>
                    <span className="flex-1 truncate text-neutral-300">{ind.value}</span>
                    <span className="text-neutral-500">{Math.round(ind.confidence * 100)}%</span>
                    <button
                      onClick={() => setLocalIndicators(prev => prev.filter((_, i) => i !== idx))}
                      className="text-neutral-600 hover:text-neutral-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Shared Threat Intel */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">
            SHARED INTEL ({filteredIntel.length})
          </span>
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-neutral-400" />
            <span className="text-neutral-500 text-xs">ZK-PROVEN</span>
          </div>
        </div>

        {filteredIntel.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
            No threat intelligence shared yet.<br />
            <span className="text-neutral-600">Add indicators and share with ZK privacy.</span>
          </div>
        ) : (
          <div className="space-y-2" style={{ fontSize: '10px' }}>
            {filteredIntel.map((intel, idx) => {
              const verified = intel.verified;
              return (
                <div key={idx} className="panel p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${verified ? 'bg-accent/20' : 'bg-danger/20'}`}>
                        {verified ? <CheckCircle className="w-5 h-5 text-accent" /> : <AlertTriangle className="w-5 h-5 text-danger" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-neutral-100">
                          <span className="font-medium">{intel.id}</span>
                          <Badge className={verified ? 'badge-accent' : 'badge-danger'}>
                            {verified ? 'VERIFIED' : 'UNVERIFIED'}
                          </Badge>
                        </div>
                        <div className="text-neutral-500 text-xs">
                          {new Date(intel.timestamp).toLocaleString()} • {intel.indicators.length} indicators
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleVerify(intel)} className="btn btn-ghost px-1.5 py-0.5" title="Verify ZK Proof">
                        <Shield className="w-3 h-3" />
                      </button>
                      <button onClick={() => exportIntel(intel)} className="btn btn-ghost px-1.5 py-0.5" title="Export">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1 mb-2 text-xs">
                    <div className="text-neutral-500">Merkle Root</div>
                    <div className="text-neutral-300 font-mono truncate">{intel.merkleRoot.slice(0, 32)}...</div>
                    <div className="text-neutral-500">ZK Proof</div>
                    <div className="text-neutral-300 font-mono truncate">{intel.zkProof.slice(0, 32)}...</div>
                  </div>

                  <div className="space-y-1">
                    {intel.indicators.map((ind, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 bg-neutral-800/50 rounded text-xs">
                        <span className="badge badge-neutral">{ind.type.toUpperCase()}</span>
                        <span className="flex-1 truncate text-neutral-300 font-mono">{ind.value}</span>
                        <span className="text-neutral-500">{Math.round(ind.confidence * 100)}%</span>
                        {ind.tags.length > 0 && (
                          <span className="text-neutral-600">{ind.tags.join(', ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ZK Proof Explanation */}
      <details className="panel p-3">
        <summary className="text-neutral-400 text-xs cursor-pointer flex items-center gap-1">
          <Lock className="w-3 h-3" />
          HOW ZK THREAT INTEL WORKS
        </summary>
        <div className="mt-2 space-y-1 text-neutral-500 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <p>1. Indicators committed via Pedersen-style commitment</p>
          <p>2. Nullifiers prevent duplicate submission</p>
          <p>3. Merkle tree batches commitments</p>
          <p>4. ZK-SNARK proves membership without revealing source</p>
          <p>5. Verifiers check proof without learning indicator values</p>
        </div>
      </details>
    </div>
  );
};

const Badge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`badge ${className} px-1.5 py-0.5 text-[9px]`}>{children}</span>
);

const CheckCircle = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);