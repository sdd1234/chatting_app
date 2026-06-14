// 한 PC에서 멀티 슬롯(=멀티 디바이스/user) 동시 실행 지원.
// 슬롯이 다르면 토큰/유저/디바이스ID 등 localStorage 키 전체가 _슬롯 접미로 격리됨.
//
// 슬롯 결정 우선순위:
//  1) URL `?slot=a` 가 있으면 그걸 사용 (수동 지정 — 기존 호환, 'main' 명시도 가능)
//  2) 없으면 sessionStorage 캐시(탭별 격리)에서 재사용 → 새로고침해도 같은 슬롯 유지
//  3) 그래도 없으면 비어있는 슬롯(a→b→c…)을 자동 할당
//
// sessionStorage 는 탭마다 독립이라, 같은 PC에서 새 탭을 열 때마다
// 자동으로 다른 슬롯이 잡혀 서로 다른 유저로 동시 로그인 가능.

const SLOT_POOL = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const CACHE_KEY = 'plainws_auto_slot';      // sessionStorage (탭별)
const INUSE_KEY = 'plainws_slots_inuse';    // localStorage (탭 간 공유)

function readInUse(): string[] {
  try { return JSON.parse(localStorage.getItem(INUSE_KEY) || '[]') || []; }
  catch { return []; }
}
function writeInUse(arr: string[]): void {
  try { localStorage.setItem(INUSE_KEY, JSON.stringify([...new Set(arr)])); }
  catch { /* ignore */ }
}

let _slot: string | null = null;

export function getSlot(): string {
  if (_slot) return _slot;
  try {
    // 1) URL 수동 지정
    const fromUrl = new URL(window.location.href).searchParams.get('slot');
    if (fromUrl) {
      _slot = fromUrl.toLowerCase();
      return _slot;
    }

    // 2) 이 탭이 이미 받은 슬롯 (새로고침 대비)
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      _slot = cached;
      writeInUse([...readInUse(), cached]);  // 점유 갱신
      return _slot;
    }

    // 3) 빈 슬롯 자동 할당
    const inUse = readInUse();
    const free = SLOT_POOL.find((s) => !inUse.includes(s)) || SLOT_POOL[0];
    _slot = free;
    sessionStorage.setItem(CACHE_KEY, free);
    writeInUse([...inUse, free]);
    return _slot;
  } catch {
    _slot = 'main';
    return _slot;
  }
}

export function slotSuffix(): string {
  const s = getSlot();
  return s === 'main' ? '' : `_${s}`;
}

/**
 * 현재 슬롯을 유지한 path 로 변환.
 * 자동 슬롯은 sessionStorage 로 유지되므로 URL query 는 더 이상 필요 없지만,
 * `?slot=` 로 수동 지정해 들어온 경우엔 query 를 보존해야 nav 시 슬롯이 안 바뀐다.
 */
export function withSlot(path: string): string {
  const search = window.location.search;
  return search.includes('slot=') ? `${path}${search}` : path;
}

// 탭이 닫히면 점유 해제 (새로고침도 발동하지만, sessionStorage 캐시가 살아있어
// 재로드 시 getSlot 이 같은 슬롯을 다시 점유하므로 안전).
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      const s = sessionStorage.getItem(CACHE_KEY);
      if (s) writeInUse(readInUse().filter((x) => x !== s));
    } catch { /* ignore */ }
  });
}
