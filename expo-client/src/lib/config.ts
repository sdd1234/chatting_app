// 환경별 백엔드 base URL.
// 웹(vite)에서는 proxy 가 /auth /ws 를 8081/8090 으로 넘겼지만,
// RN(Expo)에는 proxy 가 없으므로 실제 호스트:포트를 직접 가리킨다.
//
// 문제: 실기기/에뮬레이터에서 "localhost" 는 PC 가 아니라 자기 자신을 가리킨다.
//   - 안드로이드 에뮬: 10.0.2.2 가 호스트 PC
//   - 실기기(Expo Go): PC 의 LAN IP (같은 와이파이)
// 해결: Expo Metro 가 알려주는 hostUri(= PC 의 LAN IP) 에서 호스트를 자동 추출한다.
//   WSL2 를 쓰는 경우 mirrored networking(.wslconfig) 이거나
//   Windows 포트프록시로 8081/8090 을 LAN 에 노출해야 폰에서 닿는다.
//
// 자동 추출이 안 맞으면 아래 MANUAL_HOST 를 직접 박아라. (예: '192.168.0.10')
import Constants from 'expo-constants';

const MANUAL_HOST: string | null = '192.168.0.9'; // PC 의 LAN IP (폰이 같은 와이파이로 붙음)

const SPRING_PORT = 8081; // 로그인 / JWT / 공지 / 번역 / 파일
const WS_PORT = 8090;     // plain-ws 채팅 라우터

function detectHost(): string {
  if (MANUAL_HOST) return MANUAL_HOST;
  // Expo Go: "192.168.0.10:8081" 형태. SDK 버전별로 위치가 달라 폭넓게 탐색.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ||
    '';
  const host = String(hostUri).split(':')[0];
  if (host) return host;
  // 독립 APK(EAS Build): Metro 가 없어 hostUri 가 비어있다.
  //  - 안드로이드 에뮬레이터: 10.0.2.2 = 호스트 PC
  //  - 실기기: 위 MANUAL_HOST 에 PC 의 LAN IP 를 직접 박아야 한다.
  return '10.0.2.2';
}

export const HOST = detectHost();

export const SPRING_BASE = `http://${HOST}:${SPRING_PORT}`;
export const WS_URL = `ws://${HOST}:${WS_PORT}/ws`;

// access token TTL 기본값 (서버가 안 알려줄 때 fallback). plain-ws ③안 검증과 무관.
export const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000;
