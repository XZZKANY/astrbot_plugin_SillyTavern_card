# tavern-web

`tavern-web` 是配套 AstrBot 酒馆插件使用的网页服务。

它负责把群聊中的酒馆状态同步成网页视图，并给参与者提供更像聊天软件的游戏体验。

## 目录说明

- `src/`：后端服务逻辑
- `web/`：前端页面与样式
- `verify_*.mjs`：本地与远端验证脚本
- `docs/`：本轮设计与计划文档

## 页面角色

### `room` 页

参与者主界面，特点：

- 展示公开播报
- 展示参与者聊天
- 允许发送网页聊天
- 自己消息右侧、其他玩家消息左侧

### `spectator` 页

只读公开旁观页，特点：

- 只显示公开播报
- 不显示参与者聊天
- 不提供输入框

## 启动方式

```bash
npm install
npm run start
```

## 环境变量

- `TAVERN_WEB_HOST`：监听地址，默认 `0.0.0.0`
- `TAVERN_WEB_PORT`：监听端口，默认 `8088`
- `TAVERN_WEB_DB_PATH`：SQLite 数据库路径
- `TAVERN_WEB_SYNC_TOKEN`：内部同步 token
- `TAVERN_WEB_TIMELINE_LIMIT`：时间线条数限制

## 验证脚本

```bash
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
npm run verify:e1-remote
```

## 当前实现重点

- 公开时间线与参与者聊天分轨
- room / spectator 双视角接口
- WebSocket 双频道广播
- 参与者聊天消息去重
- 房间关闭后禁发
- UI E2E 覆盖真实交互路径

## 参考文档

- 根目录说明：`../README.md`
- 使用说明：`../docs/使用说明.md`
- 详细报告：`../reports/2026-04-30-astrbot-tavern-plugin-report.md`
