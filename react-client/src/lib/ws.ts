// plain-ws 연결 싱글톤. 로그인 후 1회 연결, 모든 라우팅이 공유.
import { getOrCreateDeviceId, getToken } from './api';
import { useChat, dmKey, groupKey } from './store';
import type { ChatMessage, GroupInfo } from './store';
import { decodeGroupBody, encodeGroupBody, newCid } from './group';
import { decodeSysBody, encodeSysBody } from './sys';
import type { SysSignal } from './sys';

let ws: WebSocket | null = null;
let connected = false;
let pendingSends: string[] = [];

export interface WSStatus { connected: boolean; }
const listeners = new Set<(s: WSStatus) => void>();
export function subscribeStatus(fn: (s: WSStatus) => void) {
  listeners.add(fn);
  fn({ connected });
  return () => listeners.delete(fn);
}
function notify() { listeners.forEach((fn) => fn({ connected })); }

export function connectWS(myUser: string) {
  if (ws && ws.readyState <= 1) return;
  const token = getToken();
  if (!token) return;
  const deviceId = getOrCreateDeviceId();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: 'hello', token, deviceId, deviceType: 'web' }));
  };
  ws.onmessage = (e) => {
    let m: any;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'welcome') {
      connected = true; notify();
      pendingSends.forEach((s) => ws!.send(s));
      pendingSends = [];
    } else if (m.type === 'msg') {
      handleIncomingMsg(myUser, m);
    } else if (m.type === 'error') {
      console.warn('[ws error]', m);
    }
  };
  ws.onclose = () => { connected = false; notify(); ws = null; };
  ws.onerror = () => { connected = false; notify(); };
}

function handleIncomingMsg(myUser: string, m: any) {
  // 1) SYS 신호(읽음/타이핑) — store만 갱신, 메시지 리스트 X
  const sys = decodeSysBody(m.body);
  if (sys) {
    handleSys(myUser, m, sys);
    return;
  }
  // 2) 그룹 메시지
  const decoded = decodeGroupBody(m.body);
  if (decoded) {
    const info: GroupInfo = {
      gid: decoded.gid,
      gname: decoded.gname,
      members: decoded.members,
      createdAt: m.ts || Date.now(),
    };
    useChat.getState().registerGroup(info);
    const msg: ChatMessage = {
      id: m.id, from: m.from, to: m.to, body: decoded.body, ts: m.ts,
      groupId: decoded.gid, cid: decoded.cid,
    };
    useChat.getState().appendMessage(myUser, msg);
    return;
  }
  // 3) 일반 1:1 메시지
  const msg: ChatMessage = {
    id: m.id, from: m.from, to: m.to, body: m.body, ts: m.ts,
  };
  useChat.getState().appendMessage(myUser, msg);
}

function handleSys(myUser: string, m: any, sig: SysSignal) {
  // 본인이 보낸 echo(자기 자신이 받는 sys) — typing 표시에서 본인 제외
  if (sig.kind === 'typing') {
    if (m.from === myUser) return; // 본인의 typing echo 무시
    const key = sig.gid ? groupKey(sig.gid) : dmKey(m.from);
    useChat.getState().applyTyping(key, m.from);
  } else if (sig.kind === 'read' && Array.isArray(sig.ids)) {
    if (m.from === myUser) return; // 본인 echo 무시
    useChat.getState().applyRead(sig.ids, m.from);
  }
}

export function sendMessage(to: string, body: string) {
  const payload = JSON.stringify({ type: 'msg', to, body });
  if (ws && connected) ws.send(payload);
  else pendingSends.push(payload);
}

export function sendGroupMessage(myUser: string, group: GroupInfo, body: string) {
  const cid = newCid();
  const encoded = encodeGroupBody(
    { gid: group.gid, gname: group.gname, members: group.members, cid },
    body,
  );
  for (const m of group.members) {
    if (m === myUser) continue;
    sendMessage(m, encoded);
  }
}

// ──────────────────────────────────────────────────────────────
// 읽음 / 타이핑
// ──────────────────────────────────────────────────────────────

export function sendReadDM(other: string, msgIds: string[]) {
  if (!msgIds.length) return;
  sendMessage(other, encodeSysBody({ kind: 'read', ids: msgIds }));
}

export function sendReadGroup(myUser: string, group: GroupInfo, msgIds: string[]) {
  if (!msgIds.length) return;
  const body = encodeSysBody({ kind: 'read', ids: msgIds, gid: group.gid });
  for (const m of group.members) {
    if (m === myUser) continue;
    sendMessage(m, body);
  }
}

export function sendTypingDM(other: string) {
  sendMessage(other, encodeSysBody({ kind: 'typing' }));
}

export function sendTypingGroup(myUser: string, group: GroupInfo) {
  const body = encodeSysBody({ kind: 'typing', gid: group.gid });
  for (const m of group.members) {
    if (m === myUser) continue;
    sendMessage(m, body);
  }
}

export function disconnectWS() {
  if (ws) { try { ws.close(); } catch {} }
  ws = null;
  connected = false;
  pendingSends = [];
  notify();
}
