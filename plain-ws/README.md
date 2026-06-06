# Plain WS Chat — XMPP 미사용 데모 (Redis 휘발성 저장)

MongooseIM/XMPP 안 거치고, **Node.js + `ws` + Redis** 만으로 굴러가는 JSON-over-WebSocket 채팅. 같은 채팅 시나리오(1:1 메시지, 온라인 상태)를 XMPP 없이 어떻게 짜는지 보여주는 비교용 미니 서버.

> ⚠️ **저장 책임 분담 (카톡식)**
> - 채팅 archive → **클라이언트 디바이스 메모리(localStorage)** 가 보관. 새로고침/탭 닫기 OK.
> - Redis → **오프라인 미수령 임시버퍼 + 세션 테이블** 전용. 받는 즉시 사라짐.
> - 서버 → 라우팅만. stateless.
> - 영구 archive가 필요하면 XMPP/MongooseIM 채널의 `mod_mam` → PostgreSQL 을 쓰면 됨.

```
            ┌─ 클라 localStorage ── 채팅 archive (영구)
브라우저 ───┤
            └─ ws://localhost:8090/ws ──► Node + ws ──► Redis (휘발성)
                    JSON 메시지            server.js     session:{user}
                                                        inbox:{user}  ← 오프라인일 때만
```

흐름:
```
A 보냄 ──► 서버 ──► B 온라인?
                      ├─ 예 → B에 즉시 send       → B 클라 localStorage 누적
                      └─ 아니오 → LPUSH inbox:B   (Redis 임시보관)
                                  ↓ (나중에 B hello)
                                  LRANGE → DEL → B에 줄줄이 push → B 클라 localStorage 누적
```

루트 프로젝트의 XMPP 클라이언트(`../websocket-client/`)와는 **완전 별개로 동작**. MongooseIM 컨테이너 꺼도 이건 Redis만 살아 있으면 돌아감.

---

## 1. 실행

```powershell
# 1) Redis 컨테이너 띄우기 (루트 docker-compose에 xmpp-redis 추가됨)
cd ..
docker compose up -d xmpp-redis

# 2) 서버 기동
cd plain-ws
npm install      # 처음 한 번만
node server.js
```

→ 브라우저 두 탭 열고 `http://localhost:8090/test.html` (시연 메인). [0. 로그인] 패널에서 jihoon/jihoon123 (또는 emma/emma123) 으로 토큰 발급 → [1. 접속] → [① hello]. 두 번째 탭은 다른 계정으로 같은 흐름.

> **Spring(8081)이 먼저 떠 있어야 함**: `docker compose up -d xmpp-spring xmpp-redis`. plain-ws 의 hello 는 Spring 발급 토큰 없으면 WS close=4001 로 거부됨.

> **공지 채널 시연:** [0-A. Spring 공지 채널] 패널에서 [📡 공지 구독 켜기] → `ws://:8081/ws/notice?token=` 로 구독. `admin/admin123` 으로 로그인한 탭에선 발송 폼도 자동으로 보임 → [📢 발송] 누르면 Redis pub/sub → 구독 중인 모든 탭/브라우저에 동시 도착.

> 포트 8090은 루트 `websocket-client`(8080), MongooseIM HTTP(5280) 와 겹치지 않게 잡음. 변경 시 `PORT=9099 node server.js`.

### 1.1 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT`             | `8090`                      | HTTP/WS 리스닝 포트 |
| `REDIS_URL`        | `redis://localhost:6379`    | Redis 접속 URL |
| `INBOX_TTL_SECONDS`   | `604800` (7일)           | inbox 키 EXPIRE — **오프라인 큐 미수령 시 삭제주기** |
| `SESSION_TTL_SECONDS` | `300` (5분)              | session 키의 EXPIRE — **세션 만료주기** (활동 시 sliding) |
| `HEARTBEAT_MS`        | `30000` (30초)           | `ws.ping()` 간격 — idle 사용자 세션 자동 갱신 + 좀비 탐지 |
| `JWT_SECRET`          | (Spring 기본값과 일치)    | Spring 측과 동일한 HMAC 키 (최소 32 bytes). 다르면 hello 항상 거부 |

---

## 2. Redis 저장 구조

### 2.1 키 네 가지 — 디바이스 단위 세션

