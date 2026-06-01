# API 문서

이 프로젝트가 **외부에 노출하는 API 표면 전체** 를 한 자리에 모은 문서.

세 종류의 채널이 있고 용도가 다름:

| # | 채널 | 포트 | 프로토콜 | 누가 씀 | 인증 |
|---|---|---|---|---|---|
| 1 | **Plain WS Chat** | 8090 | JSON over WebSocket | `plain-ws/index.html` | JWT (Spring 8081 발급) |
| 2 | **XMPP-over-WS** | 5280 | XMPP XML over WebSocket | `websocket-client/index.html` | SASL PLAIN |
| 3 | **MongooseIM GraphQL** | 5551 / 5541 / 5561 | HTTP POST `/api/graphql` | (관리/운영용 — 클라이언트 미사용) | Basic Auth |
| 4 | **Spring 공지/Auth** | 8081 | HTTP + WebSocket | 모든 클라이언트 (로그인/공지 push) | JWT (HS256) |
| 부속 | **MinIO S3** | 9000 | HTTP PUT (사인된 URL) | 이미지 업로드 | URL signature |

---

## 0. 빠른 포트 표

| 포트 | 노출자 | 경로 | 비고 |
|---|---|---|---|
| 8090 | plain-ws/server.js | `/`, `/ws` | XMPP 미사용 데모 |
| 8080 | websocket-client/serve.js | `/`, `/translate` | XMPP 클라이언트 정적 호스팅 + 번역 프록시 |
| 5280 | mongooseim | `/ws-xmpp`, `/http-bind` | XMPP-over-WebSocket / BOSH (평문) |
| 5285 | mongooseim | `/ws-xmpp`, `/http-bind` | TLS — 인증서 placeholder |
| 5222 | mongooseim | (raw TCP) | 네이티브 XMPP 클라이언트 (Gajim) |
| 5269 | mongooseim | (raw TCP) | XMPP S2S |
| 5551 | mongooseim | `/api/graphql` | GraphQL Admin (Basic Auth) |
| 5541 | mongooseim | `/api/graphql` | GraphQL Domain Admin |
| 5561 | mongooseim | `/api/graphql` | GraphQL User |
| 8081 | xmpp-spring | `/auth/*`, `/admin/notice`, `/ws/notice` | 로그인/토큰발급/공지 push |
| 6379 | xmpp-redis | (Redis 프로토콜) | plain-ws 세션·오프라인 큐 + Spring 인증/공지 채널 |
| 5432 | xmpp-db | (PostgreSQL) | mod_mam 백엔드 |
| 9000 | xmpp-storage (MinIO) | `/{bucket}/{key}` | S3 PUT/GET |
| 9011 | xmpp-storage (MinIO) | 콘솔 | 호스트 9011 → 컨테이너 9001 |
| 9091 | mongooseim | `/metrics` | Prometheus |

---

## 1. Plain WS Chat API (포트 8090)

> XMPP 미사용 데모. 단일 WebSocket 엔드포인트 `/ws` 위에 모든 작업이 JSON 메시지로 흐름. 자세한 Redis 스키마는 `plain-ws/README.md` 2장.

### 1.1 연결

```
ws://localhost:8090/ws
```

### 1.2 클라이언트 → 서버

| type | 필수 필드 | 응답 | 효과 |
|---|---|---|---|
| `hello`   | `token`, `deviceId`(+`deviceType?`) | `welcome { user, role, sid, deviceId, devices[], online[] }` + 첫 디바이스면 큐 drain `msg`* | 디바이스 단위 로그인. payload.sub 가 user, deviceId 는 클라 발급 영구 식별자. 실패 시 WS close 4001 |
| `msg`     | `to`, `body`           | 본인 모든 디바이스 echo(carbon copy) + 수신자 모든 디바이스 fan-out (또는 inbox 적재) | 1:1 메시지 송신 |

```jsonc
// 1) Spring으로 먼저 토큰 발급 — POST :8081/auth/login { user, password }
// 2) plain-ws hello에 토큰 + 디바이스ID 첨부:
{
  "type": "hello",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "deviceId": "dev-abc123",       // 클라 localStorage 영구 보관
  "deviceType": "web"             // 선택. web | mobile | tablet | ...
}

// 메시지 보내기 (디바이스 묶음에서는 본인 다른 디바이스에도 carbon copy 됨)
{ "type": "msg", "to": "emma", "body": "안녕" }
```

