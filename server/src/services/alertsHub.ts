// AEGIS Alerts Hub — in-memory per-user broadcast for live alert feeds
import type { AlertRow } from '../db/users.js';

const listeners = new Map<string, Set<(a: AlertRow) => void>>();

export function publishAlert(alert: AlertRow): void {
  const set = listeners.get(alert.userId);
  if (!set) return;
  for (const fn of set) {
    try { fn(alert); } catch { /* listener error */ }
  }
}

export function subscribe(userId: string, fn: (a: AlertRow) => void): () => void {
  let set = listeners.get(userId);
  if (!set) { set = new Set(); listeners.set(userId, set); }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(userId);
  };
}