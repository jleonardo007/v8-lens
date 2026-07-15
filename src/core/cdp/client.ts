import WebSocket from 'ws';

interface CDPMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
}

interface PendingCommand {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

export interface CDPConnection {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, handler: (params: unknown) => void) => void;
  off: (event: string) => void;
  ws: WebSocket;
}

export function connectCDP(url: string): Promise<CDPConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pendingCommands = new Map<number, PendingCommand>();
    const eventHandlers = new Map<string, (params: unknown) => void>();
    let nextId = 0;

    function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
      return new Promise((res, rej) => {
        const id = nextId++;
        pendingCommands.set(id, { resolve: res, reject: rej });

        // Send the command to the CDP WebSocket
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    function on(event: string, handler: (params: unknown) => void): void {
      eventHandlers.set(event, handler);
    }

    function off(event: string): void {
      eventHandlers.delete(event);
    }

    function handleMessage(raw: WebSocket.RawData) {
      const msg: CDPMessage = JSON.parse(raw.toString());

      if (msg.id !== undefined) {
        // Is a response to a command sent — resolve or reject the corresponding promise
        const pending = pendingCommands.get(msg.id);
        if (!pending) return;
        pendingCommands.delete(msg.id);

        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          // Resolve the promise with the result of the command
          pending.resolve(msg.result);
        }
      } else if (msg.method) {
        // Is and asynchronous event from the CDP — dispatch to the registered handler
        eventHandlers.get(msg.method)?.(msg.params);
      }
    }

    ws.on('open', () => {
      // Connection established, resolve the CDPConnection object
      resolve({ send, on, off, ws });
    });

    ws.on('message', handleMessage);
    ws.on('error', (err) => {
      console.error('[CDPConnection] WebSocket error:', err);
      reject(err);
    });
  });
}

export function disconnectCDP(connection: CDPConnection): Promise<void> {
  return new Promise((resolve) => {
    connection.ws.once('close', () => resolve());
    connection.ws.close();
  });
}
