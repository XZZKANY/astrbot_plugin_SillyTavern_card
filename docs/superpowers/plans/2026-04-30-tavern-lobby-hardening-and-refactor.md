# Tavern Lobby 重构与产品化实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 CTO 评审意见，把当前“能跑的酒馆 Demo”升级为定位清晰、可发布、可维护、具备基础权限边界的 `astrbot_plugin_tavern_lobby` 项目。

**Architecture:** 先停止命名与发布结构混乱，再补 Web 参与者 / 旁观者 token 权限边界；随后把 AstrBot 单文件主逻辑拆成 adapter、domain、application、infrastructure、content 五层；最后再替换同步、WebSocket、schema、迁移等低质量轮子。每个阶段都必须保持现有端到端验证通过。

**Tech Stack:** Python 3 + AstrBot、Node.js 20、Express、better-sqlite3、ws、Playwright；后续计划引入 PyYAML、aiohttp 或 httpx、Zod、jose、Socket.IO、Drizzle。

---

## 0. 当前事实基线

### 0.1 当前项目定位

当前项目不再按 `SillyTavern_card` 定位，而是按以下名称和语义继续：

```text
astrbot_plugin_tavern_lobby
```

当前实际能力是：

- AstrBot 群聊开房
- 剧本选择
- 玩家加入 / 退出
- 身份私发
- 回合推进
- Web 房间页 / 旁观页同步
- 网页参与者聊天

当前不是：

- SillyTavern PNG 角色卡解析插件
- Lorebook YAML 转换器
- 角色卡管理器

### 0.2 当前主要硬伤

1. GitHub 仓库历史名称与实际功能错位。
2. `astrbot_plugin/main.py` 仍是 1400 行级别单文件泥球。
3. `tavern-web` 的 `room-view`、`chat`、WebSocket subscribe 缺真实权限模型。
4. 剧本内容硬编码在 Python 常量 `SCRIPT_LIBRARY` 中。
5. Bot 到 Web 同步使用阻塞式 `urllib.request.urlopen()`。
6. WebSocket broker 是裸 `ws` 手写订阅表，缺鉴权、心跳、ack、presence。
7. Web API 输入校验仍以 `String(...).trim().slice(...)` 为主，缺 schema。

### 0.3 总体执行原则

- 每个阶段独立可验证。
- 不一次性大爆炸重写。
- 不继续新增酒馆玩法功能，先补结构、边界和发布能力。
- 所有改动必须保持：

```bash
cd tavern-web
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
```

通过。

---

## File Structure Map

### 计划新增

```text
astrbot_plugin/
├─ domain/
│  ├─ __init__.py
│  ├─ room.py
│  ├─ script.py
│  ├─ role_assignment.py
│  └─ state_machine.py
├─ application/
│  ├─ __init__.py
│  ├─ room_service.py
│  └─ command_messages.py
├─ infrastructure/
│  ├─ __init__.py
│  ├─ state_store.py
│  └─ web_sync_client.py
├─ content/
│  └─ scripts/
│     ├─ campus_horror.yaml
│     ├─ fantasy_adventure.yaml
│     ├─ mystery_case.yaml
│     ├─ light_party.yaml
│     └─ cthulhu_investigation.yaml
└─ tests/
   ├─ test_script_loader.py
   ├─ test_room_lifecycle.py
   └─ test_role_assignment.py

tavern-web/
├─ src/
│  ├─ auth/
│  │  ├─ tokens.js
│  │  └─ middleware.js
│  ├─ schemas/
│  │  ├─ roomSchemas.js
│  │  └─ chatSchemas.js
│  └─ realtime/
│     └─ broker.js
├─ verify_auth_e2e.mjs
└─ verify_security_e2e.mjs

docs/
├─ 安全模型.md
├─ 架构拆分说明.md
└─ 发布清单.md
```

### 计划修改

```text
README.md
astrbot_plugin/main.py
astrbot_plugin/metadata.yaml
astrbot_plugin/requirements.txt
astrbot_plugin/README.md
tavern-web/package.json
tavern-web/src/routes/public.js
tavern-web/src/routes/internal.js
tavern-web/src/ws/broker.js
tavern-web/src/store/roomStore.js
tavern-web/verify_*.mjs
```

---

