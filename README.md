# Chatting App — MongooseIM 기반 카톡 클론

[MongooseIM](https://github.com/esl/MongooseIM) (Erlang XMPP 서버) 위에 **Spring Boot 사이드카** + **Node.js 채팅 라우터** + **React 카톡 UI** 를 얹어, 카카오톡 수준의 메신저 기능을 시연하는 학습/포트폴리오 프로젝트입니다.

> 5주차 산출물 — Spring Boot + React 프레임워크로 통합 완료. 6주차 미팅에서 React Native (Expo) 전환과 토큰 만료 검증 강화가 결정됨.

---

## 빠른 시작

### 1. 백엔드 인프라 기동 (Docker Compose)
```bash
docker compose up -d
```
다음 5개 컨테이너가 올라옵니다:
| 컨테이너 | 포트 | 역할 |
|---|---|---|
| `xmpp-server` (MongooseIM) | 5222 (XMPP) · 5280 (HTTP-WS) · 5551 (GraphQL admin) | XMPP 서버 본체, `mod_mam` 으로 영구 저장 |
| `xmpp-db` (PostgreSQL) | 5432 | mod_mam 메시지 영구 저장 |
| `xmpp-storage` (MinIO) | 9000 / 9001 | 파일 첨부 저장 |
| `xmpp-redis` (Redis) | 6379 | 세션 / 오프라인 inbox / 공지 pub-sub |
| `xmpp-spring` (Spring Boot) | 8081 | 로그인 / JWT / 공지 / Mongoose 프록시 |

### 2. 채팅 라우터 (plain-ws) 기동
```bash
cd plain-ws
npm install
node server.js   # :8090 JSON-over-WebSocket
```

### 3. React 카톡 UI 기동
```bash
cd react-client
npm install
npm run dev      # http://localhost:5173
```

### 4. 브라우저로 접속
- **카톡 UI**: http://localhost:5173 (자동으로 슬롯 분배됨, 새 탭 = 새 디바이스/계정)
- **raw WebSocket 콘솔**: http://localhost:8090/test.html (패킷 디버깅)
- 시연 계정: `admin/admin123`, `jihoon/jihoon123`, `emma/emma123`, `minho/minho123`

---

## 아키텍처

```
┌──────────────┐   ┌──────────────┐
│ React :5173  │   │ test.html    │  (브라우저)
└──────┬───────┘   └──────┬───────┘
       │ HTTP /auth/*     │ WS /ws/notice
       │ HTTP /admin/*    │
       ▼                  ▼
┌────────────────────────────────┐
│  Spring Boot :8081 (사이드카)  │
│  로그인 · JWT 발급/검증/리프레시 │
│  공지 푸시 · Mongoose 프록시    │
└────┬──────────────────┬────────┘
     │ GraphQL          │ Redis pub-sub
     │ checkPassword    │ notice broadcast
     │ registerUser     │
     ▼                  ▼
┌─────────────────┐  ┌──────────────┐
│ MongooseIM :5551│  │ Redis :6379  │
│ (인증/저장 위임) │  │ 세션/inbox    │
└─────────────────┘  └──────┬───────┘
                            │
       ┌────────────────────┘
       ▼
┌────────────────────────────┐
│  plain-ws :8090 (Node WS)   │  ← React가 메시지 송수신용으로 연결
│  JSON-WS 라우터 · JWT 검증   │
│  디바이스 묶음 세션 · fanout │
│  Mongoose sendMessage 미러링│
└─────────────────────────────┘
```

**책임 분담**
| 서비스 | 담당 |
|---|---|
| MongooseIM | 인증 위임(`checkPassword`) · 회원가입(`registerUser`) · 메시지 영구 저장(mod_mam). **채팅 라우팅은 안 함** |
| Spring Boot | 로그인 / JWT / 회원가입 API / 공지 push / Mongoose GraphQL 프록시 |
| plain-ws | 실시간 채팅 라우팅 (JWT 검증, 디바이스 묶음 세션, fanout) |
| React | 카톡 UI, 단톡, 읽음/타이핑, 자동 슬롯 분배, JWT 자동 리프레시 |

---

## 폴더 구조

```
MongooseIM/
├── docker-compose.yml          # 5개 컨테이너 일괄 기동
├── config/                     # MongooseIM 설정 (mongooseim.toml)
├── pg-init/                    # PostgreSQL 초기화 (mod_mam 스키마)
│
├── spring-server/              # 백엔드 (Spring Boot 3.4 + Java 21)
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/example/notice/
│       │   ├── AuthController.java         # /auth/login /register /refresh /verify
│       │   ├── UserService.java            # Mongoose에 인증/가입 위임
│       │   ├── JwtUtil.java                # HS256 발급/검증
│       │   ├── MongooseGraphqlController.java # Mongoose 프록시 (admin)
│       │   ├── AdminController.java        # /admin/notice
│       │   ├── NoticeWebSocketHandler.java # /ws/notice 브로드캐스트
│       │   └── ...
│       └── resources/application.yml
│
├── react-client/               # 프론트 (React 18 + Vite + TS + Tailwind)
│   ├── vite.config.ts          # proxy: /auth /admin /ws/notice → :8081
│   ├── index.html              # ★ 자동 슬롯 분배 inline script
│   └── src/
│       ├── pages/
│       │   ├── Login.tsx              # 로그인
│       │   ├── Register.tsx           # 회원가입
│       │   ├── TabLayout.tsx          # 친구/채팅 탭 + JWT 카운트다운
│       │   ├── Friends.tsx            # 친구 목록
│       │   ├── Chats.tsx              # 채팅 리스트 (+새채팅 / 📢공지)
│       │   └── ChatRoom.tsx           # 1:1 + 단톡 통합
│       ├── lib/
│       │   ├── api.ts                 # login/register/refresh
│       │   ├── jwt.ts                 # 토큰 디코드
│       │   ├── refresh.ts             # 만료 5분 전 자동 갱신 watcher
│       │   ├── store.ts               # Zustand 전역 상태
│       │   ├── ws.ts                  # plain-ws 연결
│       │   ├── notice.ts              # Spring /ws/notice 구독
│       │   ├── slot.ts                # ?slot= 격리 헬퍼
│       │   ├── heartbeat.ts           # 슬롯 살아있음 알림
│       │   ├── group.ts               # 단톡 fanout 인코딩
│       │   └── sys.ts                 # 읽음/타이핑 신호
│       └── components/
│           ├── TokenStatus.tsx        # JWT 카운트다운 배지
│           ├── NewGroupModal.tsx
│           ├── NoticeComposeModal.tsx
│           ├── NoticeToast.tsx
│           └── Avatar.tsx
│
├── plain-ws/                   # 채팅 라우터 (Node + ws + Redis)
│   ├── server.js                       # :8090 메인 (hello/msg/inbox)
│   ├── index.html
│   └── test.html                       # 패킷 디버그 콘솔
│
├── websocket-client/           # 원시 XMPP-WebSocket 테스트
│   ├── index.html              # SASL/bind/stanza 카탈로그 시연
│   └── ws_client.js
│
├── XMPP_STANZAS.md             # XMPP 스탠자 카탈로그 (이 프로젝트가 주고받는 실제 XML)
├── API.md                      # REST/WS 엔드포인트 명세
├── CHEATSHEET.md               # 빠른 실행 치트시트
└── README.md                   # ← 이 문서
```

---

## 구현된 기능 (5주차까지 완료)

### ✅ 메신저 핵심
- [x] 로그인 (Spring → Mongoose `checkPassword` 위임)
- [x] 회원가입 (Spring → Mongoose `registerUser` + Redis role 시드)
- [x] JWT 발급 (HS256, 1시간) + 자동 리프레시 (만료 5분 전, 우상단 카운트다운 배지)
- [x] 1:1 채팅 (실시간 송수신, Redis offline inbox)
- [x] **단톡방** (클라이언트 fanout, 서버 무변경, 멤버 fixed)
- [x] **디바이스 묶음 세션** (같은 user의 N디바이스 동시 접속 + carbon copy)
- [x] **읽음 "1"** / 안 읽음 카운트 (방 들어가면 자동 read)
- [x] **타이핑 "..."** bouncing (5초 자동 만료)
- [x] **단체 공지** (admin 전용 push, Redis pub-sub, 모든 슬롯 동시 토스트)
- [x] 친구 목록 (Mongoose `listUsers` 프록시)
- [x] 메시지 영구 저장 (plain-ws → Mongoose `sendMessage` 미러링 → mod_mam)

### ✅ 시연 편의
- [x] **자동 슬롯 분배** — 한 PC에서 새 탭 열기만 하면 자동으로 다른 디바이스로 격리
- [x] 카톡식 모바일 UI (375px 폭, 노란색 테마)
- [x] 채팅 히스토리 localStorage 보존 (재로그인 시 복원)
- [x] forceLogout 시 query string 보존 (슬롯 데이터 손실 방지)

---

## 미팅 진행 내역

### 초기 요구사항
1. 설정파일이 보여야 함 (외부 노출)
2. Docker Compose로 일괄 기동, Docker Desktop에서 관리
3. 컨테이너 설정은 로컬 볼륨 마운트
4. REST API 전체 연동
5. XMPP 프로토콜 분석

### 주차별 진행
| 주차 | 주요 작업 | 상태 |
|---|---|---|
| **1주차** | VM → 윈도우 도커, 홈페이지+클라이언트 1:1, XMPP XML 정리, 번역 기능 | ✅ |
| **2주차** | REST 불가 2가지 식별 (Subscriptions, MUC Light), XML 매핑/통신모듈 분석 | ✅ |
| **3주차** | 웹소켓 직접 송신 (XMPP 미경유), DB 휘발성 → Redis 교체, API 문서화 | ✅ |
| **4주차** | 세션 Redis 분리 (디바이스 묶음), Raids 테이블, Spring 도커화, GraphQL 패킷 분석 | ✅ |
| **5주차** | **Spring Boot + React 프레임워크 통합** (이번 산출물) | ✅ |
| **6주차** | ① 메시지 송신 시 토큰 만료 검증 = plain-ws 자체 (③안)<br>② React → React Native **Expo CLI** 전환 (RN CLI 금지) | ① ✅ 완료 / ② 🔜 진행 중 |

자세한 미팅 결정사항: 위 표의 6주차 항목 참조

---

## 6주차 ① — 메시지 송신 시 토큰 만료 검증

웹소켓(plain-ws)으로 메시지를 보낼 때, 클라가 들고 있는 JWT가 그새 만료됐을 수 있다.
(현재 access token TTL = 1시간) hello 한 번만 검증하고 끝내면, 1시간 넘게 붙어 있는
소켓은 만료된 토큰으로도 계속 메시지를 보낼 수 있게 된다. 그래서 **메시지 송신 시점에도
토큰을 다시 검증**해야 한다. 검증을 "어디서" 할지 세 가지 안을 비교했다.

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| **①** | **메인 서버(MongooseIM)가 관리** | XMPP 표준 세션·SASL 위에서 토큰 수명까지 일괄 관리 | 채팅을 MongooseIM에 안 태우는 현재 아키텍처와 충돌. 라우팅을 Mongoose로 되돌려야 해서 분담 구조가 깨짐 |
| **②** | **웹소켓 send 시마다 Spring을 거쳐 검증** | 검증 로직이 Spring(토큰 발급처) 한 곳에 모임 | 메시지마다 plain-ws → Spring HTTP 왕복 1회 추가 → 지연·부하. 채팅 핫패스에 동기 REST 호출이 끼어 라우터의 의미(stateless 빠른 fan-out)가 무너짐 |
| **③** | **웹소켓(plain-ws)이 자체 검증** ✅ 채택 | 발급처(Spring)와 같은 `JWT_SECRET`만 공유하면 plain-ws가 `jwt.verify`로 자급자족. 외부 왕복 0회, 핫패스 그대로 | 토큰 만료 시 클라가 스스로 갱신분을 다시 올려줘야 함 → `authRefresh` 메시지로 해결 |

### 왜 ③인가
- plain-ws는 이미 **hello에서 JWT를 검증**하고 있다(같은 `JWT_SECRET` 보유). 검증 능력이 이미 그 안에 있으므로, 매 메시지 재검증도 **외부 호출 없이** 가능하다.
- ①은 "채팅은 MongooseIM에 안 태운다"는 5주차 합의를, ②는 "plain-ws는 stateless 라우터"라는 분담을 각각 깨뜨린다. ③만 현재 구조를 유지한다.

### 동작 (구현 완료, 2026-06-01)
```
hello(token)  ──▶ plain-ws: jwt.verify → 성공 시 authToken 보관
msg           ──▶ plain-ws: jwt.verify(authToken) 재검증
                   └ 만료/위조 → {error: token_expired} + close 4002
authRefresh(token) ──▶ plain-ws: 새 토큰 검증 + sub 일치 확인 → authToken 교체
                        └ sub 불일치 → close 4002
```
- 클라(react-client)는 **만료 5분 전 자동 리프레시**(`/auth/refresh`) 성공 직후
  `sendAuthRefresh(token)`으로 갱신 토큰을 plain-ws에 올려, 소켓을 끊지 않고 토큰만 교체한다.

| 위치 | 구현 |
|---|---|
| `plain-ws/server.js` | hello 시 `authToken` 보관 · `msg` 진입마다 `jwt.verify` 재검증 · `authRefresh` 핸들러 (만료/sub불일치 → close 4002) |
| `react-client/src/lib/ws.ts` | `sendAuthRefresh(token)` export · `authRefreshed` 수신 로깅 |
| `react-client/src/lib/refresh.ts` | 자동 리프레시 성공 직후 `sendAuthRefresh()` 호출 |

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 | React 18, Vite, TypeScript, Tailwind CSS v3, Zustand, react-router-dom |
| 백엔드 (사이드카) | Spring Boot 3.4, Java 21, Maven, jjwt (HS256), RestClient |
| 채팅 라우터 | Node.js, ws, jsonwebtoken, ioredis |
| 메시지 서버 | MongooseIM (Erlang/OTP, XMPP) |
| 저장 | PostgreSQL 16 (mod_mam), Redis 7, MinIO (S3 호환) |
| 인프라 | Docker Compose, WSL2 (개발 환경) |

---

## 추가 문서

| 파일 | 내용 |
|---|---|
| [XMPP_STANZAS.md](./XMPP_STANZAS.md) | `websocket-client/` 가 주고받는 실제 XMPP XML 스탠자 카탈로그 |
| [API.md](./API.md) | Spring REST + plain-ws WS 엔드포인트 전체 명세 |
| [CHEATSHEET.md](./CHEATSHEET.md) | 빠른 실행 / 디버깅 치트시트 |

---

## 보안 주의 (시연/학습 용도)

현재 코드에 박혀있는 데모 시크릿:
- `JWT_SECRET=demo-secret-change-me-32bytes-minimum-please-xx` (32바이트 강제)
- `POSTGRES_PASSWORD=mongooseim_secret`, `MINIO_ROOT_PASSWORD=minioadmin`
- `MONGOOSE_GRAPHQL_PASS=secret`, `ADMIN_PASSWORD=admin123`
- 시드 계정 비번 4건 (`admin123`, `jihoon123`, `emma123`, `minho123`)

→ 모두 `${ENV:default}` 패턴이라 운영 전환 시 `.env` 로 빼면 됨.
→ `bcrypt`, TLS/wss, Refresh token rotation, FCM 푸시는 미구현 (보류 목록).

---

## License
학습/포트폴리오용 데모. MongooseIM 본체는 Apache 2.0.
