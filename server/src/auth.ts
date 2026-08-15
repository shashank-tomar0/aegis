// AEGIS Auth Helpers — session cookie / bearer token resolution for Fastify
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserStore, UserRow } from './db/users.js';

const COOKIE = 'aegis_token';
const SESSION_DAYS = 30;

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.header('set-cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('set-cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function bearerFromHeader(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim() || null;
  return null;
}

function tokenFromRequest(req: FastifyRequest): string | null {
  const cookie = req.headers.cookie;
  if (cookie) {
    const m = cookie.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`));
    if (m) return m.slice(COOKIE.length + 1);
  }
  return bearerFromHeader(req);
}

/** Resolve user from session token OR API key (no throw). */
export function getUser(store: UserStore, req: FastifyRequest): UserRow | null {
  const token = tokenFromRequest(req);
  if (token) {
    const u = store.getUserBySessionToken(token);
    if (u) return u;
  }
  const key = bearerFromHeader(req);
  if (key) return store.getUserByApiKey(key);
  return null;
}

/** Resolve user or throw a 401 Fastify error. */
export function requireUser(store: UserStore, req: FastifyRequest): UserRow {
  const user = getUser(store, req);
  if (!user) {
    const err = new Error('authentication required — login or provide an x-aegis key') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
}