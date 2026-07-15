import type { Anomaly, AggregatedHeap, AggregatedEventLoop } from '#core/shared/types';

import {
  LEAK_WARN_THRESHOLD_MB,
  LEAK_CRIT_THRESHOLD_MB,
  EVENT_LOOP_WARN_THRESHOLD,
  EVENT_LOOP_CRIT_THRESHOLD,
} from '@core/shared/constants.js';

export interface AnomalyDetector {
  inspect: (heap: AggregatedHeap, el: AggregatedEventLoop) => Anomaly[];
}

// This detector handles CROSS-COLLECTOR anomalies only — patterns that
// need both heap and event loop data simultaneously.
// Single-collector anomalies (leak, gc-pressure, el-block) are detected
// inside each collector and sent here via postMessage from the Observer.
export function createAnomalyDetector(): AnomalyDetector {
  function inspect(heap: AggregatedHeap, el: AggregatedEventLoop): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Cross-collector: heap pressure + event loop blocked at the same time.
    // Either alone is a warning — together they signal a critical condition
    // where GC is likely causing the event loop to stall.
    const heapHigh = heap.latestUsedMB > LEAK_WARN_THRESHOLD_MB;
    const elBlocked = el.latestLagMs > EVENT_LOOP_WARN_THRESHOLD;

    if (heapHigh && elBlocked) {
      const isCritical =
        heap.latestUsedMB > LEAK_CRIT_THRESHOLD_MB || el.latestLagMs > EVENT_LOOP_CRIT_THRESHOLD;

      anomalies.push({
        type: 'gc-pressure',
        severity: isCritical ? 'critical' : 'warn',
        message: `Heap at ${heap.latestUsedMB.toFixed(1)}MB and event loop lagging ${el.latestLagMs.toFixed(1)}ms — likely GC-induced stall`,
        timestamp: Date.now(),
      });
    }

    // Cross-collector: peak heap much higher than average while event loop
    // is healthy — spike pattern, not a sustained leak.
    const heapSpike = heap.peakUsedMB > heap.avgUsedMB * 1.8;
    const elHealthy = el.avgLagMs < EVENT_LOOP_WARN_THRESHOLD;

    if (heapSpike && elHealthy && heap.peakUsedMB > LEAK_WARN_THRESHOLD_MB) {
      anomalies.push({
        type: 'heap-leak',
        severity: 'warn',
        message: `Heap spike detected — peak ${heap.peakUsedMB.toFixed(1)}MB vs avg ${heap.avgUsedMB.toFixed(1)}MB`,
        timestamp: Date.now(),
      });
    }

    return anomalies;
  }

  return { inspect };
}
