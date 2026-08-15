// AEGIS Crypto Panel - PQC Migration & Crypto Agility Management
// Zero-slop, compliance-focused cryptographic inventory

import React, { useEffect, useState, useMemo } from 'react';
import { useStore, selectGraph, selectCryptoQueue, selectCryptoMigrating } from '../../store';
import { analyticsEngine } from '../../engine/analytics';
import type { CryptoAlgorithm, CryptoProfile, QuantumResistance, NodeId } from '../../types';
import { CryptoAlgorithm as CA, QuantumResistance as QR, RiskSeverity as RS, NodeKind as NK } from '../../types';
import { Shield, AlertTriangle, Key, ArrowRight, RotateCcw, CheckCircle, XCircle, Clock, Download, RefreshCw } from 'lucide-react';

const ALGO_INFO: Record<CryptoAlgorithm, { qr: QuantumResistance; nist: number; desc: string }> = {
  [CA.RSA_2048]: { qr: QR.NONE, nist: 0, desc: 'Legacy RSA, deprecated' },
  [CA.RSA_4096]: { qr: QR.NONE, nist: 0, desc: 'Large key RSA, not quantum-safe' },
  [CA.ECDSA_P256]: { qr: QR.PARTIAL, nist: 1, desc: 'NIST P-256, vulnerable to CRQC' },
  [CA.ECDSA_P384]: { qr: QR.PARTIAL, nist: 2, desc: 'NIST P-384, vulnerable to CRQC' },
  [CA.ED25519]: { qr: QR.PARTIAL, nist: 1, desc: 'Ed25519, vulnerable to CRQC' },
  [CA.ML_KEM_512]: { qr: QR.FULL, nist: 1, desc: 'ML-KEM-512 (Kyber512), NIST Level 1' },
  [CA.ML_KEM_768]: { qr: QR.FULL, nist: 3, desc: 'ML-KEM-768 (Kyber768), NIST Level 3' },
  [CA.ML_KEM_1024]: { qr: QR.FULL, nist: 5, desc: 'ML-KEM-1024 (Kyber1024), NIST Level 5' },
  [CA.ML_DSA_44]: { qr: QR.FULL, nist: 2, desc: 'ML-DSA-44 (Dilithium2), NIST Level 2' },
  [CA.ML_DSA_65]: { qr: QR.FULL, nist: 3, desc: 'ML-DSA-65 (Dilithium3), NIST Level 3' },
  [CA.ML_DSA_87]: { qr: QR.FULL, nist: 5, desc: 'ML-DSA-87 (Dilithium5), NIST Level 5' },
  [CA.SLH_DSA_SHAKE_128F]: { qr: QR.FULL, nist: 1, desc: 'SLH-DSA-SHAKE-128f, NIST Level 1' },
  [CA.SLH_DSA_SHAKE_192F]: { qr: QR.FULL, nist: 3, desc: 'SLH-DSA-SHAKE-192f, NIST Level 3' },
  [CA.SLH_DSA_SHAKE_256F]: { qr: QR.FULL, nist: 5, desc: 'SLH-DSA-SHAKE-256f, NIST Level 5' },
  [CA.UNKNOWN]: { qr: QR.NONE, nist: 0, desc: 'Unknown algorithm' },
};

const QR_BADGE: Record<QuantumResistance, string> = {
  [QR.NONE]: 'badge-danger',
  [QR.PARTIAL]: 'badge-warning',
  [QR.FULL]: 'badge-accent',
};

const QR_LABEL: Record<QuantumResistance, string> = {
  [QR.NONE]: 'VULNERABLE',
  [QR.PARTIAL]: 'AT RISK',
  [QR.FULL]: 'PQC READY',
};

