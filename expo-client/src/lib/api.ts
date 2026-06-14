// Spring(:8081) + plain-ws 인증 호출. RN 이라 절대 URL + 전부 async 저장.
// 슬롯 격리(멀티 인스턴스)는 RN 에 없으므로 단일 키만 쓴다.
import { SPRING_BASE } from './config';
import { get, set, del, secureGet, secureSet, secureDel } from './storage';

export const TOKEN_KEY = 'plainws_jwt_v1';
export const USER_KEY = 'plainws_my_user_v1';
export const ROLE_KEY = 'plainws_my_role_v1';
export const DEVICE_KEY = 'plainws_device_id_v1';

export interface AuthData {
  token: string;
  user: string;
  role: string;
  expiresInMs?: number;
}

// 토큰 메모리 캐시 — SecureStore 는 async 라, 렌더 같은 동기 컨텍스트(파일 다운로드 URL 구성)용.
let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  const t = await secureGet(TOKEN_KEY);
  cachedToken = t;
  return t;
}

/** 동기 컨텍스트용 — 마지막으로 읽히거나 저장된 토큰. getToken/login/refresh 가 한 번이라도 돌면 채워진다. */
export function getTokenSync(): string | null {
  return cachedToken;
}
export async function getUser(): Promise<string | null> {
  return get(USER_KEY);
}
export async function getRole(): Promise<string | null> {
  return get(ROLE_KEY);
}

export async function getOrCreateDeviceId(): Promise<string> {
  let d = await get(DEVICE_KEY);
  if (!d) {
    d = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    await set(DEVICE_KEY, d);
  }
  return d;
}

async function persist(data: AuthData) {
  cachedToken = data.token;
  await secureSet(TOKEN_KEY, data.token);
  await set(USER_KEY, data.user);
  await set(ROLE_KEY, data.role);
}

export async function login(user: string, password: string): Promise<AuthData> {
  const r = await fetch(`${SPRING_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  if (!r.ok) throw new Error('로그인 실패: ' + r.status);
  const data = (await r.json()) as AuthData;
  await persist(data);
  return data;
}

export async function register(user: string, password: string): Promise<AuthData> {
  const r = await fetch(`${SPRING_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch {}
    throw new Error(msg || `회원가입 실패: ${r.status}`);
  }
  const data = (await r.json()) as AuthData;
  await persist(data);
  return data;
}

/** 토큰 갱신. 현재 토큰이 만료 전이어야 200. 만료 시 401. */
export async function refresh(): Promise<AuthData> {
  const old = await getToken();
  if (!old) throw new Error('no token');
  const r = await fetch(`${SPRING_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + old },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`refresh failed: ${r.status} ${text}`);
  }
  const data = (await r.json()) as AuthData;
  await persist(data);
  return data;
}

export async function logout(): Promise<void> {
  cachedToken = null;
  await secureDel(TOKEN_KEY);
  await del(USER_KEY);
  await del(ROLE_KEY);
  // 채팅 히스토리는 유지 (재로그인 시 같은 키로 복원)
}

/** 친구 목록 = Mongoose 등록 사용자. /users 는 일반 user 도 허용(role 무관). */
export async function fetchUsers(): Promise<string[]> {
  const token = await getToken();
  const r = await fetch(`${SPRING_BASE}/users`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.users || []).map((u: string) => u.split('@')[0]);
}