```
session:{user}:{deviceId}   HASH   디바이스 단위 세션 메타데이터
                                     fields:
                                       - sid           세션 식별자
                                       - device_id     디바이스 ID
                                       - device_type   "web" | "mobile" | ...
                                       - connected_at  접속 시각 (ms)
                                       - last_seen     마지막 활동 (ms)
                                       - server_id     서버 인스턴스 ID (멀티서버 대비)
                                     ┌─ HSET 으로 hello 시 생성
                                     ├─ EXPIRE SESSION_TTL (기본 300초)
                                     ├─ 활동 시 last_seen 갱신 + EXPIRE 갱신 (sliding)
                                     └─ close 시 DEL

user_devices:{user}         SET    한 user 가 동시에 떠 있는 디바이스 ID 인덱스
                                     → 메시지 fan-out 시 SMEMBERS 로 모든 디바이스 조회.
                                     ┌─ sessionStart 시 SADD
                                     ├─ sessionEnd 시 SREM
                                     └─ 마지막 디바이스 끊기면 DEL.

online                      SET    빠른 온라인 목록 조회용 user 셋 (user 단위)
                                     → 한 디바이스라도 활성이면 SADD, 마지막 끊기면 SREM.
                                     ┌─ getOnline() 이 user_devices SCARD 로 stale 정리
                                       (Redis Set 멤버는 개별 TTL 불가, 이걸로 우회)

inbox:{user}                LIST   user 의 모든 디바이스가 오프라인일 때만 쌓이는 큐.
                                     → 첫 디바이스 hello 시 LRANGE → DEL,
                                       그 시점 활성한 user 의 모든 디바이스에 fan-out.
                                     → 한 디바이스라도 온라인이면 적재 없이 즉시 send.
                                     → 채팅 히스토리는 안 가짐 (휘발 정책).
                                     ┌─ LPUSH (newest-first 삽입)
                                     ├─ EXPIRE INBOX_TTL (기본 7일, 미수령 시 자동 삭제)
                                     └─ 로그인 시 LRANGE 0 -1 → DEL (drain & 삭제)
```

### 2.1.0 디바이스 묶음 — 한 user 여러 디바이스 동시 접속

```
jihoon ─┬─ device A (PC,    deviceId=dev-abc)   ── session:jihoon:dev-abc
        ├─ device B (mobile, deviceId=dev-def)  ── session:jihoon:dev-def
        └─ device C (tablet, deviceId=dev-ghi)  ── session:jihoon:dev-ghi

                  user_devices:jihoon = { dev-abc, dev-def, dev-ghi }
                  online                = { jihoon, ... }

emma → jihoon 에게 "안녕"
        → 세 디바이스 모두에 동시 전달 (server.js socketsOf().values() fan-out)

jihoon 이 PC에서 "응 그래"
        → jihoon 본인의 다른 디바이스 (mobile, tablet) 에도 echo (carbon copy)
        → 어디서 봐도 대화가 동기화됨
```

**deviceId 발급:** 클라(브라우저) 가 자체 생성하고 `localStorage.plainws_device_id_v1` 에 영구 보관. 다른 브라우저/탭(시크릿)은 별도 deviceId 가 됨 → 같은 user 의 별개 device 로 묶임.

**같은 (user, deviceId) 재접속만 replaced.** 다른 deviceId 의 세션은 그대로 살아있음.

> **왜 세션 테이블이 채팅 메시지보다 Redis에 더 잘 맞는가:**
> 1. 자주 조회됨 (메시지 보낼 때마다 "수신자 어디 붙어있나?" 룩업)
> 2. 휘발성이 자연스러움 (재로그인하면 됨)
> 3. TTL이 정확히 맞음 (heartbeat 끊기면 자동 만료)
> 4. ACID 필요 없음
>
> in-memory `Map` 으로 대체할 수도 있지만, **멀티서버로 가면 즉시 깨짐** — 다른 서버에 붙은 사용자를 못 찾음.
> Redis 세션 테이블은 어느 서버에서도 동일하게 조회 가능 → 카톡급 가는 길에 필수.

### 2.1.1 하트비트 (좀비 커넥션 + idle 세션)

`HEARTBEAT_MS` 마다 서버가 모든 연결에 `ws.ping()` 보냄. 두 가지 효과:

