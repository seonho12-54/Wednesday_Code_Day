(() => {
  const canvas = document.getElementById("dungeon-canvas");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const nameEl = document.getElementById("dungeon-name");
  const hpEl = document.getElementById("dungeon-hp");
  const coinEl = document.getElementById("dungeon-coin");
  const feedEl = document.getElementById("dungeon-feed");
  const statusEl = document.getElementById("dungeon-status");
  const monsterListEl = document.getElementById("dungeon-monster-list");

  const socket = typeof window.io === "function" ? window.io() : null;
  const params = new URLSearchParams(window.location.search);
  const dungeonId = (params.get("dungeon") || "default_dungeon").trim().toLowerCase() || "default_dungeon";

  let storedProfile = { _id: "guest", nickname: "Guest", hp: 100, coin: 0 };
  try {
    const profileRaw = sessionStorage.getItem("player_profile");
    if (profileRaw) {
      storedProfile = { ...storedProfile, ...JSON.parse(profileRaw) };
    }
  } catch (error) {
    console.warn("Failed to load player profile for dungeon view.", error);
  }

  const profile = {
    _id: String(storedProfile._id || "guest"),
    nickname: String(storedProfile.nickname || "Guest"),
    hp: Number(storedProfile.hp || 100),
    coin: Number(storedProfile.coin || 0),
  };

  nameEl.textContent = profile.nickname;
  hpEl.textContent = String(profile.hp);
  coinEl.textContent = String(profile.coin);

  const FIXED_DT = 1 / 60;
  const GRAVITY = 1920;
  const MOVE_ACCEL = 2700;
  const MAX_RUN_SPEED = 395;
  const GROUND_FRICTION = 13;
  const AIR_FRICTION = 2.35;

  const JUMP_IMPULSE = -830;
  const JUMP_HOLD_FORCE = 2100;
  const JUMP_HOLD_TIME = 0.18;
  const JUMP_CUT_MULTIPLIER = 0.48;

  const world = {
    width: 2800,
    height: 1400,
    spawn: { x: 420, y: 520 },
    id: dungeonId,
  };

  let platforms = [];

  function rebuildPlatforms() {
    platforms = [
      { x: 0, y: world.height - 80, w: world.width, h: 80 },
      { x: -84, y: 0, w: 84, h: world.height },
      { x: world.width, y: 0, w: 84, h: world.height },
      { x: 200, y: world.height - 280, w: 300, h: 24 },
      { x: 620, y: world.height - 390, w: 260, h: 22 },
      { x: 980, y: world.height - 320, w: 260, h: 24 },
      { x: 1340, y: world.height - 460, w: 280, h: 22 },
      { x: 1760, y: world.height - 360, w: 260, h: 22 },
      { x: 2140, y: world.height - 460, w: 280, h: 22 },
      { x: 980, y: world.height - 640, w: 560, h: 20 },
    ];
  }

  rebuildPlatforms();

  const player = {
    x: world.spawn.x,
    y: world.spawn.y,
    vx: 0,
    vy: 0,
    width: 52,
    height: 68,
    onGround: false,
    direction: 1,
  };

  const camera = { x: 0, y: 0 };
  const keys = {
    left: false,
    right: false,
    jumpHeld: false,
  };

  const monsters = [];
  const actionLog = [];

  let dungeonKeywords = null;
  let connectionState = socket ? "connecting" : "offline";
  let snapshotTimer = null;
  let jumpQueued = false;
  let jumpHolding = false;
  let jumpHoldTimer = 0;
  let jumpCutQueued = false;
  let accum = 0;
  let prevTs = performance.now();

  function addFeed(text, kind = "system") {
    if (!feedEl) {
      return;
    }

    const line = document.createElement("div");
    line.className = `feed-line ${kind}`;
    line.textContent = text;
    feedEl.appendChild(line);

    while (feedEl.children.length > 70) {
      feedEl.removeChild(feedEl.firstChild);
    }
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function playerRect(px = player.x, py = player.y) {
    const hw = player.width * 0.5;
    const hh = player.height * 0.5;
    return {
      left: px - hw,
      right: px + hw,
      top: py - hh,
      bottom: py + hh,
      hw,
      hh,
    };
  }

  function syncWorld(nextWorld) {
    if (!nextWorld) {
      return;
    }

    world.width = Number(nextWorld.width || world.width);
    world.height = Number(nextWorld.height || world.height);
    world.spawn = {
      x: Number((nextWorld.spawn || {}).x || world.spawn.x),
      y: Number((nextWorld.spawn || {}).y || world.spawn.y),
    };
    world.id = String(nextWorld.id || world.id || dungeonId);
    rebuildPlatforms();
  }

  function monsterPalette(templateId) {
    switch (templateId) {
      case "mint_slime":
        return { primary: "#79e2b3", secondary: "#c8ffe5", accent: "#2c8a67" };
      case "pom_mushroom":
        return { primary: "#f48ca9", secondary: "#ffe5ee", accent: "#9a3d58" };
      case "cloud_pupu":
        return { primary: "#c8d8ff", secondary: "#ffffff", accent: "#6d81c8" };
      case "honey_sprout":
        return { primary: "#ffd764", secondary: "#fff0b9", accent: "#a67d17" };
      case "acorn_bat":
        return { primary: "#9f88d8", secondary: "#e5dcff", accent: "#564182" };
      default:
        return { primary: "#b9d0ea", secondary: "#f4f8ff", accent: "#5d738d" };
    }
  }

  function applyMonsterSnapshot(snapshot) {
    monsters.length = 0;
    const incoming = Array.isArray((snapshot || {}).monsters) ? snapshot.monsters : [];
    incoming.forEach((monster) => {
      monsters.push({
        monster_id: String(monster.monster_id || ""),
        template_id: String(monster.template_id || "unknown"),
        name: String(monster.name || "Unknown Monster"),
        theme: String(monster.theme || "cute_side_scroll"),
        sprite_hint: String(monster.sprite_hint || "round"),
        x: Number(monster.x || 0),
        y: Number(monster.y || 0),
        spawn_x: Number(monster.spawn_x || monster.x || 0),
        spawn_y: Number(monster.spawn_y || monster.y || 0),
        hp: Number(monster.hp || 0),
        max_hp: Number(monster.max_hp || monster.hp || 1),
        level: Number(monster.level || 1),
        state: String(monster.state || "idle"),
        move_range: Number(monster.move_range || 0),
        respawn_delay: Number(monster.respawn_delay || 0),
      });
    });
    renderStatus();
    renderMonsterList();
  }

  function makeCard(title, lines, className) {
    const card = document.createElement("div");
    card.className = className;

    const heading = document.createElement("strong");
    heading.textContent = title;
    card.appendChild(heading);

    lines.forEach((text) => {
      const line = document.createElement("span");
      line.textContent = text;
      card.appendChild(line);
    });

    return card;
  }

  function renderStatus() {
    if (!statusEl) {
      return;
    }

    statusEl.innerHTML = "";

    const cards = [
      makeCard("던전 ID", [world.id], "status-pill"),
      makeCard("연결 상태", [connectionState, `${monsters.length} monsters loaded`], "status-pill"),
      makeCard(
        "영속화",
        [
          "몬스터 상태 저장: server",
          dungeonKeywords?.combat_authoritative_server ? "전투 확정: server authoritative" : "전투 확정: pending",
        ],
        "status-pill",
      ),
      makeCard(
        "다음 구현 키워드",
        [
          "spawn_manager / wave_timer",
          "damage_confirm / death_respawn",
          "clear_fail_condition / reward_confirm",
        ],
        "status-pill",
      ),
    ];

    cards.forEach((card) => {
      statusEl.appendChild(card);
    });
  }

  function renderMonsterList() {
    if (!monsterListEl) {
      return;
    }

    monsterListEl.innerHTML = "";

    monsters.forEach((monster) => {
      const palette = monsterPalette(monster.template_id);
      const card = document.createElement("div");
      card.className = "monster-card";

      const swatch = document.createElement("div");
      swatch.className = "monster-swatch";
      swatch.style.background = palette.primary;

      const body = document.createElement("div");
      body.appendChild(
        makeCard(
          monster.name,
          [
            `template: ${monster.template_id}`,
            `level ${monster.level} / hp ${monster.hp}`,
            `theme: ${monster.theme}`,
          ],
          "",
        ),
      );

      card.appendChild(swatch);
      card.appendChild(body);
      monsterListEl.appendChild(card);
    });
  }

  function drawMonster(monster, index, now) {
    const palette = monsterPalette(monster.template_id);
    const bounce = Math.sin(now * 0.0035 + index * 1.17) * 3.2;
    const baseX = monster.x;
    const baseY = monster.y + bounce;

    ctx.save();
    ctx.translate(baseX, baseY);

    ctx.fillStyle = "#00000014";
    ctx.beginPath();
    ctx.ellipse(0, 6, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (monster.sprite_hint === "slime") {
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.quadraticCurveTo(-28, -40, 0, -46);
      ctx.quadraticCurveTo(28, -40, 24, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.secondary;
      ctx.beginPath();
      ctx.ellipse(0, -18, 14, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.sprite_hint === "mushroom") {
      ctx.fillStyle = palette.secondary;
      ctx.fillRect(-10, -28, 20, 28);
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.arc(0, -30, 28, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffffcc";
      ctx.beginPath();
      ctx.arc(-8, -35, 5, 0, Math.PI * 2);
      ctx.arc(9, -38, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.sprite_hint === "puff") {
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.arc(-14, -20, 16, 0, Math.PI * 2);
      ctx.arc(2, -26, 18, 0, Math.PI * 2);
      ctx.arc(19, -18, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.secondary;
      ctx.beginPath();
      ctx.arc(0, -22, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.sprite_hint === "sprout") {
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.ellipse(0, -18, 22, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#74bf61";
      ctx.beginPath();
      ctx.ellipse(-8, -46, 8, 14, -0.6, 0, Math.PI * 2);
      ctx.ellipse(10, -46, 8, 14, 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (monster.sprite_hint === "bat") {
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.moveTo(-26, -16);
      ctx.quadraticCurveTo(-42, -34, -16, -30);
      ctx.quadraticCurveTo(-2, -24, 0, -12);
      ctx.quadraticCurveTo(2, -24, 16, -30);
      ctx.quadraticCurveTo(42, -34, 26, -16);
      ctx.quadraticCurveTo(16, 2, 0, 0);
      ctx.quadraticCurveTo(-16, 2, -26, -16);
      ctx.fill();
      ctx.fillStyle = palette.secondary;
      ctx.beginPath();
      ctx.arc(0, -14, 10, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = palette.primary;
      ctx.beginPath();
      ctx.ellipse(0, -18, 24, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(-7, -20, 2.6, 0, Math.PI * 2);
    ctx.arc(7, -20, 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.accent;
    ctx.fillRect(-24, -62, 48, 6);
    ctx.fillStyle = "#fff3";
    ctx.fillRect(-24, -62, 48, 6);
    ctx.fillStyle = "#7cf0a1";
    ctx.fillRect(-24, -62, 48 * clamp(monster.hp / Math.max(1, monster.max_hp), 0, 1), 6);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "13px Pretendard, Noto Sans KR, sans-serif";
    ctx.fillText(monster.name, 0, -72);
    ctx.restore();
  }

  function queueAction(key) {
    actionLog.push({ key, at: Date.now() });
    while (actionLog.length > 20) {
      actionLog.shift();
    }

    addFeed(`공격/스킬 훅 입력 감지: ${key}`);

    if (socket) {
      socket.emit("dungeon_action_request", {
        dungeon_id: world.id,
        action_key: key,
        player: {
          x: Math.round(player.x),
          y: Math.round(player.y),
          direction: player.direction,
        },
      });
    }
  }

  function stepMovement(dt) {
    const intent = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.vx += intent * MOVE_ACCEL * dt;

    if (!intent) {
      const friction = player.onGround ? GROUND_FRICTION : AIR_FRICTION;
      player.vx *= Math.max(0, 1 - friction * dt);
      if (Math.abs(player.vx) < 2.6) {
        player.vx = 0;
      }
    }

    player.vx = clamp(player.vx, -MAX_RUN_SPEED, MAX_RUN_SPEED);
    if (Math.abs(player.vx) > 1) {
      player.direction = player.vx < 0 ? -1 : 1;
    }

    if (jumpQueued && player.onGround) {
      player.vy = JUMP_IMPULSE;
      player.onGround = false;
      jumpHolding = true;
      jumpHoldTimer = 0;
    }
    jumpQueued = false;

    if (jumpHolding && keys.jumpHeld && jumpHoldTimer < JUMP_HOLD_TIME && player.vy < 0) {
      player.vy -= JUMP_HOLD_FORCE * dt;
      jumpHoldTimer += dt;
    }

    if ((!keys.jumpHeld || jumpHoldTimer >= JUMP_HOLD_TIME) && jumpHolding) {
      jumpHolding = false;
    }

    if (jumpCutQueued && player.vy < 0) {
      player.vy *= JUMP_CUT_MULTIPLIER;
      jumpCutQueued = false;
      jumpHolding = false;
    }

    player.vy += GRAVITY * dt;
    player.vy = clamp(player.vy, -1200, 1500);

    player.x += player.vx * dt;
    let rect = playerRect(player.x, player.y);
    for (const plat of platforms) {
      const platRect = {
        left: plat.x,
        right: plat.x + plat.w,
        top: plat.y,
        bottom: plat.y + plat.h,
      };
      if (!intersects(rect, platRect)) {
        continue;
      }

      if (player.vx > 0) {
        player.x = platRect.left - rect.hw;
      } else if (player.vx < 0) {
        player.x = platRect.right + rect.hw;
      }
      player.vx = 0;
      rect = playerRect(player.x, player.y);
    }

    player.y += player.vy * dt;
    rect = playerRect(player.x, player.y);
    player.onGround = false;
    for (const plat of platforms) {
      const platRect = {
        left: plat.x,
        right: plat.x + plat.w,
        top: plat.y,
        bottom: plat.y + plat.h,
      };
      if (!intersects(rect, platRect)) {
        continue;
      }

      if (player.vy > 0) {
        player.y = platRect.top - rect.hh;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = platRect.bottom + rect.hh;
        player.vy = 0;
      }
      rect = playerRect(player.x, player.y);
    }

    player.x = clamp(player.x, rect.hw, world.width - rect.hw);
    if (player.y < rect.hh) {
      player.y = rect.hh;
      player.vy = 0;
    }

    if (player.y > world.height + 220) {
      player.x = world.spawn.x;
      player.y = world.spawn.y;
      player.vx = 0;
      player.vy = 0;
      addFeed("안전 복귀: 시작 위치로 이동되었습니다.");
    }

    camera.x = clamp(player.x - canvas.width * 0.5, 0, Math.max(0, world.width - canvas.width));
    camera.y = clamp(player.y - canvas.height * 0.5, 0, Math.max(0, world.height - canvas.height));
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#1e2847");
    gradient.addColorStop(1, "#334f6f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#97b2ce2e";
    for (let i = 0; i < 12; i += 1) {
      const x = ((i * 220) - camera.x * 0.32) % (canvas.width + 260) - 120;
      const y = 120 + (i % 4) * 90;
      ctx.beginPath();
      ctx.arc(x, y, 56, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlatforms() {
    platforms.forEach((plat) => {
      ctx.fillStyle = "#4d4236";
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.fillStyle = "#8b6950";
      ctx.fillRect(plat.x, plat.y, plat.w, Math.min(10, plat.h));
    });
  }

  function drawPlayer() {
    const x = player.x - player.width * 0.5;
    const y = player.y - player.height * 0.5;

    ctx.fillStyle = "#2a75d5";
    ctx.fillRect(x, y, player.width, player.height);

    ctx.fillStyle = "#f7ddbc";
    ctx.fillRect(x + 12, y + 10, player.width - 24, 22);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "14px Pretendard, Noto Sans KR, sans-serif";
    ctx.fillText(profile.nickname, player.x, y - 10);
  }

  function drawHUD() {
    ctx.fillStyle = "#0000008c";
    ctx.fillRect(12, 12, 520, 106);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.font = "15px Pretendard, Noto Sans KR, sans-serif";
    ctx.fillText("Dungeon Server Staging", 24, 38);
    ctx.fillText(`Dungeon: ${world.id}`, 24, 61);
    ctx.fillText(`이동: ← → | 점프: Space | 공격 훅: Z / X / C`, 24, 84);
    ctx.fillText(`몬스터 저장: server persistent (${monsters.length} loaded)`, 24, 107);
  }

  function render(now) {
    drawBackground();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawPlatforms();
    monsters.forEach((monster, index) => {
      drawMonster(monster, index, now);
    });
    drawPlayer();
    ctx.restore();

    drawHUD();
  }

  function step(dt) {
    stepMovement(dt);
  }

  function gameLoop(now) {
    const delta = Math.min(0.05, (now - prevTs) / 1000);
    prevTs = now;
    accum += delta;

    while (accum >= FIXED_DT) {
      step(FIXED_DT);
      accum -= FIXED_DT;
    }

    render(now);
    requestAnimationFrame(gameLoop);
  }

  function requestDungeonJoin() {
    if (!socket) {
      return;
    }

    socket.emit("join_dungeon", {
      dungeon_id: dungeonId,
      nickname: profile.nickname,
      profile_id: profile._id,
    });
  }

  if (socket) {
    socket.on("connect", () => {
      connectionState = "connected";
      renderStatus();
      addFeed("던전 서버 연결 완료.");
      requestDungeonJoin();

      if (snapshotTimer) {
        window.clearInterval(snapshotTimer);
      }
      snapshotTimer = window.setInterval(() => {
        socket.emit("request_dungeon_snapshot", { dungeon_id: dungeonId });
      }, 4000);
    });

    socket.on("disconnect", () => {
      connectionState = "disconnected";
      renderStatus();
      addFeed("던전 서버 연결이 끊겼습니다.");

      if (snapshotTimer) {
        window.clearInterval(snapshotTimer);
        snapshotTimer = null;
      }
    });

    socket.on("dungeon_joined", (payload) => {
      syncWorld(payload.world || null);
      dungeonKeywords = payload.keywords || null;
      applyMonsterSnapshot(payload.snapshot || {});
      player.x = world.spawn.x;
      player.y = world.spawn.y;
      addFeed(`서버 몹 스냅샷 로드 완료: ${monsters.length}마리.`);
    });

    socket.on("dungeon_snapshot", (snapshot) => {
      applyMonsterSnapshot(snapshot || {});
      addFeed(`던전 스냅샷 갱신: ${monsters.length}마리.`);
    });

    socket.on("dungeon_action_queued", (payload) => {
      addFeed(payload?.message || "공격 훅이 서버에 예약되었습니다.");
    });
  } else {
    addFeed("Socket.IO를 찾지 못해 던전 서버 연동이 비활성화되었습니다.");
  }

  addFeed("던전 기반 페이지에 진입했습니다.");
  addFeed("몹은 서버에 저장되며, 던전 재입장 시 같은 스냅샷을 다시 받습니다.");
  addFeed("전투/보상은 아직 미구현이며 Z/X/C는 서버 전투 이벤트 훅으로만 연결됩니다.");
  renderStatus();

  document.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }

    if (event.key === "ArrowLeft") {
      keys.left = true;
    } else if (event.key === "ArrowRight") {
      keys.right = true;
    } else if (event.key === " " || event.code === "Space") {
      keys.jumpHeld = true;
      jumpQueued = true;
      event.preventDefault();
    } else if (event.code === "KeyZ" || event.code === "KeyX" || event.code === "KeyC") {
      queueAction(event.code);
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft") {
      keys.left = false;
    } else if (event.key === "ArrowRight") {
      keys.right = false;
    } else if (event.key === " " || event.code === "Space") {
      keys.jumpHeld = false;
      if (player.vy < -80) {
        jumpCutQueued = true;
      }
    }
  });

  window.render_game_to_text = () =>
    JSON.stringify({
      mode: "dungeon-server-staging",
      coordinate_system: "origin=(top-left), +x=right, +y=down",
      dungeon: {
        id: world.id,
        width: world.width,
        height: world.height,
        persistence: "server",
      },
      player: {
        profile_id: profile._id,
        nickname: profile.nickname,
        hp: Number(profile.hp),
        coin: Number(profile.coin),
        x: Math.round(player.x),
        y: Math.round(player.y),
        vx: Math.round(player.vx),
        vy: Math.round(player.vy),
      },
      hooks: {
        combat_keys: ["KeyZ", "KeyX", "KeyC"],
        action_log: actionLog.slice(-6),
        keywords: dungeonKeywords,
      },
      monsters: monsters.map((monster) => ({
        monster_id: monster.monster_id,
        template_id: monster.template_id,
        name: monster.name,
        hp: monster.hp,
        x: Math.round(monster.x),
        y: Math.round(monster.y),
      })),
    });

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      step(FIXED_DT);
    }
    render(performance.now());
  };

  requestAnimationFrame(gameLoop);
})();
