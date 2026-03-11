import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

try:
    from pymongo import MongoClient
    from pymongo.errors import DuplicateKeyError, PyMongoError
except Exception:  # pragma: no cover - optional in local envs without pymongo
    MongoClient = None
    DuplicateKeyError = Exception
    PyMongoError = Exception


class PlayerRepository:
    def __init__(self) -> None:
        self.enabled = False
        self._local_profiles: Dict[str, Dict[str, Any]] = {}
        self.collection = None

        mongo_uri = os.getenv("MONGODB_URI", "").strip()
        db_name = os.getenv("MONGODB_DB", "meta_world")
        collection_name = os.getenv("MONGODB_COLLECTION", "players")

        if not mongo_uri or MongoClient is None:
            print("[PlayerRepository] MongoDB disabled; using in-memory fallback.")
            return

        try:
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
            client.admin.command("ping")
            self.collection = client[db_name][collection_name]
            self.collection.create_index("nickname", unique=True)
            self.enabled = True
            print("[PlayerRepository] MongoDB connected.")
        except Exception as exc:  # pragma: no cover - connection runtime issue
            print(f"[PlayerRepository] MongoDB connection failed ({exc}); fallback enabled.")
            self.enabled = False

    @staticmethod
    def _normalize_profile(raw: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "_id": str(raw.get("_id", "")),
            "nickname": str(raw.get("nickname", "Guest")),
            "hp": int(raw.get("hp", 100)),
            "coin": int(raw.get("coin", 0)),
        }

    def get_or_create(self, nickname: str) -> Dict[str, Any]:
        if self.enabled and self.collection is not None:
            doc = self.collection.find_one({"nickname": nickname})
            if doc is None:
                candidate = {
                    "nickname": nickname,
                    "hp": 100,
                    "coin": 0,
                    "created_at": time.time(),
                    "updated_at": time.time(),
                }
                try:
                    inserted = self.collection.insert_one(candidate)
                    candidate["_id"] = inserted.inserted_id
                    doc = candidate
                except DuplicateKeyError:
                    doc = self.collection.find_one({"nickname": nickname})
                except PyMongoError:
                    doc = None

            if doc is not None:
                return self._normalize_profile(doc)

        key = nickname.lower()
        if key not in self._local_profiles:
            self._local_profiles[key] = {
                "_id": f"local-{uuid.uuid4().hex[:10]}",
                "nickname": nickname,
                "hp": 100,
                "coin": 0,
            }
        return dict(self._local_profiles[key])


