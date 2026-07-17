import type { Anomaly } from '@core/shared/types.js';
import type { CDPConnection } from '@core/cdp/client.js';
import { writeEventLoopSample } from '@core/shared/buffer.js';

import {
  EVENT_LOOP_RESOLUTION_MS,
  EVENT_LOOP_WARN_THRESHOLD,
  EVENT_LOOP_CRIT_THRESHOLD,
} from '@core/shared/constants.js';

export interface EventLoopCollectorHandle {
  stop: () => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function startEventLoopCollector(
  connection: CDPConnection,
  onAnomaly: (anomaly: Anomaly) => void
): Promise<EventLoopCollectorHandle> {
  let running = true;

  async function collect(): Promise<void> {
    while (running) {
      try {
        const start = performance.now();

        await connection.send('Runtime.evaluate', {
          expression: `
            const start = performance.now();

            return new Promise(resolve => {
              setTimeout(() => {
              resolve(performance.now() - start);
            }, 0);
          });
          `,
          awaitPromise: true,
          returnByValue: true,
        });

        const responseTimeMs = performance.now() - start;
        const timestamp = Date.now();

        writeEventLoopSample({
          timestamp,
          lagMs: responseTimeMs,
        });

        if (responseTimeMs > EVENT_LOOP_WARN_THRESHOLD) {
          onAnomaly({
            type: 'event-loop-block',
            severity: responseTimeMs > EVENT_LOOP_CRIT_THRESHOLD ? 'critical' : 'warn',
            message: `Event loop blocked for ${responseTimeMs.toFixed(1)}ms`,
            timestamp,
          });
        }
      } catch (error) {
        console.error('[EventLoopCollector]', error);
      }

      if (running) {
        await sleep(EVENT_LOOP_RESOLUTION_MS);
      }
    }
  }

  void collect();

  return {
    stop() {
      running = false;
    },
  };
}
