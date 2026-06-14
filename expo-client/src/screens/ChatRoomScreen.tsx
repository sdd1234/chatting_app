import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated, Image, Linking, Modal,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../nav/types';
import { useAuth, useChat, dmKey, unreadIndicatorFor } from '../lib/store';
import type { ChatMessage } from '../lib/store';
import { sendMessage, sendFileMessage, sendReadDM, sendTypingDM } from '../lib/ws';
import { pickDocument, pickImage, uploadFile, fileSrcUrl, fileDownloadUrl } from '../lib/files';
import { translate, LANGS } from '../lib/translate';
import { useSettings } from '../lib/settings';
import { Avatar } from '../components/Avatar';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoom'>;

const TYPING_THROTTLE_MS = 2500;

function fmtTime(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
}

export default function ChatRoomScreen({ route, navigation }: Props) {
  const { other } = route.params;
  const me = useAuth((s) => s.user)!;
  const msgs = useChat((s) => s.rooms[dmKey(other)]) || [];
  const readReceipts = useChat((s) => s.readReceipts);
  const typing = useChat((s) => s.typing);
  const openRoom = useChat((s) => s.openRoom);
  const closeRoom = useChat((s) => s.closeRoom);
  const markLocalRead = useChat((s) => s.markLocalRead);
  const lang = useSettings((s) => s.lang);
  const setLang = useSettings((s) => s.setLang);

  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [translateOn, setTranslateOn] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const insets = useSafeAreaInsets();
  const lastTypingRef = useRef(0);
  const readSentRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    openRoom(dmKey(other));
    return () => closeRoom();
  }, [other, openRoom, closeRoom]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: other,
      headerStyle: { backgroundColor: '#B2C7D9' },
      headerRight: () => (
        <TouchableOpacity onPress={() => setTranslateOn((v) => !v)}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: translateOn ? '#0a7' : '#888' }}>
            {translateOn ? '🌐 ON' : '🌐 번역'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, other, translateOn]);

  // 안 읽은 상대 메시지 → 읽음 처리(낙관적 + 상대에게 read 신호)
  useEffect(() => {
    const fresh: string[] = [];
    for (const m of msgs) {
      if (m.from === me || readSentRef.current.has(m.id)) continue;
      readSentRef.current.add(m.id);
      fresh.push(m.id);
    }
    if (!fresh.length) return;
    markLocalRead(fresh, me);
    sendReadDM(other, fresh);
  }, [msgs.length, me, other, markLocalRead]);

  function onSend() {
    const body = text.trim();
    if (!body) return;
    sendMessage(other, body);
    setText('');
    lastTypingRef.current = 0;
  }

  function onInput(v: string) {
    setText(v);
    if (!v.trim()) return;
    const now = Date.now();
    if (now - lastTypingRef.current < TYPING_THROTTLE_MS) return;
    lastTypingRef.current = now;
    sendTypingDM(other);
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

  const typingUsers = (typing[dmKey(other)] || []).filter((u) => u !== me);

  // 각 사용자가 이 방에서 마지막으로 발화한 시각 — "1" 휴리스틱(나중에 말한 사람=읽음)용.
  const lastTsByUser: Record<string, number> = {};
  for (const m of msgs) if (m.ts > (lastTsByUser[m.from] || 0)) lastTsByUser[m.from] = m.ts;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {translateOn && (
        <View style={styles.langBar}>
          <Text style={styles.langBarLabel}>번역 →</Text>
          {LANGS.map((l) => (
            <TouchableOpacity
              key={l.code}
              style={[styles.langChip, lang === l.code && styles.langChipOn]}
              onPress={() => setLang(l.code)}
            >
              <Text style={[styles.langChipText, lang === l.code && styles.langChipTextOn]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <FlatList
        ref={listRef}
        data={msgs}
        keyExtractor={(m) => m.id || m.cid || String(m.ts)}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={styles.startHint}>대화의 시작 — 메시지를 입력하세요</Text>}
        ListFooterComponent={typingUsers.length ? <TypingBubble name={typingUsers[0]} /> : null}
        renderItem={({ item }) => (
          <Bubble
            msg={item}
            mine={item.from === me}
            unread={unreadIndicatorFor(item, me, readReceipts, lastTsByUser)}
            translateOn={translateOn}
          />
        )}
      />

      <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
        <TouchableOpacity style={styles.attachBtn} onPress={() => onAttach('img')} disabled={uploading}>
          <Text style={styles.attachIcon}>🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachBtn} onPress={() => onAttach('doc')} disabled={uploading}>
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input} placeholder={uploading ? '업로드 중…' : '메시지 입력'} placeholderTextColor="#aaa"
          value={text} onChangeText={onInput} editable={!uploading}
          onSubmitEditing={onSend} returnKeyType="send" blurOnSubmit={false}
        />
        {uploading
          ? <ActivityIndicator style={{ marginHorizontal: 12 }} />
          : <TouchableOpacity style={styles.sendBtn} onPress={onSend}><Text style={styles.sendText}>전송</Text></TouchableOpacity>}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, mine, unread, translateOn }: { msg: ChatMessage; mine: boolean; unread: number; translateOn: boolean }) {
  const lang = useSettings((s) => s.lang);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const time = fmtTime(msg.ts);

  useEffect(() => {
    if (!translateOn || mine || msg.file || !msg.body) { setTranslated(null); return; }
    let alive = true;
    translate(msg.body, lang).then((t) => { if (alive) setTranslated(t); }).catch(() => {});
    return () => { alive = false; };
  }, [translateOn, mine, msg.body, msg.file, lang]);

  const hasT = translated != null;

  if (mine) {
    return (
      <View style={styles.rowMine}>
        <View style={styles.metaMine}>
          {unread > 0 && <Text style={styles.unread}>{unread}</Text>}
          <Text style={styles.time}>{time}</Text>
        </View>
        <View style={[styles.bubble, styles.bubbleMine]}>
          <BubbleBody msg={msg} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowTheir}>
      <Avatar name={msg.from} size={36} />
      <View style={styles.theirCol}>
        <View style={styles.theirLine}>
          <View style={[styles.bubble, styles.bubbleTheir]}>
            {hasT ? (
              <>
                <Text style={styles.bubbleText}>{translated}</Text>
                {showOriginal && <Text style={styles.original}>{msg.body}</Text>}
              </>
            ) : <BubbleBody msg={msg} />}
          </View>
          <Text style={styles.time}>{time}</Text>
        </View>
        {hasT && (
          <TouchableOpacity onPress={() => setShowOriginal((v) => !v)}>
            <Text style={styles.origToggle}>{showOriginal ? '원본 숨기기' : '원본 보기'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function BubbleBody({ msg }: { msg: ChatMessage }) {
  const [zoom, setZoom] = useState(false);
  if (msg.file) {
    // 수신자 기준 절대 URL 로 재구성(발신자 url 이 웹 상대경로일 수 있음) + 내 토큰 부착(다운로드 인증)
    const url = fileSrcUrl(msg.file.id);
    const fid = msg.file.id;
    const isImg = msg.file.mime.startsWith('image/');
    const onSave = () => Linking.openURL(fileDownloadUrl(fid)).catch(() => {});
    return (
      <View>
        {isImg ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setZoom(true)}>
            <Image source={{ uri: url }} style={styles.imgAttach} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onSave}>
            <Text style={styles.bubbleText}>📎 {msg.file.name}  ⬇</Text>
          </TouchableOpacity>
        )}
        {!!msg.body && <Text style={[styles.bubbleText, { marginTop: 4 }]}>{msg.body}</Text>}

        {/* 탭하면 확대 → 확대창에서 저장 */}
        {isImg && (
          <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
            <View style={styles.viewerBg}>
              <TouchableOpacity style={styles.viewerClose} onPress={() => setZoom(false)}>
                <Text style={styles.viewerCloseText}>✕</Text>
              </TouchableOpacity>
              <Image source={{ uri: url }} style={styles.viewerImg} resizeMode="contain" />
              <TouchableOpacity style={styles.viewerSave} onPress={onSave}>
                <Text style={styles.viewerSaveText}>⬇ 저장</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        )}
      </View>
    );
  }
  return <Text style={styles.bubbleText}>{msg.body}</Text>;
}

function TypingBubble({ name }: { name: string }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={styles.rowTheir}>
      <Avatar name={name} size={36} />
      <View style={styles.theirCol}>
        <View style={[styles.bubble, styles.bubbleTheir, { flexDirection: 'row', gap: 4 }]}>
          {[0, 1, 2].map((i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: a }]} />
          ))}
        </View>
        <Text style={styles.typingLabel}>입력 중…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#B2C7D9' },
  listContent: { padding: 12 },
  startHint: { textAlign: 'center', color: '#5a6b7a', fontSize: 12, paddingVertical: 30 },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', marginVertical: 3 },
  rowTheir: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 3 },
  theirCol: { marginLeft: 8, maxWidth: '80%' },
  theirLine: { flexDirection: 'row', alignItems: 'flex-end' },
  metaMine: { alignItems: 'flex-end', marginRight: 4, marginBottom: 1 },
  bubble: { maxWidth: 250, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#FEE500', borderTopRightRadius: 4 },
  bubbleTheir: { backgroundColor: '#fff', borderTopLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: '#191919' },
  imgAttach: { width: 180, height: 180, borderRadius: 10, backgroundColor: '#eee' },
  viewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '92%', height: '70%' },
  viewerClose: { position: 'absolute', top: 44, right: 22, zIndex: 2, padding: 8 },
  viewerCloseText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  viewerSave: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 24, paddingHorizontal: 26, paddingVertical: 11 },
  viewerSaveText: { color: '#191919', fontSize: 15, fontWeight: '700' },
  langBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#dCE6F0', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#b0c4de' },
  langBarLabel: { fontSize: 11, color: '#5a6b7a', fontWeight: '700' },
  langChip: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#cdd9e5' },
  langChipOn: { backgroundColor: '#0a7', borderColor: '#0a7' },
  langChipText: { fontSize: 12, color: '#33475b' },
  langChipTextOn: { color: '#fff', fontWeight: '700' },
  original: { fontSize: 13, color: '#888', marginTop: 4, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.12)' },
  origToggle: { fontSize: 11, color: '#555', marginTop: 2, textDecorationLine: 'underline' },
  time: { fontSize: 10, color: '#5a6b7a', marginHorizontal: 4, marginBottom: 1 },
  unread: { fontSize: 11, color: '#caa400', fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#888' },
  typingLabel: { fontSize: 10, color: '#5a6b7a', marginTop: 2 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  attachBtn: { paddingHorizontal: 5, paddingVertical: 6 },
  attachIcon: { fontSize: 22 },
  input: {
    flex: 1, backgroundColor: '#f1f1f1', borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, maxHeight: 100, marginHorizontal: 4,
  },
  sendBtn: { backgroundColor: '#FEE500', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9, marginLeft: 2 },
  sendText: { fontWeight: '700', color: '#191919' },
});
