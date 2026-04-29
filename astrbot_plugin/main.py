from __future__ import annotations

import asyncio
import json
import os
import random
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from time import monotonic
from typing import ClassVar, Dict, List

from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star, register
from astrbot.core.star.star_tools import StarTools

try:
    from astrbot.api import logger
except ImportError:
    import logging

    logger = logging.getLogger(__name__)


MAX_PLAYERS = 5
STATE_FILE_NAME = "tavern_lobby_state.json"
COMMAND_EXAMPLE_PREFIX = "@小预"
VISUAL_LINE = "━━━━━━━━━━━━"
PROGRESS_WIDTH = 5
WEB_CONFIG_FILE_NAME = "tavern_web_config.json"
TAVERN_WEB_ENABLED = os.getenv("TAVERN_WEB_ENABLED", "0").lower() in {"1", "true", "yes", "on"}
TAVERN_WEB_SYNC_URL = os.getenv("TAVERN_WEB_SYNC_URL", "").strip()
TAVERN_WEB_PUBLIC_BASE_URL = os.getenv("TAVERN_WEB_PUBLIC_BASE_URL", "").strip()
TAVERN_WEB_SYNC_TOKEN = os.getenv("TAVERN_WEB_SYNC_TOKEN", "").strip()
TAVERN_WEB_TIMEOUT_SECONDS = 2.0
SCRIPT_LIBRARY = [
    {
        "name": "校园怪谈",
        "tags": "悬疑 校园",
        "difficulty": "简单",
        "duration": "30-45分钟",
        "min_players": 3,
        "max_players": 5,
        "intro": "轻量怪谈本 适合先热身。",
        "roles": ["调查员", "记录员", "目击者", "怀疑者", "守夜人"],
        "opening": "晚自习后的教学楼还没完全熄灯，旧实验楼里传来第二次点名，所有人都知道今晚有人在撒谎。",
        "role_briefs": {
            "调查员": "你擅长抓异常细节，越早发问越能带起节奏。",
            "记录员": "你负责记住每个人的说法，最容易抓出前后矛盾。",
            "目击者": "你见过关键片段，但还拿不准自己漏掉了什么。",
            "怀疑者": "你天然不信表面说法，最适合逼别人补细节。",
            "守夜人": "你熟悉校园夜间动线，最容易判断谁的行动合理。",
        },
        "role_actions": {
            "调查员": "优先点名一个地点或人物，说明你要先核查什么异常。",
            "记录员": "整理两条说法的差异，用时间线逼出矛盾。",
            "目击者": "补充你亲眼见到的片段，但保留你最拿不准的细节。",
            "怀疑者": "直接质疑最可疑的一句陈述，逼对方补足细节。",
            "守夜人": "根据夜间动线判断谁的出现时机最不合理。",
        },
        "phase_events": {
            "准备阶段": "走廊灯管忽明忽暗，值日表上却多了一行没人承认写过的名字。",
            "情报交流": "失物招领箱里出现一把旧教室钥匙，标签上只有半截学号。",
            "行动阶段": "广播室突然传来断断续续的录音，像是在重复今晚的点名。",
            "结算阶段": "操场尽头的脚步声停了，大家必须决定下一轮先查人还是先查地点。",
        },
        "settlement_tips": [
            "先对齐谁掌握了最具体的时间线。",
            "下一轮优先追问最晚出现的异常人物或地点。",
        ],
    },
    {
        "name": "西幻冒险",
        "tags": "冒险 奇幻",
        "difficulty": "普通",
        "duration": "45-60分钟",
        "min_players": 3,
        "max_players": 5,
        "intro": "标准组队冒险本 打法自由。",
        "roles": ["骑士", "法师", "牧师", "盗贼", "游侠"],
        "opening": "酒馆老板把最后一张悬赏令拍在桌上，古堡地窖的封印正在松动，你们必须在天亮前排定行动顺序。",
        "role_briefs": {
            "骑士": "你擅长正面扛压，适合先给队伍定下方向。",
            "法师": "你手里握着最不稳定的信息，越晚说越容易被怀疑。",
            "牧师": "你善于稳住队友情绪，也适合做风险判断。",
            "盗贼": "你对暗门和捷径最敏感，容易发现别人没注意的机会。",
            "游侠": "你擅长从环境里找线索，适合先开视野。",
        },
        "role_actions": {
            "骑士": "明确本轮优先目标，告诉队友你准备正面处理什么威胁。",
            "法师": "抛出一条高价值情报，但别一次把底牌全说完。",
            "牧师": "判断谁最需要支援，并给出最稳的推进方式。",
            "盗贼": "提出一条潜入、绕后或偷看的路线，制造信息差。",
            "游侠": "根据地形和痕迹锁定最值得追查的方向。",
        },
        "phase_events": {
            "准备阶段": "悬赏令背面多了一行新墨迹：地窖钥匙可能不止一把。",
            "情报交流": "古堡管家送来一张残破地图，少掉的角落刚好遮住地下通路。",
            "行动阶段": "地窖深处传来金属碰撞声，像有人先一步触发了机关。",
            "结算阶段": "火把快烧到尽头了，你们必须决定下一轮先夺钥匙还是先救人。",
        },
        "settlement_tips": [
            "先确认哪条路线最稳，别让队伍分散太久。",
            "下一轮优先锁定最危险的机关或最关键的钥匙线索。",
        ],
    },
    {
        "name": "悬疑推理",
        "tags": "推理 烧脑",
        "difficulty": "偏高",
        "duration": "45-70分钟",
        "min_players": 3,
        "max_players": 5,
        "intro": "更适合喜欢盘逻辑的人。",
        "roles": ["侦探", "法医", "记者", "嫌疑人A", "嫌疑人B"],
        "opening": "封锁线刚拉起来，案发房间的钟表却比外面慢了七分钟，每个人都可能在隐瞒时间线。",
        "role_briefs": {
            "侦探": "你负责串起矛盾点，别人会下意识等你拍板。",
            "法医": "你最接近硬证据，细节越具体越有说服力。",
            "记者": "你擅长逼问和放大情绪，能让场面更快失控。",
            "嫌疑人A": "你知道自己最容易被盯上，必须让解释看起来合理。",
            "嫌疑人B": "你比别人更急着自保，但太着急也会露馅。",
        },
        "role_actions": {
            "侦探": "把两条时间线并排摆出来，先抓最明显的不一致。",
            "法医": "指出一条物证细节，逼大家围绕证据而不是感觉发言。",
            "记者": "追问一句最容易让人破防的问题，观察谁反应过度。",
            "嫌疑人A": "主动解释你最可疑的空白时间，别等别人先定性。",
            "嫌疑人B": "顺着别人说法补一条看似合理的细节，争取转移火力。",
        },
        "phase_events": {
            "准备阶段": "现场照片里多出一个本不该出现的倒影，但没人承认自己站在那里。",
            "情报交流": "警方在门把上提取到第二组指纹，时间却和证词对不上。",
            "行动阶段": "失踪的录音笔突然被找回，可最后三十秒内容被人为剪掉了。",
            "结算阶段": "嫌疑范围没有缩小，反而多出一条新的作案路径。",
        },
        "settlement_tips": [
            "复盘哪条证词和物证冲突最大。",
            "下一轮优先追死一个最站不住脚的时间点。",
        ],
    },
    {
        "name": "轻松跑团",
        "tags": "轻松 欢乐",
        "difficulty": "简单",
        "duration": "30-50分钟",
        "intro": "适合随便玩玩 别太紧绷。",
        "min_players": 3,
        "max_players": 5,
        "roles": ["队长", "整活王", "补刀手", "幸运星", "路人王"],
        "opening": "任务委托还没讲完，整支队伍已经因为路线、补给和谁负责背锅吵成一团。",
        "role_briefs": {
            "队长": "你最适合拍板，但拍太快也容易背锅。",
            "整活王": "你负责把局面搞热，常常会顺手把计划也搞乱。",
            "补刀手": "你擅长在别人发言后补关键一句，制造节目效果。",
            "幸运星": "你说的话不一定最稳，但经常阴差阳错撞对。",
            "路人王": "你看起来最普通，反而最容易突然给出神来一笔。",
        },
        "role_actions": {
            "队长": "先定一个能执行的方向，再让别人往上添梗。",
            "整活王": "提出一个离谱但能推动局面的点子，逼大家表态。",
            "补刀手": "抓住别人话里的空档，补一句最能翻盘的建议。",
            "幸运星": "凭直觉选一个人或地点，说清楚你为什么觉得它对。",
            "路人王": "用最朴素的观察提醒大家别忽略明显线索。",
        },
        "phase_events": {
            "准备阶段": "委托人递来的地图拿反了，但没人愿意第一个承认自己没看懂。",
            "情报交流": "补给箱里多出一张写着“绝对别走左边”的纸条。",
            "行动阶段": "你们刚决定分头行动，结果全员都走到了同一条小路上。",
            "结算阶段": "虽然过程一团乱麻，但队伍居然真的摸到了一点正确方向。",
        },
        "settlement_tips": [
            "先确认刚才最离谱的决定里有没有意外收获。",
            "下一轮保留一个稳妥方案，别让整桌一直失控。",
        ],
    },
    {
        "name": "克苏鲁",
        "tags": "惊悚 调查",
        "difficulty": "普通",
        "duration": "50-80分钟",
        "min_players": 3,
        "max_players": 5,
        "intro": "氛围向调查本 适合爱整活的。",
        "roles": ["调查员", "神父", "医生", "记者", "神秘学者"],
        "opening": "海边小镇的雾比昨晚更厚，教堂钟声提前响起，你们知道再晚一步就会错过关键目击。",
        "role_briefs": {
            "调查员": "你负责把碎片线索拼成方向，但也最容易被未知吸走注意力。",
            "神父": "你擅长稳定人心，对异常现象的解释最容易影响全桌。",
            "医生": "你能从人的状态里看出不对劲，细节判断很关键。",
            "记者": "你知道如何逼人开口，但有时会把事情推得太快。",
            "神秘学者": "你最懂那些不能明说的东西，但说得太多也会吓到别人。",
        },
        "role_actions": {
            "调查员": "先锁定一个异常现象，带大家围着它追根究底。",
            "神父": "给出一个让队伍暂时稳住的判断，再决定是否继续深入。",
            "医生": "从伤口、神态或疲惫反应里指出最不自然的地方。",
            "记者": "追问最像目击者的人，让对方多说一个细节。",
            "神秘学者": "解释一个超常迹象，但别把所有禁忌一次说透。",
        },
        "phase_events": {
            "准备阶段": "渔港木桩上绑着新的海藻符结，和昨晚见到的完全不同。",
            "情报交流": "镇民提到失踪者最后一次出现时，海面上没有一只海鸟。",
            "行动阶段": "地下祈祷室传来潮水声，可地图上那里本不该连着海。",
            "结算阶段": "雾气再次压近，你们必须决定下一轮先保命还是先追真相。",
        },
        "settlement_tips": [
            "先确认哪条线索最接近真正的异常源头。",
            "下一轮明确是继续深入禁区，还是先找能活着回来的退路。",
        ],
    },
]
SCRIPT_NAMES = [item["name"] for item in SCRIPT_LIBRARY]
DEFAULT_ROLES = ["1号位", "2号位", "3号位", "4号位", "5号位"]
PHASES = ["准备阶段", "情报交流", "行动阶段", "结算阶段"]
PHASE_GUIDES = {
    "准备阶段": {
        "goal": "确认身份、理解剧本，准备第一轮发言。",
        "action": "简单自我介绍，说明你想先观察谁。",
        "next": "房主确认大家看完身份后发送下一回合。",
    },
    "情报交流": {
        "goal": "每人抛出一条线索、猜测或质疑。",
        "action": "用“我发现/我怀疑/我要追问”开头推进讨论。",
        "next": "当前行动者发言后，房主继续推进阶段。",
    },
    "行动阶段": {
        "goal": "做出一次明确行动，例如调查、追问、保护或指认。",
        "action": "说清楚行动对象和理由，避免只说“随便”。",
        "next": "所有行动说完后，房主推进到结算阶段。",
    },
    "结算阶段": {
        "goal": "复盘本轮信息，确认下一轮优先目标。",
        "action": "总结你现在最相信和最怀疑的人。",
        "next": "房主推进后会切到下一位玩家或回到准备阶段。",
    },
}


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass
class TavernRoom:
    group_id: str
    owner_id: str
    owner_name: str
    created_at: str
    script_name: str = ""
    members: Dict[str, str] = field(default_factory=dict)
    started: bool = False
    locked: bool = False
    roles_sent: bool = False
    turn_index: int = 0
    phase_index: int = 0
    role_map: Dict[str, str] = field(default_factory=dict)
    updated_at: str = ""

    def add_member(self, user_id: str, user_name: str, limit: int = MAX_PLAYERS) -> bool:
        if user_id in self.members:
            return False
        if len(self.members) >= limit:
            return False
        self.members[user_id] = user_name
        return True

    def remove_member(self, user_id: str) -> bool:
        if user_id not in self.members:
            return False
        del self.members[user_id]
        self.role_map.pop(user_id, None)
        return True

    def member_lines(self) -> List[str]:
        return [f"{idx}. {name}" for idx, name in enumerate(self.members.values(), start=1)]

    def current_turn_user_id(self) -> str:
        if not self.members:
            return ""
        ids = list(self.members.keys())
        return ids[self.turn_index % len(ids)]

    def current_turn_user_name(self) -> str:
        uid = self.current_turn_user_id()
        return self.members.get(uid, "")

    def current_phase_name(self) -> str:
        if not PHASES:
            return ""
        return PHASES[self.phase_index % len(PHASES)]

    def reset_round_state(self):
        self.started = False
        self.locked = False
        self.roles_sent = False
        self.turn_index = 0
        self.phase_index = 0
        self.role_map = {}

    def to_dict(self) -> dict:
        return {
            "group_id": self.group_id,
            "owner_id": self.owner_id,
            "owner_name": self.owner_name,
            "created_at": self.created_at,
            "script_name": self.script_name,
            "members": self.members,
            "started": self.started,
            "locked": self.locked,
            "roles_sent": self.roles_sent,
            "turn_index": self.turn_index,
            "phase_index": self.phase_index,
            "role_map": self.role_map,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TavernRoom":
        members = data.get("members") or {}
        role_map = data.get("role_map") or {}
        created_at = str(data.get("created_at") or "")
        updated_at = str(data.get("updated_at") or created_at)
        room = cls(
            group_id=str(data.get("group_id") or ""),
            owner_id=str(data.get("owner_id") or ""),
            owner_name=str(data.get("owner_name") or ""),
            created_at=created_at,
            script_name=str(data.get("script_name") or ""),
            members={str(k): str(v) for k, v in members.items()} if isinstance(members, dict) else {},
            started=bool(data.get("started", False)),
            locked=bool(data.get("locked", False)),
            roles_sent=bool(data.get("roles_sent", False)),
            turn_index=_safe_int(data.get("turn_index"), 0),
            phase_index=_safe_int(data.get("phase_index"), 0),
            role_map={str(k): str(v) for k, v in role_map.items()} if isinstance(role_map, dict) else {},
            updated_at=updated_at,
        )
        if not room.created_at:
            room.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not room.updated_at:
            room.updated_at = room.created_at
        return room


@register(
    "astrbot_plugin_tavern_lobby",
    "Codex",
    "酒馆组队大厅 第一二层实现",
    "1.5.0",
)
class TavernLobbyPlugin(Star):
    _recent_keys: ClassVar[dict[str, float]] = {}
    _recent_ttl_seconds: ClassVar[float] = 2.0
    _dedupe_lock: ClassVar[asyncio.Lock] = asyncio.Lock()

    def __init__(self, context: Context):
        super().__init__(context)
        self.plugin_name = "astrbot_plugin_tavern_lobby"
        self.data_dir = StarTools.get_data_dir(self.plugin_name)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.data_dir / STATE_FILE_NAME
        self.web_config_file = self.data_dir / WEB_CONFIG_FILE_NAME
        self.web_config = self._load_web_config()
        self.rooms: Dict[str, TavernRoom] = self._load_rooms()
        logger.info(
            f"TavernLobby initialized: state_file={self.state_file}, restored_rooms={len(self.rooms)}"
        )
        self._sync_restored_rooms()

    def _now(self) -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _group_id(self, event: AstrMessageEvent) -> str:
        gid = event.get_group_id()
        return str(gid) if gid is not None else ""

    def _user_id(self, event: AstrMessageEvent) -> str:
        return str(event.get_sender_id())

    def _user_name(self, event: AstrMessageEvent) -> str:
        return str(event.get_sender_name() or event.get_sender_id())

    def _require_group(self, event: AstrMessageEvent) -> str:
        return self._group_id(event)

    def _touch_room(self, room: TavernRoom):
        room.updated_at = self._now()

    def _get_room(self, group_id: str) -> TavernRoom | None:
        return self.rooms.get(group_id)

    def _room_exists(self, group_id: str) -> bool:
        return group_id in self.rooms

    def _is_owner(self, room: TavernRoom, user_id: str) -> bool:
        return room.owner_id == user_id

    def _require_owner(self, room: TavernRoom, user_id: str, message: str) -> tuple[bool, str]:
        if not self._is_owner(room, user_id):
            return False, message
        return True, ""

    def _require_started(self, room: TavernRoom, message: str) -> tuple[bool, str]:
        if not room.started:
            return False, message
        return True, ""

    def _require_not_started(self, room: TavernRoom, message: str) -> tuple[bool, str]:
        if room.started:
            return False, message
        return True, ""

    def _serialize_room(self, room: TavernRoom) -> dict:
        return room.to_dict()

    def _deserialize_room(self, data: dict) -> TavernRoom:
        return TavernRoom.from_dict(data if isinstance(data, dict) else {})

    def _load_web_config(self) -> dict:
        if not self.web_config_file.exists():
            return {}
        try:
            payload = json.loads(self.web_config_file.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
        except Exception as exc:
            logger.warning(f"TavernLobby failed to load web config from {self.web_config_file}: {exc}")
            return {}

    def _load_rooms(self) -> Dict[str, TavernRoom]:
        if not self.state_file.exists():
            return {}
        try:
            payload = json.loads(self.state_file.read_text(encoding="utf-8"))
            raw_rooms = payload.get("rooms") or {}
            if not isinstance(raw_rooms, dict):
                logger.warning(f"TavernLobby state file format invalid: {self.state_file}")
                return {}
            rooms: Dict[str, TavernRoom] = {}
            for group_id, room_data in raw_rooms.items():
                room = self._deserialize_room(room_data)
                final_group_id = str(group_id or room.group_id)
                if not final_group_id:
                    continue
                room.group_id = final_group_id
                rooms[final_group_id] = room
            logger.info(f"TavernLobby restored {len(rooms)} rooms from {self.state_file}")
            return rooms
        except Exception as exc:
            logger.error(f"TavernLobby failed to load state from {self.state_file}: {exc}")
            return {}

    def _sync_restored_rooms(self):
        if not self.rooms:
            return
        if not self._web_enabled() or not self._web_sync_url() or not self._web_sync_token():
            return
        for room in self.rooms.values():
            self._sync_room_state(room)
        logger.info(f"TavernLobby synced {len(self.rooms)} restored rooms to web")

    def _save_rooms(self) -> bool:
        payload = {
            "version": 1,
            "rooms": {group_id: self._serialize_room(room) for group_id, room in self.rooms.items()},
        }
        temp_file = self.state_file.with_suffix(".tmp")
        try:
            temp_file.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            temp_file.replace(self.state_file)
            return True
        except Exception as exc:
            logger.error(f"TavernLobby failed to save state to {self.state_file}: {exc}")
            try:
                if temp_file.exists():
                    temp_file.unlink()
            except Exception:
                pass
            return False

    def _save_warning(self, saved: bool) -> str:
        if saved:
            return ""
        return "\n注意：状态保存失败，请尽快检查插件日志。"

    async def _send_private_text(self, group_id: str, user_id: str, text: str) -> bool:
        text = (text or "").strip()
        if not text:
            return False
        try:
            platform = self.context.get_platform("aiocqhttp") if getattr(self, "context", None) else None
            if not platform:
                logger.warning("TavernLobby private send failed: aiocqhttp platform not found")
                return False
            bot = platform.get_client()
            final_user_id = int(user_id) if str(user_id).isdigit() else user_id
            final_group_id = int(group_id) if str(group_id).isdigit() else group_id
            message = [{"type": "text", "data": {"text": text}}]
            try:
                await bot.send_private_msg(user_id=final_user_id, group_id=final_group_id, message=message)
            except TypeError:
                await bot.send_private_msg(user_id=final_user_id, message=message)
            logger.info(f"TavernLobby[{group_id}] private role sent to {user_id}")
            return True
        except Exception as exc:
            logger.exception(f"TavernLobby[{group_id}] private role send failed for {user_id}: {exc}")
            return False

    def _command_text(self, command: str) -> str:
        return f"{COMMAND_EXAMPLE_PREFIX} {command}".strip()

    def _web_enabled(self) -> bool:
        if TAVERN_WEB_ENABLED:
            return True
        return bool(self.web_config.get("enabled"))

    def _web_sync_url(self) -> str:
        return TAVERN_WEB_SYNC_URL or str(self.web_config.get("sync_url") or "").strip()

    def _web_public_base_url(self) -> str:
        return TAVERN_WEB_PUBLIC_BASE_URL or str(self.web_config.get("public_base_url") or "").strip()

    def _web_sync_token(self) -> str:
        return TAVERN_WEB_SYNC_TOKEN or str(self.web_config.get("sync_token") or "").strip()

    def _web_room_url(self, room: TavernRoom, spectator: bool = False) -> str:
        base_url = self._web_public_base_url()
        if not base_url:
            return ""
        base = base_url.rstrip("/")
        path = "spectator" if spectator else "room"
        return f"{base}/{path}/{room.group_id}"

    def _web_links_text(self, room: TavernRoom) -> str:
        room_url = self._web_room_url(room)
        spectator_url = self._web_room_url(room, spectator=True)
        parts: List[str] = []
        if room_url:
            parts.append(f"房间页：{room_url}")
        if spectator_url:
            parts.append(f"旁观页：{spectator_url}")
        return "\n".join(parts)

    def _public_status_text(self, room: TavernRoom) -> str:
        if room.started:
            return "进行中"
        if room.locked:
            return "等待中（已锁房）"
        return "等待中"

    def _public_room_payload(self, room: TavernRoom) -> dict:
        return {
            "room_id": room.group_id,
            "group_id": room.group_id,
            "owner_id": room.owner_id,
            "owner_name": room.owner_name,
            "script_name": room.script_name,
            "started": room.started,
            "locked": room.locked,
            "phase_name": room.current_phase_name() if room.started else "",
            "turn_index": room.turn_index,
            "current_actor_id": room.current_turn_user_id() if room.started else "",
            "current_actor_name": room.current_turn_user_name() if room.started else "",
            "member_count": len(room.members),
            "public_status": self._public_status_text(room),
            "updated_at": room.updated_at or self._now(),
        }

    def _public_members_payload(self, room: TavernRoom) -> List[dict]:
        items: List[dict] = []
        for index, (user_id, user_name) in enumerate(room.members.items(), start=1):
            items.append(
                {
                    "user_id": user_id,
                    "user_name": user_name,
                    "is_owner": user_id == room.owner_id,
                    "joined_at": f"{room.created_at}-{index}",
                }
            )
        return items

    def _public_event_payload(self, room: TavernRoom, event_type: str, title: str, content: str) -> dict:
        return {
            "event_type": event_type,
            "title": title,
            "content": content,
            "created_at": room.updated_at or self._now(),
        }

    def _public_presentation_payload(self, room: TavernRoom) -> dict:
        phase_name = room.current_phase_name() if room.started else PHASES[0]
        guide = self._phase_guide(phase_name)
        content = self._script_content(room)
        settlement_tips = content["settlement_tips"] if isinstance(content["settlement_tips"], list) else []
        safe_tips = [str(item) for item in settlement_tips if item]
        phase_index = room.phase_index + 1 if room.started else 1
        return {
            "opening": str(content["opening"]),
            "phase_event": self._phase_event_text(room),
            "phase_goal": str(guide["goal"]),
            "public_action_hint": str(guide["action"]),
            "next_step": str(guide["next"]),
            "settlement_tips": safe_tips[:3],
            "phase_index": max(1, min(phase_index, len(PHASES))),
            "phase_total": len(PHASES),
        }

    def _sync_room_state(self, room: TavernRoom, public_event: dict | None = None):
        sync_url = self._web_sync_url()
        sync_token = self._web_sync_token()
        if not self._web_enabled() or not sync_url or not sync_token:
            return
        room_id = room.group_id
        if not room_id:
            return
        payload = {
            "room": self._public_room_payload(room),
            "members": self._public_members_payload(room),
            "public_event": public_event,
            "presentation": self._public_presentation_payload(room),
        }
        url = f"{sync_url.rstrip('/')}/rooms/{room_id}/full-sync"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Tavern-Token": sync_token,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=TAVERN_WEB_TIMEOUT_SECONDS) as response:
                response.read()
                if response.status >= 400:
                    logger.warning(f"TavernLobby web sync unexpected status: {response.status}")
        except Exception as exc:
            logger.warning(f"TavernLobby web sync failed for room {room_id}: {exc}")

    def _close_web_room(self, room_id: str):
        sync_url = self._web_sync_url()
        sync_token = self._web_sync_token()
        if not self._web_enabled() or not sync_url or not sync_token or not room_id:
            return
        url = f"{sync_url.rstrip('/')}/rooms/{room_id}/close"
        body = json.dumps({"closed_at": self._now()}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Tavern-Token": sync_token,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=TAVERN_WEB_TIMEOUT_SECONDS) as response:
                response.read()
                if response.status >= 400:
                    logger.warning(f"TavernLobby web close unexpected status: {response.status}")
        except Exception as exc:
            logger.warning(f"TavernLobby web close failed for room {room_id}: {exc}")

    def _box(self, title: str, lines: List[str]) -> str:
        body = [str(line) for line in lines if line is not None]
        return "\n".join([f"【{title}】", VISUAL_LINE, *body])

    def _progress_bar(self, current: int, total: int, width: int = PROGRESS_WIDTH) -> str:
        total = max(1, int(total or 1))
        current = max(0, min(int(current or 0), total))
        filled = min(width, round(current / total * width))
        return f"{'█' * filled}{'░' * (width - filled)} {current}/{total}"

    def _script_card_text(self, script: dict) -> str:
        min_players = _safe_int(script.get("min_players"), 1)
        max_players = _safe_int(script.get("max_players"), MAX_PLAYERS)
        lines = [
            f"📖 名称：{script.get('name', '未知剧本')}",
            f"👥 人数：{min_players}-{max_players}人",
            f"🎚️ 难度：{script.get('difficulty', '未知')}",
            f"⏱️ 时长：{script.get('duration', '未知')}",
            f"🏷️ 标签：{script.get('tags', '无')}",
            f"📝 简介：{script.get('intro', '暂无简介')}",
        ]
        return self._box("剧本卡", lines)

    def _member_roster_text(self, room: TavernRoom) -> List[str]:
        if not room.members:
            return ["暂无成员"]
        lines: List[str] = []
        for idx, (user_id, name) in enumerate(room.members.items(), start=1):
            flags: List[str] = []
            if user_id == room.owner_id:
                flags.append("房主")
            if room.started and user_id == room.current_turn_user_id():
                flags.append("行动中")
            flag_text = f"（{' / '.join(flags)}）" if flags else ""
            lines.append(f"{idx}. {name}{flag_text}")
        return lines

    def _phase_guide(self, phase_name: str) -> dict:
        return PHASE_GUIDES.get(phase_name) or PHASE_GUIDES[PHASES[0]]

    def _script_content(self, room: TavernRoom) -> dict:
        script = self._find_script(room.script_name) or {}
        return {
            "opening": str(script.get("opening") or f"{room.script_name or '今晚的剧本'} 已经开场，先确认彼此立场，再决定第一轮节奏。"),
            "role_briefs": script.get("role_briefs") or {},
            "role_actions": script.get("role_actions") or {},
            "phase_events": script.get("phase_events") or {},
            "settlement_tips": script.get("settlement_tips") or [],
        }

    def _opening_text(self, room: TavernRoom) -> str:
        content = self._script_content(room)
        lines = [
            f"📖 剧本：{room.script_name or '未定'}",
            f"🎬 开场：{content['opening']}",
        ]
        return self._box("剧本开场", lines)

    def _role_brief_text(self, room: TavernRoom, user_id: str) -> str:
        role = room.role_map.get(user_id, "未知身份")
        content = self._script_content(room)
        role_briefs = content["role_briefs"] if isinstance(content["role_briefs"], dict) else {}
        role_actions = content["role_actions"] if isinstance(content["role_actions"], dict) else {}
        brief = role_briefs.get(role) or "先听两轮发言，再挑一个最可疑的点追问。"
        action = role_actions.get(role) or "结合当前阶段目标，说清楚你下一步最想推动什么。"
        return self._box("身份提示", [f"🎭 身份：{role}", f"📝 说明：{brief}", f"💡 建议：{action}"])

    def _role_action_hint(self, room: TavernRoom) -> str:
        actor_id = room.current_turn_user_id()
        role = room.role_map.get(actor_id, "")
        content = self._script_content(room)
        role_actions = content["role_actions"] if isinstance(content["role_actions"], dict) else {}
        if role and role in role_actions:
            return str(role_actions[role])
        phase_name = room.current_phase_name() or PHASES[0]
        return self._phase_guide(phase_name)["action"]

    def _phase_event_text(self, room: TavernRoom) -> str:
        phase_name = room.current_phase_name() or PHASES[0]
        content = self._script_content(room)
        phase_events = content["phase_events"] if isinstance(content["phase_events"], dict) else {}
        return str(phase_events.get(phase_name) or "局面暂时平静，但所有人的一句话都可能改变下一轮判断。")

    def _settlement_text(self, room: TavernRoom) -> str:
        content = self._script_content(room)
        settlement_tips = content["settlement_tips"] if isinstance(content["settlement_tips"], list) else []
        tips = [str(item) for item in settlement_tips if item]
        if not tips:
            tips = ["先复盘刚才最关键的一条信息。", "下一轮优先追问最站不住脚的说法。"]
        lines = [f"1. {tip}" for tip in tips[:3]]
        return self._box("阶段结算", lines)

    def _turn_panel_text(self, room: TavernRoom, compact: bool = False) -> str:
        phase_name = room.current_phase_name() or PHASES[0]
        guide = self._phase_guide(phase_name)
        actor = room.current_turn_user_name() or "未定"
        lines = [
            f"🎬 阶段：{phase_name}",
            f"🎯 当前行动：{actor}",
            f"📌 阶段目标：{guide['goal']}",
            f"🧩 剧本事件：{self._phase_event_text(room)}",
            f"\U0001f4ac \u884c\u52a8\u5efa\u8bae\uff1a{guide['action']}",
            f"➡️ 下一步：{guide['next']}",
            f"🧭 可用：{self._command_text('当前回合')} / {self._command_text('下一回合')}",
        ]
        if phase_name == "结算阶段":
            lines.extend(["", self._settlement_text(room)])
        if compact:
            return "\n".join(lines)
        return self._box("回合面板", lines)

    def _help_text(self) -> str:
        lines = [
            "🍺 基础流程",
            f"1. {self._command_text('酒馆启动 [剧本名]')}",
            f"2. {self._command_text('剧本列表')} / {self._command_text('选择剧本 剧本名')}",
            f"3. {self._command_text('加入酒馆')}",
            f"4. {self._command_text('开始酒馆')}",
            "",
            "🎲 对局中",
            f"- {self._command_text('我的身份')}：查看自己的身份",
            f"- {self._command_text('当前回合')}：查看当前行动者和阶段目标",
            f"- {self._command_text('下一回合')}：房主推进阶段",
            "",
            "🧹 收尾",
            f"- {self._command_text('结束酒馆')}：结束当前对局，保留房间和成员",
            f"- {self._command_text('酒馆状态')}：查看大厅面板",
            f"- {self._command_text('酒馆解散')}：彻底清空房间",
            "",
            "提示：当前环境需要先唤醒机器人，示例里的 @小预 按群内实际唤醒词替换。",
        ]
        return self._box("酒馆帮助", lines)

    def _normalize_text(self, event: AstrMessageEvent) -> str:
        text = (getattr(event, "message_str", "") or "").strip()
        return " ".join(text.split())

    def _dedupe_key(self, event: AstrMessageEvent, command_name: str) -> str:
        session_key = getattr(event, "unified_msg_origin", "") or self._group_id(event) or "unknown"
        normalized_text = self._normalize_text(event) or command_name
        return f"cmd:{command_name}:{session_key}:{self._user_id(event)}:{normalized_text}"

    @classmethod
    async def _mark_and_check_duplicate(cls, key: str) -> bool:
        now = monotonic()
        async with cls._dedupe_lock:
            expired = [item for item, ts in cls._recent_keys.items() if now - ts > cls._recent_ttl_seconds]
            for item in expired:
                cls._recent_keys.pop(item, None)
            if key in cls._recent_keys:
                return True
            cls._recent_keys[key] = now
            return False

    async def _prepare_command(self, event: AstrMessageEvent, command_name: str) -> bool:
        dedupe_key = self._dedupe_key(event, command_name)
        if await self._mark_and_check_duplicate(dedupe_key):
            logger.info(f"TavernLobby duplicate skipped: {dedupe_key}")
            try:
                event.stop_event()
            except Exception:
                pass
            return False
        try:
            event.stop_event()
        except Exception:
            pass
        return True

    def _find_script(self, script_name: str) -> dict | None:
        script_name = (script_name or "").strip()
        if not script_name:
            return None
        for item in SCRIPT_LIBRARY:
            if item["name"] == script_name:
                return item
        for item in SCRIPT_LIBRARY:
            if script_name in item["name"]:
                return item
        return None

    def _script_requirement_ok(self, room: TavernRoom) -> tuple[bool, str]:
        script = self._find_script(room.script_name)
        if not script:
            return False, "当前剧本无效，请先用 /剧本列表 查看后重新 /选择剧本。"
        count = len(room.members)
        min_players = _safe_int(script.get("min_players"), 1)
        max_players = _safe_int(script.get("max_players"), MAX_PLAYERS)
        if count < min_players:
            return False, f"这个剧本至少要 {min_players} 人，现在还差 {min_players - count} 人。"
        if count > max_players:
            return False, f"这个剧本最多 {max_players} 人，现在人数超了。"
        return True, ""

    def _room_capacity_limit(self, room: TavernRoom) -> int:
        script = self._find_script(room.script_name)
        if not script:
            return MAX_PLAYERS
        return min(MAX_PLAYERS, _safe_int(script.get("max_players"), MAX_PLAYERS))

    def _role_pool(self, room: TavernRoom) -> List[str]:
        script = self._find_script(room.script_name)
        roles = list((script or {}).get("roles") or DEFAULT_ROLES)
        if len(roles) < len(room.members):
            roles.extend(DEFAULT_ROLES)
        return roles[: len(room.members)]

    def _assign_roles(self, room: TavernRoom):
        user_ids = list(room.members.keys())
        roles = self._role_pool(room)
        random.shuffle(roles)
        room.role_map = {uid: role for uid, role in zip(user_ids, roles)}
        room.roles_sent = True
        room.turn_index = 0
        room.phase_index = 0

    def _room_text(self, room: TavernRoom) -> str:
        script = self._find_script(room.script_name)
        script_name = script["name"] if script else (room.script_name or "未选择")
        capacity_limit = self._room_capacity_limit(room)
        status_text = "进行中 · 已锁房" if room.started else ("等待中 · 已锁房" if room.locked else "等待中 · 可加入")
        lines = [
            f"👑 房主：{room.owner_name}",
            f"📖 剧本：{script_name}",
            f"🚪 状态：{status_text}",
            f"👥 人数：{self._progress_bar(len(room.members), capacity_limit)}",
            f"🕒 创建：{room.created_at}",
            "",
            "👥 成员",
            *self._member_roster_text(room),
        ]
        if room.started:
            lines.extend([
                "",
                self._turn_panel_text(room, compact=True),
                "",
                f"下一步：玩家可用 {self._command_text('我的身份')}，房主可用 {self._command_text('下一回合')}。",
            ])
            return self._box("酒馆大厅", lines)
        if not script:
            lines.extend([
                "",
                f"下一步：房主用 {self._command_text('剧本列表')} 查看剧本，再用 {self._command_text('选择剧本 剧本名')} 定本。",
            ])
            return self._box("酒馆大厅", lines)
        min_players = _safe_int(script.get("min_players"), 1)
        max_players = _safe_int(script.get("max_players"), capacity_limit)
        count = len(room.members)
        if count < min_players:
            next_step = f"还差 {min_players - count} 人，继续邀请群友发送 {self._command_text('加入酒馆')}。"
        elif count >= max_players:
            next_step = f"已到人数上限，房主可以发送 {self._command_text('开始酒馆')}。"
        else:
            next_step = f"已满足 {min_players}-{max_players} 人开局，房主可以发送 {self._command_text('开始酒馆')}。"
        lines.extend(["", f"下一步：{next_step}"])
        return self._box("酒馆大厅", lines)

    @filter.command("酒馆启动")
    async def tavern_start(self, event: AstrMessageEvent, script_name: str = ""):
        if not await self._prepare_command(event, "酒馆启动"):
            return

        group_id = self._require_group(event)
        if not group_id:
            yield event.plain_result("这个得在群里用，私聊开什么酒馆。").use_t2i(False)
            return

        if self._room_exists(group_id):
            yield event.plain_result("这群已经有酒馆房间了，先别乱开。\n用 /酒馆状态 看看。").use_t2i(False)
            return

        raw_script_name = (script_name or "").strip()
        matched_script = None
        if raw_script_name:
            matched_script = self._find_script(raw_script_name)
            if not matched_script:
                yield event.plain_result(
                    f"没找到这个剧本，先用 /剧本列表 看看。\n当前可选：{'、'.join(SCRIPT_NAMES)}"
                ).use_t2i(False)
                return

        owner_id = self._user_id(event)
        owner_name = self._user_name(event)
        now = self._now()
        room = TavernRoom(
            group_id=group_id,
            owner_id=owner_id,
            owner_name=owner_name,
            created_at=now,
            updated_at=now,
            script_name=matched_script["name"] if matched_script else "",
        )
        room.add_member(owner_id, owner_name)
        self.rooms[group_id] = room
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] room created by {owner_name}")
        self._sync_room_state(
            room,
            self._public_event_payload(room, "room_created", "酒馆已创建", f"{owner_name} 发起了新酒馆。"),
        )

        lines = [
            f"酒馆已创建：{room.script_name or '待选剧本'}",
            f"当前人数：{len(room.members)}/{self._room_capacity_limit(room)}",
        ]
        links_text = self._web_links_text(room)
        if links_text:
            lines.extend(["", links_text])
        msg = "\n".join(lines)
        yield event.plain_result(f"{msg}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("选择剧本")
    async def choose_script(self, event: AstrMessageEvent, script_name: str = ""):
        if not await self._prepare_command(event, "选择剧本"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("先 /酒馆启动 再选剧本，这都想跳步骤啊。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        ok, message = self._require_owner(room, self._user_id(event), "只有发起者能选剧本，别抢主持权。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        ok, message = self._require_not_started(room, "都开始了，现在改剧本，你是来拆台的吧。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        script_name = (script_name or "").strip()
        if not script_name:
            yield event.plain_result("用法：/选择剧本 剧本名").use_t2i(False)
            return

        matched_script = self._find_script(script_name)
        if not matched_script:
            yield event.plain_result(
                f"没找到这个剧本，先用 /剧本列表 看看。\n当前可选：{'、'.join(SCRIPT_NAMES)}"
            ).use_t2i(False)
            return

        room.script_name = matched_script["name"]
        self._touch_room(room)
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] script selected: {room.script_name}")

        count = len(room.members)
        min_players = _safe_int(matched_script.get("min_players"), 1)
        max_players = _safe_int(matched_script.get("max_players"), MAX_PLAYERS)
        if count < min_players:
            progress_text = f"还差 {min_players - count} 人才能开局。"
        elif count > max_players:
            progress_text = f"当前人数超出上限 {count}/{max_players}，需要先有人退出。"
        else:
            progress_text = f"已满足 {min_players}-{max_players} 人开局。"
        self._sync_room_state(
            room,
            self._public_event_payload(room, "script_selected", "剧本已确定", f"当前剧本：{room.script_name}。{progress_text}"),
        )

        lines = [
            f"剧本已定：{room.script_name}",
            progress_text,
        ]
        joined = "\n".join(lines)
        yield event.plain_result(f"{joined}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("剧本列表")
    async def script_list(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "剧本列表"):
            return

        lines = ["📚 可选剧本", VISUAL_LINE]
        for idx, item in enumerate(SCRIPT_LIBRARY, start=1):
            lines.append(f"{idx}. {item['name']}｜{item['min_players']}-{item['max_players']}人｜{item['difficulty']}｜{item['duration']}")
            lines.append(f"   {item['tags']}｜{item['intro']}")
        lines.extend(["", f"定本：{self._command_text('选择剧本 剧本名')}"])
        yield event.plain_result("\n".join(lines)).use_t2i(False)

    @filter.command("加入酒馆")
    async def join_tavern(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "加入酒馆"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("还没人开酒馆呢，先发 /酒馆启动。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        user_id = self._user_id(event)
        user_name = self._user_name(event)

        if room.started or room.locked:
            yield event.plain_result("这桌已经锁了，开局后不许乱加人。").use_t2i(False)
            return

        if user_id in room.members:
            yield event.plain_result("你已经在车上了，别重复挤。").use_t2i(False)
            return

        capacity_limit = self._room_capacity_limit(room)
        if len(room.members) >= capacity_limit:
            if self._find_script(room.script_name):
                yield event.plain_result(f"这桌已经到当前剧本人数上限 {capacity_limit} 人了。").use_t2i(False)
                return
            yield event.plain_result(f"酒馆已经满 {capacity_limit} 人了，来晚了。").use_t2i(False)
            return

        room.add_member(user_id, user_name, capacity_limit)
        self._touch_room(room)
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] member joined: {user_name}")

        count = len(room.members)
        script = self._find_script(room.script_name)
        if script:
            min_players = _safe_int(script.get("min_players"), 1)
            max_players = _safe_int(script.get("max_players"), capacity_limit)
            if count < min_players:
                progress_text = f"还差 {min_players - count} 人才能开局。"
            elif count >= max_players:
                progress_text = f"已到当前剧本人数上限 {max_players} 人，房主可以 {self._command_text('开始酒馆')}。"
            else:
                progress_text = f"已满足 {min_players}-{max_players} 人开局，房主可以 {self._command_text('开始酒馆')}。"
        else:
            progress_text = f"等待房主 {self._command_text('选择剧本 剧本名')}。"
        self._sync_room_state(
            room,
            self._public_event_payload(room, "member_joined", "成员加入", f"{user_name} 已加入，当前 {count}/{capacity_limit}。"),
        )
        msg_lines = [
            f"{user_name} 已加入，当前 {count}/{capacity_limit}",
            progress_text,
        ]
        joined = "\n".join(msg_lines)
        yield event.plain_result(f"{joined}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("退出酒馆")
    async def leave_tavern(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "退出酒馆"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("都没开酒馆，你退个空气。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        user_id = self._user_id(event)
        user_name = self._user_name(event)

        ok, message = self._require_not_started(room, "已经开局了，暂时不让中途退场。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        if user_id not in room.members:
            yield event.plain_result("你本来就不在里面。").use_t2i(False)
            return

        if user_id == room.owner_id:
            del self.rooms[group_id]
            saved = self._save_rooms()
            logger.info(f"TavernLobby[{group_id}] room closed because owner left")
            self._close_web_room(group_id)
            yield event.plain_result(f"发起者退场了，酒馆已解散。{self._save_warning(saved)}").use_t2i(False)
            return

        room.remove_member(user_id)
        self._touch_room(room)
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] member left: {user_name}")
        self._sync_room_state(
            room,
            self._public_event_payload(room, "member_left", "成员退出", f"{user_name} 已退出，当前 {len(room.members)}/{self._room_capacity_limit(room)}。"),
        )
        lines = [f"{user_name} 已退出，当前 {len(room.members)}/{self._room_capacity_limit(room)}"]
        msg = "\n".join(lines)
        yield event.plain_result(f"{msg}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("\u5f00\u59cb\u9152\u9986")
    async def begin_tavern(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "开始酒馆"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        ok, message = self._require_owner(room, self._user_id(event), "只有发起者能开始，别急着抢按钮。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        if room.started:
            yield event.plain_result("这桌已经开始了。").use_t2i(False)
            return

        if not room.script_name:
            default_script = SCRIPT_LIBRARY[0] if SCRIPT_LIBRARY else None
            if not default_script:
                yield event.plain_result("\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u5267\u672c\uff0c\u5148\u68c0\u67e5\u5267\u672c\u914d\u7f6e\u3002").use_t2i(False)
                return
            room.script_name = default_script["name"]
            self._touch_room(room)
            logger.info(f"TavernLobby[{group_id}] default script auto-selected: {room.script_name}")

        script_ok, script_msg = self._script_requirement_ok(room)
        if not script_ok:
            yield event.plain_result(script_msg).use_t2i(False)
            return

        room.started = True
        room.locked = True
        self._assign_roles(room)
        self._touch_room(room)
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] game started with {len(room.members)} members")
        self._sync_room_state(
            room,
            self._public_event_payload(
                room,
                "game_started",
                "酒馆已开始",
                f"当前阶段：{room.current_phase_name()}，当前行动者：{room.current_turn_user_name() or '未定'}。",
            ),
        )

        lines = [
            f"酒馆已开始：{room.script_name}",
            f"当前阶段：{room.current_phase_name()}",
            f"当前行动者：{room.current_turn_user_name() or '未定'}",
            f"玩家可用 {self._command_text('我的身份')} 查看身份。",
        ]
        msg = "\n".join(lines)
        yield event.plain_result(f"{msg}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("\u5f00\u59cb\u6e38\u620f")
    async def begin_game_alias(self, event: AstrMessageEvent):
        async for result in self.begin_tavern(event):
            yield result

    @filter.command("我的身份")
    async def my_role(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "我的身份"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        if not room.started or not room.roles_sent:
            yield event.plain_result("还没开局，发什么身份。").use_t2i(False)
            return

        user_id = self._user_id(event)
        if user_id not in room.members:
            yield event.plain_result("你都不在这桌上。").use_t2i(False)
            return

        role = room.role_map.get(user_id, "\u672a\u77e5\u8eab\u4efd")
        msg = f"\u4f60\u7684\u8eab\u4efd\u662f\uff1a{role}\n\n{self._role_brief_text(room, user_id)}"
        sent = await self._send_private_text(group_id, user_id, msg)
        if sent:
            yield event.plain_result(f"{self._user_name(event)} \u8eab\u4efd\u5df2\u79c1\u53d1\uff0c\u8bf7\u67e5\u6536\u3002").use_t2i(False)
        else:
            yield event.plain_result("\u8eab\u4efd\u79c1\u53d1\u5931\u8d25\uff0c\u53ef\u80fd\u672a\u52a0\u597d\u53cb\u6216\u5e73\u53f0\u7981\u6b62\u4e34\u65f6\u4f1a\u8bdd\u3002\u4e3a\u907f\u514d\u6cc4\u9732\u8eab\u4efd\uff0c\u8fd9\u91cc\u4e0d\u516c\u5f00\u53d1\u9001\u3002").use_t2i(False)

    @filter.command("当前回合")
    async def current_turn(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "当前回合"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        ok, message = self._require_started(room, "还没开局呢。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        lines = [
            f"当前阶段：{room.current_phase_name()}",
            f"当前行动者：{room.current_turn_user_name() or '未定'}",
            f"事件：{self._phase_event_text(room)}",
        ]
        yield event.plain_result("\n".join(lines)).use_t2i(False)

    @filter.command("下一回合")
    async def next_turn(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "下一回合"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        ok, message = self._require_owner(room, self._user_id(event), "只有发起者能推进回合，别乱翻页。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        ok, message = self._require_started(room, "还没开局，推什么回合。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        if not room.members:
            yield event.plain_result("当前没有成员，没法推进回合。").use_t2i(False)
            return

        room.phase_index += 1
        if room.phase_index >= len(PHASES):
            room.phase_index = 0
            room.turn_index = (room.turn_index + 1) % len(room.members)

        self._touch_room(room)
        saved = self._save_rooms()
        logger.info(
            f"TavernLobby[{group_id}] advanced to {room.current_turn_user_name()} / {room.current_phase_name()}"
        )
        self._sync_room_state(
            room,
            self._public_event_payload(
                room,
                "phase_changed",
                f"进入{room.current_phase_name()}",
                self._phase_event_text(room),
            ),
        )
        lines = [
            f"已进入：{room.current_phase_name()}",
            f"当前行动者：{room.current_turn_user_name() or '未定'}",
            f"事件：{self._phase_event_text(room)}",
        ]
        msg = "\n".join(lines)
        yield event.plain_result(f"{msg}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("结束酒馆")
    async def finish_tavern(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "结束酒馆"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        ok, message = self._require_owner(room, self._user_id(event), "只有发起者能收桌。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        ok, message = self._require_started(room, "这桌还没开始呢，可以直接 /酒馆解散。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        room.reset_round_state()
        self._touch_room(room)
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] game finished and room kept")
        self._sync_room_state(
            room,
            self._public_event_payload(room, "game_finished", "酒馆已结束", "本局已结束，房间与成员保留，可重新开局。"),
        )
        lines = ["本局已结束，房间与成员已保留。", f"可重新使用 {self._command_text('开始酒馆')} 开局。"]
        msg = "\n".join(lines)
        yield event.plain_result(f"{msg}{self._save_warning(saved)}").use_t2i(False)

    @filter.command("酒馆状态")
    async def tavern_status(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "酒馆状态"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return
        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return
        lines = [
            f"当前剧本：{room.script_name or '未定'}",
            f"人数：{len(room.members)}/{self._room_capacity_limit(room)}",
            f"状态：{self._public_status_text(room)}",
        ]
        if room.started:
            lines.extend([
                f"当前阶段：{room.current_phase_name()}",
                f"当前行动者：{room.current_turn_user_name() or '未定'}",
            ])
        yield event.plain_result("\n".join(lines)).use_t2i(False)

    @filter.command("酒馆解散")
    async def tavern_close(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "酒馆解散"):
            return

        group_id = self._require_group(event)
        if not group_id or not self._room_exists(group_id):
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        room = self._get_room(group_id)
        if room is None:
            yield event.plain_result("当前没有酒馆房间。").use_t2i(False)
            return

        ok, message = self._require_owner(room, self._user_id(event), "只有发起者能解散，别乱按。")
        if not ok:
            yield event.plain_result(message).use_t2i(False)
            return

        del self.rooms[group_id]
        saved = self._save_rooms()
        logger.info(f"TavernLobby[{group_id}] room dissolved")
        self._close_web_room(group_id)
        yield event.plain_result(f"酒馆已解散。{self._save_warning(saved)}").use_t2i(False)

    @filter.command("酒馆帮助")
    async def tavern_help(self, event: AstrMessageEvent):
        if not await self._prepare_command(event, "酒馆帮助"):
            return

        yield event.plain_result(self._help_text()).use_t2i(False)
