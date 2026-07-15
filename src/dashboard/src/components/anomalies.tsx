import type { Anomaly } from '@core/shared/types';

interface Props {
  items: Anomaly[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const TYPE_LABELS: Record<string, string> = {
  'heap-leak': 'Heap Leak',
  'gc-pressure': 'GC Pressure',
  'heap-fragmentation': 'Fragmentation',
  'event-loop-block': 'EL Block',
};

export function Anomalies({ items }: Props) {
  const hasCritical = items.some((a) => a.severity === 'critical');

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs text-secondary uppercase tracking-widest">
          Anomalies
        </span>
        {items.length > 0 && (
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              hasCritical ? 'text-danger bg-danger/10' : 'text-warning bg-warning/10'
            }`}
          >
            {items.length}
          </span>
        )}
      </div>

      {!items.length ? (
        <div className="px-4 py-6 text-center">
          <div className="w-1.5 h-1.5 rounded-full bg-success mx-auto mb-2" />
          <p className="font-mono text-xs text-muted">No anomalies detected</p>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto flex flex-col gap-2 p-3">
          {items.map((anomaly, i) => {
            const isCrit = anomaly.severity === 'critical';
            return (
              <div
                key={i}
                className={`rounded px-3 py-2 border ${
                  isCrit ? 'bg-danger/5 border-danger/20' : 'bg-warning/5 border-warning/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isCrit ? 'bg-danger' : 'bg-warning'
                    }`}
                  />
                  <span
                    className={`font-mono text-[10px] ${isCrit ? 'text-danger' : 'text-warning'}`}
                  >
                    {TYPE_LABELS[anomaly.type] ?? anomaly.type}
                  </span>
                  <span className="font-mono text-[10px] text-muted ml-auto">
                    {formatTime(anomaly.timestamp)}
                  </span>
                </div>
                <p className="font-mono text-xs text-primary leading-relaxed">{anomaly.message}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
