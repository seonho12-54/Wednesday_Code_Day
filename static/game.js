(() => {
  const nameEl = document.getElementById("game-name");
  const hpEl = document.getElementById("game-hp");
  const coinEl = document.getElementById("game-coin");
  const sessionEl = document.getElementById("game-session");
  const partyEl = document.getElementById("game-party");
  const coinActionBtn = document.getElementById("coin-action");
  const coinLog = document.getElementById("coin-log");

  const profileRaw = sessionStorage.getItem("player_profile");
  const profile = profileRaw
    ? JSON.parse(profileRaw)
    : { _id: "guest", nickname: "Guest", hp: 100, coin: 0 };

  nameEl.textContent = profile.nickname;
  hpEl.textContent = String(profile.hp);
  coinEl.textContent = String(profile.coin);

  const url = new URL(window.location.href);
  const sessionIdFromQuery = url.searchParams.get("session");
  const storedSessionRaw = sessionStorage.getItem("active_minigame_session");
  const storedSession = storedSessionRaw ? JSON.parse(storedSessionRaw) : null;

  const activeSessionId = sessionIdFromQuery || storedSession?.session_id || "none";
  sessionEl.textContent = activeSessionId;

  if (storedSession?.players?.length) {
    const members = storedSession.players.map((p) => p.nickname).join(", ");
    partyEl.textContent = `파티: ${members}`;
  } else {
    partyEl.textContent = "파티 정보 없음 (단독 진입 또는 세션 미연결)";
  }

  function appendCoinLog(text) {
    const line = document.createElement("div");
    line.className = "feed-line system";
    line.textContent = text;
    coinLog.appendChild(line);
    while (coinLog.children.length > 12) {
      coinLog.removeChild(coinLog.firstChild);
    }
    coinLog.scrollTop = coinLog.scrollHeight;
  }

  appendCoinLog("미니게임 허브 뼈대가 로드되었습니다.");
  appendCoinLog("실제 미니게임 로직은 분업으로 추가될 예정입니다.");

  coinActionBtn.addEventListener("click", () => {
    appendCoinLog("코인 사용 훅 트리거됨: 추후 게임별 소비/보상 로직 연결 예정");
  });

  window.render_game_to_text = () => {
    return JSON.stringify({
      mode: "game-hub-base",
      player: {
        profile_id: profile._id,
        nickname: profile.nickname,
        hp: Number(profile.hp),
        coin: Number(profile.coin),
      },
      session: {
        id: activeSessionId,
        players: storedSession?.players || [],
      },
      hooks: {
        coin_usage: true,
        mini_game_runtime: false,
      },
    });
  };

  window.advanceTime = () => {
    // No deterministic simulation yet; reserved for future minigame loops.
  };
})();
