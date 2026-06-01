import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchUsers } from '../lib/api';
import { useAuth } from '../lib/store';
import { Avatar } from '../components/Avatar';

const KNOWN_USERS = ['admin', 'jihoon', 'emma', 'minho'];

export function Friends() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      let list = await fetchUsers();
      // admin 권한 아니면 fallback (시드 목록)
      if (!list.length) list = KNOWN_USERS;
      list = list.filter((u) => u !== me);
      setUsers(list);
      setLoading(false);
    })();
  }, [me]);

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="친구" />
      <div className="px-4 py-3 border-b border-kakao-divider flex items-center gap-3">
        <Avatar name={me || '?'} size={48} />
        <div className="flex-1">
          <div className="font-semibold">{me}</div>
          <div className="text-xs text-kakao-mutedText">나</div>
        </div>
      </div>
      <div className="px-4 py-2 text-xs text-kakao-mutedText border-b border-kakao-divider">
        친구 {users.length}
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-4 text-center text-kakao-mutedText">불러오는 중...</div>}
        {users.map((u) => (
          <button
            key={u}
            onClick={() => nav(`/chats/${u}`)}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 active:bg-gray-100"
          >
            <Avatar name={u} size={40} />
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">{u}</div>
              <div className="text-xs text-kakao-mutedText">탭하면 채팅 시작</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="px-4 pt-4 pb-3 font-bold text-xl border-b border-kakao-divider bg-white">
      {title}
    </div>
  );
}
