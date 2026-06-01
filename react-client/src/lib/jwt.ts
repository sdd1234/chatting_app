// JWT payload 디코드 (검증 X, exp/role 읽기용).
// 서명 검증은 서버가 하니까 클라는 만료 시각만 보면 됨.

export interface JwtPayload {
  sub?: string;
  role?: string;
  iat?: number;
  exp?: number;
  [k: string]: any;
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

/** 토큰 만료 ms (epoch). null이면 디코드 실패. */
export function expMs(token: string): number | null {
  const p = decodeJwt(token);
  if (!p || typeof p.exp !== 'number') return null;
  return p.exp * 1000;
}

/** 만료까지 남은 ms. 음수면 이미 만료. */
export function msUntilExp(token: string): number | null {
  const e = expMs(token);
  return e == null ? null : e - Date.now();
}
