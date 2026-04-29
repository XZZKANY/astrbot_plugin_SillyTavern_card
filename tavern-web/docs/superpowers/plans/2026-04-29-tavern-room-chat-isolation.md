# Tavern Room Chat Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先收尾 E1 远端发布，再把 tavern-web 改成“参与者聊天仅 `room` 可见、`spectator` 不可见”的双轨消息系统，并把两页重构成沉浸式主持人聊天界面。

**Architecture:** 保留 `room_timeline` 作为公开播报流，新增 `room_chat_messages` 作为参与者聊天流；HTTP 接口拆成 `room-view` 与 `spectator` 两套聚合返回；WebSocket 订阅增加 `room` / `spectator` 频道；`room` 页合并渲染主持人播报与参与者聊天，`spectator` 页只渲染公开播报。

**Tech Stack:** Node.js 20+, Express 4, better-sqlite3, ws, Playwright, 原生 HTML/CSS/JS, systemd (`tavern-web.service`), 远端路径 `/opt/tavern-web`

---

## Repository / Runtime Notes

- 当前本地目录 `C:\Users\kanye\tavern-web` 不是 git 仓库；下面所有“提交”步骤统一替换为“写入本地备份目录 `C:\Users\kanye\.codex\backups\...`”。
- 远端已确认信息：
  - 服务：`tavern-web.service`
  - 远端项目根：`/opt/tavern-web`
  - 监听地址：`http://127.0.0.1:8088`
- 本计划不触碰 AstrBot 插件代码，只处理 `tavern-web`。

## File Structure Map

**Create**
- `C:\Users\kanye\tavern-web\verify_e1_chat_remote.mjs` — E1 远端烟雾验证脚本

**Modify**
- `C:\Users\kanye\tavern-web\package.json` — 增加远端验证脚本入口
- `C:\Users\kanye\tavern-web\src\db\migrations.js` — 新增参与者聊天表与索引
- `C:\Users\kanye\tavern-web\src\store\roomStore.js` — 拆分公开时间线与参与者聊天读写
- `C:\Users\kanye\tavern-web\src\routes\public.js` — 新增 `room-view`，调整 `spectator` 与 `POST /chat`
- `C:\Users\kanye\tavern-web\src\routes\internal.js` — 公开更新广播到双频道
- `C:\Users\kanye\tavern-web\src\ws\broker.js` — 增加 `room` / `spectator` 频道订阅
- `C:\Users\kanye\tavern-web\web\room.html` — 参与者主界面结构
- `C:\Users\kanye\tavern-web\web\room.js` — `room-view` 拉取、房内聊天流、昵称记忆、消息去重
- `C:\Users\kanye\tavern-web\web\spectator.html` — 只读实况结构
- `C:\Users\kanye\tavern-web\web\spectator.js` — `spectator` 拉取、只读公开播报
- `C:\Users\kanye\tavern-web\web\styles.css` — 沉浸式聊天布局与状态样式
- `C:\Users\kanye\tavern-web\verify_phase1.mjs` — 接口返回结构更新
- `C:\Users\kanye\tavern-web\verify_ws_e2e.mjs` — 双频道 WS 校验
- `C:\Users\kanye\tavern-web\verify_chat_e2e.mjs` — 聊天只进 `room-view`、不进 `spectator`
- `C:\Users\kanye\tavern-web\verify_ui_e2e.mjs` — `room` / `spectator` 新 UI 与隔离校验

### Task 1: Close E1 Remote Rollout

**Files:**
- Create: `C:\Users\kanye\tavern-web\verify_e1_chat_remote.mjs`
- Modify: `C:\Users\kanye\tavern-web\package.json`
- Reference: `C:\Users\kanye\tavern-web\web\room.html`, `C:\Users\kanye\tavern-web\web\spectator.html`, `C:\Users\kanye\tavern-web\src\routes\public.js`

- [ ] **Step 1: Write the failing remote smoke script**

```js
import { WebSocket } from 'ws';

const base = process.env.TAVERN_WEB_BASE || 'http://127.0.0.1:8088';
const roomId = process.env.TAVERN_WEB_ROOM_ID || '1083966574';
const content = `E1 smoke ${Date.now()}`;

async function text(path) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path}:${res.status}`);
  return res.text();
}

async function json(path, init) {
  const res = await fetch(base + path, init);
  if (!res.ok) throw new Error(`${path}:${res.status}`);
  return res.json();
}

