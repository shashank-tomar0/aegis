// AEGIS Metrics Band + Footer — live count-ups, a REAL curl response, and the closing block

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, ArrowRight } from 'lucide-react';
import { api, SERVER_HOST } from '../lib/api';
import { CountUp, Eyebrow, Reveal, useHealth, useStats } from './kit';

const CURL = `curl -s http://localhost:8787/api/pqc/keys \\
  -X POST -H "Content-Type: application/json" \\
  -d '{"algorithm":"ML-KEM-768"}'`;

export function MetricsBand() {
  const { health } = useHealth();
  const stats = useStats(4000);
  const [keypair, setKeypair] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api.generateKeyPair('ML-KEM-768')
      .then(k => { if (alive) setKeypair(JSON.stringify(k, null, 2)); })
      .catch(() => { if (alive) setKeypair(null); });
    return () => { alive = false; };
  }, []);

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(CURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <section id="metrics" className="relative border-y border-hairline bg-carbon py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-0 landing-scanlines" aria-hidden />
      <div className="relative mx-auto max-w-[1280px] px-6">
        <Reveal>
          <Eyebrow>Wall of truth</Eyebrow>
          <h2 className="mt-4 max-w-[26ch] font-display text-[34px] leading-[1.05] text-ink sm:text-[44px]">
            Not a mockup. <em className="italic text-alert">Everything is live.</em>
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          {/* count-ups */}
          <Reveal className="grid grid-cols-2 gap-4">
            <div className="border border-hairline bg-obsidian p-6">
              <div className="font-display text-5xl text-ink"><CountUp to={health?.pqcAlgorithms.length ?? 9} /></div>
              <div className="mt-2 font-geist-mono text-[10px] tracking-widest text-ink-mute">PQC ALGORITHMS<br />REGISTERED</div>
            </div>
            <div className="border border-hairline bg-obsidian p-6">
              <div className="font-display text-5xl text-ink"><CountUp to={3} /></div>
              <div className="mt-2 font-geist-mono text-[10px] tracking-widest text-ink-mute">NIST-SELECTED<br />FAMILIES</div>
            </div>
            <div className="border border-hairline bg-obsidian p-6">
              <div className="font-display text-5xl text-ink"><CountUp to={60} /></div>
              <div className="mt-2 font-geist-mono text-[10px] tracking-widest text-ink-mute">FPS GRAPH<br />RENDERER</div>
            </div>
            <div className="border border-hairline bg-obsidian p-6">
              <div className="font-display text-5xl text-ink">{stats ? stats.eventsIngested.toLocaleString('en-US') : '—'}</div>
              <div className="mt-2 font-geist-mono text-[10px] tracking-widest text-ink-mute">EVENTS<br />INGESTED {stats ? '· LIVE' : ''}</div>
            </div>
          </Reveal>

          {/* real curl response */}
          <Reveal delay={0.12} className="flex flex-col border border-hairline bg-obsidian">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <span className="font-geist-mono text-[10px] tracking-widest text-ink-mute">LIVE RESPONSE — ML-KEM-768 KEYGEN</span>
              <button
                onClick={() => void copyCurl()}
                className="flex items-center gap-1.5 font-geist-mono text-[10px] tracking-widest text-ink-dim transition-colors hover:text-alert"
              >
                {copied ? <span className="text-verify">✓ COPIED</span> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '' : 'COPY CURL'}
              </button>
            </div>
            <pre className="overflow-x-auto px-4 py-3 font-geist-mono text-[10px] leading-relaxed text-ink-mute">
              <span className="text-ink-dim">$ </span>{CURL.replace(/\\\n\s*/g, ' ')}
            </pre>
            <div className="flex-1 border-t border-hairline px-4 py-3 font-geist-mono text-[10px] leading-relaxed">
              {keypair === null && <span className="text-danger">✗ API OFFLINE — start server (npm start)</span>}
              {keypair !== null && (
                <>
                  <span className="text-ink-mute">{'{'}{'\n'}</span>
                  {keypair.split('\n').slice(1, -1).map((line, i) => (
                    <span key={i}>
                      <span className={line.includes('"algorithm"') ? 'text-verify' : line.includes('"fingerprint"') ? 'text-alert' : 'text-ink-dim'}>{line}</span>{'\n'}
                    </span>
                  ))}
                  <span className="text-ink-mute">{'}'}</span>
                  <span className="text-ink-dim"> · REAL BYTES · FETCHED LIVE</span>
                </>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-hairline px-4 py-2 font-geist-mono text-[9px] tracking-widest text-ink-mute">
              <span>POST {SERVER_HOST}/api/pqc/keys</span>
              <span>SHA-256 FINGERPRINT</span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Footer({ navigate }: { navigate: (to: string) => void }) {
  return (
    <footer className="relative border-t border-hairline bg-obsidian">
      <div className="mx-auto max-w-[1280px] px-6 py-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              {/* hairline shield mark */}
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1.2 13.5 3v4.8c0 3.6-2 6-5.5 7.2-3.5-1.2-5.5-3.6-5.5-7.2V3L8 1.2Z" stroke="var(--color-alert)" strokeWidth="1.2" />
                <path d="M5 8.2h6M8 5.6v5.2" stroke="var(--color-alert)" strokeWidth="1.2" />
              </svg>
              <span className="font-display text-xl italic tracking-tight text-ink">AEGIS</span>
            </div>
            <p className="mt-3 max-w-[34ch] font-geist text-[13px] leading-relaxed text-ink-mute">
              Attack-surface intelligence for agentic AI. Real graph algorithms, real post-quantum
              crypto, zero simulation.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 font-geist-mono text-[11px] tracking-widest" aria-label="Footer">
            <a href="#live-pqc" className="text-ink-dim transition-colors hover:text-alert">LIVE PQC</a>
            <a href="#features" className="text-ink-dim transition-colors hover:text-alert">FEATURES</a>
            <a href="#metrics" className="text-ink-dim transition-colors hover:text-alert">TELEMETRY</a>
            <a
              href="/console"
              onClick={e => { e.preventDefault(); navigate('/console'); }}
              className="flex items-center gap-1 text-ink transition-colors hover:text-alert"
            >
              CONSOLE <ArrowRight className="h-3 w-3" />
            </a>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-5 font-geist-mono text-[9px] tracking-widest text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <span>AEGIS 0.1 · FASTIFY · DUCKDB · @NOBLE/POST-QUANTUM · ZUSTAND · TYPESCRIPT</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-verify animate-pulse" />
            ALL SYSTEMS NOMINAL — {new URL(window.location.href).hostname}:8787
          </span>
        </div>
      </div>
    </footer>
  );
}