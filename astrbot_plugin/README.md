# astrbot_plugin_tavern_lobby

AstrBot 群聊多人叙事 / 酒馆房间插件。

## 文件说明

- `main.py`：插件主逻辑
- `metadata.yaml`：插件元数据
- `requirements.txt`：Python 依赖声明
- `tavern_web_config.example.json`：网页同步配置模板

## 命令

- `酒馆启动 [剧本名]`
- `剧本列表`
- `选择剧本 剧本名`
- `加入酒馆`
- `退出酒馆`
- `开始酒馆`
- `开始游戏`
- `我的身份`
- `当前回合`
- `下一回合`
- `结束酒馆`
- `酒馆状态`
- `酒馆解散`
- `酒馆帮助`

## 当前行为

### 人数规则

当前剧本默认支持：

- 最少 3 人
- 最多 5 人

### 身份发放

`我的身份` 会尝试私发。

如果私发失败，群里只提示失败，不会把身份公开发到群里。

### 房间链接

房间页 / 旁观页链接只在创建酒馆时出现一次。

后续加入、开始、状态和回合推进消息不再重复附带链接。

## tavern-web 同步配置

插件可通过环境变量配置：

```text
TAVERN_WEB_ENABLED=1
TAVERN_WEB_SYNC_URL=http://127.0.0.1:8088/internal
TAVERN_WEB_PUBLIC_BASE_URL=http://127.0.0.1:8088
TAVERN_WEB_SYNC_TOKEN=请替换为强随机字符串
```

也可以参考 `tavern_web_config.example.json` 写入插件数据目录中的配置文件。

## 当前限制

当前 `main.py` 仍是单文件主逻辑，适合作为 alpha 版本使用和继续开发。

下一阶段建议拆分为：

```text
astrbot_plugin/
├─ main.py
├─ domain/
├─ application/
├─ infrastructure/
└─ content/
```

## 项目定位

本插件不是 SillyTavern 角色卡解析插件。

如果需要做角色卡解析 / 转换，应单独建立 card 项目，或接入成熟角色卡解析库。
