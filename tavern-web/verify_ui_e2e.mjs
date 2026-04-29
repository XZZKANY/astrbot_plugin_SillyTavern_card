import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(rootDir, 'data', 'test-tavern-ui.db');
process.env.TAVERN_WEB_PORT = '8093';
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
await new Promise((resolve) => server.listen(8093, '127.0.0.1', resolve));

const roomId = 'ui-room';

async function fullSync(overrides = {}) {
  const payload = {
    room: {
      room_id: roomId,
      group_id: roomId,
      owner_id: '1',
      owner_name: '房主',
      script_name: '校园怪谈',
      started: true,
      locked: true,
      phase_name: overrides.phaseName || '情报交流',
      turn_index: 0,
      current_actor_id: '1',
      current_actor_name: overrides.actorName || '房主',
      member_count: 2,
      public_status: '进行中',
      updated_at: overrides.updatedAt || '2026-04-29 14:00:00',
    },
    members: [
      { user_id: '1', user_name: '房主', is_owner: true, joined_at: '2026-04-29 13:58:00' },
      { user_id: '2', user_name: '玩家二', is_owner: false, joined_at: '2026-04-29 13:59:00' },
    ],
    public_event: {
      event_type: 'phase_changed',
      title: overrides.eventTitle || '进入情报交流',
      content: overrides.eventContent || '失物招领箱里出现一把旧教室钥匙。',
      created_at: overrides.updatedAt || '2026-04-29 14:00:00',
    },
    presentation: {
      opening: '晚自习后的教学楼还没完全熄灯。',
      phase_event: overrides.phaseEvent || '失物招领箱里出现一把旧教室钥匙。',
      phase_goal: overrides.phaseGoal || '每人抛出一条线索、猜测或质疑。',
      public_action_hint: overrides.actionHint || '用“我发现/我怀疑/我要追问”开头推进讨论。',
      next_step: overrides.nextStep || '房主确认一轮发言结束后发送下一回合。',
      settlement_tips: [],
      phase_index: overrides.phaseIndex || 2,
      phase_total: 4,
    },
  };
  const response = await fetch(`http://127.0.0.1:8093/internal/rooms/${roomId}/full-sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tavern-token': 'test-token',
    },
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200);
}

await fullSync();

const browser = await chromium.launch();
const roomPage = await browser.newPage();
const otherRoomPage = await browser.newPage();
const spectatorPage = await browser.newPage();
let roomViewFetches = 0;
let otherRoomViewFetches = 0;
let spectatorFetches = 0;
roomPage.on('request', (request) => {
  if (request.url().includes(`/api/rooms/${roomId}/room-view`)) roomViewFetches += 1;
});
otherRoomPage.on('request', (request) => {
  if (request.url().includes(`/api/rooms/${roomId}/room-view`)) otherRoomViewFetches += 1;
});
spectatorPage.on('request', (request) => {
  if (request.url().includes(`/api/rooms/${roomId}/spectator`)) spectatorFetches += 1;
});

await roomPage.goto(`http://127.0.0.1:8093/room/${roomId}`);
await otherRoomPage.goto(`http://127.0.0.1:8093/room/${roomId}`);
await spectatorPage.goto(`http://127.0.0.1:8093/spectator/${roomId}`);
await roomPage.getByRole('button', { name: '发送到本局聊天' }).waitFor();
await otherRoomPage.getByRole('button', { name: '发送到本局聊天' }).waitFor();
await roomPage.locator('#room-chat-feed').waitFor();
await otherRoomPage.locator('#room-chat-feed').waitFor();
await roomPage.getByText('这里是本局参与者聊天，不会显示到旁观页。').waitFor();
await spectatorPage.locator('#spectator-chat-feed').waitFor();
await spectatorPage.getByText('只读公开实况').waitFor();
await spectatorPage.getByText('失物招领箱里出现一把旧教室钥匙。').first().waitFor();
await spectatorPage.getByText('公开操作提示').waitFor();
assert.equal(await spectatorPage.locator('#spectator-chat-form').count(), 0);
await roomPage.getByText('@小预 下一回合').first().waitFor();
await spectatorPage.getByText('复制回群发送').first().waitFor();
await roomPage.locator('[data-copy-text="@小预 下一回合"]').first().click();
await roomPage.getByText('已复制').first().waitFor();
await new Promise((resolve) => setTimeout(resolve, 300));
await roomPage.getByPlaceholder('网页昵称').fill('网页玩家');
await roomPage.getByPlaceholder(/输入本局聊天/).fill('我怀疑：旧实验楼门口的人');
await roomPage.getByRole('button', { name: '发送到本局聊天' }).click();
await roomPage.getByText('已发送到本局聊天。').waitFor();
await roomPage.getByText('我怀疑：旧实验楼门口的人').waitFor();
await otherRoomPage.getByText('我怀疑：旧实验楼门口的人').waitFor();
const ownMessage = roomPage.locator('.participant-message', { hasText: '我怀疑：旧实验楼门口的人' }).first();
const otherMessage = otherRoomPage.locator('.participant-message', { hasText: '我怀疑：旧实验楼门口的人' }).first();
await ownMessage.waitFor();
await otherMessage.waitFor();
assert.match(await ownMessage.getAttribute('class'), /(^|\s)mine-message(\s|$)/);
assert.match(await otherMessage.getAttribute('class'), /(^|\s)other-message(\s|$)/);
await roomPage.locator('.message-author', { hasText: '网页玩家' }).first().waitFor();
await otherRoomPage.locator('.message-author', { hasText: '网页玩家' }).first().waitFor();
await new Promise((resolve) => setTimeout(resolve, 250));
assert.equal(await spectatorPage.getByText('我怀疑：旧实验楼门口的人').count(), 0);

roomViewFetches = 0;
otherRoomViewFetches = 0;
spectatorFetches = 0;
await new Promise((resolve) => setTimeout(resolve, 250));
await fullSync({
  phaseName: '行动阶段',
  actorName: '玩家二',
  eventTitle: '进入行动阶段',
  eventContent: '广播室突然传来断断续续的录音。',
  phaseEvent: '广播室突然传来断断续续的录音。',
  phaseGoal: '做出本轮行动选择，明确调查对象。',
  actionHint: '说清楚你要查谁、查哪里或保护谁。',
  nextStep: '行动完成后由房主推进到结算阶段。',
  phaseIndex: 3,
  updatedAt: '2026-04-29 14:05:00',
});

await roomPage.getByText('做出本轮行动选择，明确调查对象。').waitFor();
await otherRoomPage.getByText('做出本轮行动选择，明确调查对象。').waitFor();
await spectatorPage.getByText('说清楚你要查谁、查哪里或保护谁。').waitFor();
await roomPage.getByText('我要调查：____').waitFor();
assert.equal(roomViewFetches, 0, 'room 页 WS 更新不应触发聚合接口重拉');
assert.equal(otherRoomViewFetches, 0, '另一个 room 页 WS 更新不应触发聚合接口重拉');
assert.equal(spectatorFetches, 0, 'spectator 页 WS 更新不应触发聚合接口重拉');

const closeResponse = await fetch(`http://127.0.0.1:8093/internal/rooms/${roomId}/close`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tavern-token': 'test-token',
  },
  body: JSON.stringify({ closed_at: '2026-04-29 14:30:00' }),
});
assert.equal(closeResponse.status, 200);
await roomPage.locator('#room-closed-banner').waitFor({ state: 'visible' });
await otherRoomPage.locator('#room-closed-banner').waitFor({ state: 'visible' });
await spectatorPage.locator('#spectator-closed-banner').waitFor({ state: 'visible' });

const combinedText = `${await roomPage.textContent('body')}\n${await spectatorPage.textContent('body')}`;
for (const privateMarker of ['role_map', '你的身份是', '身份提示', 'role_actions', 'role_briefs']) {
  assert.equal(combinedText.includes(privateMarker), false, privateMarker);
}

await browser.close();
server.close();
console.log('tavern-web ui verification passed');
