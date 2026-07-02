import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  SERVICE_CATEGORIES,
  listMyServiceRequests,
  getCategoryMeta,
  getStatusColor,
  getStatusLabel,
  type ServiceRequest,
} from '@/services/businessServicesService';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

function CategoryCard({
  category,
  onPress,
}: {
  category: (typeof SERVICE_CATEGORIES)[number];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.categoryCard} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <Text style={styles.categoryLabel} numberOfLines={2}>{category.label}</Text>
    </TouchableOpacity>
  );
}

function RequestCard({
  request,
  onPress,
}: {
  request: ServiceRequest;
  onPress: () => void;
}) {
  const meta = getCategoryMeta(request.request_type);
  const statusColor = getStatusColor(request.status);
  const statusLabel = getStatusLabel(request.status);
  const date = new Date(request.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.requestCardLeft}>
        <Text style={styles.requestIcon}>{meta.icon}</Text>
      </View>
      <View style={styles.requestCardMid}>
        <Text style={styles.requestType} numberOfLines={1}>{meta.label}</Text>
        {request.description ? (
          <Text style={styles.requestDesc} numberOfLines={1}>{request.description}</Text>
        ) : null}
        <Text style={styles.requestDate}>{date}</Text>
      </View>
      <View style={styles.requestCardRight}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '1A', borderColor: statusColor + '40' }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ServicesPortalScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { selectedBusinessId } = useBusiness();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedBusinessId) return;
    setLoading(true);
    const { requests: rows, error: err } = await listMyServiceRequests(selectedBusinessId);
    setRequests(rows);
    setError(err);
    setLoading(false);
  }, [selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Services</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        {/* ── Intro banner ──────────────────────────────────────── */}
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Request any Xperts service</Text>
          <Text style={styles.bannerSub}>
            Submit a request and our team will be in touch to help you grow.
          </Text>
        </View>

        {/* ── Category grid ─────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>AVAILABLE SERVICES</Text>
        <View style={styles.grid}>
          {SERVICE_CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.key}
              category={cat}
              onPress={() => navigation.navigate('ServiceRequestNew', { requestType: cat.key })}
            />
          ))}
        </View>

        {/* ── My requests ───────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>MY REQUESTS</Text>

        {!selectedBusinessId ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Select a business to view your requests.</Text>
          </View>
        ) : loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Could not load requests. Pull down to retry.</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyTitle}>No requests yet</Text>
            <Text style={styles.emptyText}>
              Tap a service above to submit your first request.
            </Text>
          </View>
        ) : (
          <View style={styles.requestList}>
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                onPress={() => navigation.navigate('ServiceRequestDetail', { requestId: req.id })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  banner: {
    backgroundColor: colors.brand,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 6 },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 19 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingLeft: 2,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryCard: {
    width: '47.5%',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  categoryIcon: { fontSize: 28 },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 17,
  },

  requestList: { gap: 8 },
  requestCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  requestCardLeft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestIcon: { fontSize: 20 },
  requestCardMid: { flex: 1, gap: 3 },
  requestType: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  requestDesc: { fontSize: 12, color: colors.textSecondary },
  requestDate: { fontSize: 11, color: colors.textMuted },
  requestCardRight: { alignItems: 'flex-end', gap: 6 },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },

  chevron: { fontSize: 18, color: colors.textMuted, fontWeight: '300' },

  centered: { paddingVertical: 32, alignItems: 'center' },

  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
});
