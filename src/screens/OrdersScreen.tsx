import { useCallback, useEffect, useRef, useState } from 'react';
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
import { loadOrders, type OrderFilter } from '@/services/orderService';
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime';
import {
  effectiveStage,
  formatOrderNumber,
  getOrderStatusColor,
  getOrderStatusLabel,
  type Order,
} from '@/types/orders';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

const FILTERS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_action', label: 'Needs Action' },
  { key: 'active', label: 'Active' },
  { key: 'done', label: 'Done' },
];

function StatusBadge({ status }: { status: string }) {
  const color = getOrderStatusColor(status);
  const label = getOrderStatusLabel(status);
  return (
    <View style={[styles.badge, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const hasIssues =
    (order.metadata?.item_issues as Record<string, unknown> | null)
      ?.has_unresolved === true;

  const formattedTime = new Date(order.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const formattedDate = new Date(order.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const isToday =
    new Date(order.created_at).toDateString() === new Date().toDateString();

  return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.orderCardTop}>
        <View style={styles.orderCardLeft}>
          <Text style={styles.orderNumber}>{formatOrderNumber(order)}</Text>
          <Text style={styles.orderTime}>
            {isToday ? formattedTime : `${formattedDate} · ${formattedTime}`}
          </Text>
        </View>
        <StatusBadge status={effectiveStage(order)} />
      </View>

      <View style={styles.orderCardBottom}>
        {order.total_amount != null && (
          <Text style={styles.orderTotal}>
            ${Number(order.total_amount).toFixed(2)}
          </Text>
        )}
        {hasIssues && (
          <View style={styles.issueChip}>
            <Text style={styles.issueChipText}>⚠ Item issue</Text>
          </View>
        )}
        <View style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { selectedBusinessId, selectedStoreId } = useBusiness();

  const [filter, setFilter] = useState<OrderFilter>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFilter = useRef(filter);
  activeFilter.current = filter;

  const fetchOrders = useCallback(
    async (nextFilter: OrderFilter, nextPage: number, append: boolean) => {
      if (!selectedBusinessId && !selectedStoreId) return;
      if (nextPage === 0 && !append) setLoading(true);
      else setLoadingMore(true);

      const { orders: rows, hasMore: more, error: err } = await loadOrders(
        { businessId: selectedBusinessId, storeId: selectedStoreId },
        nextFilter,
        nextPage,
      );

      if (activeFilter.current === nextFilter) {
        setOrders((prev) => (append ? [...prev, ...rows] : rows));
        setHasMore(more);
        setPage(nextPage);
        setError(err);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [selectedBusinessId, selectedStoreId],
  );

  useEffect(() => {
    setOrders([]);
    setPage(0);
    void fetchOrders(filter, 0, false);
  }, [filter, fetchOrders]);

  // Live updates — new/changed orders refresh the current filter's first page.
  useOrdersRealtime({ businessId: selectedBusinessId, storeId: selectedStoreId }, () => {
    void fetchOrders(activeFilter.current, 0, false);
  });

  async function handleRefresh() {
    setRefreshing(true);
    await fetchOrders(filter, 0, false);
    setRefreshing(false);
  }

  function handleLoadMore() {
    if (!hasMore || loadingMore || loading) return;
    void fetchOrders(filter, page + 1, true);
  }

  const noStore = !selectedBusinessId && !selectedStoreId;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      {/* ── Filter tabs ─────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === f.key && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ─────────────────────────────────────────────── */}
      {noStore ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyTitle}>No store selected</Text>
          <Text style={styles.emptyText}>Select a store to view its orders.</Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load orders</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.brand} size="small" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No orders</Text>
              <Text style={styles.emptyText}>
                {filter === 'needs_action'
                  ? 'No orders need your attention right now.'
                  : filter === 'active'
                    ? 'No active orders right now.'
                    : filter === 'done'
                      ? 'No completed or cancelled orders yet.'
                      : 'No orders yet. Share your store link to get started.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },

  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    gap: 4,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabActive: { borderBottomColor: colors.brand },
  filterTabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterTabTextActive: { color: colors.brand },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },

  orderCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  orderCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  orderCardLeft: { gap: 3 },
  orderCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderNumber: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  orderTime: { fontSize: 12, color: colors.textMuted },
  orderTotal: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  issueChip: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  issueChipText: { fontSize: 11, fontWeight: '700', color: '#DC2626' },

  chevron: { marginLeft: 'auto' },
  chevronText: { fontSize: 20, color: colors.textMuted, fontWeight: '300' },

  footerLoader: { paddingVertical: 20, alignItems: 'center' },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },

  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
