// 번역 (web). Spring /translate 프록시 호출 (구글 비공식 엔드포인트 백엔드).
// expo-client/src/lib/translate.ts 와 동일 동작.
import { getToken } from './api';

export const LANGS: { code: string; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
];

const cache = new Map<string, string>();

export async function translate(text: string, target: string): Promise<string> {
  const key = `${target}|${text}`;
  const hit = cache.get(key);
  if (hit != null) return hit;

  const token = getToken();
  const r = await fetch('/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ text, target }),
  });
  if (!r.ok) throw new Error('번역 실패: ' + r.status);
  const data = await r.json();
  const out = data.translated ?? text;
  cache.set(key, out);
  return out;
}
