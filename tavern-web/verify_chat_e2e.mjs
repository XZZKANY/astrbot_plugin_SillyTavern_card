import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(rootDir, 'data', 'test-tavern-chat.db');
process.env.TAVERN_WEB_PORT = '8094';
process.env.TAVERN_WEB_DB_PATH = testDbPath;
process.env.TAVERN_WEB_SYNC_TOKEN = 'test-token';

await mkdir(path.dirname(testDbPath), { recursive: true });
await Promise.all([
  rm(testDbPath, { force: true }),
  rm(`${testDbPath}-shm`, { force: true }),
  rm(`${testDbPath}-wal`, { force: true }),
]);

const { runMigrations } = await import('./src/db/migrations.js');
runMigrations();
const { createBroker } = await import('./src/ws/broker.js');
const { createApp } = await import('./src/app.js');

const broker = createBroker();
const app = createApp({ broker });
const server = createServer(app);
broker.attach(server);
await new Promise((resolve) => server.listen(8094, '127.0.0.1', resolve));

const roomId = 'chat-room';
const base = 'http://127.0.0.1:8094';
const roomMessages = [];
const spectatorMessages = [];
const roomWs = new WebSocket('ws://127.0.0.1:8094/ws');
const spectatorWs = new WebSocket('ws://127.0.0.1:8094/ws');
await Promise.all([
  new Promise((resolve) => roomWs.once('open', resolve)),
  new Promise((resolve) => spectatorWs.once('open', resolve)),
]);
roomWs.on('message', (raw) => roomMessages.push(JSON.parse(raw.toString())));
spectatorWs.on('message', (raw) => spectatorMessages.push(JSON.parse(raw.toString())));
roomWs.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'room' }));
spectatorWs.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'spectator' }));

const syncResponse = await fetch(`${base}/internal/rooms/${roomId}/full-sync`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-tavern-token': 'test-token' },
  body: JSON.stringify({
    room: {
      room_id: roomId,
      group_id: roomId,
      owner_id: '1',
      owner_name: '房主',
      script_name: '校园怪谈',
      started: true,
      locked: true,
      phase_name: '情报交流',
      turn_index: 0,
      current_actor_id: '1',
      current_actor_name: '房主',
      member_count: 2,
      public_status: '进行中',
      updated_at: '2026-04-29 15:00:00',
    },
    members: [],
    public_event: null,
    presentation: { phase_index: 2, phase_total: 4 },
  }),
});
assert.equal(syncResponse.status, 200);

const chatResponse = await fetch(`${base}/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    user_name: '网页玩家',
    content: '我怀疑：旧实验楼门口的人<script>window.__xss=1</script>',
  }),
});
assert.equal(chatResponse.status, 200);
const chatPayload = await chatResponse.json();
assert.equal(chatPayload.ok, true);
assert.equal(chatPayload.chat_message.user_name, '网页玩家');
assert.equal(chatPayload.chat_message.content, '我怀疑：旧实验楼门口的人<script>window.__xss=1</script>');

await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(roomMessages.at(-1)?.type, 'chat_message');
assert.equal(roomMessages.at(-1)?.payload?.chat_message?.content.includes('<script>'), true);
assert.equal(spectatorMessages.some((message) => message.type === 'chat_message'), false);

const roomViewResponse = await fetch(`${base}/api/rooms/${roomId}/room-view`);
assert.equal(roomViewResponse.status, 200);
const roomView = await roomViewResponse.json();
assert.equal(Array.isArray(roomView.public_timeline), true);
assert.equal(Array.isArray(roomView.participant_chat), true);
assert.equal(roomView.participant_chat[0].user_name, '网页玩家');
assert.equal(roomView.participant_chat[0].content, '我怀疑：旧实验楼门口的人<script>window.__xss=1</script>');
assert.equal(roomView.public_timeline.some((item) => item.event_type === 'public_chat'), false);

const spectatorResponse = await fetch(`${base}/api/rooms/${roomId}/spectator`);
assert.equal(spectatorResponse.status, 200);
const spectator = await spectatorResponse.json();
assert.equal(Array.isArray(spectator.public_timeline), true);
assert.equal('members' in spectator, false);
assert.equal('participant_chat' in spectator, false);
assert.equal(spectator.public_timeline.some((item) => item.event_type === 'public_chat'), false);

const badChat = await fetch(`${base}/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_name: '', content: '' }),
});
assert.equal(badChat.status, 400);

const closeResponse = await fetch(`${base}/internal/rooms/${roomId}/close`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-tavern-token': 'test-token' },
  body: JSON.stringify({ closed_at: '2026-04-29 15:30:00' }),
});
assert.equal(closeResponse.status, 200);

const closedChat = await fetch(`${base}/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_name: '网页玩家', content: '关闭后不该发送' }),
});
assert.equal(closedChat.status, 409);

roomWs.close();
spectatorWs.close();
server.close();
console.log('tavern-web chat verification passed');