const roomHtml = await text(`/room/${roomId}`);
const spectatorHtml = await text(`/spectator/${roomId}`);
for (const [name, html, markers] of [
  ['room', roomHtml, ['room-chat-form', 'room-chat-name', 'room-chat-content', 'web-chat-card']],
  ['spectator', spectatorHtml, ['spectator-chat-form', 'spectator-chat-name', 'spectator-chat-content', 'web-chat-card']],
]) {
  for (const marker of markers) if (!html.includes(marker)) throw new Error(`${name} missing ${marker}`);
}

const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
const messages = [];
await new Promise((resolve) => ws.once('open', resolve));
ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId }));
await new Promise((resolve) => setTimeout(resolve, 120));

await json(`/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_name: '远端验证', content }),
});
await new Promise((resolve) => setTimeout(resolve, 160));
if (!messages.some((message) => message.type === 'chat_message' && message.payload?.public_event?.content === content)) {
  throw new Error('missing chat_message broadcast');
}
const spectator = await json(`/api/rooms/${roomId}/spectator`);
if (spectator.timeline[0]?.content !== content) throw new Error('timeline did not persist chat');
console.log('tavern-web remote E1 chat verification passed');
```

- [ ] **Step 2: Add the package script and verify it fails before redeploy if remote is stale**

```json
{
  "scripts": {
    "verify:e1-remote": "node verify_e1_chat_remote.mjs"
  }
}
```

Run:

```powershell
scp C:\Users\kanye\tavern-web\verify_e1_chat_remote.mjs root@154.36.178.12:/opt/tavern-web/verify_e1_chat_remote.mjs
ssh root@154.36.178.12 'cd /opt/tavern-web; node verify_e1_chat_remote.mjs'
```

Expected: 当前远端若还没完全同步 E1，应出现 `missing ...` 或 `timeline did not persist chat`。

- [ ] **Step 3: Deploy the current local E1 build to the remote service**

```powershell
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$tar = "C:\Users\kanye\tavern-web-e1-chat-$ts.tar"
tar -C 'C:\Users\kanye\tavern-web' --exclude='./node_modules' --exclude='./data' -cf $tar .
scp $tar root@154.36.178.12:/tmp/tavern-web-e1-chat.tar
$deploy = 'C:\Users\kanye\deploy_e1_chat.sh'
$script = @"
set -e
ts=$ts
backup=/opt/backups/tavern-web-e1-chat-`$ts
mkdir -p "`$backup"
tar -C /opt/tavern-web --exclude='./node_modules' --exclude='./data' -czf "`$backup/tavern-web.before.tgz" .
tar -C /opt/tavern-web -xf /tmp/tavern-web-e1-chat.tar
cd /opt/tavern-web
npm install --omit=dev
systemctl restart tavern-web.service
echo BACKUP=`$backup
"@
Set-Content -LiteralPath $deploy -Value $script -Encoding ascii
scp $deploy root@154.36.178.12:/tmp/deploy_e1_chat.sh
ssh root@154.36.178.12 'bash /tmp/deploy_e1_chat.sh'
```

- [ ] **Step 4: Re-run the remote smoke script until it passes**

Run:

```powershell
ssh root@154.36.178.12 'cd /opt/tavern-web; node verify_e1_chat_remote.mjs'
```

Expected: PASS with `tavern-web remote E1 chat verification passed`.

- [ ] **Step 5: Snapshot the release evidence locally**

```powershell
$backup = "C:\Users\kanye\.codex\backups\tavern-web-e1-remote-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item C:\Users\kanye\tavern-web\verify_e1_chat_remote.mjs $backup
Copy-Item C:\Users\kanye\tavern-web\package.json $backup
```

### Task 2: Split Participant Chat from Public Timeline

**Files:**
- Modify: `C:\Users\kanye\tavern-web\src\db\migrations.js`
- Modify: `C:\Users\kanye\tavern-web\src\store\roomStore.js`
- Modify: `C:\Users\kanye\tavern-web\src\routes\public.js`
- Modify: `C:\Users\kanye\tavern-web\verify_chat_e2e.mjs`
- Modify: `C:\Users\kanye\tavern-web\verify_phase1.mjs`

- [ ] **Step 1: Rewrite the chat verification to demand the new API shape**

```js
const roomView = await (await fetch(`${base}/api/rooms/${roomId}/room-view`)).json();
assert.equal(Array.isArray(roomView.participant_chat), true);
assert.equal(roomView.participant_chat[0].content, '我怀疑：旧实验楼门口的人<script>window.__xss=1</script>');
assert.equal(roomView.public_timeline.some((item) => item.event_type === 'public_chat'), false);

const spectator = await (await fetch(`${base}/api/rooms/${roomId}/spectator`)).json();
assert.equal(Array.isArray(spectator.public_timeline), true);
assert.equal('participant_chat' in spectator, false);
assert.equal(spectator.public_timeline.some((item) => item.event_type === 'public_chat'), false);
```

- [ ] **Step 2: Run the rewritten verification and confirm it fails before implementation**

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_chat_e2e.mjs
```

Expected: FAIL with `404` on `/room-view` or assertions that `public_chat` still出现在 `spectator` 数据中。

- [ ] **Step 3: Add the new table and store helpers with exact names used by the tests**

```js
// src/db/migrations.js
CREATE TABLE IF NOT EXISTS room_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_room_chat_messages_room_created_at
ON room_chat_messages (room_id, created_at DESC, id DESC);
```

```js
// src/store/roomStore.js
const insertChatMessageStmt = db.prepare(`
  INSERT INTO room_chat_messages (room_id, user_name, content, created_at)
  VALUES (@room_id, @user_name, @content, @created_at)
`);
const getChatMessageStmt = db.prepare(`
  SELECT id, room_id, user_name, content, created_at
  FROM room_chat_messages
  WHERE id = ?
`);
const getParticipantChatStmt = db.prepare(`
  SELECT id, room_id, user_name, content, created_at
  FROM room_chat_messages
  WHERE room_id = ?
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT ?
`);

export function getPublicTimeline(roomId, limit = config.timelineLimit) {
  return getTimelineStmt.all(roomId, limit);
}

export function addParticipantChat(roomId, input = {}) {
  const userName = String(input.user_name || '').trim().slice(0, 24);
  const content = String(input.content || '').trim().slice(0, 300);
  const createdAt = String(input.created_at || formatLocalTimestamp());
  const result = insertChatMessageStmt.run({ room_id: roomId, user_name: userName, content, created_at: createdAt });
  return getChatMessageStmt.get(result.lastInsertRowid);
}

export function getParticipantChat(roomId, limit = config.timelineLimit) {
  return getParticipantChatStmt.all(roomId, limit);
}

export function getRoomView(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return {
    room,
    presentation: room.presentation,
    members: getMembers(roomId),
    public_timeline: getPublicTimeline(roomId, config.timelineLimit),
    participant_chat: getParticipantChat(roomId, config.timelineLimit),
  };
}

export function getSpectatorView(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  return {
    room,
    presentation: room.presentation,
    public_timeline: getPublicTimeline(roomId, config.timelineLimit),
  };
}
```

```js
// src/routes/public.js
router.get('/rooms/:roomId/room-view', (req, res) => {
  const payload = getRoomView(String(req.params.roomId || ''));
  if (!payload) return res.status(404).json({ error: 'room_not_found' });
  res.json(payload);
});

router.post('/rooms/:roomId/chat', (req, res) => {
  // ...validate room / close state / body...
  const chatMessage = addParticipantChat(roomId, { user_name: userName, content });
  broker?.broadcast(roomId, 'room', {
    type: 'chat_message',
    room_id: roomId,
    payload: { chat_message: chatMessage },
  });
  res.json({ ok: true, chat_message: chatMessage });
});
```

- [ ] **Step 4: Re-run the interface scripts and make them pass**

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_chat_e2e.mjs
node verify_phase1.mjs
```

Expected: PASS with `tavern-web chat verification passed` and `tavern-web phase-one verification passed`.

- [ ] **Step 5: Snapshot the data/API change set**

```powershell
$backup = "C:\Users\kanye\.codex\backups\tavern-web-task2-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item C:\Users\kanye\tavern-web\src\db\migrations.js,C:\Users\kanye\tavern-web\src\store\roomStore.js,C:\Users\kanye\tavern-web\src\routes\public.js,C:\Users\kanye\tavern-web\verify_chat_e2e.mjs,C:\Users\kanye\tavern-web\verify_phase1.mjs $backup
```

### Task 3: Add Channel-Aware WebSocket Delivery

**Files:**
- Modify: `C:\Users\kanye\tavern-web\src\ws\broker.js`
- Modify: `C:\Users\kanye\tavern-web\src\routes\internal.js`
- Modify: `C:\Users\kanye\tavern-web\verify_ws_e2e.mjs`
- Modify: `C:\Users\kanye\tavern-web\verify_chat_e2e.mjs`

- [ ] **Step 1: Change the WS verification to require separate room/spectator subscriptions**

```js
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
```

```js
assert.equal(roomMessages.some((item) => item.type === 'chat_message'), true);
assert.equal(spectatorMessages.some((item) => item.type === 'chat_message'), false);
assert.equal(roomMessages.some((item) => item.type === 'room_updated'), true);
assert.equal(spectatorMessages.some((item) => item.type === 'room_updated'), true);
```

- [ ] **Step 2: Run the WS verification and confirm it fails before changing the broker**

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_ws_e2e.mjs
```

Expected: FAIL because current broker ignores `channel` and broadcasts chat to every subscriber.

- [ ] **Step 3: Implement channel maps and channel-specific broadcast helpers**

```js
// src/ws/broker.js
export function createBroker() {
  const channelSubscribers = new Map();
  const subscriptions = new Map();

  function key(roomId, channel) {
    return `${roomId}:${channel || 'room'}`;
  }

  function unsubscribeAll(ws) {
    const targets = subscriptions.get(ws) || [];
    for (const target of targets) {
      const peers = channelSubscribers.get(target);
      if (!peers) continue;
      peers.delete(ws);
      if (peers.size === 0) channelSubscribers.delete(target);
    }
    subscriptions.delete(ws);
  }

  function subscribe(ws, roomId, channel = 'room') {
    unsubscribeAll(ws);
    const target = key(roomId, channel);
    if (!channelSubscribers.has(target)) channelSubscribers.set(target, new Set());
    channelSubscribers.get(target).add(ws);
    subscriptions.set(ws, [target]);
  }

  function broadcast(roomId, channel, message) {
    const peers = channelSubscribers.get(key(roomId, channel));
    if (!peers) return;
    const payload = JSON.stringify(message);
    for (const ws of peers) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }

  function broadcastPublic(roomId, message) {
    broadcast(roomId, 'room', message);
    broadcast(roomId, 'spectator', message);
  }

  return { attach, broadcast, broadcastPublic };
}
```

```js
// src/routes/internal.js
broker.broadcastPublic(roomId, {
  type: 'room_updated',
  room_id: roomId,
  payload: {
    room: payload.room,
    members: payload.members || [],
    public_event: payload.public_event || null,
    presentation: payload.presentation || {},
  },
});

broker.broadcastPublic(roomId, {
  type: 'room_closed',
  room_id: roomId,
  payload: { closed_at: String(req.body?.closed_at || new Date().toISOString()) },
});
```

- [ ] **Step 4: Re-run the WS and chat verifications until both pass**

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_ws_e2e.mjs
node verify_chat_e2e.mjs
```

Expected: PASS with spectator never receiving `chat_message`.

- [ ] **Step 5: Snapshot the WS change set**

```powershell
$backup = "C:\Users\kanye\.codex\backups\tavern-web-task3-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item C:\Users\kanye\tavern-web\src\ws\broker.js,C:\Users\kanye\tavern-web\src\routes\internal.js,C:\Users\kanye\tavern-web\verify_ws_e2e.mjs,C:\Users\kanye\tavern-web\verify_chat_e2e.mjs $backup
```

### Task 4: Refactor the Room Page into the Participant Chat Interface

**Files:**
- Modify: `C:\Users\kanye\tavern-web\web\room.html`
- Modify: `C:\Users\kanye\tavern-web\web\room.js`
- Modify: `C:\Users\kanye\tavern-web\web\styles.css`
- Modify: `C:\Users\kanye\tavern-web\verify_ui_e2e.mjs`

- [ ] **Step 1: Rewrite the UI test to demand the new room-only participant experience**

```js
await roomPage.goto(`http://127.0.0.1:8093/room/${roomId}`);
await roomPage.getByText('发送到本局聊天').waitFor();
await roomPage.locator('#room-chat-feed').waitFor();
await roomPage.getByText('这里是本局参与者聊天，不会显示到旁观页。').waitFor();
await roomPage.getByPlaceholder('网页昵称').fill('网页玩家');
await roomPage.getByPlaceholder(/输入本局聊天/).fill('我怀疑：旧实验楼门口的人');
await roomPage.getByRole('button', { name: '发送到本局聊天' }).click();
await roomPage.getByText('我怀疑：旧实验楼门口的人').waitFor();
```

- [ ] **Step 2: Run the UI verification and confirm it fails before the room page refactor**

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_ui_e2e.mjs
```

Expected: FAIL because `room` page still uses the old card stack and old button text `发送到网页`.

- [ ] **Step 3: Replace room page data loading and merged feed rendering**

```html
<!-- web/room.html -->
<section class="room-chat-shell">
  <header class="room-status-bar">
    <h1 id="room-title">加载中...</h1>
    <p id="room-subtitle" class="muted">正在读取房间状态</p>
  </header>
  <section id="room-chat-feed" class="chat-feed"></section>
  <aside class="room-side-panels">
    <section class="card compact-card" id="room-command-panel"></section>
    <section class="card compact-card" id="room-template-panel"></section>
  </aside>
  <section class="room-composer card">
    <p class="muted">这里是本局参与者聊天，不会显示到旁观页。</p>
    <form id="room-chat-form" class="chat-form">
      <input id="room-chat-name" maxlength="24" placeholder="网页昵称" autocomplete="nickname" />
      <textarea id="room-chat-content" maxlength="300" placeholder="输入本局聊天，例如：我怀疑：____"></textarea>
      <button type="submit">发送到本局聊天</button>
    </form>
  </section>
</section>
```

```js
// web/room.js
async function loadRoomView(roomId) {
  return fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/room-view`);
}

