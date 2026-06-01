import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth, useChat } from '../lib/store';
import { logout } from '../lib/api';
import { connectWS, disconnectWS } from '../lib/ws';
import { connectNotice, disconnectNotice } from '../lib/notice';
import { startAutoRefresh, stopAutoRefresh } from '../lib/refresh';
import { withSlot } from '../lib/slot';
import { TokenStatus } from '../components/TokenStatus';

export function TabLayout() {
  const me = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const loadFromStorage = useChat((s) => s.loadFromStorage);
  const nav = useNavigate();

  // 로그인 후 plain-ws 연결 + 채팅 히스토리 로드
  useEffect(() => {
    if (!me) { nav('/login'); return; }
    loadFromStorage(me);
    connectWS(me);
    connectNotice();
    startAutoRefresh();
    return () => stopAutoRefresh();
  }, [me]);

  function onLogout() {
    disconnectWS();
    disconnectNotice();
    stopAutoRefresh();
    logout();
    clear();
    nav(withSlot('/login'));
  }

  return (
    <div className="w-[375px] h-full bg-white shadow-lg flex flex-col relative">
      <div className="absolute top-1 right-2 z-40 flex items-center gap-1">
        <TokenStatus />
      </div>
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <nav className="border-t border-kakao-divider bg-kakao-tabBar flex">
        <TabItem to="/tabs/friends" label="친구" icon="👥" />
        <TabItem to="/tabs/chats"   label="채팅" icon="💬" />
        <button
          onClick={onLogout}
          className="flex-1 py-2 text-xs text-kakao-tabIconOff hover:text-kakao-tabIconOn"
        >
          <div className="text-xl">⏻</div>
          로그아웃
        </button>
      </nav>
    </div>
  );
}

function TabItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex-1 py-2 text-xs text-center ${
          isActive ? 'text-kakao-tabIconOn font-bold' : 'text-kakao-tabIconOff'
        }`
      }
    >
      <div className="text-xl">{icon}</div>
      {label}
    </NavLink>
  );
}