class DungeonMonsterRepository:
    def __init__(self) -> None:
        self.enabled = False
        self._local_monsters: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self.collection = None

        mongo_uri = os.getenv("MONGODB_URI", "").strip()
        db_name = os.getenv("MONGODB_DB", "meta_world")
        collection_name = os.getenv("MONGODB_DUNGEON_COLLECTION", "dungeon_monsters")

        if not mongo_uri or MongoClient is None:
            print("[DungeonMonsterRepository] MongoDB disabled; using in-memory fallback.")
            return

        try:
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=3000)
            client.admin.command("ping")
            self.collection = client[db_name][collection_name]
            self.collection.create_index(
                [("dungeon_id", 1), ("monster_id", 1)],
                unique=True,
            )
            self.collection.create_index("dungeon_id")
            self.enabled = True
            print("[DungeonMonsterRepository] MongoDB connected.")
        except Exception as exc:  # pragma: no cover - connection runtime issue
            print(f"[DungeonMonsterRepository] MongoDB connection failed ({exc}); fallback enabled.")
            self.enabled = False

    @staticmethod
    def _normalize_monster(raw: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dungeon_id": str(raw.get("dungeon_id", "default_dungeon")),
            "monster_id": str(raw.get("monster_id", "")),
            "template_id": str(raw.get("template_id", "unknown")),
            "name": str(raw.get("name", "Unknown Monster")),
            "theme": str(raw.get("theme", "cute_side_scroll")),
            "sprite_hint": str(raw.get("sprite_hint", "round")),
            "x": float(raw.get("x", 0)),
            "y": float(raw.get("y", 0)),
            "spawn_x": float(raw.get("spawn_x", raw.get("x", 0))),
            "spawn_y": float(raw.get("spawn_y", raw.get("y", 0))),
            "hp": int(raw.get("hp", 1)),
            "max_hp": int(raw.get("max_hp", raw.get("hp", 1))),
            "level": int(raw.get("level", 1)),
            "state": str(raw.get("state", "idle")),
            "is_boss": bool(raw.get("is_boss", False)),
            "move_range": float(raw.get("move_range", 90)),
            "respawn_delay": float(raw.get("respawn_delay", 8.0)),
            "created_at": float(raw.get("created_at", time.time())),
            "updated_at": float(raw.get("updated_at", time.time())),
            "last_seen_at": float(raw.get("last_seen_at", time.time())),
        }

    def list_by_dungeon(self, dungeon_id: str) -> List[Dict[str, Any]]:
        if self.enabled and self.collection is not None:
            docs = list(self.collection.find({"dungeon_id": dungeon_id}).sort("monster_id", 1))
            if docs:
                return [self._normalize_monster(doc) for doc in docs]

        local_bucket = self._local_monsters.get(dungeon_id, {})
        return [dict(local_bucket[key]) for key in sorted(local_bucket.keys())]

    def seed_dungeon(self, dungeon_id: str, seeds: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        existing = self.list_by_dungeon(dungeon_id)
        if existing:
            return existing

        now_ts = time.time()
        docs = []
        for seed in seeds:
            docs.append(
                {
                    "dungeon_id": dungeon_id,
                    "monster_id": str(seed["monster_id"]),
                    "template_id": str(seed["template_id"]),
                    "name": str(seed["name"]),
                    "theme": str(seed.get("theme", "cute_side_scroll")),
                    "sprite_hint": str(seed.get("sprite_hint", "round")),
                    "x": float(seed["x"]),
                    "y": float(seed["y"]),
                    "spawn_x": float(seed.get("spawn_x", seed["x"])),
                    "spawn_y": float(seed.get("spawn_y", seed["y"])),
                    "hp": int(seed["hp"]),
                    "max_hp": int(seed.get("max_hp", seed["hp"])),
                    "level": int(seed.get("level", 1)),
                    "state": str(seed.get("state", "idle")),
                    "is_boss": bool(seed.get("is_boss", False)),
                    "move_range": float(seed.get("move_range", 90)),
                    "respawn_delay": float(seed.get("respawn_delay", 8.0)),
                    "created_at": now_ts,
                    "updated_at": now_ts,
                    "last_seen_at": now_ts,
                }
            )

        if self.enabled and self.collection is not None:
            try:
                self.collection.insert_many(docs, ordered=False)
            except PyMongoError:
                pass
            return self.list_by_dungeon(dungeon_id)

        bucket = self._local_monsters.setdefault(dungeon_id, {})
        for doc in docs:
            bucket[doc["monster_id"]] = dict(doc)
        return self.list_by_dungeon(dungeon_id)

    def touch_dungeon(self, dungeon_id: str) -> None:
        now_ts = time.time()
        if self.enabled and self.collection is not None:
            try:
                self.collection.update_many(
                    {"dungeon_id": dungeon_id},
                    {"$set": {"last_seen_at": now_ts}},
                )
            except PyMongoError:
                pass
            return

        if dungeon_id not in self._local_monsters:
            return

        for monster in self._local_monsters[dungeon_id].values():
            monster["last_seen_at"] = now_ts


app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
player_repository = PlayerRepository()
dungeon_repository = DungeonMonsterRepository()

WORLD = {
    "width": 2800,
    "height": 1400,
    "spawn": {"x": 1400, "y": 540},
    "portal": {
        "x": 1325,
        "y": 1180,
        "w": 150,
        "h": 140,
        "target": "/dungeon",
    },
}

DUNGEON_WORLD = {
    "width": 2800,
    "height": 1400,
    "spawn": {"x": 420, "y": 520},
    "id": "default_dungeon",
}

DUNGEON_MONSTER_SEEDS: Dict[str, List[Dict[str, Any]]] = {
    "default_dungeon": [
        {
            "monster_id": "mint-slime-001",
            "template_id": "mint_slime",
            "name": "민트 슬라임",
            "theme": "cute_forest",
            "sprite_hint": "slime",
            "x": 560,
            "y": 1320,
            "hp": 36,
            "max_hp": 36,
            "level": 1,
            "move_range": 88,
        },
        {
            "monster_id": "pom-mushroom-001",
            "template_id": "pom_mushroom",
            "name": "폼폼 머쉬룸",
            "theme": "cute_forest",
            "sprite_hint": "mushroom",
            "x": 1010,
            "y": 1320,
            "hp": 45,
            "max_hp": 45,
            "level": 2,
            "move_range": 74,
        },
        {
            "monster_id": "cloud-pupu-001",
            "template_id": "cloud_pupu",
            "name": "구름 푸푸",
            "theme": "dreamy_cloud",
            "sprite_hint": "puff",
            "x": 1500,
            "y": 940,
            "hp": 52,
            "max_hp": 52,
            "level": 3,
            "move_range": 110,
        },
        {
            "monster_id": "honey-sprout-001",
            "template_id": "honey_sprout",
            "name": "허니 스프라우트",
            "theme": "flower_garden",
            "sprite_hint": "sprout",
            "x": 1880,
            "y": 1320,
            "hp": 58,
            "max_hp": 58,
            "level": 3,
            "move_range": 96,
        },
        {
            "monster_id": "acorn-bat-001",
            "template_id": "acorn_bat",
            "name": "도토리 박쥐",
            "theme": "twilight_cute",
            "sprite_hint": "bat",
            "x": 2320,
            "y": 900,
            "hp": 72,
            "max_hp": 72,
            "level": 4,
            "move_range": 132,
        },
    ]
}

players: Dict[str, Dict[str, Any]] = {}
state_lock = threading.Lock()
broadcast_task = None
pending_minigame_invites: Dict[str, Dict[str, Any]] = {}


def clamp_or_recenter(player: Dict[str, Any]) -> None:
    if (
        player["x"] < -260
        or player["x"] > WORLD["width"] + 260
        or player["y"] < -280
        or player["y"] > WORLD["height"] + 360
    ):
        player["x"] = WORLD["spawn"]["x"]
        player["y"] = WORLD["spawn"]["y"]
        player["vx"] = 0.0
        player["vy"] = 0.0


def safe_player_view(player: Dict[str, Any], now_ts: float) -> Dict[str, Any]:
    bubble = player["bubble"] if player["bubble_until"] > now_ts else ""
    bubble_until = player["bubble_until"] if bubble else 0.0
    return {
        "id": player["id"],
        "nickname": player["nickname"],
        "x": player["x"],
        "y": player["y"],
        "vx": player["vx"],
        "vy": player["vy"],
        "direction": player["direction"],
        "bubble": bubble,
        "bubble_until": bubble_until,
    }


def make_state_snapshot() -> Dict[str, Any]:
    now_ts = time.time()
    with state_lock:
        serialized = []
        for player in players.values():
            clamp_or_recenter(player)
            serialized.append(safe_player_view(player, now_ts))

    return {
        "timestamp": now_ts,
        "players": serialized,
    }


def run_broadcast_loop() -> None:
    while True:
        socketio.emit("state_snapshot", make_state_snapshot())
        socketio.sleep(0.05)


def ensure_broadcast_loop_started() -> None:
    global broadcast_task
    if broadcast_task is None:
        broadcast_task = socketio.start_background_task(run_broadcast_loop)


def sanitize_nickname(raw_name: Any) -> str:
    nickname = str(raw_name or "").strip()
    if not nickname:
        nickname = "Guest"
    return nickname[:16]


def sanitize_dungeon_id(raw_dungeon_id: Any) -> str:
    candidate = str(raw_dungeon_id or "").strip().lower()
    if not candidate:
        return "default_dungeon"

    sanitized = "".join(ch for ch in candidate if ch.isalnum() or ch in {"_", "-"})
    return sanitized[:40] or "default_dungeon"


def find_player(sid: str) -> Optional[Dict[str, Any]]:
    return players.get(sid)


def dungeon_seed_for(dungeon_id: str) -> List[Dict[str, Any]]:
    return DUNGEON_MONSTER_SEEDS.get(dungeon_id, DUNGEON_MONSTER_SEEDS["default_dungeon"])


def safe_monster_view(monster: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "monster_id": monster["monster_id"],
        "template_id": monster["template_id"],
        "name": monster["name"],
        "theme": monster["theme"],
        "sprite_hint": monster["sprite_hint"],
        "x": monster["x"],
        "y": monster["y"],
        "spawn_x": monster["spawn_x"],
        "spawn_y": monster["spawn_y"],
        "hp": monster["hp"],
        "max_hp": monster["max_hp"],
        "level": monster["level"],
        "state": monster["state"],
        "is_boss": monster["is_boss"],
        "move_range": monster["move_range"],
        "respawn_delay": monster["respawn_delay"],
        "updated_at": monster["updated_at"],
        "last_seen_at": monster["last_seen_at"],
    }


def make_dungeon_snapshot(dungeon_id: str) -> Dict[str, Any]:
    monsters = dungeon_repository.list_by_dungeon(dungeon_id)
    return {
        "timestamp": time.time(),
        "dungeon_id": dungeon_id,
        "monsters": [safe_monster_view(monster) for monster in monsters],
    }


@app.route("/")
def lobby() -> str:
    return render_template("lobby.html")


@app.route("/dungeon")
def dungeon() -> str:
    return render_template("dungeon.html")


@app.route("/game")
def game() -> str:
    return render_template("game.html")


@socketio.on("join_dungeon")
def on_join_dungeon(data: Dict[str, Any]) -> None:
    dungeon_id = sanitize_dungeon_id((data or {}).get("dungeon_id"))
    dungeon_repository.seed_dungeon(dungeon_id, dungeon_seed_for(dungeon_id))
    dungeon_repository.touch_dungeon(dungeon_id)

    emit(
        "dungeon_joined",
        {
            "dungeon_id": dungeon_id,
            "world": {**DUNGEON_WORLD, "id": dungeon_id},
            "snapshot": make_dungeon_snapshot(dungeon_id),
            "keywords": {
                "spawn_manager": True,
                "wave_timer": "pending",
                "combat_authoritative_server": True,
                "damage_confirm": "pending",
                "death_respawn": "pending",
                "clear_fail_condition": "pending",
                "reward_confirm": "pending",
                "monster_persistence": "server",
            },
        },
    )


@socketio.on("request_dungeon_snapshot")
def on_request_dungeon_snapshot(data: Dict[str, Any]) -> None:
    dungeon_id = sanitize_dungeon_id((data or {}).get("dungeon_id"))
    dungeon_repository.seed_dungeon(dungeon_id, dungeon_seed_for(dungeon_id))
    dungeon_repository.touch_dungeon(dungeon_id)
    emit("dungeon_snapshot", make_dungeon_snapshot(dungeon_id))


@socketio.on("dungeon_action_request")
def on_dungeon_action_request(data: Dict[str, Any]) -> None:
    payload = data or {}
    action_key = str(payload.get("action_key", "")).strip().upper()
    if action_key not in {"KEYZ", "KEYX", "KEYC"}:
        return

    emit(
        "dungeon_action_queued",
        {
            "dungeon_id": sanitize_dungeon_id(payload.get("dungeon_id")),
            "action_key": action_key,
            "status": "placeholder",
            "server_authoritative": True,
            "message": f"{action_key} 입력이 서버 전투 훅에 예약되었습니다.",
        },
    )


@socketio.on("join_lobby")
def on_join_lobby(data: Dict[str, Any]) -> None:
    ensure_broadcast_loop_started()

    nickname = sanitize_nickname((data or {}).get("nickname"))
    profile = player_repository.get_or_create(nickname)

    sid = request.sid
    with state_lock:
        players[sid] = {
            "id": sid,
            "profile_id": profile["_id"],
            "nickname": nickname,
            "hp": int(profile["hp"]),
            "coin": int(profile["coin"]),
            "x": float(WORLD["spawn"]["x"]),
            "y": float(WORLD["spawn"]["y"]),
            "vx": 0.0,
            "vy": 0.0,
            "direction": 1,
            "bubble": "",
            "bubble_until": 0.0,
            "friends": set(),
        }

    snapshot = make_state_snapshot()
    emit(
        "joined",
        {
            "id": sid,
            "world": WORLD,
            "snapshot": snapshot,
            "profile": {
                "_id": profile["_id"],
                "nickname": nickname,
                "hp": int(profile["hp"]),
                "coin": int(profile["coin"]),
            },
        },
    )
    emit(
        "system_notice",
        {"message": f"{nickname} 님이 로비에 입장했습니다."},
        broadcast=True,
        include_self=False,
    )


@socketio.on("player_state")
def on_player_state(data: Dict[str, Any]) -> None:
    sid = request.sid
    payload = data or {}

    with state_lock:
        player = find_player(sid)
        if player is None:
            return

        player["x"] = float(payload.get("x", player["x"]))
        player["y"] = float(payload.get("y", player["y"]))
        player["vx"] = float(payload.get("vx", player["vx"]))
        player["vy"] = float(payload.get("vy", player["vy"]))
        direction = payload.get("direction", player["direction"])
        player["direction"] = -1 if float(direction) < 0 else 1
        clamp_or_recenter(player)


@socketio.on("public_chat")
def on_public_chat(data: Dict[str, Any]) -> None:
    sid = request.sid
    text = str((data or {}).get("text", "")).strip()
    if not text:
        return

    text = text[:120]
    now_ts = time.time()

    with state_lock:
        player = find_player(sid)
        if player is None:
            return

        player["bubble"] = text
        player["bubble_until"] = now_ts + 5.5
        payload = {
            "from_id": sid,
            "nickname": player["nickname"],
            "text": text,
            "x": player["x"],
            "y": player["y"],
            "timestamp": now_ts,
        }

    emit("public_chat", payload, broadcast=True)


@socketio.on("friend_request")
def on_friend_request(data: Dict[str, Any]) -> None:
    sid = request.sid
    target_id = str((data or {}).get("target_id", "")).strip()
    if not target_id or target_id == sid:
        return

    with state_lock:
        sender = find_player(sid)
        target = find_player(target_id)
        if sender is None or target is None:
            return

        sender["friends"].add(target_id)
        target["friends"].add(sid)

        sender_payload = {
            "friend_id": target_id,
            "friend_nickname": target["nickname"],
        }
        target_payload = {
            "friend_id": sid,
            "friend_nickname": sender["nickname"],
        }

    emit("friend_added", sender_payload, room=sid)
    emit("friend_added", target_payload, room=target_id)


@socketio.on("private_message")
def on_private_message(data: Dict[str, Any]) -> None:
    sid = request.sid
    payload = data or {}
    target_id = str(payload.get("target_id", "")).strip()
    text = str(payload.get("text", "")).strip()
    if not target_id or not text:
        return

    text = text[:300]
    now_ts = time.time()
    with state_lock:
        sender = find_player(sid)
        target = find_player(target_id)
        if sender is None or target is None:
            return

        outbound = {
            "from_id": sid,
            "from_nickname": sender["nickname"],
            "target_id": target_id,
            "target_nickname": target["nickname"],
            "text": text,
            "timestamp": now_ts,
        }

    emit("private_message", outbound, room=sid)
    emit("private_message", outbound, room=target_id)


@socketio.on("minigame_invite")
def on_minigame_invite(data: Dict[str, Any]) -> None:
    sid = request.sid
    target_id = str((data or {}).get("target_id", "")).strip()
    if not target_id or target_id == sid:
        return

    with state_lock:
        sender = find_player(sid)
        target = find_player(target_id)
        if sender is None or target is None:
            return

        distance = ((sender["x"] - target["x"]) ** 2 + (sender["y"] - target["y"]) ** 2) ** 0.5
        if distance > 220:
            emit(
                "system_notice",
                {"message": "미니게임 신청은 가까운 플레이어에게만 보낼 수 있습니다."},
                room=sid,
            )
            return

        pending_minigame_invites[target_id] = {
            "from_id": sid,
            "from_nickname": sender["nickname"],
            "created_at": time.time(),
        }

    emit(
        "minigame_invited",
        {
            "from_id": sid,
            "from_nickname": sender["nickname"],
        },
        room=target_id,
    )
    emit(
        "system_notice",
        {"message": f"{target['nickname']} 님에게 미니게임 신청을 보냈습니다."},
        room=sid,
    )


@socketio.on("minigame_invite_response")
def on_minigame_invite_response(data: Dict[str, Any]) -> None:
    sid = request.sid
    requester_id = str((data or {}).get("from_id", "")).strip()
    accepted = bool((data or {}).get("accepted", False))

    with state_lock:
        invitation = pending_minigame_invites.get(sid)
        if invitation is None or invitation.get("from_id") != requester_id:
            return

        requester = find_player(requester_id)
        responder = find_player(sid)
        pending_minigame_invites.pop(sid, None)

        if requester is None or responder is None:
            return

    if not accepted:
        emit(
            "minigame_invite_declined",
            {"nickname": responder["nickname"]},
            room=requester_id,
        )
        return

    session_id = uuid.uuid4().hex[:10]
    payload = {
        "session_id": session_id,
        "players": [
            {"id": requester_id, "nickname": requester["nickname"]},
            {"id": sid, "nickname": responder["nickname"]},
        ],
    }
    emit("minigame_start", payload, room=requester_id)
    emit("minigame_start", payload, room=sid)


@socketio.on("disconnect")
def on_disconnect() -> None:
    sid = request.sid
    with state_lock:
        leaving = players.pop(sid, None)
        pending_minigame_invites.pop(sid, None)

        remove_keys = [
            target_id
            for target_id, invite in pending_minigame_invites.items()
            if invite.get("from_id") == sid
        ]
        for target_id in remove_keys:
            pending_minigame_invites.pop(target_id, None)

    if leaving is None:
        return

    emit("player_left", {"id": sid}, broadcast=True)
    emit(
        "system_notice",
        {"message": f"{leaving['nickname']} 님이 퇴장했습니다."},
        broadcast=True,
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    socketio.run(app, host="0.0.0.0", port=port)
