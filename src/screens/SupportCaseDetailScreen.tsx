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
  getStatusColor,
  getStatusLabel,
  type ServiceRequest,
  type ServiceRequestMessage,
} from '@/services/businessServicesService';
import type { BusinessStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<BusinessStackParamList, 'SupportCaseDetail'>;

const CLOSED_STATUSES = ['completed', 'cancelled', 'rejected'];

function StatusBadge({ status }: { status: string }) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: ServiceRequestMessage }) {
  const isBusiness = message.sender_role === 'business';
  const time = new Date(message.created_at).toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const date = new Date(message.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  });

  return (
    <View style={[styles.bubbleRow, isBusiness && styles.bubbleRowRight]}>
      <View style={[styles.bubble, isBusiness ? styles.bubbleBusiness : styles.bubbleSupport]}>
        {!isBusiness && (
          <Text style={styles.bubbleSender}>
            {message.sender_role === 'admin' ? '🤝 Xperts Support' : 'System'}
          </Text>
        )}
        <Text style={[styles.bubbleBody, isBusiness ? styles.bubbleBodyBusiness : styles.bubbleBodySupport]}>
          {message.body}
        </Text>
        <Text style={[styles.bubbleTime, isBusiness ? styles.bubbleTimeBusiness : styles.bubbleTimeSupport]}>
          {date} · {time}
        </Text>
      </View>
    </View>
  );
}