function mergeFeed(publicTimeline = [], participantChat = []) {
  const publicItems = publicTimeline.map((item) => ({ ...item, feed_kind: 'public', feed_id: `public:${item.id}` }));
  const chatItems = participantChat.map((item) => ({ ...item, title: item.user_name, event_type: 'participant_chat', feed_kind: 'participant', feed_id: `chat:${item.id}` }));
  return [...publicItems, ...chatItems]
    .sort((a, b) => `${b.created_at}:${b.feed_id}`.localeCompare(`${a.created_at}:${a.feed_id}`));
}

function rememberNickname(value) {
  localStorage.setItem('tavern-room-chat-name', value);
}

function restoreNickname() {
  document.getElementById('room-chat-name').value = localStorage.getItem('tavern-room-chat-name') || '';
}
```

- [ ] **Step 4: Make room-side realtime updates idempotent and pass the UI test**

```js
function seenKeysFromFeed(feed = []) {
  return new Set(feed.map((item) => item.feed_id));
}

function prependParticipantChat(chatMessage) {
  if (!chatMessage?.id) return;
  currentState.participant_chat = [chatMessage, ...(currentState.participant_chat || [])]
    .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    .slice(0, 50);
}

async function submitParticipantChat(roomId) {
  const userName = nameInput.value.trim();
  const content = contentInput.value.trim();
  rememberNickname(userName);
  const payload = await fetchJson(`/api/rooms/${encodeURIComponent(roomId)}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_name: userName, content }),
  });
  prependParticipantChat(payload.chat_message);
  renderState();
}

ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'room' }));
```

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_ui_e2e.mjs
```

Expected: room page assertions PASS; spectator assertions may still fail until Task 5.

- [ ] **Step 5: Snapshot the room UI change set**

```powershell
$backup = "C:\Users\kanye\.codex\backups\tavern-web-task4-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item C:\Users\kanye\tavern-web\web\room.html,C:\Users\kanye\tavern-web\web\room.js,C:\Users\kanye\tavern-web\web\styles.css,C:\Users\kanye\tavern-web\verify_ui_e2e.mjs $backup
```

### Task 5: Refactor the Spectator Page into a Read-Only Public Timeline

**Files:**
- Modify: `C:\Users\kanye\tavern-web\web\spectator.html`
- Modify: `C:\Users\kanye\tavern-web\web\spectator.js`
- Modify: `C:\Users\kanye\tavern-web\web\styles.css`
- Modify: `C:\Users\kanye\tavern-web\verify_phase1.mjs`
- Modify: `C:\Users\kanye\tavern-web\verify_ui_e2e.mjs`

- [ ] **Step 1: Rewrite the spectator assertions to forbid participant chat controls**

```js
await spectatorPage.goto(`http://127.0.0.1:8093/spectator/${roomId}`);
await spectatorPage.locator('#spectator-chat-feed').waitFor();
await spectatorPage.getByText('只读公开实况').waitFor();
assert.equal(await spectatorPage.locator('#spectator-chat-form').count(), 0);
assert.equal(await spectatorPage.getByText('我怀疑：旧实验楼门口的人').count(), 0);
```

```js
const spectator = await (await fetch(`${base}/api/rooms/${roomId}/spectator`)).json();
assert.equal(Array.isArray(spectator.public_timeline), true);
assert.equal('members' in spectator, false);
assert.equal('participant_chat' in spectator, false);
```

- [ ] **Step 2: Run `verify_phase1.mjs` and `verify_ui_e2e.mjs` and confirm both fail before the spectator refactor**

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_phase1.mjs
node verify_ui_e2e.mjs
```

Expected: FAIL because `spectator` still returns `members` / old `timeline` and still renders the chat composer.

- [ ] **Step 3: Replace spectator data loading and remove all participant chat UI**

```html
<!-- web/spectator.html -->
<section class="spectator-shell">
  <header class="page-header compact">
    <div class="hero">
      <p class="eyebrow">只读公开实况</p>
      <h1 id="spectator-title">加载中...</h1>
      <p id="spectator-subtitle" class="muted">正在同步主持人播报</p>
    </div>
  </header>
  <section id="spectator-chat-feed" class="chat-feed spectator-feed"></section>
  <section class="card compact-card">
    <h2>公开操作提示</h2>
    <div id="spectator-command-panel" class="command-panel"></div>
  </section>
</section>
```

```js
// web/spectator.js
function renderState() {
  const { room, public_timeline, presentation } = currentState;
  document.getElementById('spectator-title').textContent = room.script_name ? `${room.script_name} · 实况旁观` : `房间 ${room.room_id} · 实况旁观`;
  renderSpectatorFeed(document.getElementById('spectator-chat-feed'), public_timeline, presentation);
}

function renderSpectatorFeed(element, timeline, presentation) {
  const items = timeline.map((item) => ({ ...item, feed_kind: 'public' }));
  element.innerHTML = items.map((item) => `
    <article class="chat-card host-card">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.content)}</p>
      <time>${escapeHtml(item.created_at)}</time>
    </article>
  `).join('');
}

ws.send(JSON.stringify({ type: 'subscribe', room_id: roomId, channel: 'spectator' }));
```

