import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { login } from '../lib/api';
import { useAuth } from '../lib/store';
import { getHost, setHost } from '../lib/config';
import { discoverHost, isOurServer } from '../lib/discover';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);
  const [server, setServer] = useState(getHost());
  const [showServer, setShowServer] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function saveServer() {
    await setHost(server);
    setShowServer(false);
    Alert.alert('서버 설정', `서버 주소를 ${server} 로 저장했습니다.\n로그인하면 적용됩니다.`);
  }

  // 같은 와이파이에서 서버 IP 자동 탐지. found 시 호스트 저장.
  async function autoDetect(silent = false) {
    setScanning(true);
    try {
      const ip = await discoverHost();
      if (ip) {
        await setHost(ip);
        setServer(ip);
        if (!silent) Alert.alert('서버 찾음', `서버를 찾았습니다: ${ip}`);
      } else if (!silent) {
        Alert.alert('자동 탐지 실패', '같은 와이파이에서 서버를 못 찾았습니다. PC 가 켜져 있는지 확인하거나 IP 를 직접 입력하세요.');
      }
    } finally {
      setScanning(false);
    }
  }

  // 화면 진입 시: 저장된 IP 가 안 맞으면 조용히 자동 탐지(=와이파이만 맞추면 알아서 연결).
  useEffect(() => {
    (async () => {
      if (await isOurServer(getHost())) return; // 이미 맞으면 그대로
      autoDetect(true);
    })();
  }, []);

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
      <Text style={styles.logo}>talk</Text>
      <Text style={styles.sub}>로그인하고 친구와 대화하세요</Text>

      <TextInput
        style={styles.input} placeholder="아이디" placeholderTextColor="#bbb"
        autoCapitalize="none" autoCorrect={false}
        value={user} onChangeText={setUser}
      />
      <TextInput
        style={styles.input} placeholder="비밀번호" placeholderTextColor="#bbb" secureTextEntry
        value={pw} onChangeText={setPw} onSubmitEditing={onLogin} returnKeyType="go"
      />

      <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onLogin} disabled={busy}>
        {busy ? <ActivityIndicator color="#191919" /> : <Text style={styles.btnText}>카카오 계정 로그인</Text>}
      </TouchableOpacity>

      <View style={styles.signupRow}>
        <Text style={styles.signupText}>계정이 없다면 </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.signupLink}>회원가입</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.demo}>
        시연 계정: admin/admin123 · jihoon/jihoon123{'\n'}emma/emma123 · minho/minho123
      </Text>

      {/* 서버 — 같은 와이파이면 자동 탐지. 안 되면 IP 직접 입력 */}
      <TouchableOpacity onPress={() => setShowServer((v) => !v)} disabled={scanning}>
        <Text style={styles.serverToggle}>
          {scanning ? '🔍 서버 찾는 중…' : `⚙ 서버 ${getHost()} ${showServer ? '▲' : '▼'}`}
        </Text>
      </TouchableOpacity>
      {showServer && (
        <>
          <View style={styles.serverBox}>
            <TextInput
              style={styles.serverInput}
              placeholder="예: 192.168.0.9" placeholderTextColor="#bbb"
              autoCapitalize="none" autoCorrect={false}
              value={server} onChangeText={setServer} onSubmitEditing={saveServer}
            />
            <TouchableOpacity style={styles.serverSave} onPress={saveServer}>
              <Text style={styles.serverSaveText}>저장</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.autoBtn} onPress={() => autoDetect(false)} disabled={scanning}>
            <Text style={styles.autoBtnText}>{scanning ? '찾는 중…' : '🔍 같은 와이파이에서 자동 탐지'}</Text>
          </TouchableOpacity>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, backgroundColor: '#fff' },
  logo: {
    fontSize: 64, fontWeight: '900', textAlign: 'center', color: '#FEE500',
    textShadowColor: '#999', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0,
  },
  sub: { fontSize: 13, color: '#999', textAlign: 'center', marginTop: 8, marginBottom: 44 },
  input: {
    borderBottomWidth: 2, borderBottomColor: '#eee',
    paddingVertical: 12, paddingHorizontal: 4, fontSize: 16, marginBottom: 12,
  },
  btn: { backgroundColor: '#FEE500', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#191919' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  signupText: { fontSize: 14, color: '#555' },
  signupLink: { fontSize: 14, color: '#caa400', fontWeight: '700' },
  demo: { marginTop: 16, fontSize: 11, color: '#bbb', textAlign: 'center', lineHeight: 18 },
  serverToggle: { marginTop: 22, fontSize: 12, color: '#aaa', textAlign: 'center' },
  serverBox: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  serverInput: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 8, fontSize: 14, color: '#191919' },
  serverSave: { backgroundColor: '#eee', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  serverSaveText: { fontSize: 13, fontWeight: '700', color: '#333' },
  autoBtn: { marginTop: 10, alignSelf: 'center', backgroundColor: '#eef4ff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#cdddf5' },
  autoBtnText: { fontSize: 13, color: '#2b6cb0', fontWeight: '600' },
});
