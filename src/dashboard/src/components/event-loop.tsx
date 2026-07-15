import { useEffect, useRef } from 'react';
import type { AggregatedEventLoop } from '@core/shared/types';

interface Props {
  data: AggregatedEventLoop | null;
}

const HISTORY_SIZE = 120;
const CANVAS_HEIGHT = 90;
const WARN_MS = 50;
const CRIT_MS = 200;
const COLORS = {
  ok: '#2ECC8F',
  warn: '#E8A020',
  crit: '#E24B4A',
  grid: 'rgba(255,255,255,0.04)',
  scan: 'rgba(46,204,143,0.05)',
};

function lagColor(lagMs: number): string {
  if (lagMs > CRIT_MS) return COLORS.crit;
  if (lagMs > WARN_MS) return COLORS.warn;
  return COLORS.ok;
}

function lagClass(lagMs: number): string {
  if (lagMs > CRIT_MS) return 'text-danger';
  if (lagMs > WARN_MS) return 'text-warning';
  return 'text-success';
}

export function EventLoop({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<AggregatedEventLoop[]>([]);
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

      // Grid
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;
      for (const ms of [WARN_MS, CRIT_MS]) {
        const maxMs = 500;
        const y = H - (ms / maxMs) * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      if (!history.length) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const maxMs = Math.max(...history.map((h) => h.peakLagMs), CRIT_MS);
      const bw = W / HISTORY_SIZE;

      // Lag bars
      for (const [i, h] of history.entries()) {
        const x = i * bw;
        const height = (h.latestLagMs / maxMs) * H;
        ctx.fillStyle = lagColor(h.latestLagMs) + '99';
        ctx.fillRect(x, H - height, bw - 1, height);
      }

      // Warn threshold line
      ctx.strokeStyle = COLORS.warn + '60';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      const warnY = H - (WARN_MS / maxMs) * H;
      ctx.beginPath();
      ctx.moveTo(0, warnY);
      ctx.lineTo(W, warnY);
      ctx.stroke();

      // Crit threshold line
      ctx.strokeStyle = COLORS.crit + '60';
      const critY = H - (CRIT_MS / maxMs) * H;
      ctx.beginPath();
      ctx.moveTo(0, critY);
      ctx.lineTo(W, critY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Scan line
      const scanX = scanRef.current % W;
      ctx.fillStyle = COLORS.scan;
      ctx.fillRect(scanX, 0, 10, H);
      scanRef.current += 0.6;

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const lagMs = data?.latestLagMs.toFixed(1) ?? '—';
  const avgMs = data?.avgLagMs.toFixed(1) ?? '—';
  const peakMs = data?.peakLagMs.toFixed(1) ?? '—';

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-mono text-xs text-secondary uppercase tracking-widest">
          Event Loop
        </span>
        <div className="flex items-center gap-4">
          <Stat label="lag" value={`${lagMs}ms`} color={lagClass(parseInt(lagMs))} />
          <Stat label="avg" value={`${avgMs}ms`} color="text-secondary" />
          <Stat label="peak" value={`${peakMs}ms`} color="text-warning" />
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
