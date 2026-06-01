import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useAuth, useChat,
  getDmMessages, getGroupMessages,
  dmKey, groupKey,
  unreadIndicatorFor,
} from '../lib/store';
import type { ChatMessage, GroupInfo } from '../lib/store';
import {
  sendMessage, sendGroupMessage,
  sendReadDM, sendReadGroup,
  sendTypingDM, sendTypingGroup,
} from '../lib/ws';
import { Avatar } from '../components/Avatar';

const TYPING_EMIT_THROTTLE_MS = 2_500;

export function ChatRoom() {
  const params = useParams<{ user?: string; groupId?: string }>();
  const isGroup = !!params.groupId;
  const me = useAuth((s) => s.user)!;
  const rooms = useChat((s) => s.rooms);
  const groups = useChat((s) => s.groups);
  const readReceipts = useChat((s) => s.readReceipts);
  const typingMap = useChat((s) => s.typing);

  const openRoom = useChat((s) => s.openRoom);
  const closeRoom = useChat((s) => s.closeRoom);
  const markLocalRead = useChat((s) => s.markLocalRead);

  const group = isGroup ? groups[params.groupId!] : undefined;
  const other = params.user;

  const roomK = isGroup
    ? (group ? groupKey(group.gid) : '')
    : (other ? dmKey(other) : '');

  const msgs: ChatMessage[] = isGroup
    ? (group ? getGroupMessages(group.gid, rooms) : [])
    : (other ? getDmMessages(me, other, rooms) : []);

  const [text, setText] = useState('');
  const nav = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const lastReadSentRef = useRef<Set<string>>(new Set());

  // 방 열기/닫기 — unreadCount 리셋
  useEffect(() => {
    if (!roomK) return;
    openRoom(roomK);
    return () => closeRoom();
  }, [roomK, openRoom, closeRoom]);

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length]);

  // 안 읽은 상대 메시지 → 읽음 처리(낙관적 + 상대에게 신호)
  useEffect(() => {
    if (!roomK || !msgs.length) return;
    const fresh: string[] = [];
    for (const m of msgs) {
      if (m.from === me) continue;
      if (lastReadSentRef.current.has(m.id)) continue;
      lastReadSentRef.current.add(m.id);
      fresh.push(m.id);
    }
    if (!fresh.length) return;

    // 본인 상태에도 "me가 읽음" 박기 — 시연 화면에서 즉시 반영
    markLocalRead(fresh, me);

    // 상대(들)에게 read receipt
    if (isGroup && group) sendReadGroup(me, group, fresh);
    else if (other) sendReadDM(other, fresh);
  }, [msgs.length, roomK, me, isGroup, group, other, markLocalRead]);

  function send() {
    const body = text.trim();
    if (!body) return;
    if (isGroup) {
      if (!group) return;
      sendGroupMessage(me, group, body);
    } else {
      if (!other) return;
      sendMessage(other, body);
    }
    setText('');
    lastTypingEmitRef.current = 0; // 전송 후 다음 입력은 즉시 typing 재발사
  }

  function onInput(v: string) {
    setText(v);
    if (!v.trim()) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current < TYPING_EMIT_THROTTLE_MS) return;
    lastTypingEmitRef.current = now;
    if (isGroup && group) sendTypingGroup(me, group);
    else if (other) sendTypingDM(other);
  }

  // 그룹인데 메타가 아직 안 들어온 경우
  if (isGroup && !group) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="px-2 py-3 border-b flex items-center gap-2">
          <button onClick={() => nav(-1)} className="px-2 text-2xl">‹</button>
          <div className="flex-1 font-semibold">단톡방</div>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          이 단톡방의 첫 메시지를 기다리는 중…
        </div>
      </div>
    );
  }

  const title = isGroup ? group!.gname : other!;
  const subtitle = isGroup
    ? group!.members.filter((m) => m !== me).join(', ') + ` · ${group!.members.length}명`
    : '';

  const typingUsers = (typingMap[roomK] || []).filter((u) => u !== me);

  return (
    <div className="flex flex-col h-full bg-kakao-chatBg">
      {/* 상단바 */}
      <div className="px-2 py-3 bg-kakao-chatBg border-b border-blue-200 flex items-center gap-2">
        <button onClick={() => nav(-1)} className="px-2 text-2xl">‹</button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base truncate">{title}</div>
          {subtitle && <div className="text-[10px] text-gray-600 truncate">{subtitle}</div>}
        </div>
        <button className="px-2 text-xl">☰</button>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {msgs.length === 0 && (
          <div className="text-center text-xs text-gray-600 py-8">
            {isGroup
              ? `${group!.members.filter((m) => m !== me).join(', ')} 와의 단톡방이 시작됐어요`
              : '대화의 시작 — 메시지를 입력하세요'}
          </div>
        )}
        {msgs.map((m, i) => {
          const mine = m.from === me;
          const prev = msgs[i - 1];
          const showSender = isGroup && !mine && (!prev || prev.from !== m.from);
          const unread = mine ? unreadIndicatorFor(m, me, group, readReceipts) : 0;
          return (
            <Bubble
              key={m.id}
              msg={m}
              mine={mine}
              showSender={showSender}
              unread={unread}
            />
          );
        })}

        {/* 타이핑 인디케이터 */}
        {typingUsers.length > 0 && (
          <TypingIndicator users={typingUsers} isGroup={isGroup} />
        )}
      </div>

      {/* 입력바 */}
      <div className="bg-white border-t border-gray-300 px-2 py-2 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="메시지 입력"
          rows={1}
          className="flex-1 resize-none outline-none px-3 py-2 bg-gray-100 rounded-lg text-sm max-h-24"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-kakao-yellow text-black font-bold rounded-md text-sm disabled:opacity-30"
        >
          전송
        </button>
      </div>
    </div>
  );
}

