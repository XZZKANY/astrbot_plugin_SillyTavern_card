# astrbot_plugin_tavern_lobby

AstrBot 群聊多人叙事 / 酒馆房间插件。

这个项目的定位是：在群聊里创建一桌轻量剧本 / 酒馆局，由 AstrBot 负责群聊命令、身份发放和回合推进，由 `tavern-web` 提供参与者房间页和旁观页。

> 当前仓库历史上使用过 `astrbot_plugin_SillyTavern_card` 名称，但实际功能已经明确收敛为 **酒馆组队与网页房间同步**，不是 SillyTavern 角色卡解析 / 转换插件。建议 GitHub 仓库后续改名为 `astrbot_plugin_tavern_lobby`。

## 当前能力

### AstrBot 插件

- 群聊创建酒馆
- 剧本列表与剧本选择
- 玩家加入 / 退出
- 3 到 5 人开局
- 未选剧本时自动使用默认剧本
- 房主开始游戏 / 推进回合 / 结束房间
- 自动分配身份
- `我的身份` 私发，不在公共群泄露身份
- 房间链接只在创建时出现一次，减少刷屏
- 同步公开状态到网页服务

### tavern-web

- `room`：参与者房间页
- `spectator`：只读旁观页
- 公开播报与参与者聊天分离
- WebSocket 实时同步
- 参与者聊天群聊式布局
  - 自己消息在右侧
  - 他人消息在左侧
- 房间关闭后禁发

## 仓库结构

```text
astrbot_plugin_tavern_lobby/
├─ astrbot_plugin/
│  ├─ main.py
│  ├─ metadata.yaml
│  ├─ requirements.txt
│  ├─ tavern_web_config.example.json
│  └─ README.md
├─ tavern-web/
│  ├─ src/
│  ├─ web/
│  ├─ package.json
│  ├─ server.js
│  ├─ .env.example
│  └─ verify_*.mjs
├─ docs/
│  ├─ 使用说明.md
│  └─ 重命名与路线图.md
├─ reports/
└─ README.md
```

## 快速启动 tavern-web

```bash
cd tavern-web
npm install
npm run start
```

默认监听：

```text
http://0.0.0.0:8088
```

## 本地验证

```bash
cd tavern-web
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
```

## AstrBot 插件配置

插件侧可通过环境变量或配置文件接入 `tavern-web`：

```text
TAVERN_WEB_ENABLED=1
TAVERN_WEB_SYNC_URL=http://127.0.0.1:8088/internal
TAVERN_WEB_PUBLIC_BASE_URL=http://你的域名或IP:8088
TAVERN_WEB_SYNC_TOKEN=替换为强随机字符串
```

配置文件模板见：

```text
astrbot_plugin/tavern_web_config.example.json
```

## 当前状态

当前代码仍处于 `alpha` 阶段，已经能跑通端到端流程，但还不是成熟商业化项目。

下一阶段优先级：

1. GitHub 仓库实际改名为 `astrbot_plugin_tavern_lobby`
2. 拆分 `astrbot_plugin/main.py` 的单文件主逻辑
3. 外置剧本内容包
4. 增加参与者 / 旁观者签名 token
5. 将 Bot 到 Web 的同步改为异步 HTTP 客户端或队列
6. 替换或增强当前裸 WebSocket broker

## 文档

- 使用说明：`docs/使用说明.md`
- 重命名与路线图：`docs/重命名与路线图.md`
- 详细报告：`reports/2026-04-30-astrbot-tavern-plugin-report.md`
