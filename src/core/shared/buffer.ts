import { BUFFER_SIZE, HEAP_FIELDS, EVENT_LOOP_FIELDS } from './constants';

// =============================================================================
// Shared layout
//
// Heap SAB
// ┌──────────────────────────────┐
// │ Int32 head (4 bytes)         │
// ├──────────────────────────────┤
// │ Float64 ring buffer          │
// │ timestamp                    │
// │ usedMB                       │
// │ totalMB                      │
// │ externalMB                   │
// │ ...                          │
// └──────────────────────────────┘
//
// EventLoop SAB
// ┌──────────────────────────────┐
// │ Int32 head (4 bytes)         │
// ├──────────────────────────────┤
// │ Float64 ring buffer          │
// │ timestamp                    │
// │ lagMs                        │
// │ ...                          │
// └──────────────────────────────┘
//
// The head is shared between threads through Atomics.
// =============================================================================

// -----------------------------------------------------------------------------
// Heap
// -----------------------------------------------------------------------------

export interface HeapSample {
  timestamp: number;
  usedMB: number;
  totalMB: number;
  externalMB: number;
}

const HEAP_HEADER_BYTES = Int32Array.BYTES_PER_ELEMENT * 4;
const HEAP_RING_BYTES = BUFFER_SIZE * HEAP_FIELDS * Float64Array.BYTES_PER_ELEMENT;

let heapSAB = new SharedArrayBuffer(HEAP_HEADER_BYTES + HEAP_RING_BYTES);

let heapHeadView = new Int32Array(heapSAB, 0, 1);

let heapRing = new Float64Array(heapSAB, HEAP_HEADER_BYTES);

export function writeHeapSample(sample: HeapSample): void {
  const head = Atomics.load(heapHeadView, 0);

  const base = (head % BUFFER_SIZE) * HEAP_FIELDS;

  heapRing[base] = sample.timestamp;
  heapRing[base + 1] = sample.usedMB;
  heapRing[base + 2] = sample.totalMB;
  heapRing[base + 3] = sample.externalMB;

  Atomics.store(heapHeadView, 0, head + 1);
}

export function readHeapHistory(count: number): HeapSample[] {
  const head = Atomics.load(heapHeadView, 0);

  const available = Math.min(head, BUFFER_SIZE, count);

  const result: HeapSample[] = [];

  for (let i = available - 1; i >= 0; i--) {
    const pos = (((head - available + i) % BUFFER_SIZE) + BUFFER_SIZE) % BUFFER_SIZE;

    const base = pos * HEAP_FIELDS;
    if (isNaN(heapRing[base + 1])) {
      console.warn('NaN detected in heapRing at position', base + 1);
    }
    result.push({
      timestamp: heapRing[base],
      usedMB: heapRing[base + 1],
      totalMB: heapRing[base + 2],
      externalMB: heapRing[base + 3],
    });
  }

  return result;
}

export function getHeapSAB(): SharedArrayBuffer {
  return heapSAB;
}

export function attachHeapSAB(sab: SharedArrayBuffer): void {
  heapSAB = sab;

  heapHeadView = new Int32Array(heapSAB, 0, 1);

  heapRing = new Float64Array(heapSAB, HEAP_HEADER_BYTES);
}

// -----------------------------------------------------------------------------
// Event Loop
// -----------------------------------------------------------------------------

export interface EventLoopSample {
  timestamp: number;
  lagMs: number;
}

const EL_HEADER_BYTES = Int32Array.BYTES_PER_ELEMENT * 4;

const EL_RING_BYTES = BUFFER_SIZE * EVENT_LOOP_FIELDS * Float64Array.BYTES_PER_ELEMENT;

let eventLoopSAB = new SharedArrayBuffer(EL_HEADER_BYTES + EL_RING_BYTES);

let elHeadView = new Int32Array(eventLoopSAB, 0, 1);

let elRing = new Float64Array(eventLoopSAB, EL_HEADER_BYTES);

export function writeEventLoopSample(sample: EventLoopSample): void {
  const head = Atomics.load(elHeadView, 0);

  const base = (head % BUFFER_SIZE) * EVENT_LOOP_FIELDS;

  elRing[base] = sample.timestamp;
  elRing[base + 1] = sample.lagMs;

  Atomics.store(elHeadView, 0, head + 1);
}

export function readEventLoopHistory(count: number): EventLoopSample[] {
  const head = Atomics.load(elHeadView, 0);

  const available = Math.min(head, BUFFER_SIZE, count);

  const result: EventLoopSample[] = [];

  for (let i = available - 1; i >= 0; i--) {
    const pos = (((head - available + i) % BUFFER_SIZE) + BUFFER_SIZE) % BUFFER_SIZE;

    const base = pos * EVENT_LOOP_FIELDS;

    result.push({
      timestamp: elRing[base],
      lagMs: elRing[base + 1],
    });
  }

  return result;
}

export function getEventLoopSAB(): SharedArrayBuffer {
  return eventLoopSAB;
}

export function attachEventLoopSAB(sab: SharedArrayBuffer): void {
  eventLoopSAB = sab;

  elHeadView = new Int32Array(eventLoopSAB, 0, 1);

  elRing = new Float64Array(eventLoopSAB, EL_HEADER_BYTES);
}
