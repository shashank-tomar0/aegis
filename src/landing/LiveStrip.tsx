// AEGIS LiveStrip — telemetry ticker fed by the server's SSE stream

import { useTelemetryStream, fmtUptime } from './kit';

export function LiveStrip() {
  const { stats, live } = useTelemetryStream();

  const cells: Array<[string, string]> = stats
    ? [
        ['UPTIME', fmtUptime(stats.uptimeSeconds)],
        ['EVENTS', String(stats.eventsIngested)],
        ['QUERIES', String(stats.queriesExecuted)],
        ['PQC OPS', String(stats.pqcOperations)],
        ['SSE CLIENTS', String(stats.sseClients)],
      ]
    : [['UPTIME', '—'], ['EVENTS', '—'], ['QUERIES', '—'], ['PQC OPS', '—'], ['SSE CLIENTS', '—']];

  return (
    <div className="border-b border-hairline bg-carbon">
      <div className="mx-auto flex max-w-[1280px] items-center gap-5 overflow-x-auto px-6 py-1.5 font-geist-mono text-[9px] tracking-widest whitespace-nowrap">
        <span className="flex items-center gap-1.5 text-ink-mute">
          <span className={`h-1 w-1 rounded-full ${live ? 'bg-verify animate-pulse' : 'bg-danger'}`} />
          {live ? 'LIVE STREAM' : 'STREAM DOWN'}
        </span>
        {cells.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="text-ink-mute">{k}</span>
            <span className={live ? 'text-ink-dim' : 'text-ink-mute'}>{v}</span>
          </span>
        ))}
        <span className="ml-auto hidden text-ink-mute sm:inline">EVENTSOURCE://{new URL(window.location.origin).hostname}:8787/API/STREAM</span>
      </div>
    </div>
  );
}
