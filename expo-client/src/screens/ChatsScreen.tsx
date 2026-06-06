import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { useAuth, useChat, dmKey } from '../lib/store';
import { fetchUsers } from '../lib/api';
import { subscribeStatus } from '../lib/ws';

type Props = NativeStackScreenProps<RootStackParamList, 'Chats'>;

export default function ChatsScreen({ navigation }: Props) {
  const me = useAuth((s) => s.user);
  const rooms = useChat((s) => s.rooms);
  const unread = useChat((s) => s.unreadCount);
  const [friends, setFriends] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => subscribeStatus((s) => setConnected(s.connected)), []);

  const loadFriends = useCallback(async () => {
    setRefreshing(true);
    try { setFriends((await fetchUsers()).filter((u) => u !== me)); }
    finally { setRefreshing(false); }
  }, [me]);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </TouchableOpacity>
      ),
      headerTitle: `채팅 ${connected ? '🟢' : '⚪️'}`,
    });
  }, [navigation, connected]);

  // 대화방 목록 = rooms 에 있는 상대들 (마지막 메시지 순)
  const roomList = Object.keys(rooms)
    .map((k) => {
      const other = k.startsWith('dm:') ? k.slice(3) : k;
      const msgs = rooms[k] || [];
      const last = msgs[msgs.length - 1];
      return { other, last, key: k };
    })
    .filter((r) => r.last)
    .sort((a, b) => (b.last!.ts || 0) - (a.last!.ts || 0));

  // 아직 대화 없는 친구
  const roomOthers = new Set(roomList.map((r) => r.other));
  const freshFriends = friends.filter((f) => !roomOthers.has(f));

  return (
    <FlatList
      style={styles.root}
      data={roomList}
      keyExtractor={(r) => r.key}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadFriends} />}
      ListHeaderComponent={
        freshFriends.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>친구</Text>
            <View style={styles.friendRow}>
              {freshFriends.map((f) => (
                <TouchableOpacity key={f} style={styles.friendChip} onPress={() => navigation.navigate('ChatRoom', { other: f })}>
                  <Text style={styles.friendChipText}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        const u = unread[dmKey(item.other)] || 0;
        const preview = item.last?.file ? '📎 파일' : item.last?.body ?? '';
        return (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChatRoom', { other: item.other })}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.other[0]?.toUpperCase()}</Text></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>{item.other}</Text>
              <Text style={styles.rowPreview} numberOfLines={1}>{preview}</Text>
            </View>
            {u > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{u}</Text></View>}
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        !freshFriends.length ? <Text style={styles.empty}>아래로 당겨 친구 목록을 새로고침하세요</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  section: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sectionTitle: { fontSize: 12, color: '#999', marginBottom: 8, fontWeight: '600' },
  friendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  friendChip: { backgroundColor: '#f2f2f2', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  friendChipText: { fontSize: 14, color: '#333' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  avatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#FEE500', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#3c1e1e' },
  rowBody: { flex: 1, marginLeft: 12 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#191919' },
  rowPreview: { fontSize: 13, color: '#999', marginTop: 2 },
  badge: { backgroundColor: '#ff3b30', borderRadius: 11, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#bbb', marginTop: 60, fontSize: 14 },
});
