import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { useAuth } from '../lib/store';
import { useSettings } from '../lib/settings';
import { LANGS } from '../lib/translate';
import { logout } from '../lib/api';
import { stopAutoRefresh } from '../lib/refresh';
import { disconnectWS } from '../lib/ws';
import { HOST, SPRING_BASE, WS_URL } from '../lib/config';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen(_props: Props) {
  const me = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const clear = useAuth((s) => s.clear);
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);

  async function onLogout() {
    stopAutoRefresh();
    disconnectWS();
    await logout();
    clear(); // → 인증 상태 해제 → 자동으로 Login 으로 전환
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

      <Text style={styles.sectionTitle}>연결 정보</Text>
      <View style={styles.card}>
        <Text style={styles.info}>HOST: {HOST}</Text>
        <Text style={styles.info}>Spring: {SPRING_BASE}</Text>
        <Text style={styles.info}>plain-ws: {WS_URL}</Text>
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
  logout: { margin: 16, padding: 14, alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ffd0d0' },
  logoutText: { color: '#ff3b30', fontSize: 16, fontWeight: '600' },
});
