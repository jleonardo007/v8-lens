// ─── Heap ──────────────────────────────────────────────────────

export interface HeapSnapshot {
  timestamp: number;
  usedBytes: number;
  totalBytes: number;
  externalBytes: number;
}

export interface GCEvent {
  timestamp: number;
  type: 'Minor' | 'Major';
  durationMs: number;
  freedBytes: number;
}

export interface AggregatedHeap {
  latestUsedMB: number;
  latestTotalMB: number;
  externalMB: number;
  avgUsedMB: number;
  peakUsedMB: number;
  sampleCount: number;
}

// ─── Event loop ────────────────────────────────────────────────

export interface EventLoopSnapshot {
  timestamp: number;
  lagMs: number;
}

export interface AggregatedEventLoop {
  latestLagMs: number;
  avgLagMs: number;
  peakLagMs: number;
  sampleCount: number;
}

// ─── Anomalies ─────────────────────────────────────────────────

export type AnomalyType = 'heap-leak' | 'gc-pressure' | 'heap-fragmentation' | 'event-loop-block';

export type AnomalySeverity = 'warn' | 'critical';

export interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  timestamp: number;
}

// ─── CPU ───────────────────────────────────────────────────────

export interface FlameNode {
  name: string;
  url: string;
  line: number;
  totalMs: number;
  selfMs: number;
  totalPct: number;
  selfPct: number;
  deoptReasons: string[];
  children: FlameNode[];
}

export interface DeoptWarning {
  functionName: string;
  url: string;
  line: number;
  reasons: string[];
}

export interface CPUProfile {
  durationMs: number;
  flame: FlameNode;
  topFunctions: FlameNode[];
  deoptWarnings: DeoptWarning[];
}

// ─── WebSocket messages — Worker → Dashboard ───────────────────

export type WsMessageType = 'heap' | 'gc' | 'event-loop' | 'cpu-profile' | 'anomaly';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: number;
}

// ─── postMessage — Observer (main thread) → Worker ─────────────
// Discrete events only — continuous data goes through the SAB.

export type WorkerInboundMessage =
  | { type: 'gc'; payload: GCEvent }
  | { type: 'anomaly'; payload: Anomaly }
  | { type: 'cpu-profile'; payload: CPUProfile }
  | { type: 'shutdown' };
