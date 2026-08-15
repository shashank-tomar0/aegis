// AEGIS Landing — the marketing surface. Zero slop, all real.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Lenis from 'lenis';
import { Hero } from './Hero';
import { LiveStrip } from './LiveStrip';
import { Sandbox } from './Sandbox';
import { Features } from './Features';
import { MetricsBand, Footer } from './Sections';
import { useHealth, runSandbox, scrollToId, EASE_EXPO } from './kit';

// ---- command palette --------------------------------------------------------

interface Cmd { id: string; label: string; hint: string; run: () => void; }

function CmdPalette({ navigate, open, onClose }: {
  navigate: (to: string) => void; open: boolean; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cmds: Cmd[] = useMemo(() => [
    { id: 'hero', label: 'Goto — Hero', hint: 'top', run: () => scrollToId('top') },
    { id: 'kem', label: 'Run — ML-KEM handshake', hint: 'live', run: () => runSandbox('kem') },
    { id: 'dsa', label: 'Run — ML-DSA sign', hint: 'live', run: () => runSandbox('dsa') },
    { id: 'slh', label: 'Run — SLH-DSA sign', hint: 'live', run: () => runSandbox('slh') },
    { id: 'features', label: 'Goto — Capabilities', hint: 'section', run: () => scrollToId('features') },
    { id: 'metrics', label: 'Goto — Telemetry', hint: 'section', run: () => scrollToId('metrics') },
    { id: 'console', label: 'Open — AEGIS console', hint: '/console', run: () => navigate('/console') },
  ], [navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cmds;
    return cmds.filter(c => c.label.toLowerCase().includes(q) || c.hint.includes(q));
  }, [query, cmds]);

  useEffect(() => { if (open) { setQuery(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && filtered[sel]) { filtered[sel].run(); onClose(); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, sel, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-obsidian/70 backdrop-blur-[2px]"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="mx-auto mt-[12vh] w-[min(92vw,560px)] border border-hairline-strong bg-carbon shadow-[0_32px_90px_-20px_rgba(0,0,0,0.9)]"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
              <span className="font-geist-mono text-[10px] tracking-widest text-alert">AEGIS</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSel(0); }}
                placeholder="commands — try  'run'  or  'console'"
                className="flex-1 bg-transparent font-geist-mono text-[12px] text-ink outline-none placeholder:text-ink-mute"
                aria-label="Command filter"
              />
              <kbd className="border border-hairline px-1.5 py-0.5 font-geist-mono text-[9px] text-ink-mute">ESC</kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto p-1.5">
              {filtered.length === 0 && (
                <div className="px-3 py-4 font-geist-mono text-[11px] text-ink-mute">no command matches — “{query}”</div>
              )}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => { c.run(); onClose(); }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left font-geist-mono text-[11px] transition-colors ${
                    i === sel ? 'bg-hairline text-ink' : 'text-ink-dim'
                  }`}
                >
                  <span>{c.label}</span>
                  <span className="text-[9px] tracking-widest text-ink-mute">{c.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 font-geist-mono text-[9px] tracking-widest text-ink-mute">
              <span>↑↓ NAVIGATE</span><span>↵ RUN</span><span className="ml-auto">CTRL+K TOGGLE</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- nav -------------------------------------------------------------------

function Nav({ navigate, health, latencyMs }: {
  navigate: (to: string) => void; health: ReturnType<typeof useHealth>['health']; latencyMs: number | null;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-hairline bg-obsidian/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-6">
          <a href="#top" className="flex items-center gap-2.5" onClick={e => { e.preventDefault(); scrollToId('top'); }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 1.2 13.5 3v4.8c0 3.6-2 6-5.5 7.2-3.5-1.2-5.5-3.6-5.5-7.2V3L8 1.2Z" stroke="var(--color-alert)" strokeWidth="1.2" />
              <path d="M5 8.2h6M8 5.6v5.2" stroke="var(--color-alert)" strokeWidth="1.2" />
            </svg>
            <span className="font-display text-lg italic tracking-tight text-ink">AEGIS</span>
            <span className="hidden font-geist-mono text-[9px] tracking-[0.25em] text-ink-mute sm:inline">ATTACK-SURFACE INTEL</span>
          </a>

          <nav className="ml-auto hidden items-center gap-6 font-geist-mono text-[10px] tracking-widest md:flex" aria-label="Primary">
            <a href="#live-pqc" onClick={e => { e.preventDefault(); scrollToId('live-pqc'); }} className="text-ink-dim transition-colors hover:text-alert">LIVE PQC</a>
            <a href="#features" onClick={e => { e.preventDefault(); scrollToId('features'); }} className="text-ink-dim transition-colors hover:text-alert">CAPABILITIES</a>
            <a href="#metrics" onClick={e => { e.preventDefault(); scrollToId('metrics'); }} className="text-ink-dim transition-colors hover:text-alert">TELEMETRY</a>
          </nav>

          <div className="ml-auto flex items-center gap-3 md:ml-6">
            <span className="hidden items-center gap-2 font-geist-mono text-[9px] tracking-widest text-ink-mute lg:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${health ? 'bg-verify animate-pulse' : 'bg-danger animate-pulse'}`} />
              {health ? `SYSTEMS NOMINAL · ${latencyMs ?? '—'}MS` : 'API OFFLINE'}
            </span>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 border border-hairline px-2.5 py-1.5 font-geist-mono text-[10px] tracking-widest text-ink-mute transition-colors hover:border-hairline-strong hover:text-ink"
              aria-label="Open command palette"
            >
              ⌘K
            </button>
            <button
              onClick={() => navigate('/console')}
              className="border border-alert bg-alert px-4 py-1.5 font-geist-mono text-[10px] font-medium tracking-widest text-obsidian transition-colors hover:bg-alert-hot"
            >
              CONSOLE
            </button>
          </div>
        </div>
      </header>
      <CmdPalette navigate={navigate} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

// ---- page ------------------------------------------------------------------

export function Landing({ navigate }: { navigate: (to: string) => void }) {
  const { health, latencyMs } = useHealth();

  // Landing operates at a 16px root (console keeps its 13px mono root)
  useEffect(() => {
    document.documentElement.style.fontSize = '16px';
    return () => { document.documentElement.style.fontSize = ''; };
  }, []);

  // Lenis inertia scrolling
  useEffect(() => {
    let lenis: Lenis | null = null;
    let raf = 0;
    try {
      lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
      const loop = (t: number) => { lenis?.raf(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    } catch { /* native scroll fallback */ }
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  return (
    <div id="top" className="min-h-screen bg-obsidian font-geist text-ink antialiased" style={{ fontSize: '16px' }}>
      <Nav navigate={navigate} health={health} latencyMs={latencyMs} />
      <LiveStrip />
      <main>
        <Hero navigate={navigate} />
        <Sandbox />
        <Features />
        <MetricsBand />
      </main>
      <Footer navigate={navigate} />
    </div>
  );
}