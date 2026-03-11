(() => {
  const canvas = document.getElementById("volley-canvas");
  const ctx = canvas.getContext("2d");

  const nameEl = document.getElementById("volley-name");
  const hpEl = document.getElementById("volley-hp");
  const coinEl = document.getElementById("volley-coin");
  const sessionEl = document.getElementById("volley-session");
  const sideEl = document.getElementById("volley-side");
  const feedEl = document.getElementById("volley-feed");

  const profileRaw = sessionStorage.getItem("player_profile");
  const profile = profileRaw
    ? JSON.parse(profileRaw)
    : { _id: "guest", nickname: "Guest", hp: 100, coin: 0 };

  const url = new URL(window.location.href);
  const sessionIdFromQuery = url.searchParams.get("session");
  const storedSessionRaw = sessionStorage.getItem("active_minigame_session");
  const storedSession = storedSessionRaw ? JSON.parse(storedSessionRaw) : null;
  const sessionId = sessionIdFromQuery || storedSession?.session_id || "";

  nameEl.textContent = profile.nickname;
  hpEl.textContent = String(profile.hp);
  coinEl.textContent = String(profile.coin);
  sessionEl.textContent = sessionId || "-";

  const socket = io();
  const keys = {
    left: false,
    right: false,
    jump: false,
  };

  const gameState = {
    connected: false,
    status: "waiting_join",
    side: "",
    sideNicknames: { left: "-", right: "-" },
    targetScore: 5,
    entryFee: 10,
    pot: 20,
    countdownSeconds: 5,
    countdownRemaining: 0,
    field: {
      width: 2200,
      height: 1200,
      floor_y: 1100,
      racket_x: 1100,
      racket_w: 40,
      racket_h: 280,
    },
    scores: { left: 0, right: 0 },
    players: {
      left: { x: 620, y: 1032, w: 104, h: 136, nickname: "-" },
      right: { x: 1580, y: 1032, w: 104, h: 136, nickname: "-" },
    },
    ball: { x: 1100, y: 380, r: 52, vx: 0, vy: 0 },
    winner: "",
    winnerSide: "",
  };

  function addFeed(text, type = "system") {
    const line = document.createElement("div");
    line.className = `feed-line ${type}`;
    line.textContent = text;
    feedEl.appendChild(line);
    while (feedEl.children.length > 20) {
      feedEl.removeChild(feedEl.firstChild);
    }
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function syncInput() {
    if (!sessionId) {
      return;
    }
    socket.emit("volley_input", {
      left: keys.left,
      right: keys.right,
      jump: keys.jump,
    });
  }

  function toScreenX(worldX) {
    return (worldX / gameState.field.width) * canvas.width;
  }

  function toScreenY(worldY) {
    return (worldY / gameState.field.height) * canvas.height;
  }

  function toScreenW(worldW) {
    return (worldW / gameState.field.width) * canvas.width;
  }

  function toScreenH(worldH) {
    return (worldH / gameState.field.height) * canvas.height;
  }

  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grd.addColorStop(0, "#7fb4ff");
    grd.addColorStop(0.7, "#bde6ff");
    grd.addColorStop(1, "#f9f3d8");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const floorY = toScreenY(gameState.field.floor_y);
    ctx.fillStyle = "#efe2b4";
    ctx.fillRect(0, floorY, canvas.width, canvas.height - floorY);
    ctx.fillStyle = "#ddc98f";
    ctx.fillRect(0, floorY - 8, canvas.width, 8);
  }

  function drawCourt() {
    const racketLeft = toScreenX(gameState.field.racket_x - gameState.field.racket_w * 0.5);
    const racketTop = toScreenY(gameState.field.floor_y - gameState.field.racket_h);
    const racketW = toScreenW(gameState.field.racket_w);
    const racketH = toScreenH(gameState.field.racket_h);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(racketLeft, racketTop, racketW, racketH);
    ctx.strokeStyle = "#314565";
    ctx.lineWidth = 3;
    ctx.strokeRect(racketLeft, racketTop, racketW, racketH);

    ctx.strokeStyle = "#1f314d44";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.5, 0);
    ctx.lineTo(canvas.width * 0.5, canvas.height);
    ctx.stroke();
  }

  function drawPlayer(player, side) {
    const x = toScreenX(player.x);
    const y = toScreenY(player.y);
    const w = toScreenW(player.w);
    const h = toScreenH(player.h);
    const color = side === "left" ? "#ffb72e" : "#22c38d";
    const bodyTop = y - h * 0.12;
    const bodyW = w * 0.82;
    const bodyX = x - bodyW * 0.5;
    const headR = w * 0.5;
    const headY = y - h * 0.5 + headR + 2;

    ctx.fillStyle = color;
    ctx.fillRect(bodyX, bodyTop, bodyW, y + h * 0.5 - bodyTop);
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#183040";
    ctx.lineWidth = 2;
    ctx.strokeRect(bodyX, bodyTop, bodyW, y + h * 0.5 - bodyTop);
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#12253e";
    ctx.font = "700 22px Pretendard, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(player.nickname || "-", x, y - h * 0.65);
  }

  function drawBall() {
    const x = toScreenX(gameState.ball.x);
    const y = toScreenY(gameState.ball.y);
    const r = toScreenW(gameState.ball.r);

    ctx.fillStyle = "#fff7e0";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#d38714";
    ctx.stroke();
  }

  function drawScoreboard() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "900 148px Pretendard, sans-serif";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#13273f";
    ctx.fillStyle = "#ffffff";
    ctx.strokeText(String(gameState.scores.left), canvas.width * 0.25, 112);
    ctx.fillText(String(gameState.scores.left), canvas.width * 0.25, 112);
    ctx.strokeText(String(gameState.scores.right), canvas.width * 0.75, 112);
    ctx.fillText(String(gameState.scores.right), canvas.width * 0.75, 112);

    ctx.font = "700 24px Pretendard, sans-serif";
    ctx.fillStyle = "#13273f";
    ctx.fillText(gameState.sideNicknames.left || "LEFT", canvas.width * 0.25, 176);
    ctx.fillText(gameState.sideNicknames.right || "RIGHT", canvas.width * 0.75, 176);
    ctx.restore();
  }

  function drawStatus() {
    if (gameState.status === "countdown") {
      ctx.fillStyle = "#102238c8";
      ctx.fillRect(canvas.width * 0.33, canvas.height * 0.34, canvas.width * 0.34, 210);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "800 38px Pretendard, sans-serif";
      ctx.fillText("경기 시작까지", canvas.width * 0.5, canvas.height * 0.43);
      ctx.font = "900 120px Pretendard, sans-serif";
      ctx.fillText(String(Math.max(0, gameState.countdownRemaining)), canvas.width * 0.5, canvas.height * 0.56);
      return;
    }

    if (gameState.status === "playing") {
      return;
    }
    const messageByStatus = {
      waiting_join: "상대 플레이어 접속 대기 중",
      cancelled: "경기 시작 불가 (코인 부족)",
      finished: gameState.winner
        ? `${gameState.winner} 승리!`
        : "경기가 종료되었습니다.",
    };
    const msg = messageByStatus[gameState.status] || "경기 상태 동기화 중";
    ctx.fillStyle = "#102238c8";
    ctx.fillRect(canvas.width * 0.19, canvas.height * 0.41, canvas.width * 0.62, 92);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "700 34px Pretendard, sans-serif";
    ctx.fillText(msg, canvas.width * 0.5, canvas.height * 0.48);
  }

  function render() {
    drawBackground();
    drawCourt();
    drawPlayer(gameState.players.left, "left");
    drawPlayer(gameState.players.right, "right");
    drawBall();
    drawScoreboard();
    drawStatus();
    requestAnimationFrame(render);
  }

  window.render_game_to_text = () => {
    return JSON.stringify({
      mode: "volley",
      status: gameState.status,
      coordinate_system: "origin=(top-left), +x right, +y down",
      session_id: sessionId,
      my_side: gameState.side,
      scores: gameState.scores,
      target_score: gameState.targetScore,
      entry_fee: gameState.entryFee,
      pot: gameState.pot,
      players: gameState.players,
      ball: gameState.ball,
      winner: gameState.winner,
    });
  };

  window.advanceTime = () => {
    // Server-authoritative simulation; deterministic local stepping is not used here.
  };

  socket.on("connect", () => {
    gameState.connected = true;
    if (!sessionId) {
      addFeed("세션 ID가 없어 경기에 참가할 수 없습니다.");
      return;
    }
    socket.emit("volley_join_session", {
      session_id: sessionId,
      nickname: profile.nickname,
    });
    addFeed("배구 세션 참가 요청을 보냈습니다.");
  });

  socket.on("volley_joined", (payload) => {
    gameState.side = payload.side;
    gameState.targetScore = payload.target_score;
    gameState.entryFee = payload.entry_fee;
    gameState.status = payload.status || gameState.status;
    sideEl.textContent = payload.side === "left" ? "왼쪽" : "오른쪽";
    addFeed(`내 진영: ${sideEl.textContent}`);
  });

  socket.on("volley_waiting", (payload) => {
    gameState.status = "waiting_join";
    addFeed(`참가 인원 ${payload.connected_players}/2, 상대 대기 중`);
  });

  socket.on("volley_start", (payload) => {
    gameState.status = payload.status || "playing";
    gameState.scores = payload.scores || gameState.scores;
    gameState.sideNicknames = payload.side_nicknames || gameState.sideNicknames;
    gameState.targetScore = payload.target_score || gameState.targetScore;
    gameState.entryFee = payload.entry_fee || gameState.entryFee;
    gameState.pot = payload.pot || gameState.pot;
    gameState.countdownSeconds = payload.countdown_seconds || gameState.countdownSeconds;
    gameState.countdownRemaining = payload.countdown_remaining || gameState.countdownSeconds;
    addFeed(`베팅 완료: 각 ${gameState.entryFee}코인`);
    if (gameState.status === "countdown") {
      addFeed(`카운트다운 ${gameState.countdownRemaining}초 후 시작`);
    } else {
      addFeed(`경기 시작: ${gameState.targetScore}점 선취`);
    }
  });

  socket.on("volley_state", (payload) => {
    gameState.status = payload.status || gameState.status;
    gameState.countdownRemaining = payload.countdown_remaining ?? gameState.countdownRemaining;
    gameState.countdownSeconds = payload.countdown_seconds ?? gameState.countdownSeconds;
    gameState.scores = payload.scores || gameState.scores;
    gameState.targetScore = payload.target_score || gameState.targetScore;
    gameState.field = payload.field || gameState.field;
    if (payload.players?.left) {
      gameState.players.left = payload.players.left;
      gameState.sideNicknames.left = payload.players.left.nickname || gameState.sideNicknames.left;
    }
    if (payload.players?.right) {
      gameState.players.right = payload.players.right;
      gameState.sideNicknames.right = payload.players.right.nickname || gameState.sideNicknames.right;
    }
    if (payload.ball) {
      gameState.ball = payload.ball;
    }
  });

  socket.on("volley_match_end", (payload) => {
    gameState.status = "finished";
    gameState.scores = payload.scores || gameState.scores;
    gameState.winner = payload.winner_nickname || "";
    gameState.winnerSide = payload.winner_side || "";
    if (payload.winner_nickname) {
      addFeed(`경기 종료: ${payload.winner_nickname} 승리`);
    } else {
      addFeed("경기 종료");
    }
    addFeed(`정산: 승자 +${payload.pot || gameState.pot}코인`);
    if (payload.winner_nickname === profile.nickname && Number.isFinite(payload.winner_coin)) {
      profile.coin = payload.winner_coin;
      coinEl.textContent = String(profile.coin);
      sessionStorage.setItem("player_profile", JSON.stringify(profile));
    }
  });

  socket.on("volley_error", (payload) => {
    gameState.status = "cancelled";
    addFeed(payload?.message || "배구 세션 오류");
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    if (event.code === "ArrowLeft") {
      keys.left = true;
      syncInput();
      event.preventDefault();
    } else if (event.code === "ArrowRight") {
      keys.right = true;
      syncInput();
      event.preventDefault();
    } else if (event.code === "Space") {
      keys.jump = true;
      syncInput();
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft") {
      keys.left = false;
      syncInput();
      event.preventDefault();
    } else if (event.code === "ArrowRight") {
      keys.right = false;
      syncInput();
      event.preventDefault();
    } else if (event.code === "Space") {
      keys.jump = false;
      syncInput();
      event.preventDefault();
    }
  });

  setInterval(syncInput, 50);
  addFeed("볼리 미니게임 화면 로드 완료");
  render();
})();