> 채팅 히스토리는 plain-ws 에서 안 가짐. 필요하면 XMPP/MongooseIM의 mod_mam → PostgreSQL 사용.

### 1.3 서버 → 클라이언트

| type | 필드 | 시점 |
|---|---|---|
| `welcome`  | `user`, `sid`, `online[]`          | hello 응답 |
| `presence` | `user`, `online` (boolean)         | 누군가 접속/해제 시 다른 모두에게 |
| `msg`      | `from`, `to`, `body`, `ts`, `id`   | 새 메시지 도착 + 발신자 echo + 로그인 시 inbox drain |
| `error`    | `message`                          | 잘못된 JSON, 미인증, 알 수 없는 type 등 |

```jsonc
// 환영
{ "type":"welcome", "user":"jihoon", "online":["emma"] }

// 메시지 도착
{ "type":"msg", "from":"emma", "to":"jihoon", "body":"hi", "ts":1746700000000, "id":"lr5h2k0-x9k2v1" }
```

### 1.4 메시지 객체

```ts
interface ChatMsg {
  from: string;   // 발신 username
  to:   string;   // 수신 username
  body: string;   // 본문
  ts:   number;   // Date.now() ms
  id:   string;   // `${ts(36)}-${rand6}`
}
```

### 1.5 저장 (휘발성)

| 키 | 타입 | 용도 | TTL |
|---|---|---|---|
| `session:{user}:{deviceId}` | **Hash** | **디바이스 단위 세션** — sid, device_id, device_type, connected_at, last_seen, server_id | `SESSION_TTL_SECONDS` (기본 5분, sliding) |
| `user_devices:{user}` | Set | 한 user 가 활성화한 디바이스 ID 인덱스 (메시지 fan-out 시 SMEMBERS) | `SESSION_TTL * 2` (sliding, 마지막 디바이스 끊기면 DEL) |
| `online`         | Set  | 온라인 user 목록 (user 단위, stale 자동 정리) | (멤버별 TTL 없음) |
| `inbox:{user}`   | List | **오프라인 큐 전용** — 모든 디바이스 오프라인일 때만 적재. 첫 디바이스 hello 시 drain & DEL → 활성 디바이스 전부에 fan-out | `INBOX_TTL_SECONDS` (기본 7일, sliding) |

> 채팅 히스토리는 Redis에 안 가짐. 온라인 수신자(디바이스 1개 이상)에게는 즉시 send만 하고 저장하지 않음.

### 1.6 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8090 | HTTP/WS 포트 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 접속 |
| `INBOX_TTL_SECONDS` | 604800 | 오프라인 큐 TTL (미수령 시 자동 삭제) |
| `SESSION_TTL_SECONDS` | 300 | 세션 키 TTL (=세션 만료주기, 활동 시 갱신) |
| `HEARTBEAT_MS` | 30000 | `ws.ping()` 간격 — idle 세션 자동 갱신 + 좀비 탐지 |
| `JWT_SECRET` | (Spring 기본값과 동일) | hello 토큰 HS256 검증 키. Spring과 반드시 동일 |

---

## 2. MongooseIM XMPP-over-WebSocket (포트 5280)

> 메인 채팅 채널. 사용자 클라이언트(`websocket-client/index.html`)가 사용. 모든 스탠자 카탈로그는 루트 `README.md` 1~10장에, 서버 라우팅 매핑은 11장에 있음. 여기서는 요약만.

### 2.1 연결

```
ws://localhost:5280/ws-xmpp     (평문)
ws://localhost:5285/ws-xmpp     (TLS — 인증서 placeholder)
```

### 2.2 세션 수립 (4단계)

```
1) <open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='localhost' version='1.0'/>
2) <auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>...</auth>
3) <iq type='set'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>...</resource></bind></iq>
4) <iq type='set'><session xmlns='urn:ietf:params:xml:ns:xmpp-session'/></iq>
   ↓
5) <presence/>     ← READY
```

### 2.3 주요 동작 ↔ 스탠자 ↔ 처리 모듈

