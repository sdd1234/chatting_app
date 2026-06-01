import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../lib/api';
import { useAuth } from '../lib/store';
import { withSlot } from '../lib/slot';

export function Login() {
  const [user, setUser] = useState('jihoon');
  const [password, setPassword] = useState('jihoon123');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const data = await login(user.trim(), password);
      setAuth(data.user, data.role, data.token);
      nav(withSlot('/tabs/chats'));
    } catch (e: any) {
      setErr('로그인 실패 — 아이디/비번 확인');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-[375px] h-full bg-white flex flex-col items-center justify-center px-8 shadow-lg">
      <div className="text-7xl font-black text-yellow-500 mb-2 select-none" style={{ color: '#FEE500', textShadow: '2px 2px 0 #999' }}>
        talk
      </div>
      <div className="text-sm text-gray-500 mb-12">로그인하고 친구와 대화하세요</div>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          className="w-full border-b-2 border-gray-200 py-3 px-1 focus:border-yellow-400 outline-none text-base"
          placeholder="아이디"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          className="w-full border-b-2 border-gray-200 py-3 px-1 focus:border-yellow-400 outline-none text-base"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="text-red-500 text-sm">{err}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 mt-6 bg-kakao-yellow text-black font-bold rounded-md disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '카카오 계정 로그인'}
        </button>
      </form>

      <div className="mt-6 text-sm">
        계정이 없다면{' '}
        <Link to={withSlot('/register')} className="text-yellow-600 font-bold">회원가입</Link>
      </div>

      <div className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
        시연 계정: admin/admin123 · jihoon/jihoon123<br />
        emma/emma123 · minho/minho123
      </div>
    </div>
  );
}
