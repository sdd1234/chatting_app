import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { login } from '../lib/api';
import { useAuth } from '../lib/store';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);

  async function onLogin() {
    if (!user || !pw) { Alert.alert('입력', '아이디와 비밀번호를 입력하세요'); return; }
    setBusy(true);
    try {
      const data = await login(user.trim(), pw);
      setAuth(data.user, data.role, data.token); // → 인증 상태 변경 → 자동으로 Chats 로 전환
    } catch (e: any) {
      Alert.alert('로그인 실패', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.logo}>💬 kakao-clone</Text>
      <Text style={styles.sub}>MongooseIM · plain-ws · Spring</Text>

      <TextInput
        style={styles.input} placeholder="아이디" autoCapitalize="none" autoCorrect={false}
        value={user} onChangeText={setUser}
      />
      <TextInput
        style={styles.input} placeholder="비밀번호" secureTextEntry
        value={pw} onChangeText={setPw} onSubmitEditing={onLogin}
      />

      <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onLogin} disabled={busy}>
        {busy ? <ActivityIndicator color="#3c1e1e" /> : <Text style={styles.btnText}>로그인</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>회원가입</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#fff' },
  logo: { fontSize: 30, fontWeight: '800', textAlign: 'center', color: '#191919' },
  sub: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#e3e3e3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12, backgroundColor: '#fafafa',
  },
  btn: { backgroundColor: '#FEE500', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#3c1e1e' },
  link: { textAlign: 'center', color: '#666', marginTop: 18, fontSize: 14 },
});
