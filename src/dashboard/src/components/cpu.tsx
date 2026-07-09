import { useEffect, useRef } from 'react';
import type { CPUProfile, FlameNode } from '../../../core/shared/types';

interface Props {
  profile: CPUProfile | null;
}

const ROW_H = 22;
const PAD = 1;
const MIN_W = 2;

const COLORS = {
  own: '#7C6AF5',
  lib: '#2ECC8F',
  gc: '#E24B4A',
  idle: '#4A4A5A',
  deopt: '#E8A020',
};

function nodeColor(name: string, hasDeopt: boolean): string {
  if (hasDeopt) return COLORS.deopt;
  if (name.includes('(garbage collector)')) return COLORS.gc;
  if (name.includes('(idle)') || name.includes('(root)') || name.includes('(program)'))
    return COLORS.idle;
  if (name.startsWith('node:') || name.includes('node_modules')) return COLORS.lib;
  return COLORS.own;
}

function hex2rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Count depth ignoring idle/program branches — they don't have
// meaningful children and would inflate the canvas height
function countDepth(node: FlameNode): number {
  const isNoise = node.name.includes('(idle)') || node.name.includes('(program)');
  if (!node.children.length || isNoise) return 1;
  return 1 + Math.max(...node.children.map(countDepth));
}

export function CPU({ profile }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !profile) return;

    const ctx = canvas.getContext('2d')!;
    const W = canvas.offsetWidth;
    const depth = countDepth(profile.flame);
    const H = depth * ROW_H + 8;

    // Set height on both the canvas element and its CSS so the
    // wrapper div expands to match the actual flame graph height
    canvas.width = W;
    canvas.height = H;
    canvas.style.height = `${H}px`;

    ctx.clearRect(0, 0, W, H);

    const hitboxes: { x: number; y: number; w: number; h: number; node: FlameNode }[] = [];

    function drawNode(node: FlameNode, x: number, y: number, w: number) {
      if (w < MIN_W) return;

      const isNoise = node.name.includes('(idle)') || node.name.includes('(program)');
      const col = nodeColor(node.name, node.deoptReasons.length > 0);

      // Block background
      ctx.fillStyle = hex2rgba(col, 0.15);
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.roundRect(x + PAD, y + PAD, w - PAD * 2, ROW_H - PAD * 2, 2);
      ctx.fill();
      ctx.stroke();

      hitboxes.push({ x: x + PAD, y: y + PAD, w: w - PAD * 2, h: ROW_H - PAD * 2, node });

      // Label
      if (w > 40) {
        ctx.fillStyle = col;
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + PAD + 5, y, w - PAD * 2 - 10, ROW_H);
        ctx.clip();
        ctx.fillText(node.name || '(anonymous)', x + PAD + 5, y + ROW_H / 2);
        ctx.restore();
      }

      // Percentage
      if (w > 120) {
        const label = node.totalPct.toFixed(0) + '%';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = hex2rgba(col, 0.7);
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, x + w - PAD - tw - 6, y + ROW_H / 2);
      }

      // Don't recurse into idle/program — no meaningful children
      if (!node.children.length || isNoise) return;

      const totalChildPct = node.children.reduce((sum, c) => sum + c.totalPct, 0);
      if (totalChildPct === 0) return;

      const sorted = [...node.children].sort((a, b) => b.totalPct - a.totalPct);
      let cx = x;

      for (const child of sorted) {
        const cw = (child.totalPct / totalChildPct) * w;
        drawNode(child, cx, y + ROW_H, cw);
        cx += cw;
      }
    }

    drawNode(profile.flame, 0, 4, W);

    // Tooltip
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    function onMouseMove(e: MouseEvent) {
      if (!tooltip || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hit = [...hitboxes]
        .reverse()
        .find((h) => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);

      if (hit) {
        tooltip.style.opacity = '1';
        tooltip.style.left = `${Math.min(mx + 12, W - 200)}px`;
        tooltip.style.top = `${my - 10}px`;
        tooltip.innerHTML = `
          <div class="font-mono text-xs text-[#F0F0F6] mb-1">${hit.node.name || '(anonymous)'}</div>
          <div class="font-mono text-[10px] text-[#8B8FA8]">total ${hit.node.totalPct.toFixed(1)}% · self ${hit.node.selfPct.toFixed(1)}%</div>
          <div class="font-mono text-[10px] text-[#8B8FA8]">${hit.node.totalMs.toFixed(1)}ms total · ${hit.node.selfMs.toFixed(1)}ms self</div>
          ${hit.node.url ? `<div class="font-mono text-[10px] text-[#7C6AF5] mt-1">${hit.node.url}:${hit.node.line}</div>` : ''}
          ${hit.node.deoptReasons.length ? `<div class="font-mono text-[10px] text-[#E8A020] mt-1">⚠ ${hit.node.deoptReasons[0]}</div>` : ''}
        `;
      } else {
        tooltip.style.opacity = '0';
      }
    }

    function onMouseLeave() {
      if (tooltip) tooltip.style.opacity = '0';
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [profile]);

  if (!profile) {
    return (
      <div className="bg-[#12121A] border border-[#1E1E2E] rounded-lg">
        <div className="px-4 py-3 border-b border-[#1E1E2E]">
          <span className="font-mono text-xs text-[#8B8FA8] uppercase tracking-widest">CPU</span>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="font-mono text-xs text-[#8B8FA8]">No profile captured yet</p>
          <p className="font-mono text-[10px] text-[#4A4A5A] mt-2">
            press <kbd className="text-[#7C6AF5]">p</kbd> to start ·{' '}
            <kbd className="text-[#7C6AF5]">s</kbd> to stop
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#12121A] border border-[#1E1E2E] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E2E]">
        <span className="font-mono text-xs text-[#8B8FA8] uppercase tracking-widest">CPU</span>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-[#8B8FA8]">
            {profile.durationMs.toFixed(0)}ms
          </span>
          {profile.deoptWarnings.length > 0 && (
            <span className="font-mono text-xs text-[#E8A020]">
              ⚠ {profile.deoptWarnings.length} deopt{profile.deoptWarnings.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Flame graph */}
      <div className="relative overflow-x-auto">
        <canvas ref={canvasRef} className="w-full block" />
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none bg-[#0A0A0F] border border-[#1E1E2E] rounded px-3 py-2 opacity-0 transition-opacity duration-100 z-10"
          style={{ minWidth: 160 }}
        />
      </div>

      {/* Top functions */}
      <div className="border-t border-[#1E1E2E]">
        {profile.topFunctions.slice(0, 5).map((fn, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-2 border-b border-[#1E1E2E] last:border-0"
          >
            <span className="font-mono text-[10px] text-[#4A4A5A] w-4">{i + 1}</span>
            <span className="font-mono text-xs text-[#F0F0F6] flex-1 truncate">{fn.name}</span>
            <div className="w-24 h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${fn.selfPct}%`,
                  background: nodeColor(fn.name, fn.deoptReasons.length > 0),
                }}
              />
            </div>
            <span className="font-mono text-xs text-[#8B8FA8] w-12 text-right">
              {fn.selfPct.toFixed(1)}%
            </span>
            <span className="font-mono text-xs text-[#8B8FA8] w-16 text-right">
              {fn.selfMs.toFixed(1)}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