| 동작 | 핵심 XML | 처리 모듈 | README 섹션 |
|---|---|---|---|
| 로그인 | `<auth>`, `<bind>`, `<session>` | mongoose_c2s | 1.3~1.7 |
| 친구 추가 | `<presence type='subscribe'>` | mod_roster | 2.1~2.3 |
| 1:1 메시지 | `<message type='chat'>` | router → mod_mam, mod_offline | 3.x |
| 단톡 메시지 | `<message type='groupchat'>` to=muclight.* | mod_muc_light | 4.x |
| 단톡 생성 | `<iq><query xmlns='urn:xmpp:muclight:0#create'/></iq>` | mod_muc_light | 5.1 |
| 단톡 멤버 변경 | `<iq><query xmlns='urn:xmpp:muclight:0#affiliations'/></iq>` | mod_muc_light | 5.5·5.9 |
| 이미지 업로드 슬롯 | `<iq><request xmlns='urn:xmpp:http:upload:0'/></iq>` | mod_http_upload | 6.1·6.2 |
| 히스토리 조회 | `<iq><query xmlns='urn:xmpp:mam:2'/></iq>` | mod_mam | 7.x |
| Keepalive | `<iq><ping xmlns='urn:xmpp:ping'/></iq>` | mod_ping | 1.9·1.10 |

### 2.4 인증 방식

- **메커니즘**: SCRAM-SHA-512 권장, PLAIN 도 허용
- **자격증명**: `[auth.internal]` — Mnesia에 저장된 비밀번호 매칭
- **계정 등록**: `mod_register` — `[modules.mod_register]` 의 `ip_access` 로 사설망에서만 가입 허용

### 2.5 BOSH (대안)

WebSocket 안 되는 환경 대비. `POST /http-bind` 로 long-poll. 현재 클라이언트 미사용.

---

## 3. MongooseIM GraphQL API (포트 5551 / 5541 / 5561)

> 운영/관리용. 1번 과제에서 다룬 대로, REST가 못 하는 작업(Subscriptions, MUC Light 관리 등) 때문에 GraphQL로 노출. 현재 클라이언트는 호출 안 함.

### 3.1 세 endpoint 차이

| 포트 | schema_endpoint | 권한 범위 | 인증 |
|---|---|---|---|
| 5551 | `admin`        | 서버 전역 관리 (사용자/도메인/통계 등 모두) | Basic Auth: `admin:secret` |
| 5541 | `domain_admin` | 한 도메인 관리자 | Basic Auth: `<jid>:<password>` (도메인 관리자 자격) |
| 5561 | `user`         | 본인 계정 작업 (vCard, roster, last activity 등) | Basic Auth: `<jid>:<password>` |

### 3.2 호출 형태

```bash
# Admin 예: 서버 전체 사용자 수
curl -u admin:secret \
  -H "Content-Type: application/json" \
  -d '{"query":"query { stats { uptimeSeconds registeredUsers } }"}' \
  http://localhost:5551/api/graphql
```

**실제 패킷 (HTTP wire):**
```http
POST /api/graphql HTTP/1.1
Host: localhost:5551
Authorization: Basic YWRtaW46c2VjcmV0       ← "admin:secret" base64
Content-Type: application/json

{"query":"query { stats { uptimeSeconds registeredUsers } }"}
```

응답:
```json
{ "data": { "stats": { "uptimeSeconds": 1234, "registeredUsers": 3 } } }
```

→ **인증은 Basic Auth 한 줄뿐.** 사용자별 자격 필요 없음 → Spring 사이드카(`/admin/mongoose/*`)가 admin JWT 검증 후 대신 호출해줌. 클라는 admin:secret 을 몰라도 됨.

```bash
# User 예: 내 roster 조회
curl -u jihoon@localhost:jihoon123 \
  -H "Content-Type: application/json" \
  -d '{"query":"query { roster { contacts { jid groups } } }"}' \
  http://localhost:5561/api/graphql
```

### 3.3 자주 쓰는 카테고리