export const CryptoPanel: React.FC = () => {
  const graph = useStore(selectGraph);
  const queue = useStore(selectCryptoQueue);
  const isMigrating = useStore(selectCryptoMigrating);
  const setCryptoProfile = useStore(state => state.setCryptoProfile);
  const queueCryptoMigration = useStore(state => state.queueCryptoMigration);
  const processCryptoMigrations = useStore(state => state.processCryptoMigrations);
  const rotateKey = useStore(state => state.rotateKey);

  const [inventory, setInventory] = useState<any[]>([]);
  const [migrationPlan, setMigrationPlan] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCryptoData();
  }, []);

  const loadCryptoData = async () => {
    setLoading(true);
    try {
      const inv = await analyticsEngine.getCryptoInventory();
      setInventory(inv.resultRows.map((row: any[]) => ({
        algorithm: row[0],
        count: row[1],
        avgKeySize: row[2],
        maxQR: row[3],
        pendingMigrations: row[4],
        avgPriority: row[5],
      })));

      const plan = await analyticsEngine.getCryptoMigrationPlan();
      setMigrationPlan(plan.resultRows.map((row: any[]) => ({
        id: row[0],
        label: row[1],
        kind: row[2],
        currentAlgorithm: row[3],
        targetAlgorithm: row[4],
        priority: row[5],
        expiresAt: row[6],
        daysUntilExpiry: row[7],
      })));
    } catch (e) {
      console.error('Failed to load crypto data:', e);
    } finally {
      setLoading(false);
    }
  };

  const nodesWithCrypto = useMemo(() => {
    return graph.getAllNodes()
      .filter(n => n.cryptoProfile)
      .map(n => ({ ...n, crypto: n.cryptoProfile! }));
  }, [graph]);

  const stats = useMemo(() => {
    const total = nodesWithCrypto.length;
    const pqc = nodesWithCrypto.filter(n => n.crypto.quantumResistance === QR.FULL).length;
    const atRisk = nodesWithCrypto.filter(n => n.crypto.quantumResistance === QR.PARTIAL).length;
    const vulnerable = nodesWithCrypto.filter(n => n.crypto.quantumResistance === QR.NONE).length;
    const expiring = nodesWithCrypto.filter(n => n.crypto.expiresAt < Date.now() + 30 * 86400000).length;
    return { total, pqc, atRisk, vulnerable, expiring, pqcPercent: total ? Math.round(pqc / total * 100) : 0 };
  }, [nodesWithCrypto]);

  const handleMigrateNode = (nodeId: NodeId, targetAlgo: CryptoAlgorithm) => {
    queueCryptoMigration(nodeId, targetAlgo);
  };

  const handleRotateKey = (nodeId: NodeId) => {
    rotateKey(nodeId);
  };

  const getRecommendedMigration = (current: CryptoAlgorithm): CryptoAlgorithm | null => {
    const info = ALGO_INFO[current];
    if (info.qr === QR.FULL) return null;

    // Recommend based on current algorithm type
    if (current.startsWith('RSA') || current.startsWith('ECDSA')) {
      return CA.ML_KEM_768; // KEM for key exchange
    }
    if (current === CA.ED25519) {
      return CA.ML_DSA_65; // Signature replacement
    }
    return CA.ML_KEM_768;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="TOTAL KEYS" value={stats.total} icon={Key} />
        <StatCard label="PQC READY" value={`${stats.pqc} (${stats.pqcPercent}%)`} icon={Shield} variant="accent" />
        <StatCard label="AT RISK" value={stats.atRisk} icon={AlertTriangle} variant="warning" />
        <StatCard label="VULNERABLE" value={stats.vulnerable} icon={XCircle} variant="danger" />
      </div>

      <div className="divider" />

      {/* Algorithm Inventory */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">ALGORITHM INVENTORY</span>
          <button onClick={loadCryptoData} disabled={loading} className="btn btn-ghost px-2 py-1">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="text-center text-neutral-500 py-8 text-xs">Loading...</div>
        ) : (
          <div className="space-y-1" style={{ fontSize: '10px' }}>
            {inventory.map((algo, idx) => {
              const info = ALGO_INFO[algo.algorithm as CryptoAlgorithm] || ALGO_INFO[CA.UNKNOWN];
              return (
                <div key={idx} className="panel p-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-100 truncate">{algo.algorithm}</span>
                      <Badge className={QR_BADGE[info.qr]}>{QR_LABEL[info.qr]}</Badge>
                      {info.nist > 0 && <Badge className="badge-neutral">NIST L{info.nist}</Badge>}
                    </div>
                    <div className="text-neutral-500 text-xs mt-0.5">{info.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-neutral-300 font-mono">{algo.count} keys</div>
                    <div className="text-neutral-500 text-xs">Avg {algo.avgKeySize} bits</div>
                  </div>
                </div>
              );
            })}
            {inventory.length === 0 && (
              <div className="text-center text-neutral-500 py-8 text-xs">No cryptographic assets found</div>
            )}
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Migration Queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">
            MIGRATION QUEUE ({queue.length})
          </span>
          {queue.length > 0 && (
            <button
              onClick={processCryptoMigrations}
              disabled={isMigrating}
              className="btn btn-primary px-2 py-1"
            >
              {isMigrating ? 'PROCESSING...' : 'EXECUTE ALL'}
            </button>
          )}
        </div>

        {queue.length > 0 ? (
          <div className="space-y-1 max-h-40 overflow-auto" style={{ fontSize: '10px' }}>
            {queue.map((item, idx) => {
              const node = graph.getNode(item.nodeId);
              const currentAlgo = node?.cryptoProfile?.algorithm;
              const info = currentAlgo ? ALGO_INFO[currentAlgo] : null;
              const targetInfo = ALGO_INFO[item.targetAlgorithm];
              return (
                <div key={idx} className="panel p-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center bg-neutral-800">
                    <ArrowRight className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-neutral-100 truncate">{node?.label || item.nodeId}</div>
                    <div className="flex items-center gap-1 text-xs text-neutral-500">
                      <span className="badge badge-danger">{currentAlgo || 'NONE'}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className={`badge ${QR_BADGE[targetInfo.qr]}`}>{item.targetAlgorithm}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const newQueue = [...queue];
                      newQueue.splice(idx, 1);
                      useStore.setState({ cryptoMigrationQueue: newQueue });
                    }}
                    className="btn btn-ghost px-1 py-0.5"
                  >
                    <XCircle className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-neutral-500 py-4 text-xs">
            No pending migrations. Select nodes to queue migrations.
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Migration Plan from Analytics */}
      {migrationPlan.length > 0 && (
        <div className="space-y-2">
          <span className="text-neutral-500 text-xs uppercase tracking-wider">RECOMMENDED MIGRATIONS</span>
          <div className="space-y-1 max-h-40 overflow-auto" style={{ fontSize: '10px' }}>
            {migrationPlan.slice(0, 10).map((item, idx) => (
              <div key={idx} className="panel p-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded flex items-center justify-center bg-neutral-800">
                  <Clock className="w-4 h-4 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-neutral-100 truncate">{item.label} <span className="text-neutral-500">({item.kind})</span></div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <span className="badge badge-danger">{item.currentAlgorithm}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="badge badge-warning">{item.targetAlgorithm}</span>
                    <span className="text-neutral-500 ml-2">{item.daysUntilExpiry?.toFixed(0)} days</span>
                  </div>
                </div>
                <button
                  onClick={() => handleMigrateNode(item.id as NodeId, item.targetAlgorithm as CryptoAlgorithm)}
                  className="btn btn-secondary px-2 py-0.5 text-xs"
                >
                  QUEUE
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node Crypto Management */}
      <div className="divider" />
      <span className="text-neutral-500 text-xs uppercase tracking-wider">NODE CRYPTO MANAGEMENT</span>
      <div className="space-y-1 max-h-40 overflow-auto" style={{ fontSize: '10px' }}>
        {nodesWithCrypto.slice(0, 15).map(node => {
          const crypto = node.crypto;
          const info = ALGO_INFO[crypto.algorithm];
          const recommended = getRecommendedMigration(crypto.algorithm);
          return (
            <div key={node.id} className="panel p-2 flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${QR_BADGE[crypto.quantumResistance]}`}>
                {crypto.quantumResistance === QR.FULL ? <CheckCircle className="w-4 h-4" /> :
                 crypto.quantumResistance === QR.PARTIAL ? <AlertTriangle className="w-4 h-4" /> :
                 <XCircle className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-neutral-100">
                  <span className="truncate">{node.label}</span>
                  <Badge className={QR_BADGE[crypto.quantumResistance]}>{QR_LABEL[crypto.quantumResistance]}</Badge>
                </div>
                <div className="text-xs text-neutral-500">{crypto.algorithm} • Expires {new Date(crypto.expiresAt).toLocaleDateString()}</div>
              </div>
              {recommended && (
                <button
                  onClick={() => handleMigrateNode(node.id, recommended)}
                  className="btn btn-secondary px-2 py-0.5 text-xs"
                >
                  MIGRATE → {recommended}
                </button>
              )}
              <button
                onClick={() => handleRotateKey(node.id)}
                className="btn btn-ghost px-1.5 py-0.5"
                title="Rotate Key"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        {nodesWithCrypto.length === 0 && (
          <div className="text-center text-neutral-500 py-4 text-xs">No nodes with crypto profiles</div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: React.FC<{ className?: string }>; variant?: 'accent' | 'warning' | 'danger' }> = ({
  label, value, icon: Icon, variant,
}) => (
  <div className={`panel p-3 ${variant ? `border-${variant}` : ''}`}>
    <div className="flex items-center justify-between">
      <div>
        <div className="text-neutral-500 text-xs uppercase tracking-wider">{label}</div>
        <div className={`text-2xl font-mono font-bold ${variant === 'accent' ? 'text-accent' : variant === 'warning' ? 'text-warning' : variant === 'danger' ? 'text-danger' : 'text-neutral-100'}`}>
          {value}
        </div>
      </div>
      <Icon className="w-6 h-6 text-neutral-600" />
    </div>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`badge ${className} px-1.5 py-0.5 text-[9px]`}>{children}</span>
);