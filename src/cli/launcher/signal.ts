import { CDP_PORT, MAX_RETRIES, RETRY_MS } from '@core/shared/constants.js';

export interface SignalResult {
  wsUrl: string;
  port: number;
}

interface CDPTarget {
  id: string;
  type: string;
  title: string;
  webSocketDebuggerUrl: string;
}

export async function activateInspect(pid: number) {
  // SIGUSR1 — Node intercepts this internally and activates the CDP
  // inspector without restarting the process or losing its current state
  try {
    process.kill(pid, 'SIGUSR1');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;

    if (code === 'EPERM') {
      throw new Error(`[v8-lens] No permission to signal PID ${pid}. Try with sudo.`);
    }
    if (code === 'ESRCH') {
      throw new Error(`[v8-lens] Process PID ${pid} no longer exists.`);
    }

    throw new Error(`[v8-lens] Could not signal PID ${pid}: ${(err as Error).message}`);
  }

  // The inspector doesn't activate instantly — poll until it responds
  const wsUrl = await waitForCDP();
  return { wsUrl, port: CDP_PORT };
}

async function waitForCDP() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    await sleep(RETRY_MS);

    try {
      const targets = await fetchTargets(CDP_PORT);
      const target = targets.find((t) => t.type === 'node');

      if (target?.webSocketDebuggerUrl) {
        return target.webSocketDebuggerUrl;
      }
    } catch {
      // port not available yet — retry
    }
  }

  throw new Error(
    `[v8-lens] Process did not open the inspector after ${MAX_RETRIES} attempts. ` +
      `Is it still running?`
  );
}

async function fetchTargets(port: number) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CDPTarget[]>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