## Milestone P0: 停止伤害与发布底线

### Task P0-1: 完成仓库改名与远端地址修正

**Files:**
- Modify: `README.md`
- Modify: `docs/重命名与路线图.md`
- No code changes

- [ ] **Step 1: 确认 GitHub 仓库实际名称**

在浏览器或 GitHub Settings 中确认仓库名已经是：

```text
astrbot_plugin_tavern_lobby
```

- [ ] **Step 2: 更新本地 remote**

Run:

```powershell
git -C C:\Users\kanye\astrbot_plugin_SillyTavern_card remote set-url origin https://github.com/XZZKANY/astrbot_plugin_tavern_lobby.git
git -C C:\Users\kanye\astrbot_plugin_SillyTavern_card fetch origin
git -C C:\Users\kanye\astrbot_plugin_SillyTavern_card status -sb
```

Expected:

```text
## main...origin/main
```

- [ ] **Step 3: 如果新地址仍不可用，停止**

如果出现：

```text
Repository not found
```

不要继续改 remote，先确认 GitHub 实际仓库名。

- [ ] **Step 4: 提交记录**

```bash
git add README.md docs/重命名与路线图.md
git commit -m "确认项目改名为 tavern lobby"
git push origin main
```

### Task P0-2: 补齐开源发布底线

**Files:**
- Create: `LICENSE`
- Create: `docs/发布清单.md`
- Modify: `astrbot_plugin/metadata.yaml`
- Modify: `astrbot_plugin/requirements.txt`
- Modify: `tavern-web/.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: 创建发布清单**

Create `docs/发布清单.md`:

```markdown
# 发布清单

## 必需文件

- [x] README.md
- [x] astrbot_plugin/metadata.yaml
- [x] astrbot_plugin/requirements.txt
- [x] astrbot_plugin/tavern_web_config.example.json
- [x] tavern-web/.env.example
- [ ] LICENSE
- [ ] Dockerfile
- [ ] docker-compose.yml
- [ ] GitHub Actions CI
- [ ] v0.1.0-alpha release notes

## 发布前验证

```bash
python -m py_compile astrbot_plugin/main.py
cd tavern-web
npm install
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
```
```

- [ ] **Step 2: 创建 LICENSE**

如果没有特殊授权要求，先用 MIT：

```text
MIT License

Copyright (c) 2026 XZZKANY

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: 校验 metadata 内容**

`astrbot_plugin/metadata.yaml` 应保持：

```yaml
name: astrbot_plugin_tavern_lobby
desc: AstrBot 群聊多人叙事酒馆插件，支持群聊开房、剧本选择、身份私发、回合推进和网页房间同步。
version: 0.1.0-alpha
author: XZZKANY
repo: https://github.com/XZZKANY/astrbot_plugin_tavern_lobby
```

- [ ] **Step 4: 运行验证并提交**

```powershell
python -m py_compile C:\Users\kanye\astrbot_plugin_SillyTavern_card\astrbot_plugin\main.py
cd C:\Users\kanye\astrbot_plugin_SillyTavern_card\tavern-web
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
git add LICENSE docs/发布清单.md astrbot_plugin/metadata.yaml astrbot_plugin/requirements.txt tavern-web/.env.example .gitignore
git commit -m "补齐 alpha 发布清单"
git push origin main
```

---

## Milestone P0-Security: 最小权限模型

### Task P0-3: 引入签名 token 基础设施

**Files:**
- Modify: `tavern-web/package.json`
- Create: `tavern-web/src/auth/tokens.js`
- Create: `tavern-web/verify_auth_e2e.mjs`

- [ ] **Step 1: 增加依赖**

Run:

```bash
cd tavern-web
npm install jose
```

- [ ] **Step 2: 写失败验证脚本**

Create `tavern-web/verify_auth_e2e.mjs`:

