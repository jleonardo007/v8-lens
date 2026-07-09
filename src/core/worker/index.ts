import { parentPort, workerData } from 'node:worker_threads';

import { attachHeapSAB, attachEventLoopSAB } from '@core/shared/buffer';
import { AGGREGATE_INTERVAL_MS, WS_PORT } from '@core/shared/constants';
import type { WorkerInboundMessage } from '@core/shared/types';

import { startWsServer } from './ws-server';
import { createAggregator } from './aggregator';
import { createAnomalyDetector } from './anomaly';

// Both SABs arrive via workerData — same memory as the main thread,
// no copy, no serialization.
const { heapSAB, eventLoopSAB } = workerData as {
  heapSAB: SharedArrayBuffer;
  eventLoopSAB: SharedArrayBuffer;
};

// This module is imported independently in both the main thread and the
// Worker thread. Each import creates its own SAB by default. The bridge
// between them works in two steps:
//   1. Main thread: getHeapSab/getElSab expose the SAB so the Observer
//      can pass it to the Worker via workerData.
//   2. Worker thread: attachHeapSab/attachElSab replace the local empty
//      SAB with the one that arrived via workerData, pointing both
//      threads at the same physical memory.
// After attach is called, writeHeapSample (main thread) and
// readHeapHistory (Worker) operate on the same underlying bytes.
attachHeapSAB(heapSAB);
attachEventLoopSAB(eventLoopSAB);

const aggregator = createAggregator();
const anomalyDetector = createAnomalyDetector();
const wsServer = startWsServer({ port: WS_PORT });

console.log(`[v8-lens] Worker started — WS server on :${WS_PORT}`);

// ─── Continuous loop — reads both SABs, aggregates, broadcasts ─
const intervalId = setInterval(() => {
  const heap = aggregator.computeHeap();
  const el = aggregator.computeEventLoop();

  if (heap) {
    wsServer.broadcast({ type: 'heap', payload: heap, timestamp: Date.now() });
  }

  if (el) {
    wsServer.broadcast({ type: 'event-loop', payload: el, timestamp: Date.now() });
  }

  // Cross-collector anomaly detection
  if (heap && el) {
    for (const anomaly of anomalyDetector.inspect(heap, el)) {
      wsServer.broadcast({ type: 'anomaly', payload: anomaly, timestamp: Date.now() });
    }
  }
}, AGGREGATE_INTERVAL_MS);

// ─── Discrete events from the Observer (main thread) ───────────
parentPort?.on('message', (msg: WorkerInboundMessage) => {
  switch (msg.type) {
    case 'gc':
      wsServer.broadcast({ type: 'gc', payload: msg.payload, timestamp: Date.now() });
      break;

    case 'anomaly':
      wsServer.broadcast({ type: 'anomaly', payload: msg.payload, timestamp: Date.now() });
      break;

    case 'cpu-profile':
      wsServer.broadcast({ type: 'cpu-profile', payload: msg.payload, timestamp: Date.now() });
      break;

    case 'shutdown':
      clearInterval(intervalId);
      wsServer.close();
      process.exit(0);
      break;
  }
});
