import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { useAuth } from '../lib/store';
import { useSettings } from '../lib/settings';
import { LANGS } from '../lib/translate';
import { logout } from '../lib/api';
import { stopAutoRefresh } from '../lib/refresh';
import { disconnectWS, connectWS } from '../lib/ws';
import { getHost, setHost, springBase, wsUrl } from '../lib/config';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen(_props: Props) {
  const me = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const clear = useAuth((s) => s.clear);
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);
  const [server, setServer] = useState(getHost());

  async function onLogout() {
    stopAutoRefresh();
    disconnectWS();
    await logout();
    clear(); // → 인증 상태 해제 → 자동으로 Login 으로 전환
  }

  // 서버 IP 변경 + WS 재접속(로그인 유지한 채 새 서버로).
  async function onSaveServer() {
    await setHost(server.trim());
    if (me) { disconnectWS(); connectWS(me); }
    Alert.alert('서버 변경', `서버 주소를 ${server.trim()} 로 바꿨습니다.`);
  }

  return (
    <ScrollView style={styles.root}>
      <View style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{me?.[0]?.toUpperCase()}</Text></View>
        <Text style={styles.name}>{me}</Text>
        <Text style={styles.role}>{role}</Text>
      </View>

      <Text style={styles.sectionTitle}>번역 언어</Text>
      <View style={styles.card}>
        {LANGS.map((l) => (
          <TouchableOpacity key={l.code} style={styles.langRow} onPress={() => setLang(l.code)}>
            <Text style={styles.langLabel}>{l.label}</Text>
            {lang === l.code && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>서버 주소 (와이파이 바뀌면 PC 의 새 LAN IP 로)</Text>
      <View style={styles.card}>
        <View style={styles.serverRow}>
          <TextInput
            style={styles.serverInput}
            placeholder="예: 192.168.0.9" placeholderTextColor="#bbb"
            autoCapitalize="none" autoCorrect={false}
            value={server} onChangeText={setServer} onSubmitEditing={onSaveServer}
          />
          <TouchableOpacity style={styles.serverSave} onPress={onSaveServer}>
            <Text style={styles.serverSaveText}>저장+재접속</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.info}>Spring: {springBase()}</Text>
        <Text style={styles.info}>plain-ws: {wsUrl()}</Text>
      </View>

      <TouchableOpacity style={styles.logout} onPress={onLogout}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f7' },
  profile: { alignItems: 'center', paddingVertical: 28, backgroundColor: '#fff', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#FEE500', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, fontWeight: '800', color: '#3c1e1e' },
  name: { fontSize: 20, fontWeight: '700', marginTop: 10, color: '#191919' },
  role: { fontSize: 13, color: '#999', marginTop: 2 },
  sectionTitle: { fontSize: 12, color: '#999', fontWeight: '600', marginLeft: 16, marginBottom: 6, marginTop: 6 },
  card: { backgroundColor: '#fff', marginBottom: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  langLabel: { fontSize: 16, color: '#191919' },
  check: { fontSize: 18, color: '#0a7', fontWeight: '700' },
  info: { fontSize: 13, color: '#666', paddingHorizontal: 16, paddingVertical: 6 },
  serverRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  serverInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#191919' },
  serverSave: { backgroundColor: '#FEE500', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  serverSaveText: { fontSize: 13, fontWeight: '700', color: '#191919' },
  logout: { margin: 16, padding: 14, alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ffd0d0' },
  logoutText: { color: '#ff3b30', fontSize: 16, fontWeight: '600' },
});
