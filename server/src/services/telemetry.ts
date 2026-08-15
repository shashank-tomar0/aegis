// AEGIS Telemetry — real counters + SSE broadcast hub
// Live metrics for the landing page and console, no fakes

export interface TelemetrySnapshot {
  uptimeSeconds: number;
  eventsIngested: number;
  queriesExecuted: number;
  sessionsCreated: number;
  pqcOperations: number;
  usersCreated: number;
  sseClients: number;
  startedAt: number;
}

const state = {
  eventsIngested: 0,
  queriesExecuted: 0,
  sessionsCreated: 0,
  pqcOperations: 0,
  usersCreated: 0,
  startedAt: Date.now(),
};

const subscribers = new Set<(s: TelemetrySnapshot) => void>();

export function bump(key: 'eventsIngested' | 'queriesExecuted' | 'sessionsCreated' | 'pqcOperations' | 'usersCreated', n = 1): void {
  state[key] += n;
  const snap = snapshot();
  for (const fn of subscribers) fn(snap);
}

export function snapshot(): TelemetrySnapshot {
  return {
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    eventsIngested: state.eventsIngested,
    queriesExecuted: state.queriesExecuted,
    sessionsCreated: state.sessionsCreated,
    pqcOperations: state.pqcOperations,
    usersCreated: state.usersCreated,
    sseClients: subscribers.size,
    startedAt: state.startedAt,
  };
}

export function subscribe(fn: (s: TelemetrySnapshot) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}
