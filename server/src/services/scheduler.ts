// AEGIS Scan Scheduler — periodic collector runs per project schedule
// Schedules live in project.meta.schedules: [{ collector, everyMinutes }]

import type { AnalyticsStore } from '../db/store.js';
import type { UserStore } from '../db/users.js';
import { runCollectorForProject } from './scanner.js';

const TICK_MS = 30_000;
const inFlight = new Set<string>();

export interface ScheduleEntry { collector: string; everyMinutes: number; }

export function getSchedules(users: UserStore, projectId: string): ScheduleEntry[] {
  const meta = users.getProjectMeta(projectId);
  const raw = (meta as { schedules?: unknown }).schedules;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is ScheduleEntry => !!s && typeof (s as ScheduleEntry).collector === 'string' && typeof (s as ScheduleEntry).everyMinutes === 'number')
    .map(s => ({ collector: s.collector, everyMinutes: Math.max(1, s.everyMinutes) }));
}

export function setSchedule(users: UserStore, projectId: string, collector: string, everyMinutes: number | null): ScheduleEntry[] {
  const meta = users.getProjectMeta(projectId);
  const schedules = getSchedules(users, projectId).filter(s => s.collector !== collector);
  if (everyMinutes !== null && everyMinutes > 0) schedules.push({ collector, everyMinutes });
  users.saveProjectMeta(projectId, { ...meta, schedules });
  return schedules;
}

export function startScheduler(store: AnalyticsStore, users: UserStore, log: (msg: string) => void): () => void {
  const tick = async () => {
    try {
      const all = users.listAllProjects();
      for (const { project, owner } of all) {
        const schedules = getSchedules(users, project.id);
        for (const s of schedules) {
          const key = `${project.id}:${s.collector}`;
          if (inFlight.has(key)) continue;
          const last = users.latestRunByProjectAny(project.id, s.collector);
          const dueAt = (last?.ranAt ?? 0) + s.everyMinutes * 60_000;
          if (Date.now() < dueAt) continue;
          inFlight.add(key);
          runCollectorForProject(store, users, project, owner, s.collector)
            .then(r => log(`[scheduler] ${s.collector} → ${project.name}: ${r.found} items${r.alerts.length ? `, ${r.alerts.length} alerts` : ''}`))
            .catch(err => log(`[scheduler] ${s.collector} → ${project.name} failed: ${String(err)}`))
            .finally(() => inFlight.delete(key));
        }
      }
    } catch (err) {
      log(`[scheduler] tick error: ${String(err)}`);
    }
  };

  tick();
  const t = setInterval(tick, TICK_MS);
  return () => clearInterval(t);
}