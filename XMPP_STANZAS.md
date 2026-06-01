# 우리 채팅이 실제로 사용하는 XMPP 스탠자 모음

이 문서는 `websocket-client/index.html`이 MongooseIM과 주고받는 **실제 XML 스탠자** 카탈로그입니다. 각 항목은 보내는/받는 XML과 발생 시점, 코드 위치를 같이 적습니다.

> 📡 모든 스탠자는 `ws://localhost:5280/ws-xmpp` WebSocket으로 송수신됩니다.
>
> 비교용 — XMPP 없이 평범한 JSON-over-WS로 같은 시나리오를 짠 미니 서버는 `plain-ws/` 참조.
> 로그인/JWT 발급/공지 push는 별도 Spring 사이드카(`spring-server/`, 8081)가 담당.

---

## 1. 세션 수립 (로그인 → READY까지)

### ↗️ 1.1 스트림 열기
```xml
<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='localhost' version='1.0' xml:lang='en'/>
```
- **시점:** WebSocket open 직후, 그리고 SASL 성공 후 한번 더
- **코드:** `stanzaOpen(domain)`

### ↘️ 1.2 서버 features (지원 인증/기능)
```xml
<features xmlns='http://etherx.jabber.org/streams'>
  <mechanisms xmlns='urn:ietf:params:xml:ns:xmpp-sasl'>
    <mechanism>SCRAM-SHA-512</mechanism>
    <mechanism>PLAIN</mechanism>
    ...
  </mechanisms>
  <bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'/>
</features>
```

### ↗️ 1.3 SASL PLAIN 인증
```xml
<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>
  AGppaG9vbgBqaWhvb24xMjM=     <!-- "\0jihoon\0jihoon123" base64 -->
</auth>
```
- **코드:** `stanzaAuth(user, pass)`

### ↘️ 1.4 인증 결과
```xml
<success xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>
<!-- 또는 -->
<failure xmlns='urn:ietf:params:xml:ns:xmpp-sasl'>...</failure>
```

### ↗️ 1.5 자원 바인딩
```xml
<iq type='set' id='m1' xmlns='jabber:client'>
  <bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'>
    <resource>browser-abc123</resource>
  </bind>
</iq>
```
- **코드:** `stanzaBind()`

### ↘️ 1.6 바인딩 결과 (full JID 부여)
```xml
<iq type='result' id='m1'>
  <bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'>
    <jid>jihoon@localhost/browser-abc123</jid>
  </bind>
</iq>
```

### ↗️ 1.7 세션 시작
```xml
<iq type='set' id='m2' xmlns='jabber:client'>
  <session xmlns='urn:ietf:params:xml:ns:xmpp-session'/>
</iq>
```

### ↗️ 1.8 Presence 발행 (온라인 상태)
```xml
<presence xmlns='jabber:client'/>
```
- **시점:** READY 직후 + 친구 요청 자동수락 시
- **코드:** `stanzaPresence()`

### ↗️ 1.9 Keepalive ping (50초마다)
```xml
<iq type='get' id='m99' to='localhost' xmlns='jabber:client'>
  <ping xmlns='urn:xmpp:ping'/>
</iq>
```

### ↘️ 1.10 서버 ping (들어오는 것은 result로 응답)
```xml
<!-- 서버가 보냄 -->
<iq type='get' id='s1' from='localhost'><ping xmlns='urn:xmpp:ping'/></iq>

<!-- 우리가 응답 -->
<iq type='result' id='s1' xmlns='jabber:client'/>
```

### ↗️ 1.11 종료
```xml
<close xmlns='urn:ietf:params:xml:ns:xmpp-framing'/>
```
- **시점:** 로그아웃

---

## 2. Presence (친구 요청/상태)

### ↗️ 2.1 구독 요청
```xml
<presence to='emma@localhost' type='subscribe' xmlns='jabber:client'/>
```
- **코드:** `stanzaSubscribe(to)`

### ↗️ 2.2 구독 수락
```xml
<presence to='emma@localhost' type='subscribed' xmlns='jabber:client'/>
```
- **시점:** 들어온 `subscribe`에 자동 수락
- **코드:** `stanzaSubscribed(to)`

### ↘️ 2.3 들어온 presence
```xml
<presence from='emma@localhost/r' to='jihoon@localhost/r' xmlns='jabber:client'/>
<!-- type='subscribe' | 'subscribed' | 'unavailable' | 없음(=available) -->
```

---

## 3. 1:1 메시지

### ↗️ 3.1 텍스트 메시지 보내기
```xml
<message to='emma@localhost' type='chat' id='m5' xmlns='jabber:client'>
  <body>안녕</body>
</message>
```
- **코드:** `stanzaMsg(to, body, 'chat')`

