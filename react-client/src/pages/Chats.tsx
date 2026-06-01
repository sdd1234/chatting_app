import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useChat, dmKey, groupKey } from '../lib/store';
import type { GroupInfo, ChatMessage } from '../lib/store';
import { Avatar } from '../components/Avatar';
import { NewGroupModal } from '../components/NewGroupModal';
import { NoticeComposeModal } from '../components/NoticeComposeModal';
import { useNotice } from '../lib/notice';

interface Row {
  kind: 'dm' | 'group';
  id: string;        // dm: 상대 user / group: gid
  title: string;
  subtitle: string;  // 마지막 메시지 미리보기
  ts: number;
  group?: GroupInfo;
}

export function Chats() {
  const me = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const rooms = useChat((s) => s.rooms);
  const groups = useChat((s) => s.groups);
  const unreadCount = useChat((s) => s.unreadCount);
  const noticeConnected = useNotice((s) => s.connected);
  const nav = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

  const list: (Row & { unread: number })[] = [];

  // 1:1 방
  for (const [key, msgs] of Object.entries(rooms)) {
    if (!key.startsWith('dm:')) continue;
    const other = key.slice(3);
    if (!other || other === me) continue;
    const last = msgs[msgs.length - 1];
    list.push({
      kind: 'dm',
      id: other,
      title: other,
      subtitle: last?.body || '',
      ts: last?.ts || 0,
      unread: unreadCount[dmKey(other)] || 0,
    });
  }

  // 그룹 방 (메시지 없어도 표시)
  for (const g of Object.values(groups)) {
    const msgs = rooms[groupKey(g.gid)] || [];
    const last: ChatMessage | undefined = msgs[msgs.length - 1];
    const others = g.members.filter((m) => m !== me);
    list.push({
      kind: 'group',
      id: g.gid,
      title: g.gname,
      subtitle: last ? (last.from === me ? '나: ' : `${last.from}: `) + last.body
                     : `${others.join(', ')} 와의 단톡방`,
      ts: last?.ts || g.createdAt,
      group: g,
      unread: unreadCount[groupKey(g.gid)] || 0,
    });
  }

  list.sort((a, b) => b.ts - a.ts);

  function openRow(r: Row) {
    if (r.kind === 'dm') nav(`/chats/${r.id}`);
    else nav(`/chats/g/${r.id}`);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 pt-4 pb-3 border-b border-kakao-divider flex items-center gap-2">
        <div className="flex-1 font-bold text-xl flex items-center gap-1">
          채팅
          <span
            title={noticeConnected ? '공지 채널 구독 중' : '공지 채널 끊김'}
            className={`w-1.5 h-1.5 rounded-full ${noticeConnected ? 'bg-green-500' : 'bg-gray-300'}`}
          />
        </div>
        {role === 'admin' && (
          <button
            onClick={() => setShowNotice(true)}
            className="px-3 py-1 rounded-full bg-red-500 text-white text-sm font-bold"
            title="단체 공지 발송 (admin)"
          >
            📢 공지
          </button>
        )}
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1 rounded-full bg-kakao-yellow text-black text-sm font-bold"
          title="새 채팅/단톡방"
        >
          + 새 채팅
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 && (
          <div className="px-6 pt-20 text-center text-kakao-mutedText">
            아직 대화가 없습니다.<br />
            <span className="text-xs">+ 새 채팅 으로 친구 1명(1:1) 또는 2명 이상(단톡)을 골라보세요.</span>
          </div>
        )}
        {list.map((r) => (
          <button
            key={r.kind + ':' + r.id}
            onClick={() => openRow(r)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 border-b border-kakao-divider"
          >
            {r.kind === 'group'
              ? <GroupAvatar members={r.group!.members.filter((m) => m !== me)} />
              : <Avatar name={r.id} size={48} />}
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-semibold flex items-center gap-1">
                <span className="truncate">{r.title}</span>
                {r.kind === 'group' && (
                  <span className="text-xs text-kakao-mutedText shrink-0">
                    {r.group!.members.length}
                  </span>
                )}
              </div>
              <div className="text-xs text-kakao-mutedText truncate">{r.subtitle}</div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="text-[10px] text-kakao-mutedText">
                {r.ts ? fmtTime(r.ts) : ''}
              </div>
              {r.unread > 0 && (
                <div className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {r.unread > 99 ? '99+' : r.unread}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {showNew && (
        <NewGroupModal
          onClose={() => setShowNew(false)}
          onCreated={(kind, id) => {
            setShowNew(false);
            if (kind === 'dm') nav(`/chats/${id}`);
            else nav(`/chats/g/${id}`);
          }}
        />
      )}
      {showNotice && (
        <NoticeComposeModal onClose={() => setShowNotice(false)} />
      )}
    </div>
  );
}

function GroupAvatar({ members }: { members: string[] }) {
  // 최대 4명 썸네일 2x2 그리드, 빈 자리는 회색
  const slots = members.slice(0, 4);
  while (slots.length < (members.length >= 2 ? 4 : 1)) slots.push('');
  return (
    <div className="w-12 h-12 rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 gap-px bg-gray-200 shrink-0">
      {slots.map((m, i) =>
        m ? (
          <div key={i} className="bg-white">
            <Avatar name={m} size={24} />
          </div>
        ) : (
          <div key={i} className="bg-gray-200" />
        ),
      )}
    </div>
  );
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  return `${ampm} ${h12}:${m}`;
}

