import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  listMySupportRequests,
  getStatusColor,
  getStatusLabel,
  type ServiceRequest,
} from '@/services/businessServicesService';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

const STATUS_ORDER = ['new', 'reviewing', 'in_progress', 'quoted', 'approved'];
const OPEN_STATUSES = new Set(STATUS_ORDER);

function TicketCard({
  request,
  onPress,
}: {
  request: ServiceRequest;
  onPress: () => void;
}) {
  const color   = getStatusColor(request.status);
  const label   = getStatusLabel(request.status);
  const isOpen  = OPEN_STATUSES.has(request.status);
  const date    = new Date(request.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  });
  const preview = request.description?.slice(0, 90) ?? '';

  return (
    <TouchableOpacity style={styles.ticketCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.ticketTop}>
        <Text style={styles.ticketTitle} numberOfLines={1}>
          {request.title ?? 'Support Ticket'}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: color + '18', borderColor: color + '40' }]}>
          <Text style={[styles.statusPillText, { color }]}>{label}</Text>
        </View>
      </View>
      {preview ? (
        <Text style={styles.ticketPreview} numberOfLines={2}>{preview}</Text>
      ) : null}
      <View style={styles.ticketMeta}>
        <View style={[styles.openDot, { backgroundColor: isOpen ? colors.success : '#94A3B8' }]} />
        <Text style={styles.ticketMetaText}>
          {isOpen ? 'Open' : 'Closed'} · Updated {date}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function SupportScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { selectedBusinessId } = useBusiness();

  const [requests,   setRequests]   = useState<ServiceRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedBusinessId) { setLoading(false); return; }
    const { requests: rows } = await listMySupportRequests(selectedBusinessId);
    setRequests(rows);
    setLoading(false);
  }, [selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const openCases   = requests.filter((r) => OPEN_STATUSES.has(r.status));
  const closedCases = requests.filter((r) => !OPEN_STATUSES.has(r.status));

  type Section =
    | { type: 'header' }
    | { type: 'cta' }
    | { type: 'sectionLabel'; label: string; count: number }
    | { type: 'ticket'; item: ServiceRequest }
    | { type: 'empty' };

  const listData: Section[] = [
    { type: 'header' },
    { type: 'cta' },
  ];

  if (!loading) {
    if (openCases.length === 0 && closedCases.length === 0) {
      listData.push({ type: 'empty' });
    } else {
      if (openCases.length > 0) {
        listData.push({ type: 'sectionLabel', label: 'Open Tickets', count: openCases.length });
        openCases.forEach((r) => listData.push({ type: 'ticket', item: r }));
      }
      if (closedCases.length > 0) {
        listData.push({ type: 'sectionLabel', label: 'Closed', count: closedCases.length });
        closedCases.forEach((r) => listData.push({ type: 'ticket', item: r }));
      }
    }
  }

  function renderItem({ item }: { item: Section }) {
    if (item.type === 'header') {
      return (
        <View style={styles.heroCard}>
          <Text style={styles.heroIcon}>🤝</Text>
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroBody}>
            Our support team is here to help you with any questions or issues with your Xperts account.
          </Text>
        </View>
      );
    }

    if (item.type === 'cta') {
      return (
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('ServiceRequestNew', { requestType: 'business_support' })}
        >
          <Text style={styles.ctaBtnText}>+ Open a support ticket</Text>
        </TouchableOpacity>
      );
    }

    if (item.type === 'sectionLabel') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{item.count}</Text>
          </View>
        </View>
      );
    }

    if (item.type === 'ticket') {
      return (
        <TicketCard
          request={item.item}
          onPress={() => navigation.navigate('SupportCaseDetail', { requestId: item.item.id })}
        />
      );
    }

    if (item.type === 'empty') {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>No open tickets</Text>
          <Text style={styles.emptyBody}>
            If you need help, tap the button above to open a support ticket.
          </Text>
        </View>
      );
    }

    return null;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Nav header ─────────────────────────────────────────── */}
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Support</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) => {
            if (item.type === 'ticket') return item.item.id;
            return `${item.type}-${i}`;
          }}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  navHeader: {
    backgroundColor:   colors.brand,
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  backBtn:     { width: 64 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  navTitle:    { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#fff' },

  listContent: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },

  heroCard: {
    backgroundColor: colors.card,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 10,
  },
  heroIcon:  { fontSize: 44 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  heroBody:  { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  ctaBtn: {
    backgroundColor: colors.brand,
    borderRadius:    16,
    paddingVertical: 16,
    alignItems:      'center',
  },
  ctaBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionHeaderText: {
    fontSize:    11,
    fontWeight:  '700',
    color:       colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionCount: {
    backgroundColor: colors.bg,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingHorizontal: 7,
    paddingVertical:   3,
  },
  sectionCountText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },

  ticketCard: {
    backgroundColor: colors.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
    gap:             8,
  },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ticketTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statusPill: {
    borderRadius:  20,
    borderWidth:   1,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  ticketPreview:  { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  ticketMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  openDot:        { width: 7, height: 7, borderRadius: 4 },
  ticketMetaText: { fontSize: 11, color: colors.textMuted },

  emptyWrap: {
    alignItems:      'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  emptyBody:  { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
});
