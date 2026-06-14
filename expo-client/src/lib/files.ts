// 파일/이미지 첨부.
// - 업로드: Spring(:8081) /files/upload (multipart) → { id, url, name, mime }
// - 다운로드 표시: /files/{id} (GET) — url 필드로 옴
// - 채팅 전송: 파일 메타를 메시지 body 에 sentinel prefix 로 인코딩해 plain-ws 로 보냄
//   (서버 무변경 — 일반 텍스트 메시지처럼 라우팅되고 수신측에서 디코드)
//
// ⚠️ Spring 측 /files/* 컨트롤러는 아직 미구현(남은 작업). 클라 경로만 준비.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { springBase } from './config';
import { getToken, getTokenSync } from './api';

/** 파일 id 로 수신자 기준 절대 URL 구성 (발신자 url 무시 — 웹/앱 호환). 토큰 없음(메시지 저장/전송용). */
export function fileUrl(id: string): string {
  return `${springBase()}/files/${id}`;
}

/** 다운로드/표시용 URL — 렌더 시점에 내 토큰을 ?token= 으로 부착(다운로드도 인증 필요). */
export function fileSrcUrl(id: string): string {
  const t = getTokenSync();
  const base = fileUrl(id);
  return t ? `${base}?token=${encodeURIComponent(t)}` : base;
}

/** 저장(다운로드 강제)용 URL — ?dl=1 이면 서버가 attachment 로 내려줘 폰이 파일로 받음. */
export function fileDownloadUrl(id: string): string {
  return `${fileSrcUrl(id)}&dl=1`;
}

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  url: string;
}

const FILE_PREFIX = 'FILE';

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

interface LocalPick { uri: string; name: string; mime: string; }

/** 문서 선택 (취소 시 null). */
export async function pickDocument(): Promise<LocalPick | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name ?? 'file', mime: a.mimeType ?? 'application/octet-stream' };
}

/** 이미지 선택 (취소 시 null). */
export async function pickImage(): Promise<LocalPick | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('사진 접근 권한이 필요합니다');
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const name = a.fileName ?? a.uri.split('/').pop() ?? 'image.jpg';
  return { uri: a.uri, name, mime: a.mimeType ?? 'image/jpeg' };
}

/** 선택한 로컬 파일을 Spring 에 업로드하고 FileMeta 반환.
 *  RN 0.85 의 FormData 가 {uri,name,type} 파트를 거부("Unsupported FormDataPart")하므로
 *  expo-file-system 의 uploadAsync(MULTIPART) 로 네이티브 업로드한다. */
export async function uploadFile(pick: LocalPick): Promise<FileMeta> {
  const token = await getToken();
  const res = await uploadAsync(`${springBase()}/files/upload`, pick.uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: pick.mime,
    parameters: { name: pick.name },
    headers: { Authorization: 'Bearer ' + token },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error('업로드 실패: ' + res.status);
  }
  const data = JSON.parse(res.body);
  return {
    id: data.id,
    name: data.name ?? pick.name,
    mime: data.mime ?? pick.mime,
    url: fileUrl(data.id),
  };
}