| 카테고리 | endpoint | 대표 기능 |
|---|---|---|
| `account`     | admin / user        | 계정 등록·삭제, 비밀번호 변경 |
| `roster`      | admin / user        | 친구 추가/제거 |
| `muc_light`   | admin / user        | **단톡 생성/멤버/설정** — REST API 미지원, 그래서 GraphQL 채택 |
| `mam`         | admin / user        | 메시지 히스토리 조회 |
| `vcard`       | admin / user        | 프로필 카드 |
| `offline`     | admin               | 오프라인 메시지 통계/삭제 |
| `httpUpload`  | admin / user        | 업로드 슬롯 발급 |
| `stanza`      | admin / user        | 임의 스탠자 송신 (REST 불가) |
| `stats`       | admin               | 서버 통계 (1번 과제 GraphQL 우위 사례) |
| `domain`      | admin               | 도메인 추가/제거/도메인 관리자 설정 |
| `subscription`| admin / user        | **실시간 이벤트 구독** — REST 불가, GraphQL 전용 |

### 3.4 스키마 자기 점검 (introspection)

GraphQL Playground 가 같은 endpoint 에서 GET으로 떠 있음:

```
http://localhost:5551/api/graphql   (Admin 스키마, Basic Auth 입력)
http://localhost:5541/api/graphql
http://localhost:5561/api/graphql
```

→ 좌측 트리에서 모든 query/mutation/subscription 확인 가능.

---

## 4. HTTP File Upload (MinIO, 포트 9000)

XMPP-over-WS의 6장(`urn:xmpp:http:upload:0`) 응답으로 받은 사인된 PUT URL을 그대로 호출:

```http
PUT http://localhost:9000/mongooseim-uploads/{path}/{file}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=...
Content-Type: image/jpeg
Content-Length: 12345

<...파일 바이트...>
```

- 인증: 사인 URL (mod_http_upload 가 발급한 5분짜리 단발성)
- GET URL은 익명 다운로드 허용 (`xmpp-storage-init` 가 `mc anonymous set download` 적용)
- 파일 사이즈 제한: `mongooseim.toml` 의 `max_file_size = 10_485_760` (10MB)

---

## 4. Spring 공지/Auth API (포트 8081)

자세한 내용은 [`spring-server/README.md`](spring-server/README.md). 요약:

### 4.1 엔드포인트

| 메서드 | 경로 | 인증 | 역할 |
|---|---|---|---|
| POST | `/auth/login` | 없음 | username/password 검증 → JWT 발급 |
| GET  | `/auth/verify` | Bearer | 토큰 유효성 + claims 조회 |
| POST | `/admin/notice` | Bearer (admin) | 공지 발행 → Redis pub/sub fan-out |
| GET  | `/admin/notice/stats` | Bearer (admin) | 이 인스턴스 활성 WS 세션 통계 |
| WS   | `/ws/notice?token=<JWT>` | JWT (query) | 공지 push 채널 (서버→클라) |
| POST | `/admin/mongoose/query` | Bearer (admin) | **MongooseIM GraphQL 임의 쿼리 프록시** (Basic Auth admin:secret 으로 :5551 호출) |
| GET  | `/admin/mongoose/stats` | Bearer (admin) | uptime/online/registered 한 번에 |
| GET  | `/admin/mongoose/users?domain=` | Bearer (admin) | 등록 사용자 목록 |

### 4.2 흐름

```
admin → POST /admin/notice
            │
            ▼
         Redis PUBLISH notice.broadcast
            │
            ▼
   모든 인스턴스 (NoticeWebSocketHandler.onRedisNotice)
            │
            ▼
   각자 로컬 WS 세션에 fan-out
            │
            ▼
   브라우저 (ws onmessage)
```

### 4.3 JWT 페이로드

```json
{ "sub":"jihoon", "role":"user", "iat":..., "exp":... }
```

HS256. 비밀키는 `JWT_SECRET` 환경변수 (최소 32 bytes).

### 4.4 시드 계정 (데모)

`admin/admin123`, `jihoon/jihoon123`, `emma/emma123`, `minho/minho123`. SHA-256 hex 저장. 운영 시 bcrypt + 가입 API 추가 예정.

---

## 5. 정리 — 어떤 API를 언제 쓰나

