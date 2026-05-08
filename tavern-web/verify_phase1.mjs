import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(rootDir, 'data', 'test-tavern.db');
process.env.TAVERN_WEB_PORT = '8091';
process.env.TAVERN_WEB_DB_PATH = testDbPath;
process.env.TAVERN_WEB_SYNC_TOKEN = 'test-token';
process.env.TAVERN_WEB_AUTH_SECRET = 'test-secret-minimum-32-characters';

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
const { createParticipantToken } = await import('./src/auth/tokens.js');

const broker = createBroker();
const app = createApp({ broker });
const server = createServer(app);
broker.attach(server);

await new Promise((resolve) => server.listen(8091, '127.0.0.1', resolve));

const roomId = '1083966574';
const payload = {
  room: {
    room_id: roomId,
    group_id: roomId,
    owner_id: '3241583594',
    owner_name: '预定调和',
    script_name: '校园怪谈',
    started: true,
    locked: true,
    phase_name: '情报交流',
    turn_index: 0,
    current_actor_id: '3241583594',
    current_actor_name: '预定调和',
    member_count: 3,
    public_status: '进行中',
    updated_at: '2026-04-29 12:00:00',
  },
  members: [
    { user_id: '3241583594', user_name: '预定调和', is_owner: true, joined_at: '2026-04-29 11:58:00' },
    { user_id: '3035408421', user_name: '愿快乐', is_owner: false, joined_at: '2026-04-29 11:59:00' },
    { user_id: '3769177630', user_name: 'xzz', is_owner: false, joined_at: '2026-04-29 12:00:00' },
  ],
  public_event: {
    event_type: 'phase_changed',
    title: '进入情报交流',
    content: '广播室突然传来断断续续的录音。',
    created_at: '2026-04-29 12:00:00',
  },
  presentation: {
    opening: '晚自习后的教学楼还没完全熄灯。',
    phase_event: '失物招领箱里出现一把旧教室钥匙。',
    phase_goal: '每人抛出一条线索、猜测或质疑。',
    public_action_hint: '用“我发现/我怀疑/我要追问”开头推进讨论。',
    next_step: '房主确认一轮发言结束后发送下一回合。',
    settlement_tips: ['先对齐谁掌握了最具体的时间线。'],
    phase_index: 2,
    phase_total: 4,
  },
};
const roomToken = await createParticipantToken({ roomId, userId: '3241583594', userName: '预定调和' });

const syncResponse = await fetch(`http://127.0.0.1:8091/internal/rooms/${roomId}/full-sync`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tavern-token': 'test-token',
  },
  body: JSON.stringify(payload),
});
assert.equal(syncResponse.status, 200);

const roomResponse = await fetch(`http://127.0.0.1:8091/api/rooms/${roomId}`);
assert.equal(roomResponse.status, 200);
const room = await roomResponse.json();
assert.equal(room.script_name, '校园怪谈');
assert.equal(room.phase_name, '情报交流');

const membersResponse = await fetch(`http://127.0.0.1:8091/api/rooms/${roomId}/members`);
const members = await membersResponse.json();
assert.equal(members.length, 3);
assert.equal(members[0].is_owner, true);

const timelineResponse = await fetch(`http://127.0.0.1:8091/api/rooms/${roomId}/timeline`);
const timeline = await timelineResponse.json();
assert.equal(timeline.length, 1);
assert.equal(timeline[0].title, '进入情报交流');

const roomViewResponse = await fetch(`http://127.0.0.1:8091/api/rooms/${roomId}/room-view`, {
  headers: { authorization: `Bearer ${roomToken}` },
});
assert.equal(roomViewResponse.status, 200);
const roomView = await roomViewResponse.json();
assert.equal(roomView.room.current_actor_name, '预定调和');
assert.equal(roomView.members.length, 3);
assert.equal(roomView.presentation.phase_index, 2);
assert.equal(roomView.presentation.phase_total, 4);
assert.equal(roomView.public_timeline.length, 1);
assert.equal(roomView.public_timeline[0].title, '进入情报交流');
assert.equal(roomView.participant_chat.length, 0);

const spectatorResponse = await fetch(`http://127.0.0.1:8091/api/rooms/${roomId}/spectator`);
const spectator = await spectatorResponse.json();
assert.equal(spectator.room.current_actor_name, '预定调和');
assert.equal(spectator.presentation.phase_index, 2);
assert.equal(spectator.presentation.phase_total, 4);
assert.equal(spectator.presentation.phase_goal, '每人抛出一条线索、猜测或质疑。');
assert.equal(spectator.presentation.public_action_hint, '用“我发现/我怀疑/我要追问”开头推进讨论。');
assert.equal(Array.isArray(spectator.public_timeline), true);
assert.equal(spectator.public_timeline.length, 1);
assert.equal(spectator.public_timeline[0].title, '进入情报交流');
assert.equal('members' in spectator, false);
assert.equal('participant_chat' in spectator, false);

const spectatorBlob = JSON.stringify(spectator);
for (const privateMarker of ['role_map', '你的身份是', '我的身份', 'role_actions', 'role_briefs']) {
  assert.equal(spectatorBlob.includes(privateMarker), false, privateMarker);
}

const roomPageResponse = await fetch(`http://127.0.0.1:8091/room/${roomId}`);
const roomPageHtml = await roomPageResponse.text();
assert.equal(roomPageResponse.status, 200);
for (const marker of ['room-closed-banner', 'room-progress', 'room-scene', 'room-action', '当前场景', '公共行动']) {
  assert.equal(roomPageHtml.includes(marker), true, marker);
}

const spectatorPageResponse = await fetch(`http://127.0.0.1:8091/spectator/${roomId}`);
const spectatorPageHtml = await spectatorPageResponse.text();
assert.equal(spectatorPageResponse.status, 200);
for (const marker of ['spectator-closed-banner', 'spectator-progress', 'spectator-scene', 'spectator-action', 'spectator-chat-feed', '只读公开实况', '当前场景', '公共行动']) {
  assert.equal(spectatorPageHtml.includes(marker), true, marker);
}
assert.equal(spectatorPageHtml.includes('spectator-chat-form'), false);

const roomScriptResponse = await fetch('http://127.0.0.1:8091/room.js');
const roomScript = await roomScriptResponse.text();
assert.equal(roomScript.includes('/room-view'), true);
assert.equal(roomScript.includes('/spectator'), false);
assert.equal(roomScript.includes('/members'), false);
assert.equal(roomScript.includes("channel: 'room'"), true);

const spectatorScriptResponse = await fetch('http://127.0.0.1:8091/spectator.js');
const spectatorScript = await spectatorScriptResponse.text();
assert.equal(spectatorScript.includes("channel: 'spectator'"), true);

const closeResponse = await fetch(`http://127.0.0.1:8091/internal/rooms/${roomId}/close`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tavern-token': 'test-token',
  },
  body: JSON.stringify({ closed_at: '2026-04-29 12:30:00' }),
});
assert.equal(closeResponse.status, 200);

const closedRoomResponse = await fetch(`http://127.0.0.1:8091/api/rooms/${roomId}`);
const closedRoom = await closedRoomResponse.json();
assert.equal(closedRoom.is_closed, 1);

server.close();
console.log('tavern-web phase-one verification passed');
