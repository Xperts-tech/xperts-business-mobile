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
import { loadMessageThreads } from '@/services/messageService';
import {
  formatOrderNumber,
  getOrderStatusColor,
  getOrderStatusLabel,
  type MessageThread,
} from '@/types/orders';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

function ThreadCard({
  thread,
  onPress,
}: {
  thread: MessageThread;
  onPress: () => void;
}) {
  const order = thread.order;
  const statusColor = order ? getOrderStatusColor(order.status) : colors.textMuted;
  const statusLabel = order ? getOrderStatusLabel(order.status) : '';

  const timeLabel = thread.created_at;
  const date = new Date(timeLabel);
  const isToday = date.toDateString() === new Date().toDateString();
  const displayTime = isToday
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const orderLabel = order
    ? formatOrderNumber({ id: order.id, order_number: order.order_number ?? null })
    : thread.order_id.slice(0, 8).toUpperCase();

  return (
    <TouchableOpacity style={styles.threadCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.threadLeft}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>💬</Text>
        </View>
        <View style={styles.threadInfo}>
          <Text style={styles.threadOrderNum}>{orderLabel}</Text>
          {order && (
            <View
              style={[
                styles.statusChip,
                { backgroundColor: statusColor + '1A', borderColor: statusColor + '40' },
              ]}
            >
              <Text style={[styles.statusChipText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.threadRight}>
        <Text style={styles.threadTime}>{displayTime}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { selectedStoreId } = useBusiness();

  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    const { threads: rows, error: err } = await loadMessageThreads(selectedStoreId);
    setThreads(rows);
    setError(err);
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const noStore = !selectedStoreId;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {noStore ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyTitle}>No store selected</Text>
          <Text style={styles.emptyText}>Select a store to view its messages.</Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load messages</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <ThreadCard
              thread={item}
              onPress={() =>
                navigation.navigate('MessageThread', {
                  orderId: item.order_id,
                  threadId: item.id,
                  orderNumber: item.order?.order_number ?? undefined,
                })
              }
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
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>No active conversations</Text>
              <Text style={styles.emptyText}>
                Message threads appear here when customers send questions about their orders.
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 8, gap: 1 },

  threadCard: {
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  threadLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20 },
  threadInfo: { gap: 5, flex: 1 },
  threadOrderNum: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  statusChipText: { fontSize: 11, fontWeight: '600' },
  threadRight: { alignItems: 'flex-end', gap: 4 },
  threadTime: { fontSize: 12, color: colors.textMuted },
  chevron: { fontSize: 20, color: colors.textMuted, fontWeight: '300' },

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
});