### ↗️ 3.2 이미지 메시지 보내기 (OOB)
```xml
<message to='emma@localhost' type='chat' id='m6' xmlns='jabber:client'>
  <body>http://localhost:9000/.../photo.jpg</body>
  <x xmlns='jabber:x:oob'>
    <url>http://localhost:9000/.../photo.jpg</url>
  </x>
</message>
```
- **코드:** `stanzaImageMsg(to, url, 'chat')`

### ↘️ 3.3 들어온 1:1 메시지
```xml
<message from='emma@localhost/r' to='jihoon@localhost/r' type='chat' xmlns='jabber:client'>
  <body>안녕</body>
</message>
```

---

## 4. 단톡 메시지 (MUC Light)

### ↗️ 4.1 단톡 메시지 보내기
```xml
<message to='1777-...@muclight.localhost' type='groupchat' id='m7' xmlns='jabber:client'>
  <body>점심뭐먹지</body>
</message>
```
- **코드:** `stanzaMsg(roomJid, body, 'groupchat')`

### ↘️ 4.2 단톡 메시지 받기 (발신자 본인 포함 echo)
```xml
<message from='1777-...@muclight.localhost/jihoon@localhost'
         to='emma@localhost/r' type='groupchat' xmlns='jabber:client'>
  <body>점심뭐먹지</body>
</message>
```
- 핵심: `from`의 슬래시 뒤가 **실제 발신자 bare JID**

---

## 5. 단톡방 관리 (MUC Light)

### ↗️ 5.1 단톡 만들기
```xml
<iq type='set' id='m10' to='muclight.localhost' xmlns='jabber:client'>
  <query xmlns='urn:xmpp:muclight:0#create'>
    <configuration>
      <roomname>Emma, 지훈, 민호 단톡</roomname>
    </configuration>
    <occupants>
      <user affiliation='member'>emma@localhost</user>
      <user affiliation='member'>minho@localhost</user>
    </occupants>
  </query>
</iq>
```
- **코드:** `stanzaCreateRoom(memberJids, roomName)`

### ↘️ 5.2 단톡 affiliation 푸시 이벤트 (생성/멤버변경/탈퇴 모두 이걸로 옴)
```xml
<message from='1777-...@muclight.localhost' to='jihoon@localhost' type='groupchat'>
  <x xmlns='urn:xmpp:muclight:0#affiliations'>
    <version>1777-...</version>
    <user affiliation='owner'>jihoon@localhost</user>
    <user affiliation='member'>emma@localhost</user>
    <user affiliation='member'>minho@localhost</user>
  </x>
  <body/>
</message>
```
- 처리: `handleMucAffiliationEvent(xml)`
- 본인이 `none`이면 → 채팅 리스트에서 방 제거
- 본인이 `owner`/`member`로 추가됐으면 → 채팅 리스트에 방 추가

### ↗️ 5.3 가입한 방 목록 조회
```xml
<iq type='get' id='dq1' to='muclight.localhost' xmlns='jabber:client'>
  <query xmlns='http://jabber.org/protocol/disco#items'/>
</iq>
```
- **코드:** `stanzaJoinedRooms(id)`

### ↘️ 5.4 방 목록 응답
```xml
<iq type='result' id='dq1' from='muclight.localhost'>
  <query xmlns='http://jabber.org/protocol/disco#items'>
    <item jid='1777-...@muclight.localhost'/>
    <item jid='1888-...@muclight.localhost'/>
  </query>
</iq>
```

### ↗️ 5.5 방 멤버 조회
```xml
<iq type='get' id='aff1' to='1777-...@muclight.localhost' xmlns='jabber:client'>
  <query xmlns='urn:xmpp:muclight:0#affiliations'/>
</iq>
```
- **코드:** `stanzaRoomAffiliations(roomJid, id)`

### ↘️ 5.6 멤버 응답
```xml
<iq type='result' id='aff1' from='1777-...@muclight.localhost'>
  <query xmlns='urn:xmpp:muclight:0#affiliations'>
    <version>...</version>
    <user affiliation='owner'>jihoon@localhost</user>
    <user affiliation='member'>emma@localhost</user>
  </query>
</iq>
```

### ↗️ 5.7 방 설정(이름) 조회
```xml
<iq type='get' id='cfg1' to='1777-...@muclight.localhost' xmlns='jabber:client'>
  <query xmlns='urn:xmpp:muclight:0#configuration'/>
</iq>
```
- **코드:** `stanzaRoomConfig(roomJid, id)`

