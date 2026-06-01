// 한 PC에서 멀티 슬롯(=멀티 디바이스/user) 동시 실행 지원.
// URL `?slot=a` 로 들어오면 localStorage 키 전체가 _a 접미로 격리됨.
// slot 없으면 'main'. 슬롯 다르면 토큰/유저/디바이스ID/채팅로그 모두 별개.

export function getSlot(): string {
  try {
    const url = new URL(window.location.href);
    const s = url.searchParams.get('slot');
    return s ? s.toLowerCase() : 'main';
  } catch {
    return 'main';
  }
}

export function slotSuffix(): string {
  const s = getSlot();
  return s === 'main' ? '' : `_${s}`;
}

/**
 * 현재 URL의 ?slot= 등 query string을 유지한 path로 변환.
 * react-router의 nav()는 query를 자동 보존하지 않아 슬롯이 main으로 떨어지면
 * localStorage 키(=user별 채팅/단톡)가 다른 슬롯의 키로 바뀌어 데이터가 사라져 보임.
 * 모든 nav('/login'), nav('/tabs/chats') 등에 이 헬퍼를 거치게 한다.
 */
export function withSlot(path: string): string {
  const search = window.location.search;
  return search ? `${path}${search}` : path;
}
