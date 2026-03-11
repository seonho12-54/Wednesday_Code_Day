const 칸수 = 21;
const 캔버스 = document.querySelector("#게임판");
const 문맥 = 캔버스.getContext("2d");
const 현재점수표시 = document.querySelector("#현재점수");
const 최고점수표시 = document.querySelector("#최고점수");
const 현재속도표시 = document.querySelector("#현재속도");
const 상태메시지 = document.querySelector("#상태메시지");
const 시작버튼 = document.querySelector("#시작버튼");
const 일시정지버튼 = document.querySelector("#일시정지버튼");
const 속도선택 = document.querySelector("#속도선택");
const 방향버튼들 = document.querySelectorAll("[data-direction]");
const 중앙버튼 = document.querySelector("[data-action='toggle']");

const 속도이름 = {
  170: "느림",
  130: "보통",
  95: "빠름",
  70: "매우 빠름",
};

let 뱀 = [];
let 방향 = { x: 1, y: 0 };
let 다음방향 = { x: 1, y: 0 };
let 먹이 = { x: 10, y: 10 };
let 점수 = 0;
let 최고점수 = Number(localStorage.getItem("snake-best-score-ko")) || 0;
let 진행중 = false;
let 일시정지 = false;
let 게임끝 = false;
let 타이머 = null;

최고점수표시.textContent = String(최고점수);
현재속도표시.textContent = 속도이름[속도선택.value];

function 초기화() {
  뱀 = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  방향 = { x: 1, y: 0 };
  다음방향 = { x: 1, y: 0 };
  먹이 = 먹이만들기();
  점수 = 0;
  진행중 = false;
  일시정지 = false;
  게임끝 = false;
  현재점수표시.textContent = "0";
  상태메시지.textContent = "시작 버튼을 누르거나 스페이스바를 누르세요";
  그리기();
}

function 먹이만들기() {
  while (true) {
    const 후보 = {
      x: Math.floor(Math.random() * 칸수),
      y: Math.floor(Math.random() * 칸수),
    };

    if (!뱀.some((칸) => 칸.x === 후보.x && 칸.y === 후보.y)) {
      return 후보;
    }
  }
}

function 시작또는재시작() {
  clearInterval(타이머);

  if (게임끝 || !진행중) {
    초기화();
    진행중 = true;
    상태메시지.textContent = "게임 진행 중";
  }

  일시정지 = false;
  타이머 = setInterval(한틱진행, Number(속도선택.value));
  시작버튼.textContent = "게임 다시 시작";
  일시정지버튼.textContent = "일시정지";
}

function 일시정지전환() {
  if (!진행중 || 게임끝) {
    시작또는재시작();
    return;
  }

  일시정지 = !일시정지;
  if (일시정지) {
    clearInterval(타이머);
    상태메시지.textContent = "일시정지됨";
    일시정지버튼.textContent = "계속하기";
  } else {
    타이머 = setInterval(한틱진행, Number(속도선택.value));
    상태메시지.textContent = "게임 진행 중";
    일시정지버튼.textContent = "일시정지";
  }
}

function 한틱진행() {
  if (일시정지 || 게임끝) {
    return;
  }

  방향 = 다음방향;

  const 머리 = {
    x: 뱀[0].x + 방향.x,
    y: 뱀[0].y + 방향.y,
  };

  const 먹이먹음 = 머리.x === 먹이.x && 머리.y === 먹이.y;

  if (충돌했는지(머리, 먹이먹음)) {
    종료();
    return;
  }

  뱀.unshift(머리);

  if (먹이먹음) {
    점수 += 10;
    현재점수표시.textContent = String(점수);
    if (점수 > 최고점수) {
      최고점수 = 점수;
      localStorage.setItem("snake-best-score-ko", String(최고점수));
      최고점수표시.textContent = String(최고점수);
    }
    먹이 = 먹이만들기();
    상태메시지.textContent = "맛있다! 계속 전진하세요";
  } else {
    뱀.pop();
  }

  그리기();
}

function 충돌했는지(머리, 먹이먹음) {
  const 벽충돌 =
    머리.x < 0 || 머리.y < 0 || 머리.x >= 칸수 || 머리.y >= 칸수;

  const 비교대상 = 먹이먹음 ? 뱀 : 뱀.slice(0, -1);
  const 몸충돌 = 비교대상.some((칸) => 칸.x === 머리.x && 칸.y === 머리.y);

  return 벽충돌 || 몸충돌;
}

