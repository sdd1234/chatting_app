import { useEffect, useState } from 'react';
import { useRefreshStatus } from '../lib/refresh';

// 우상단 토큰 만료 카운트다운 + 마지막 갱신 시각.
// 시연 효과 — 5분 전이 되면 자동 갱신되는 거 눈으로 확인 가능.

export function TokenStatus() {
  const expiresAt = useRefreshStatus((s) => s.expiresAt);
  const lastRefreshAt = useRefreshStatus((s) => s.lastRefreshAt);
  const refreshing = useRefreshStatus((s) => s.refreshing);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!expiresAt) return null;
  const remainMs = expiresAt - now;
  const cls = refreshing
    ? 'bg-yellow-400 text-black animate-pulse'
    : remainMs < 5 * 60 * 1000
      ? 'bg-orange-400 text-black'
      : 'bg-gray-200 text-gray-700';

  const justRefreshed = lastRefreshAt && (now - lastRefreshAt) < 4000;

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}
      title={`만료: ${new Date(expiresAt).toLocaleTimeString()}${
        lastRefreshAt ? ` · 마지막 갱신: ${new Date(lastRefreshAt).toLocaleTimeString()}` : ''
      }`}
    >
      {refreshing ? '갱신중…' : justRefreshed ? '✓ 갱신됨' : `JWT ${fmtRemain(remainMs)}`}
    </span>
  );
}

function fmtRemain(ms: number): string {
  if (ms <= 0) return '만료';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60}m`;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}
