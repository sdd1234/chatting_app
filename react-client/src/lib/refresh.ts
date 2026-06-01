// JWT 자동 갱신 watcher.
// - 만료 5분(REFRESH_LEAD_MS) 전에 /auth/refresh 호출
// - 갱신된 새 토큰으로 다시 스케줄
// - 만료/네트워크 실패 시 강제 로그아웃 → /login 이동
import { create } from 'zustand';
import { getToken, refresh, logout } from './api';
import { msUntilExp } from './jwt';
import { useAuth } from './store';

const REFRESH_LEAD_MS = 5 * 60 * 1000; // 만료 5분 전
const MIN_DELAY_MS = 5_000;            // 너무 자주 안 부르게 하한
const RETRY_DELAY_MS = 30_000;         // 일시 실패 시 재시도 간격

interface RefreshState {
  lastRefreshAt: number | null;  // 마지막 성공한 갱신 시각 (epoch ms)
  expiresAt: number | null;      // 현재 토큰 만료 시각 (epoch ms)
  refreshing: boolean;
}

export const useRefreshStatus = create<RefreshState>(() => ({
  lastRefreshAt: null,
  expiresAt: null,
  refreshing: false,
}));

let timer: number | null = null;
let started = false;

function setExpFromCurrent() {
  const t = getToken();
  if (!t) return;
  const left = msUntilExp(t);
  if (left == null) return;
  useRefreshStatus.setState({ expiresAt: Date.now() + left });
}

function schedule(delay: number) {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(runRefresh, Math.max(MIN_DELAY_MS, delay));
}

async function runRefresh() {
  const t = getToken();
  if (!t) return;
  const left = msUntilExp(t);
  if (left == null) return;

  // 아직 갱신 시점 안 됨 → 다시 스케줄
  if (left > REFRESH_LEAD_MS) {
    schedule(left - REFRESH_LEAD_MS);
    return;
  }

  // 이미 만료 — 갱신 불가, 로그아웃
  if (left <= 0) {
    forceLogout('token expired');
    return;
  }

  // 갱신 시도
  useRefreshStatus.setState({ refreshing: true });
  try {
    const data = await refresh();
    useAuth.getState().setAuth(data.user, data.role, data.token);
    useRefreshStatus.setState({
      lastRefreshAt: Date.now(),
      expiresAt: Date.now() + (data.expiresInMs ?? 3_600_000),
      refreshing: false,
    });
    // 다음 갱신 예약
    schedule((data.expiresInMs ?? 3_600_000) - REFRESH_LEAD_MS);
  } catch (e) {
    useRefreshStatus.setState({ refreshing: false });
    // 만료된 토큰이면 401 → 더 재시도 의미 X
    const cur = msUntilExp(getToken() || '');
    if (cur != null && cur <= 0) {
      forceLogout('refresh 401 after expire');
    } else {
      // 일시 네트워크 오류일 수 있음 — 짧게 재시도
      schedule(RETRY_DELAY_MS);
    }
  }
}

function forceLogout(reason: string) {
  console.warn('[auto-refresh] force logout:', reason);
  if (timer) { window.clearTimeout(timer); timer = null; }
  logout();
  useAuth.getState().clear();
  useRefreshStatus.setState({ lastRefreshAt: null, expiresAt: null, refreshing: false });
  if (window.location.pathname !== '/login') {
    // search(?slot=...) 보존 — 안 그러면 다음 로그인 시 슬롯이 main으로 바뀌어 채팅/단톡 다 안 보임
    window.location.href = '/login' + window.location.search;
  }
}

/** 로그인 후 호출. 토큰 만료 5분 전 자동 갱신 watcher 시작. */
export function startAutoRefresh() {
  started = true;
  setExpFromCurrent();
  const t = getToken();
  if (!t) return;
  const left = msUntilExp(t);
  if (left == null) return;
  if (left <= 0) { forceLogout('startup with expired token'); return; }
  // 5분 전이면 즉시, 아니면 그 차이만큼 기다림
  schedule(Math.max(MIN_DELAY_MS, left - REFRESH_LEAD_MS));
}

export function stopAutoRefresh() {
  started = false;
  if (timer) { window.clearTimeout(timer); timer = null; }
  useRefreshStatus.setState({ lastRefreshAt: null, expiresAt: null });
}

export function isStarted() { return started; }