- [ ] **Step 4: Add the final shared chat styling and make the page tests pass**

```css
.chat-feed {
  display: grid;
  gap: 14px;
}

.chat-card {
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.75);
}

.host-card {
  border-color: rgba(245, 158, 11, 0.36);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.82));
}

.participant-card {
  border-color: rgba(56, 189, 248, 0.28);
  background: linear-gradient(135deg, rgba(8, 145, 178, 0.12), rgba(15, 23, 42, 0.78));
}
```

Run:

```powershell
cd C:\Users\kanye\tavern-web
node verify_phase1.mjs
node verify_ui_e2e.mjs
```

Expected: PASS with spectator lacking any participant chat form or participant-only message.

- [ ] **Step 5: Snapshot the spectator/UI change set**

```powershell
$backup = "C:\Users\kanye\.codex\backups\tavern-web-task5-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item C:\Users\kanye\tavern-web\web\spectator.html,C:\Users\kanye\tavern-web\web\spectator.js,C:\Users\kanye\tavern-web\web\styles.css,C:\Users\kanye\tavern-web\verify_phase1.mjs,C:\Users\kanye\tavern-web\verify_ui_e2e.mjs $backup
```

### Task 6: Run the Full Local Suite and Deploy the Final Isolated Build

**Files:**
- Reference: `C:\Users\kanye\tavern-web\verify_phase1.mjs`
- Reference: `C:\Users\kanye\tavern-web\verify_ws_e2e.mjs`
- Reference: `C:\Users\kanye\tavern-web\verify_chat_e2e.mjs`
- Reference: `C:\Users\kanye\tavern-web\verify_ui_e2e.mjs`
- Reference: `C:\Users\kanye\tavern-web\verify_e1_chat_remote.mjs`

