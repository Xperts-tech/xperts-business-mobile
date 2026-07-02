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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import {
  getServiceRequestDetail,
  listRequestMessages,
  sendRequestMessage,
  getCategoryMeta,
  getStatusColor,
  getStatusLabel,
  type ServiceRequest,
  type ServiceRequestMessage,
} from '@/services/businessServicesService';
import type { BusinessStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<BusinessStackParamList, 'ServiceRequestDetail'>;

const CLOSED_STATUSES = ['completed', 'cancelled', 'rejected'];

function StatusBadge({ status }: { status: string }) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: ServiceRequestMessage }) {
  const isBusiness = message.sender_role === 'business';
  const time = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <View style={[styles.bubbleRow, isBusiness && styles.bubbleRowRight]}>
      <View style={[styles.bubble, isBusiness ? styles.bubbleBusiness : styles.bubbleAdmin]}>
        {!isBusiness && (
          <Text style={styles.bubbleSender}>
            {message.sender_role === 'admin' ? 'Xperts Team' : 'System'}
          </Text>
        )}
        <Text style={[styles.bubbleBody, isBusiness ? styles.bubbleBodyBusiness : styles.bubbleBodyAdmin]}>
          {message.body}
        </Text>
        <Text style={[styles.bubbleTime, isBusiness ? styles.bubbleTimeBusiness : styles.bubbleTimeAdmin]}>
          {time}
        </Text>
      </View>
    </View>
  );
}

export default function ServiceRequestDetailScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [messages, setMessages] = useState<ServiceRequestMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<ServiceRequestMessage>>(null);

  const loadDetail = useCallback(async () => {
    const { request: req, error } = await getServiceRequestDetail(requestId);
    setRequest(req);
    setDetailError(error);
    setLoadingDetail(false);
  }, [requestId]);

  const loadMessages = useCallback(async () => {
    const { messages: msgs } = await listRequestMessages(requestId);
    setMessages(msgs);
    setLoadingMessages(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [requestId]);

  useEffect(() => {
    void loadDetail();
    void loadMessages();
  }, [loadDetail, loadMessages]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || !user) return;

    setSending(true);
    setSendError(null);
    setDraft('');

    const { error } = await sendRequestMessage(
      requestId,
      text,
      user.id,
      profile?.full_name ?? null,
    );

    if (error) {
      setSendError(error);
      setDraft(text);
    } else {
      await loadMessages();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
    setSending(false);
  }

  const isClosed = request ? CLOSED_STATUSES.includes(request.status) : false;
  const category = request ? getCategoryMeta(request.request_type) : null;

  const displayTitle = category
    ? `${category.icon} ${category.label}`
    : 'Service Request';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Detail card ────────────────────────────────────────── */}
      {loadingDetail ? (
        <View style={styles.detailLoading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : detailError || !request ? (
        <View style={styles.detailLoading}>
          <Text style={styles.errorText}>{detailError ?? 'Request not found.'}</Text>
        </View>
      ) : (
        <View style={styles.detailCard}>
          <View style={styles.detailTop}>
            <View style={styles.detailMeta}>
              <Text style={styles.detailDate}>
                {new Date(request.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <Text style={styles.detailPriority}>
                Priority: <Text style={{ fontWeight: '700' }}>{request.priority}</Text>
              </Text>
            </View>
            <StatusBadge status={request.status} />
          </View>

          {request.description ? (
            <Text style={styles.detailDesc} numberOfLines={3}>{request.description}</Text>
          ) : null}

          {request.business_notes ? (
            <View style={styles.notesRow}>
              <Text style={styles.notesLabel}>Your notes:</Text>
              <Text style={styles.notesText} numberOfLines={2}>{request.business_notes}</Text>
            </View>
          ) : null}

          {request.payment_status !== 'unpaid' && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment:</Text>
              <Text style={styles.paymentValue}>{request.payment_status}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Messages divider ───────────────────────────────────── */}
      <View style={styles.threadHeader}>
        <Text style={styles.threadHeaderText}>MESSAGES</Text>
      </View>

      {/* ── Messages list ──────────────────────────────────────── */}
      {loadingMessages ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} size="small" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={[styles.messageList, { paddingBottom: 8 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={styles.emptyThreadText}>
                {isClosed
                  ? 'This request is closed. No further messages can be sent.'
                  : 'No messages yet. Send a message to the Xperts team below.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Input bar ──────────────────────────────────────────── */}
      {!isClosed && (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          {sendError && <Text style={styles.sendError}>{sendError}</Text>}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the Xperts team…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
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
      )}

      {isClosed && request && (
        <View style={[styles.closedBar, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.closedBarText}>
            This request is {getStatusLabel(request.status).toLowerCase()}.
          </Text>
        </View>
      )}
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

  detailLoading: { paddingVertical: 20, alignItems: 'center' },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'center' },

  detailCard: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  detailTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailMeta: { gap: 2 },
  detailDate: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  detailPriority: { fontSize: 11, color: colors.textSecondary },
  detailDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  notesRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  notesLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, paddingTop: 1 },
  notesText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },

  paymentRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  paymentLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  paymentValue: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, textTransform: 'capitalize' },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  threadHeader: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  threadHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },

  centered: { paddingVertical: 24, alignItems: 'center' },

  messageList: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },

  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  bubbleBusiness: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleAdmin: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bubbleBody: { fontSize: 15, lineHeight: 21 },
  bubbleBodyBusiness: { color: '#fff' },
  bubbleBodyAdmin: { color: colors.textPrimary },
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end' },
  bubbleTimeBusiness: { color: 'rgba(255,255,255,0.55)' },
  bubbleTimeAdmin: { color: colors.textMuted },

  emptyThread: {
    paddingTop: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
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

  closedBar: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: 'center',
  },
  closedBarText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
});
