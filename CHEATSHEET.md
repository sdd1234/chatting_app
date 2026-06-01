# 시연 컨닝페이퍼 — 한 장으로 끝

복붙으로 시연 진행. 외울 거 없음.

---

## 시작 전 준비 (1분)

**PowerShell 창 ① — Spring + Redis 띄우기**
```powershell
cd C:\Users\KIM\Desktop\MongooseIM
docker compose up -d xmpp-redis xmpp-spring
# Spring 부팅 60~90초 대기 (docker compose logs -f xmpp-spring 으로 "Started" 확인)
```

**PowerShell 창 ② — plain-ws 서버**
```powershell
cd C:\Users\KIM\Desktop\MongooseIM\plain-ws
node server.js
```
> JWT_SECRET 기본값이 Spring과 동일하니 환경변수 안 줘도 됨 (운영 시는 둘 다 명시).

**PowerShell 창 ③ — Redis 명령용** (비워둠)

**브라우저 두 탭** (`http://localhost:8090/test.html`)
- 탭 1: [0. 로그인] `jihoon` / `jihoon123` → /auth/login → [1. 접속] → [① hello]
- 탭 2: [0. 로그인] `emma` / `emma123` → 같은 흐름
- (선택 비교용) `http://localhost:8080/` → XMPP 클라이언트

탭 1에서 emma 골라 **"안녕"** 한 번 주고받기. F12 → Network → WS 활성화.

---

## 시연 (6 명령 + 6 멘트, 총 5분)

### 1️⃣ 인프라
```powershell
docker compose ps
```
> "컨테이너 4개 — MongooseIM, PostgreSQL, MinIO, Redis. 다 healthy."

---

### 2️⃣ WebSocket 비-XMPP (3번 과제)
F12 → Network → WS → `ws` 클릭 → Messages

```
↑  {"type":"msg","to":"emma","body":"안녕"}
↓  {"type":"msg","from":"jihoon","to":"emma",...}
```

> "**JSON 평문**. XMPP 안 쓰고 WebSocket 위에 JSON 으로만 통신합니다."

(비교 — XMPP 탭의 프레임도 같이 띄우면 효과 ↑)
```
↑  <message to='emma@localhost' type='chat'><body>안녕</body></message>
```

---

### 3️⃣ Redis 저장 (4번 과제) — 오프라인 큐 + 세션만
```powershell
# emma 가 오프라인일 때 jihoon이 emma에게 메시지 1개 보내고
docker exec xmpp-redis redis-cli KEYS '*'
```
출력 예시:
```
session:jihoon
online
inbox:emma          ← emma 가 오프라인이라 여기 쌓임
```

> "Redis는 **세션 + 오프라인 큐 전용**. 메시지 히스토리는 안 가짐 — 받는 즉시 사라짐."

---

### 4️⃣ 삭제주기/TTL
```powershell
docker exec xmpp-redis redis-cli TTL inbox:emma
# 604798       (7일 카운트다운)
```

> "**오프라인 큐 TTL 7일**. 그 안에 로그인 안 하면 자동 삭제."

---

### 5️⃣ 세션 테이블 (평가자 피드백)
```powershell
docker exec xmpp-redis redis-cli HGETALL session:jihoon
docker exec xmpp-redis redis-cli SMEMBERS online
```

> "평가자께서 '채팅 기록보다 세션 테이블이 Redis 1순위' 라고 지적해주셔서 추가. `session:{user}` Hash + `online` Set, 5분 TTL sliding."

---

### 6️⃣ 즉석 만료 시연
```powershell
docker exec xmpp-redis redis-cli EXPIRE inbox:emma 10
```
**10초 카운트다운**
```powershell
docker exec xmpp-redis redis-cli KEYS inbox:*
# (empty)
```

> "TTL 만료 = 자동 삭제. 이게 '휘발성 + 삭제주기' 정책. (수신자가 로그인하면 더 빨리 — drain 즉시 DEL)"

---

## 마무리 멘트
> "3번(XMPP 없는 WS) + 4번(Redis는 오프라인 큐+세션 전용으로 축소, 채팅 archive는 클라 localStorage = 카톡식 디바이스 메모리) + 평가자 피드백(세션 테이블) 까지 완결됐습니다."

---

## 자주 묻는 질문

| Q | A |
|---|---|
| "전체 DB를 Redis로?" | "Redis는 세션 + 오프라인 큐 전용. 채팅 히스토리 자체를 안 가짐. 영구 보관은 XMPP 채널의 mod_mam → PostgreSQL." |
| "왜 휘발성?" | "데모 의도 + Redis 본분에 충실. 받는 사람이 받는 즉시 사라지고, 미수령분만 7일 임시 보관." |
| "메모리 폭발 안 함?" | "다중 안전장치 — persistence off / LRU 256MB / 세션 TTL 5분 / inbox TTL 7일 + 수령 즉시 DEL." |
| "단톡은?" | "1:1 만. 단톡은 기존 XMPP 채널의 mod_muc_light 가 처리." |
| "멀티 디바이스?" | "지원. `session:{user}:{deviceId}` 분리 + `user_devices:{user}` Set. 한 user 가 PC+핸드폰 동시 접속하면 본인 다른 디바이스에 carbon copy + 상대도 모든 디바이스에 fan-out. 단, 새 디바이스의 과거 채팅 동기화는 안 함 (client localStorage 기반이라)." |
| "공지 채널은?" | "Spring 8081 `/admin/notice` (admin role JWT 필수) → Redis pub/sub `notice.broadcast` → `/ws/notice?token=` 모든 구독자 fan-out. 시연은 test.html [0-A. Spring 공지 채널] 패널 한 화면에서 가능." |
| "GraphQL 직접 호출?" | "클라는 Spring 프록시(`/admin/mongoose/*`) 거침. Mongoose admin GraphQL(5551) 의 Basic Auth `admin:secret` 은 클라가 가지면 안 됨 → Spring 이 대신. 인증이 단순(Basic 한 줄)이라 프록시로 충분. User endpoint(5561, `<jid>:<password>`) 는 사용자별 자격이라 프록시 안 함." |
| "인증?" | "**Spring 사이드카(8081) JWT HS256**. /auth/login으로 토큰 발급 → plain-ws hello에 첨부. 잘못된/없는 토큰은 WS close 4001로 즉시 끊김. 시드 4명: admin/jihoon/emma/minho." |

---

## 막혔을 때

| 증상 | 해결 |
|---|---|
| 8090 안 됨 | PowerShell ① 살아있나 / `node server.js` 다시 |
| F12 프레임 비어있음 | F12 켠 후 새로고침 |
| `KEYS *` 비어있음 | hello 했나 (session:* 생성) / 오프라인 상대에게 보냈나 (inbox:* 생성) / `docker compose up -d xmpp-redis` |
| 메시지 안 감 | 두 탭 username 같음 → 다르게 |

---

## 1분 압축 버전

시간 진짜 없으면:
1. `docker compose ps` (10초)
2. F12 프레임 보여주기 (30초)
3. `KEYS '*'` + `TTL` (15초)
4. `HGETALL session:jihoon` (10초)
5. 마무리 멘트 (5초)

핵심: **Redis에 저장됨 + TTL + 세션 테이블** 셋만 보이면 합격.