- [ ] **Step 1: Run the full local suite from a clean shell**

Run:

```powershell
cd C:\Users\kanye\tavern-web
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
```

Expected:

```text
tavern-web phase-one verification passed
tavern-web ws verification passed
tavern-web chat verification passed
tavern-web ui verification passed
```

- [ ] **Step 2: Package the final build and deploy it to `/opt/tavern-web` with a dated backup**

```powershell
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$tar = "C:\Users\kanye\tavern-web-room-chat-isolation-$ts.tar"
tar -C 'C:\Users\kanye\tavern-web' --exclude='./node_modules' --exclude='./data' -cf $tar .
scp $tar root@154.36.178.12:/tmp/tavern-web-room-chat-isolation.tar
$deploy = 'C:\Users\kanye\deploy_room_chat_isolation.sh'
$script = @"
set -e
ts=$ts
backup=/opt/backups/tavern-web-room-chat-isolation-`$ts
mkdir -p "`$backup"
tar -C /opt/tavern-web --exclude='./node_modules' --exclude='./data' -czf "`$backup/tavern-web.before.tgz" .
tar -C /opt/tavern-web -xf /tmp/tavern-web-room-chat-isolation.tar
cd /opt/tavern-web
npm install --omit=dev
systemctl restart tavern-web.service
echo BACKUP=`$backup
"@
Set-Content -LiteralPath $deploy -Value $script -Encoding ascii
scp $deploy root@154.36.178.12:/tmp/deploy_room_chat_isolation.sh
ssh root@154.36.178.12 'bash /tmp/deploy_room_chat_isolation.sh'
```