1. **idle 사용자 세션 자동 갱신** — 메시지 0건 사용자도 매 하트비트마다 `sessionTouch()` 호출 → `last_seen` + TTL 갱신. 즉 SESSION_TTL이 5분이어도 클라이언트가 살아있으면 세션 영원히 유지.

2. **좀비 커넥션 자동 탐지** — Wi-Fi 끊김/노트북 닫음/브라우저 강제 종료 같이 close 이벤트 없이 사라진 사용자는 ping에 pong 안 옴. 다음 하트비트에서 `isAlive=false` 감지 → `ws.terminate()` → close 이벤트 → `sessionEnd()` 정리.

```
HEARTBEAT_MS=30s, SESSION_TTL=300s 기본값일 때:
  살아있는 사용자: 매 30초 sessionTouch → 영원히 유지
  좀비 사용자:    30~65초 안에 탐지·종료
  정상 close:    즉시 sessionEnd
```

### 2.2 휘발성 / 삭제주기 정책

| 레이어 | 어떻게 휘발 |
|---|---|
| **Redis 서버**       | `--save ""` + `--appendonly no` → 디스크 영속화 0. 컨테이너 재시작 = 전부 소실 |
| **메모리 한계**      | `maxmemory 256mb` + `allkeys-lru` → 한도 차면 LRU evict |
| **세션 단위 TTL**    | 활동 시마다 `EXPIRE 300` (5분) 갱신 → 5분 idle 시 자동 만료 |
| **오프라인 큐 TTL**  | 매 LPUSH 마다 `EXPIRE 604800` (7일) 갱신 → 7일 미수령 시 자동 삭제 |
| **수령 즉시 삭제**   | 로그인 시 `LRANGE → DEL` 한 트랜잭션. 받은 메시지는 Redis에서 사라짐 |

→ 채팅 히스토리는 **아예 안 가짐**. Redis는 "지금 떠있는 세션" 과 "받을 사람 없는 메시지 임시 보관함" 두 가지만.

### 2.3 메시지 객체 형태

```json
{
  "from": "jihoon",
  "to":   "emma",
  "body": "안녕",
  "ts":   1746700000000,
  "id":   "lr5h2k0-x9k2v1"
}
```

`id` 는 `${ts(36)}-${rand6}`. 이전 in-memory 버전의 프로세스 카운터(`m1`, `m2`…) 는 재시작 시 ID 충돌해서 폐기.

---

## 3. 프로토콜 (전부 JSON, 단일 엔드포인트 `/ws`)

### 3.1 클라이언트 → 서버

| type | 필수 필드 | 설명 |
|---|---|---|
| `hello`   | `token`, `deviceId`(+`deviceType?`) | 로그인. JWT 필수 (payload.sub 가 user). `deviceId` 는 클라 영구 식별자. 둘 중 하나라도 빠지면 WS close 4001. 첫 디바이스면 inbox drain & 모든 활성 디바이스에 fan-out |
| `msg`     | `to`, `body`        | 1:1 메시지. 발신자 본인의 다른 디바이스에 carbon copy + 수신자의 모든 활성 디바이스에 fan-out. 수신자가 모든 디바이스 오프라인이면 inbox 적재 |

### 3.2 서버 → 클라이언트

| type | 필드 | 시점 |
|---|---|---|
| `welcome`  | `user`, `role`, `sid`, `deviceId`, `devices[]`, `online[]` | hello 응답. `devices[]` 는 본인의 모든 활성 디바이스 ID들 |
| `presence` | `user`, `online`                | user 의 첫 디바이스 접속/마지막 디바이스 해제 시에만 다른 모두에게 |
| `msg`      | `from`, `to`, `body`, `ts`, `id`| 새 메시지 도착 + 발신자 본인 echo (모든 본인 디바이스에) + 첫 디바이스 로그인 시 큐 drain |
| `error`    | `code?`, `message`              | 에러 (잘못된 JSON, 미인증, deviceId 누락 등) |

### 3.3 한 메시지의 흐름 (XMPP/PostgreSQL과 비교)

