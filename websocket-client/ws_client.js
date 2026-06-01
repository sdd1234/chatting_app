#!/usr/bin/env node
/**
 * XMPP over WebSocket 클라이언트 (RFC 7395)
 *
 * 사용법:
 *   node ws_client.js <username> <password> [to_jid] [message]
 *
 * 예시 (메시지 전송):
 *   node ws_client.js alice alice123 bob@localhost "안녕하세요!"
 *
 * 예시 (수신 대기):
 *   node ws_client.js bob bob123
 */

const WebSocket = require('ws');

// ─── 설정 ────────────────────────────────────────────────────────────────────
const HOST   = process.env.XMPP_HOST || 'localhost';
const PORT   = process.env.XMPP_PORT || '5280';
const WS_URL = `ws://${HOST}:${PORT}/ws-xmpp`;
const DOMAIN = process.env.XMPP_DOMAIN || 'localhost';

const args     = process.argv.slice(2);
const USERNAME = args[0];
const PASSWORD = args[1];
const TO_JID   = args[2];        // 선택: 메시지 보낼 상대방 JID
const MESSAGE  = args[3];        // 선택: 전송할 메시지

if (!USERNAME || !PASSWORD) {
  console.error('사용법: node ws_client.js <username> <password> [to_jid] [message]');
  process.exit(1);
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
let msgId = 0;
const nextId = () => `id${++msgId}`;

/** SASL PLAIN 인증 토큰: \0username\0password → Base64 */
function saslPlain(user, pass) {
  const buf = Buffer.from(`\0${user}\0${pass}`);
  return buf.toString('base64');
}

/** XML 특수문자 이스케이프 */
function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── XMPP 스탠자 템플릿 ──────────────────────────────────────────────────────
const STANZAS = {
  open: (domain) =>
    `<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' ` +
    `to='${domain}' version='1.0' xml:lang='en'/>`,

  close: () =>
    `<close xmlns='urn:ietf:params:xml:ns:xmpp-framing'/>`,

  authPlain: (token) =>
    `<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>${token}</auth>`,

  bindResource: (resource) =>
    `<iq type='set' id='${nextId()}' xmlns='jabber:client'>` +
    `<bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'>` +
    `<resource>${xmlEscape(resource)}</resource>` +
    `</bind></iq>`,

  sessionIq: () =>
    `<iq type='set' id='${nextId()}' xmlns='jabber:client'>` +
    `<session xmlns='urn:ietf:params:xml:ns:xmpp-session'/>` +
    `</iq>`,

  presence: () =>
    `<presence xmlns='jabber:client'/>`,

  message: (to, body) =>
    `<message to='${xmlEscape(to)}' type='chat' id='${nextId()}' xmlns='jabber:client'>` +
    `<body>${xmlEscape(body)}</body>` +
    `</message>`,
};

// ─── 상태 머신 ───────────────────────────────────────────────────────────────
const STATE = {
  CONNECTED:     'CONNECTED',      // WS 연결됨 → open 전송 대기
  STREAM_OPENED: 'STREAM_OPENED',  // open 응답 받음 → features 기다림
  AUTHENTICATING:'AUTHENTICATING', // SASL auth 전송함
  AUTHENTICATED: 'AUTHENTICATED',  // <success> 받음 → 스트림 재시작
  BINDING:       'BINDING',        // resource bind 전송함
  SESSION:       'SESSION',        // session IQ 전송함
  READY:         'READY',          // 완전 연결됨 → stanza 송수신 가능
};

// ─── 메인 ────────────────────────────────────────────────────────────────────
class XmppWsClient {
  constructor(username, password, domain) {
    this.username = username;
    this.password = password;
    this.domain   = domain;
    this.jid      = null;
    this.state    = null;
    this.ws       = null;
  }

  connect() {
    console.log(`[연결] ${WS_URL}`);
    this.ws = new WebSocket(WS_URL, ['xmpp']);

    this.ws.on('open', () => {
      this.state = STATE.CONNECTED;
      console.log('[WS] 연결 성공');
      this._send(STANZAS.open(this.domain));
      this.state = STATE.STREAM_OPENED;
    });

    this.ws.on('message', (data) => {
      const msg = data.toString();
      console.log(`[수신] ${msg}`);
      this._handle(msg);
    });

    this.ws.on('error', (err) => {
      console.error('[오류]', err.message);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[종료] code=${code} reason=${reason.toString() || '(없음)'}`);
    });
  }

  _send(xml) {
    console.log(`[전송] ${xml}`);
    this.ws.send(xml);
  }

  _handle(xml) {
    // ── 스트림 열림 응답 (features 포함된 경우도 있음) ───────────────────────
    if (this.state === STATE.STREAM_OPENED) {
      if (xml.includes('urn:ietf:params:xml:ns:xmpp-sasl')) {
        // SASL 기능 제공 → PLAIN 인증 시도
        const token = saslPlain(this.username, this.password);
        this._send(STANZAS.authPlain(token));
        this.state = STATE.AUTHENTICATING;
        return;
      }
      // features가 아직 안 왔으면 기다림
      return;
    }

    // ── features (stream_opened 직후, features 메시지가 분리된 경우) ──────────
    if (xml.includes('urn:ietf:params:xml:ns:xmpp-sasl') &&
        this.state !== STATE.AUTHENTICATING) {
      const token = saslPlain(this.username, this.password);
      this._send(STANZAS.authPlain(token));
      this.state = STATE.AUTHENTICATING;
      return;
    }

    // ── SASL 인증 결과 ────────────────────────────────────────────────────────
    if (this.state === STATE.AUTHENTICATING) {
      if (xml.includes('<success')) {
        console.log('[인증] SASL 성공 → 스트림 재시작');
        this.state = STATE.AUTHENTICATED;
        this._send(STANZAS.open(this.domain));
        return;
      }
      if (xml.includes('<failure')) {
        console.error('[인증 실패] 사용자명/비밀번호를 확인하세요.');
        this.ws.close();
        return;
      }
    }

    // ── 인증 후 스트림 재시작 → features (resource binding) ─────────────────
    if (this.state === STATE.AUTHENTICATED) {
      if (xml.includes('urn:ietf:params:xml:ns:xmpp-bind') ||
          xml.includes('urn:ietf:params:xml:ns:xmpp-framing')) {
        // features 수신 또는 open 응답 → bind 요청
        if (xml.includes('urn:ietf:params:xml:ns:xmpp-bind')) {
          this._send(STANZAS.bindResource('ws-node'));
          this.state = STATE.BINDING;
        }
        return;
      }
    }

    // ── Resource Binding 결과 ─────────────────────────────────────────────────
    if (this.state === STATE.BINDING) {
      const jidMatch = xml.match(/<jid>([^<]+)<\/jid>/);
      if (jidMatch) {
        this.jid = jidMatch[1];
        console.log(`[바인딩 완료] JID = ${this.jid}`);
        // 세션 IQ 전송 (필수: 없으면 서버에 세션 미등록 → 메시지 라우팅 실패)
        this._send(STANZAS.sessionIq());
        this.state = STATE.SESSION;
        return;
      }
    }

    // ── Session IQ 결과 ───────────────────────────────────────────────────────
    if (this.state === STATE.SESSION) {
      if (xml.includes("type='result'") || xml.includes('type="result"')) {
        console.log('[세션] 세션 IQ 완료 → Presence 전송');
        this.state = STATE.READY;
        this._send(STANZAS.presence());
        this._onReady();
        return;
      }
    }

    // ── READY 상태: 들어오는 메시지 처리 ────────────────────────────────────
    if (this.state === STATE.READY) {
      // 수신된 <message> 스탠자 파싱
      if (xml.includes('<message')) {
        const fromMatch = xml.match(/from='([^']+)'/);
        const bodyMatch = xml.match(/<body>([^<]*)<\/body>/);
        if (fromMatch && bodyMatch) {
          console.log(`\n💬 [메시지 수신] ${fromMatch[1]}: ${bodyMatch[1]}\n`);
        }
      }
      // <iq> 오류 감지
      if (xml.includes("type='error'") || xml.includes('type="error"')) {
        console.warn('[IQ 오류]', xml);
      }
    }
  }

  _onReady() {
    if (TO_JID && MESSAGE) {
      // 메시지 전송 모드
      console.log(`\n📤 [메시지 전송] → ${TO_JID}: ${MESSAGE}`);
      this._send(STANZAS.message(TO_JID, MESSAGE));
      // 1초 후 연결 종료
      setTimeout(() => {
        this._send(STANZAS.close());
        this.ws.close();
        console.log('[완료] 메시지 전송 후 연결 종료');
      }, 1000);
    } else {
      // 수신 대기 모드
      console.log(`\n👂 [수신 대기] ${this.jid} — 메시지를 기다리는 중... (Ctrl+C로 종료)\n`);
    }
  }

  sendMessage(toJid, body) {
    if (this.state !== STATE.READY) {
      console.error('[오류] 아직 연결이 준비되지 않았습니다.');
      return;
    }
    this._send(STANZAS.message(toJid, body));
  }
}

// ─── 실행 ────────────────────────────────────────────────────────────────────
const client = new XmppWsClient(USERNAME, PASSWORD, DOMAIN);
client.connect();
