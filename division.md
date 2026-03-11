# Division Guide

이 문서는 현재 구현 상태와 분업 시 연동 규칙을 정리한 문서다.

## 1) 현재 구현 완료 범위

### 1.1 페이지/라우트
- `/` -> `templates/lobby.html` (메인 로비)
- `/dungeon` -> `templates/dungeon.html` (던전 기반 화면, 실제 전투 미구현)
- `/game` -> `templates/game.html` (미니게임 허브 기반 화면, 실제 게임 미구현)

### 1.2 서버 기반
- Flask + Flask-SocketIO 서버 동작
- MongoDB 플레이어 저장소 기반 추가
  - 환경변수 `MONGODB_URI`가 있으면 MongoDB 연결
  - 없으면 in-memory fallback 사용
- 플레이어 저장 필드 기준
  - `_id`, `nickname`, `hp`, `coin`

### 1.3 로비 기능
- 닉네임 입장 + 프로필(`_id/hp/coin`) 수신
- 좌우 이동(ArrowLeft/ArrowRight)
- 가변 점프(Space)
  - 짧게 누르면 낮은 점프
  - 길게 누르면 높은 점프
- 로비 포탈 진입
  - 포탈 범위 내 + `ArrowUp` 입력 시 `/dungeon` 이동
- 공개 채팅(Enter)
- 우클릭 상호작용
  - 친구 추가
  - 1:1 채팅
  - 미니게임 신청

### 1.4 미니게임 진입 흐름(기반)
- `minigame_invite` 송신
- 상대가 `minigame_invite_response`로 수락하면
- 양쪽에 `minigame_start` 이벤트 전송
- 클라이언트는 `/game?session=<session_id>`로 이동

### 1.5 던전/미니게임 기반
- 던전 페이지(`static/dungeon.js`)
  - 로비와 동일한 무빙/가변 점프 구조
  - 공격/스킬 확장 훅만 존재: `KeyZ`, `KeyX`, `KeyC`
  - 몹/전투/보상 로직은 아직 없음
- 미니게임 페이지(`static/game.js`)
  - 세션 표시
  - 코인 사용 훅 UI만 제공
  - 실제 미니게임 규칙/진행 없음

## 2) 소켓 이벤트 계약(현재 기준)

### 2.1 입장/상태
- `join_lobby` (client -> server)
  - payload: `{ nickname }`
- `joined` (server -> client)
  - payload: `{ id, world, snapshot, profile }`
- `player_state` (client -> server)
  - payload: `{ x, y, vx, vy, direction }`
- `state_snapshot` (server -> all)

### 2.2 채팅/친구
- `public_chat`
- `private_message`
- `friend_request`
- `friend_added`

### 2.3 미니게임 신청
- `minigame_invite` (client -> server)
  - payload: `{ target_id }`
- `minigame_invited` (server -> target)
  - payload: `{ from_id, from_nickname }`
- `minigame_invite_response` (target -> server)
  - payload: `{ from_id, accepted }`
- `minigame_start` (server -> both)
  - payload: `{ session_id, players: [{id, nickname}, ...] }`
- `minigame_invite_declined` (server -> requester)

### 2.4 던전 몹 영속화/전투 훅
- `join_dungeon` (client -> server)
  - payload: `{ dungeon_id }`
- `dungeon_joined` (server -> client)
  - payload: `{ dungeon_id, world, snapshot, keywords }`
- `request_dungeon_snapshot` (client -> server)
  - payload: `{ dungeon_id }`
- `dungeon_snapshot` (server -> client)
  - payload: `{ timestamp, dungeon_id, monsters }`
- `dungeon_action_request` (client -> server)
  - payload: `{ dungeon_id, action_key, player }`
- `dungeon_action_queued` (server -> client)
  - payload: `{ dungeon_id, action_key, status, server_authoritative, message }`

## 3) 분업 시 필수 고려사항

### 3.1 공통 규칙
- HP/coin 변경은 반드시 서버에서 처리한다.
- 클라이언트는 HP/coin을 직접 확정하지 않는다(표시만).
- 보상/소모는 MongoDB에 원자적 업데이트(`$inc`)로 처리한다.
- 현재 인증은 닉네임 기반이므로, 추후 계정/토큰 인증 도입 전까지 악용 가능성을 인지한다.

### 3.2 던전 팀 가이드
- 시작점: `static/dungeon.js`
- 우선 구현 대상
  - 몹 스폰 매니저(웨이브/타이머)
  - 전투 판정(근접/원거리)
  - 피격/사망/리스폰
  - 던전 클리어/실패 조건
- 반드시 추가할 항목
  - 서버 이벤트: 공격 요청/피해 확정/보상 확정
  - MongoDB 연동: HP 감소, coin 획득
- 주의
  - 전투 판정은 서버 권위로 확정해야 동기화/치트 문제가 줄어든다.

### 3.3 미니게임 팀 가이드
- 시작점: `static/game.js`
- 우선 구현 대상
  - 게임 룸 상태 머신(대기/진행/종료)
  - 승패 판단 및 보상 분배
  - 코인 입장비/베팅/환급 규칙
- 반드시 추가할 항목
  - 서버 이벤트: 룸 생성, 룸 참가, 시작, 종료 정산
  - MongoDB 연동: coin 소모/획득
- 주의
  - 미니게임 계산 결과(승패/정산)는 클라이언트 확정 금지.

### 3.4 백엔드 팀 가이드
- 시작점: `app.py`
- 우선 구현 대상
  - 던전/미니게임용 네임스페이스 또는 이벤트 그룹 정리
  - 세션/룸 저장 구조(메모리 + 필요 시 Redis)
  - 플레이어 인메모리 상태와 DB 상태 동기화 정책
- 안정화 체크
  - disconnect 시 룸 정리
  - 타임아웃 초대 정리
  - 예외 시 세션 누수 방지

## 4) 데이터 모델 권장안

### 4.1 players 컬렉션
- `_id: ObjectId`
- `nickname: string (unique)`
- `hp: int`
- `coin: int`
- `created_at: float(timestamp)`
- `updated_at: float(timestamp)`

### 4.2 확장 컬렉션(권장)
- `dungeon_runs`
  - run_id, players, started_at, ended_at, rewards
- `minigame_sessions`
  - session_id, players, game_type, entry_fee, result

### 4.3 dungeon_monsters 컬렉션(현재 뼈대)
- `dungeon_id: string`
- `monster_id: string (dungeon 내 unique)`
- `template_id: string`
- `name: string`
- `theme: string`
- `sprite_hint: string`
- `x: float`
- `y: float`
- `spawn_x: float`
- `spawn_y: float`
- `hp: int`
- `max_hp: int`
- `level: int`
- `state: string`
- `is_boss: bool`
- `move_range: float`
- `respawn_delay: float`
- `created_at: float(timestamp)`
- `updated_at: float(timestamp)`
- `last_seen_at: float(timestamp)`

## 5) 지금 바로 이어서 작업할 때 권장 순서
1. 백엔드 팀: 던전 전투 이벤트 계약 먼저 확정
2. 던전 팀: `KeyZ/X/C` 훅을 실제 스킬/공격 이벤트 송신으로 연결
3. 백엔드 팀: 피해/보상 서버 확정 + DB 반영
4. 미니게임 팀: `/game`에 최소 1개 게임 상태 머신 붙이기
5. 백엔드 팀: 코인 정산 공통 모듈화

## 6) 참고 파일
- `app.py`
- `templates/lobby.html`
- `templates/dungeon.html`
- `templates/game.html`
- `static/lobby.js`
- `static/dungeon.js`
- `static/game.js`
