import inquirer from 'inquirer';
import { scanNodeProcesses, type NodeProcess } from '#cli/launcher/scanner';
import { activateInspect } from '#cli/launcher/signal';

export interface LaunchResult {
  pid: number;
  wsUrl: string;
}

export async function launch() {
  // 1. Scan for running Node.js processes, excluding system and IDE namespaces
  const processes = scanNodeProcesses();

  if (!processes.length) {
    console.error(
      '[v8-lens] Node processes not found. Make sure you have a Node.js process running.'
    );
    process.exit(1);
  }

  // 2. Prompt the user to select a process to observe
  const { selected } = await inquirer.prompt<{ selected: NodeProcess }>([
    {
      type: 'select',
      name: 'selected',
      message: 'Select a Node.js process to observe:',
      choices: processes.map((p) => ({
        name: `${p.command.padEnd(50)} PID ${p.pid}`,
        value: p,
      })),
    },
  ]);

  console.log(`\n[v8-lens] Activating inspector on PID ${selected.pid}...`);

  // 3. Activate the inspector on the selected process and retrieve the WebSocket URL
  const { wsUrl } = await activateInspect(selected.pid);

  console.log(`[v8-lens] Inspector active → ${wsUrl}\n`);

  return { pid: selected.pid, wsUrl };
}
