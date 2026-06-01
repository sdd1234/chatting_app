# Spring Boot 사이드카 — 공지 / 로그인 / 토큰

MongooseIM·plain-ws 와 같은 Redis 를 공유하는 **공지/인증 전담** Spring Boot 컨테이너.

```
브라우저 ─── POST /auth/login ───► Spring (8081)  ── HSET auth:user:* ──► Redis
                                       │
브라우저 ─── ws /ws/notice?token=JWT ──┤
                                       │ ◄── SUBSCRIBE notice.broadcast ── Redis
admin    ─── POST /admin/notice ───────┤ ─── PUBLISH notice.broadcast ───► Redis
                                       │
                                       └── 활성 WS 세션 전부에 fan-out
```

| 항목 | 값 |
|---|---|
| 호스트 포트 | 8081 (컨테이너 8080) |
| HTTP 베이스 | `http://localhost:8081` |
| WS 공지 | `ws://localhost:8081/ws/notice?token=<JWT>` |
| Redis 채널 | `notice.broadcast` |
| Java | 21 |
| Spring Boot | 3.4.0 |
| JWT 라이브러리 | jjwt 0.12.6 (HS256) |

---

## 1. API

### 1.1 `POST /auth/login`
```bash
curl -s -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"user":"admin","password":"admin123"}'
```
```jsonc
{
  "token": "eyJhbGciOiJIUzI1...",
  "user":  "admin",
  "role":  "admin",
  "expiresInMs": 3600000
}
```

### 1.2 `GET /auth/verify`
```bash
curl -s http://localhost:8081/auth/verify \
  -H "Authorization: Bearer $TOKEN"
```
```jsonc
{ "user":"admin", "role":"admin", "exp":"2026-05-17T..." }
```

### 1.3 `POST /admin/notice` (admin 권한 필요)
```bash
curl -s -X POST http://localhost:8081/admin/notice \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body":"점검 안내: 오늘 23시","level":"warn"}'
```
```jsonc
{
  "ok": true,
  "id": "9b6e...",
  "channel": "notice.broadcast",
  "redisSubscribers": 1,   // 이 publish 를 받은 인스턴스 수 (현재는 1)
  "localSessions": 3       // 이 인스턴스에 붙어있는 활성 WS 세션 수
}
```

### 1.4 `GET /admin/notice/stats`
이 인스턴스의 활성 WS 세션 수/유저.

### 1.5 `WS /ws/notice?token=<JWT>`
연결 직후 hello 메시지 1개:
```json
{ "type":"hello", "user":"jihoon", "subscribers": 3 }
```
이후 공지 발행 시:
```json
{ "type":"notice", "id":"...", "level":"warn", "body":"점검 안내: 오늘 23시", "from":"admin", "ts":1747... }
```

---

## 2. 시드 계정 (데모용)

`application.yml` 의 `auth.seed` 가 부팅 시 Redis에 HSET:

| user   | password   | role  |
|--------|------------|-------|
| admin  | admin123   | admin |
| jihoon | jihoon123  | user  |
| emma   | emma123    | user  |
| minho  | minho123   | user  |

비밀번호는 SHA-256 hex 로 저장. 운영시 bcrypt + 가입 API로 교체할 것.

---

## 3. 로컬 시연

### 3.1 brower 시연 (권장)

`http://localhost:8090/test.html` 의 **[0-A. Spring 공지 채널]** 패널이 통합 시연용. [0. 로그인] 에서 admin/admin123 로 로그인 → [📡 공지 구독 켜기] + [📢 발송] 한 화면에서 가능. 다른 탭에서 일반 user(`jihoon/jihoon123`) 로 구독만 켜놓으면 admin 발송 시 그 탭에도 동시 도착.

### 3.2 CLI 시연 (websocat 가 있으면)

```bash
# 1) 토큰 두 개 발급
ADMIN=$(curl -s -X POST http://localhost:8081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"user":"admin","password":"admin123"}' | jq -r .token)

USER=$(curl -s -X POST http://localhost:8081/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"user":"jihoon","password":"jihoon123"}' | jq -r .token)

# 2) 유저 토큰으로 공지 WS 구독 (별도 터미널)
websocat "ws://localhost:8081/ws/notice?token=$USER"

# 3) admin 토큰으로 공지 발송
curl -X POST http://localhost:8081/admin/notice \
  -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"점검 안내","level":"warn"}'

# → 2번 터미널에 {"type":"notice", ...} 가 즉시 도착
```

---

## 4. Redis 키 / 채널

| 키 | 타입 | 용도 |
|---|---|---|
| `auth:user:{username}` | Hash | password(sha256 hex), role |
| `notice.broadcast` | (채널) | pub/sub — admin 발행 → 모든 인스턴스가 자기 WS 세션에 fan-out |

기존 plain-ws 의 `session:*`, `inbox:*`, `online` 과는 충돌 없음.

---

## 4-B. MongooseIM GraphQL 프록시

```
브라우저  POST /admin/mongoose/query
  Authorization: Bearer <admin JWT>        ──┐
  body: { query, variables? }                │ JWT 검증 + admin role 확인
                                             ▼
                                       Spring (이 서버)
                                             │ Basic Auth admin:secret 부착
                                             ▼
                                  http://xmpp-server:5551/api/graphql
                                             │
                                             ▼ 응답 그대로 패스스루
                                       브라우저
```

**왜 프록시:** MongooseIM admin GraphQL(5551)의 인증은 Basic Auth `admin:secret` 한 줄뿐. 클라(브라우저)가 그 비밀번호를 직접 갖고 있으면 안 됨 → Spring 이 대신 들고 있고, 클라는 자기 JWT 만 들고 와서 admin role 검증 후 통과.

엔드포인트 3종:
- `POST /admin/mongoose/query` — 임의 GraphQL (`{ query, variables? }`). 결과 raw 패스스루.
- `GET  /admin/mongoose/stats` — uptime/online/registered 미리 박은 편의.
- `GET  /admin/mongoose/users?domain=localhost` — 등록 사용자 목록.

> User endpoint(:5561)는 `<jid>:<password>` 형태라 **사용자별** 자격 필요. 그건 프록시 안 함 — 그건 클라가 자기 비밀번호로 직접 호출해야 함 (필요하면 별도 기능).

---

## 5. 운영 보강 포인트 (지금은 안 함)

- 비밀번호 bcrypt + 가입 API
- Refresh token (현재는 access only, 1시간)
- 공지 영구 보관(현재는 발행 즉시 흘려보냄. 필요 시 `notice:log` List 추가)
- HTTPS / TLS (현재 평문 8081)
- Rate limiting (admin/notice 스팸 방지)
- 사용자별 mute / 카테고리 구독 필터

---

## 6. 환경 변수

| 변수 | 기본 | 설명 |
|---|---|---|
| `REDIS_HOST` | `xmpp-redis` | Redis 호스트 |
| `REDIS_PORT` | `6379` | Redis 포트 |
| `JWT_SECRET` | `demo-secret-change-me-...` | HMAC 키. **최소 32 bytes** 필수 |
| `JWT_EXPIRATION_MS` | `3600000` | 1시간 |
| `ADMIN_PASSWORD` | `admin123` | 시드 admin 비밀번호 (시드 yaml 의 override) |
| `MONGOOSE_GRAPHQL_URL` | `http://xmpp-server:5551/api/graphql` | Mongoose admin GraphQL endpoint |
| `MONGOOSE_GRAPHQL_USER` | `admin` | Basic Auth user |
| `MONGOOSE_GRAPHQL_PASS` | `secret` | Basic Auth pass |
