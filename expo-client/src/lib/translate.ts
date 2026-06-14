// 번역. Spring(:8081) /translate 프록시 호출 (MyMemory 또는 LibreTranslate 백엔드).
// 1주차 요구사항 "번역 기능" 의 모바일 포팅.
//
// ⚠️ Spring 측 /translate 컨트롤러는 아직 미구현(남은 작업). 클라 경로만 준비.
import { springBase } from './config';
import { getToken } from './api';

export const LANGS: { code: string; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
];

// 메모리 캐시: 같은 (text|target) 재요청 방지
const cache = new Map<string, string>();

export async function translate(text: string, target: string): Promise<string> {
  const key = `${target}|${text}`;
  const hit = cache.get(key);
  if (hit != null) return hit;

  const token = await getToken();
  const r = await fetch(`${springBase()}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ text, target }),
  });
  if (!r.ok) throw new Error('번역 실패: ' + r.status);
  const data = await r.json();
  const out = data.translated ?? data.text ?? text;
  cache.set(key, out);
  return out;
}
