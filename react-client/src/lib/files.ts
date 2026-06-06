// 파일/이미지 첨부 (web). expo-client/src/lib/files.ts 와 동일한 인코딩 포맷 →
// expo ↔ 웹 사용자가 주고받은 파일 메시지를 서로 디코드 가능.
//
// - 업로드: Spring /files/upload (multipart) → { id, name, mime, size }
// - 표시: GET /files/{id} (공개) — <img> 또는 다운로드 링크
// - 채팅 전송: 파일 메타를 메시지 body 에 control-char prefix 로 인코딩(group/sys 와 같은 컨벤션)
import { getToken } from './api';

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  url: string;
}

// group.ts(\x01GRP\x01) / sys.ts(\x01SYS\x01) 와 같은 컨벤션. expo 와도 동일.
const FILE_PREFIX = '\x01FILE\x01';

export function encodeFileBody(file: FileMeta, caption: string): string {
  return FILE_PREFIX + JSON.stringify({ file, caption });
}

export function decodeFileBody(body: string): { file: FileMeta; body: string } | null {
  if (typeof body !== 'string' || !body.startsWith(FILE_PREFIX)) return null;
  try {
    const obj = JSON.parse(body.slice(FILE_PREFIX.length));
    if (obj && obj.file) return { file: obj.file, body: obj.caption || '' };
  } catch {}
  return null;
}

/** 선택한 File 을 Spring 에 업로드하고 FileMeta 반환. url 은 vite proxy 통해 /files/{id}. */
export async function uploadFile(file: File): Promise<FileMeta> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const r = await fetch('/files/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form,
  });
  if (!r.ok) throw new Error('업로드 실패: ' + r.status);
  const data = await r.json();
  return {
    id: data.id,
    name: data.name ?? file.name,
    mime: data.mime ?? file.type,
    url: `/files/${data.id}`,
  };
}
