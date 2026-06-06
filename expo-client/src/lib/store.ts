// zustand 스토어. react-client 의 store.ts 를 1:1 채팅 중심으로 단순화.
// (단톡/읽음/타이핑은 1차 포팅에서 생략 — 추후 group.ts/sys.ts 포팅 시 추가)
// AsyncStorage 라 저장은 fire-and-forget, 로드는 부팅 시 hydrate() 1회.
import { create } from 'zustand';
import { get as sget, set as sset } from './storage';
import { getToken, getUser, getRole } from './api';

// ── 인증 ────────────────────────────────────────────────
interface AuthState {
  user: string | null;
  role: string | null;
  token: string | null;
  ready: boolean; // hydrate 완료 여부
  setAuth: (user: string, role: string, token: string) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  role: null,
  token: null,
  ready: false,
  setAuth: (user, role, token) => set({ user, role, token }),
  clear: () => set({ user: null, role: null, token: null }),
}));

/** 부팅 시 저장소에서 인증 상태 복원. App 최상단에서 1회 await. */
export async function hydrateAuth() {
  const [user, role, token] = await Promise.all([getUser(), getRole(), getToken()]);
  useAuth.setState({ user, role, token, ready: true });
}

// ── 채팅 ────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  ts: number;
  cid?: string;
  // 첨부: 파일/이미지 메시지면 채워짐
  file?: { id: string; name: string; mime: string; url: string };
}

function chatKey(user: string) { return `plainws_chat_log_v2_${user}`; }
export function dmKey(other: string) { return `dm:${other}`; }

interface ChatState {
  rooms: Record<string, ChatMessage[]>;
  unreadCount: Record<string, number>;
  currentRoom: string | null;
  appendMessage: (myUser: string, msg: ChatMessage) => void;
  loadFromStorage: (myUser: string) => Promise<void>;
  openRoom: (roomKey: string) => void;
  closeRoom: () => void;
}

function saveAll(myUser: string, rooms: Record<string, ChatMessage[]>) {
  const all = Object.values(rooms).flat();
  sset(chatKey(myUser), JSON.stringify(all)); // fire-and-forget
}

export const useChat = create<ChatState>((set) => ({
  rooms: {},
  unreadCount: {},
  currentRoom: null,

  appendMessage: (myUser, msg) => {
    set((s) => {
      const key = dmKey(msg.from === myUser ? msg.to : msg.from);
      const list = s.rooms[key] || [];
      if (list.some((m) => m.id === msg.id)) return s;
      if (msg.cid && list.some((m) => m.cid === msg.cid && m.from === msg.from)) return s;

      const next = [...list, msg];
      const rooms = { ...s.rooms, [key]: next };
      saveAll(myUser, rooms);

      let unreadCount = s.unreadCount;
      if (msg.from !== myUser && s.currentRoom !== key) {
        unreadCount = { ...unreadCount, [key]: (unreadCount[key] || 0) + 1 };
      }
      return { rooms, unreadCount };
    });
  },

  loadFromStorage: async (myUser) => {
    try {
      const raw = await sget(chatKey(myUser));
      if (!raw) return;
      const arr: ChatMessage[] = JSON.parse(raw);
      const rooms: Record<string, ChatMessage[]> = {};
      for (const m of arr) {
        const key = dmKey(m.from === myUser ? m.to : m.from);
        (rooms[key] ||= []).push(m);
      }
      set({ rooms });
    } catch {}
  },

  openRoom: (roomKey) =>
    set((s) => ({ currentRoom: roomKey, unreadCount: { ...s.unreadCount, [roomKey]: 0 } })),
  closeRoom: () => set({ currentRoom: null }),
}));

export function getDmMessages(other: string, rooms: Record<string, ChatMessage[]>) {
  return rooms[dmKey(other)] || [];
}
