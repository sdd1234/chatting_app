// 앱 설정 (현재는 번역 대상 언어만). AsyncStorage 영속.
import { create } from 'zustand';
import { get as sget, set as sset } from './storage';

const LANG_KEY = 'app_translate_lang_v1';

interface SettingsState {
  lang: string; // 번역 대상 언어 코드 (기본 ko)
  setLang: (code: string) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  lang: 'ko',
  setLang: (code) => {
    sset(LANG_KEY, code); // fire-and-forget
    set({ lang: code });
  },
}));

/** 부팅 시 1회 복원. */
export async function hydrateSettings() {
  const code = await sget(LANG_KEY);
  if (code) useSettings.setState({ lang: code });
}
