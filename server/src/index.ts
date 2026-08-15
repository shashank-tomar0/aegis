// AEGIS Server Entry — Fastify + PQC + DuckDB analytics
// Runs at :8787, serves API and the built frontend (single deploy)

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './services/config.js';
import { registerRoutes } from './routes.js';
import { createAnalyticsStore } from './db/store.js';
import { generateKeyPair } from './services/pqc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const app = Fastify({ logger: config.logger });

  await app.register(cors, { origin: config.corsOrigin });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // Initialize analytics store (DuckDB)
  const store = createAnalyticsStore(config.dataDir);
  await store.initialize();

  // Warm-up PQC check
  try {
    const kp = generateKeyPair('ML-KEM-768');
    app.log.info(`[PQC] ML-KEM-768 keygen warm-up OK (${kp.keySizeBytes} pk bytes)`);
  } catch (err) {
    app.log.warn(`[PQC] keygen warm-up failed: ${String(err)}`);
  }

  registerRoutes(app, store);

  // Serve built frontend if present (npm run build first)
  const distPath = join(__dirname, '..', '..', 'dist');
  if (existsSync(distPath)) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.status(404).send({ error: 'not found', path: req.url });
        return;
      }
      // SPA fallback
      reply.sendFile('index.html');
    });
    app.log.info(`[AEGIS] serving frontend from ${distPath}`);
  }

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`AEGIS server listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('[AEGIS] fatal startup error:', err);
  process.exit(1);
});