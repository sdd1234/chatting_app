import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../lib/api';
import { useAuth } from '../lib/store';
import { withSlot } from '../lib/slot';

export function Register() {
  const [user, setUser]   = useState('');
  const [pass, setPass]   = useState('');
  const [pass2, setPass2] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState('');
  const nav = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);

  function localValidate(): string {
    const u = user.trim();
    if (!/^[a-z0-9_]{3,20}$/.test(u))   return '아이디: 소문자/숫자/언더스코어 3~20자';
    if (pass.length < 4 || pass.length > 64) return '비밀번호는 4~64자';
    if (pass !== pass2)                  return '비밀번호 확인이 일치하지 않음';
    return '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = localValidate();
    if (v) { setErr(v); return; }
    setErr(''); setLoading(true);
    try {
      const data = await register(user.trim(), pass);
      setAuth(data.user, data.role, data.token);
      nav(withSlot('/tabs/chats'));
    } catch (e: any) {
      setErr(e.message || '가입 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-[375px] h-full bg-white flex flex-col items-center justify-center px-8 shadow-lg">
      <div className="text-4xl font-black mb-1 select-none" style={{ color: '#FEE500', textShadow: '2px 2px 0 #999' }}>
        talk
      </div>
      <div className="text-sm text-gray-500 mb-8">회원가입</div>

      <form onSubmit={submit} className="w-full space-y-3">
        <input
          className="w-full border-b-2 border-gray-200 py-3 px-1 focus:border-yellow-400 outline-none text-base"
          placeholder="아이디 (소문자/숫자/_, 3~20자)"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          className="w-full border-b-2 border-gray-200 py-3 px-1 focus:border-yellow-400 outline-none text-base"
          placeholder="비밀번호 (4~64자)"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <input
          type="password"
          className="w-full border-b-2 border-gray-200 py-3 px-1 focus:border-yellow-400 outline-none text-base"
          placeholder="비밀번호 확인"
          value={pass2}
          onChange={(e) => setPass2(e.target.value)}
        />
        {err && <div className="text-red-500 text-sm">{err}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 mt-4 bg-kakao-yellow text-black font-bold rounded-md disabled:opacity-50"
        >
          {loading ? '가입 중...' : '가입하고 시작하기'}
        </button>
      </form>

      <div className="mt-6 text-sm">
        이미 계정이 있다면{' '}
        <Link to={withSlot('/login')} className="text-yellow-600 font-bold">로그인</Link>
      </div>

      <div className="mt-4 text-[10px] text-gray-400 text-center leading-relaxed">
        가입 즉시 자동 로그인됩니다 (JWT 1시간).<br />
        비번 검증/저장: Mongoose · role 시드: Spring Redis
      </div>

    </div>
  );
}
