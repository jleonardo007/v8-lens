import { WebSocketServer, type WebSocket } from 'ws';
import type { WsMessage } from '@core/shared/types';

export interface WsServerOptions {
  port: number;
}

export interface WsServerHandle {
  broadcast: (message: WsMessage) => void;
  close: () => void;
}

export function startWsServer(options: WsServerOptions): WsServerHandle {
  const wss = new WebSocketServer({ port: options.port });
  const clients = new Set<WebSocket>();

  wss.on('connection', (socket) => {
    clients.add(socket);
    console.log(`[v8-lens] Dashboard connected — ${clients.size} client(s)`);

    socket.on('close', () => {
      clients.delete(socket);
    });
  });

  function broadcast(message: WsMessage): void {
    const serialized = JSON.stringify(message);

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(serialized);
      }
    }
  }

  function close(): void {
    for (const client of clients) {
      client.close();
    }
    wss.close();
  }

  return { broadcast, close };
}
