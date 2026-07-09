// ─── CDP ───────────────────────────────────────────────────────
export const CDP_PORT = 9229;
export const MAX_RETRIES = 15;
export const RETRY_MS = 300;

// ─── SharedArrayBuffer / ring buffer ───────────────────────────
export const BUFFER_SIZE = 512; // max samples kept in memory

// Heap slot layout: [timestamp, usedMB, totalMB, externalMB]
export const HEAP_FIELDS = 4;

// Event loop slot layout: [timestamp, lagMs]
export const EVENT_LOOP_FIELDS = 2;

// ─── Heap collector ────────────────────────────────────────────
export const POLL_INTERVAL_MS = 500; // how often heap stats are sampled
export const GC_THRESHOLD_BYTES = 1024 * 1024; // min drop between polls to count as GC

// ─── Event loop collector ──────────────────────────────────────
export const EVENT_LOOP_RESOLUTION_MS = 100; // how often lag is measured
export const EVENT_LOOP_WARN_THRESHOLD = 50; // ms — warn
export const EVENT_LOOP_CRIT_THRESHOLD = 200; // ms — critical

// ─── CPU collector ─────────────────────────────────────────────
export const CPU_SAMPLING_INTERVAL_US = 100; // microseconds — Chrome DevTools standard

// ─── Anomaly detection thresholds ──────────────────────────────
export const ANOMALY_HISTORY_WINDOW = 20;
export const LEAK_WARN_THRESHOLD_MB = 50;
export const LEAK_CRIT_THRESHOLD_MB = 100;
export const GC_PRESSURE_WINDOW_MS = 10_000;
export const GC_PRESSURE_WARN_COUNT = 5;
export const GC_PRESSURE_CRIT_COUNT = 10;

// ─── Worker ────────────────────────────────────────────────────
export const AGGREGATE_INTERVAL_MS = 500; // how often the Worker reads the SAB
export const HISTORY_WINDOW = 60; // number of samples considered for avg/peak
export const WS_PORT = 3001; // Worker WebSocket server toward the dashboard

// ─── Dashboard ─────────────────────────────────────────────────
export const DASHBOARD_PORT = 5173;

// ─── Excluded System Paths ───────────────────────────────────────
export const EXCLUDED_SYSTEM_PATHS = [
  // macOS
  '/Applications/',
  '/System/',
  '/Library/Application Support/',
  '/usr/libexec/',
  '/usr/sbin/',

  // Linux
  '/usr/lib/',
  '/usr/libexec/',
  '/snap/',
  '/opt/',
  '/run/',
  'gnome-shell',
  'gvfsd',

  // IDEs
  '/.vscode',
  '/.vscode-server',
  '/.cursor',
  'Visual Studio Code',
  'extensionHost',
  'Code Helper',
  'JetBrains',
];
