#!/usr/bin/env node
//
// Plain WebSocket Chat Server  (XMPP 미사용 / MongooseIM 안 거침)
//
// 저장소: Redis  (휘발성 — appendonly/save 모두 끔, TTL로 자동 만료)
//   * Redis는 "세션 + 오프라인 임시버퍼" 전용. 채팅 히스토리는 안 가짐.
//
//   session:{user}:{deviceId}  Hash  디바이스 단위 세션 메타
//                                      sid/connected_at/last_seen/server_id/device_type
//                                      → TTL 5분, 활동 시마다 갱신. 끊기면 close에서 DEL.
//   user_devices:{user}        Set   해당 user 의 활성 deviceId 인덱스
//                                      → 메시지 fan-out 시 SMEMBERS 로 모든 디바이스 조회.
//                                      → 마지막 디바이스 끊기면 DEL.
//   online                     Set   현재 활성 디바이스가 1개 이상인 user 들
//                                      → presence/online 목록 조회용. user 단위.
//   inbox:{user}               List  수신자 user 가 모든 디바이스 오프라인일 때만 쌓이는 큐.
//                                      → 첫 디바이스 hello 시 LRANGE → DEL, 그 시점 활성 모든
//                                        디바이스에 fan-out (drain). user 단위 한 통.
//                                      → 한 디바이스라도 온라인이면 적재 없이 즉시 send.
//
//   카본 카피: 한 user 의 한 디바이스가 메시지 보내면, 본인의 다른 디바이스에도 echo
//             (=어디서 봐도 대화 동기화). 새 디바이스로 처음 hello 한 경우 과거 기록은
//             서버가 안 가짐 (클라 localStorage 가 archive). 카톡과는 그 부분 다름.
//
// 인증:
//   hello 메시지에 Spring(8081 /auth/login)이 발급한 JWT 첨부 필수.
//   같은 JWT_SECRET 환경변수로 검증. payload.sub 를 user 로 사용 (m.user 무시 — 변조 방지).
//
// 환경 변수:
//   PORT                기본 8090
//   REDIS_URL           기본 redis://localhost:6379
//   INBOX_TTL_SECONDS   오프라인 큐 TTL (기본 604800 = 7일, 미수령 시 자동 삭제)
//   SESSION_TTL_SECONDS 세션 키 TTL (기본 300 = 5분, 활동 없으면 만료)
//   HEARTBEAT_MS        ws.ping() 간격 (기본 30000 = 30초)
//                          - 매 ping 시 sessionTouch() 호출 → idle 사용자도 세션 안 만료
//                          - 직전 ping에 pong 응답 없으면 좀비로 보고 terminate
//   JWT_SECRET          Spring 측과 동일한 HMAC 키 (최소 32 bytes).
//                          기본값은 Spring 데모 기본값과 일치 — 로컬 시연용.
//   MONGOOSE_GRAPHQL_URL/USER/PASS/DOMAIN
//                       메시지를 Mongoose에 GraphQL mutation 으로 미러링.
//                          - fire-and-forget: 실패해도 채팅은 정상 동작.
//                          - 효과: mod_mam 이 PostgreSQL 에 영구 저장 (카톡식 archive 위임).
//                          - URL 비우면 미러링 비활성.
//

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');

const PORT          = Number(process.env.PORT) || 8090;
const REDIS_URL     = process.env.REDIS_URL || 'redis://localhost:6379';
const INBOX_TTL     = Number(process.env.INBOX_TTL_SECONDS) || 7 * 86400;
const SESSION_TTL   = Number(process.env.SESSION_TTL_SECONDS) || 300;
const HEARTBEAT_MS  = Number(process.env.HEARTBEAT_MS) || 30_000;   // 30초마다 ping
const JWT_SECRET    = process.env.JWT_SECRET || 'demo-secret-change-me-32bytes-minimum-please-xx';
const SERVER_ID     = `${require('os').hostname()}-${process.pid}`;
const ROOT          = __dirname;