```
이 서버:                                MongooseIM(XMPP + PostgreSQL):
─────────────────────────────────────────────────────────────────
{type:"msg",to,body}              vs   <message to='...' type='chat'>
                                         <body>...</body>
                                       </message>

server.js 안:                           mongoose_c2s
  send(self, ...)        ← echo          → user_send_packet hook
  if (target 온라인)                       → mod_mam INSERT INTO mam_message
    send(target, ...)    ← 즉시 전달        → mongoose_router
  else                                   → 수신자 c2s OR mod_offline
    pushInbox(to, msg)   ← Redis 큐         (Mnesia/RDBMS 영구 저장)
```

핵심 차이:
- **프레이밍**: XMPP는 `<stream>` + 스탠자 XML. 여기는 그냥 JSON 메시지 1개 = 1 요청.
- **세션 수립**: XMPP는 stream open → SASL → bind → session 4단계. 여기는 `hello` 1번.
- **저장**: XMPP는 mod_mam 으로 PostgreSQL/MySQL **영구 저장**. 여기는 Redis로 **세션 + 오프라인 큐 전용** (히스토리 없음).
- **확장성**: XMPP는 XEP 표준이 박혀 있어 단톡/MAM/업로드/카본 다 정해진 XML로. 여기는 직접 다 짜야 함.

---

## 4. 한계 (의도적으로 안 넣은 것들)

- 인증/패스워드 — `user` 그대로 신뢰
- TLS — `ws://` 평문 (프로덕션 시 `wss` + 인증서 필요)
- 단톡 — 1:1 만
- 멀티 디바이스 (carbon copy) — ✅ 지원. 한 user 가 deviceId 다른 디바이스로 동시 접속 + fan-out.
- **서버측 채팅 archive** — 아예 안 가짐. 클라 localStorage 가 archive 역할 (카톡식).
- **디바이스 간 과거 기록 동기화** — 새 디바이스로 처음 hello 한 경우 그 디바이스의 localStorage 는 비어있음 (지난 기록 못 봄). 이건 카톡과 다른 부분 — 카톡은 서버 측 백업이 있음. 이 데모는 의도적으로 안 함. 새 메시지부터는 carbon copy 로 동기화됨.
- **메시지 송신 시 토큰 만료 검증** — ✅ 구현 (6주차 ③안). hello 한 번이 아니라 **매 `msg` 진입마다 `jwt.verify(authToken)` 재검증** → 만료/위조 시 `token_expired` + close 4002. 클라가 자동 리프레시한 토큰은 `authRefresh` 메시지로 소켓 유지한 채 교체(만료/sub불일치 → 4002). 검증을 ①메인서버 ②매 send마다 Spring 경유 ③plain-ws 자체 중 **③ 채택** — 외부 왕복 0회로 stateless 라우터 구조 유지. 상세 비교는 루트 `README.md` "6주차 ①" 절 참조.
- **refresh token rotation** — 위 갱신은 access token 재발급(만료 5분 전 자동). rotation/재사용 탐지는 운영급이라 미구현.

이번 과제 3·4번 (XMPP 안 쓰고 WS만으로 통신 + Redis는 오프라인 임시버퍼 전용 + 채팅은 클라 메모리) 의 최소 동작 데모 목적이라 이 정도까지만.

---

## 5. Redis 상태 직접 확인

```powershell
docker exec -it xmpp-redis redis-cli

> KEYS *
1) "session:jihoon:dev-abc"   ← jihoon PC
2) "session:jihoon:dev-def"   ← jihoon 핸드폰
3) "user_devices:jihoon"
4) "online"
5) "inbox:emma"               ← emma 가 모든 디바이스 오프라인일 때 emma 앞으로 온 메시지

> HGETALL session:jihoon:dev-abc
> SMEMBERS user_devices:jihoon     ← { dev-abc, dev-def }
> SMEMBERS online                  ← { jihoon, ... }

> LRANGE inbox:emma 0 -1           ← 쌓인 미수령 메시지
> TTL inbox:emma
(integer) 604793                   ← 7일에서 카운트다운 중

> INFO memory | grep used_memory_human
> DBSIZE
```

→ 쌓여있던 `inbox:emma` 는 emma 의 **첫 디바이스**가 다시 hello 보내는 순간 drain 되고 키 자체가 DEL. 그 시점 활성한 emma 의 모든 디바이스에 동시 fan-out.
