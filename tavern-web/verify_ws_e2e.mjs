import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(rootDir, 'data', 'test-tavern-ws.db');
process.env.TAVERN_WEB_PORT = '8092';
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

await new Promise((resolve) => server.listen(8092, '127.0.0.1', resolve));

const roomId = 'ws-room';
const roomMessages = [];
const spectatorMessages = [];
const roomWs = new WebSocket('ws://127.0.0.1:8092/ws');
const spectatorWs = new WebSocket('ws://127.0.0.1:8092/ws');
await Promise.all([
  new Promise((resolve) => roomWs.once('open', resolve)),
  new Promise((resolve) => spectatorWs.once('open', resolve)),
]);
roomWs.on('message', (raw) => roomMessages.push(JSON.parse(raw.toString())));
spectatorWs.on('message', (raw) => spectatorMessages.push(JSON.parse(raw.toString())));
roomWs.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'room' }));
spectatorWs.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'spectator' }));

const payload = {
  room: {
    room_id: roomId,
    group_id: roomId,
    owner_id: '1',
    owner_name: '房主',
    script_name: '校园怪谈',
    started: true,
    locked: true,
    phase_name: '行动阶段',
    turn_index: 1,
    current_actor_id: '2',
    current_actor_name: '玩家二',
    member_count: 2,
    public_status: '进行中',
    updated_at: '2026-04-29 13:00:00',
  },
  members: [
    { user_id: '1', user_name: '房主', is_owner: true, joined_at: '2026-04-29 12:58:00' },
    { user_id: '2', user_name: '玩家二', is_owner: false, joined_at: '2026-04-29 12:59:00' },
  ],
  public_event: {
    event_type: 'phase_changed',
    title: '进入行动阶段',
    content: '广播室突然传来断断续续的录音。',
    created_at: '2026-04-29 13:00:00',
  },
  presentation: {
    opening: '旧实验楼里传来第二次点名。',
    phase_event: '广播室突然传来断断续续的录音。',
    phase_goal: '做出本轮行动选择，明确调查对象。',
    public_action_hint: '说清楚你要查谁、查哪里或保护谁。',
    next_step: '行动完成后由房主推进到结算阶段。',
    settlement_tips: [],
    phase_index: 3,
    phase_total: 4,
  },
};

const syncResponse = await fetch(`http://127.0.0.1:8092/internal/rooms/${roomId}/full-sync`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tavern-token': 'test-token',
  },
  body: JSON.stringify(payload),
});
assert.equal(syncResponse.status, 200);

await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(roomMessages[0]?.type, 'room_updated');
assert.equal(roomMessages[0]?.payload?.presentation?.phase_index, 3);
assert.equal(roomMessages[0]?.payload?.public_event?.title, '进入行动阶段');
assert.equal(spectatorMessages[0]?.type, 'room_updated');
assert.equal(spectatorMessages[0]?.payload?.presentation?.phase_index, 3);
assert.equal(spectatorMessages[0]?.payload?.public_event?.title, '进入行动阶段');

const chatResponse = await fetch(`http://127.0.0.1:8092/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    user_name: '网页玩家',
    content: '我怀疑：广播室钥匙被人动过',
  }),
});
assert.equal(chatResponse.status, 200);

await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(roomMessages.some((message) => message.type === 'chat_message'), true);
assert.equal(spectatorMessages.some((message) => message.type === 'chat_message'), false);

const closeResponse = await fetch(`http://127.0.0.1:8092/internal/rooms/${roomId}/close`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tavern-token': 'test-token',
  },
  body: JSON.stringify({ closed_at: '2026-04-29 13:30:00' }),
});
assert.equal(closeResponse.status, 200);

await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(roomMessages.at(-1)?.type, 'room_closed');
assert.equal(spectatorMessages.at(-1)?.type, 'room_closed');

const roomScript = await readFile(path.join(rootDir, 'web', 'room.js'), 'utf8');
const spectatorScript = await readFile(path.join(rootDir, 'web', 'spectator.js'), 'utf8');
for (const script of [roomScript, spectatorScript]) {
  assert.equal(script.includes('handleRealtimeMessage'), true, '缺少增量消息处理函数');
  assert.equal(script.includes('prependPublicEvent'), true, '缺少公开事件插入逻辑');
  assert.equal(script.includes('renderAll(await loadSpectator(roomId))'), false, '仍在 WS 事件中整页重拉');
}

roomWs.close();
spectatorWs.close();
server.close();
console.log('tavern-web ws verification passed');
