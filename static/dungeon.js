(() => {
  const canvas = document.getElementById("dungeon-canvas");
  const ctx = canvas.getContext("2d");

  const nameEl = document.getElementById("dungeon-name");
  const hpEl = document.getElementById("dungeon-hp");
  const coinEl = document.getElementById("dungeon-coin");
  const feedEl = document.getElementById("dungeon-feed");

  const profileRaw = sessionStorage.getItem("player_profile");
  const profile = profileRaw
    ? JSON.parse(profileRaw)
    : { _id: "guest", nickname: "Guest", hp: 100, coin: 0 };

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
  };

  const platforms = [
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

  let jumpQueued = false;
  let jumpHolding = false;
  let jumpHoldTimer = 0;
  let jumpCutQueued = false;

  let accum = 0;
  let prevTs = performance.now();

  const actionLog = [];

  function addFeed(text) {
    const line = document.createElement("div");
    line.className = "feed-line system";
    line.textContent = text;
    feedEl.appendChild(line);
    while (feedEl.children.length > 70) {
      feedEl.removeChild(feedEl.firstChild);
    }
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  addFeed("던전 기반 페이지에 진입했습니다.");
  addFeed("몹/전투는 아직 미구현입니다. 이동/점프/공격키 훅만 제공됩니다.");

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

  function queueAction(key) {
    actionLog.push({ key, at: Date.now() });
    while (actionLog.length > 20) {
      actionLog.shift();
    }
    addFeed(`공격/스킬 훅 입력 감지: ${key}`);
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

    camera.x = clamp(player.x - canvas.width * 0.5, 0, world.width - canvas.width);
    camera.y = clamp(player.y - canvas.height * 0.5, 0, world.height - canvas.height);
  }

  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "#1e2847");
    grd.addColorStop(1, "#334f6f");
    ctx.fillStyle = grd;
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
    ctx.fillRect(12, 12, 470, 90);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.font = "15px Pretendard, Noto Sans KR, sans-serif";
    ctx.fillText("Dungeon Base (분업 전 뼈대)", 24, 38);
    ctx.fillText("이동: ← → | 점프: Space(짧게/길게)", 24, 61);
    ctx.fillText("공격 예약 키 훅: Z / X / C", 24, 84);
  }

  function render() {
    drawBackground();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawPlatforms();
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

    render();
    requestAnimationFrame(gameLoop);
  }

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

  window.render_game_to_text = () => {
    return JSON.stringify({
      mode: "dungeon-base",
      coordinate_system: "origin=(top-left), +x=right, +y=down",
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
      },
      placeholders: {
        monsters: [],
        rewards: [],
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

  requestAnimationFrame(gameLoop);
})();
