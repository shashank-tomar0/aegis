// AEGIS Server Panel — full-stack backend integration UI
// Connection, sessions, PQC playground, remote DuckDB analytics

import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { api } from '../../lib/api';
import type {
  ApiHealth, PqcKeyPairResult, PqcSignResult, PqcCapsuleResult,
  IssuedCertificate, QueryResult, SessionSnapshot,
} from '../../../shared/types';
import {
  Server, RefreshCw, PlugZap, Plug, Plus, Copy, KeyRound, PenLine, Send, Terminal,
  ShieldCheck, Database, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Trash2,
} from 'lucide-react';

const ALGORITHMS = [
  'ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024',
  'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87',
  'SLH-DSA-SHAKE-128F', 'SLH-DSA-SHAKE-192F', 'SLH-DSA-SHAKE-256F',
];

export const ServerPanel: React.FC = () => {
  const { serverStatus, isConnectingServer, serverSession, isSyncingServer } =
    useStore((s: any) => s);
  const connectServer = useStore((s: any) => s.connectServer);
  const refreshSessions = useStore((s: any) => s.refreshSessions);
  const createServerSession = useStore((s: any) => s.createServerSession);
  const syncGraphToServer = useStore((s: any) => s.syncGraphToServer);
  const pushEventToServer = useStore((s: any) => s.pushEventToServer);

  const [showPqc, setShowPqc] = useState(false);
  const [keyResult, setKeyResult] = useState<PqcKeyPairResult | null>(null);
  const [signResult, setSignResult] = useState<PqcSignResult | null>(null);
  const [capsuleResult, setCapsuleResult] = useState<PqcCapsuleResult | null>(null);
  const [certResult, setCertResult] = useState<IssuedCertificate | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [querySql, setQuerySql] = useState('SELECT event_type, severity, COUNT(*) as c FROM events GROUP BY event_type, severity');
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const connected = serverStatus?.connected === true;

  useEffect(() => {
    if (!connected) return;
    refreshSessions().catch(console.error);
  }, [connected, refreshSessions]);

  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setRunning(r => ({ ...r, [key]: true }));
    try {
      await fn();
    } catch (err) {
      console.error(`[Server] ${key} failed:`, err);
      alert(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  };

  const handleKeygen = (algo: string) =>
    run('keygen', async () => setKeyResult(await api.generateKeyPair(algo)));

  const handleSign = (algo: string, msg: string) =>
    run('sign', async () => setSignResult(await api.signMessage(msg, algo)));

  const handleCapsule = (algo: string) =>
    run('capsule', async () => {
      // Capsulate to the pubkey of the last generated keypair (or generate fresh)
      const kp = keyResult ?? await api.generateKeyPair(algo);
      if (!keyResult) setKeyResult(kp);
      setCapsuleResult(await api.encapsulate(kp.publicKeyB64, algo));
    });

  const handleCert = (subject: string, algo: string, days: number) =>
    run('cert', async () => {
      setCertResult(await api.issueCertificate({ subject, algorithm: algo, validityDays: days }));
      await pushEventToServer('CERT_ISSUED', 'server', 1, { subject, algorithm: algo });
    });

  const handleQuery = () =>
    run('query', async () => setQueryResult(await api.runQuery(querySql)));

  const handleSync = () =>
    run('sync', async () => {
      const ok = await syncGraphToServer();
      if (ok) await pushEventToServer('GRAPH_SYNCED', 'client', 0, {});
    });

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {/* Connection Status */}
      <div className={`panel p-3 border ${connected ? 'border-accent/50' : 'border-danger/50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className={`w-4 h-4 ${connected ? 'text-accent' : 'text-danger'}`} />
            <span className="font-bold text-neutral-100">AEGIS SERVER</span>
            <span className={`badge ${connected ? 'badge-accent' : 'badge-danger'}`}>
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
          <button
            onClick={() => connectServer()}
            disabled={isConnectingServer}
            className="btn btn-ghost px-2 py-1"
            title="Reconnect"
          >
            {isConnectingServer
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
        {connected && serverStatus?.health && (
          <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
            <Info label="VERSION" value={serverStatus.health.version} />
            <Info label="UPTIME" value={`${Math.floor(serverStatus.health.uptimeSeconds / 60)}m`} />
            <Info label="LATENCY" value={`${serverStatus.latencyMs ?? '?'}ms`} />
            <Info label="ALGORITHMS" value={String(serverStatus.health.pqcAlgorithms.length)} />
          </div>
        )}
        {!connected && serverStatus?.error && (
          <div className="mt-2 text-[10px] text-danger">{(serverStatus.error as string).slice(0, 200)}</div>
        )}
      </div>

      {/* Session Management */}
      <details className="panel" open>
        <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-800/40 text-neutral-400">
          <Database className="w-3.5 h-3.5" />
          <span className="text-neutral-200">SERVER SESSIONS</span>
          {serverSession && <span className="badge badge-accent text-[8px]">ACTIVE</span>}
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <div className="flex gap-1.5">
            <button
              onClick={() => createServerSession('Client session')}
              disabled={!connected || running.create}
              className="btn btn-primary flex-1 justify-center py-1.5 text-[10px]"
            >
              <Plus className="w-3 h-3" /> NEW SESSION
            </button>
            <button
              onClick={() => handleSync()}
              disabled={!connected || !serverSession || isSyncingServer}
              className="btn btn-secondary flex-1 justify-center py-1.5 text-[10px]"
            >
              {isSyncingServer ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              SYNC GRAPH
            </button>
          </div>
          {serverSession && (
            <div className="text-[9px] text-neutral-500 bg-neutral-800/50 rounded p-2">
              SESSION: {serverSession.id.slice(0, 16)}…
              <br />
              created {new Date(serverSession.createdAt).toLocaleString()}
            </div>
          )}
        </div>
      </details>

      {/* PQC Playground */}
      <details className="panel" open={showPqc}>
        <summary
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-800/40 text-neutral-400"
          onClick={() => setShowPqc(!showPqc)}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span className="text-neutral-200">PQC PLAYGROUND</span>
          {showPqc ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
        </summary>
        <div className="px-3 pb-3 space-y-2 mt-1">
          {/* Keygen */}
          <div>
            <Label>KEY GENERATION</Label>
            <div className="flex gap-1.5">
              <select className="input flex-1 px-2 py-1 text-[10px]" defaultValue="ML-KEM-768">
                {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button
                onClick={(e) => handleKeygen((e.currentTarget.previousElementSibling as HTMLSelectElement).value)}
                disabled={!connected || running.keygen}
                className="btn btn-secondary px-2 py-1 text-[10px]"
              >
                {running.keygen ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                KEYGEN
              </button>
            </div>
            {keyResult && (
              <div className="mt-1 p-2 bg-neutral-800/50 rounded space-y-0.5 text-[9px]">
                <Row k="ALGO" v={keyResult.algorithm} />
                <Row k="FP" v={keyResult.fingerprint.slice(0, 24)} mono />
                <Row k="PK" v={`${keyResult.publicKeyB64.slice(0, 18)}…`} mono />
                <Row k="SK" v={`${keyResult.secretKeyB64.slice(0, 18)}…`} mono />
                <CopyBtn value={JSON.stringify(keyResult)} />
              </div>
            )}
          </div>

          {/* Sign */}
          <div>
            <Label>PQC SIGN (ML-DSA)</Label>
            <div className="flex gap-1.5">
              <input
                id="sign-msg"
                className="input flex-1 px-2 py-1 text-[10px]"
                placeholder="Message to sign"
                defaultValue="AEGIS attestation #42"
              />
              <select id="sign-algo" className="input w-36 px-2 py-1 text-[10px]" defaultValue="ML-DSA-65">
                {['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHAKE-128F'].map(a => <option key={a}>{a}</option>)}
              </select>
              <button
                onClick={() => handleSign(
                  (document.getElementById('sign-algo') as HTMLSelectElement).value,
                  (document.getElementById('sign-msg') as HTMLInputElement).value,
                )}
                disabled={!connected || running.sign}
                className="btn btn-secondary px-2 py-1 text-[10px]"
              >
                {running.sign ? <Loader2 className="w-3 h-3 animate-spin" /> : <PenLine className="w-3 h-3" />}
                SIGN
              </button>
            </div>
            {signResult && (
              <div className="mt-1 p-2 bg-neutral-800/50 rounded text-[9px] space-y-0.5">
                <Row k="ALGO" v={signResult.algorithm} />
                <Row k="VERIFIED" v={String(signResult.verified)} />
                <Row k="SIG" v={`${signResult.signatureBytes} bytes @ ${signResult.messageHash.slice(0, 12)}`} />
              </div>
            )}
          </div>

          {/* Capsule */}
          <div>
            <Label>KEM CAPSULE (ML-KEM)</Label>
            <select id="kem-algo" className="input w-full px-2 py-1 text-[10px]" defaultValue="ML-KEM-768">
              {['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'].map(a => <option key={a}>{a}</option>)}
            </select>
            <button
              onClick={() => handleCapsule((document.getElementById('kem-algo') as HTMLSelectElement).value)}
              disabled={!connected || running.capsule}
              className="btn btn-secondary w-full justify-center py-1.5 text-[10px] mt-1"
            >
              {running.capsule ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              ENCAPSULATE
            </button>
            {capsuleResult && (
              <div className="mt-1 p-2 bg-neutral-800/50 rounded text-[9px] space-y-0.5">
                <Row k="ALGO" v={capsuleResult.algorithm} />
                <Row k="CT" v={`${capsuleResult.cipherTextB64.slice(0, 20)}…`} mono />
                <Row k="SS" v={`${capsuleResult.sharedSecretBytes} bytes @ shared sync`} />
              </div>
            )}
          </div>

          {/* Cert */}
          <div>
            <Label>PQC CERT ISSUANCE</Label>
            <div className="flex gap-1.5">
              <input id="cert-subject" className="input flex-1 px-2 py-1 text-[10px]" placeholder="Subject (e.g. api.internal)" defaultValue="api.internal" />
              <select id="cert-algo" className="input w-36 px-2 py-1 text-[10px]" defaultValue="ML-DSA-65">
                {['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHAKE-128F'].map(a => <option key={a}>{a}</option>)}
              </select>
              <button
                onClick={() => handleCert(
                  (document.getElementById('cert-subject') as HTMLInputElement).value,
                  (document.getElementById('cert-algo') as HTMLSelectElement).value,
                  90,
                )}
                disabled={!connected || running.cert}
                className="btn btn-secondary px-2 py-1 text-[10px]"
              >
                {running.cert ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                ISSUE
              </button>
            </div>
            {certResult && (
              <details className="mt-1">
                <summary className="text-[9px] text-neutral-500 cursor-pointer">cert {certResult.serial.slice(0, 8)} — {certResult.algorithm}</summary>
                <pre className="mt-1 p-2 bg-black/40 rounded text-[8px] text-neutral-400 overflow-x-auto whitespace-pre-wrap">{certResult.pem.slice(0, 400)}…</pre>
              </details>
            )}
          </div>
        </div>
      </details>

      {/* Remote Query */}
      <details className="panel" open>
        <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-800/40 text-neutral-400">
          <Terminal className="w-3.5 h-3.5" />
          <span className="text-neutral-200">SERVER DUCKDB QUERY</span>
        </summary>
        <div className="px-3 pb-3 space-y-2 mt-1">
          <textarea
            value={querySql}
            onChange={e => setQuerySql(e.target.value)}
            className="input min-h-[70px] resize-y px-2 py-1.5 text-[10px]"
          />
          <button
            onClick={handleQuery}
            disabled={!connected || running.query}
            className="btn btn-primary w-full justify-center py-1.5 text-[10px]"
          >
            {running.query ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            EXECUTE ON SERVER
          </button>
          {queryResult && (
            <div className="overflow-x-auto bg-black/40 rounded p-1.5">
              {queryResult.rowCount === 0 ? (
                <div className="text-[9px] text-neutral-500 text-center py-3">0 rows ({queryResult.executionTimeMs.toFixed(0)}ms)</div>
              ) : (
                <>
                  <table className="w-full text-[9px] border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-700">
                        {queryResult.columns.map(c => (
                          <th key={c} className="text-left px-1.5 py-1 text-neutral-400 uppercase text-[8px]">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b border-neutral-800/40">
                          {row.map((cell, j) => (
                            <td key={j} className="px-1.5 py-1 text-neutral-300 truncate max-w-[180px]">{String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {queryResult.rowCount > 20 && (
                    <div className="text-[8px] text-neutral-600 text-center py-1">+{queryResult.rowCount - 20} more rows</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between bg-neutral-800/40 rounded px-1.5 py-1">
    <span className="text-neutral-500 text-[8px] uppercase">{label}</span>
    <span className="text-neutral-200 text-[9px] font-mono">{value}</span>
  </div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[8px] uppercase tracking-wider text-neutral-500 mb-1">{children}</div>
);

const Row: React.FC<{ k: string; v: string; mono?: boolean }> = ({ k, v, mono }) => (
  <div className="flex justify-between gap-2">
    <span className="text-neutral-500 flex-shrink-0">{k}</span>
    <span className={`text-neutral-300 truncate ${mono ? 'font-mono' : ''}`}>{v}</span>
  </div>
);

const CopyBtn: React.FC<{ value: string }> = ({ value }) => (
  <button
    onClick={() => navigator.clipboard.writeText(value)}
    className="btn btn-ghost px-1.5 py-0.5 text-[8px] mt-1"
  >
    <Copy className="w-2.5 h-2.5 mr-1" /> COPY JSON
  </button>
);