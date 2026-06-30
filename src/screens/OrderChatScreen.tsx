import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMessages,
  markMessagesRead,
  sendMessage,
  subscribeToMessages,
} from '@/services/messageService';
import type { ChatMessage } from '@/types/messaging';
import type { OrderChatScreenProps } from '@/types/navigation';

const QUICK_TEMPLATES = [
  "I'm on the way.",
  "I'm here now.",
  "I can't reach you.",
  "Please confirm replacement option.",
  "Please confirm purchase total.",
];

export default function OrderChatScreen({ route, navigation }: OrderChatScreenProps) {
  const { orderId, conversationId, customerName, orderRef, customerId } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const myId = user?.id ?? '';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: customerName ? `Chat — ${customerName}` : 'Customer Chat',
      headerBackTitle: 'Order',
    });
  }, [navigation, customerName]);

  // ── Load history ──────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { messages: msgs, error: err } = await getMessages(conversationId);
    setLoading(false);
    if (err) { setError(err); return; }
    setMessages(msgs);
    void markMessagesRead(conversationId);
  }, [conversationId]);

  useEffect(() => { void loadMessages(); }, [loadMessages]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const sub = subscribeToMessages(conversationId, (msg) => {
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      void markMessagesRead(conversationId);
    });
    return () => { void sub.unsubscribe(); };
  }, [conversationId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (body: string) => {
    const text = body.trim();
    if (!text || !myId || sending) return;
    setSending(true);
    setSendError(null);
    const { error: sendErr } = await sendMessage({
      conversationId,
      body: text,
      senderId: myId,
      orderId,
      customerId,
    });
    setSending(false);
    if (sendErr) { setSendError(sendErr); return; }
    setInput('');
  }, [conversationId, orderId, customerId, myId, sending]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={st.loadingText}>Loading conversation…</Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={st.center}>
        <Text style={st.errorIcon}>⚠️</Text>
        <Text style={st.errorText}>{error}</Text>
        <TouchableOpacity style={st.retryBtn} onPress={() => void loadMessages()} activeOpacity={0.8}>
          <Text style={st.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Chat UI ───────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={st.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 56}
    >
      {/* Order reference strip */}
      {orderRef ? (
        <View style={st.refBar}>
          <Text style={st.refBarText}>Order {orderRef}</Text>
        </View>
      ) : null}

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[st.listContent, messages.length === 0 && st.listContentEmpty]}
        renderItem={({ item }) => {
          const isMe = item.sender_id === myId;
          const text = item.body ?? item.message ?? '';
          const time = item.created_at
            ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';
          return (
            <View style={[st.bubbleWrap, isMe ? st.bubbleWrapMe : st.bubbleWrapThem]}>
              <View style={[st.bubble, isMe ? st.bubbleMe : st.bubbleThem]}>
                <Text style={[st.bubbleText, isMe ? st.bubbleTextMe : st.bubbleTextThem]}>
                  {text}
                </Text>
                <Text style={[st.bubbleTime, isMe ? st.bubbleTimeMe : st.bubbleTimeThem]}>
                  {time}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={st.emptyWrap}>
            <Text style={st.emptyIcon}>💬</Text>
            <Text style={st.emptyTitle}>No messages yet</Text>
            <Text style={st.emptySub}>
              Send a message to start the conversation with your customer.
            </Text>
          </View>
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      />

      {/* Quick template chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={st.templatesScroll}
        contentContainerStyle={st.templatesContent}
        keyboardShouldPersistTaps="always"
      >
        {QUICK_TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[st.templateChip, sending && { opacity: 0.5 }]}
            onPress={() => void handleSend(t)}
            disabled={sending}
            activeOpacity={0.7}
          >
            <Text style={st.templateChipText}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Send error */}
      {sendError ? (
        <View style={st.sendErrorBar}>
          <Text style={st.sendErrorText}>{sendError}</Text>
        </View>
      ) : null}

      {/* Input bar */}
      <View style={[st.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={st.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={() => void handleSend(input)}
          editable={!sending}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[st.sendBtn, (!input.trim() || sending) && st.sendBtnDisabled]}
          onPress={() => void handleSend(input)}
          disabled={!input.trim() || sending}
          activeOpacity={0.85}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={st.sendBtnText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.bg },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 14, fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  errorIcon:   { fontSize: 38, marginBottom: 12 },
  errorText:   { fontSize: 14, color: colors.danger, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  retryBtn:    { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  retryBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },

  refBar:     { backgroundColor: colors.brandSurface, borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingHorizontal: 16, paddingVertical: 8 },
  refBarText: { fontSize: 12, fontWeight: '700', color: colors.brand, textAlign: 'center' },

  listContent:      { padding: 16, paddingBottom: 8 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },

  bubbleWrap:   { marginBottom: 10 },
  bubbleWrapMe: { alignItems: 'flex-end' },
  bubbleWrapThem: { alignItems: 'flex-start' },

  bubble:      { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe:    { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleThem:  { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },

  bubbleText:     { fontSize: 15, lineHeight: 21 },
  bubbleTextMe:   { color: '#fff', fontWeight: '500' },
  bubbleTextThem: { color: colors.textPrimary, fontWeight: '500' },

  bubbleTime:     { fontSize: 10, marginTop: 4 },
  bubbleTimeMe:   { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  bubbleTimeThem: { color: colors.textMuted },

  emptyWrap:  { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon:  { fontSize: 42, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  templatesScroll:  { flexShrink: 0, borderTopWidth: 1, borderTopColor: colors.borderLight, backgroundColor: '#fff' },
  templatesContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 6, flexDirection: 'row' },
  templateChip:     { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.brandSurface, borderWidth: 1, borderColor: colors.brand },
  templateChipText: { fontSize: 12, fontWeight: '700', color: colors.brand },

  sendErrorBar:  { backgroundColor: colors.dangerSurface, borderTopWidth: 1, borderTopColor: colors.dangerBorder, paddingHorizontal: 16, paddingVertical: 8 },
  sendErrorText: { fontSize: 12, fontWeight: '600', color: colors.danger },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 4,
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    textAlignVertical: 'top',
  },
  sendBtn:         { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, justifyContent: 'center', alignItems: 'center', minWidth: 64 },
  sendBtnDisabled: { backgroundColor: '#94A3B8' },
  sendBtnText:     { color: '#fff', fontWeight: '800', fontSize: 14 },
});
