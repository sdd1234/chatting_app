// 시스템 신호(read/typing) 를 plain-ws의 'msg' body 위에 얹기 위한 인코딩.
// 서버는 그대로 1:1 라우팅만. 수신 측이 prefix 보면 store에만 반영하고
// 메시지 리스트에는 넣지 않음.

const PREFIX = '\x01SYS\x01';
const DELIM  = '\x01\n';

export type SysKind = 'read' | 'typing';

export interface SysSignal {
  kind: SysKind;
  gid?: string;      // 그룹이면 그룹 id
  // read
  ids?: string[];    // 읽었다고 보고하는 메시지 id 목록
  // typing 은 별도 필드 없음 — 도착 자체가 "지금 치고 있다" 신호
}

export function encodeSysBody(sig: SysSignal): string {
  return PREFIX + JSON.stringify(sig) + DELIM;
}

export function decodeSysBody(raw: string): SysSignal | null {
  if (typeof raw !== 'string' || !raw.startsWith(PREFIX)) return null;
  const end = raw.indexOf(DELIM, PREFIX.length);
  if (end < 0) return null;
  try {
    const sig = JSON.parse(raw.slice(PREFIX.length, end)) as SysSignal;
    if (sig.kind !== 'read' && sig.kind !== 'typing') return null;
    return sig;
  } catch {
    return null;
  }
}