export default function SupportCaseDetailScreen({ route, navigation }: Props) {
  const { requestId } = route.params;
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [request,    setRequest]    = useState<ServiceRequest | null>(null);
  const [messages,   setMessages]   = useState<ServiceRequestMessage[]>([]);
  const [loadDetail, setLoadDetail] = useState(true);
  const [loadMsgs,   setLoadMsgs]   = useState(true);
  const [sending,    setSending]    = useState(false);
  const [draft,      setDraft]      = useState('');
  const [sendError,  setSendError]  = useState<string | null>(null);
  const [detailErr,  setDetailErr]  = useState<string | null>(null);

  const flatListRef = useRef<FlatList<ServiceRequestMessage>>(null);

  const fetchDetail = useCallback(async () => {
    const { request: req, error } = await getServiceRequestDetail(requestId);
    setRequest(req);
    setDetailErr(error);
    setLoadDetail(false);
  }, [requestId]);

  const fetchMessages = useCallback(async () => {
    const { messages: msgs } = await listRequestMessages(requestId);
    setMessages(msgs);
    setLoadMsgs(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [requestId]);

  useEffect(() => {
    void fetchDetail();
    void fetchMessages();
  }, [fetchDetail, fetchMessages]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || !user) return;
    setSending(true);
    setSendError(null);
    setDraft('');
    const { error } = await sendRequestMessage(requestId, text, user.id, profile?.full_name ?? null);
    if (error) {
      setSendError(error);
      setDraft(text);
    } else {
      await fetchMessages();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
    setSending(false);
  }

  const isClosed = request ? CLOSED_STATUSES.includes(request.status) : false;
  const ticketId = requestId.slice(0, 8).toUpperCase();
  const createdDate = request
    ? new Date(request.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Support Ticket</Text>
          <Text style={styles.headerSub}>#{ticketId}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {loadDetail ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : detailErr || !request ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{detailErr ?? 'Ticket not found.'}</Text>
        </View>
      ) : (
        <>
          {/* ── Ticket info card ────────────────────────────────── */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardTop}>
              <StatusBadge status={request.status} />
              <Text style={styles.infoDate}>Opened {createdDate}</Text>
            </View>
            {request.title && (
              <Text style={styles.infoTitle}>{request.title}</Text>
            )}
            {request.description && (
              <Text style={styles.infoDescription} numberOfLines={3}>
                {request.description}
              </Text>
            )}
            {request.business_notes && (
              <View style={styles.infoNote}>
                <Text style={styles.infoNoteLabel}>Update from Xperts</Text>
                <Text style={styles.infoNoteBody}>{request.business_notes}</Text>
              </View>
            )}
            {isClosed && (
              <View style={styles.closedBanner}>
                <Text style={styles.closedBannerText}>
                  This ticket is closed. Open a new ticket if you need further help.
                </Text>
              </View>
            )}
          </View>

          {/* ── Messages ────────────────────────────────────────── */}
          <View style={styles.messagesSection}>
            <Text style={styles.messagesSectionLabel}>Conversation</Text>
          </View>

          {loadMsgs ? (
            <View style={styles.msgLoading}>
              <ActivityIndicator color={colors.brand} size="small" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => <MessageBubble message={item} />}
              contentContainerStyle={styles.messagesList}
              ListEmptyComponent={
                <View style={styles.emptyMsgs}>
                  <Text style={styles.emptyMsgsText}>
                    No messages yet. Start the conversation below.
                  </Text>
                </View>
              }
            />
          )}

          {/* ── Reply bar ───────────────────────────────────────── */}
          {!isClosed && (
            <View style={[styles.replyBar, { paddingBottom: insets.bottom + 8 }]}>
              {sendError && (
                <Text style={styles.sendError}>{sendError}</Text>
              )}
              <View style={styles.replyRow}>
                <TextInput
                  style={styles.replyInput}
                  placeholder="Reply to support…"
                  placeholderTextColor={colors.textMuted}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!draft.trim() || sending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sendBtnText}>
                    {sending ? '…' : '↑'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 14, color: colors.danger, textAlign: 'center' },

  header: {
    backgroundColor:   colors.brand,
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  backBtn:     { width: 64 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },

  infoCard: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: 16,
    gap: 10,
  },
  infoCardTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  infoDate:     { fontSize: 11, color: colors.textMuted },
  infoTitle:    { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  infoDescription: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  infoNote: {
    backgroundColor: '#EFF6FF',
    borderRadius:    12,
    padding:         12,
    gap:             4,
    borderWidth:     1,
    borderColor:     '#BFDBFE',
  },
  infoNoteLabel: { fontSize: 10, fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoNoteBody:  { fontSize: 13, color: '#1E3A8A', lineHeight: 18 },

  closedBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius:    12,
    padding:         12,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  closedBannerText: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  messagesSection: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  messagesSectionLabel: {
    fontSize:    10,
    fontWeight:  '800',
    color:       colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  msgLoading: { paddingVertical: 24, alignItems: 'center' },

  messagesList: { padding: 16, gap: 12, flexGrow: 1 },

  emptyMsgs: { alignItems: 'center', paddingVertical: 32 },
  emptyMsgsText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  bubbleRow:      { flexDirection: 'row', marginBottom: 6 },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth:     '78%',
    borderRadius: 16,
    padding:      12,
    gap:          4,
  },
  bubbleBusiness: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleSupport:  { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },

  bubbleSender:         { fontSize: 10, fontWeight: '800', color: colors.textMuted, marginBottom: 2 },
  bubbleBody:           { fontSize: 14, lineHeight: 20 },
  bubbleBodyBusiness:   { color: '#fff' },
  bubbleBodySupport:    { color: colors.textPrimary },
  bubbleTime:           { fontSize: 10, marginTop: 2 },
  bubbleTimeBusiness:   { color: 'rgba(255,255,255,0.55)', textAlign: 'right' },
  bubbleTimeSupport:    { color: colors.textMuted },

  replyBar: {
    backgroundColor: colors.card,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 6,
  },
  sendError: { fontSize: 11, color: colors.danger, paddingHorizontal: 4 },
  replyRow:  { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  replyInput: {
    flex:             1,
    minHeight:        40,
    maxHeight:        100,
    backgroundColor:  colors.bg,
    borderRadius:     20,
    borderWidth:      1,
    borderColor:      colors.border,
    paddingHorizontal: 14,
    paddingVertical:  10,
    fontSize:         14,
    color:            colors.textPrimary,
    lineHeight:       20,
  },
  sendBtn: {
    width:            40,
    height:           40,
    borderRadius:     20,
    backgroundColor:  colors.brand,
    alignItems:       'center',
    justifyContent:   'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText:     { fontSize: 20, color: '#fff', fontWeight: '700', lineHeight: 24 },
});
