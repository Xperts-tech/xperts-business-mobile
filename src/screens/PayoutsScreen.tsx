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
  loadPayoutSummary,
  formatMoney,
  type EarningOrder,
  type PayoutSummary,
} from '@/services/payoutService';
import type { PayoutsScreenProps } from '@/types/navigation';

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EarningRow({ order }: { order: EarningOrder }) {
  const label = order.order_number ? `#${order.order_number}` : `#${order.id.slice(0, 8).toUpperCase()}`;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowOrder}>{label}</Text>
        <Text style={styles.rowDate}>{formatDate(order.created_at)}</Text>
      </View>
      <Text style={styles.rowAmount}>{formatMoney(order.amount)}</Text>
    </View>
  );
}

export default function PayoutsScreen({ navigation }: PayoutsScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusinessId, selectedStoreId } = useBusiness();

  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedBusinessId && !selectedStoreId) return;
    setLoading(true);
    const result = await loadPayoutSummary({ businessId: selectedBusinessId, storeId: selectedStoreId });
    setSummary(result);
    setLoading(false);
  }, [selectedBusinessId, selectedStoreId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const orders = summary?.orders ?? [];
  const error = summary?.error ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings & Payouts</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load earnings</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <EarningRow order={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Sales summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryMonth}>{summary?.monthLabel ?? ''}</Text>
                <Text style={styles.summaryValue}>{formatMoney(summary?.monthSales ?? 0)}</Text>
                <Text style={styles.summaryLabel}>
                  Completed sales · {summary?.monthOrderCount ?? 0} order{(summary?.monthOrderCount ?? 0) === 1 ? '' : 's'}
                </Text>
              </View>

              {/* How payouts work — business-language explanation */}
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>How your payouts work</Text>
                <Text style={styles.infoText}>
                  Xperts collects what customers pay, then deducts platform and delivery fees.
                  Your net earnings are paid to your registered account on a rolling basis after
                  each order is delivered.
                </Text>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Completed sales (shown here)</Text>
                  <Text style={styles.infoRowValue}>Gross — before Xperts fees</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Your payout</Text>
                  <Text style={styles.infoRowValue}>Net — after fees</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>When</Text>
                  <Text style={styles.infoRowValue}>Rolling, after delivery</Text>
                </View>
              </View>

              {orders.length > 0 && (
                <Text style={styles.listHeading}>Recent completed orders</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyTitle}>No completed orders yet</Text>
              <Text style={styles.emptyText}>
                Your earnings appear here once orders are delivered. Payouts are issued by Xperts
                after fulfilment.
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.footerNote}>
          Read-only view. Manage your payout bank details in the web portal.
        </Text>
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
  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  headerBlock: { gap: 12, marginBottom: 4 },

  summaryCard: {
    backgroundColor: colors.brand, borderRadius: 16, padding: 20, alignItems: 'center', gap: 4,
  },
  summaryMonth: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  infoCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 8,
  },
  infoTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  infoDivider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  infoRowLabel: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  infoRowValue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },

  listHeading: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4,
  },

  row: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  rowLeft: { gap: 2 },
  rowOrder: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  rowDate: { fontSize: 12, color: colors.textMuted },
  rowAmount: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },

  empty: {
    alignItems: 'center', justifyContent: 'center',
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
