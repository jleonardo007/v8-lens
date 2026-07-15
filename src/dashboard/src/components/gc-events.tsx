import type { GCEvent } from '@core/shared/types';

interface Props {
  items: GCEvent[];
}

const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function GCEvents({ items }: Props) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs text-secondary uppercase tracking-widest">GC</span>
        <span className="font-mono text-[10px] text-muted">{items.length} events</span>
      </div>

      {!items.length ? (
        <div className="px-4 py-6 text-center">
          <p className="font-mono text-xs text-muted">No GC events yet</p>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {items.map((event, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0"
            >
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  color: event.type === 'Major' ? '#E24B4A' : '#E8A020',
                  background:
                    event.type === 'Major' ? 'rgba(226,75,74,0.1)' : 'rgba(232,160,32,0.1)',
                }}
              >
                {event.type}
              </span>
              <span className="font-mono text-xs text-primary flex-1">
                −{toMB(event.freedBytes)}MB
              </span>
              {event.durationMs > 0 && (
                <span className="font-mono text-xs text-secondary">
                  {event.durationMs.toFixed(0)}ms
                </span>
              )}
              <span className="font-mono text-[10px] text-muted">
                {formatTime(event.timestamp)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