// ── Mongoose GraphQL 미러링 설정 ──
const MONGOOSE_URL  = process.env.MONGOOSE_GRAPHQL_URL  || 'http://localhost:5551/api/graphql';
const MONGOOSE_USER = process.env.MONGOOSE_GRAPHQL_USER || 'admin';
const MONGOOSE_PASS = process.env.MONGOOSE_GRAPHQL_PASS || 'secret';
const MONGOOSE_DOMAIN = process.env.MONGOOSE_DOMAIN     || 'localhost';
const MONGOOSE_ENABLED = !!MONGOOSE_URL;
const MONGOOSE_AUTH = 'Basic ' + Buffer.from(`${MONGOOSE_USER}:${MONGOOSE_PASS}`).toString('base64');

if (Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  console.error(`[boot] JWT_SECRET must be >= 32 bytes (got ${Buffer.byteLength(JWT_SECRET, 'utf8')})`);
  process.exit(1);
}

// ── 정적 파일 ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
};
// ── MONITOR 스트리밍 ──────────────────────────────────────────
// docker exec xmpp-redis redis-cli MONITOR 의 stdout 을 SSE 로 브라우저에 푸시
const MONITOR_BUFFER_MAX = 200;
const monitorBuffer = [];                  // 최근 N개 (새 구독자에게 즉시 보내줌)
const monitorSubscribers = new Set();      // active SSE response objects
let   monProc = null;

function pushMonitor(line) {
  monitorBuffer.push(line);
  if (monitorBuffer.length > MONITOR_BUFFER_MAX) monitorBuffer.shift();
  for (const res of monitorSubscribers) {
    try { res.write(`data: ${JSON.stringify(line)}\n\n`); } catch (_) {}
  }
}

function startMonitor() {
  monProc = spawn('docker', ['exec', '-i', 'xmpp-redis', 'redis-cli', 'MONITOR']);
  monProc.stdout.on('data', chunk => {
    chunk.toString().split('\n').forEach(l => { if (l.trim()) pushMonitor(l); });
  });
  monProc.stderr.on('data', d => console.error('[monitor stderr]', d.toString().trim()));
  monProc.on('exit', code => {
    console.log(`[monitor] redis-cli exited code=${code}, restarting in 3s`);
    monProc = null;
    setTimeout(startMonitor, 3000);
  });
  monProc.on('error', err => console.error('[monitor proc]', err.message));
  console.log('[monitor] streaming MONITOR via SSE /monitor-stream');
}

