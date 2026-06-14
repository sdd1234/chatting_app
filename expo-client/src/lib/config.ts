// 백엔드 base URL. 런타임에 서버 IP 변경 가능(로그인/설정 화면에서 입력 → AsyncStorage 저장).
// 하드코딩이 아니라, 저장된 IP > Metro 자동추출 > 기본값 순으로 호스트를 정한다.
//   - 안드 에뮬레이터: 10.0.2.2 = 호스트 PC
//   - 실기기/APK: PC 의 LAN IP (같은 와이파이). 와이파이 옮기면 앱에서 IP 만 바꿔 넣으면 됨(재빌드 X).
import Constants from 'expo-constants';
import { get as sget, set as sset } from './storage';

const HOST_KEY = 'plainws_server_host_v1';
const DEFAULT_HOST = '192.168.0.9'; // 기본 시연 PC IP — 다른 와이파이면 앱에서 변경

const SPRING_PORT = 8081; // 로그인 / JWT / 공지 / 번역 / 파일
const WS_PORT = 8090;     // plain-ws 채팅 라우터

function autoDetect(): string {
  // Expo Go: "192.168.0.10:8081" 형태로 Metro 가 PC IP 를 알려줌. SDK 별로 위치가 달라 폭넓게 탐색.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ||
    '';
  const host = String(hostUri).split(':')[0];
  return host || DEFAULT_HOST; // 독립 APK 는 hostUri 가 비어 DEFAULT_HOST 사용
}

let _host = autoDetect();

/** 부팅 시 저장된 서버 IP 복원. App 최상단에서 1회 await(다른 connect 보다 먼저). */
export async function hydrateHost() {
  try {
    const saved = await sget(HOST_KEY);
    if (saved) _host = saved;
  } catch {}
}

export function getHost() { return _host; }

/** 서버 IP 변경 + 저장(포트는 고정). 변경 후 WS 재접속은 호출측에서 처리. */
export async function setHost(ip: string) {
  _host = (ip || '').trim();
  try { await sset(HOST_KEY, _host); } catch {}
}

// 매 요청 시 호출 → 런타임에 _host 가 바뀌어도 즉시 반영(상수 아님).
export function springBase() { return `http://${_host}:${SPRING_PORT}`; }
export function wsUrl() { return `ws://${_host}:${WS_PORT}/ws`; }

// access token TTL 기본값 (서버가 안 알려줄 때 fallback).
export const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;
