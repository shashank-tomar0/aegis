// AEGIS Landing — shared motion + data primitives
// Split-word reveals, in-view count-ups, and REAL server hooks (no fakes)

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';
import type { ApiHealth } from '../../shared/types';
import { SERVER_HOST } from '../lib/api';

export { SERVER_HOST };

export const EASE_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_SNAP = [0.22, 1, 0.36, 1] as const;

/** Word-by-word masked reveal for display headlines */
export function SplitWords({
  text, className, delay = 0, as: Tag = 'span',
}: { text: string; className?: string; delay?: number; as?: 'span' | 'h1' | 'h2' }) {
  const words = text.split(' ');
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-top">
          <motion.span
            className="inline-block will-change-transform"
            initial={{ y: '115%' }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, margin: '-8% 0px' }}
            transition={{ duration: 0.85, ease: EASE_EXPO, delay: delay + i * 0.055 }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Fade + rise section reveal */
export function Reveal({
  children, className, delay = 0, y = 28,
}: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.8, ease: EASE_EXPO, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Animated count-up that starts when scrolled into view */
export function CountUp({ to, className, duration = 1.4, format }: {
  to: number; className?: string; duration?: number; format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return <span ref={ref} className={className}>{format ? format(val) : Math.round(val).toLocaleString('en-US')}</span>;
}

/** Section eyebrow label — mono, alert dash */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-geist-mono text-[11px] uppercase tracking-[0.22em] text-alert ${className ?? ''}`}>
      <span className="h-px w-8 bg-alert/70" aria-hidden />
      {children}
    </div>
  );
}

// ---- Real server hooks -----------------------------------------------------

export interface TelemetryShape {
  uptimeSeconds: number;
  eventsIngested: number;
  queriesExecuted: number;
  sessionsCreated: number;
  pqcOperations: number;
  sseClients: number;
  startedAt: number;
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_HOST}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Poll health once (mounted once, silent failure) */
export function useHealth(): { health: ApiHealth | null; latencyMs: number | null; error: string | null; refresh: () => void } {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    getJson<ApiHealth>('/api/health')
      .then(h => { if (alive) { setHealth(h); setLatencyMs(Math.round(performance.now() - t0)); setError(null); } })
      .catch(e => { if (alive) { setHealth(null); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { alive = false; };
  }, [nonce]);

  return { health, latencyMs, error, refresh: () => setNonce(n => n + 1) };
}

/** Poll stats snapshot at an interval */
export function useStats(intervalMs = 2500): TelemetryShape | null {
  const [stats, setStats] = useState<TelemetryShape | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getJson<TelemetryShape>('/api/stats').then(s => { if (alive) setStats(s); }).catch(() => { if (alive) setStats(null); });
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return stats;
}

/** Subscribe to the server's SSE telemetry stream */
export function useTelemetryStream(): { stats: TelemetryShape | null; live: boolean } {
  const [stats, setStats] = useState<TelemetryShape | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource(`${SERVER_HOST}/api/stream`);
    es.onopen = () => setLive(true);
    es.onmessage = (ev) => {
      try { setStats(JSON.parse(ev.data) as TelemetryShape); } catch { /* ignore malformed */ }
    };
    es.onerror = () => setLive(false);
    return () => es.close();
  }, []);

  return { stats, live };
}

export function fmtUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Smooth-scroll to a landing section (Lenis-aware) */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement, o?: { offset?: number }) => void } }).__lenis;
  if (lenis) lenis.scrollTo(el, { offset: -72 });
  else el.scrollIntoView({ behavior: 'smooth' });
}

/** Ask the PQC sandbox to run a flow (used by Cmd+K / hero CTA) */
export function runSandbox(flow: 'kem' | 'dsa' | 'slh'): void {
  window.dispatchEvent(new CustomEvent('aegis:run-sandbox', { detail: flow }));
  scrollToId('live-pqc');
}

export const variants = {
  line: { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } },
} satisfies Record<string, Variants>;
