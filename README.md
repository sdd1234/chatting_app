# Chatting App — MongooseIM 기반 카톡 클론

[MongooseIM](https://github.com/esl/MongooseIM) (Erlang XMPP 서버) 위에 **Spring Boot 사이드카** + **Node.js 채팅 라우터** + **React 카톡 UI** + **React Native(Expo) 모바일 앱** 을 얹어, 카카오톡 수준의 메신저 기능을 시연하는 학습/포트폴리오 프로젝트입니다.

> 6주차 산출물 — ① 메시지 송신 시 토큰 만료 검증(plain-ws 자체) ② React → React Native(Expo) 전환 + 파일 첨부·번역 기능 추가. 웹(react-client)·모바일(expo-client) 양쪽 지원.

---

## 빠른 시작

> **세팅 0 → 한 방 실행.** Docker만 설치돼 있으면 클론 후 아래 한 줄이면 끝입니다.
> 별도 설정 파일·환경변수·수동 빌드 불필요 (공개 이미지는 자동 pull, Spring/채팅서버는 소스에서 자동 빌드).

### 1. 전체 스택 기동 (Docker Compose 한 방)
```bash
git clone https://github.com/sdd1234/chatting_app.git
cd chatting_app
docker compose up -d --build
```
다음 **7개** 컨테이너가 올라옵니다 (최초 실행은 빌드/이미지 다운로드로 몇 분 소요):
| 컨테이너 | 포트 | 역할 |
|---|---|---|
| `xmpp-server` (MongooseIM) | 5222 (XMPP) · 5280 (HTTP-WS) · 5551 (GraphQL admin) | XMPP 서버 본체, `mod_mam` 으로 영구 저장 |
| `xmpp-db` (PostgreSQL) | 5432 | mod_mam 메시지 영구 저장 |
| `xmpp-storage` (MinIO) | 9000 / 9001 | 파일 첨부 저장 |
| `xmpp-redis` (Redis) | 6379 | 세션 / 오프라인 inbox / 공지 pub-sub |
| `xmpp-spring` (Spring Boot) | 8081 | 로그인 / JWT / 공지 / Mongoose 프록시 |
| `xmpp-chat` (Node plain-ws) | 8090 | 실제 채팅 WebSocket 라우터 + 데모 화면 |
| `xmpp-web` (React + nginx) | 5173 | 카톡 웹 UI (정적빌드) + 백엔드 프록시 + `/app.apk` 배포 |

### 2. 바로 써보기 (추가 설치 없이)
`docker compose up` 한 줄이면 **카톡 웹 UI까지 같이 뜹니다** (Node 설치 불필요):
- **카톡 웹 UI**: http://localhost:5173 — `xmpp-web`(nginx) 컨테이너가 React 정적빌드를 서빙하고
  `/auth` `/users` `/ws` `/ws/notice` `/files` `/translate` 등 상대경로를 백엔드 컨테이너로 프록시.
- **데모 화면**: http://localhost:8090/test.html — 로그인 / 채팅 / 공지 raw 데모.
- **안드로이드 APK**: http://localhost:5173/app.apk — 폰에서 받아 설치 (같은 LAN, 앱 설정에 PC IP 입력).

JWT 시크릿은 Spring(`:8081`)과 채팅서버(`:8090`)가 동일 기본값을 공유하도록 compose에 설정돼 있어
별도 맞춤 작업 없이 인증이 통합 동작합니다.

> 폰/다른 기기에서 접속하려면 `localhost` 대신 **PC의 LAN IP**(예: `http://192.168.0.9:5173`)를 쓰세요.

### 3. (개발용, 선택) React dev 서버 직접 기동
코드를 고치며 HMR 로 개발할 때만 필요합니다. 단순 시연이면 위 `:5173`(docker)로 충분.
```bash
cd react-client
npm install
npm run dev      # http://localhost:5173 (docker xmpp-web 끄고 띄울 것 — 포트 충돌)
```
> WSL 의 `/mnt/c`(9p) 에서 돌리면 vite 가 파일변경을 못 잡으므로 `vite.config.ts` 의
> `server.watch.usePolling: true` 로 HMR 을 정상화해 둠.

### 3-1. (선택) Expo 모바일 앱 기동
```bash
cd expo-client
npm install
npx expo start   # QR → Expo Go(실기기) 또는 a/i(에뮬레이터)
```
> 실기기/에뮬에서 `localhost` 는 PC 가 아니므로 `src/lib/config.ts` 가 Metro hostUri 로 PC IP 를
> 자동 추출(안 맞으면 `MANUAL_HOST` 수동 지정). WSL2↔폰은 같은 LAN + 8081/8090 노출 필요.

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
│ (비번/저장 위임) │  │ 세션/inbox    │
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
| MongooseIM | **비밀번호(계정) 검증** 위임(`checkPassword`) · 회원가입(`registerUser`) · 메시지 영구 저장(mod_mam). **JWT 는 안 다룸 · 채팅 라우팅 안 함** |
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
│       │   ├── UserService.java            # Mongoose에 비번검증/가입 위임 (JWT 아님)
│       │   ├── JwtUtil.java                # HS256 발급/검증
│       │   ├── MongooseGraphqlController.java # Mongoose 프록시 (admin)
│       │   ├── UserDirectoryController.java # /users (일반 user 친구목록)
│       │   ├── TranslateController.java     # /translate (구글 비공식 프록시)
│       │   ├── FileController.java          # /files 업로드·다운로드 (로컬 저장)
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
│       │   ├── sys.ts                 # 읽음/타이핑 신호
│       │   ├── files.ts               # 파일/이미지 업로드 + \x01FILE\x01 인코딩
│       │   └── translate.ts           # 번역 (Spring /translate 프록시)
│       └── components/
│           ├── TokenStatus.tsx        # JWT 카운트다운 배지
│           ├── NewGroupModal.tsx
│           ├── NoticeComposeModal.tsx
│           ├── NoticeToast.tsx
│           └── Avatar.tsx
│
├── expo-client/                # 모바일 앱 (React Native + Expo SDK 56)
│   ├── App.tsx                         # 인증 기반 네비게이션 + WS 연결
│   └── src/
│       ├── lib/                        # config storage jwt api store ws
│       │                               #  refresh translate files settings
│       ├── screens/                    # Login Register Chats
│       │                               #  ChatRoom(첨부+번역) Settings(언어)
│       └── nav/types.ts
│   # 웹→RN 치환: localStorage→AsyncStorage(+SecureStore), atob→base-64,
│   #   react-router→React Navigation, vite proxy→config.ts 절대URL
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

## 구현된 기능

### ✅ 메신저 핵심
- [x] 로그인 (Spring → Mongoose `checkPassword` 위임)
- [x] 회원가입 (Spring → Mongoose `registerUser` + Redis role 시드)
- [x] JWT 발급 (HS256, 1시간) + 자동 리프레시 (만료 5분 전, 우상단 카운트다운 배지)
- [x] **메시지 송신 시 토큰 만료 재검증** (plain-ws 자체, 6주차 ① — 아래 섹션)
- [x] 1:1 채팅 (실시간 송수신, Redis offline inbox)
- [x] **단톡방** (클라이언트 fanout, 서버 무변경, 멤버 fixed)
- [x] **파일/이미지 첨부** (Spring `/files` 로컬 저장, 웹↔모바일 인코딩 호환)
- [x] **번역** (상대 메시지 → 선택 언어, 번역문만 표시 + "원본 보기" 토글, Spring `/translate` 구글 비공식)
- [x] **디바이스 묶음 세션** (같은 user의 N디바이스 동시 접속 + carbon copy)
- [x] **읽음 "1"** / 안 읽음 카운트 (방 들어가면 자동 read)
- [x] **타이핑 "..."** bouncing (5초 자동 만료)
- [x] **단체 공지** (admin 전용 push, Redis pub-sub, 모든 슬롯 동시 토스트)
- [x] 친구 목록 (`/users` — 일반 user 도 조회, Mongoose `listUsers` 프록시)
- [x] 메시지 영구 저장 (plain-ws → Mongoose `sendMessage` 미러링 → mod_mam)

### ✅ 클라이언트
- [x] **웹** (react-client) — React 18 + Vite, 카톡 UI, 자동 슬롯 분배
- [x] **모바일** (expo-client) — React Native + Expo SDK 56, 동일 기능 포팅 + **하단 탭(친구/채팅)·읽음·타이핑** 반영 (단톡은 추후), EAS preview(apk) 빌드

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
| **6주차** | ① 메시지 송신 시 토큰 만료 검증 = plain-ws 자체 (③안)<br>② React → React Native **Expo CLI** 전환 (RN CLI 금지) + 파일첨부·번역 | ① ✅ / ② ✅ (실폰 구동만 남음) |
| **7주차** | ① JWT 인증 구조 점검 (Spring↔plain-ws 알고리즘 일치 / MongooseIM 인증 커스텀 가능성)<br>② 기능 모듈별 구조 정리 (채팅·파일·번역·주소록)<br>③ 파일 전송 플로우 점검 (업로드→URL 전송→다운로드) | ✅ 점검·문서화 |

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

## 6주차 ② — React Native(Expo) 전환 + 파일·번역

미팅 결정: **Expo CLI** 사용(RN CLI 금지). 기존 `react-client`(PC 웹) 는 시연용으로 유지하고,
화면/로직을 `expo-client` 모바일 앱으로 포팅하면서 **파일 첨부**와 **번역** 을 신규로 추가했다.

### 웹 → React Native 치환
| 웹(react-client) | 모바일(expo-client) |
|---|---|
| `localStorage` (동기) | `AsyncStorage` + 토큰은 `expo-secure-store` (전부 async) |
| `atob` (JWT 디코드) | `base-64` 패키지 |
| `react-router-dom` | `@react-navigation/native-stack` |
| Vite proxy (`/auth` `/ws` …) | `src/lib/config.ts` 절대 URL (Metro hostUri 로 PC IP 자동 추출) |
| 슬롯 멀티 인스턴스(`?slot=`) | 없음 (모바일은 단일 인스턴스) |

### 파일 첨부 (신규)
- 업로드: `POST /files/upload` (multipart) → Spring 이 **로컬 폴더**(`spring-server/uploads/`) 에 저장.
  `{id}` + `{id}.meta`(name/mime/owner) 사이드카. 도커는 `./spring-server/uploads` 볼륨 마운트.
- 표시: `GET /files/{id}` — 이미지면 미리보기, 아니면 파일 링크.
- 채팅 전송: 파일 메타를 메시지 body 에 `\x01FILE\x01` prefix 로 인코딩(`group`/`sys` 와 같은 컨벤션).
  **웹·모바일이 같은 포맷** → expo 사용자 ↔ 웹 사용자가 주고받은 파일을 서로 디코드.
- 업로드된 실제 파일은 `.gitignore` 로 git 에서 제외(코드만 버전관리).

### 번역 (신규)
- `POST /translate` → Spring 이 **구글 비공식 엔드포인트**(`translate.googleapis.com/translate_a/single`, 키 불필요) 프록시. 1주차 번역 기능의 재활용.
- 토글 ON 시 상대 메시지를 선택 언어로 **번역문만** 표시하고, 말풍선 아래 **"원본 보기"** 토글로 원본 확인.

### `/users` (친구 목록 권한)
- 기존 `/admin/mongoose/users` 는 admin 전용이라 일반 user 가 친구목록을 못 봤음.
  `GET /users` 신설 — JWT 만 검증(role 무관), Spring 이 admin 자격으로 `listUsers` 프록시.

> ⚠️ `expo-client` 의 실기기 구동은 WSL2↔폰 LAN 접근 설정이 필요(아직 미검증).
> 웹(react-client)·Spring 백엔드는 5서비스 기동 후 end-to-end 동작 확인 완료.

---

## 7주차 — JWT 인증 구조 점검 · 모듈별 구조 · 파일 전송 플로우

미팅 요구사항 3건을 코드 기준으로 점검하고 문서화했다.

### ① JWT 해시 알고리즘 — 누가 발급하고 누가 검증하나

먼저 전제를 바로잡자: **MongooseIM 은 JWT 를 쓰지 않는다.** JWT 는 Spring ↔ plain-ws 사이의 약속이고,
MongooseIM 은 비밀번호(SCRAM/PLAIN, 내장 DB)만 본다. 그래서 "JWT 알고리즘이 Spring 과 MongooseIM 이
일치하느냐"가 아니라, **"발급처(Spring)와 검증처(plain-ws)의 알고리즘·시크릿이 같으냐"** 가 정확한 질문이다.

| 주체 | JWT 역할 | 알고리즘 / 시크릿 | 근거 |
|---|---|---|---|
| **Spring Boot** | **발급** (로그인 성공 후) | HS256, `JWT_SECRET` | `JwtUtil.java:40` (`signWith(key)`), `application.yml:25-27` |
| **plain-ws** | **검증** (hello + 매 msg) | HS256, **같은** `JWT_SECRET` | `server.js:380 · 459` (`jwt.verify(t, JWT_SECRET, {algorithms:['HS256']})`) |
| **MongooseIM** | JWT 와 **무관** — 내장 DB 로 비번만 검증 | `[auth.internal]` (SCRAM/PLAIN) | `config/mongooseim.toml:132` |

- **(a) 알고리즘 일치?** ✅ Spring·plain-ws 모두 **HS256 + 동일 `JWT_SECRET`**(`docker-compose.yml` 에서 두 서비스에 같은 값 주입, 기본 `demo-secret-…-xx`). 그래서 plain-ws 가 외부 왕복 없이 자체 `jwt.verify` 로 검증 가능 — 6주차 ③안의 전제가 바로 이것.
- **(b) Spring 자체 발급으로 가능?** ✅ 가능, 현재 그렇게 운용. 발급은 Spring 한 곳, 검증은 plain-ws 한 곳. MongooseIM 은 발급/검증 어디에도 끼지 않는다.
- **(c) MongooseIM 인증 로직 커스텀 가능?** ✅ 가능(현재 미사용). 지금은 `[auth.internal]`(Mnesia). MongooseIM 은 `[auth.external]`(외부 HTTP/스크립트 위임)·`[auth.rdbms]`·`[auth.ldap]` 로 교체 가능하므로, 원하면 external auth 로 "Spring/JWT 검증을 MongooseIM 에 물리는" 구성도 가능하다. 다만 현재 분담(채팅은 MongooseIM 미경유)에선 불필요.

> 한 줄 요약: **Spring(발급) ↔ plain-ws(검증) 은 HS256·동일 시크릿으로 완전 일치**하고, **MongooseIM 은 JWT 가 아니라 비밀번호(`checkPassword`)만** 담당한다.

#### ①-보충: "발급=Spring, 검증=MongooseIM" 도 가능한가? (`[auth.jwt]` 조사)

MongooseIM 은 **JWT 인증 백엔드 `[auth.jwt]` 를 공식 지원**한다(공식 문서 확인). 설정 키:

| 키 | 의미 | 우리 값으로 맞추면 |
|---|---|---|
| `secret` | 시크릿 출처 — `value`/`file`/**`env`** 중 하나 | `secret.env = "JWT_SECRET"` (Spring·plain-ws 와 같은 시크릿 재사용) |
| `algorithm` | 서명 알고리즘 — HS256/384/512, RS·ES 256/384/512 | `algorithm = "HS256"` (Spring 과 동일) |
| `username_key` | 아이디가 담긴 claim | `username_key = "sub"` (우리 JWT 는 `sub` = 아이디) |

```toml
[auth.jwt]
  secret.env  = "JWT_SECRET"
  algorithm   = "HS256"
  username_key = "sub"
```

- **(질문 1) 발급 Spring / 검증 MongooseIM 가능?** ✅ 위처럼 같은 시크릿·HS256·`sub` 로 맞추면 MongooseIM 이 Spring 발급 토큰의 서명을 **직접 검증**한다.
- **(질문 2) 해싱 알고리즘 동일?** ✅ MongooseIM 도 **HS256 지원** → Spring(HS256)과 서명 호환(HS256 = 표준 HMAC-SHA256). jjwt(Spring) ↔ Erlang(MongooseIM) 라이브러리 달라도 결과 동일.
- **(질문 3) 커스텀 가능?** ✅ 시크릿 출처/알고리즘/아이디 claim 모두 설정. `[auth.internal]` 과 **병용**도 문서상 가능(여러 method 를 알파벳 순 질의) → 기존 비번 로그인 유지하며 JWT 추가 가능(우리 환경 실테스트는 필요).

> ⚠️ **단 하나의 조건**: `[auth.jwt]` 검증은 **클라가 MongooseIM 에 XMPP(SASL PLAIN)로 직접 접속할 때만** 발동한다(JWT 를 비번 자리에 실어 보냄). 현재 우리 클라는 **plain-ws(:8090)** 에 붙고 MongooseIM(5222/5280)엔 안 붙으므로, 지금 구조에선 `[auth.jwt]` 를 켜도 **발동할 일이 없다**(효과 0, 오히려 `[auth.internal]` 만 두면 잘 되는 현재 로그인과 충돌 위험). 의미를 가지려면 채팅을 MongooseIM 네이티브 XMPP-WS(`:5280 /ws-xmpp`)로 태우는 방향(실서비스 지향, 5주차 "채팅 MongooseIM 미경유" 결정 변경)이 전제. → **현재는 plain-ws 자체 검증 유지가 합리적.** auth.jwt 는 본격 XMPP 이관 시 채택.

### ② 모듈별 구조 (채팅 · 파일 · 번역 · 주소록)

기존 "폴더 구조"가 디렉토리 기준이라, 같은 코드를 **기능 모듈 관점**으로 다시 묶었다.

| 모듈 | spring-server | plain-ws | react-client | expo-client |
|---|---|---|---|---|
| **채팅** | — (라우팅 안 함) | `server.js` (hello/msg/inbox 라우팅 + Mongoose 미러링) | `lib/ws.ts`, `lib/store.ts`, `pages/ChatRoom.tsx` | `lib/ws.ts`, `lib/store.ts`, `screens/ChatRoomScreen.tsx` |
| **파일** | `FileController.java` (업로드/다운로드, `uploads/{id}` + `.meta`) | (메타만 라우팅) | `lib/files.ts` | `lib/files.ts` |
| **번역** | `TranslateController.java` (구글 비공식 프록시) | — | `lib/translate.ts` | `lib/translate.ts` |
| **주소록** | `UserDirectoryController.java` (`/users`, Mongoose `listUsers`) | — | `lib/api.ts` · `pages/Friends.tsx` | `lib/api.ts` · `screens/FriendsScreen.tsx` |
| **인증/로그인** | `AuthController`·`JwtUtil`·`UserService` (발급 + `checkPassword` 위임) | `server.js` (검증) | `lib/api.ts` · `lib/refresh.ts` | `lib/api.ts` · `lib/refresh.ts` |
| **공지** | `NoticeWebSocketHandler`·`AdminController` (Redis pub-sub) | — | `lib/notice.ts` | (미포팅) |

- **서버 무변경 핵심**: 채팅 body 를 control-char prefix 로 인코딩 — `\x01FILE\x01`(파일) · `\x01GRP\x01`(단톡) · `\x01SYS\x01`(읽음/타이핑). plain-ws 는 1:1 라우팅만 하고, 의미 해석은 클라가 한다.

### ③ 파일 전송 플로우

**맞다 — "Spring 에 업로드 → 받은 id/URL 만 메시지로 전송 → 수신자가 그 URL 로 다운로드" 방식이다.**
실제 파일 바이트는 WebSocket 으로 보내지 않고, **메타데이터(id·url·name·mime)만** 채팅에 싣는다.

```
발신자                       Spring (:8081)                  plain-ws (:8090)        수신자
  │ ① POST /files/upload ───▶ uploads/{id} 저장                  │                    │
  │   (multipart, JWT 필수)    + {id}.meta(name/mime/owner)       │                    │
  │ ◀── { id, name, mime } ───┘                                 │                    │
  │ ② body = \x01FILE\x01{file:{id,url,…}} ──▶ (1:1 라우팅) ──────▶ ③ 수신·decode      │
  │                                                             │                    │
  │                            ④ GET /files/{id} ◀──────────────────────────── 클릭   │
  │                            (이미지=인라인 미리보기 / 그 외=파일 링크)               │
```

- **업로드**: `POST /files/upload` 는 **JWT 필수**(`FileController.requireUser`), Spring 로컬 `uploads/` 에 저장(도커 볼륨 마운트). 응답 `{id,name,mime,size}`.
- **전송**: 메시지엔 파일 메타만 → plain-ws 가 일반 텍스트처럼 라우팅(서버 무변경). 웹·모바일 인코딩 동일 → 교차 송수신 OK.
- **다운로드**: 수신자가 `fileUrl(id)` = `GET /files/{id}` 로 받음.
- ✅ **다운로드도 JWT 인증 적용**(`FileController.java`, 7주차 패치). `GET /files/{id}` 는 `Authorization: Bearer` 헤더 또는 `?token=<JWT>` 쿼리(브라우저 `<img>`/`<a>` 는 헤더 불가) 중 하나로 유효 토큰을 요구하며, 없으면 401. 토큰은 메시지에 저장하지 않고 **렌더 시점에 각 클라가 자기 토큰을 부착**(react `authedUrl`, expo `fileSrcUrl`). 권한 범위는 "인증된 사용자" — 수신자도 받아야 하고 `.meta` 에 수신자가 기록되지 않아 owner-only 로는 막지 않는다(더 엄격한 per-수신자 ACL 은 전송 시점 허용 JID 기록이 필요, 추후).

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 프론트엔드 (웹) | React 18, Vite, TypeScript, Tailwind CSS v3, Zustand, react-router-dom |
| 프론트엔드 (모바일) | React Native, Expo SDK 56, React Navigation, AsyncStorage, expo-secure-store, expo-image/document-picker |
| 백엔드 (사이드카) | Spring Boot 3.4, Java 21, Maven, jjwt (HS256), RestClient |
| 채팅 라우터 | Node.js, ws, jsonwebtoken, ioredis |
| 메시지 서버 | MongooseIM (Erlang/OTP, XMPP) |
| 저장 | PostgreSQL 16 (mod_mam), Redis 7, MinIO (S3 호환), 로컬 폴더(파일 첨부) |
| 번역 | 구글 비공식 translate 엔드포인트 (Spring 프록시) |
| 인프라 | Docker Compose, WSL2 (개발 환경) |

---

## 추가 문서

| 파일 | 내용 |
|---|---|
| [XMPP_STANZAS.md](./XMPP_STANZAS.md) | `websocket-client/` 가 주고받는 실제 XMPP XML 스탠자 카탈로그 |
| [API.md](./API.md) | Spring REST + plain-ws WS 엔드포인트 전체 명세 |
| [CHEATSHEET.md](./CHEATSHEET.md) | 빠른 실행 / 디버깅 치트시트 |
| [plain-ws/README.md](./plain-ws/README.md) | 채팅 라우터 프로토콜·Redis 구조·토큰 재검증 |
| [expo-client/README.md](./expo-client/README.md) | 모바일 앱 화면·웹→RN 치환·실행법 |

---

## 보안 주의 (시연/학습 용도)

현재 코드에 박혀있는 데모 시크릿:
- `JWT_SECRET=demo-secret-change-me-32bytes-minimum-please-xx` (32바이트 강제)
- `POSTGRES_PASSWORD=mongooseim_secret`, `MINIO_ROOT_PASSWORD=minioadmin`
- `MONGOOSE_GRAPHQL_PASS=secret`, `ADMIN_PASSWORD=admin123`
- 시드 계정 비번 4건 (`admin123`, `jihoon123`, `emma123`, `minho123`)

→ 모두 `${ENV:default}` 패턴이라 운영 전환 시 `.env` 로 빼면 됨.
→ `bcrypt`, TLS/wss, Refresh token rotation, FCM 푸시는 미구현 (보류 목록).
→ **파일 다운로드(`GET /files/{id}`) 인증은 7주차에 적용**(JWT 헤더/`?token=`). per-수신자 ACL(소유자/수신자만)은 추후.

---

## License
학습/포트폴리오용 데모. MongooseIM 본체는 Apache 2.0.
