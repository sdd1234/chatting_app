import { useEffect, useMemo, useState } from 'react';
import { fetchUsers } from '../lib/api';
import { useAuth, useChat } from '../lib/store';
import { Avatar } from './Avatar';

const KNOWN_USERS = ['admin', 'jihoon', 'emma', 'minho'];

interface Props {
  onClose: () => void;
  onCreated: (kind: 'dm' | 'group', id: string) => void;
}

export function NewGroupModal({ onClose, onCreated }: Props) {
  const me = useAuth((s) => s.user)!;
  const createGroup = useChat((s) => s.createGroup);
  const [users, setUsers] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gname, setGname] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let list = await fetchUsers();
      if (!list.length) list = KNOWN_USERS;
      list = list.filter((u) => u !== me).sort();
      setUsers(list);
      setLoading(false);
    })();
  }, [me]);

  function toggle(u: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(u)) next.delete(u); else next.add(u);
      return next;
    });
  }

  const picked = useMemo(() => [...selected], [selected]);
  const canCreate = picked.length >= 1;

  function submit() {
    if (!canCreate) return;
    if (picked.length === 1) {
      // 1:1 — 그룹 만들지 않고 바로 채팅방으로
      onCreated('dm', picked[0]);
      return;
    }
    const info = createGroup(me, gname, picked);
    onCreated('group', info.gid);
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl max-h-[80%] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center">
          <button onClick={onClose} className="text-2xl px-2">×</button>
          <div className="flex-1 text-center font-semibold">
            대화 상대 선택 <span className="text-xs text-gray-400">({picked.length})</span>
          </div>
          <button
            onClick={submit}
            disabled={!canCreate}
            className="px-3 py-1.5 rounded bg-kakao-yellow text-black text-sm font-bold disabled:opacity-30"
          >
            {picked.length >= 2 ? '단톡 만들기' : picked.length === 1 ? '1:1 채팅' : '확인'}
          </button>
        </div>

        {/* 선택된 chip */}
        {picked.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
            {picked.map((u) => (
              <button
                key={u}
                onClick={() => toggle(u)}
                className="px-2 py-0.5 rounded-full bg-yellow-100 text-xs flex items-center gap-1"
              >
                {u} <span className="text-gray-500">×</span>
              </button>
            ))}
          </div>
        )}

        {/* 그룹명 (2명 이상일 때만) */}
        {picked.length >= 2 && (
          <div className="px-4 py-2 border-b border-gray-100">
            <input
              value={gname}
              onChange={(e) => setGname(e.target.value)}
              placeholder="단톡방 이름 (비우면 자동)"
              className="w-full text-sm outline-none border-b border-gray-200 py-1 focus:border-yellow-400"
            />
          </div>
        )}

        {/* 친구 리스트 */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-center text-gray-400">불러오는 중…</div>}
          {users.map((u) => {
            const on = selected.has(u);
            return (
              <button
                key={u}
                onClick={() => toggle(u)}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 active:bg-gray-100"
              >
                <Avatar name={u} size={40} />
                <div className="flex-1 text-left text-sm">{u}</div>
                <div className={`w-5 h-5 rounded-full border-2 ${
                  on ? 'bg-kakao-yellow border-yellow-500' : 'border-gray-300'
                } flex items-center justify-center`}>
                  {on && <div className="text-xs">✓</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