function Bubble({
  msg, mine, showSender, unread,
}: {
  msg: ChatMessage; mine: boolean; showSender: boolean; unread: number;
}) {
  const time = fmtTime(msg.ts);
  if (mine) {
    return (
      <div className="flex justify-end items-end gap-1">
        <div className="flex flex-col items-end mb-1">
          {unread > 0 && (
            <div className="text-[11px] text-yellow-600 font-bold leading-none">{unread}</div>
          )}
          <div className="text-[10px] text-gray-600 leading-none mt-0.5">{time}</div>
        </div>
        <div className="max-w-[70%] bg-kakao-bubbleMe text-black px-3 py-2 rounded-2xl rounded-tr-md whitespace-pre-wrap break-words text-sm">
          {msg.body}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <Avatar name={msg.from} size={36} />
      <div className="flex flex-col items-start gap-0.5">
        {showSender && <div className="text-xs text-gray-700">{msg.from}</div>}
        <div className="flex items-end gap-1">
          <div className="max-w-[260px] bg-kakao-bubbleOther text-black px-3 py-2 rounded-2xl rounded-tl-md whitespace-pre-wrap break-words text-sm shadow-sm">
            {msg.body}
          </div>
          <div className="text-[10px] text-gray-600 mb-1">{time}</div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ users, isGroup }: { users: string[]; isGroup: boolean }) {
  const label = isGroup ? users.join(', ') + ' 입력 중' : '입력 중';
  return (
    <div className="flex items-start gap-2">
      <Avatar name={users[0]} size={36} />
      <div className="flex flex-col items-start">
        {isGroup && <div className="text-xs text-gray-700">{users.join(', ')}</div>}
        <div className="bg-kakao-bubbleOther px-3 py-2 rounded-2xl rounded-tl-md shadow-sm flex items-center gap-1">
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
      style={{ animationDelay: `${delay}ms`, animationDuration: '900ms' }}
    />
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
