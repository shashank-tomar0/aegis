# AEGIS — production container image
# Single deploy: Fastify API + built SPA served from the same process

# --- build stage: frontend ---
FROM node:24-slim AS web-build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -- --outDir dist

# --- deps stage: server only ---
FROM node:24-slim AS server-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- runtime ---
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    AEGIS_HOST=0.0.0.0 \
    AEGIS_PORT=8787 \
    AEGIS_DATA_DIR=/data
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=web-build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY tsconfig.json ./tsconfig.json
COPY server/tsconfig.json ./server/tsconfig.json
RUN mkdir -p /data
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/src/index.ts"]