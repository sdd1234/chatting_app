import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { register } from '../lib/api';
import { useAuth } from '../lib/store';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);

  async function onRegister() {
    if (!user || !pw) { Alert.alert('입력', '아이디와 비밀번호를 입력하세요'); return; }
    if (pw !== pw2) { Alert.alert('확인', '비밀번호가 일치하지 않습니다'); return; }
    setBusy(true);
    try {
      const data = await register(user.trim(), pw); // 성공 시 서버가 JWT 즉시 발급(자동 로그인)
      setAuth(data.user, data.role, data.token);
    } catch (e: any) {
      Alert.alert('회원가입 실패', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>회원가입</Text>
      <TextInput style={styles.input} placeholder="아이디" autoCapitalize="none" autoCorrect={false} value={user} onChangeText={setUser} />
      <TextInput style={styles.input} placeholder="비밀번호" secureTextEntry value={pw} onChangeText={setPw} />
      <TextInput style={styles.input} placeholder="비밀번호 확인" secureTextEntry value={pw2} onChangeText={setPw2} onSubmitEditing={onRegister} />

      <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onRegister} disabled={busy}>
        {busy ? <ActivityIndicator color="#3c1e1e" /> : <Text style={styles.btnText}>가입하기</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>이미 계정이 있어요 (로그인)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 28, color: '#191919' },
  input: {
    borderWidth: 1, borderColor: '#e3e3e3', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12, backgroundColor: '#fafafa',
  },
  btn: { backgroundColor: '#FEE500', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#3c1e1e' },
  link: { textAlign: 'center', color: '#666', marginTop: 18, fontSize: 14 },
});
