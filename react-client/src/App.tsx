import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { TabLayout } from './pages/TabLayout';
import { Friends } from './pages/Friends';
import { Chats } from './pages/Chats';
import { ChatRoom } from './pages/ChatRoom';
import { useAuth } from './lib/store';
import { NoticeToast } from './components/NoticeToast';

export default function App() {
  return (
    <BrowserRouter>
      <NoticeToast />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/tabs" element={<RequireAuth><TabLayout /></RequireAuth>}>
          <Route index element={<Navigate to="chats" replace />} />
          <Route path="friends" element={<Friends />} />
          <Route path="chats" element={<Chats />} />
        </Route>
        <Route path="/chats/g/:groupId" element={<RequireAuth><ChatRoomWrap /></RequireAuth>} />
        <Route path="/chats/:user" element={<RequireAuth><ChatRoomWrap /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ChatRoomWrap() {
  return (
    <div className="w-[375px] h-full bg-white shadow-lg flex flex-col">
      <ChatRoom />
    </div>
  );
}
