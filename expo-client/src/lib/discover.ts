// 같은 와이파이에서 우리 서버(PC)를 자동 탐지.
// 폰의 IP 로 서브넷(/24)을 알아내 각 호스트의 GET /ping 마커를 병렬 확인 →
// 응답하는 IP 를 서버로 간주. (독립 APK 는 "어느 기기가 서버인지" 모르므로 이렇게 훑는다)
import * as Network from 'expo-network';

const SPRING_PORT = 8081;
const PROBE_TIMEOUT_MS = 800;
const CONCURRENCY = 24;

async function probe(ip: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(`http://${ip}:${SPRING_PORT}/ping`, { signal: ctrl.signal });
    if (!r.ok) return false;
    const j = await r.json();
    return j?.app === 'kakao-clone';
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** 저장된/특정 IP 가 우리 서버인지 빠른 확인. */
export async function isOurServer(ip: string): Promise<boolean> {
  return ip ? probe(ip) : false;
}

/** 같은 와이파이의 서버 IP 자동 탐지. 못 찾으면 null. */
export async function discoverHost(
  onProgress?: (done: number, total: number) => void,
): Promise<string | null> {
  let myIp = '';
  try { myIp = await Network.getIpAddressAsync(); } catch { return null; }
  const m = myIp.match(/^(\d+\.\d+\.\d+)\.(\d+)$/);
  if (!m) return null;
  const base = m[1];            // 예: 192.168.0
  const self = Number(m[2]);

  // 후보: 1..254(자기 제외). 자기 IP 와 가까운 쪽부터(같은 DHCP 풀일 확률↑).
  const order: number[] = [];
  for (let i = 1; i <= 254; i++) if (i !== self) order.push(i);
  order.sort((a, b) => Math.abs(a - self) - Math.abs(b - self));

  let done = 0;
  const total = order.length;
  for (let i = 0; i < order.length; i += CONCURRENCY) {
    const chunk = order.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (oct) => {
      const ip = `${base}.${oct}`;
      const ok = await probe(ip);
      done++;
      onProgress?.(done, total);
      return ok ? ip : null;
    }));
    const found = results.find(Boolean);
    if (found) return found;   // 찾으면 즉시 종료
  }
  return null;
}
