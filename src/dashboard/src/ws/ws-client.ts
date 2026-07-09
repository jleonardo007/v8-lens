import type { WsMessage } from '../../../core/shared/types';

export type MessageHandler<T = unknown> = (payload: T, timestamp: number) => void;

export interface WsClient {
  on: <T>(type: string, handler: MessageHandler<T>) => void;
  off: (type: string) => void;
  disconnect: () => void;
}

export function connectWs(url: string): WsClient {
  const ws = new WebSocket(url);
  const handlers = new Map<string, MessageHandler>();

  ws.addEventListener('open', () => {
    console.log('[v8-lens] Dashboard connected to Worker');
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data) as WsMessage;
      handlers.get(msg.type)?.(msg.payload, msg.timestamp);
    } catch {
      console.error('[v8-lens] Failed to parse WS message', event.data);
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('[v8-lens] WS error', err);
  });

  ws.addEventListener('close', () => {
    console.log('[v8-lens] Worker connection closed');
  });

  return {
    on: (type, handler) => handlers.set(type, handler as MessageHandler),
    off: (type) => handlers.delete(type),
    disconnect: () => ws.close(),
  };
}
