import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { loadThreadMessages, sendMessage } from '@/services/messageService';
import type { Message } from '@/types/orders';
import type { MessageThreadScreenProps } from '@/types/navigation';

function MessageBubble({ message }: { message: Message }) {
  const isFromBusiness = message.sender_role === 'business';
  const time = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <View style={[styles.bubbleRow, isFromBusiness && styles.bubbleRowRight]}>
      <View
        style={[
          styles.bubble,
          isFromBusiness ? styles.bubbleBusiness : styles.bubbleCustomer,
        ]}
      >
        {!isFromBusiness && (
          <Text style={styles.bubbleSender}>
            {message.sender_role === 'system' ? 'System' :
             message.sender_role === 'admin' ? 'Xperts Support' : 'Customer'}
          </Text>
        )}
        <Text
          style={[
            styles.bubbleContent,
            isFromBusiness ? styles.bubbleContentBusiness : styles.bubbleContentCustomer,
          ]}
        >
          {message.body}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            isFromBusiness ? styles.bubbleTimeBusiness : styles.bubbleTimeCustomer,
          ]}
        >
          {time}
        </Text>
      </View>
    </View>
  );
}

export default function MessageThreadScreen({ route, navigation }: MessageThreadScreenProps) {
  const { orderId, threadId, orderNumber } = route.params;
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<Message>>(null);

  const displayTitle = orderNumber ? `Order #${orderNumber}` : `Order ${orderId.slice(0, 8).toUpperCase()}`;

  const load = useCallback(async () => {
    const { messages: rows } = await loadThreadMessages(orderId);
    setMessages(rows);
    setLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // Live updates — new messages (from the customer or Xperts support) stream in.
  useEffect(() => {
    const channel = supabase
      .channel(`order-messages-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orderId, load]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError(null);
    setDraft('');

    const { error } = await sendMessage(orderId, text);
    if (error) {
      setSendError(error);
      setDraft(text); // restore draft on error
    } else {
      await load();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
    setSending(false);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Messages list ────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: 8 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={styles.emptyThreadText}>
                No messages yet. Send the first message below.
              </Text>
            </View>
          }
        />
      )}

      {/* ── Input bar ────────────────────────────────────────────── */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        {sendError && (
          <Text style={styles.sendError}>{sendError}</Text>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!draft.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },

  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },

  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  bubbleBusiness: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: 4,
  },
  bubbleCustomer: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },

  bubbleSender: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  bubbleContent: { fontSize: 15, lineHeight: 21 },
  bubbleContentBusiness: { color: '#ffffff' },
  bubbleContentCustomer: { color: colors.textPrimary },
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end' },
  bubbleTimeBusiness: { color: 'rgba(255,255,255,0.55)' },
  bubbleTimeCustomer: { color: colors.textMuted },

  emptyThread: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 60, paddingHorizontal: 32,
  },
  emptyThreadText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },

  inputBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
  },
  sendError: { fontSize: 12, color: colors.danger, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    backgroundColor: colors.brand,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 68,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
