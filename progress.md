Original prompt: 처음에 메인화면 메인화면에서 닉네임 치고 로비 입장 가능 메타버스형이고 플랫포머 형태 캐릭터가 방향키 좌우키를 누르면 좌우로 이동함 스페이스바를 누르면 점프가 가능함. 플레이어는 플랫폼 위를 걸어다님 다른사람들도 입장 가능 다른사람들끼리 만났을때 마우스 오른쪽키를 누르면 친구 추가 대화하기 뜸 채팅창이 뜨고 1대1 대화 가능 로비에서는 엔터키 눌러서 채팅을 입력하면 캐릭터 위에 말풍선이 뜨고 다른 주변에 있는 플레이어들과 소통 가능 rpg에서 대화 하는 것처럼 해보지 로비는 알아서 잘 만들어라. 플레이어들이 탈출 하는 현상이 일어나지 않도록 하고 혹시나 로비 공간에서 벗어나는 경우가 있으면 로비 중앙으로 돌아올수 있도록 대처도 해줘 서버는 우분투에서 돌릴거고 flask 기반으로 작동시킬거야

- 초기 상태 확인: 기존 `index.html`은 단일 좀비 게임이었고 요청사항과 구조가 달라 Flask + Socket.IO 기반으로 신규 구성 필요.
- 구현 계획: `app.py`(서버), `templates/index.html`, `static/client.js`, `static/style.css`, `requirements.txt`를 추가해 멀티플레이 로비형 플랫포머로 재구성.
- 수정: `app.py`의 `join_lobby`에서 `state_lock` 안에서 `make_state_snapshot()`를 호출하던 구조를 제거해 락 재진입 데드락 가능성 해결.
- 테스트 중 발견: `/socket.io/socket.io.js` 경로가 400(프로토콜 미스매치)로 로드 실패하여 클라이언트 소켓 초기화 불가.
- 수정: `templates/index.html`에서 Socket.IO 클라이언트를 `https://cdn.socket.io/4.7.5/socket.io.min.js`로 교체.
- 검증: Playwright 클라이언트로 `닉네임 입력(a) -> 입장(Enter) -> 이동/점프 -> Enter 채팅 입력` 시나리오 실행 성공.
  - 산출물: `output/web-game/shot-0.png`, `output/web-game/state-0.json`
  - `state-0.json` 기준 `mode=lobby`, 플레이어 좌표/상태 정상 반영.
  - `errors-*.json` 생성 없음(새 콘솔 에러 없음).
- 검증: Python Socket.IO 클라이언트 2개 동시 접속 통신 테스트 통과.
  - 결과: `join_lobby`, `friend_request`, `private_message`, `public_chat` 이벤트 모두 양측 수신 확인.

TODO / Suggestions for next agent:
- 운영 배포 전 Flask 개발 서버 대신 gunicorn+eventlet/gevent 기반 실행 스크립트 추가 검토.
- 우클릭 컨텍스트 메뉴를 모바일 대응하려면 long-press 상호작용 입력 추가 고려.
- 현재 Socket.IO 클라이언트는 CDN 의존성이 있으므로 외부망 제한 환경이라면 정적 번들 로컬 서빙 방식으로 전환 필요.
- 사용자 요구사항 업데이트 반영: 로비를 메인(`lobby.html`)으로 분리하고 `/dungeon`, `/game` 라우트를 추가.
- 서버 확장: MongoDB 플레이어 저장소 계층(`_id`, `hp`, `coin`) 추가, 미니게임 신청/수락 소켓 이벤트(`minigame_invite`, `minigame_invite_response`, `minigame_start`) 추가.
- 로비 확장: 포탈 진입 조건을 `포탈 범위 + ArrowUp`으로 구현, 우클릭 메뉴에 미니게임 신청 추가, 가변 점프(짧게/길게) 및 점프 높이 상향 적용.
- 분업용 뼈대 추가: `dungeon.html + dungeon.js`(이동/점프/공격키 훅), `game.html + game.js`(세션/코인 사용 훅) 구성. 던전/미니게임 실제 콘텐츠는 미구현 상태 유지.
- 파일 구조 정리: 기존 `templates/index.html`, `static/client.js` 제거.
- 추가 요구 반영 구현: 포탈은 `ArrowUp`으로 진입하도록 변경, 점프는 가변 점프(짧게/길게) + 기본 높이 소폭 상향.
- 페이지 분리 완료: `/`(lobby), `/dungeon`(기반), `/game`(기반).
- 검증 1: Playwright 액션 테스트(`output/web-game-lobby`)에서 로비 입장/이동/점프/채팅 시나리오 및 상태 출력 정상.
- 검증 2: Playwright 포탈 체크에서 `portal.in_range=true` 상태로 `ArrowUp` 입력 시 URL이 `/dungeon`으로 변경됨 확인.
- 검증 3: 2클라이언트 Socket.IO 테스트에서 `minigame_invite -> minigame_invite_response(accepted) -> minigame_start` 양측 수신 확인.
- 문서화: 분업용 가이드 `division.md` 생성(현재 구현 범위, 소켓 이벤트 계약, 던전/미니게임/백엔드 팀별 고려사항, 데이터 모델 권장안 정리).
