import type { CDPConnection } from '@core/cdp/client';
import type { HeapSnapshot, GCEvent, Anomaly } from '@core/shared/types';
import { writeHeapSample, readHeapHistory } from '@core/shared/buffer';
import {
  POLL_INTERVAL_MS,
  GC_THRESHOLD_BYTES,
  LEAK_WARN_THRESHOLD_MB,
  LEAK_CRIT_THRESHOLD_MB,
  GC_PRESSURE_WARN_COUNT,
  GC_PRESSURE_CRIT_COUNT,
  GC_PRESSURE_WINDOW_MS,
  ANOMALY_HISTORY_WINDOW,
} from '@core/shared/constants';

interface RawHeapStats {
  usedSize: number;
  totalSize: number;
}

interface HeapUsageResult {
  usedSize: number;
  totalSize: number;
}

export async function startHeapCollector(
  connection: CDPConnection,
  onGCEvent: (event: GCEvent) => void,
  onAnomaly: (anomaly: Anomaly) => void
) {
  await connection.send('Runtime.enable');

  const gcEvents: GCEvent[] = [];
  let lastHeapUsed = 0;

  const intervalId = setInterval(async () => {
    try {
      const raw = await readHeapStats(connection);

      const snapshot: HeapSnapshot = {
        timestamp: Date.now(),
        usedBytes: raw.usedSize,
        totalBytes: raw.totalSize,
        externalBytes: 0,
      };

      writeHeapSample({
        timestamp: snapshot.timestamp,
        usedMB: bytesToMB(raw.usedSize),
        totalMB: bytesToMB(raw.totalSize),
        externalMB: 0,
      });

      const gcEvent = detectGC(lastHeapUsed, raw.usedSize);

      if (gcEvent) {
        gcEvents.push(gcEvent);

        if (gcEvents.length > 50) {
          gcEvents.shift();
        }

        onGCEvent(gcEvent);
      }

      lastHeapUsed = raw.usedSize;

      for (const anomaly of detectAnomalies(gcEvents)) {
        onAnomaly(anomaly);
      }
    } catch (err) {
      console.error('[HeapCollector]', err);
    }
  }, POLL_INTERVAL_MS);

  return {
    stop() {
      clearInterval(intervalId);
    },
  };
}

async function readHeapStats(connection: CDPConnection): Promise<RawHeapStats> {
  const { usedSize, totalSize } = (await connection.send(
    'Runtime.getHeapUsage'
  )) as HeapUsageResult;

  return {
    usedSize,
    totalSize,
  };
}

function detectGC(lastHeapUsed: number, currentUsed: number): GCEvent | null {
  const delta = lastHeapUsed - currentUsed;

  if (delta <= GC_THRESHOLD_BYTES) {
    return null;
  }

  return {
    timestamp: Date.now(),
    type: delta > 10 * 1024 * 1024 ? 'Major' : 'Minor',
    durationMs: 0,
    freedBytes: delta,
  };
}

function bytesToMB(bytes?: number): number {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    return 0;
  }

  return bytes / 1024 / 1024;
}

function detectAnomalies(events: GCEvent[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const history = readHeapHistory(ANOMALY_HISTORY_WINDOW);

  if (history.length >= 10) {
    const growthMB = history[history.length - 1].usedMB - history[0].usedMB;

    if (growthMB > LEAK_WARN_THRESHOLD_MB) {
      anomalies.push({
        type: 'heap-leak',
        severity: growthMB > LEAK_CRIT_THRESHOLD_MB ? 'critical' : 'warn',
        message: `Heap grew ${growthMB.toFixed(1)}MB over the last ${history.length} samples`,
        timestamp: Date.now(),
      });
    }
  }

  const recentGC = events.filter((e) => Date.now() - e.timestamp < GC_PRESSURE_WINDOW_MS);

  if (recentGC.length > GC_PRESSURE_WARN_COUNT) {
    anomalies.push({
      type: 'gc-pressure',
      severity: recentGC.length > GC_PRESSURE_CRIT_COUNT ? 'critical' : 'warn',
      message: `${recentGC.length} GC events in the last ${GC_PRESSURE_WINDOW_MS / 1000}s`,
      timestamp: Date.now(),
    });
  }

  return anomalies;
}
