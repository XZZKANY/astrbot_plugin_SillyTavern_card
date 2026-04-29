import { Router } from 'express';
import { config } from '../config.js';
import { closeRoom, fullSync } from '../store/roomStore.js';

function ensureToken(req, res, next) {
  if (!config.syncToken) {
    return res.status(503).json({ error: 'sync_token_not_configured' });
  }
  if (req.header('x-tavern-token') !== config.syncToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

export function createInternalRouter({ broker }) {
  const router = Router();
  router.use(ensureToken);

  router.post('/rooms/:roomId/full-sync', (req, res) => {
    const roomId = String(req.params.roomId || '');
    const payload = req.body || {};
    if (!payload.room || String(payload.room.room_id || roomId) !== roomId) {
      return res.status(400).json({ error: 'room_id_mismatch' });
    }
    fullSync(payload);
    broker?.broadcastPublic(roomId, {
      type: 'room_updated',
      room_id: roomId,
      payload: {
        room: payload.room,
        members: payload.members || [],
        public_event: payload.public_event || null,
        presentation: payload.presentation || {},
      },
    });
    res.json({ ok: true, room_id: roomId });
  });

  router.post('/rooms/:roomId/close', (req, res) => {
    const roomId = String(req.params.roomId || '');
    closeRoom(roomId, req.body?.closed_at);
    broker?.broadcastPublic(roomId, {
      type: 'room_closed',
      room_id: roomId,
      payload: {
        closed_at: String(req.body?.closed_at || new Date().toISOString()),
      },
    });
    res.json({ ok: true, room_id: roomId });
  });

  return router;
}