| 시나리오 | 채널 | 이유 |
|---|---|---|
| 메인 채팅 (실시간 메시지/단톡/MAM) | XMPP-over-WS (5280) | 표준 + MongooseIM 모듈 풀 활용 |
| XMPP를 안 쓰는 외부 클라이언트 | Plain WS (8090) | JSON 한 줄로 끝, Redis 휘발성 |
| **로그인 / JWT 토큰 발급** | **Spring (8081)** `/auth/login` | 채팅 채널과 분리된 인증 책임 |
| **공지 / 푸시** | **Spring (8081)** `/admin/notice` + `/ws/notice` | Redis pub/sub fan-out, 멀티 인스턴스 OK |
| 운영자가 단톡 강제 생성 / 사용자 통계 / 도메인 관리 | GraphQL Admin (5551) | REST 미지원 영역 |
| 사용자가 자기 vCard 수정, roster 조회 | GraphQL User (5561) | GraphQL 한 endpoint로 batch |
| 이미지/파일 업로드 | XMPP 슬롯 요청 + MinIO PUT | XEP-0363 |
| 모니터링 | Prometheus `/metrics` (9091) | 메트릭 수집 |

---

## 6. 변경 이력 (이번 주 과제)

- **2026-05-17** **MongooseIM GraphQL 프록시 (Spring)** — `MongooseGraphqlController` 신설. `/admin/mongoose/query` (admin JWT 필수) + 편의 엔드포인트 `/admin/mongoose/stats`, `/admin/mongoose/users`. 내부적으로 RestClient 가 Basic Auth admin:secret 으로 `xmpp-server:5551/api/graphql` 호출. test.html 에 [0-A] admin 박스 내부에 [🐘 Mongoose GraphQL] 도구 추가 (admin role 일 때만).
- **2026-05-17** **디바이스 묶음 세션** — `session:{user}` → `session:{user}:{deviceId}` 로 분리. `user_devices:{user}` Set 인덱스 신규. 한 user 가 PC+핸드폰+태블릿 동시 접속 가능. msg 시 본인 다른 디바이스 carbon copy + 수신자 모든 디바이스 fan-out. inbox drain 도 user 단위 한 번 (활성 모든 디바이스에 fan-out). 클라는 `localStorage.plainws_device_id_v1` 에 deviceId 영구 보관. hello 페이로드에 `deviceId` + `deviceType?` 의무 추가.
- **2026-05-17** **plain-ws + Spring JWT 통합** — `plain-ws/server.js` hello 가 토큰 의무화. Spring과 동일 `JWT_SECRET` 으로 검증. payload.sub 가 user (m.user 무시 — 변조 방지). 실패 시 WS close 4001. `jsonwebtoken` 의존성 추가. `test.html` 에 [0. 로그인] 패널 신설 — username/password → `/auth/login` → 토큰 localStorage 저장 (`plainws_jwt_v1`) → hello 자동 첨부.
- **2026-05-17** **Spring Boot 사이드카 추가** (`spring-server/`, 호스트 8081). 로그인/JWT 발급/공지 push 담당. 공지는 Redis pub/sub `notice.broadcast` 채널로 멀티 인스턴스 fan-out. docker-compose에 `xmpp-spring` 서비스 추가. 시드 계정 4개(admin/jihoon/emma/minho).
- **2026-05-17** **Redis 역할 축소** — `chat:{a}:{b}` archive 통째로 제거. Redis는 이제 `session:*` + `inbox:*` 두 가지만 가짐 ("세션 + 오프라인 임시버퍼" 전용). 온라인 수신자에게는 저장 없이 즉시 send만. plain-ws `history` 명령도 폐기.
- **2026-05-08** plain-ws 추가 (3번 과제). XMPP 미사용 채팅 데모.
- **2026-05-08** plain-ws 저장소 in-memory → Redis 교체 + 휘발 TTL (4번 과제). docker-compose에 `xmpp-redis` 서비스.
- **2026-05-08** README.md 11장 추가 — 스탠자-모듈 매핑 (2번 과제).
- **2026-05-08** REST→GraphQL 전환 사유 정리 (1번 과제). 핵심 미지원 2가지: **Subscriptions**, **MUC Light 관리 명령**.
- **2026-05-08** **세션 테이블 Redis로 추가** (평가자 피드백 반영). `session:{user}` Hash + `online` Set, SESSION_TTL=300s sliding. 채팅 메시지보다 Redis가 더 잘 맞는 정통 use case.
- **2026-05-08** **하트비트 + 운영 모니터링**. 30초 `ws.ping()` 으로 idle 세션 자동 갱신 + 좀비 탐지. DEMO.md에 `docker compose ps`, Prometheus `/metrics`, Redis `INFO` 시연 추가.