const httpServer = http.createServer(async (req, res) => {
  let urlPath = req.url.split('?')[0];

  // ── /monitor-stream — Redis MONITOR 실시간 스트림 (SSE) ──
  if (urlPath === '/monitor-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // 새 구독자에게 최근 버퍼 즉시 전송
    monitorBuffer.forEach(l => res.write(`data: ${JSON.stringify(l)}\n\n`));
    monitorSubscribers.add(res);
    req.on('close', () => monitorSubscribers.delete(res));
    return;
  }

  // ── /expire-inboxes?ttl=30 — 모든 inbox:* 키 TTL을 N초로 강제 단축 (시연용) ──
  if (urlPath === '/expire-inboxes') {
    try {
      const ttl = Math.max(1, Math.min(3600, Number(new URL(req.url, 'http://x').searchParams.get('ttl')) || 30));
      const keys = await redis.keys('inbox:*');
      let updated = 0;
      for (const k of keys) {
        const ok = await redis.expire(k, ttl);
        if (ok) updated++;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ updated, ttl, keys }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── /redis-state — 현재 Redis 안 상태를 JSON으로 반환 (test.html 패널용) ──
  if (urlPath === '/redis-state') {
    try {
      const keys = await redis.keys('*');
      const out = { sessions: {}, userDevices: {}, online: [], inboxes: {}, keyCount: keys.length };
      for (const k of keys) {
        if (k.startsWith('session:')) {
          out.sessions[k] = { fields: await redis.hGetAll(k), ttl: await redis.ttl(k) };
        } else if (k.startsWith('user_devices:')) {
          out.userDevices[k] = { devices: await redis.sMembers(k), ttl: await redis.ttl(k) };
        } else if (k === 'online') {
          out.online = await redis.sMembers(k);
        } else if (k.startsWith('inbox:')) {
          out.inboxes[k] = { messages: await redis.lRange(k, 0, -1), ttl: await redis.ttl(k), len: await redis.lLen(k) };
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify(out, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // ── 정적 파일 ──
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, decodeURIComponent(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type': 'text/plain'}); return res.end('Not Found: '+urlPath); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ── Redis ────────────────────────────────────────────────────
const redis = createClient({ url: REDIS_URL });
redis.on('error', err => console.error('[redis]', err.message));

const inboxKey = u  => `inbox:${u}`;
const newId    = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// 오프라인 큐: 수신자가 오프라인일 때만 호출.
async function pushInbox(user, msg) {
  const k = inboxKey(user);
  await redis.multi()
    .lPush(k, JSON.stringify(msg))
    .expire(k, INBOX_TTL)
    .exec();
}

// ── Mongoose 미러링: GraphQL mutation 으로 메시지 한 부 복사 송신 ──
// fire-and-forget. 실패해도 채팅은 정상 동작. mod_mam 이 PostgreSQL 에 영구 저장.
// 도착지 Mongoose: from/to 모두 JID(`user@domain`) 형식 필요. 우리 user 는 그냥 "jihoon"
// 같은 짧은 이름이라 MONGOOSE_DOMAIN 붙여서 변환.
async function forwardToMongoose(fromUser, toUser, body) {
  if (!MONGOOSE_ENABLED) return;
  const fromJid = `${fromUser}@${MONGOOSE_DOMAIN}`;
  const toJid   = `${toUser}@${MONGOOSE_DOMAIN}`;
  const query = 'mutation($f:JID!,$t:JID!,$b:String!){ stanza{ sendMessage(from:$f,to:$t,body:$b){ id } } }';
  try {
    const r = await fetch(MONGOOSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': MONGOOSE_AUTH },
      body: JSON.stringify({ query, variables: { f: fromJid, t: toJid, b: body } }),
    });
    const json = await r.json();
    if (json.errors) {
      console.error(`[mongoose-mirror] ${fromJid} → ${toJid} errors:`, JSON.stringify(json.errors));
    } else {
      const id = json?.data?.stanza?.sendMessage?.id;
      console.log(`[mongoose-mirror] ${fromJid} → ${toJid} ok stanza-id=${id}`);
    }
  } catch (e) {
    console.error(`[mongoose-mirror] ${fromJid} → ${toJid} fetch failed:`, e.message);
  }
}

// 로그인 시 호출. 쌓여있던 메시지를 한 번에 빼고 키 삭제.
async function drainInbox(user) {
  const k = inboxKey(user);
  const items = await redis.lRange(k, 0, -1);
  if (items.length) await redis.del(k);
  return items.map(s => JSON.parse(s)).reverse();   // 오래된 → 최신 순
}

// ── 세션 테이블 (Redis, 디바이스 단위) ────────────────────────
const sessionKey  = (u, d) => `session:${u}:${d}`;
const devicesKey  = u      => `user_devices:${u}`;

async function sessionStart(user, deviceId, deviceType) {
  const sid = newId();
  const now = Date.now();
  await redis.multi()
    .hSet(sessionKey(user, deviceId), {
      sid,
      device_id:    deviceId,
      device_type:  deviceType || 'web',
      connected_at: String(now),
      last_seen:    String(now),
      server_id:    SERVER_ID,
    })
    .expire(sessionKey(user, deviceId), SESSION_TTL)
    .sAdd(devicesKey(user), deviceId)
    .expire(devicesKey(user), SESSION_TTL * 2)   // 세션보다 2배. 마지막 device close 시 DEL 됨
    .sAdd('online', user)
    .exec();
  return sid;
}

async function sessionTouch(user, deviceId) {
  // 세션 키가 만료/소실됐으면(TTL 초과 또는 Redis 재시작) 처음부터 다시 만듦
  const exists = await redis.exists(sessionKey(user, deviceId));
  if (!exists) return sessionStart(user, deviceId, 'web');
  await redis.multi()
    .hSet(sessionKey(user, deviceId), 'last_seen', String(Date.now()))
    .expire(sessionKey(user, deviceId), SESSION_TTL)
    .expire(devicesKey(user), SESSION_TTL * 2)
    .sAdd('online', user)
    .exec();
}

// 한 디바이스 close. 마지막 디바이스였으면 online 에서 user 도 제거하고 user_devices 도 DEL.
// 반환값 lastDeviceGone: 마지막 디바이스였는지 (presence off 알림에 사용).
async function sessionEnd(user, deviceId) {
  await redis.multi()
    .del(sessionKey(user, deviceId))
    .sRem(devicesKey(user), deviceId)
    .exec();
  const remain = await redis.sCard(devicesKey(user));
  if (remain === 0) {
    await redis.multi()
      .del(devicesKey(user))
      .sRem('online', user)
      .exec();
    return { lastDeviceGone: true };
  }
  return { lastDeviceGone: false };
}

async function getOnline() {
  // 만료된 세션이 online Set에 남아있을 수 있으니 user_devices SCARD 로 정리
  const users = await redis.sMembers('online');
  if (!users.length) return [];
  const counts = await Promise.all(users.map(u => redis.sCard(devicesKey(u))));
  const live = [];
  const stale = [];
  users.forEach((u, i) => (counts[i] > 0 ? live : stale).push(u));
  if (stale.length) await redis.sRem('online', stale);
  return live;
}

// 한 user 의 모든 활성 디바이스 ID 목록. fan-out 라우팅용.
async function devicesOf(user) {
  return redis.sMembers(devicesKey(user));
}

// ── WebSocket ────────────────────────────────────────────────
// localSockets: 이 프로세스에 붙은 WebSocket 객체 보관 (라우팅용 — Redis에 못 넣음)
//   Map<user, Map<deviceId, ws>>
//   한 user 가 PC+핸드폰+태블릿 동시 접속 → user 키 아래 deviceId 별로 ws 보관.
// 진짜 "세션 테이블" 은 Redis 의 session:{user}:{deviceId} Hash 가 담당.
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const localSockets = new Map();    // user → Map<deviceId, ws>

const send = (ws, obj) => { try { ws.send(JSON.stringify(obj)); } catch (_) {} };

// 한 user 의 모든 활성 디바이스 소켓 (이 프로세스에 붙어있는 것만) 반환.
function socketsOf(user) {
  return localSockets.get(user) || new Map();
}

// 한 user 한 디바이스에 socket 등록. 같은 (user, deviceId) 가 이미 있으면 그 소켓을 반환 (caller 가 close 결정).
function attachSocket(user, deviceId, ws) {
  let bucket = localSockets.get(user);
  if (!bucket) { bucket = new Map(); localSockets.set(user, bucket); }
  const prev = bucket.get(deviceId);
  bucket.set(deviceId, ws);
  return prev || null;
}

function detachSocket(user, deviceId, ws) {
  const bucket = localSockets.get(user);
  if (!bucket) return false;
  if (bucket.get(deviceId) !== ws) return false;   // 이미 교체된 소켓이면 무시
  bucket.delete(deviceId);
  if (bucket.size === 0) localSockets.delete(user);
  return true;
}

// 다른 모든 user 에게 presence 알림 (자기 자신 제외). user 단위.
function presenceOn(user, on) {
  for (const [u, bucket] of localSockets) {
    if (u === user) continue;
    for (const w of bucket.values()) send(w, { type: 'presence', user, online: on });
  }
}

wss.on('connection', (ws, req) => {
  let user = null;
  let deviceId = null;
  // 6주차 ③안: hello 시 검증한 토큰을 보관해두고 모든 msg 진입 시 재검증.
  //   만료/위조 시 4002 로 close. 클라가 자동 리프레시한 경우 authRefresh 메시지로 갱신.
  let authToken = null;
  ws.isAlive = true;                                   // 마지막 pong 시각 트래커
  ws.on('pong', () => { ws.isAlive = true; });          // 클라이언트 자동 pong 응답 시 갱신
  console.log(`[+] connection from ${req.socket.remoteAddress}`);

  ws.on('message', async raw => {
    let m;
    try { m = JSON.parse(raw); }
    catch { return send(ws, { type: 'error', message: 'invalid json' }); }

    try {
      // ── hello ─────────────────────────────────────────────
      //   JWT 검증 필수. Spring(8081) /auth/login 으로 받은 토큰을 m.token 으로 첨부.
      //   payload.sub 를 user 로 사용 — m.user 는 무시 (위변조 방지).
      //   m.deviceId 도 의무화. 같은 (user, deviceId) 만 replaced 처리, 다른 deviceId 는 공존.
      if (m.type === 'hello') {
        console.log(`[DBG:hello:1] 수신 deviceId=${m.deviceId} tokenLength=${m.token?.length}`);
        if (!m.token || typeof m.token !== 'string') {
          send(ws, { type: 'error', code: 'token_required', message: 'token required — POST /auth/login on :8081 first' });
          return ws.close(4001, 'token required');
        }
        if (!m.deviceId || typeof m.deviceId !== 'string') {
          send(ws, { type: 'error', code: 'device_id_required', message: 'deviceId required (클라이언트가 localStorage 에 생성/보관)' });
          return ws.close(4001, 'deviceId required');
        }
        let payload;
        try {
          console.log(`[DBG:hello:2] JWT 검증 시작 (HS256)`);
          payload = jwt.verify(m.token, JWT_SECRET, { algorithms: ['HS256'] });
          console.log(`[DBG:hello:3] JWT 검증 성공 sub=${payload.sub} role=${payload.role} exp=${new Date(payload.exp*1000).toISOString()}`);
        } catch (e) {
          console.log(`[DBG:hello:ERR] JWT 검증 실패: ${e.message}`);
          send(ws, { type: 'error', code: 'invalid_token', message: 'invalid token: ' + e.message });
          return ws.close(4001, 'invalid token');
        }
        const claimedUser = payload.sub;
        if (!claimedUser) {
          send(ws, { type: 'error', code: 'invalid_token', message: 'token missing sub' });
          return ws.close(4001, 'invalid token');
        }

        user = claimedUser;
        deviceId = m.deviceId;
        authToken = m.token;
        const deviceType = (typeof m.deviceType === 'string') ? m.deviceType : 'web';

        const prev = attachSocket(user, deviceId, ws);
        if (prev && prev !== ws) {
          console.log(`[DBG:hello:4] 동일 deviceId 재접속 — 이전 소켓 교체`);
          try { send(prev, { type: 'error', message: 'replaced by same-device reconnect' }); prev.close(4000, 'replaced'); } catch (_) {}
        }

        const wasOnline = (await redis.sIsMember('online', user)) === 1;
        console.log(`[DBG:hello:5] Redis sessionStart 호출 user=${user} wasOnline=${wasOnline}`);
        const sid = await sessionStart(user, deviceId, deviceType);
        console.log(`[DBG:hello:6] Redis 세션 생성 완료 sid=${sid} TTL=${SESSION_TTL}s`);
        const online = await getOnline();
        const myDevices = await devicesOf(user);
        console.log(`[DBG:hello:7] welcome 전송 → client (online=${online.length}명, myDevices=${myDevices.length}개)`);
        send(ws, { type: 'welcome', user, role: payload.role || 'user', sid, deviceId, devices: myDevices, online });

        if (!wasOnline) {
          console.log(`[DBG:hello:8] 첫 디바이스 접속 → 다른 사용자에게 presence:on 브로드캐스트`);
          presenceOn(user, true);
        }

        console.log(`[DBG:hello:9] inbox drain 시작 (Redis LRANGE inbox:${user})`);
        const pending = await drainInbox(user);
        if (pending.length) {
          console.log(`[DBG:hello:10] 오프라인 inbox ${pending.length}건 drain → 모든 활성 디바이스 fan-out`);
          for (const w of socketsOf(user).values()) {
            if (w.readyState !== 1) continue;
            pending.forEach(msg => send(w, { type: 'msg', ...msg }));
          }
        } else {
          console.log(`[DBG:hello:10] inbox 비어있음 (드레인 없음)`);
        }
        console.log(`    hello ${user}/${deviceId} role=${payload.role} sid=${sid}  (devices=${myDevices.length}, online=${online.length}, drained=${pending.length})`);
        return;
      }

      if (!user) return send(ws, { type: 'error', message: 'login first (send hello)' });

      // ── authRefresh ──────────────────────────────────────
      //   클라가 만료 5분 전 자동으로 새 access token 받았을 때 ws 에도 알려줌.
      //   payload.sub 가 hello 때 user 와 일치해야 함 (다른 사람 토큰으로 갈아끼우는 변조 방지).
      if (m.type === 'authRefresh') {
        if (!m.token || typeof m.token !== 'string') {
          return send(ws, { type: 'error', code: 'token_required', message: 'token required for authRefresh' });
        }
        let payload;
        try {
          payload = jwt.verify(m.token, JWT_SECRET, { algorithms: ['HS256'] });
        } catch (e) {
          send(ws, { type: 'error', code: 'invalid_token', message: 'authRefresh failed: ' + e.message });
          return ws.close(4002, 'authRefresh invalid');
        }
        if (payload.sub !== user) {
          send(ws, { type: 'error', code: 'sub_mismatch', message: `authRefresh sub mismatch (hello=${user}, refresh=${payload.sub})` });
          return ws.close(4002, 'sub mismatch');
        }
        authToken = m.token;
        send(ws, { type: 'authRefreshed', exp: payload.exp });
        console.log(`    authRefresh ${user}/${deviceId} new exp=${new Date(payload.exp * 1000).toISOString()}`);
        return;
      }

      // ── msg ───────────────────────────────────────────────
      //   발신자 본인의 다른 디바이스 → carbon copy (어디서 봐도 동기화).
      //   수신자: 모든 활성 디바이스에 fan-out.
      //          한 디바이스라도 온라인이면 Redis 적재 없이 즉시 send 만.
      //          모든 디바이스 오프라인이면 inbox 큐에 적재.
      if (m.type === 'msg') {
        console.log(`[DBG:msg:1] 수신 from=${user} to=${m.to} bodyLen=${m.body?.length}`);
        try {
          console.log(`[DBG:msg:2] JWT 재검증 (매 메시지 필수)`);
          jwt.verify(authToken, JWT_SECRET, { algorithms: ['HS256'] });
          console.log(`[DBG:msg:3] JWT 재검증 성공`);
        } catch (e) {
          console.log(`[DBG:msg:ERR] JWT 만료/위조 → close 4002: ${e.message}`);
          send(ws, { type: 'error', code: 'token_expired', message: 'token expired — send authRefresh first: ' + e.message });
          return ws.close(4002, 'token expired');
        }
        if (!m.to || typeof m.body !== 'string') {
          return send(ws, { type: 'error', message: 'to + body required' });
        }
        console.log(`[DBG:msg:4] sessionTouch → Redis TTL 갱신`);
        await sessionTouch(user, deviceId);
        const msg = { from: user, to: m.to, body: m.body, ts: Date.now(), id: newId() };
        console.log(`[DBG:msg:5] 메시지 객체 생성 id=${msg.id} ts=${msg.ts}`);

        let echoed = 0;
        for (const w of socketsOf(user).values()) {
          if (w.readyState === 1) { send(w, { type: 'msg', ...msg }); echoed++; }
        }
        console.log(`[DBG:msg:6] Carbon Copy → 발신자(${user}) 디바이스 ${echoed}개에 echo 완료`);

        const targets = socketsOf(m.to);
        if (targets.size > 0) {
          let sent = 0;
          for (const w of targets.values()) {
            if (w.readyState === 1) { send(w, { type: 'msg', ...msg }); sent++; }
          }
          console.log(`[DBG:msg:7] 수신자(${m.to}) 온라인 → ${sent}개 디바이스에 즉시 전달`);
        } else {
          console.log(`[DBG:msg:7] 수신자(${m.to}) 오프라인 → Redis inbox:${m.to} 에 적재 (TTL ${INBOX_TTL}s)`);
          await pushInbox(m.to, msg);
        }

        console.log(`[DBG:msg:8] Mongoose 미러링 시작 (fire-and-forget, 비차단)`);
        forwardToMongoose(user, m.to, m.body);
        console.log(`[DBG:msg:9] 처리 완료 — 클라이언트로 반환 없음 (echo가 확인 역할)`);
        return;
      }

      send(ws, { type: 'error', message: `unknown type: ${m.type}` });
    } catch (e) {
      console.error('[handler]', e);
      send(ws, { type: 'error', message: 'server error: ' + e.message });
    }
  });

  ws.on('close', async () => {
    if (user && deviceId && detachSocket(user, deviceId, ws)) {
      try {
        console.log(`[DBG:close:1] 소켓 종료 → Redis sessionEnd user=${user}/${deviceId}`);
        const { lastDeviceGone } = await sessionEnd(user, deviceId);
        if (lastDeviceGone) {
          console.log(`[DBG:close:2] 마지막 디바이스 → online Set 제거 + presence:off 브로드캐스트`);
          presenceOn(user, false);
        }
        const remaining = (localSockets.get(user) || new Map()).size;
        console.log(`[-] bye ${user}/${deviceId}  (remaining devices of this user=${remaining})`);
      } catch (e) {
        console.error('[close]', e);
      }
    }
  });
});

// ── 하트비트 ──────────────────────────────────────────────────
// HEARTBEAT_MS 마다 모든 (user, deviceId, ws) 에 ping. pong 안 오면 좀비 → terminate.
// 살아있는 디바이스는 sessionTouch 로 Redis 세션 TTL 갱신 (idle 사용자도 안 만료).
const hbTimer = setInterval(async () => {
  for (const [u, bucket] of localSockets) {
    for (const [d, ws] of bucket) {
      if (ws.readyState !== ws.OPEN) continue;
      if (ws.isAlive === false) {
        console.log(`[hb] ${u}/${d}: no pong, terminating zombie`);
        ws.terminate();                                       // close 이벤트 발화 → sessionEnd
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); }
      catch (e) { console.error(`[hb] ping ${u}/${d}:`, e.message); }
      try { await sessionTouch(u, d); }
      catch (e) { console.error(`[hb] touch ${u}/${d}:`, e.message); }
    }
  }
}, HEARTBEAT_MS);

// ── 부팅 ─────────────────────────────────────────────────────
(async () => {
  await redis.connect();
  console.log(`Redis connected: ${REDIS_URL}  (INBOX_TTL=${INBOX_TTL}s, SESSION_TTL=${SESSION_TTL}s)`);
  startMonitor();                         // MONITOR 자식 프로세스 시작
  httpServer.listen(PORT, () => {
    console.log(`Plain WS chat: http://localhost:${PORT}/`);
    console.log(`WS endpoint:   ws://localhost:${PORT}/ws`);
    console.log(`Heartbeat: every ${HEARTBEAT_MS}ms`);
    console.log(`JWT auth: hello must include token from Spring (:8081 /auth/login)`);
    if (MONGOOSE_ENABLED) {
      console.log(`Mongoose mirror: enabled → ${MONGOOSE_URL} (domain=${MONGOOSE_DOMAIN})`);
    } else {
      console.log(`Mongoose mirror: disabled (MONGOOSE_GRAPHQL_URL not set)`);
    }
  });
})().catch(err => {
  console.error('[boot]', err);
  process.exit(1);
});

// graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n${sig} received, closing...`);
    clearInterval(hbTimer);
    if (monProc) try { monProc.kill(); } catch (_) {}
    try { await redis.quit(); } catch (_) {}
    httpServer.close(() => process.exit(0));
  });
}
