# astrbot_plugin_SillyTavern_card

一个围绕 **AstrBot 酒馆组队插件** 与配套 **tavern-web 网页前端** 的整理仓库。

当前仓库已经按两部分拆分：

- `astrbot_plugin/`：AstrBot 群聊插件源码
- `tavern-web/`：房间页 / 旁观页 / API / WebSocket 前端与服务端源码

这份仓库的目标不是只放单一脚本，而是把当前已经真实跑通过的一整套玩法链路整理清楚，方便继续维护、接手或二次开发。

## 当前能力

### AstrBot 插件

- 群里创建酒馆
- 选择剧本
- 玩家加入 / 退出
- 房主开始游戏
- 自动分配身份
- `我的身份` 私发
- 推进回合
- 结束 / 解散房间
- 同步房间状态到 `tavern-web`

### tavern-web

- `room` 页：参与者视角
- `spectator` 页：只读旁观视角
- 公开时间线与参与者聊天分离
- WebSocket 实时同步
- 参与者聊天群聊式气泡布局
  - 自己的消息在右侧
  - 别人的消息在左侧
- 房间关闭后禁发

## 仓库结构

```text
astrbot_plugin_SillyTavern_card/
├─ astrbot_plugin/
│  ├─ main.py
│  └─ README.md
├─ tavern-web/
│  ├─ src/
│  ├─ web/
│  ├─ docs/
│  ├─ package.json
│  ├─ server.js
│  └─ verify_*.mjs
├─ docs/
│  └─ 使用说明.md
├─ reports/
│  └─ 2026-04-30-astrbot-tavern-plugin-report.md
└─ README.md
```

## 快速开始

### 1. 看源码说明

- 插件说明：`astrbot_plugin/README.md`
- 网页说明：`tavern-web/README.md`
- 使用说明：`docs/使用说明.md`
- 详细交付报告：`reports/2026-04-30-astrbot-tavern-plugin-report.md`

### 2. 启动 tavern-web

```bash
cd tavern-web
npm install
npm run start
```

默认监听：

- `http://0.0.0.0:8088`

### 3. 校验本地功能

```bash
cd tavern-web
npm run verify:phase1
npm run verify:ws
npm run verify:chat
npm run verify:ui
```

## 当前整理范围说明

本仓库这次入库的是 **当前实际可运行源码**：

- AstrBot 插件以当前 live 镜像源码为准
- `tavern-web` 以当前本地工作目录中的有效源码与验证脚本为准

未纳入：

- `node_modules`
- 测试数据库
- 临时备份
- tar 包
- 线上运行态文件

## 后续建议

如果后面准备把它做成正式发布项目，建议继续补：

1. 插件安装元数据 / manifest
2. 配置模板文件
3. 一键部署脚本
4. 更正式的版本发布说明
5. 更强的网页身份绑定模型
