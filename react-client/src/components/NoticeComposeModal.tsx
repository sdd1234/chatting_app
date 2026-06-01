import { useState } from 'react';
import { publishNotice } from '../lib/notice';
import type { NoticeLevel } from '../lib/notice';

interface Props { onClose: () => void; }

const LEVELS: { v: NoticeLevel; label: string; cls: string }[] = [
  { v: 'info',     label: '공지',  cls: 'bg-blue-500'   },
  { v: 'warn',     label: '주의',  cls: 'bg-orange-500' },
  { v: 'critical', label: '긴급',  cls: 'bg-red-600'    },
];

export function NoticeComposeModal({ onClose }: Props) {
  const [body, setBody] = useState('');
  const [level, setLevel] = useState<NoticeLevel>('info');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ subs: number } | null>(null);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true); setErr('');
    try {
      const r = await publishNotice(text, level);
      setResult({ subs: r.redisSubscribers ?? r.localSessions ?? 0 });
      setBody('');
    } catch (e: any) {
      setErr(e.message || '발송 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center">
          <button onClick={onClose} className="text-2xl px-2">×</button>
          <div className="flex-1 text-center font-semibold">📢 단체 공지 발송</div>
          <div className="w-8" />
        </div>

        <div className="px-4 py-3 flex gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.v}
              onClick={() => setLevel(l.v)}
              className={`flex-1 py-2 rounded text-xs font-bold text-white ${
                level === l.v ? l.cls : 'bg-gray-300'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="px-4 pb-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="공지 본문 — 모든 접속 사용자의 화면에 동시 표시됨"
            rows={4}
            className="w-full p-2 border rounded text-sm outline-none focus:border-yellow-400 resize-none"
            autoFocus
          />
        </div>

        {err && <div className="px-4 pb-2 text-red-500 text-sm">{err}</div>}
        {result && (
          <div className="px-4 pb-2 text-green-700 text-xs">
            ✓ 발송 완료 — 구독자 {result.subs} 명에게 도착
          </div>
        )}

        <div className="px-4 pb-4">
          <button
            onClick={send}
            disabled={busy || !body.trim()}
            className="w-full py-2.5 bg-kakao-yellow text-black font-bold rounded disabled:opacity-30"
          >
            {busy ? '발송 중...' : '전체 발송'}
          </button>
          <div className="mt-2 text-[10px] text-gray-500 text-center">
            Spring `/admin/notice` → Redis publish → 모든 `/ws/notice` 구독자 fan-out
          </div>
        </div>
      </div>
    </div>
  );
}
