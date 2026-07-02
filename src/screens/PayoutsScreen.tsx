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
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  loadPayouts,
  getPayoutStatusColor,
  getPayoutStatusLabel,
  type Payout,
} from '@/services/payoutService';
import type { PayoutsScreenProps } from '@/types/navigation';

function formatAmount(amount: number): string {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateRange(from: string | null | undefined, to: string | null | undefined): string {
  if (!from && !to) return '—';
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  return `To ${fmt(to!)}`;
}

function PayoutCard({ payout }: { payout: Payout }) {
  const statusColor = getPayoutStatusColor(payout.status);
  const statusLabel = getPayoutStatusLabel(payout.status);
  const paidDate = payout.paid_at
    ? new Date(payout.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.payoutAmount}>{formatAmount(payout.amount)}</Text>
          <Text style={styles.payoutPeriod}>{formatDateRange(payout.period_start, payout.period_end)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '45' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      {paidDate && (
        <Text style={styles.paidDate}>Paid on {paidDate}</Text>
      )}
    </View>
  );
}

export default function PayoutsScreen({ navigation }: PayoutsScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedStoreId } = useBusiness();

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    const result = await loadPayouts(selectedStoreId);
    setPayouts(result.payouts);
    setTotalPaid(result.totalPaid);
    setTotalPending(result.totalPending);
    setError(result.error);
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load payouts</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={payouts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PayoutCard payout={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          }
          ListHeaderComponent={
            payouts.length > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{formatAmount(totalPaid)}</Text>
                  <Text style={styles.summaryLabel}>Total paid out</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, totalPending > 0 && { color: colors.warning }]}>
                    {formatAmount(totalPending)}
                  </Text>
                  <Text style={styles.summaryLabel}>Pending</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyTitle}>No payouts yet</Text>
              <Text style={styles.emptyText}>
                Payouts are processed by Xperts after your store goes live and orders are fulfilled.
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.footerNote}>Read-only view. Manage bank details in the web portal.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  summaryCard: {
    backgroundColor: colors.brand, borderRadius: 14, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 6,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '900', color: '#FFFFFF' },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.25)' },

  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardLeft: { gap: 3 },
  payoutAmount: { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  payoutPeriod: { fontSize: 12, color: colors.textMuted },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  paidDate: { fontSize: 12, color: colors.success, fontWeight: '600' },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 60, gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    marginTop: 8, backgroundColor: colors.brand, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  footer: {
    backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  footerNote: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
