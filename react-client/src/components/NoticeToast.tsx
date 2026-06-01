import { useNotice } from '../lib/notice';
import type { NoticeLevel } from '../lib/notice';

// 화면 우상단 슬라이드 토스트. 모든 슬롯 탭에 동시 표시되는 게 핵심.
// TabLayout의 375px 카드 위에 absolute로 떠야 함 → fixed로 viewport 우측 상단에 박는다.

const levelStyle: Record<NoticeLevel, string> = {
  info:     'bg-blue-500',
  warn:     'bg-orange-500',
  critical: 'bg-red-600',
};

const levelLabel: Record<NoticeLevel, string> = {
  info:     '공지',
  warn:     '주의',
  critical: '긴급',
};

export function NoticeToast() {
  const toasts = useNotice((s) => s.toasts);
  const dismiss = useNotice((s) => s.dismiss);

  if (!toasts.length) return null;
  return (
    <div className="fixed top-3 right-3 z-[100] flex flex-col gap-2 max-w-[320px] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg shadow-lg text-white text-sm ${levelStyle[t.level]} animate-[slideIn_.25s_ease-out]`}
          style={{ animationName: 'slideIn' } as any}
        >
          <div className="px-3 py-2 flex items-start gap-2">
            <div className="text-[10px] font-bold uppercase opacity-80 mt-0.5">{levelLabel[t.level]}</div>
            <div className="flex-1 leading-snug whitespace-pre-wrap break-words">{t.body}</div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-white/80 hover:text-white text-lg leading-none"
              aria-label="닫기"
            >×</button>
          </div>
          <div className="px-3 pb-1.5 text-[10px] opacity-75 flex justify-between">
            <span>by {t.from}</span>
            <span>{fmtTime(t.ts)}</span>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}
