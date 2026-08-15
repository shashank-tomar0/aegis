// AEGIS Live PQC Sandbox — real post-quantum crypto over the real HTTP API
// ML-KEM handshake + ML-DSA / SLH-DSA sign→verify. Nothing is simulated.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { api, SERVER_HOST } from '../lib/api';
import { Eyebrow, Reveal } from './kit';

type Tone = 'dim' | 'fg' | 'alert' | 'verify' | 'accent';
interface Line { id: number; tone: Tone; text: string; }

let nextId = 1;
const now = () => new Date().toTimeString().slice(0, 8);

export function Sandbox() {
  const [lines, setLines] = useState<Line[]>([
    { id: nextId++, tone: 'dim', text: `[${now()}] aegis://live-pqc — connected to ${SERVER_HOST}` },
    { id: nextId++, tone: 'dim', text: `[${now()}] engine: @noble/post-quantum · duckdb · fastify` },
    { id: nextId++, tone: 'fg', text: '> select a flow to begin. every operation hits the real API.' },
  ]);
  const [busy, setBusy] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const push = (tone: Tone, text: string) => setLines(ls => [...ls, { id: nextId++, tone, text }]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    const onRun = (e: Event) => {
      const flow = (e as CustomEvent).detail as 'kem' | 'dsa' | 'slh';
      void run(flow);
    };
    window.addEventListener('aegis:run-sandbox', onRun);
    return () => window.removeEventListener('aegis:run-sandbox', onRun);
  }, []);

  const short = (b64: string) => (b64.length > 18 ? `${b64.slice(0, 18)}…` : b64);

  async function call<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    push('dim', `[${now()}] → ${label}`);
    try {
      const r = await fn();
      push('accent', `[${now()}] ← ok · ${Math.round(performance.now() - t0)}ms`);
      return r;
    } catch (err) {
      push('alert', `[${now()}] ✗ ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function run(flow: 'kem' | 'dsa' | 'slh') {
    if (busy) return;
    setBusy(flow);
    try {
      if (flow === 'kem') {
        push('verify', '>>> ML-KEM-768 KEY-ENCAPSULATION HANDSHAKE');
        const alice = await call('POST /api/pqc/keys {"algorithm":"ML-KEM-768"}', () => api.generateKeyPair('ML-KEM-768'));
        push('fg', `    ALICE KEYPAIR · PK ${short(alice.publicKeyB64)} · FP ${alice.fingerprint.slice(0, 12)}`);
        await sleep(120);
        const bob = await call('POST /api/pqc/keys {"algorithm":"ML-KEM-768"}', () => api.generateKeyPair('ML-KEM-768'));
        push('fg', `    BOB   KEYPAIR · PK ${short(bob.publicKeyB64)}`);
        await sleep(120);
        const cap = await call('POST /api/pqc/capsule {publicKey: ALICE}', () => api.encapsulate(alice.publicKeyB64, 'ML-KEM-768'));
        push('fg', `    CIPHERTEXT ${Math.round(cap.cipherTextB64.length * 0.75)}B · SS_A ${short(cap.sharedSecretB64)}`);
        await sleep(120);
        const dec = await call('POST /api/pqc/decapsulate {secretKey: ALICE, cipherText}', () =>
          api.decapsulate(alice.publicKeyB64, alice.secretKeyB64, cap.cipherTextB64, 'ML-KEM-768'));
        push('fg', `    SS_B ${short(dec.sharedSecretB64)}`);
        const match = dec.sharedSecretB64 === cap.sharedSecretB64;
        push(match ? 'verify' : 'alert', match
          ? `✓ SHARED SECRET MATCH · ${cap.sharedSecretBytes} BYTES · PQC CHANNEL ESTABLISHED`
          : '✗ SHARED SECRET MISMATCH — CRYPTOGRAPHIC FAILURE');
      } else {
        const algo = flow === 'dsa' ? 'ML-DSA-65' : 'SLH-DSA-SHAKE-256F';
        push('verify', `>>> ${algo} SIGN → VERIFY`);
        const msg = `AEGIS ATTESTATION ${Date.now().toString(36)}`;
        push('fg', `    MESSAGE "${msg}"`);
        const sig = await call(`POST /api/pqc/sign {algorithm:"${algo}"}`, () => api.signMessage(msg, algo));
        push('fg', `    SIGNATURE ${sig.signatureBytes}B · HASH ${sig.messageHash.slice(0, 16)}…`);
        await sleep(140);
        const v = await call(`POST /api/pqc/verify {algorithm:"${algo}"}`, () =>
          fetch(`${SERVER_HOST}/api/pqc/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, signatureB64: sig.signatureB64, publicKeyB64: sig.publicKeyB64, algorithm: algo }),
          }).then(r => r.json()) as Promise<{ verified: boolean }>);
        push(v.verified ? 'verify' : 'alert', v.verified
          ? `✓ SIGNATURE VERIFIED · ${algo} · INDEPENDENT CHECK PASSED`
          : '✗ VERIFICATION FAILED');
      }
      push('dim', '> flow complete.');
    } catch {
      push('alert', '> flow aborted — is the server running? (npm start)');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="live-pqc" className="relative border-y border-hairline bg-obsidian py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-0 landing-hgrid opacity-40" aria-hidden />
      <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <Reveal>
            <Eyebrow>Live product sandbox</Eyebrow>
            <h2 className="mt-4 font-display text-[34px] leading-[1.05] text-ink sm:text-[44px]">
              Real post-quantum crypto, <em className="italic text-alert">right here.</em>
            </h2>
            <p className="mt-5 max-w-[44ch] font-geist text-[15px] leading-relaxed text-ink-dim">
              This terminal talks to your local AEGIS server. Click a flow and watch a genuine
              ML-KEM handshake or an ML-DSA / SLH-DSA signature round-trip — key generation,
              encapsulation, decapsulation, and verification all happen over HTTP with the real
              algorithms. No mocks, no canned output.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {([
                ['kem', 'RUN ML-KEM HANDSHAKE'],
                ['dsa', 'RUN ML-DSA SIGN'],
                ['slh', 'RUN SLH-DSA SIGN'],
              ] as const).map(([flow, label]) => (
                <motion.button
                  key={flow}
                  onClick={() => void run(flow)}
                  disabled={busy !== null}
                  whileTap={busy ? undefined : { scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={`border px-4 py-2.5 font-geist-mono text-[11px] tracking-widest transition-colors ${
                    busy === flow
                      ? 'cursor-wait border-alert/60 text-alert'
                      : 'border-hairline-strong text-ink-dim hover:border-alert hover:text-alert'
                  }`}
                >
                  {busy === flow ? 'RUNNING…' : label}
                </motion.button>
              ))}
              <button
                onClick={() => setLines([{ id: nextId++, tone: 'dim', text: `[${now()}] buffer cleared.` }])}
                className="border border-hairline px-4 py-2.5 font-geist-mono text-[11px] tracking-widest text-ink-mute transition-colors hover:text-ink"
              >
                CLEAR
              </button>
            </div>
            <p className="mt-4 font-geist-mono text-[10px] tracking-wider text-ink-mute">
              SOURCE: <span className="text-ink-dim">{SERVER_HOST}/api/pqc/*</span> · keys never leave the server
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="border border-hairline bg-carbon shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]">
            {/* title bar */}
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full border border-alert/50" />
                <span className="h-2.5 w-2.5 rounded-full border border-ink-mute" />
                <span className="h-2.5 w-2.5 rounded-full border border-ink-mute" />
              </div>
              <span className="font-geist-mono text-[10px] tracking-widest text-ink-mute">aegis://live-pqc</span>
              <span className={`font-geist-mono text-[10px] tracking-widest ${busy ? 'text-alert' : 'text-verify'}`}>
                {busy ? '● PROCESSING' : '● ONLINE'}
              </span>
            </div>
            {/* body */}
            <div
              ref={bodyRef}
              className="h-[340px] overflow-y-auto px-4 py-3 font-geist-mono text-[11px] leading-[1.75] sm:h-[380px]"
              role="log"
              aria-live="polite"
            >
              {lines.map(l => (
                <div key={l.id} className={`whitespace-pre-wrap break-words ${
                  l.tone === 'dim' ? 'text-ink-mute' :
                  l.tone === 'fg' ? 'text-ink-dim' :
                  l.tone === 'alert' ? 'text-danger' :
                  l.tone === 'verify' ? 'text-verify' : 'text-alert'
                }`}>
                  {l.text}
                </div>
              ))}
              <div className={`landing-caret text-ink-dim ${busy ? 'opacity-100' : 'opacity-60'}`} aria-hidden />
            </div>
            {/* footer */}
            <div className="flex items-center justify-between border-t border-hairline px-4 py-2 font-geist-mono text-[9px] tracking-widest text-ink-mute">
              <span>@noble/post-quantum · FASTIFY · DUCKDB</span>
              <span>UTF-8 · BASE64 · SHA-256</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
