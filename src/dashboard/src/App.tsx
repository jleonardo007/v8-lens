import { useEffect, useRef, useState } from 'react';
import { connectWs } from './ws/ws-client';
import { Heap } from './components/heap';
import { EventLoop } from './components/event-loop';
import { CPU } from './components/cpu';
import { GCEvents } from './components/gc-events';
import { Anomalies } from './components/anomalies';
import type {
  AggregatedHeap,
  AggregatedEventLoop,
  GCEvent,
  Anomaly,
  CPUProfile,
} from '../../core/shared/types';

const WS_URL = 'ws://localhost:3001';
const MAX_GC_EVENTS = 50;
const MAX_ANOMALIES = 50;

export default function App() {
  const wsRef = useRef<ReturnType<typeof connectWs> | null>(null);

  const [heap, setHeap] = useState<AggregatedHeap | null>(null);
  const [el, setEl] = useState<AggregatedEventLoop | null>(null);
  const [cpuProfile, setCPU] = useState<CPUProfile | null>(null);
  const [gcEvents, setGCEvents] = useState<GCEvent[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = connectWs(WS_URL);
    wsRef.current = ws;

    ws.on<AggregatedHeap>('heap', (payload) => {
      setHeap(payload);
      setConnected(true);
    });

    ws.on<AggregatedEventLoop>('event-loop', (payload) => {
      setEl(payload);
    });

    ws.on<CPUProfile>('cpu-profile', (payload) => {
      setCPU(payload);
    });

    ws.on<GCEvent>('gc', (payload) => {
      setGCEvents((prev) => [payload, ...prev].slice(0, MAX_GC_EVENTS));
    });

    ws.on<Anomaly>('anomaly', (payload) => {
      setAnomalies((prev) => [payload, ...prev].slice(0, MAX_ANOMALIES));
    });

    return () => ws.disconnect();
  }, []);

  if (!connected) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-center">
          <div className="w-2 h-2 rounded-full bg-[#7C6AF5] mx-auto mb-4 animate-pulse" />
          <p className="text-[#8B8FA8] font-mono text-sm">Connecting to process...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#F0F0F6] font-['Inter'] p-4 flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[#2ECC8F] animate-pulse" />
        <span className="font-mono text-xs text-[#8B8FA8] tracking-widest uppercase">v8-lens</span>
        <span className="text-[#1E1E2E] text-xs">—</span>
        <span className="font-mono text-xs text-[#8B8FA8]">observing</span>
      </header>

      {/* Top row — Heap + Event Loop side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Heap data={heap} />
        <EventLoop data={el} />
      </div>

      {/* CPU flame graph — full width */}
      <CPU profile={cpuProfile} />

      {/* Bottom row — Anomalies + GC events side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Anomalies items={anomalies} />
        <GCEvents items={gcEvents} />
      </div>
    </div>
  );
}
