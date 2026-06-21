import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/store';
import { Avatar } from '../components/Avatar';
import { getToken } from '../lib/api';

async function apiFriends() {
  const token = getToken();
  const res = await fetch('/friends', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const d = await res.json();
  return (d.friends ?? []) as string[];
}

async function apiAddFriend(target: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  const res = await fetch('/friends/add', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  const d = await res.json();
  if (!res.ok) return { ok: false, error: d.message ?? `오류 ${res.status}` };
  return { ok: true };
}

async function apiRemoveFriend(target: string) {
  const token = getToken();
  await fetch(`/friends/${encodeURIComponent(target)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function Friends() {
  const me = useAuth((s) => s.user);
  const [friends, setFriends] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    setFriends(await apiFriends());
    setLoading(false);
  };

  useEffect(() => { load(); }, [me]);

  const handleAdd = async () => {
    const target = input.trim();
    if (!target) return;
    setError('');
    const { ok, error: err } = await apiAddFriend(target);
    if (!ok) { setError(err ?? '추가 실패'); return; }
    setInput('');
    setAdding(false);
    await load();
  };

  const handleRemove = async (target: string) => {
    await apiRemoveFriend(target);
    setFriends((prev) => prev.filter((f) => f !== target));
  };

  const openAdd = () => {
    setAdding(true);
    setError('');
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 font-bold text-xl border-b border-kakao-divider bg-white flex items-center justify-between">
        <span>친구</span>
        <button
          onClick={openAdd}
          className="text-sm font-normal text-blue-500 hover:text-blue-700 px-2 py-1"
        >
          + 친구 추가
        </button>
      </div>

      {/* 친구 추가 입력창 */}
      {adding && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <div className="text-xs text-gray-500 mb-1">추가할 회원 아이디 입력</div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="아이디 입력 (예: alice)"
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleAdd}
              className="bg-blue-500 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-600"
            >
              추가
            </button>
            <button
              onClick={() => { setAdding(false); setError(''); }}
              className="text-gray-400 text-sm px-2"
            >
              취소
            </button>
          </div>
          {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
        </div>
      )}

      {/* 내 프로필 */}
      <div className="px-4 py-3 border-b border-kakao-divider flex items-center gap-3">
        <Avatar name={me || '?'} size={48} />
        <div className="flex-1">
          <div className="font-semibold">{me}</div>
          <div className="text-xs text-kakao-mutedText">나</div>
        </div>
      </div>

      {/* 친구 수 */}
      <div className="px-4 py-2 text-xs text-kakao-mutedText border-b border-kakao-divider">
        친구 {friends.length}
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-kakao-mutedText">불러오는 중...</div>
        )}
        {!loading && friends.length === 0 && (
          <div className="p-8 text-center text-kakao-mutedText text-sm">
            <div className="text-3xl mb-2">👥</div>
            <div>아직 추가한 친구가 없어요</div>
            <div className="text-xs mt-1">상단 "+ 친구 추가" 버튼으로 추가하세요</div>
          </div>
        )}
        {friends.map((u) => (
          <div
            key={u}
            className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
          >
            <button
              onClick={() => nav(`/chats/${u}`)}
              className="flex items-center gap-3 flex-1 text-left"
            >
              <Avatar name={u} size={40} />
              <div className="flex-1">
                <div className="text-sm font-medium">{u}</div>
                <div className="text-xs text-kakao-mutedText">탭하면 채팅 시작</div>
              </div>
            </button>
            <button
              onClick={() => handleRemove(u)}
              className="text-gray-300 hover:text-red-400 text-lg px-1"
              title="친구 삭제"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
