// AEGIS Collectors — real-world discovery sources
// Each collector touches the actual environment it claims: OS processes, Docker,
// GitHub's public API, or (clearly badged) a simulated enterprise for zero-cred demos.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface CollectorNode {
  id: string;
  kind: 'agent' | 'tool' | 'data_source' | 'gateway' | 'user';
  label: string;
  metadata?: Record<string, unknown>;
  riskScore?: number;
  severity?: number;
  cryptoProfile?: { algorithm: string; keySize: number; quantumResistance: number; nistLevel: number };
}

export interface CollectorEdge {
  id: string;
  source: string;
  target: string;
  kind: 'invocation' | 'data_flow' | 'privilege' | 'delegation' | 'observation';
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface CollectorResult {
  name: string;
  source: string;
  simulated: boolean;
  available: boolean;
  note?: string;
  nodes: CollectorNode[];
  edges: CollectorEdge[];
  log: string[];
}

export interface CollectorDef {
  name: string;
  description: string;
  simulated: boolean;
  probe: () => { available: boolean; note?: string };
  run: () => Promise<CollectorResult>;
}

const K = {
  INVOCATION: 'invocation' as const,
  DATA_FLOW: 'data_flow' as const,
  PRIVILEGE: 'privilege' as const,
  DELEGATION: 'delegation' as const,
};

// ---------------------------------------------------------------------------
// process — the actual machine
// ---------------------------------------------------------------------------

const PROCESS_DENYLIST = new Set([
  'System Idle Process', 'System', 'Registry', 'MemCompression', 'csrss.exe', 'wininit.exe',
  'winlogon.exe', 'services.exe', 'lsass.exe', 'dwm.exe', 'fontdrvhost.exe', 'svchost.exe',
  'conhost.exe', 'WmiPrvSE.exe', 'spoolsv.exe', 'taskhostw.exe', 'explorer.exe', 'dllhost.exe',
  'RuntimeBroker.exe', 'sihost.exe', 'SecurityHealthService.exe', 'svchost',
]);

async function processCollector(): Promise<CollectorResult> {
  const isWin = process.platform === 'win32';
  const log: string[] = [];
  let raw = '';
  try {
    if (isWin) {
      const { stdout } = await execFileP('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 8000, windowsHide: true });
      raw = stdout;
    } else {
      const { stdout } = await execFileP('ps', ['-eo', 'pid=,comm=,args='], { timeout: 8000 });
      raw = stdout;
    }
  } catch (err) {
    return { name: 'process', source: `os://${process.platform}`, simulated: false, available: false, note: `process enumeration failed: ${err instanceof Error ? err.message : String(err)}`, nodes: [], edges: [], log: [`✗ ${String(err)}`] };
  }

  const nodes: CollectorNode[] = [];
  const seen = new Set<string>();
  if (isWin) {
    // CSV lines: "image","pid","session","session#","mem"
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
      if (cols.length < 5) continue;
      const [image, pid, , , memStr] = cols;
      const name = image.toLowerCase();
      if (PROCESS_DENYLIST.has(image) || PROCESS_DENYLIST.has(name)) continue;
      if (seen.has(image)) continue;
      seen.add(image);
      const memBytes = parseInt(memStr.replace(/[^\d]/g, ''), 10);
      nodes.push({
        id: `os:proc:${pid}`,
        kind: 'tool',
        label: image.replace(/\.exe$/i, '').toUpperCase(),
        metadata: { pid: pid, memoryBytes: memBytes || undefined, host: process.env.COMPUTERNAME ?? 'localhost' },
      });
      if (nodes.length >= 120) break;
    }
    seen.clear();
  } else {
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
      if (!m) continue;
      const [, pid, comm, args] = m;
      if (PROCESS_DENYLIST.has(comm)) continue;
      const key = comm.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({
        id: `os:proc:${pid}`,
        kind: 'tool',
        label: comm.toUpperCase().replace(/\.exe$/i, ''),
        metadata: { pid: Number(pid), command: args.slice(0, 120), host: 'localhost' },
      });
      if (nodes.length >= 120) break;
    }
  }