```js
import assert from 'node:assert/strict';
import { createParticipantToken, createSpectatorToken, verifyRoomToken } from './src/auth/tokens.js';

process.env.TAVERN_WEB_AUTH_SECRET = 'test-secret-minimum-32-characters';

const participant = await createParticipantToken({ roomId: 'room-a', userId: 'u1', userName: '玩家一' });
const spectator = await createSpectatorToken({ roomId: 'room-a' });

const participantClaims = await verifyRoomToken(participant, { roomId: 'room-a', requiredRole: 'participant' });
assert.equal(participantClaims.room_id, 'room-a');
assert.equal(participantClaims.user_id, 'u1');
assert.equal(participantClaims.user_name, '玩家一');
assert.equal(participantClaims.role, 'participant');

const spectatorClaims = await verifyRoomToken(spectator, { roomId: 'room-a', requiredRole: 'spectator' });
assert.equal(spectatorClaims.role, 'spectator');

await assert.rejects(
  () => verifyRoomToken(spectator, { roomId: 'room-a', requiredRole: 'participant' }),
  /forbidden_role/,
);

await assert.rejects(
  () => verifyRoomToken(participant, { roomId: 'room-b', requiredRole: 'participant' }),
  /room_mismatch/,
);

console.log('tavern-web auth verification passed');
```

- [ ] **Step 3: 确认失败**

Run:

```bash
node verify_auth_e2e.mjs
```

Expected: FAIL，因为 `src/auth/tokens.js` 不存在。

- [ ] **Step 4: 实现 token 工具**

Create `tavern-web/src/auth/tokens.js`:

```js
import { SignJWT, jwtVerify } from 'jose';

function secretKey() {
  const secret = process.env.TAVERN_WEB_AUTH_SECRET || process.env.TAVERN_WEB_SYNC_TOKEN || '';
  if (secret.length < 16) {
    throw new Error('missing_auth_secret');
  }
  return new TextEncoder().encode(secret);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function createParticipantToken({ roomId, userId, userName, expiresInSeconds = 86400 }) {
  return new SignJWT({
    room_id: String(roomId || ''),
    user_id: String(userId || ''),
    user_name: String(userName || ''),
    role: 'participant',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + expiresInSeconds)
    .sign(secretKey());
}

export async function createSpectatorToken({ roomId, expiresInSeconds = 86400 }) {
  return new SignJWT({
    room_id: String(roomId || ''),
    role: 'spectator',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSeconds())
    .setExpirationTime(nowSeconds() + expiresInSeconds)
    .sign(secretKey());
}

export async function verifyRoomToken(token, { roomId, requiredRole }) {
  if (!token) throw new Error('missing_token');
  const { payload } = await jwtVerify(String(token), secretKey());
  if (String(payload.room_id || '') !== String(roomId || '')) throw new Error('room_mismatch');
  if (requiredRole && payload.role !== requiredRole) throw new Error('forbidden_role');
  return payload;
}
```

- [ ] **Step 5: 加 package script**

Modify `tavern-web/package.json`:

```json
{
  "scripts": {
    "verify:auth": "node verify_auth_e2e.mjs"
  }
}
```

- [ ] **Step 6: 运行验证**

```bash
npm run verify:auth
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
```

Expected: all PASS.

### Task P0-4: 保护 room-view 与 chat 写入

**Files:**
- Create: `tavern-web/src/auth/middleware.js`
- Modify: `tavern-web/src/routes/public.js`
- Modify: `tavern-web/verify_chat_e2e.mjs`
- Modify: `tavern-web/verify_ui_e2e.mjs`

- [ ] **Step 1: 扩展失败测试**

在 `verify_chat_e2e.mjs` 中新增断言：

```js
const noTokenRoomView = await fetch(`${base}/api/rooms/${roomId}/room-view`);
assert.equal(noTokenRoomView.status, 401);

const noTokenChat = await fetch(`${base}/api/rooms/${roomId}/chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user_name: '伪造房主', content: '伪造发言' }),
});
assert.equal(noTokenChat.status, 401);
```

- [ ] **Step 2: 确认失败**

```bash
npm run verify:chat
```

Expected: FAIL，因为当前接口仍允许裸访问。

- [ ] **Step 3: 实现 middleware**

Create `tavern-web/src/auth/middleware.js`:

```js
import { verifyRoomToken } from './tokens.js';

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

export function requireRoomToken(role) {
  return async (req, res, next) => {
    try {
      const claims = await verifyRoomToken(bearerToken(req), {
        roomId: String(req.params.roomId || ''),
        requiredRole: role,
      });
      req.roomToken = claims;
      next();
    } catch (error) {
      const message = String(error?.message || 'invalid_token');
      if (message === 'forbidden_role' || message === 'room_mismatch') {
        res.status(403).json({ error: message });
        return;
      }
      res.status(401).json({ error: 'invalid_or_missing_token' });
    }
  };
}
```

- [ ] **Step 4: 应用到接口**

Modify `tavern-web/src/routes/public.js`:

```js
import { requireRoomToken } from '../auth/middleware.js';

