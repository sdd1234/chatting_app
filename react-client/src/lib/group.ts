// 단톡방 메시지를 plain-ws의 1:1 라우팅 위에 얹기 위한 인코딩.
// plain-ws/Mongoose 서버는 변경 없음 — body 안에 control-char prefix로
// {gid, gname, members, cid} 를 박는다. 수신 측이 prefix 보면 그룹 방으로 분기.
//
// cid (client message id) = 본인 fanout 시 N-1번 echo가 와도 같은 cid면 1회만 표시.

const PREFIX = '\x01GRP\x01';
const DELIM  = '\x01\n';

export interface GroupMeta {
  gid: string;
  gname: string;
  members: string[]; // 본인 포함, 정렬됨
  cid: string;       // client message id (dedup용)
}

export function encodeGroupBody(meta: GroupMeta, body: string): string {
  return PREFIX + JSON.stringify(meta) + DELIM + body;
}

export interface DecodedGroup extends GroupMeta {
  body: string;
}

export function decodeGroupBody(raw: string): DecodedGroup | null {
  if (typeof raw !== 'string' || !raw.startsWith(PREFIX)) return null;
  const end = raw.indexOf(DELIM, PREFIX.length);
  if (end < 0) return null;
  try {
    const meta = JSON.parse(raw.slice(PREFIX.length, end)) as GroupMeta;
    if (!meta.gid || !Array.isArray(meta.members)) return null;
    return { ...meta, body: raw.slice(end + DELIM.length) };
  } catch {
    return null;
  }
}

export function newGroupId(): string {
  return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function newCid(): string {
  return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

// 그룹 멤버 정렬 (안정적 key 생성용)
export function sortedMembers(members: string[]): string[] {
  return [...new Set(members)].sort();
}