  log.push(`✓ enumerated ${nodes.length} live processes via ${isWin ? 'tasklist' : 'ps'}`);
  return { name: 'process', source: `os://${process.platform}`, simulated: false, available: true, nodes, edges: [], log };
}

// ---------------------------------------------------------------------------
// docker — containers + networks as topology
// ---------------------------------------------------------------------------

async function dockerCollector(): Promise<CollectorResult> {
  const log: string[] = [];
  let ps = '';
  try {
    const { stdout } = await execFileP('docker', ['ps', '--no-trunc', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Networks}}'], { timeout: 12000 });
    ps = stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'docker', source: 'docker://local', simulated: false, available: false, note: `docker unavailable: ${msg}`, nodes: [], edges: [], log: [`✗ ${msg}`] };
  }

  const nodes: CollectorNode[] = [];
  const edges: CollectorEdge[] = [];
  const networkNames = new Set<string>();

  for (const line of ps.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [id, name, image, nets] = line.split('|');
    if (!name) continue;
    const netsArr = (nets ?? '').split(',').map(s => s.trim()).filter(Boolean);
    netsArr.forEach(n => networkNames.add(n));
    const isAgentish = /agent|worker|runner|bot|api/i.test(name);
    nodes.push({
      id: `docker:c:${id}`,
      kind: isAgentish ? 'agent' : 'tool',
      label: name.toUpperCase(),
      metadata: { image, dockerId: id.slice(0, 12), networks: netsArr },
    });
    for (const net of netsArr) {
      edges.push({
        id: `docker:e:${id}:${net}`,
        source: `docker:c:${id}`,
        target: `docker:net:${net}`,
        kind: K.INVOCATION,
        weight: 1,
        metadata: { network: net },
      });
    }
  }

  for (const net of networkNames) {
    nodes.push({ id: `docker:net:${net}`, kind: 'gateway', label: `NET:${net.toUpperCase()}`, metadata: { network: net } });
  }

  log.push(`✓ docker: ${nodes.filter(n => n.kind === 'tool' || n.kind === 'agent').length} containers, ${networkNames.size} networks`);
  return { name: 'docker', source: 'docker://local', simulated: false, available: true, nodes, edges, log };
}

// ---------------------------------------------------------------------------
// github — a real org's repos, action workflows, secrets, members
// ---------------------------------------------------------------------------

interface GhRepo { name: string; private: boolean; language: string | null; updated_at: string; default_branch: string; }

