// Spring 공지 채널 구독/발송.
// 구독: ws://(vite proxy)/ws/notice?token=JWT → {type:'hello'} | {type:'notice', id, level, body, from, ts}
// 발송: POST /admin/notice  (admin role only) {body, level}
import { getToken } from './api';
import { create } from 'zustand';

export type NoticeLevel = 'info' | 'warn' | 'critical';

export interface NoticeItem {
  id: string;
  level: NoticeLevel;
  body: string;
  from: string;
  ts: number;
}

interface NoticeState {
  // 화면에 떠있는 토스트들 (자동 만료)
  toasts: NoticeItem[];
  // 누적 로그 (옵션 — 시연용으로 최근 N개 보관)
  log: NoticeItem[];
  connected: boolean;
  push: (n: NoticeItem) => void;
  dismiss: (id: string) => void;
  setConnected: (b: boolean) => void;
}

export const useNotice = create<NoticeState>((set) => ({
  toasts: [],
  log: [],
  connected: false,
  push: (n) => set((s) => ({
    toasts: [...s.toasts, n].slice(-5),
    log:    [n, ...s.log].slice(0, 30),
  })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setConnected: (b) => set({ connected: b }),
}));

let ws: WebSocket | null = null;
let manualDisconnect = false;
const TOAST_TTL_MS = 6_000;

export function connectNotice() {
  if (ws && ws.readyState <= 1) return;
  const token = getToken();
  if (!token) return;
  manualDisconnect = false;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // vite proxy 통해 same-origin /ws/notice → :8081
  const url = `${proto}//${window.location.host}/ws/notice?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);

  ws.onopen = () => useNotice.getState().setConnected(true);

  ws.onmessage = (e) => {
    let m: any;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type !== 'notice') return; // hello 등은 토스트 X
    const item: NoticeItem = {
      id: String(m.id || crypto.randomUUID?.() || Date.now()),
      level: (m.level || 'info') as NoticeLevel,
      body: String(m.body || ''),
      from: String(m.from || ''),
      ts: Number(m.ts || Date.now()),
    };
    useNotice.getState().push(item);
    // 자동 만료
    window.setTimeout(() => useNotice.getState().dismiss(item.id), TOAST_TTL_MS);
  };

  ws.onclose = () => {
    useNotice.getState().setConnected(false);
    ws = null;
    if (!manualDisconnect) {
      // 단순 자동 재연결 (1회 지연 후) — 토큰 만료면 의미 없지만 네트워크 흔들리는 경우 회복
      window.setTimeout(() => { if (getToken()) connectNotice(); }, 3000);
    }
  };
  ws.onerror = () => useNotice.getState().setConnected(false);
}

export function disconnectNotice() {
  manualDisconnect = true;
  if (ws) { try { ws.close(); } catch {} }
  ws = null;
  useNotice.getState().setConnected(false);
}

export async function publishNotice(body: string, level: NoticeLevel = 'info') {
  const token = getToken();
  const r = await fetch('/admin/notice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({ body, level }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`publish failed: ${r.status} ${text}`);
  }
  return r.json();
}
