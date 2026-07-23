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
import {
  getAnalyticsSummary,
  getTopProducts,
  getTopLocations,
  getGrowthScore,
  type AnalyticsSummary,
  type TopProduct,
  type TopLocation,
  type GrowthScore,
} from '@/services/analyticsService';
import type { AnalyticsScreenProps } from '@/types/navigation';

type Period = '7d' | '30d' | '90d';

type Data = {
  summary: AnalyticsSummary;
  topProducts: TopProduct[];
  topLocations: TopLocation[];
  growth: GrowthScore | null;
};

const PERIODS: { key: Period; days: number; label: string }[] = [
  { key: '7d', days: 7, label: '7 days' },
  { key: '30d', days: 30, label: '30 days' },
  { key: '90d', days: 90, label: '90 days' },
];

function formatJmd(amount: number): string {
  return `J$${amount.toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function scoreColor(score: number): string {
  if (score >= 70) return colors.success;
  if (score >= 40) return colors.warning;
  return colors.danger;
}

function StatCard({ icon, label, value, sub, accent }: {
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
  const businessId = selectedBusiness?.id ?? '';
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    const days = PERIODS.find((p) => p.key === period)?.days ?? 30;
    const [summary, topProducts, topLocations, growth] = await Promise.all([
      getAnalyticsSummary(businessId, days),
      getTopProducts(businessId, days),
      getTopLocations(businessId, days),
      getGrowthScore(businessId),
    ]);
    setData(summary ? { summary, topProducts, topLocations, growth } : null);
    setLoading(false);
  }, [businessId, period]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sum = data?.summary;
  const avgOrderValue = sum && sum.paid_orders > 0 ? sum.revenue / sum.paid_orders : 0;
  const newCustomers = sum ? Math.max(0, sum.unique_customers - sum.repeat_customers) : 0;
  const repeatRate = sum?.repeat_rate ?? 0;
  const isEmpty = !sum || (sum.total_orders === 0 && sum.total_views === 0);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Analytics</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={s.periodBar}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[s.periodChip, period === p.key && s.periodChipActive]}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.periodLabel, period === p.key && s.periodLabelActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        >
          {isEmpty ? (
            <View style={s.emptyWrap}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.tabInactive} />
              <Text style={s.emptyTitle}>No data yet</Text>
              <Text style={s.emptySub}>Orders and store visits will appear here once your store is active.</Text>
            </View>
          ) : (
            <>
              {/* Growth score */}
              {data?.growth ? (
                <View style={s.scoreCard}>
                  <View style={s.scoreRing}>
                    <Text style={[s.scoreValue, { color: scoreColor(data.growth.score) }]}>{Math.round(data.growth.score)}</Text>
                    <Text style={s.scoreOutOf}>/100</Text>
                  </View>
                  <View style={s.scoreBody}>
                    <Text style={s.scoreTitle}>Growth Score</Text>
                    <Text style={s.scoreSub}>Revenue trend, conversion, repeat customers, content and plan — combined.</Text>
                  </View>
                </View>
              ) : null}

              {/* Revenue */}
              <Text style={s.sectionTitle}>Revenue</Text>
              <View style={s.statsGrid}>
                <StatCard icon="cash-outline" label="Total Revenue" value={formatJmd(sum?.revenue ?? 0)} accent={colors.brand} />
                <StatCard icon="trending-up-outline" label="Avg Order Value" value={formatJmd(avgOrderValue)} accent={colors.info} />
              </View>

              {/* Orders */}
              <Text style={s.sectionTitle}>Orders</Text>
              <View style={s.statsGrid}>
                <StatCard icon="receipt-outline" label="Total Orders" value={String(sum?.total_orders ?? 0)} accent={colors.navy} />
                <StatCard icon="checkmark-circle-outline" label="Paid Orders" value={String(sum?.paid_orders ?? 0)} sub={`${sum?.conversion_rate ?? 0}% conversion`} accent={colors.success} />
              </View>

              {/* Reach / views */}
              {(sum?.total_views ?? 0) > 0 && (
                <>
                  <Text style={s.sectionTitle}>Reach</Text>
                  <View style={s.statsGrid}>
                    <StatCard icon="eye-outline" label="Store Views" value={String(sum?.total_views ?? 0)} accent={colors.info} />
                    <StatCard icon="people-outline" label="Unique Visitors" value={String(sum?.unique_visitors ?? 0)} accent={colors.brand} />
                    {sum?.view_to_order_rate != null && (
                      <StatCard icon="funnel-outline" label="View → Order" value={`${sum.view_to_order_rate}%`} accent={colors.warning} />
                    )}
                  </View>
                </>
              )}

              {/* Customers */}
              {(sum?.unique_customers ?? 0) > 0 && (
                <>
                  <Text style={s.sectionTitle}>Customers</Text>
                  <View style={s.statsGrid}>
                    <StatCard icon="people-circle-outline" label="Unique Customers" value={String(sum?.unique_customers ?? 0)} accent={colors.brand} />
                    <StatCard icon="repeat-outline" label="Returning" value={String(sum?.repeat_customers ?? 0)} sub={`${repeatRate}% repeat`} accent={colors.success} />
                    <StatCard icon="person-add-outline" label="New" value={String(newCustomers)} accent={colors.info} />
                  </View>
                  <View style={s.rateCard}>
                    <View style={s.rateHeader}>
                      <Text style={s.rateLabel}>Repeat Customer Rate</Text>
                      <Text style={[s.ratePct, { color: repeatRate >= 30 ? colors.success : colors.warning }]}>{repeatRate}%</Text>
                    </View>
                    <View style={s.rateTrack}>
                      <View style={[s.rateFill, { width: `${Math.min(100, repeatRate)}%` as `${number}%`, backgroundColor: repeatRate >= 30 ? colors.success : colors.warning }]} />
                    </View>
                    <Text style={s.rateNote}>Share of this period&apos;s customers who ordered from you before.</Text>
                  </View>
                </>
              )}

              {/* Top products */}
              {(data?.topProducts.length ?? 0) > 0 && (
                <>
                  <Text style={s.sectionTitle}>Top Products</Text>
                  <View style={s.productsCard}>
                    {data?.topProducts.map((product, i) => (
                      <View key={product.name} style={[s.productRow, i < (data.topProducts.length - 1) && s.productRowBorder]}>
                        <View style={s.productRank}><Text style={s.productRankTxt}>{i + 1}</Text></View>
                        <View style={s.productInfo}>
                          <Text style={s.productName} numberOfLines={1}>{product.name}</Text>
                          <Text style={s.productQty}>{product.qty} sold</Text>
                        </View>
                        <Text style={s.productRevenue}>{formatJmd(product.revenue)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Top locations */}
              {(data?.topLocations.length ?? 0) > 0 && (
                <>
                  <Text style={s.sectionTitle}>Top Areas</Text>
                  <View style={s.productsCard}>
                    {data?.topLocations.map((loc, i) => (
                      <View key={loc.location} style={[s.productRow, i < (data.topLocations.length - 1) && s.productRowBorder]}>
                        <View style={s.productRank}><Ionicons name="location-outline" size={15} color={colors.brand} /></View>
                        <View style={s.productInfo}><Text style={s.productName} numberOfLines={1}>{loc.location}</Text></View>
                        <Text style={s.productRevenue}>{loc.orders} orders</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  periodBar: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  periodChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  periodLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  periodLabelActive: { color: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  scoreCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card,
    borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border,
  },
  scoreRing: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  scoreValue: { fontSize: 26, fontWeight: '900' },
  scoreOutOf: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginLeft: 1, marginTop: 8 },
  scoreBody: { flex: 1 },
  scoreTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  scoreSub: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 10, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statBody: { flex: 1 },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  rateCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  rateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  rateLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  ratePct: { fontSize: 16, fontWeight: '800' },
  rateTrack: { height: 8, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 4 },
  rateNote: { fontSize: 11, color: colors.textMuted, marginTop: 8, lineHeight: 16 },
  productsCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', marginBottom: 20,
  },
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  productRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  productRank: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandSurface,
    alignItems: 'center', justifyContent: 'center',
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