### ↘️ 5.8 방 설정 응답
```xml
<iq type='result' id='cfg1' from='1777-...@muclight.localhost'>
  <query xmlns='urn:xmpp:muclight:0#configuration'>
    <version>...</version>
    <roomname>Emma, 지훈, 민호 단톡</roomname>
  </query>
</iq>
```

### ↗️ 5.9 단톡 나가기
```xml
<iq type='set' id='m20' to='1777-...@muclight.localhost' xmlns='jabber:client'>
  <query xmlns='urn:xmpp:muclight:0#affiliations'>
    <user affiliation='none'>jihoon@localhost</user>
  </query>
</iq>
```
- **코드:** `stanzaLeaveRoom(roomJid)`

---

## 6. 이미지 업로드 (XEP-0363)

### ↗️ 6.1 업로드 슬롯 요청
```xml
<iq type='get' id='up1' to='upload.localhost' xmlns='jabber:client'>
  <request xmlns='urn:xmpp:http:upload:0'
           filename='photo.jpg'
           size='12345'
           content-type='image/jpeg'/>
</iq>
```
- **코드:** `stanzaUploadSlot(id, file, safeName)`
- ⚠️ `filename`은 ASCII로 sanitize 필수 (한글/공백이면 사인 깨짐)

### ↘️ 6.2 슬롯 응답 (사인드 URL 두 개)
```xml
<iq type='result' id='up1' from='upload.localhost'>
  <slot xmlns='urn:xmpp:http:upload:0'>
    <put url='http://localhost:9000/mongooseim-uploads/.../photo.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&amp;X-Amz-Signature=...'/>
    <get url='http://localhost:9000/mongooseim-uploads/.../photo.jpg'/>
  </slot>
</iq>
```

### 🌐 6.3 실제 업로드 (XMPP 아님, HTTP)
```http
PUT http://localhost:9000/mongooseim-uploads/.../photo.jpg?X-Amz-Signature=...
Content-Type: image/jpeg
Content-Length: 12345

<...파일 바이트...>
```
- 받는 쪽: **MinIO** (사인 검증 후 200 OK)
- 그 후 GET URL을 메시지 본문/OOB로 전송 → 시나리오 3.2 또는 4.1 참고

---

## 7. 메시지 히스토리 — MAM (XEP-0313)

### ↗️ 7.1 1:1 히스토리 쿼리
```xml
<iq type='set' id='mam1' xmlns='jabber:client'>
  <query xmlns='urn:xmpp:mam:2' queryid='mam1'>
    <x xmlns='jabber:x:data' type='submit'>
      <field var='FORM_TYPE' type='hidden'><value>urn:xmpp:mam:2</value></field>
      <field var='with'><value>emma@localhost</value></field>
    </x>
    <set xmlns='http://jabber.org/protocol/rsm'>
      <max>30</max>
      <before/>     <!-- 가장 최근 30개 -->
    </set>
  </query>
</iq>
```

### ↗️ 7.2 단톡 히스토리 쿼리 (방 JID로 직접 보냄, with 필터 없음)
```xml
<iq type='set' id='mam2' to='1777-...@muclight.localhost' xmlns='jabber:client'>
  <query xmlns='urn:xmpp:mam:2' queryid='mam2'>
    <x xmlns='jabber:x:data' type='submit'>
      <field var='FORM_TYPE' type='hidden'><value>urn:xmpp:mam:2</value></field>
    </x>
    <set xmlns='http://jabber.org/protocol/rsm'>
      <max>30</max><before/>
    </set>
  </query>
</iq>
```
- **코드:** `loadHistoryFor(chat)` — type에 따라 두 형식 분기

### ↘️ 7.3 아카이브 메시지 (각 메시지가 별개 stanza로 옴)
```xml
<message from='localhost' to='jihoon@localhost/r' xmlns='jabber:client'>
  <result xmlns='urn:xmpp:mam:2' queryid='mam1' id='CK5USSKM0MG1'>
    <forwarded xmlns='urn:xmpp:forward:0'>
      <delay xmlns='urn:xmpp:delay' stamp='2026-05-01T10:18:32Z' from='emma@localhost/r'/>
      <message from='emma@localhost/r' to='jihoon@localhost' type='chat' xmlns='jabber:client'>
        <body>안녕</body>
      </message>
    </forwarded>
  </result>
</message>
```
- 처리: `collectArchive(queryId, xml)` — 누적 후 `<fin/>` 시점에 정렬+렌더

