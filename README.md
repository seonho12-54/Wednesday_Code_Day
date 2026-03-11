# 🎤 Wednesday_Code_Day
## 4분 발표 + 시연용 GitHub 슬라이드형 README

## Slide 1. 프로젝트 한 줄 소개

### 멀티플레이 로비 중심의 실시간 웹 게임 MVP
- Flask + Socket.IO 기반
- 로비, 던전, 2인 배구 미니게임 연결
- 서버 권위 판정 + 코인 정산

> 🖼️ [스크린샷 Placeholder] 이 위치에 전체 서비스 흐름 다이어그램 삽입 예정

---

## Slide 2. 왜 만들었나

### 목표
- 실시간 상호작용이 되는 웹 메타버스형 로비
- 콘텐츠 진입 구조(로비 → 던전/미니게임)
- 게임 결과를 서버에서 안전하게 정산

### 핵심 키워드
- Realtime
- Scene 분리
- Server authoritative
- Coin settlement

---

## Slide 3. 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Backend | Flask, Flask-SocketIO |
| Frontend | HTML, CSS, Canvas API, Vanilla JS |
| Data | MongoDB(optional), in-memory fallback |
| Network | Socket.IO |

---

## Slide 4. 시스템 구성

### 페이지 구조
- `/` : 로비
- `/dungeon` : 던전
- `/game/volley` : 2인 배구

### 서버 역할
- 로비 상태 브로드캐스트
- 초대/수락 세션 관리
- 배구 물리/득점/승패 확정
- 코인 차감/보상 처리

> 🖼️ [스크린샷 Placeholder] 이 위치에 서버-클라이언트 구조도 삽입 예정

---

## Slide 5. 로비 핵심 기능

- 닉네임 입장
- 좌우 이동 + 점프
- 공개 채팅(Enter)
- 우클릭 상호작용
- 미니게임 초대/수락
- 포탈 + `↑`로 던전 이동

> 🖼️ [스크린샷 Placeholder] 이 위치에 로비 화면 삽입 예정

---

## Slide 6. 던전 핵심 기능

- 던전 씬 분리
- 전용 HUD/배경/포탈
- 액션 키 훅(Z/X/C)
- 코인 드랍/픽업 UI
- 로비 복귀 동선

> 🖼️ [스크린샷 Placeholder] 이 위치에 던전 화면 삽입 예정

---

## Slide 7. 2인 배구 미니게임

### 게임 규칙
- 실시간 2인 대전
- 공 포물선 + 네트 충돌(MVP 물리)
- 5점 선승

### 코인 규칙
- 시작 시 각 `-10`
- 승자 `+20`

### 종료 UX
- 결과 화면
- 재대결 버튼
- 로비 복귀 버튼

> 🖼️ [스크린샷 Placeholder] 이 위치에 배구 플레이 화면 삽입 예정
> 🖼️ [스크린샷 Placeholder] 이 위치에 결과 패널 화면 삽입 예정

---


