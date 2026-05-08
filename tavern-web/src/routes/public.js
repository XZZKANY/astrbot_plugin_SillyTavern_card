import { Router } from 'express';
import { requireRoomToken } from '../auth/middleware.js';
import { addParticipantChat, getMembers, getPublicTimeline, getRoom, getRoomView, getSpectatorView } from '../store/roomStore.js';
import { clampLimit } from '../utils/sanitize.js';

function normalizeChatInput(body = {}) {
  const userName = String(body.user_name || '').trim().slice(0, 24);
  const content = String(body.content || '').trim().slice(0, 300);
  return { userName, content };
}

export function createPublicRouter({ broker } = {}) {
  const router = Router();

  router.get('/rooms/:roomId', (req, res) => {
    const room = getRoom(String(req.params.roomId || ''));
    if (!room) {
      return res.status(404).json({ error: 'room_not_found' });
    }
    res.json(room);
  });

  router.get('/rooms/:roomId/members', (req, res) => {
    const roomId = String(req.params.roomId || '');
    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'room_not_found' });
    }
    res.json(getMembers(roomId));
  });

  router.get('/rooms/:roomId/timeline', (req, res) => {
    const roomId = String(req.params.roomId || '');
    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'room_not_found' });
    }
    res.json(getPublicTimeline(roomId, clampLimit(req.query.limit, 50, 200)));
  });

  router.get('/rooms/:roomId/room-view', requireRoomToken('participant'), (req, res) => {
    const payload = getRoomView(String(req.params.roomId || ''));
    if (!payload) {
      return res.status(404).json({ error: 'room_not_found' });
    }
    res.json(payload);
  });

  router.get('/rooms/:roomId/spectator', (req, res) => {
    const payload = getSpectatorView(String(req.params.roomId || ''));
    if (!payload) {
      return res.status(404).json({ error: 'room_not_found' });
    }
    res.json(payload);
  });

  router.post('/rooms/:roomId/chat', requireRoomToken('participant'), (req, res) => {
    const roomId = String(req.params.roomId || '');
    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'room_not_found' });
    }
    if (room.is_closed) {
      return res.status(409).json({ error: 'room_closed' });
    }
    const userName = String(req.roomToken?.user_name || '').trim().slice(0, 24);
    const { content } = normalizeChatInput(req.body || {});
    if (!userName || !content) {
      return res.status(400).json({ error: 'invalid_chat_message' });
    }
    const chatMessage = addParticipantChat(roomId, {
      user_name: userName,
      content,
    });
    broker?.broadcast(roomId, 'room', {
      type: 'chat_message',
      room_id: roomId,
      payload: {
        chat_message: chatMessage,
      },
    });
    res.json({ ok: true, chat_message: chatMessage });
  });

  return router;
}