### ↘️ 7.4 쿼리 종료 IQ
```xml
<iq type='result' id='mam1' from='jihoon@localhost' xmlns='jabber:client'>
  <fin xmlns='urn:xmpp:mam:2' complete='true'>
    <set xmlns='http://jabber.org/protocol/rsm'>
      <first index='0'>CK5USSKM0MG1</first>
      <last>CK5USSKM0MQ8</last>
      <count>5</count>
    </set>
  </fin>
</iq>
```
- 처리: `flushArchive(queryId)` — 누적된 메시지를 시간순 정렬하여 채팅창에 표시

---

## 8. 에러 응답 (참고)

### ↘️ 8.1 메시지 에러
```xml
<message type='error' from='emma@localhost' to='jihoon@localhost'>
  <error type='cancel'>
    <service-unavailable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>
    <text>...</text>
  </error>
</message>
```

### ↘️ 8.2 IQ 에러 (업로드 슬롯 거부 등)
```xml
<iq type='error' id='up1'>
  <error type='cancel'>
    <not-acceptable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>
    <text>file too large</text>
  </error>
</iq>
```

---

## 9. 코드 위치 인덱스

`websocket-client/index.html` 안의 주요 함수/생성기:

| 종류 | 함수명 | 설명 |
|---|---|---|
| 생성기 | `stanzaOpen, stanzaAuth, stanzaBind` | 세션 수립용 |
| 생성기 | `stanzaPresence, stanzaSubscribe, stanzaSubscribed` | Presence |
| 생성기 | `stanzaMsg(to, body, type)` | 1:1/단톡 텍스트 |
| 생성기 | `stanzaImageMsg(to, url, type)` | OOB 이미지 |
| 생성기 | `stanzaCreateRoom, stanzaLeaveRoom` | 단톡 생성/탈퇴 |
| 생성기 | `stanzaJoinedRooms, stanzaRoomAffiliations, stanzaRoomConfig` | 단톡 조회 |
| 생성기 | `stanzaUploadSlot` | 업로드 슬롯 |
| 디스패처 | `handleXmpp(xml)` | 들어온 모든 stanza 분류 |
| 단톡 이벤트 | `handleMucAffiliationEvent(xml)` | 5.2 이벤트 처리 |
| MAM | `loadHistoryFor, collectArchive, flushArchive` | 7.x 처리 |

---

## 10. 빠른 실행

```powershell
docker compose up -d
cd websocket-client; node serve.js
```

→ `http://localhost:8080` 에서 `jihoon/jihoon123`, `emma/emma123`, `minho/minho123`

XML 흐름 직접 보려면: 채팅창 좌하단 **`▸ XML 로그`** 클릭 (송신=초록, 수신=파랑).

---

## 11. 통신 모듈 & 서버 라우팅 — XML이 어느 모듈로 매핑되나

브라우저가 보낸 한 스탠자가 서버에서 어떤 경로로 처리되는지 정리.

### 11.1 전체 파이프라인

```
브라우저 (ws_client.js)
   │  ① WebSocket 프레임  ws://localhost:5280/ws-xmpp
   ▼
mod_websockets         WS 프레이밍 제거 → 안에 든 XMPP XML 추출
   │  ② raw <message>/<iq>/<presence>
   ▼
mongoose_c2s (FSM)     <open>/<auth>/<bind>/<session> 직접 처리
   │                   인증 후 상태 = session_established
   │  ③ 인증된 스탠자
   ▼
mongoose_router        to-JID 도메인으로 분기
   ├─ localhost              → 로컬 사용자/모듈 IQ 핸들러
   ├─ muclight.localhost     → mod_muc_light
   └─ upload.localhost       → mod_http_upload
```

### 11.2 통신 진입 모듈 (transport)

| 포트 | 경로 | 모듈 | 역할 |
|---|---|---|---|
| 5280 | `/ws-xmpp` | **mod_websockets** | XMPP-over-WebSocket 종단. 현재 클라이언트가 사용 |
| 5280 | `/http-bind` | mod_bosh | XMPP-over-HTTP long-poll. 미사용 |
| 5285 | `/ws-xmpp` | mod_websockets (TLS) | wss용. 인증서 placeholder 상태 |
| 5222 | (raw TCP) | `[[listen.c2s]]` | 네이티브 XMPP 클라이언트(Gajim 등) |
| 5551/5541/5561 | `/api/graphql` | mongoose_graphql_handler | 관리/도메인/유저 GraphQL (1번 과제 참조) |

### 11.3 스탠자 ↔ 처리 모듈 매핑

