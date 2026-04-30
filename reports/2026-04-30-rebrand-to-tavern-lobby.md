# 项目改名与定位修正记录

日期：2026-04-30

## 结论

项目方向已按方案 A 收敛：

```text
astrbot_plugin_tavern_lobby
```

当前仓库内容已从“疑似 SillyTavern card 插件”修正为“ AstrBot 群聊多人叙事 / 酒馆房间插件”。

## 已完成调整

- 根 README 改写为 `astrbot_plugin_tavern_lobby` 项目说明
- `astrbot_plugin/README.md` 改写为插件说明
- 新增 `astrbot_plugin/metadata.yaml`
- 新增 `astrbot_plugin/requirements.txt`
- 新增 `astrbot_plugin/tavern_web_config.example.json`
- 新增 `tavern-web/.env.example`
- 新增 `docs/重命名与路线图.md`
- `docs/使用说明.md` 补充项目定位说明

## 尚需仓库 Owner 操作

GitHub 仓库名当前仍是：

```text
astrbot_plugin_SillyTavern_card
```

建议在 GitHub Settings 中改名为：

```text
astrbot_plugin_tavern_lobby
```

改名后本地执行：

```bash
git remote set-url origin https://github.com/XZZKANY/astrbot_plugin_tavern_lobby.git
```

## 本次没有做的事

本次没有把项目改回 SillyTavern card 方向。

如果未来要做角色卡解析 / 转换，应另开仓库或分支，不要和酒馆组队项目混在一起。
