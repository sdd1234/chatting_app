// Spring + plain-ws 호출 헬퍼. JWT 자동 첨부.
// localStorage 키들은 slot 접미로 격리(멀티 디바이스 시연용).
import { slotSuffix } from './slot';

const sfx = slotSuffix();
export const TOKEN_KEY  = `plainws_jwt_v1${sfx}`;
export const USER_KEY   = `plainws_my_user_v1${sfx}`;
export const ROLE_KEY   = `plainws_my_role_v1${sfx}`;
export const DEVICE_KEY = `plainws_device_id_v1${sfx}`;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getOrCreateDeviceId(): string {
  let d = localStorage.getItem(DEVICE_KEY);
  if (!d) {
    d = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(DEVICE_KEY, d);
  }
  return d;
}

export async function login(user: string, password: string) {
  const r = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  if (!r.ok) throw new Error('login failed: ' + r.status);
  const data = await r.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY,  data.user);
  localStorage.setItem(ROLE_KEY,  data.role);
  return data;
}

/**
 * 토큰 갱신. 현재 토큰이 만료 전이어야 200. 만료된 토큰은 401.
 * 성공 시 localStorage TOKEN/USER/ROLE 갱신.
 */
export async function refresh() {
  const old = getToken();
  if (!old) throw new Error('no token');
  const r = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + old },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`refresh failed: ${r.status} ${text}`);
  }
  const data = await r.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY,  data.user);
  localStorage.setItem(ROLE_KEY,  data.role);
  return data;
}

/**
 * 회원가입. 성공 시 서버가 JWT 즉시 발급(자동 로그인) → 동일 데이터 localStorage 저장.
 * 실패 시 서버 메시지 그대로 throw.
 */
export async function register(user: string, password: string) {
  const r = await fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch {}
    throw new Error(msg || `register failed: ${r.status}`);
  }
  const data = await r.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY,  data.user);
  localStorage.setItem(ROLE_KEY,  data.role);
  return data;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ROLE_KEY);
  // 채팅 히스토리/그룹 메타는 유지 (다시 로그인 시 같은 키로 복원)
}

export async function fetchUsers(): Promise<string[]> {
  const token = getToken();
  // /users 는 일반 user 도 허용(role 무관). 기존 /admin/mongoose/users 는 admin 전용이었음.
  const r = await fetch('/users', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  if (!r.ok) {
    return [];
  }
  const data = await r.json();
  return (data.users || []).map((u: string) => u.split('@')[0]);
}
