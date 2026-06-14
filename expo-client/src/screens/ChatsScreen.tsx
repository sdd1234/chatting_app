import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { useAuth, useChat, dmKey } from '../lib/store';
import { Avatar } from '../components/Avatar';

function fmtTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  return `${ampm} ${h % 12 || 12}:${m}`;
}

export default function ChatsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const rooms = useChat((s) => s.rooms);
  const unread = useChat((s) => s.unreadCount);

  const list = Object.keys(rooms)
    .filter((k) => k.startsWith('dm:'))
    .map((k) => {
      const other = k.slice(3);
      const msgs = rooms[k] || [];
      const last = msgs[msgs.length - 1];
      return { other, last, key: k, unread: unread[dmKey(other)] || 0 };
    })
    .filter((r) => r.other && r.other !== me && r.last)
    .sort((a, b) => (b.last!.ts || 0) - (a.last!.ts || 0));

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>채팅</Text>
        <TouchableOpacity onPress={() => nav.navigate('Settings')}><Text style={styles.gear}>⚙️</Text></TouchableOpacity>
      </View>
      <FlatList
        data={list}
        keyExtractor={(r) => r.key}
        ListEmptyComponent={<Text style={styles.empty}>친구 탭에서 대화를 시작하세요</Text>}
        renderItem={({ item }) => {
          const preview = item.last?.file ? '📎 파일' : item.last?.body ?? '';
          return (
            <TouchableOpacity style={styles.row} onPress={() => nav.navigate('ChatRoom', { other: item.other })}>
              <Avatar name={item.other} size={48} />
              <View style={styles.body}>
                <Text style={styles.name}>{item.other}</Text>
                <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
              </View>
              <View style={styles.meta}>
                {!!item.last && <Text style={styles.time}>{fmtTime(item.last.ts)}</Text>}
                {item.unread > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  header: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  gear: { fontSize: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  body: { flex: 1, marginLeft: 12 },
  name: { fontSize: 15, fontWeight: '600', color: '#191919' },
  preview: { fontSize: 13, color: '#999', marginTop: 3 },
  meta: { alignItems: 'flex-end' },
  time: { fontSize: 11, color: '#bbb' },
  badge: { backgroundColor: '#ff3b30', borderRadius: 11, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginTop: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#bbb', marginTop: 60, fontSize: 14 },
});