function 종료() {
  게임끝 = true;
  진행중 = false;
  clearInterval(타이머);
  상태메시지.textContent = `게임 종료! 점수 ${점수}점`;
  시작버튼.textContent = "다시 시작";
  일시정지버튼.textContent = "일시정지";
  그리기();
}

function 방향바꾸기(새방향) {
  const 반대방향 =
    방향.x + 새방향.x === 0 && 방향.y + 새방향.y === 0;

  if (!반대방향) {
    다음방향 = 새방향;
  }

  if (!진행중 && !게임끝) {
    시작또는재시작();
  }
}

function 칸그리기(x, y, 색상, 그림자색) {
  const 칸크기 = 캔버스.width / 칸수;
  const 여백 = 3;
  문맥.fillStyle = 색상;
  문맥.shadowColor = 그림자색;
  문맥.shadowBlur = 10;
  문맥.beginPath();
  문맥.roundRect(
    x * 칸크기 + 여백,
    y * 칸크기 + 여백,
    칸크기 - 여백 * 2,
    칸크기 - 여백 * 2,
    8
  );
  문맥.fill();
  문맥.shadowBlur = 0;
}

function 배경그리기() {
  const 칸크기 = 캔버스.width / 칸수;
  문맥.clearRect(0, 0, 캔버스.width, 캔버스.height);

  for (let y = 0; y < 칸수; y += 1) {
    for (let x = 0; x < 칸수; x += 1) {
      문맥.fillStyle = (x + y) % 2 === 0 ? "#17333a" : "#143038";
      문맥.fillRect(x * 칸크기, y * 칸크기, 칸크기, 칸크기);
    }
  }
}

function 그리기() {
  배경그리기();

  칸그리기(먹이.x, 먹이.y, "#ffd166", "rgba(255, 209, 102, 0.55)");

  뱀.forEach((칸, 인덱스) => {
    const 색상 = 인덱스 === 0 ? "#ff7a59" : "#59d48a";
    const 그림자색 =
      인덱스 === 0 ? "rgba(255, 122, 89, 0.55)" : "rgba(89, 212, 138, 0.45)";
    칸그리기(칸.x, 칸.y, 색상, 그림자색);
  });

  if (게임끝) {
    문맥.fillStyle = "rgba(2, 6, 8, 0.55)";
    문맥.fillRect(0, 0, 캔버스.width, 캔버스.height);
    문맥.fillStyle = "#fff4df";
    문맥.textAlign = "center";
    문맥.font = "bold 28px 'Apple SD Gothic Neo', sans-serif";
    문맥.fillText("게임 종료", 캔버스.width / 2, 캔버스.height / 2 - 12);
    문맥.font = "18px 'Apple SD Gothic Neo', sans-serif";
    문맥.fillText("다시 시작 버튼을 누르세요", 캔버스.width / 2, 캔버스.height / 2 + 22);
  }
}

document.addEventListener("keydown", (event) => {
  const 키 = event.key.toLowerCase();

  if (키 === "arrowup" || 키 === "w") {
    방향바꾸기({ x: 0, y: -1 });
  } else if (키 === "arrowdown" || 키 === "s") {
    방향바꾸기({ x: 0, y: 1 });
  } else if (키 === "arrowleft" || 키 === "a") {
    방향바꾸기({ x: -1, y: 0 });
  } else if (키 === "arrowright" || 키 === "d") {
    방향바꾸기({ x: 1, y: 0 });
  } else if (키 === " ") {
    event.preventDefault();
    일시정지전환();
  }
});

방향버튼들.forEach((버튼) => {
  버튼.addEventListener("click", () => {
    const 방향값 = 버튼.dataset.direction;

    if (방향값 === "up") {
      방향바꾸기({ x: 0, y: -1 });
    } else if (방향값 === "down") {
      방향바꾸기({ x: 0, y: 1 });
    } else if (방향값 === "left") {
      방향바꾸기({ x: -1, y: 0 });
    } else if (방향값 === "right") {
      방향바꾸기({ x: 1, y: 0 });
    }
  });
});

중앙버튼.addEventListener("click", 일시정지전환);
시작버튼.addEventListener("click", 시작또는재시작);
일시정지버튼.addEventListener("click", 일시정지전환);

속도선택.addEventListener("change", () => {
  현재속도표시.textContent = 속도이름[속도선택.value];
  if (진행중 && !일시정지 && !게임끝) {
    clearInterval(타이머);
    타이머 = setInterval(한틱진행, Number(속도선택.value));
  }
});

초기화();
