import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav/types';
import { useAuth, useChat, dmKey } from '../lib/store';
import type { ChatMessage } from '../lib/store';
import { sendMessage, sendFileMessage } from '../lib/ws';
import { pickDocument, pickImage, uploadFile } from '../lib/files';
import { translate } from '../lib/translate';
import { useSettings } from '../lib/settings';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoom'>;

export default function ChatRoomScreen({ route, navigation }: Props) {
  const { other } = route.params;
  const me = useAuth((s) => s.user)!;
  const msgs = useChat((s) => s.rooms[dmKey(other)]) || [];
  const openRoom = useChat((s) => s.openRoom);
  const closeRoom = useChat((s) => s.closeRoom);

  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [translateOn, setTranslateOn] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    openRoom(dmKey(other));
    return () => closeRoom();
  }, [other, openRoom, closeRoom]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: other,
      headerRight: () => (
        <TouchableOpacity onPress={() => setTranslateOn((v) => !v)}>
          <Text style={{ fontSize: 14, color: translateOn ? '#0a7' : '#999' }}>
            {translateOn ? '🌐 번역 ON' : '🌐 번역'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, other, translateOn]);

  function onSend() {
    const body = text.trim();
    if (!body) return;
    sendMessage(other, body); // 서버가 본인에게도 echo → store 에 반영(낙관적 추가 X)
    setText('');
  }

  async function onAttach(kind: 'doc' | 'img') {
    try {
      const pick = kind === 'img' ? await pickImage() : await pickDocument();
      if (!pick) return;
      setUploading(true);
      const meta = await uploadFile(pick);
      sendFileMessage(other, meta);
    } catch (e: any) {
      Alert.alert('첨부 실패', e.message ?? String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={(m) => m.id || m.cid || String(m.ts)}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <Bubble msg={item} mine={item.from === me} translateOn={translateOn} />
        )}
      />

      <View style={styles.inputBar}>
        <TouchableOpacity style={styles.attachBtn} onPress={() => onAttach('img')} disabled={uploading}>
          <Text style={styles.attachIcon}>🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachBtn} onPress={() => onAttach('doc')} disabled={uploading}>
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input} placeholder={uploading ? '업로드 중…' : '메시지'}
          value={text} onChangeText={setText} onSubmitEditing={onSend} editable={!uploading} multiline
        />
        {uploading
          ? <ActivityIndicator style={{ marginHorizontal: 12 }} />
          : <TouchableOpacity style={styles.sendBtn} onPress={onSend}><Text style={styles.sendText}>전송</Text></TouchableOpacity>}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, mine, translateOn }: { msg: ChatMessage; mine: boolean; translateOn: boolean }) {
  const lang = useSettings((s) => s.lang);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // 번역 토글 ON + 상대 메시지(텍스트) → 내 언어로 번역
  useEffect(() => {
    if (!translateOn || mine || msg.file || !msg.body) { setTranslated(null); return; }
    let alive = true;
    translate(msg.body, lang).then((t) => { if (alive) setTranslated(t); }).catch(() => {});
    return () => { alive = false; };
  }, [translateOn, mine, msg.body, msg.file, lang]);

  const hasTranslation = translated != null;

  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheir]}>
      <View style={mine ? styles.colMine : styles.colTheir}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheir]}>
          {hasTranslation ? (
            <>
              {/* 번역문만 표시 — 원본은 아래 토글로 */}
              <Text style={styles.bubbleText}>{translated}</Text>
              {showOriginal && (
                <Text style={styles.original}>{msg.body}</Text>
              )}
            </>
          ) : msg.file ? (
            <View>
              <Text style={[styles.fileLabel, mine && styles.textMine]}>
                {msg.file.mime.startsWith('image/') ? '🖼️ ' : '📎 '}{msg.file.name}
              </Text>
              {!!msg.body && <Text style={[styles.bubbleText, mine && styles.textMine]}>{msg.body}</Text>}
            </View>
          ) : (
            <Text style={[styles.bubbleText, mine && styles.textMine]}>{msg.body}</Text>
          )}
        </View>
        {hasTranslation && (
          <TouchableOpacity onPress={() => setShowOriginal((v) => !v)}>
            <Text style={styles.origToggle}>{showOriginal ? '원본 숨기기' : '원본 보기'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#b2c7d9' },
  listContent: { padding: 12 },
  bubbleRow: { marginVertical: 3, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheir: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#FEE500', borderTopRightRadius: 2 },
  bubbleTheir: { backgroundColor: '#fff', borderTopLeftRadius: 2 },
  bubbleText: { fontSize: 15, color: '#191919' },
  textMine: { color: '#3c1e1e' },
  fileLabel: { fontSize: 14, fontWeight: '600', color: '#191919' },
  colMine: { maxWidth: '78%', alignItems: 'flex-end' },
  colTheir: { maxWidth: '78%', alignItems: 'flex-start' },
  original: { fontSize: 13, color: '#888', marginTop: 4, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.12)' },
  origToggle: { fontSize: 11, color: '#555', marginTop: 2, textDecorationLine: 'underline' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  attachBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  attachIcon: { fontSize: 22 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#e3e3e3', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100, backgroundColor: '#fafafa',
  },
  sendBtn: { backgroundColor: '#FEE500', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, marginLeft: 6 },
  sendText: { fontWeight: '700', color: '#3c1e1e' },
});
