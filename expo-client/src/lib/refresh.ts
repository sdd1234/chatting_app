// JWT 자동 갱신 watcher (react-client refresh.ts 의 RN 포팅).
// - 만료 5분 전 /auth/refresh 호출 → 새 토큰
// - 갱신 직후 sendAuthRefresh() 로 plain-ws 에 알림 (6주차 ③안)
// - 만료/실패 시 강제 로그아웃 → useAuth.clear() 가 네비게이션을 Login 으로 되돌림
import { create } from 'zustand';
import { getToken, refresh, logout } from './api';
import { msUntilExp } from './jwt';
import { useAuth } from './store';
import { sendAuthRefresh, disconnectWS } from './ws';
import { DEFAULT_TOKEN_TTL_MS } from './config';

const REFRESH_LEAD_MS = 5 * 60 * 1000;
const MIN_DELAY_MS = 5_000;
const RETRY_DELAY_MS = 30_000;

interface RefreshState {
  lastRefreshAt: number | null;
  expiresAt: number | null;
  refreshing: boolean;
}
export const useRefreshStatus = create<RefreshState>(() => ({
  lastRefreshAt: null,
  expiresAt: null,
  refreshing: false,
}));

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(runRefresh, Math.max(MIN_DELAY_MS, delay));
}

async function runRefresh() {
  const t = await getToken();
  if (!t) return;
  const left = msUntilExp(t);
  if (left == null) return;

  if (left > REFRESH_LEAD_MS) { schedule(left - REFRESH_LEAD_MS); return; }
  if (left <= 0) { forceLogout('token expired'); return; }

  useRefreshStatus.setState({ refreshing: true });
  try {
    const data = await refresh();
    useAuth.getState().setAuth(data.user, data.role, data.token);
    sendAuthRefresh(data.token); // 6주차 ③안
    const ttl = data.expiresInMs ?? DEFAULT_TOKEN_TTL_MS;
    useRefreshStatus.setState({
      lastRefreshAt: Date.now(),
      expiresAt: Date.now() + ttl,
      refreshing: false,
    });
    schedule(ttl - REFRESH_LEAD_MS);
  } catch {
    useRefreshStatus.setState({ refreshing: false });
    const cur = msUntilExp((await getToken()) || '');
    if (cur != null && cur <= 0) forceLogout('refresh 401 after expire');
    else schedule(RETRY_DELAY_MS);
  }
}

async function forceLogout(reason: string) {
  console.warn('[auto-refresh] force logout:', reason);
  if (timer) { clearTimeout(timer); timer = null; }
  started = false;
  disconnectWS();
  await logout();
  useAuth.getState().clear();
  useRefreshStatus.setState({ lastRefreshAt: null, expiresAt: null, refreshing: false });
}

/** 로그인 후 호출. 만료 5분 전 자동 갱신 시작. */
export async function startAutoRefresh() {
  started = true;
  const t = await getToken();
  if (!t) return;
  const left = msUntilExp(t);
  if (left == null) return;
  if (left <= 0) { forceLogout('startup with expired token'); return; }
  useRefreshStatus.setState({ expiresAt: Date.now() + left });
  schedule(Math.max(MIN_DELAY_MS, left - REFRESH_LEAD_MS));
}

export function stopAutoRefresh() {
  started = false;
  if (timer) { clearTimeout(timer); timer = null; }
  useRefreshStatus.setState({ lastRefreshAt: null, expiresAt: null });
}

export function isStarted() { return started; }
