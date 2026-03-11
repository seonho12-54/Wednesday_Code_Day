(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const startScreen = document.getElementById("start-screen");
  const joinForm = document.getElementById("join-form");
  const nicknameInput = document.getElementById("nickname-input");
  const myNameEl = document.getElementById("my-name");
  const myHpEl = document.getElementById("my-hp");
  const myCoinEl = document.getElementById("my-coin");

  const chatInputWrap = document.getElementById("chat-input-wrap");
  const chatInput = document.getElementById("chat-input");
  const lobbyFeed = document.getElementById("lobby-feed");

  const privateChatEl = document.getElementById("private-chat");
  const pmTitle = document.getElementById("pm-title");
  const pmFeed = document.getElementById("pm-feed");
  const pmInput = document.getElementById("pm-input");
  const pmSendBtn = document.getElementById("pm-send");

  const contextMenu = document.getElementById("context-menu");
  const friendBtn = document.getElementById("friend-btn");
  const pmBtn = document.getElementById("pm-btn");
  const minigameBtn = document.getElementById("minigame-btn");

  const inviteModal = document.getElementById("invite-modal");
  const inviteText = document.getElementById("invite-text");
  const inviteAcceptBtn = document.getElementById("invite-accept");
  const inviteDeclineBtn = document.getElementById("invite-decline");

  const socket = io();

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

  const PROXIMITY_RADIUS = 340;
  const PORTAL_INTERACT_RADIUS = 120;

  let world = {
    width: 2800,
    height: 1400,
    spawn: { x: 1400, y: 540 },
    portal: { x: 1325, y: 1180, w: 150, h: 140, target: "/dungeon" },
  };
  let platforms = buildPlatforms(world);
  let decorations = buildDecorations(world);

  let myId = null;
  let joined = false;
  let joinRequested = false;
  let inPortalRange = false;
  let contextTargetId = null;

  const player = {
    id: null,
    profileId: null,
    nickname: "",
    hp: 100,
    coin: 0,
    x: world.spawn.x,
    y: world.spawn.y,
    vx: 0,
    vy: 0,
    width: 52,
    height: 68,
    onGround: false,
    direction: 1,
    bubble: "",
    bubbleUntil: 0,
  };

  const remotePlayers = new Map();
  const privateThreads = new Map();
  const pendingInvite = { fromId: null, fromName: "" };

  let activePrivateTargetId = null;

  const keys = {
    left: false,
    right: false,
    jumpHeld: false,
    up: false,
  };

  let jumpQueued = false;
  let jumpHolding = false;
  let jumpHoldTimer = 0;
  let jumpCutQueued = false;
  let interactQueued = false;

  let accum = 0;
  let prevTs = performance.now();
  let stateSendTimer = 0;

  const camera = { x: 0, y: 0 };

  function buildPlatforms(currentWorld) {
    const w = currentWorld.width;
    const h = currentWorld.height;
    const border = 84;

    return [
      { x: 0, y: h - 80, w, h: 80 },
      { x: -border, y: 0, w: border, h },
      { x: w, y: 0, w: border, h },
      { x: 0, y: -border, w, h: border },
      { x: 220, y: h - 280, w: 360, h: 26 },
      { x: 680, y: h - 380, w: 280, h: 24 },
      { x: 1040, y: h - 260, w: 340, h: 24 },
      { x: 1500, y: h - 390, w: 360, h: 24 },
      { x: 1940, y: h - 280, w: 300, h: 24 },
      { x: 2290, y: h - 450, w: 260, h: 24 },
      { x: 1110, y: h - 540, w: 560, h: 22 },
      { x: 920, y: h - 730, w: 240, h: 20 },
      { x: 1660, y: h - 730, w: 240, h: 20 },
      { x: 1320, y: h - 190, w: 160, h: 18 },
    ];
  }

  function buildDecorations(currentWorld) {
    const h = currentWorld.height;
    return {
      trees: [
        { x: 360, y: h - 120, s: 1.05 },
        { x: 720, y: h - 124, s: 0.9 },
        { x: 1860, y: h - 122, s: 1.1 },
        { x: 2360, y: h - 118, s: 0.95 },
      ],
      banners: [
        { x: 1080, y: h - 565, w: 120, text: "MINI" },
        { x: 1600, y: h - 565, w: 120, text: "DUNGEON" },
      ],
      statues: [
        { x: 1420, y: h - 148, w: 44, h: 68 },
        { x: 1370, y: h - 148, w: 34, h: 54 },
      ],
    };
  }

  function savePlayerProfile() {
    const payload = {
      _id: player.profileId,
      nickname: player.nickname,
      hp: player.hp,
      coin: player.coin,
    };
    sessionStorage.setItem("player_profile", JSON.stringify(payload));
  }

  function parseProfileForStorage(payload) {
    if (!payload) {
      return;
    }
    player.profileId = payload._id || player.profileId;
    player.hp = Number.isFinite(payload.hp) ? payload.hp : player.hp;
    player.coin = Number.isFinite(payload.coin) ? payload.coin : player.coin;

    myHpEl.textContent = String(player.hp);
    myCoinEl.textContent = String(player.coin);
    savePlayerProfile();
  }

  function getStoredNickname() {
    const raw = sessionStorage.getItem("player_profile");
    if (!raw) {
      return "";
    }
    try {
      const parsed = JSON.parse(raw);
      const nickname = String(parsed?.nickname || "").trim();
      return nickname.slice(0, 16);
    } catch {
      return "";
    }
  }

  function requestJoinLobby(rawNickname) {
    if (joined || joinRequested) {
      return;
    }
    const nickname = String(rawNickname || "").trim().slice(0, 16);
    if (!nickname) {
      return;
    }
    joinRequested = true;
    socket.emit("join_lobby", { nickname });
  }

  function addFeedLine(text, type = "normal") {
    const line = document.createElement("div");
    line.className = `feed-line ${type}`;
    line.textContent = text;
    lobbyFeed.appendChild(line);

    while (lobbyFeed.children.length > 90) {
      lobbyFeed.removeChild(lobbyFeed.firstChild);
    }
    lobbyFeed.scrollTop = lobbyFeed.scrollHeight;
  }

  function addPrivateLine(targetId, linePayload) {
    if (!privateThreads.has(targetId)) {
      privateThreads.set(targetId, { nickname: linePayload.partnerNickname, messages: [] });
    }

    const thread = privateThreads.get(targetId);
    if (linePayload.partnerNickname) {
      thread.nickname = linePayload.partnerNickname;
    }
    thread.messages.push(linePayload);

    while (thread.messages.length > 100) {
      thread.messages.shift();
    }

    if (activePrivateTargetId === targetId) {
      renderPrivateChat();
    }
  }

  function renderPrivateChat() {
    if (!activePrivateTargetId || !privateThreads.has(activePrivateTargetId)) {
      privateChatEl.classList.add("hidden");
      return;
    }

    const thread = privateThreads.get(activePrivateTargetId);
    privateChatEl.classList.remove("hidden");
    pmTitle.textContent = `1:1 대화 - ${thread.nickname}`;
    pmFeed.innerHTML = "";

    thread.messages.forEach((msg) => {
      const line = document.createElement("div");
      line.className = "feed-line private";
      line.textContent = `${msg.author}: ${msg.text}`;
      pmFeed.appendChild(line);
    });
    pmFeed.scrollTop = pmFeed.scrollHeight;
  }

  function openPrivateChat(targetId, nickname) {
    if (!privateThreads.has(targetId)) {
      privateThreads.set(targetId, { nickname, messages: [] });
    }
    activePrivateTargetId = targetId;
    renderPrivateChat();
    pmInput.focus();
  }

  function hideContextMenu() {
    contextMenu.classList.add("hidden");
    contextTargetId = null;
  }

  function showContextMenu(targetId, x, y) {
    contextTargetId = targetId;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove("hidden");
  }

  function showInviteModal(fromId, fromName) {
    pendingInvite.fromId = fromId;
    pendingInvite.fromName = fromName;
    inviteText.textContent = `${fromName} 님이 미니게임을 신청했습니다.`;
    inviteModal.classList.remove("hidden");
    inviteModal.classList.add("show");
  }

  function hideInviteModal() {
    pendingInvite.fromId = null;
    pendingInvite.fromName = "";
    inviteModal.classList.remove("show");
    inviteModal.classList.add("hidden");
  }

  function worldFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * canvas.width;
    const sy = ((clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: sx + camera.x,
      y: sy + camera.y,
      sx,
      sy,
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
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

  function portalRect() {
    return {
      left: world.portal.x,
      right: world.portal.x + world.portal.w,
      top: world.portal.y,
      bottom: world.portal.y + world.portal.h,
    };
  }

  function enterDungeonFromPortal() {
    savePlayerProfile();
    window.location.assign("/dungeon");
  }

  function stepMovement(dt) {
    if (!joined) {
      return;
    }

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

    const escaped =
      player.x < -170 ||
      player.x > world.width + 170 ||
      player.y < -250 ||
      player.y > world.height + 280;

    if (escaped || player.y > world.height + 120) {
      player.x = world.spawn.x;
      player.y = world.spawn.y;
      player.vx = 0;
      player.vy = 0;
      addFeedLine("로비 바깥으로 벗어나 중앙으로 복귀했습니다.", "system");
    }

    const pr = portalRect();
    const centerDx = Math.abs(player.x - (pr.left + pr.right) * 0.5);
    const centerDy = Math.abs(player.y - (pr.top + pr.bottom) * 0.5);
    inPortalRange =
      intersects(playerRect(), pr) ||
      (centerDx < PORTAL_INTERACT_RADIUS && centerDy < PORTAL_INTERACT_RADIUS * 1.15);

    if (interactQueued) {
      interactQueued = false;
      if (inPortalRange) {
        addFeedLine("던전으로 이동합니다.", "system");
        enterDungeonFromPortal();
        return;
      }
    }

    camera.x = clamp(player.x - canvas.width * 0.5, 0, world.width - canvas.width);
    camera.y = clamp(player.y - canvas.height * 0.5, 0, world.height - canvas.height);

    stateSendTimer += dt;
    if (stateSendTimer > 0.05) {
      stateSendTimer = 0;
      socket.emit("player_state", {
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        direction: player.direction,
      });
    }
  }

  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "#c8efff");
    grd.addColorStop(0.55, "#8fdac8");
    grd.addColorStop(1, "#6dbb84");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff8f";
    for (let i = 0; i < 11; i += 1) {
      const x = ((i * 190) - camera.x * 0.22) % (canvas.width + 240) - 110;
      const y = 70 + (i % 4) * 42;
      ctx.beginPath();
      ctx.ellipse(x, y, 68, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 9; i += 1) {
      const w = 260;
      const x = ((i * 320) - camera.x * 0.35) % (canvas.width + 340) - 140;
      const y = canvas.height - 185 - (i % 3) * 35;
      ctx.fillStyle = i % 2 ? "#8ac08d" : "#94c59a";
      ctx.beginPath();
      ctx.moveTo(x, canvas.height);
      ctx.lineTo(x + w * 0.5, y);
      ctx.lineTo(x + w, canvas.height);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPlatform(plat) {
    ctx.fillStyle = "#564436";
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.fillStyle = "#75bf70";
    ctx.fillRect(plat.x, plat.y, plat.w, Math.min(11, plat.h));
  }

  function drawPortal() {
    const p = world.portal;
    const centerX = p.x + p.w * 0.5;
    const centerY = p.y + p.h * 0.5;
    const pulse = 1 + Math.sin(performance.now() / 240) * 0.06;

    ctx.fillStyle = "#2f2a58";
    ctx.fillRect(p.x - 8, p.y + 8, p.w + 16, p.h + 14);

    const glow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 80 * pulse);
    glow.addColorStop(0, "#9de0ffef");
    glow.addColorStop(0.45, "#5fb5ffcc");
    glow.addColorStop(1, "#4560c000");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 62 * pulse, 72 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#e4f6ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 54, 64, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "15px Pretendard, Noto Sans KR, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DUNGEON", centerX, p.y - 14);
  }

  function drawDecorations() {
    decorations.trees.forEach((tree) => {
      const trunkW = 16 * tree.s;
      const trunkH = 44 * tree.s;
      ctx.fillStyle = "#6e5038";
      ctx.fillRect(tree.x - trunkW * 0.5, tree.y - trunkH, trunkW, trunkH);

      ctx.fillStyle = "#448d4c";
      ctx.beginPath();
      ctx.arc(tree.x, tree.y - trunkH - 18 * tree.s, 28 * tree.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tree.x - 20 * tree.s, tree.y - trunkH, 22 * tree.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tree.x + 22 * tree.s, tree.y - trunkH + 4 * tree.s, 20 * tree.s, 0, Math.PI * 2);
      ctx.fill();
    });

    decorations.statues.forEach((item) => {
      ctx.fillStyle = "#8f8a84";
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = "#b6afa6";
      ctx.fillRect(item.x + 4, item.y + 5, item.w - 8, item.h - 12);
    });

    decorations.banners.forEach((banner) => {
      ctx.fillStyle = "#472f2f";
      ctx.fillRect(banner.x, banner.y - 40, 8, 48);
      ctx.fillStyle = "#f4d76f";
      ctx.fillRect(banner.x + 8, banner.y - 38, banner.w, 30);
      ctx.fillStyle = "#3a2b1e";
      ctx.font = "bold 14px Pretendard, Noto Sans KR, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(banner.text, banner.x + 8 + banner.w * 0.5, banner.y - 18);
    });
  }

  function drawSpeechBubble(text, x, y) {
    const padding = 8;
    ctx.font = "14px Pretendard, Noto Sans KR, sans-serif";
    const textW = ctx.measureText(text).width;
    const width = textW + padding * 2;
    const height = 28;
    const bx = x - width * 0.5;
    const by = y - 54;

    ctx.fillStyle = "#ffffffea";
    ctx.strokeStyle = "#27304350";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, width, height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 6, by + height);
    ctx.lineTo(x + 6, by + height);
    ctx.lineTo(x, by + height + 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.fillText(text, x, by + 19);
  }

  function drawPlayer(entity, isMine = false) {
    const w = player.width;
    const h = player.height;
    const x = entity.x - w * 0.5;
    const y = entity.y - h * 0.5;

    ctx.fillStyle = isMine ? "#215fb7" : "#c64e4e";
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = "#f9e4c3";
    ctx.fillRect(x + 12, y + 10, w - 24, 22);

    ctx.fillStyle = "#111";
    ctx.font = "14px Pretendard, Noto Sans KR, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(entity.nickname, entity.x, y - 10);

    if (entity.bubble && entity.bubbleUntil > performance.now() / 1000) {
      drawSpeechBubble(entity.bubble, entity.x, y - 2);
    }

    ctx.fillStyle = "#0d1824";
    const eyeOffset = entity.direction < 0 ? -8 : 8;
    ctx.beginPath();
    ctx.arc(entity.x + eyeOffset, y + 24, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWorld() {
    drawBackground();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawDecorations();
    platforms.forEach((plat) => drawPlatform(plat));
    drawPortal();
    remotePlayers.forEach((p) => drawPlayer(p, false));
    drawPlayer(player, true);

    if (inPortalRange) {
      const p = world.portal;
      ctx.fillStyle = "#151b2ccf";
      ctx.fillRect(p.x - 34, p.y - 66, p.w + 68, 36);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "15px Pretendard, Noto Sans KR, sans-serif";
      ctx.fillText("↑ 키를 눌러 던전 입장", p.x + p.w * 0.5, p.y - 42);
    }

    ctx.restore();

    ctx.fillStyle = "#00000082";
    ctx.fillRect(12, 12, 432, 98);
    ctx.fillStyle = "#fff";
    ctx.font = "15px Pretendard, Noto Sans KR, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`플레이어 수: ${remotePlayers.size + 1}`, 24, 38);
    ctx.fillText(`좌표: (${Math.round(player.x)}, ${Math.round(player.y)})`, 24, 60);
    ctx.fillText("←/→ 이동 | Space 가변 점프 | Enter 채팅 | 포탈: ↑", 24, 82);
    ctx.fillText("우클릭 플레이어: 친구추가 / 1:1대화 / 미니게임 신청", 24, 102);
  }

  function updateFromSnapshot(snapshot) {
    const seen = new Set();
    const nowPerf = performance.now() / 1000;

    snapshot.players.forEach((entry) => {
      if (entry.id === myId) {
        const dx = Math.abs(entry.x - player.x);
        const dy = Math.abs(entry.y - player.y);
        if (dx > 140 || dy > 140) {
          player.x = entry.x;
          player.y = entry.y;
          player.vx = entry.vx;
          player.vy = entry.vy;
        }
        player.bubble = entry.bubble || "";
        player.bubbleUntil = entry.bubble_until || 0;
      } else {
        const existing = remotePlayers.get(entry.id) || {
          id: entry.id,
          nickname: entry.nickname,
          x: entry.x,
          y: entry.y,
          vx: entry.vx,
          vy: entry.vy,
          direction: entry.direction,
          bubble: "",
          bubbleUntil: 0,
        };

        existing.nickname = entry.nickname;
        existing.x = entry.x;
        existing.y = entry.y;
        existing.vx = entry.vx;
        existing.vy = entry.vy;
        existing.direction = entry.direction || 1;
        existing.bubble = entry.bubble || "";
        existing.bubbleUntil = entry.bubble_until || 0;
        remotePlayers.set(entry.id, existing);
      }
      seen.add(entry.id);
    });

    for (const id of remotePlayers.keys()) {
      if (!seen.has(id)) {
        remotePlayers.delete(id);
      }
    }

    remotePlayers.forEach((p) => {
      if (p.bubble && p.bubbleUntil < nowPerf) {
        p.bubble = "";
      }
    });
  }

  function sendPublicChat() {
    const text = chatInput.value.trim();
    if (!text) {
      chatInputWrap.classList.add("hidden");
      chatInput.value = "";
      return;
    }

    socket.emit("public_chat", { text });
    chatInput.value = "";
    chatInputWrap.classList.add("hidden");
    canvas.focus();
  }

  function sendPrivateChat() {
    const text = pmInput.value.trim();
    if (!text || !activePrivateTargetId) {
      return;
    }

    socket.emit("private_message", {
      target_id: activePrivateTargetId,
      text,
    });
    pmInput.value = "";
  }

  function findContextTarget(worldPos) {
    let candidate = null;
    let best = Number.POSITIVE_INFINITY;

    for (const remote of remotePlayers.values()) {
      const localDist = Math.hypot(remote.x - player.x, remote.y - player.y);
      if (localDist > 165) {
        continue;
      }

      const clickDist = Math.hypot(remote.x - worldPos.x, remote.y - worldPos.y);
      if (clickDist > 98) {
        continue;
      }

      if (clickDist < best) {
        best = clickDist;
        candidate = remote;
      }
    }
    return candidate;
  }

  function isTypingTarget(target) {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  }

  function step(dt) {
    stepMovement(dt);
  }

  function render() {
    drawWorld();
  }

  function gameLoop(now) {
    const delta = Math.min(0.05, (now - prevTs) / 1000);
    prevTs = now;
    accum += delta;

    while (accum >= FIXED_DT) {
      step(FIXED_DT);
      accum -= FIXED_DT;
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    requestJoinLobby(nickname);
  });

  socket.on("joined", ({ id, world: serverWorld, snapshot, profile }) => {
    myId = id;
    joined = true;
    joinRequested = false;

    player.id = id;
    player.nickname = profile?.nickname || nicknameInput.value.trim().slice(0, 16) || "Guest";
    myNameEl.textContent = player.nickname;

    if (serverWorld) {
      world = serverWorld;
      platforms = buildPlatforms(world);
      decorations = buildDecorations(world);
      player.x = world.spawn.x;
      player.y = world.spawn.y;
      player.vx = 0;
      player.vy = 0;
    }

    parseProfileForStorage(profile);

    if (snapshot) {
      updateFromSnapshot(snapshot);
    }

    startScreen.classList.remove("show");
    addFeedLine("로비 입장 완료. Enter로 채팅, 포탈 위에서 ↑로 던전 이동.", "system");
  });

  socket.on("disconnect", () => {
    joined = false;
    joinRequested = false;
  });

  socket.on("state_snapshot", (snapshot) => {
    if (!joined) {
      return;
    }
    updateFromSnapshot(snapshot);
  });

  socket.on("system_notice", ({ message }) => {
    addFeedLine(message, "system");
  });

  socket.on("player_left", ({ id }) => {
    remotePlayers.delete(id);
  });

  socket.on("public_chat", (payload) => {
    const now = performance.now() / 1000;
    if (payload.from_id === myId) {
      player.bubble = payload.text;
      player.bubbleUntil = now + 5.5;
      addFeedLine(`${payload.nickname}: ${payload.text}`);
      return;
    }

    const remote = remotePlayers.get(payload.from_id);
    if (remote) {
      remote.bubble = payload.text;
      remote.bubbleUntil = now + 5.5;
    }

    if (Math.hypot(payload.x - player.x, payload.y - player.y) <= PROXIMITY_RADIUS) {
      addFeedLine(`${payload.nickname}: ${payload.text}`);
    }
  });

  socket.on("friend_added", ({ friend_id, friend_nickname }) => {
    addFeedLine(`${friend_nickname} 님과 친구가 되었습니다.`, "system");
    if (!privateThreads.has(friend_id)) {
      privateThreads.set(friend_id, { nickname: friend_nickname, messages: [] });
    }
  });

  socket.on("private_message", (msg) => {
    const partnerId = msg.from_id === myId ? msg.target_id : msg.from_id;
    const partnerName = msg.from_id === myId ? msg.target_nickname : msg.from_nickname;
    const author = msg.from_id === myId ? "나" : msg.from_nickname;

    addPrivateLine(partnerId, {
      author,
      text: msg.text,
      partnerNickname: partnerName,
    });

    if (activePrivateTargetId === null) {
      activePrivateTargetId = partnerId;
    }
    renderPrivateChat();
  });

  socket.on("minigame_invited", ({ from_id, from_nickname }) => {
    showInviteModal(from_id, from_nickname);
  });

  socket.on("minigame_invite_declined", ({ nickname }) => {
    addFeedLine(`${nickname} 님이 미니게임 신청을 거절했습니다.`, "system");
  });

  socket.on("minigame_start", (payload) => {
    const sessionId = payload?.session_id || "";
    const explicitPath = payload?.game_path || "";
    sessionStorage.setItem("active_minigame_session", JSON.stringify(payload || {}));
    savePlayerProfile();
    const targetUrl = explicitPath || (sessionId ? `/game/volley?session=${encodeURIComponent(sessionId)}` : "/game/volley");
    window.location.assign(targetUrl);
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!joined) {
      return;
    }

    const worldPos = worldFromClient(event.clientX, event.clientY);
    const target = findContextTarget(worldPos);

    if (!target) {
      hideContextMenu();
      addFeedLine("플레이어 가까이에서 우클릭하면 상호작용할 수 있습니다.", "system");
      return;
    }

    showContextMenu(target.id, worldPos.sx + 8, worldPos.sy + 8);
  });

  friendBtn.addEventListener("click", () => {
    if (contextTargetId) {
      socket.emit("friend_request", { target_id: contextTargetId });
    }
    hideContextMenu();
  });

  pmBtn.addEventListener("click", () => {
    if (!contextTargetId) {
      return;
    }
    const target = remotePlayers.get(contextTargetId);
    if (target) {
      openPrivateChat(target.id, target.nickname);
    }
    hideContextMenu();
  });

  minigameBtn.addEventListener("click", () => {
    if (contextTargetId) {
      socket.emit("minigame_invite", { target_id: contextTargetId });
    }
    hideContextMenu();
  });

  inviteAcceptBtn.addEventListener("click", () => {
    if (!pendingInvite.fromId) {
      return;
    }
    socket.emit("minigame_invite_response", {
      from_id: pendingInvite.fromId,
      accepted: true,
    });
    hideInviteModal();
  });

  inviteDeclineBtn.addEventListener("click", () => {
    if (!pendingInvite.fromId) {
      return;
    }
    socket.emit("minigame_invite_response", {
      from_id: pendingInvite.fromId,
      accepted: false,
    });
    hideInviteModal();
  });

  pmSendBtn.addEventListener("click", sendPrivateChat);
  pmInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendPrivateChat();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#context-menu")) {
      hideContextMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }

    if (event.key === "ArrowLeft") {
      keys.left = true;
    } else if (event.key === "ArrowRight") {
      keys.right = true;
    } else if (event.key === "ArrowUp") {
      keys.up = true;
      interactQueued = true;
    } else if (event.key === " " || event.code === "Space") {
      keys.jumpHeld = true;
      jumpQueued = true;
      event.preventDefault();
    }

    if (!joined) {
      return;
    }

    if (event.key === "Escape") {
      chatInputWrap.classList.add("hidden");
      hideContextMenu();
      hideInviteModal();
      canvas.focus();
      return;
    }

    if (event.key === "Enter") {
      if (document.activeElement === pmInput) {
        return;
      }
      if (chatInputWrap.classList.contains("hidden")) {
        chatInputWrap.classList.remove("hidden");
        chatInput.focus();
      } else {
        sendPublicChat();
      }
    }

    if (event.key.toLowerCase() === "f") {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        canvas.requestFullscreen().catch(() => {});
      }
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft") {
      keys.left = false;
    } else if (event.key === "ArrowRight") {
      keys.right = false;
    } else if (event.key === "ArrowUp") {
      keys.up = false;
    } else if (event.key === " " || event.code === "Space") {
      keys.jumpHeld = false;
      if (player.vy < -80) {
        jumpCutQueued = true;
      }
    }
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendPublicChat();
    }
  });

  window.render_game_to_text = () => {
    const nearby = [];
    remotePlayers.forEach((p) => {
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d <= PROXIMITY_RADIUS) {
        nearby.push({ id: p.id, nickname: p.nickname, x: Math.round(p.x), y: Math.round(p.y) });
      }
    });

    return JSON.stringify({
      mode: joined ? "lobby" : "start",
      coordinate_system: "origin=(top-left), +x=right, +y=down",
      me: {
        id: myId,
        profile_id: player.profileId,
        nickname: player.nickname,
        hp: player.hp,
        coin: player.coin,
        x: Math.round(player.x),
        y: Math.round(player.y),
        vx: Math.round(player.vx),
        vy: Math.round(player.vy),
        on_ground: player.onGround,
      },
      portal: {
        in_range: inPortalRange,
        x: world.portal.x,
        y: world.portal.y,
      },
      nearby_players: nearby,
      ui: {
        public_chat_open: !chatInputWrap.classList.contains("hidden"),
        private_target: activePrivateTargetId,
        invite_modal_open: !inviteModal.classList.contains("hidden"),
      },
      counts: {
        total_players: remotePlayers.size + (joined ? 1 : 0),
        platforms: platforms.length,
      },
    });
  };

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      step(FIXED_DT);
    }
    render();
  };

  const storedNickname = getStoredNickname();
  if (storedNickname) {
    nicknameInput.value = storedNickname;
    startScreen.classList.remove("show");
    addFeedLine("저장된 닉네임으로 자동 입장 중...", "system");
    requestJoinLobby(storedNickname);
  }

  requestAnimationFrame(gameLoop);
})();
