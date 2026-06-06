// plain-ws(:8090) 연결 싱글톤. 로그인 후 1회 연결, 전 화면이 공유.
// RN 의 전역 WebSocket 사용. config.WS_URL 로 절대 주소 접속.
import { WS_URL } from './config';
import { getOrCreateDeviceId, getToken } from './api';
import { useChat } from './store';
import type { ChatMessage } from './store';
import { decodeFileBody, encodeFileBody } from './files';
import type { FileMeta } from './files';

let ws: WebSocket | null = null;
let connected = false;
let pendingSends: string[] = [];

export interface WSStatus { connected: boolean; }
const listeners = new Set<(s: WSStatus) => void>();
export function subscribeStatus(fn: (s: WSStatus) => void) {
  listeners.add(fn);
  fn({ connected });
  return () => { listeners.delete(fn); };
}
function notify() { listeners.forEach((fn) => fn({ connected })); }

function newCid() {
  return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export async function connectWS(myUser: string) {
  if (ws && ws.readyState <= 1) return;
  const token = await getToken();
  if (!token) return;
  const deviceId = await getOrCreateDeviceId();
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: 'hello', token, deviceId, deviceType: 'mobile' }));
  };
  ws.onmessage = (e) => {
    let m: any;
    try { m = JSON.parse(e.data as string); } catch { return; }
    if (m.type === 'welcome') {
      connected = true; notify();
      pendingSends.forEach((s) => ws!.send(s));
      pendingSends = [];
    } else if (m.type === 'msg') {
      handleIncomingMsg(myUser, m);
    } else if (m.type === 'authRefreshed') {
      console.log('[ws] authRefreshed exp=', m.exp);
    } else if (m.type === 'error') {
      console.warn('[ws error]', m);
    }
  };
  ws.onclose = () => { connected = false; notify(); ws = null; };
  ws.onerror = () => { connected = false; notify(); };
}

function handleIncomingMsg(myUser: string, m: any) {
  const file = decodeFileBody(m.body);
  const msg: ChatMessage = {
    id: m.id, from: m.from, to: m.to,
    body: file ? file.body : m.body,
    ts: m.ts,
    ...(file ? { file: file.file } : {}),
  };
  useChat.getState().appendMessage(myUser, msg);
}

// 6주차 ③안: refresh.ts 가 새 access token 받은 직후 호출.
// plain-ws 는 msg 진입마다 hello 때 받은 토큰을 다시 verify 하므로,
// 갱신 시 ws 에도 알려야 close 4002 를 안 맞는다.
export function sendAuthRefresh(token: string) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'authRefresh', token }));
}

function rawSend(payload: string) {
  if (ws && connected) ws.send(payload);
  else pendingSends.push(payload);
}

export function sendMessage(to: string, body: string) {
  rawSend(JSON.stringify({ type: 'msg', to, body }));
}

/** 파일/이미지 첨부 메시지. body 를 파일 메타로 인코딩해 전송. */
export function sendFileMessage(to: string, file: FileMeta, caption = '') {
  rawSend(JSON.stringify({ type: 'msg', to, body: encodeFileBody(file, caption), cid: newCid() }));
}

export function disconnectWS() {
  if (ws) { try { ws.close(); } catch {} }
  ws = null;
  connected = false;
  pendingSends = [];
  notify();
}
