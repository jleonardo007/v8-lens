import { useEffect, useRef } from 'react';
import type { AggregatedHeap } from '@core/shared/types';

interface Props {
  data: AggregatedHeap | null;
}

const HISTORY_SIZE = 120;
const CANVAS_HEIGHT = 90;
const COLORS = {
  used: '#7C6AF5',
  total: '#1E1E2E',
  external: '#2ECC8F',
  scan: 'rgba(124, 106, 245, 0.06)',
  grid: 'rgba(255,255,255,0.04)',
};

export function Heap({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<AggregatedHeap[]>([]);
  const scanRef = useRef(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!data) return;
    historyRef.current = [...historyRef.current, data].slice(-HISTORY_SIZE);
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function draw() {
      const W = canvas?.width ?? 0;
      const H = CANVAS_HEIGHT;
      const history = historyRef.current;

      ctx.clearRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;
      for (const pct of [25, 50, 75]) {
        const y = H - (pct / 100) * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      if (!history.length) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const maxMB = Math.max(...history.map((h) => h.latestTotalMB), 64);
      const bw = W / HISTORY_SIZE;

      // Total heap area (background)
      ctx.fillStyle = COLORS.total;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const [i, h] of history.entries()) {
        ctx.lineTo(i * bw, H - (h.latestTotalMB / maxMB) * H);
      }
      ctx.lineTo((history.length - 1) * bw, H);
      ctx.closePath();
      ctx.fill();

      // Used heap line
      ctx.strokeStyle = COLORS.used;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [i, h] of history.entries()) {
        const x = i * bw;
        const y = H - (h.latestUsedMB / maxMB) * H;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Used heap fill
      ctx.fillStyle = 'rgba(124,106,245,0.08)';
      ctx.beginPath();
      for (const [i, h] of history.entries()) {
        const x = i * bw;
        const y = H - (h.latestUsedMB / maxMB) * H;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo((history.length - 1) * bw, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // External memory line
      ctx.strokeStyle = COLORS.external;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      for (const [i, h] of history.entries()) {
        const x = i * bw;
        const y = H - (h.externalMB / maxMB) * H;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Oscilloscope scan line
      const scanX = scanRef.current % W;
      ctx.fillStyle = COLORS.scan;
      ctx.fillRect(scanX, 0, 12, H);
      ctx.strokeStyle = 'rgba(124,106,245,0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, H);
      ctx.stroke();
      scanRef.current += 0.6;

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const usedMB = data?.latestUsedMB.toFixed(1) ?? '—';
  const totalMB = data?.latestTotalMB.toFixed(1) ?? '—';
  const extMB = data?.externalMB.toFixed(1) ?? '—';
  const peakMB = data?.peakUsedMB.toFixed(1) ?? '—';
  const avgMB = data?.avgUsedMB.toFixed(1) ?? '—';

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-mono text-xs text-secondary uppercase tracking-widest">Heap</span>
        <div className="flex items-center gap-4">
          <Stat label="used" value={`${usedMB}MB`} color="text-accent" />
          <Stat label="total" value={`${totalMB}MB`} color="text-secondary" />
          <Stat label="external" value={`${extMB}MB`} color="text-success" />
          <Stat label="peak" value={`${peakMB}MB`} color="text-warning" />
          <Stat label="avg" value={`${avgMB}MB`} color="text-secondary" />
        </div>
      </div>
      <canvas ref={canvasRef} height={CANVAS_HEIGHT} className="w-full block" />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <div className={`font-mono text-xs ${color}`}>{value}</div>
      <div className="font-mono text-[10px] text-muted">{label}</div>
    </div>
  );
}
