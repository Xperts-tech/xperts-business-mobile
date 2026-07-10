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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import type { AnalyticsScreenProps } from '@/types/navigation';

type Period = '7d' | '30d' | '90d';

type AnalyticsData = {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
};

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

function getPeriodStart(period: Period): string {
  const now = new Date();
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function formatJmd(amount: number): string {
  return `J$${amount.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <View style={[s.statCard, { borderLeftColor: accent ?? colors.brand, borderLeftWidth: 3 }]}>
      <View style={[s.statIconWrap, { backgroundColor: (accent ?? colors.brand) + '18' }]}>
        <Ionicons name={icon} size={20} color={accent ?? colors.brand} />
      </View>
      <View style={s.statBody}>
        <Text style={s.statLabel}>{label}</Text>
        <Text style={s.statValue}>{value}</Text>
        {sub ? <Text style={s.statSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function AnalyticsScreen({ navigation }: AnalyticsScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusiness } = useBusiness();
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedBusiness?.id) return;
    setLoading(true);

    const since = getPeriodStart(period);

    const { data: orders } = await supabase
      .from('orders')
      .select('id, status, final_price, price_estimate, created_at')
      .eq('business_id', selectedBusiness.id)
      .gte('created_at', since);

    const orderList = (orders ?? []) as Array<{
      id: string;
      status: string;
      final_price: number | null;
      price_estimate: number | null;
    }>;

    const completed = orderList.filter((o) =>
      ['delivered', 'completed'].includes(o.status),
    );
    const cancelled = orderList.filter((o) =>
      ['cancelled', 'rejected', 'failed'].includes(o.status),
    );
    const pending = orderList.filter((o) =>
      !['delivered', 'completed', 'cancelled', 'rejected', 'failed'].includes(o.status),
    );

    const totalRevenue = completed.reduce(
      (sum, o) => sum + Number(o.final_price ?? o.price_estimate ?? 0),
      0,
    );
    const avgOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;

    // Top products
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('item_name, quantity, line_total, order_id')
      .in('order_id', completed.map((o) => o.id).slice(0, 100));

    const productMap: Record<string, { quantity: number; revenue: number }> = {};
    for (const item of itemRows ?? []) {
      const r = item as { item_name: string; quantity: number; line_total: number };
      if (!productMap[r.item_name]) {
        productMap[r.item_name] = { quantity: 0, revenue: 0 };
      }
      productMap[r.item_name].quantity += Number(r.quantity);
      productMap[r.item_name].revenue += Number(r.line_total);
    }

    const topProducts = Object.entries(productMap)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    setData({
      totalRevenue,
      totalOrders: orderList.length,
      avgOrderValue,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      pendingOrders: pending.length,
      topProducts,
    });
    setLoading(false);
  }, [selectedBusiness?.id, period]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const completionRate = data && data.totalOrders > 0
    ? Math.round((data.completedOrders / data.totalOrders) * 100)
    : 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Analytics</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Period selector */}
      <View style={s.periodBar}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[s.periodChip, period === p.key && s.periodChipActive]}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.periodLabel, period === p.key && s.periodLabelActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        >
          {/* Revenue overview */}
          <Text style={s.sectionTitle}>Revenue</Text>
          <View style={s.statsGrid}>
            <StatCard
              icon="cash-outline"
              label="Total Revenue"
              value={formatJmd(data?.totalRevenue ?? 0)}
              accent={colors.brand}
            />
            <StatCard
              icon="trending-up-outline"
              label="Avg Order Value"
              value={formatJmd(data?.avgOrderValue ?? 0)}
              accent={colors.info}
            />
          </View>

          {/* Orders overview */}
          <Text style={s.sectionTitle}>Orders</Text>
          <View style={s.statsGrid}>
            <StatCard
              icon="receipt-outline"
              label="Total Orders"
              value={String(data?.totalOrders ?? 0)}
              accent={colors.navy}
            />
            <StatCard
              icon="checkmark-circle-outline"
              label="Completed"
              value={String(data?.completedOrders ?? 0)}
              sub={`${completionRate}% completion`}
              accent={colors.success}
            />
            <StatCard
              icon="time-outline"
              label="Pending"
              value={String(data?.pendingOrders ?? 0)}
              accent={colors.warning}
            />
            <StatCard
              icon="close-circle-outline"
              label="Cancelled"
              value={String(data?.cancelledOrders ?? 0)}
              accent={colors.danger}
            />
          </View>

          {/* Completion rate bar */}
          <View style={s.rateCard}>
            <View style={s.rateHeader}>
              <Text style={s.rateLabel}>Completion Rate</Text>
              <Text style={[s.ratePct, { color: completionRate >= 80 ? colors.success : completionRate >= 60 ? colors.warning : colors.danger }]}>
                {completionRate}%
              </Text>
            </View>
            <View style={s.rateTrack}>
              <View
                style={[
                  s.rateFill,
                  {
                    width: `${completionRate}%` as `${number}%`,
                    backgroundColor: completionRate >= 80 ? colors.success : completionRate >= 60 ? colors.warning : colors.danger,
                  },
                ]}
              />
            </View>
          </View>

          {/* Top products */}
          {(data?.topProducts?.length ?? 0) > 0 && (
            <>
              <Text style={s.sectionTitle}>Top Products</Text>
              <View style={s.productsCard}>
                {data?.topProducts.map((product, i) => (
                  <View key={product.name} style={[s.productRow, i < (data.topProducts.length - 1) && s.productRowBorder]}>
                    <View style={s.productRank}>
                      <Text style={s.productRankTxt}>{i + 1}</Text>
                    </View>
                    <View style={s.productInfo}>
                      <Text style={s.productName} numberOfLines={1}>{product.name}</Text>
                      <Text style={s.productQty}>{product.quantity} sold</Text>
                    </View>
                    <Text style={s.productRevenue}>{formatJmd(product.revenue)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {(data?.totalOrders === 0) && (
            <View style={s.emptyWrap}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.tabInactive} />
              <Text style={s.emptyTitle}>No data yet</Text>
              <Text style={s.emptySub}>Orders will appear here once your store is active.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  periodBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  periodLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  periodLabelActive: { color: colors.white },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBody: { flex: 1 },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  rateCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rateLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  ratePct: { fontSize: 16, fontWeight: '800' },
  rateTrack: { height: 8, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 4 },

  productsCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  productRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productRankTxt: { fontSize: 12, fontWeight: '800', color: colors.brand },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  productQty: { fontSize: 12, color: colors.textMuted },
  productRevenue: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },

  emptyWrap: { alignItems: 'center', marginTop: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

});
