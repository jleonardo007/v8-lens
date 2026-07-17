import { execSync } from 'node:child_process';
import { EXCLUDED_SYSTEM_PATHS } from '@core/shared/constants.js';

export interface NodeProcess {
  pid: number;
  command: string;
}

export function scanNodeProcesses() {
  const ownPid = process.pid;
  const parentPid = process.ppid;

  try {
    const output = execSync('ps ax -o pid,command', { encoding: 'utf8' });

    return output
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => {
        const [pidStr] = line.split(/\s+/);
        const pid = parseInt(pidStr, 10);

        if (pid === ownPid || pid === parentPid) return false;
        if (!/\b(node|tsx|ts-node)\b/.test(line)) return false;

        // Exclude system processes and IDEs (VSCode, WebStorm, etc.) by matching their paths
        return !EXCLUDED_SYSTEM_PATHS.some((pattern) => line.includes(pattern));
      })
      .map((line) => {
        const [pidStr, ...rest] = line.split(/\s+/);
        const rawCommand = rest.join(' ');

        // clean up the command to show only the executable name, e.g.:
        // /usr/local/bin/node server.js → node server.js
        const command = rawCommand.replace(/^.*\/(node|tsx|ts-node)\b/, '$1');

        return {
          pid: parseInt(pidStr, 10),
          command,
        };
      })
      .filter((p) => !isNaN(p.pid));
  } catch {
    console.error(
      '[v8-lens] Error to scan Node processes. Make sure you have the "ps" command available.'
    );
    return [];
  }
}
