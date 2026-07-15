import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { connectCDP, disconnectCDP } from '#core/cdp/client';
import { startHeapCollector } from '#core/collectors/heap';
import { startEventLoopCollector } from '#core/collectors/event-loop';
import { createCPUCollector } from '#core/collectors/cpu';
import { getHeapSAB, getEventLoopSAB } from '#core/shared/buffer';
import type { GCEvent, Anomaly, CPUProfile } from '#core/shared/types';

export interface StartObserverOptions {
  wsUrl: string;
}

// The Observer owns the decision of WHERE collected data goes,
// including the lifecycle of the Worker thread that aggregates
// and serves it to the dashboard. Callers only start/stop it.
export async function startObserver({ wsUrl }: StartObserverOptions) {
  const connection = await connectCDP(wsUrl);
  console.log(`[v8-lens] Observer connected — ${wsUrl}`);

  // The Worker gets the SAB via workerData — same memory as this
  // thread, no copy, no serialization for continuous data.
  const worker = createWorker();
  const heapCollector = await startHeapCollector(
    connection,
    (event) => handleGCEvent(event, worker),
    (anomaly) => handleAnomaly(anomaly, worker)
  );

  const eventLoopCollector = await startEventLoopCollector(connection, (anomaly) =>
    handleAnomaly(anomaly, worker)
  );

  // ─── CPU collector ───────────────────────────────────────────
  // CPU profiling is on-demand — not started automatically.
  // The caller uses startCPU() / stopCPU() to control it.
  const cpuCollector = await createCPUCollector(connection, {
    onProfile: (profile) => handleCPUProfile(profile, worker),
  });

  async function stopObserver() {
    heapCollector.stop();
    eventLoopCollector.stop();
    await disconnectCDP(connection);

    worker.postMessage({ type: 'shutdown' });
    await worker.terminate();

    console.log('[v8-lens] Observer stopped');
  }

  return { stopObserver, startCPU: cpuCollector.start, stopCPU: cpuCollector.stop };
}

// ─── Worker lifecycle ───────────────────────────────────────────

function createWorker() {
  // In dev we run from src/ via tsx, in production from dist/ as
  // compiled JS — detect the environment from the current module
  // instead of relying on directory comparisons.
  const isDev = fileURLToPath(import.meta.url).endsWith('.ts');

  const workerUrl = new URL(isDev ? './worker/index.ts' : './worker/index.js', import.meta.url);

  // buffer.ts owns the SAB — it creates it on module load and keeps it
  // as internal state. getHeapSab/getElSab expose it so the Observer can
  // hand it to the Worker via workerData. Once the Worker calls
  // attachHeapSab/attachElSab, both threads point at the same physical
  // memory — the Observer writes, the Worker reads, zero copies.
  return new Worker(workerUrl, {
    execArgv: isDev ? ['--import=tsx'] : [],
    workerData: {
      heapSAB: getHeapSAB(),
      eventLoopSAB: getEventLoopSAB(),
    },
  });
}

function handleGCEvent(event: GCEvent, worker: Worker) {
  worker.postMessage({ type: 'gc', payload: event });
}

function handleAnomaly(anomaly: Anomaly, worker: Worker) {
  worker.postMessage({ type: 'anomaly', payload: anomaly });
}

function handleCPUProfile(profile: CPUProfile, worker: Worker): void {
  worker.postMessage({ type: 'cpu-profile', payload: profile });
}