router.get('/rooms/:roomId/room-view', requireRoomToken('participant'), (req, res) => {
  const payload = getRoomView(String(req.params.roomId || ''));
  if (!payload) return res.status(404).json({ error: 'room_not_found' });
  res.json(payload);
});

router.post('/rooms/:roomId/chat', requireRoomToken('participant'), (req, res) => {
  const roomId = String(req.params.roomId || '');
  const room = getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'room_not_found' });
  if (room.is_closed) return res.status(409).json({ error: 'room_closed' });

  const userName = String(req.roomToken?.user_name || '').trim().slice(0, 24);
  const content = String(req.body?.content || '').trim().slice(0, 300);
  if (!userName || !content) return res.status(400).json({ error: 'invalid_chat_message' });

  const chatMessage = addParticipantChat(roomId, { user_name: userName, content });
  broker?.broadcast(roomId, 'room', {
    type: 'chat_message',
    room_id: roomId,
    payload: { chat_message: chatMessage },
  });
  res.json({ ok: true, chat_message: chatMessage });
});
```

- [ ] **Step 5: 修改前端请求**

`room.js` 需要从 URL 参数读取 token：

```js
function roomTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function authHeaders() {
  const token = roomTokenFromUrl();
  return token ? { authorization: `Bearer ${token}` } : {};
}
```

`fetchJson()` 和 `submitParticipantChat()` 应附带 Authorization。

- [ ] **Step 6: 跑验证**

```bash
npm run verify:auth
npm run verify:chat
npm run verify:ui
```

Expected: all PASS.

> 注意：这一任务会破坏当前无 token 链接，需要同步更新 AstrBot 生成房间链接逻辑。

### Task P0-5: AstrBot 生成 participant / spectator token 链接

**Files:**
- Modify: `astrbot_plugin/main.py`
- Modify: `astrbot_plugin/requirements.txt`
- Modify: `astrbot_plugin/tavern_web_config.example.json`

- [ ] **Step 1: 增加配置字段**

`astrbot_plugin/tavern_web_config.example.json` 增加：

```json
{
  "auth_secret": "请替换为和 tavern-web 一致的强随机字符串"
}
```

- [ ] **Step 2: 增加 Python JWT 依赖**

`requirements.txt` 增加：

```text
PyJWT>=2.8.0
```

- [ ] **Step 3: 为 Web 链接追加 token**

在 `main.py` 中新增 token 生成函数，签名 claims：

```python
{
  "room_id": room.group_id,
  "user_id": user_id,
  "user_name": user_name,
  "role": "participant",
  "exp": now + 86400
}
```

旁观链接 claims：

```python
{
  "room_id": room.group_id,
  "role": "spectator",
  "exp": now + 86400
}
```

- [ ] **Step 4: 保持链接只发一次**

创建酒馆时仍只输出一次链接，但链接形态改为：

```text
房间页：http://host/room/<roomId>?token=<participant-token>
旁观页：http://host/spectator/<roomId>?token=<spectator-token>
```

- [ ] **Step 5: 验证**

```bash
python -m py_compile astrbot_plugin/main.py
```

然后真实开房验证：

- 创建消息中链接能打开
- room 页能进入并发送
- spectator 页不能看到参与者聊天
- 无 token 的 room-view 返回 401

---

## Milestone P1: AstrBot 插件拆架构

### Task P1-1: 外置剧本内容包

**Files:**
- Create: `astrbot_plugin/content/scripts/*.yaml`
- Create: `astrbot_plugin/domain/script.py`
- Modify: `astrbot_plugin/main.py`
- Create: `astrbot_plugin/tests/test_script_loader.py`

- [ ] **Step 1: 写脚本加载测试**

Create `astrbot_plugin/tests/test_script_loader.py`:

```python
from pathlib import Path

from astrbot_plugin.domain.script import load_scripts


def test_load_builtin_scripts():
    scripts = load_scripts(Path('astrbot_plugin/content/scripts'))
    names = [item.name for item in scripts]
    assert '校园怪谈' in names
    assert all(item.min_players == 3 for item in scripts)
    assert all(item.max_players == 5 for item in scripts)
```

- [ ] **Step 2: 确认失败**

```bash
python -m pytest astrbot_plugin/tests/test_script_loader.py
```

Expected: FAIL，因为模块不存在。

- [ ] **Step 3: 创建 `domain/script.py`**

```python
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class TavernScript:
    name: str
    tags: str
    difficulty: str
    duration: str
    intro: str
    min_players: int
    max_players: int
    roles: list[str]
    opening: str
    role_briefs: dict[str, str] = field(default_factory=dict)
    role_actions: dict[str, str] = field(default_factory=dict)
    phase_events: dict[str, str] = field(default_factory=dict)
    settlement_tips: list[str] = field(default_factory=list)


def _script_from_dict(data: dict[str, Any]) -> TavernScript:
    return TavernScript(
        name=str(data['name']),
        tags=str(data.get('tags', '')),
        difficulty=str(data.get('difficulty', '普通')),
        duration=str(data.get('duration', '30-60分钟')),
        intro=str(data.get('intro', '')),
        min_players=int(data.get('min_players', 3)),
        max_players=int(data.get('max_players', 5)),
        roles=[str(item) for item in data.get('roles', [])],
        opening=str(data.get('opening', '')),
        role_briefs={str(k): str(v) for k, v in dict(data.get('role_briefs', {})).items()},
        role_actions={str(k): str(v) for k, v in dict(data.get('role_actions', {})).items()},
        phase_events={str(k): str(v) for k, v in dict(data.get('phase_events', {})).items()},
        settlement_tips=[str(item) for item in data.get('settlement_tips', [])],
    )


def load_scripts(directory: Path) -> list[TavernScript]:
    scripts: list[TavernScript] = []
    for path in sorted(directory.glob('*.yaml')):
        payload = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
        scripts.append(_script_from_dict(payload))
    return scripts
```

- [ ] **Step 4: 迁移内置剧本 YAML**

把当前 `SCRIPT_LIBRARY` 中五个剧本拆成 YAML 文件。

示例 `campus_horror.yaml`：

```yaml
name: 校园怪谈
tags: 悬疑 校园
difficulty: 简单
duration: 30-45分钟
min_players: 3
max_players: 5
intro: 轻量怪谈本 适合先热身。
roles:
  - 调查员
  - 记录员
  - 目击者
  - 怀疑者
  - 守夜人
opening: 晚自习后的教学楼还没完全熄灯，旧实验楼里传来第二次点名，所有人都知道今晚有人在撒谎。
role_briefs:
  调查员: 你擅长抓异常细节，越早发问越能带起节奏。
role_actions:
  调查员: 优先点名一个地点或人物，说明你要先核查什么异常。
phase_events:
  准备阶段: 走廊灯管忽明忽暗，值日表上却多了一行没人承认写过的名字。
settlement_tips:
  - 先对齐谁掌握了最具体的时间线。
```

- [ ] **Step 5: 接入 main.py**

`main.py` 不再维护硬编码 `SCRIPT_LIBRARY`，改为启动时加载内容包。

- [ ] **Step 6: 验证**

```bash
python -m pytest astrbot_plugin/tests/test_script_loader.py
python -m py_compile astrbot_plugin/main.py
```

### Task P1-2: 拆 Room domain model

**Files:**
- Create: `astrbot_plugin/domain/room.py`
- Modify: `astrbot_plugin/main.py`
- Create: `astrbot_plugin/tests/test_room_lifecycle.py`

- [ ] **Step 1: 写 room 生命周期测试**

```python
from astrbot_plugin.domain.room import TavernRoom


def test_room_add_remove_and_reset():
    room = TavernRoom(group_id='g1', owner_id='u1', owner_name='房主', created_at='2026-04-30 00:00:00')
    assert room.add_member('u1', '房主') is True
    assert room.add_member('u2', '玩家二') is True
    assert room.add_member('u2', '玩家二') is False
    assert room.remove_member('u2') is True
    room.started = True
    room.locked = True
    room.role_map = {'u1': '调查员'}
    room.reset_round_state()
    assert room.started is False
    assert room.locked is False
    assert room.role_map == {}
```

- [ ] **Step 2: 移出 TavernRoom**

把当前 `main.py` 中 `TavernRoom` dataclass 移到 `domain/room.py`。

- [ ] **Step 3: main.py 只 import**

```python
from .domain.room import TavernRoom
```

- [ ] **Step 4: 验证**

```bash
python -m pytest astrbot_plugin/tests/test_room_lifecycle.py
python -m py_compile astrbot_plugin/main.py
```

### Task P1-3: 抽出 Web sync client

**Files:**
- Create: `astrbot_plugin/infrastructure/web_sync_client.py`
- Modify: `astrbot_plugin/main.py`
- Modify: `astrbot_plugin/requirements.txt`

- [ ] **Step 1: 加异步 HTTP 依赖**

`requirements.txt` 增加：

```text
httpx>=0.27.0
```

- [ ] **Step 2: 创建异步客户端**

Create `astrbot_plugin/infrastructure/web_sync_client.py`:

```python
from __future__ import annotations

import httpx


class TavernWebSyncClient:
    def __init__(self, sync_url: str, sync_token: str, timeout_seconds: float = 2.0):
        self.sync_url = sync_url.rstrip('/')
        self.sync_token = sync_token
        self.timeout_seconds = timeout_seconds

    async def full_sync(self, room_id: str, payload: dict) -> None:
        if not self.sync_url or not self.sync_token or not room_id:
            return
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f'{self.sync_url}/rooms/{room_id}/full-sync',
                json=payload,
                headers={'X-Tavern-Token': self.sync_token},
            )
            response.raise_for_status()

    async def close_room(self, room_id: str, payload: dict) -> None:
        if not self.sync_url or not self.sync_token or not room_id:
            return
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f'{self.sync_url}/rooms/{room_id}/close',
                json=payload,
                headers={'X-Tavern-Token': self.sync_token},
            )
            response.raise_for_status()
```

- [ ] **Step 3: main.py 调用异步客户端**

把 `_sync_room_state()` 和 `_close_web_room()` 改为 async，并在命令函数中 `await`。

- [ ] **Step 4: 验证**

```bash
python -m py_compile astrbot_plugin/main.py
```

真实远端验证：

```bash
docker exec astrbot python -m py_compile /AstrBot/data/plugins/astrbot_plugin_tavern_lobby/main.py
docker restart astrbot
```

---

## Milestone P2: Web 服务治理

### Task P2-1: 引入 Zod schema 校验

**Files:**
- Modify: `tavern-web/package.json`
- Create: `tavern-web/src/schemas/chatSchemas.js`
- Modify: `tavern-web/src/routes/public.js`
- Modify: `tavern-web/verify_chat_e2e.mjs`

- [ ] **Step 1: 安装 Zod**

```bash
cd tavern-web
npm install zod
```

- [ ] **Step 2: 创建 schema**

```js
import { z } from 'zod';

export const ChatMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(300),
});
```

- [ ] **Step 3: 替换手写 trim/slice**

`POST /chat` 用 schema parse：

```js
const parsed = ChatMessageInputSchema.safeParse(req.body || {});
if (!parsed.success) return res.status(400).json({ error: 'invalid_chat_message' });
const content = parsed.data.content;
```

- [ ] **Step 4: 验证非法输入**

`verify_chat_e2e.mjs` 增加空字符串、超长字符串断言。

### Task P2-2: 加基础 Web 安全中间件

**Files:**
- Modify: `tavern-web/package.json`
- Modify: `tavern-web/src/app.js`
- Create: `tavern-web/verify_security_e2e.mjs`

- [ ] **Step 1: 安装依赖**

```bash
npm install helmet express-rate-limit
```

- [ ] **Step 2: 修改 app.js**

```js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));
```

- [ ] **Step 3: 安全验证**

Create `verify_security_e2e.mjs` 检查 helmet header 与 rate limit header 存在。

### Task P2-3: WebSocket subscribe 鉴权

**Files:**
- Modify: `tavern-web/src/ws/broker.js`
- Modify: `tavern-web/web/room.js`
- Modify: `tavern-web/web/spectator.js`
- Modify: `tavern-web/verify_ws_e2e.mjs`

- [ ] **Step 1: subscribe 消息必须带 token**

新协议：

```json
{
  "type": "subscribe",
  "room_id": "room-id",
  "channel": "room",
  "token": "jwt"
}
```

- [ ] **Step 2: room channel 要 participant token**

broker 收到 `channel=room` 时验证 participant token。

- [ ] **Step 3: spectator channel 要 spectator token**

broker 收到 `channel=spectator` 时验证 spectator token。

- [ ] **Step 4: 拒绝非法订阅**

非法订阅返回：

```json
{"type":"error","message":"invalid_or_missing_token"}
```

并不加入订阅表。

- [ ] **Step 5: 验证**

`verify_ws_e2e.mjs` 增加裸订阅不收到消息、带 token 正常收到消息。

---

## Milestone P3: 产品体验修正

### Task P3-1: 补 `/酒馆链接` 命令

**Files:**
- Modify: `astrbot_plugin/main.py`
- Modify: `docs/使用说明.md`

- [ ] **Step 1: 增加命令**

新增：

```text
酒馆链接
```

用途：重新获取当前房间页 / 旁观页链接。

- [ ] **Step 2: 行为规则**

- 没房间：提示当前没有酒馆房间
- 有房间：返回链接
- 如果 token 已实现：重新签发短期链接

- [ ] **Step 3: 更新文档**

`docs/使用说明.md` 增加：

```text
如果创建时链接被刷走，可发送 @小预 酒馆链接 重新获取。
```

### Task P3-2: 增加房主 Web 控制台草案

**Files:**
- Create: `docs/房主控制台设计.md`

- [ ] **Step 1: 先写设计，不编码**

控制台只定义需求：

- 当前房间状态
- 成员在线状态
- 身份是否已发
- Web 同步是否成功
- 当前阶段
- 当前行动者
- 推进按钮
- 结束 / 解散按钮

- [ ] **Step 2: 明确权限**

房主控制台必须使用 owner token，不能用 participant token。

---

## Milestone P4: 替换低质量轮子

### Task P4-1: 评估 Socket.IO 替换裸 ws

**Files:**
- Create: `docs/socketio-迁移评估.md`

- [ ] **Step 1: 写评估项**

评估必须覆盖：

- reconnection
- ack
- rooms
- namespace
- middleware auth
- 当前 Playwright 测试改动成本

- [ ] **Step 2: 不立即替换**

只有当 P0 token 模型完成后再替换 WebSocket 层。

### Task P4-2: 评估 Drizzle 迁移

**Files:**
- Create: `docs/drizzle-迁移评估.md`

- [ ] **Step 1: 记录当前表**

- `rooms`
- `room_members`
- `room_timeline`
- `room_chat_messages`

- [ ] **Step 2: 设计 schema source of truth**

先写 schema 草案，不改生产 store。

---

## 最小执行顺序

如果只做最关键部分，顺序如下：

1. P0-1：确认仓库改名与 remote
2. P0-2：补齐发布底线
3. P0-3：引入 token 基础设施
4. P0-4：保护 room-view 与 chat
5. P0-5：AstrBot 生成带 token 的链接
6. P3-1：补 `/酒馆链接`
7. P1-1：外置剧本内容包
8. P1-2：拆 Room domain model
9. P1-3：异步 Web sync client

---

## 验收标准

### P0 完成标准

- 仓库与 README 不再出现误导性 SillyTavern card 定位
- `metadata.yaml`、`requirements.txt`、配置模板齐全
- 无 token 不能访问 `room-view`
- 无 token 不能发送聊天
- spectator token 不能访问 participant 接口
- participant token 可以进入 room、发送聊天、订阅 room WS
- spectator token 只能订阅 spectator WS
- 本地四套验证全部通过

### P1 完成标准

- `main.py` 至少移出 Room、Script、WebSync 三类职责
- 剧本内容不再硬编码在 Python 常量中
- 原有真实群聊流程不退化

### P2 完成标准

- API 输入均有 schema
- 基础安全中间件启用
- WebSocket 订阅有认证

---

## 当前暂不做事项

以下事项不进入近期实施：

- SillyTavern 角色卡解析 / 转换
- 商业化托管平台
- 剧本市场
- 多平台适配
- 大规模分布式部署

这些事项必须等 P0 / P1 稳定后再讨论。