| 섹션 | XML 네임스페이스 / 형태 | 처리 주체 | 라우팅 근거 |
|---|---|---|---|
| 1.1·1.11 | `urn:ietf:params:xml:ns:xmpp-framing` | mod_websockets | WS 프레이밍의 `<open>/<close>` |
| 1.3·1.4 | `urn:ietf:params:xml:ns:xmpp-sasl` | mongoose_c2s + `[auth.internal]` | C2S FSM 내부 |
| 1.5·1.6 | `urn:ietf:params:xml:ns:xmpp-bind` | mongoose_c2s | C2S FSM 내부 |
| 1.7 | `urn:ietf:params:xml:ns:xmpp-session` | mongoose_c2s | XMPP 1.0 호환용 no-op |
| 1.8·2.x | `<presence>` (jabber:client) | mongoose_router → **mod_presence** + **mod_roster** | mod_roster가 subscription 상태 저장/푸시 |
| 1.9·1.10 | `urn:xmpp:ping` | **mod_ping** | IQ 핸들러 등록 |
| 3.x | `<message type='chat'>` | mongoose_router (로컬 배달) + 훅들 | 아래 11.4 참조 |
| 4.x | `<message type='groupchat'>` (to=muclight.\*) | **mod_muc_light** | 도메인 `muclight.localhost` 라우팅 |
| 5.1·5.9 | `urn:xmpp:muclight:0#create` / `#affiliations` | mod_muc_light | IQ 핸들러 |
| 5.7·5.8 | `urn:xmpp:muclight:0#configuration` | mod_muc_light | IQ 핸들러 |
| 5.3·5.4 | `disco#items` (to=muclight.\*) | mod_muc_light + mod_disco | `rooms_in_rosters=true` 옵션 |
| 5.5·5.6 | `urn:xmpp:muclight:0#affiliations` (조회) | mod_muc_light | IQ 핸들러 |
| 6.1·6.2 | `urn:xmpp:http:upload:0` | **mod_http_upload** | 도메인 `upload.localhost` |
| 6.3 | (HTTP PUT, XMPP 아님) | MinIO (S3 백엔드) | mod_http_upload는 사인 URL만 발급 |
| 7.1·7.2 | `urn:xmpp:mam:2` | **mod_mam** (pm/muc, RDBMS) | IQ 핸들러 + 훅 (11.4) |
| 7.3·7.4 | `urn:xmpp:forward:0`, `urn:xmpp:delay`, `rsm` | mod_mam (조립) | MAM 응답 포맷 |
| 8.x | `urn:ietf:params:xml:ns:xmpp-stanzas` | mongoose_c2s/router | 표준 에러 포맷 |
| 자동 | `jabber:iq:roster` | **mod_roster** | 친구 추가/제거 시 |
| 자동 | (오프라인 대상) | **mod_offline** (Mnesia) | 수신자 미접속 시 |
| 자동 | (멀티 디바이스) | **mod_carboncopy** | 같은 계정 다른 세션 복사 |

### 11.4 핵심 훅(hook) — `<message type='chat'>` 한 통의 여정

```
발신자 mongoose_c2s (3.1 발송)
   │
   ├─ user_send_packet 훅
   │     ├─ mod_mam              ← PostgreSQL `mam_message` INSERT (발신자 archive)
   │     └─ mod_carboncopy       ← 발신자의 다른 세션에 복사
   │
   ├─ filter_packet              ← 라우팅 직전 마지막 검열
   │
   ▼
mongoose_router (to-JID 분기)
   │
   ▼ 수신자 세션이 살아있음
filter_local_packet
   ├─ mod_mam                    ← 수신자 archive에도 INSERT
   ▼
수신자 mongoose_c2s
   ├─ user_receive_packet 훅
   │     └─ mod_carboncopy       ← 수신자의 다른 세션에 복사
   ▼
WebSocket으로 송신 (3.3 수신)

   ▼ 수신자가 오프라인이면
offline_message_hook
   └─ mod_offline                ← Mnesia에 저장 → 다음 로그인 시 푸시
```

`<message type='groupchat'>` (4.x) 은 router 분기에서 **mod_muc_light**로 들어가 방 멤버 N명에게 fan-out 되며, 각 fan-out에 대해 다시 위 파이프라인이 반복됨. MAM의 `muc` 부분이 방 단위 archive를 INSERT.

### 11.5 한 줄 정리

> **transport는 `mod_websockets` 하나, 그 뒤는 stanza 네임스페이스/도메인을 보고 `mongoose_router`가 등록된 모듈(mod_muc_light, mod_http_upload, mod_mam, mod_ping, mod_roster …)에 분배** — XML 자체가 라우팅 키이고, 각 모듈은 자기 namespace의 IQ 핸들러나 hook을 등록해 끼어드는 구조.