async function githubCollector(): Promise<CollectorResult> {
  const org = process.env.AEGIS_GITHUB_ORG?.trim() || 'vercel';
  const token = process.env.AEGIS_GITHUB_TOKEN?.trim() || '';
  const log: string[] = [];
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const gh = async <T>(path: string): Promise<T[]> => {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aegis-collector', ...authHeaders },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
    return res.json() as Promise<T[]>;
  };

  try {
    log.push(`✓ org: ${org}${token ? ' (token auth)' : ' (tokenless, public repos)'}`);
    const repos = (await gh<GhRepo>(`/orgs/${org}/repos?per_page=100&sort=updated`)).slice(0, 60);
    log.push(`✓ repos: ${repos.length}`);

    const nodes: CollectorNode[] = [
      { id: `github:org:${org}`, kind: 'gateway', label: `GH:${org.toUpperCase()}`, metadata: { org } },
    ];
    const edges: CollectorEdge[] = [];

    for (const repo of repos) {
      nodes.push({
        id: `github:repo:${org}/${repo.name}`,
        kind: 'tool',
        label: repo.name.toUpperCase(),
        metadata: { language: repo.language, private: repo.private, defaultBranch: repo.default_branch, updatedAt: repo.updated_at },
      });
      edges.push({
        id: `github:e:org:${org}/repo:${repo.name}`,
        source: `github:org:${org}`,
        target: `github:repo:${org}/${repo.name}`,
        kind: K.DELEGATION,
        weight: 1,
      });
    }

    // Action workflows → agent nodes (bounded: first 8 repos, 20 workflows each)
    const workflowRepos = repos.slice(0, 8);
    for (const repo of workflowRepos) {
      try {
        const wfs = await gh<{ id: number; name: string; state: string }>(`/repos/${org}/${repo.name}/actions/workflows?per_page=20`);
        for (const wf of wfs) {
          nodes.push({
            id: `github:wf:${org}/${repo.name}:${wf.id}`,
            kind: 'agent',
            label: `WF:${wf.name.toUpperCase()}`,
            metadata: { repo: repo.name, workflowId: wf.id, state: wf.state },
          });
          edges.push({
            id: `github:e:wf:${wf.id}`,
            source: `github:wf:${org}/${repo.name}:${wf.id}`,
            target: `github:repo:${org}/${repo.name}`,
            kind: K.INVOCATION,
            weight: 0.9,
            metadata: { workflow: wf.name },
          });
        }
      } catch {
        log.push(`→ workflows skipped for ${repo.name}`);
      }
    }

    // Org secrets → data nodes (requires token)
    if (token) {
      try {
        const secrets = await gh<{ name: string; created_at: string }>(`/orgs/${org}/actions/secrets`);
        for (const s of secrets) {
          nodes.push({
            id: `github:secret:${org}:${s.name}`,
            kind: 'data_source',
            label: `SECRET:${s.name}`,
            metadata: { sensitivity: 'critical', createdAt: s.created_at },
            riskScore: 0.95,
            severity: 4,
            cryptoProfile: { algorithm: 'ML-DSA-87', keySize: 87, quantumResistance: 2, nistLevel: 5 },
          });
          edges.push({
            id: `github:e:secret:${s.name}`,
            source: `github:org:${org}`,
            target: `github:secret:${org}:${s.name}`,
            kind: K.PRIVILEGE,
            weight: 0.8,
          });
        }
        log.push(`✓ secrets: ${secrets.length} (names only — values never leave GitHub)`);
      } catch {
        log.push('→ secrets skipped: requires org admin token');
      }
    } else {
      log.push('→ secrets skipped: set AEGIS_GITHUB_TOKEN for org secrets');
    }

    // Public members → users
    try {
      const members = await gh<{ login: string }>(`/orgs/${org}/public_members?per_page=30`);
      for (const m of members) {
        nodes.push({ id: `github:user:${m.login}`, kind: 'user', label: m.login.toUpperCase(), metadata: { role: 'public-member' } });
      }
      log.push(`✓ members: ${members.length}`);
    } catch {
      /* public members list may be empty/private */
    }

    return { name: 'github', source: `github://org/${org}`, simulated: false, available: true, nodes, edges, log };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: 'github', source: `github://org/${org}`, simulated: false, available: false, note: msg, nodes: [], edges: [], log: [`✗ ${msg}`] };
  }
}

// ---------------------------------------------------------------------------
// simulated — a clearly-badged demo enterprise (zero credentials needed)
// ---------------------------------------------------------------------------

