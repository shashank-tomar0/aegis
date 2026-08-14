// AEGIS Analytics Panel - Real-time analytical queries
// Zero-slop, data-dense analytics dashboard

import React, { useEffect, useState } from 'react';
import { useStore, selectAnalytics, selectGraph } from '../../store';
import { analyticsEngine } from '../../engine/analytics';
import type { AnalyticsQuery } from '../../types';
import { Download, RefreshCw, Database, Zap, AlertTriangle, TrendingUp, Network, Lock, Users } from 'lucide-react';

const QUERY_PRESETS = [
  { key: 'topRisk', label: 'Top Risk Nodes', icon: AlertTriangle, sql: 'SELECT id, label, kind, risk_score, severity, blast_radius FROM nodes ORDER BY risk_score DESC LIMIT 20' },
  { key: 'cryptoInventory', label: 'Crypto Inventory', icon: Lock, sql: 'SELECT crypto_algorithm as algorithm, COUNT(*) as count, AVG(crypto_key_size) as avg_key_size FROM nodes WHERE crypto_algorithm IS NOT NULL GROUP BY crypto_algorithm ORDER BY count DESC' },
  { key: 'blastRadius', label: 'Blast Radius Summary', icon: Zap, sql: 'SELECT id, label, kind, blast_radius, risk_score FROM nodes WHERE blast_radius > 0 ORDER BY blast_radius DESC LIMIT 50' },
  { key: 'attackPaths', label: 'Attack Paths', icon: Network, sql: 'WITH RECURSIVE paths AS (SELECT n.id, n.label, n.kind, e.target_id, 1 as depth, e.weight as risk, n.id || "->" || e.target_id as path FROM nodes n JOIN edges e ON n.id = e.source_id WHERE n.kind="agent" UNION ALL SELECT p.id, p.label, p.kind, e.target_id, p.depth+1, p.risk*e.weight*0.7, p.path || "->" || e.target_id FROM paths p JOIN edges e ON p.current_id = e.source_id WHERE p.depth < 5) SELECT * FROM paths ORDER BY risk DESC LIMIT 50' },
  { key: 'severityDist', label: 'Severity Distribution', icon: TrendingUp, sql: 'SELECT severity, COUNT(*) as count, AVG(risk_score) as avg_risk FROM nodes GROUP BY severity ORDER BY severity' },
  { key: 'kindDist', label: 'Node Kind Distribution', icon: Users, sql: 'SELECT kind, COUNT(*) as count, AVG(risk_score) as avg_risk, SUM(CASE WHEN is_compromised THEN 1 ELSE 0 END) as compromised FROM nodes GROUP BY kind' },
  { key: 'events', label: 'Recent Events', icon: Database, sql: 'SELECT timestamp, event_type, source_node, severity, risk_score FROM events ORDER BY timestamp DESC LIMIT 100' },
];

interface ResultTableProps {
  query: AnalyticsQuery | null;
}

const ResultTable: React.FC<ResultTableProps> = ({ query }) => {
  if (!query || query.resultRows.length === 0) {
    return <div className="text-neutral-500 text-center py-8 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>No results</div>;
  }

  return (
    <div className="overflow-x-auto" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-700">
            {query.resultColumns.map(col => (
              <th key={col} className="text-left px-2 py-1 text-neutral-400 font-medium text-xs uppercase tracking-wider">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {query.resultRows.slice(0, 100).map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
              {row.map((cell, colIdx) => (
                <td key={colIdx} className="px-2 py-1 text-neutral-200 truncate max-w-[150px]">
                  {cell === null ? <span className="text-neutral-600">NULL</span> :
                   typeof cell === 'number' ? cell.toLocaleString() :
                   String(cell)}
                </td>
              ))}
            </tr>
          ))}
          {query.resultRows.length > 100 && (
            <tr>
              <td colSpan={query.resultColumns.length} className="px-2 py-2 text-center text-neutral-500 text-xs">
                +{query.resultRows.length - 100} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export const AnalyticsPanel: React.FC = () => {
  const analyticsResults = useStore(selectAnalytics);
  const graph = useStore(selectGraph);
  const runQuery = useStore(state => state.runQuery);
  const refreshAnalytics = useStore(state => state.refreshAnalytics);
  const isQueryRunning = useStore(state => state.isQueryRunning);

  const [activeQuery, setActiveQuery] = useState<string>('topRisk');
  const [customSql, setCustomSql] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const queryResult = analyticsResults.get(activeQuery);

  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  const handlePresetQuery = (key: string) => {
    setActiveQuery(key);
    setShowCustom(false);
    const preset = QUERY_PRESETS.find(p => p.key === key);
    if (preset) {
      runQuery(key, preset.sql);
    }
  };

  const handleCustomQuery = () => {
    if (!customSql.trim()) return;
    const key = `custom_${Date.now()}`;
    setActiveQuery(key);
    runQuery(key, customSql);
  };

  const exportResults = () => {
    if (!queryResult) return;
    const csv = [
      queryResult.resultColumns.join(','),
      ...queryResult.resultRows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_${activeQuery}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Query Selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">QUERIES</span>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className={`btn btn-ghost px-2 py-1 ${showCustom ? 'bg-neutral-800' : ''}`}
          >
            <span className="text-xs">CUSTOM</span>
          </button>
        </div>

        {showCustom && (
          <div className="space-y-2">
            <textarea
              value={customSql}
              onChange={e => setCustomSql(e.target.value)}
              placeholder="SELECT * FROM nodes WHERE risk_score > 0.5..."
              className="input w-full min-h-[80px] resize-y"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--color-bg)' }}
            />
            <button
              onClick={handleCustomQuery}
              disabled={isQueryRunning || !customSql.trim()}
              className="btn btn-primary w-full justify-center"
            >
              {isQueryRunning ? 'RUNNING...' : 'EXECUTE'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1" style={{ fontSize: '10px' }}>
          {QUERY_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => handlePresetQuery(preset.key)}
              className={`panel p-2 text-left text-xs transition-colors ${activeQuery === preset.key ? 'border-accent bg-neutral-800/50' : 'hover:bg-neutral-800/30'}`}
            >
              <div className="flex items-center gap-1.5">
                <preset.icon className="w-3 h-3 text-neutral-400" />
                <span className="truncate">{preset.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="divider" />

      {/* Results */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 text-xs uppercase tracking-wider">
              {QUERY_PRESETS.find(p => p.key === activeQuery)?.label || 'CUSTOM QUERY'}
            </span>
            {queryResult && (
              <span className="badge badge-neutral text-xs">
                {queryResult.rowCount} rows • {queryResult.executionTimeMs.toFixed(1)}ms
              </span>
            )}
          </div>
          {queryResult && (
            <button
              onClick={exportResults}
              className="btn btn-ghost px-2 py-1"
              title="Export CSV"
            >
              <Download className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto panel p-2">
          <ResultTable query={queryResult || null} />
        </div>

        {/* Query SQL Display */}
        {queryResult && (
          <details className="mt-2 panel p-2">
            <summary className="text-neutral-500 text-xs cursor-pointer">SHOW SQL</summary>
            <pre className="mt-2 text-neutral-300 text-xs overflow-x-auto whitespace-pre-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
              {queryResult.sql}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
};