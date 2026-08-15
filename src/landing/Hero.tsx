// AEGIS Hero — split serif headline over the LIVE graph engine

import { motion } from 'framer-motion';
import { ArrowRight, Command, Zap } from 'lucide-react';
import { HeroGraph } from './HeroGraph';
import { SplitWords, Reveal, useHealth, EASE_EXPO, scrollToId, runSandbox } from './kit';

export function Hero({ navigate }: { navigate: (to: string) => void }) {
  const { health, latencyMs, error } = useHealth();

  return (
    <section className="relative overflow-hidden" aria-label="AEGIS intro">
      {/* backdrop texture */}
      <div className="pointer-events-none absolute inset-0 landing-dotgrid opacity-60" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-obsidian to-transparent" aria-hidden />

      <div className="relative mx-auto grid max-w-[1280px] gap-10 px-6 pb-16 pt-16 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-6 lg:pb-24 lg:pt-24">
        {/* Copy */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_EXPO }}
            className="flex flex-wrap items-center gap-3 font-geist-mono text-[11px] tracking-[0.2em] text-ink-dim"
          >
            <span className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-danger animate-pulse' : 'bg-verify animate-pulse'}`} />
              {error ? 'API OFFLINE' : 'SYSTEMS NOMINAL'}
            </span>
            <span className="h-3 w-px bg-hairline-strong" aria-hidden />
            <span>AEGIS v0.1 // FULL-STACK</span>
            <span className="h-3 w-px bg-hairline-strong" aria-hidden />
            <span>DUCKDB + PQC</span>
          </motion.div>

          <SplitWords
            as="h1"
            text="Map the attack surface of agentic AI —"
            className="mt-6 block font-display text-[44px] leading-[1.02] tracking-[-0.01em] text-ink sm:text-[64px] lg:text-[72px]"
          />
          <SplitWords
            as="h1"
            text="before it maps you."
            delay={0.35}
            className="block font-display text-[44px] italic leading-[1.02] tracking-[-0.01em] text-alert sm:text-[64px] lg:text-[72px]"
          />

          <Reveal delay={0.5} className="mt-6 max-w-[46ch] font-geist text-[15px] leading-relaxed text-ink-dim">
            AEGIS models every agent, tool, and data flow in your system — computes real blast
            radius with max-flow / min-cut, ranks risk with Brandes centrality, and retires
            vulnerable crypto before the adversary does. NIST-selected algorithms. Real keypairs.
            No simulation.
          </Reveal>

          <Reveal delay={0.6} className="mt-8 flex flex-wrap items-center gap-3">
            <motion.button
              onClick={() => navigate('/console')}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="group inline-flex items-center gap-2 border border-alert bg-alert px-5 py-3 font-geist-mono text-[12px] font-medium tracking-widest text-obsidian transition-colors hover:bg-alert-hot"
            >
              ENTER CONSOLE
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </motion.button>
            <motion.button
              onClick={() => runSandbox('kem')}
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="inline-flex items-center gap-2 border border-hairline-strong bg-transparent px-5 py-3 font-geist-mono text-[12px] tracking-widest text-ink transition-colors hover:border-ink-dim hover:text-ink"
            >
              <Zap className="h-4 w-4 text-alert" />
              RUN LIVE PQC
            </motion.button>
            <span className="hidden font-geist-mono text-[10px] tracking-wider text-ink-mute md:inline">
              KEM HAND-SHAKE · REAL KEYS · ~2s
            </span>
          </Reveal>

          <Reveal delay={0.7} className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-geist-mono text-[11px] text-ink-mute">
            <span className="flex items-center gap-1.5"><span className="text-ink-dim">ALGORITHMS</span> {health ? health.pqcAlgorithms.length : '—'}</span>
            <span className="flex items-center gap-1.5"><span className="text-ink-dim">NIST FAMILIES</span> 3</span>
            <span className="flex items-center gap-1.5"><span className="text-ink-dim">LATENCY</span> {latencyMs != null ? `${latencyMs}MS` : '—'}</span>
            <span className="flex items-center gap-1.5"><span className="text-ink-dim">SERVER</span> localhost:8787</span>
          </Reveal>
        </div>

        {/* Live graph panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: EASE_EXPO, delay: 0.35 }}
          className="relative h-[420px] border border-hairline bg-carbon sm:h-[520px] lg:h-[560px]"
        >
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-hairline bg-carbon/80 px-4 py-2 font-geist-mono text-[10px] tracking-widest text-ink-mute backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-alert" />
              ATTRITION.LIVE
            </span>
            <span className="hidden sm:inline">INTERACTIVE — DRAG NODES, CLICK FOR BLAST RADIUS</span>
            <Command className="h-3.5 w-3.5 text-alert" />
          </div>
          <HeroGraph />
        </motion.div>
      </div>

      {/* scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-geist-mono text-[10px] tracking-[0.3em] text-ink-mute"
        aria-hidden
      >
        <button onClick={() => scrollToId('live-pqc')} className="pointer-events-auto animate-bounce">SCROLL ▼</button>
      </motion.div>
    </section>
  );
}
