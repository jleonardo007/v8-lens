import type { Anomaly } from '../../../core/shared/types';

interface Props {
  items: Anomaly[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const SEVERITY_STYLES = {
  warn: {
    dot: '#E8A020',
    bg: 'rgba(232,160,32,0.06)',
    border: 'rgba(232,160,32,0.2)',
  },
  critical: {
    dot: '#E24B4A',
    bg: 'rgba(226,75,74,0.06)',
    border: 'rgba(226,75,74,0.2)',
  },
};

const TYPE_LABELS: Record<string, string> = {
  'heap-leak': 'Heap Leak',
  'gc-pressure': 'GC Pressure',
  'heap-fragmentation': 'Fragmentation',
  'event-loop-block': 'EL Block',
};

export function Anomalies({ items }: Props) {
  return (
    <div className="bg-[#12121A] border border-[#1E1E2E] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1E1E2E] flex items-center justify-between">
        <span className="font-mono text-xs text-[#8B8FA8] uppercase tracking-widest">
          Anomalies
        </span>
        {items.length > 0 && (
          <span
            className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{
              color: '#E24B4A',
              background: 'rgba(226,75,74,0.1)',
            }}
          >
            {items.length}
          </span>
        )}
      </div>

      {!items.length ? (
        <div className="px-4 py-6 text-center">
          <div className="w-1.5 h-1.5 rounded-full bg-[#2ECC8F] mx-auto mb-2" />
          <p className="font-mono text-xs text-[#8B8FA8]">No anomalies detected</p>
        </div>
      ) : (
        <div className="overflow-y-auto flex flex-col gap-2 px-2 max-h-[50vh] border-red-400">
          {items.map((anomaly, i) => {
            const style = SEVERITY_STYLES[anomaly.severity];
            return (
              <div
                key={i}
                className="rounded px-3 py-2"
                style={{
                  background: style.bg,
                  border: `0.5px solid ${style.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: style.dot }}
                  />
                  <span className="font-mono text-[10px]" style={{ color: style.dot }}>
                    {TYPE_LABELS[anomaly.type] ?? anomaly.type}
                  </span>
                  <span className="font-mono text-[10px] text-[#8B8FA8] ml-auto">
                    {formatTime(anomaly.timestamp)}
                  </span>
                </div>
                <p className="font-mono text-xs text-[#F0F0F6] leading-relaxed">
                  {anomaly.message}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
