#!/usr/bin/env node

import { resolve, dirname, join, extname } from 'node:path';
import { createServer as createHttpServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createServer, type ViteDevServer } from 'vite';

import { launch } from '#cli/launcher/index';
import { startObserver } from '#core/observer';
import { DASHBOARD_PORT } from '#core/shared/constants';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Environment detection ─────────────────────────────────────
// In dev we run with tsx from src/cli/index.ts
// In production we run the compiled JS from dist/cli/index.js
function isDevEnvironment() {
  return __dirname.includes(resolve('src'));
}

// ─── Dashboard — development mode ──────────────────────────────
// Vite's programmatic API. HMR enabled, serves from src/dashboard.
async function startDevDashboard() {
  console.log('[v8-lens] Starting dashboard in dev mode...');
  const dashboardRoot = resolve(__dirname, '../dashboard');

  const vite = await createServer({
    configFile: resolve(dashboardRoot, 'vite.config.ts'),
    root: dashboardRoot,
    server: { port: DASHBOARD_PORT },
  });

  await vite.listen();
  return vite;
}

// ─── Dashboard — production mode ───────────────────────────────
// Serves the already-built static files from dist/dashboard.
function startProdDashboard() {
  const distPath = resolve(__dirname, '../dashboard');

  const server = createHttpServer(async (req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : (req.url ?? '/index.html');

    try {
      const filePath = join(distPath, urlPath);
      const content = await readFile(filePath);
      res.setHeader('Content-Type', mimeType(extname(filePath)));
      res.end(content);
    } catch {
      try {
        const fallback = await readFile(join(distPath, 'index.html'));
        res.setHeader('Content-Type', 'text/html');
        res.end(fallback);
      } catch {
        res.statusCode = 404;
        res.end('Not found');
      }
    }
  });

  server.listen(DASHBOARD_PORT);
  return server;
}

function mimeType(ext: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.json': 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}

// ─── CPU keypress control ──────────────────────────────────────
// p → start CPU profile
// s → stop CPU profile and send to dashboard
// q → quit

let cpuProfiling = false;

function registerKeypressControl(startCPU: () => Promise<void>, stopCPU: () => Promise<void>) {
  if (!process.stdin.isTTY) return;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (key: string) => {
    switch (key) {
      case 'p':
        if (cpuProfiling) {
          console.log('[v8-lens] CPU profile already running — press s to stop');
          return;
        }
        await startCPU();
        cpuProfiling = true;
        console.log('[v8-lens] CPU profiling started — press s to stop');
        break;

      case 's':
        if (!cpuProfiling) {
          console.log('[v8-lens] No CPU profile running — press p to start');
          return;
        }
        await stopCPU();
        cpuProfiling = false;
        console.log('[v8-lens] CPU profile stopped — check the dashboard');
        break;

      case 'q':
      case '\u0003': // Ctrl+C
        process.emit('SIGINT');
        break;
    }
  });

  console.log('\n  p → start CPU profile');
  console.log('  s → stop CPU profile');
  console.log('  q → quit\n');
}

// ─── Cleanup ────────────────────────────────────────────────────
type DashboardHandle = ViteDevServer | Server;

function registerCleanup(
  dashboard: DashboardHandle,
  stopObserver: () => Promise<void>,
  stopCPU: () => Promise<void>
) {
  const shutdown = async () => {
    console.log('\n[v8-lens] Shutting down...');

    // Close stdin first — prevents raw mode from blocking the exit
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    // Safety timeout — force exit in 3s if anything hangs
    const forceExit = setTimeout(() => {
      console.log('[v8-lens] Force exit');
      process.exit(1);
    }, 3000);
    forceExit.unref(); // don't block the event loop if everything closes cleanly

    // Stop CPU profile if still running
    if (cpuProfiling) {
      await stopCPU().catch(() => {});
    }

    await stopObserver();

    if ('close' in dashboard && typeof dashboard.close === 'function') {
      await dashboard.close();
    }

    clearTimeout(forceExit);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ─── Entry point ────────────────────────────────────────────────
yargs(hideBin(process.argv))
  .scriptName('v8-lens')
  .usage('$0 [options]')
  .version('0.1.0')
  .command(
    '$0',
    'Observe a running Node.js process in real time',
    (yargs) =>
      // --url / -u — connect directly to a CDP WebSocket URL,
      // bypassing the process scanner and SIGUSR1 flow.
      // Useful for Docker containers or remote processes where
      // the inspector is already active and the port is exposed.
      //
      // Usage:
      //   docker exec <container> kill -USR1 <PID>
      //   v8-lens --url ws://127.0.0.1:9229
      //
      yargs.option('url', {
        alias: 'u',
        type: 'string',
        describe: 'Connect directly to a CDP WebSocket URL',
      }),
    async (argv) => {
      let pid: number | undefined;
      let wsUrl: string;

      // When --url is enabled, replace launch() with direct connection:
      if (argv.url) {
        wsUrl = argv.url;
      } else {
        // 1. Scan processes and activate the inspector on the selected one
        const process = await launch();
        pid = process.pid;
        wsUrl = process.wsUrl;
      }

      console.log(`[v8-lens] Connected to PID ${pid} — ${wsUrl}`);

      // 2. Instantiate the Observer
      // The Observer owns its internal wiring (SAB writes, Worker notifications).
      const { stopObserver, startCPU, stopCPU } = await startObserver({ wsUrl });

      // 3. Start the dashboard based on the environment
      console.log('[v8-lens] Starting dashboard...');
      const isDev = isDevEnvironment();
      let dashboard: DashboardHandle;

      if (isDev) {
        dashboard = await startDevDashboard();
      } else {
        dashboard = await startProdDashboard();
      }

      console.log(`[v8-lens] Dashboard available at http://localhost:${DASHBOARD_PORT}`);

      // 4 — register keypress control for CPU profiler
      registerKeypressControl(startCPU, stopCPU);

      // 4. Register orderly cleanup on exit
      registerCleanup(dashboard, stopObserver, stopCPU);
    }
  )
  .help()
  .parse();
