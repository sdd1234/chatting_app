# expo-client — 카톡 클론 모바일 (React Native / Expo)

6주차 ② : 기존 `react-client`(PC 시연용, Vite)를 **Expo CLI** 기반 React Native 앱으로 포팅.
RN CLI 는 쓰지 않는다(미팅 결정). 채팅 통신 레이어(plain-ws / Spring REST)는 그대로 재사용.

## 화면
| 화면 | 내용 |
|---|---|
| Login | 아이디/비밀번호 → `/auth/login` → JWT |
| Register | 회원가입 → 즉시 자동 로그인 |
| Chats | 친구 목록(Mongoose users) + 대화방 목록(안 읽음 배지) + 연결상태(🟢/⚪️) |
| ChatRoom | 말풍선(카톡식) · 파일/이미지 첨부 · **번역 토글**(상대 메시지를 내 언어로) |
| Settings | 번역 언어 선택 · 연결 정보 · 로그아웃 |

## 웹(react-client)과 달라진 점 (RN 포팅)
| 웹 | RN |
|---|---|
| `localStorage` (동기) | `AsyncStorage` + 토큰은 `expo-secure-store` (전부 async) |
| `atob` | `base-64` 패키지 |
| `react-router-dom` | `@react-navigation/native-stack` |
| Vite proxy (`/auth`, `/ws`) | `src/lib/config.ts` 가 절대 URL 로 분기 |
| 슬롯 멀티 인스턴스(`?slot=`) | 없음 (모바일은 단일 인스턴스) |
| 단톡/읽음/타이핑 | 1차 포팅에서 생략 (추후 group/sys 포팅) |
| — | **파일 첨부 · 번역** 신규 |

## 6주차 ① 토큰 검증 연동
plain-ws 가 `msg` 진입마다 토큰을 재검증(③안)하므로, 자동 리프레시 직후
`sendAuthRefresh(token)` 으로 새 토큰을 ws 에 올려 소켓을 유지한다. (`src/lib/refresh.ts`)

## 실행
```bash
cd expo-client
npx expo install        # SDK 에 맞는 정확한 버전으로 의존성 정렬 (최초 1회 권장)
npm run typecheck       # 타입 점검
npx expo start          # QR → Expo Go(실기기) 또는 a/i(에뮬레이터)
```

### ⚠️ 백엔드 주소 (config.ts)
RN 은 vite proxy 가 없다. 실기기/에뮬에서 `localhost` 는 PC 가 아니다.
- 자동: Expo Metro 의 hostUri(= PC LAN IP)에서 호스트를 추출한다.
- 안 맞으면 `src/lib/config.ts` 의 `MANUAL_HOST` 에 PC IP 를 직접 박는다.
- WSL2 사용 시 mirrored networking(`.wslconfig`) 또는 포트프록시로 8081/8090 을 LAN 에 노출해야 폰에서 닿는다.

## 남은 작업 (백엔드 미구현)
파일/번역은 **클라 경로만 준비**됐고, Spring 측 컨트롤러가 아직 없다:
- `POST /files/upload` (multipart), `GET /files/{id}`
- `POST /translate` (MyMemory 또는 LibreTranslate 프록시)
- `react-client` 에도 동일 기능(파일/번역) 포팅
- 친구 목록 경로: 현재 `/admin/mongoose/users`(admin 전용). 일반 사용자용 `/users` alias 검토
