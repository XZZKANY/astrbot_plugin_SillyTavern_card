import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const base = process.env.TAVERN_WEB_BASE || 'http://127.0.0.1:8088';
const roomId = process.env.TAVERN_WEB_ROOM_ID || '1083966574';
const content = `real-flow-test-${Date.now()}`;
const userName = 'real-flow-test';

async function fetchJson(path, init) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}:${res.status}:${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchText(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}:${res.status}:${text.slice(0, 300)}`);
  return text;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openSubscribedWs(channel, bucket) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.on('message', (raw) => bucket.push(JSON.parse(raw.toString())));
  ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel }));
  return ws;
}

const health = await fetchJson('/healthz');
assert.equal(health.ok, true);

const roomHtml = await fetchText(`/room/${roomId}`);
const spectatorHtml = await fetchText(`/spectator/${roomId}`);
assert.equal(roomHtml.includes('room-chat-form'), true, 'room html missing composer');
assert.equal(roomHtml.includes('room-chat-feed'), true, 'room html missing feed');
assert.equal(spectatorHtml.includes('spectator-chat-feed'), true, 'spectator html missing feed');
assert.equal(spectatorHtml.includes('spectator-chat-form'), false, 'spectator html exposes chat form');

const beforeRoomView = await fetchJson(`/api/rooms/${roomId}/room-view`);
assert.equal(Array.isArray(beforeRoomView.participant_chat), true);
assert.equal(Array.isArray(beforeRoomView.public_timeline), true);

const beforeSpectator = await fetchJson(`/api/rooms/${roomId}/spectator`);
assert.equal(Array.isArray(beforeSpectator.public_timeline), true);
assert.equal('participant_chat' in beforeSpectator, false);
assert.equal('members' in beforeSpectator, false);

const roomMessages = [];
const spectatorMessages = [];
const roomWs = await openSubscribedWs('room', roomMessages);
const spectatorWs = await openSubscribedWs('spectator', spectatorMessages);
await wait(150);

const post = await fetchJson(`/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_name: userName, content }),
});
assert.equal(post.ok, true);
assert.equal(post.chat_message.content, content);
assert.equal(post.chat_message.user_name, userName);

await wait(400);
assert.equal(roomMessages.some((m) => m.type === 'chat_message' && m.payload?.chat_message?.content === content), true, 'room ws did not receive chat');
assert.equal(spectatorMessages.some((m) => m.type === 'chat_message' && m.payload?.chat_message?.content === content), false, 'spectator ws received participant chat');

const afterRoomView = await fetchJson(`/api/rooms/${roomId}/room-view`);
assert.equal(afterRoomView.participant_chat.some((m) => m.content === content && m.user_name === userName), true, 'room-view missing participant chat');
assert.equal(afterRoomView.public_timeline.some((m) => m.content === content), false, 'participant chat leaked into public_timeline');

const afterSpectator = await fetchJson(`/api/rooms/${roomId}/spectator`);
assert.equal('participant_chat' in afterSpectator, false, 'spectator leaked participant_chat key');
assert.equal('members' in afterSpectator, false, 'spectator leaked members key');
assert.equal(afterSpectator.public_timeline.some((m) => m.content === content), false, 'spectator public_timeline leaked participant chat');

roomWs.close();
spectatorWs.close();
console.log(JSON.stringify({ ok: true, roomId, content, checks: ['health', 'html', 'api-before', 'ws-room-only', 'api-after-isolated'] }, null, 2));
