import { WebSocketServer, WebSocket } from 'ws';

export function createBroker() {
  const channelSubscribers = new Map();
  const subscriptions = new Map();

  function normalizeChannel(channel) {
    return channel === 'spectator' ? 'spectator' : 'room';
  }

  function key(roomId, channel) {
    return `${roomId}:${normalizeChannel(channel)}`;
  }

  function unsubscribeAll(ws) {
    const targets = subscriptions.get(ws) || new Set();
    for (const target of targets) {
      const peers = channelSubscribers.get(target);
      if (!peers) continue;
      peers.delete(ws);
      if (peers.size === 0) {
        channelSubscribers.delete(target);
      }
    }
    subscriptions.delete(ws);
  }

  function subscribe(ws, roomId, channel = 'room') {
    if (!roomId) return;
    unsubscribeAll(ws);
    const target = key(roomId, channel);
    if (!channelSubscribers.has(target)) {
      channelSubscribers.set(target, new Set());
    }
    channelSubscribers.get(target).add(ws);
    subscriptions.set(ws, new Set([target]));
  }

  function broadcast(roomId, channel, message) {
    const peers = channelSubscribers.get(key(roomId, channel));
    if (!peers || peers.size === 0) return;
    const payload = JSON.stringify(message);
    for (const ws of peers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function broadcastPublic(roomId, message) {
    broadcast(roomId, 'room', message);
    broadcast(roomId, 'spectator', message);
  }

  function attach(server) {
    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (message?.type === 'subscribe') {
            subscribe(ws, String(message.room_id || ''), message.channel);
          }
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'invalid_message' }));
        }
      });
      ws.on('close', () => unsubscribeAll(ws));
      ws.on('error', () => unsubscribeAll(ws));
    });
  }

  return {
    attach,
    broadcast,
    broadcastPublic,
  };
}
