import { CPU_SAMPLING_INTERVAL_US } from '#core/shared/constants';
import type { CDPConnection } from '#core/cdp/client';
import type { CPUProfile, FlameNode, DeoptWarning } from '#core/shared/types';

// Internal CDP types — not exported, implementation detail of this collector
interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

interface ProfileNode {
  id: number;
  callFrame: CallFrame;
  hitCount: number;
  children: number[];
  deoptReasons: string[];
}

interface RawCPUProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export interface CPUCollectorCallbacks {
  onProfile?: (profile: CPUProfile) => void;
}

export interface CPUCollectorHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function createCPUCollector(
  connection: CDPConnection,
  callbacks: CPUCollectorCallbacks = {}
): Promise<CPUCollectorHandle> {
  await connection.send('Profiler.enable');
  await connection.send('Profiler.setSamplingInterval', {
    interval: CPU_SAMPLING_INTERVAL_US,
  });

  let profiling = false;

  async function start(): Promise<void> {
    if (profiling) return;
    await connection.send('Profiler.start');
    profiling = true;
  }

  async function stop(): Promise<void> {
    if (!profiling) return;

    const result = (await connection.send('Profiler.stop')) as { profile: RawCPUProfile };
    profiling = false;

    const profile = parseProfile(result.profile);
    callbacks.onProfile?.(profile);
  }

  return { start, stop };
}

// ─── Profile parsing — raw CDP → FlameNode tree ────────────────

function parseProfile(raw: RawCPUProfile): CPUProfile {
  const durationMs = (raw.endTime - raw.startTime) / 1000;
  const totalSamples = raw.samples.length;
  const tickMs = durationMs / totalSamples;

  // Index nodes by id for O(1) lookup
  const nodeMap = new Map<number, ProfileNode>();
  for (const node of raw.nodes) {
    nodeMap.set(node.id, node);
  }

  // Count self hits per node
  const selfHits = new Map<number, number>();
  for (const nodeId of raw.samples) {
    selfHits.set(nodeId, (selfHits.get(nodeId) ?? 0) + 1);
  }

  // Compute total hits recursively (self + all descendants)
  const totalHits = new Map<number, number>();
  function calcTotal(nodeId: number): number {
    const node = nodeMap.get(nodeId)!;
    let total = selfHits.get(nodeId) ?? 0;
    for (const childId of node.children ?? []) {
      total += calcTotal(childId);
    }
    totalHits.set(nodeId, total);
    return total;
  }

  const rootId = raw.nodes[0].id;
  calcTotal(rootId);

  // Build FlameNode tree
  function buildNode(nodeId: number): FlameNode {
    const node = nodeMap.get(nodeId)!;
    const self = selfHits.get(nodeId) ?? 0;
    const total = totalHits.get(nodeId) ?? 0;

    return {
      name: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url,
      line: node.callFrame.lineNumber,
      selfMs: self * tickMs,
      totalMs: total * tickMs,
      selfPct: (self / totalSamples) * 100,
      totalPct: (total / totalSamples) * 100,
      deoptReasons: node.deoptReasons ?? [],
      children: node.children?.map(buildNode) ?? [],
    };
  }

  const flame = buildNode(rootId);

  // Flatten tree for top functions and deopt warnings
  const flat: FlameNode[] = [];
  function walk(node: FlameNode): void {
    flat.push(node);
    for (const child of node.children) walk(child);
  }
  walk(flame);

  const topFunctions = flat
    .filter((n) => n.selfMs > 0)
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 10);

  const deoptWarnings: DeoptWarning[] = flat
    .filter((n) => n.deoptReasons.length > 0)
    .map((n) => ({
      functionName: n.name,
      url: n.url,
      line: n.line,
      reasons: n.deoptReasons,
    }));

  return { durationMs, flame, topFunctions, deoptWarnings };
}