- [ ] **Step 3: Re-run remote smoke checks against the final isolated behavior**

```powershell
$remoteVerify = @'
set -e
cd /opt/tavern-web
node verify_phase1.mjs
node verify_ws_e2e.mjs
node verify_chat_e2e.mjs
node verify_ui_e2e.mjs
node --input-type=module <<'"'"'JS'"'"'
const base = 'http://127.0.0.1:8088';
const roomId = '1083966574';
const roomHtml = await (await fetch(`${base}/room/${roomId}`)).text();
const spectatorHtml = await (await fetch(`${base}/spectator/${roomId}`)).text();
if (!roomHtml.includes('发送到本局聊天')) throw new Error('room page missing participant composer');
if (spectatorHtml.includes('spectator-chat-form')) throw new Error('spectator still exposes chat form');
const spectator = await (await fetch(`${base}/api/rooms/${roomId}/spectator`)).json();
if ('participant_chat' in spectator) throw new Error('spectator leaked participant_chat');
console.log('remote isolation smoke passed');
JS
'@
$scriptPath = 'C:\Users\kanye\run_remote_room_chat_verify.sh'
Set-Content -LiteralPath $scriptPath -Value $remoteVerify -Encoding ascii
scp $scriptPath root@154.36.178.12:/tmp/run_remote_room_chat_verify.sh
ssh root@154.36.178.12 'bash /tmp/run_remote_room_chat_verify.sh'
```

