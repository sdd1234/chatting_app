// 저장 추상화.
// - 토큰(민감) → SecureStore (네이티브 키체인/키스토어). web 은 미지원이라 AsyncStorage fallback.
// - 그 외(user/role/deviceId/채팅로그) → AsyncStorage
// 웹의 localStorage 와 달리 전부 async 이므로 호출부는 await 한다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const useSecure = Platform.OS !== 'web';

export async function secureGet(key: string): Promise<string | null> {
  if (!useSecure) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
export async function secureSet(key: string, value: string): Promise<void> {
  if (!useSecure) return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}
export async function secureDel(key: string): Promise<void> {
  if (!useSecure) return AsyncStorage.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}

export async function get(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}
export async function set(key: string, value: string): Promise<void> {
  return AsyncStorage.setItem(key, value);
}
export async function del(key: string): Promise<void> {
  return AsyncStorage.removeItem(key);
}
