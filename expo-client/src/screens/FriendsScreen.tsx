import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { useAuth } from '../lib/store';
import { fetchUsers } from '../lib/api';
import { Avatar } from '../components/Avatar';

const KNOWN_USERS = ['admin', 'jihoon', 'emma', 'minho'];

export default function FriendsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      let list = await fetchUsers();
      if (!list.length) list = KNOWN_USERS;
      setUsers(list.filter((u) => u !== me));
    } finally { setRefreshing(false); }
  }, [me]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>친구</Text>
        <TouchableOpacity onPress={() => nav.navigate('Settings')}><Text style={styles.gear}>⚙️</Text></TouchableOpacity>
      </View>

      <View style={styles.meRow}>
        <Avatar name={me || '?'} size={48} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.meName}>{me}</Text>
          <Text style={styles.muted}>나</Text>
        </View>
      </View>

      <Text style={styles.countRow}>친구 {users.length}</Text>

      <FlatList
        data={users}
        keyExtractor={(u) => u}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => nav.navigate('ChatRoom', { other: item })}>
            <Avatar name={item} size={40} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.name}>{item}</Text>
              <Text style={styles.muted}>탭하면 채팅 시작</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  header: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  gear: { fontSize: 20 },
  meRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  meName: { fontSize: 15, fontWeight: '600', color: '#191919' },
  muted: { fontSize: 12, color: '#999', marginTop: 2 },
  countRow: { fontSize: 12, color: '#999', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E5E5' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  name: { fontSize: 14, fontWeight: '500', color: '#191919' },
});