Expected: PASS with `remote isolation smoke passed`.

- [ ] **Step 4: Capture the final evidence bundle locally**

```powershell
$backup = "C:\Users\kanye\.codex\backups\tavern-web-task6-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item C:\Users\kanye\tavern-web\verify_e1_chat_remote.mjs,C:\Users\kanye\tavern-web\verify_phase1.mjs,C:\Users\kanye\tavern-web\verify_ws_e2e.mjs,C:\Users\kanye\tavern-web\verify_chat_e2e.mjs,C:\Users\kanye\tavern-web\verify_ui_e2e.mjs $backup
```

## Self-Review Checklist

- Spec coverage: Task 1 covers E1 收尾；Task 2/3 covers 分表、双接口、双频道；Task 4/5 covers `room` / `spectator` 沉浸式界面；Task 6 covers本地与远端验证。
- Placeholder scan: 删除任何 `TODO`、`TBD`、`之后补`、`类似上面` 之类字样后再执行。
- Type consistency: 统一使用 `public_timeline`、`participant_chat`、`chat_message`、`channel`、`broadcastPublic` 这些名字，不要混回旧的 `timeline` / `public_event` 返回结构。

## Execution Handoff

Plan complete and saved to `C:\Users\kanye\tavern-web\docs\superpowers\plans\2026-04-29-tavern-room-chat-isolation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
