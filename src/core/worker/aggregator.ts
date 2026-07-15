import { readHeapHistory, readEventLoopHistory } from '#core/shared/buffer';
import { HISTORY_WINDOW } from '#core/shared/constants';
import type { AggregatedHeap, AggregatedEventLoop } from '#core/shared/types';

export interface Aggregator {
  computeHeap: () => AggregatedHeap | null;
  computeEventLoop: () => AggregatedEventLoop | null;
}

export function createAggregator(): Aggregator {
  function computeHeap(): AggregatedHeap | null {
    const history = readHeapHistory(HISTORY_WINDOW);
    if (!history.length) return null;

    const latest = history[history.length - 1];
    const used = history.map((s) => s.usedMB);
    const avgUsed = used.reduce((a, b) => a + b, 0) / used.length;
    const peakUsed = Math.max(...used);
    if (!peakUsed) {
      console.warn(...used);
    }
    return {
      latestUsedMB: latest.usedMB,
      latestTotalMB: latest.totalMB,
      externalMB: latest.externalMB,
      avgUsedMB: avgUsed,
      peakUsedMB: peakUsed || 0,
      sampleCount: history.length,
    };
  }

  function computeEventLoop(): AggregatedEventLoop | null {
    const history = readEventLoopHistory(HISTORY_WINDOW);
    if (!history.length) return null;

    const latest = history[history.length - 1];
    const lags = history.map((s) => s.lagMs);
    const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;
    const peakLag = Math.max(...lags);

    return {
      latestLagMs: latest.lagMs,
      avgLagMs: avgLag,
      peakLagMs: peakLag,
      sampleCount: history.length,
    };
  }

  return { computeHeap, computeEventLoop };
}