function simulatedCollector(): CollectorResult {
  const org = 'demo-enterprise';
  const n = (id: string, kind: CollectorNode['kind'], label: string, metadata?: Record<string, unknown>): CollectorNode => ({
    id: `sim:${id}`, kind, label, metadata,
  });
  const nodes: CollectorNode[] = [
    n('gw', 'gateway', 'API-GW-01', { org, ingress: true }),
    n('edge', 'gateway', 'LLM-EDGE', { org }),
    n('a1', 'agent', 'SWE-AGENT', { capabilities: ['code', 'review'] }),
    n('a2', 'agent', 'DATA-AGENT', { capabilities: ['sql', 'warehouse'] }),
    n('a3', 'agent', 'WEB-AGENT', { capabilities: ['browsing'] }),
    n('a4', 'agent', 'MAIL-AGENT', { capabilities: ['inbound-triage'] }),
    n('a5', 'agent', 'FIN-OPS', { capabilities: ['billing'] }),
    n('a6', 'agent', 'RECRUITER', { capabilities: ['outreach'] }),
    n('t1', 'tool', 'GITHUB', {}), n('t2', 'tool', 'SLACK', {}),
    n('t3', 'tool', 'POSTGRES', {}), n('t4', 'tool', 'S3-BUCKET', {}),
    n('t5', 'tool', 'STRIPE-PAY', {}),
    n('d1', 'data_source', 'PII-STORE', { sensitivity: 'high' }),
    n('d2', 'data_source', 'CREDENTIALS', { sensitivity: 'critical' }, ),
    n('d3', 'data_source', 'AUDIT-LOG', { sensitivity: 'critical' }),
    n('u1', 'user', 'ADMIN', { role: 'admin' }),
  ];
  const d2 = nodes.find(x => x.id === 'sim:d2')!;
  d2.riskScore = 0.95; d2.severity = 4;
  d2.cryptoProfile = { algorithm: 'ML-DSA-87', keySize: 87, quantumResistance: 2, nistLevel: 5 };

  const e = (id: string, s: string, t: string, kind: CollectorEdge['kind'], w = 1): CollectorEdge => ({
    id: `sim:e:${id}`, source: `sim:${s}`, target: `sim:${t}`, kind, weight: w,
  });
  const edges: CollectorEdge[] = [
    e('1', 'u1', 'gw', K.INVOCATION), e('2', 'gw', 'a1', K.DELEGATION, 0.9),
    e('3', 'gw', 'a2', K.DELEGATION, 0.8), e('4', 'gw', 'a4', K.INVOCATION, 0.6),
    e('5', 'a1', 't1', K.INVOCATION), e('6', 'a1', 't2', K.INVOCATION, 0.6),
    e('7', 'a2', 't3', K.DATA_FLOW), e('8', 'a3', 't4', K.DATA_FLOW, 0.8),
    e('9', 'a4', 'd1', K.DATA_FLOW, 0.9), e('10', 'a5', 't5', K.PRIVILEGE, 0.8),
    e('11', 'a5', 'd2', K.PRIVILEGE, 0.7), e('12', 'a2', 'd1', K.DATA_FLOW, 0.8),
    e('13', 'gw', 'd3', K.DATA_FLOW, 0.9), e('14', 'a6', 't2', K.INVOCATION, 0.6),
    e('15', 'a6', 'd1', K.DATA_FLOW, 0.8), e('16', 'edge', 'a3', K.INVOCATION, 0.9),
    e('17', 'gw', 'd2', K.PRIVILEGE, 0.5),
  ];

  return {
    name: 'simulated', source: 'sim://demo-enterprise', simulated: true, available: true,
    note: 'SIMULATED dataset — explore the product flow without any credentials. Not real infrastructure.',
    nodes, edges,
    log: ['⚠ SIMULATED enterprise — for product walkthroughs only, not real infrastructure'],
  };
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export const COLLECTORS: CollectorDef[] = [
  {
    name: 'process',
    description: 'Live processes on this machine (tasklist / ps)',
    simulated: false,
    probe: () => ({ available: true }),
    run: processCollector,
  },
  {
    name: 'docker',
    description: 'Local Docker containers + networks (docker ps / network ls)',
    simulated: false,
    probe: () => {
      try { execFileSync('docker', ['--version'], { timeout: 5000, stdio: 'ignore', windowsHide: true }); return { available: true }; }
      catch { return { available: false, note: 'docker CLI not found' }; }
    },
    run: dockerCollector,
  },
  {
    name: 'github',
    description: `Real GitHub org inventory (org: ${process.env.AEGIS_GITHUB_ORG || 'vercel'}) — repos, workflows, secrets, members`,
    simulated: false,
    probe: () => ({ available: true }),
    run: githubCollector,
  },
  {
    name: 'simulated',
    description: 'Demo enterprise dataset (clearly badged, no credentials needed)',
    simulated: true,
    probe: () => ({ available: true }),
    run: async () => simulatedCollector(),
  },
];

export function getCollector(name: string): CollectorDef | null {
  return COLLECTORS.find(c => c.name === name) ?? null;
}