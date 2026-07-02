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
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/constants/colors';
import {
  listMyNotifications,
  markAllRead,
  markOneRead,
  type AppNotification,
} from '@/services/notificationService';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

const TYPE_ICON: Record<string, string> = {
  business_service_request: '🛠️',
  order:                    '📦',
  message:                  '💬',
  payment:                  '💰',
  general:                  '🔔',
};

function typeIcon(notifType: string): string {
  return TYPE_ICON[notifType] ?? '🔔';
}

function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const date = new Date(item.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  });
  const time = new Date(item.created_at).toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <TouchableOpacity
      style={[styles.row, !item.is_read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.rowIconWrap}>
        <Text style={styles.rowIcon}>{typeIcon(item.notification_type)}</Text>
        {!item.is_read && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, !item.is_read && styles.rowTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={styles.rowBodyText} numberOfLines={2}>{item.body}</Text>
        ) : null}
        <Text style={styles.rowDate}>{date} · {time}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user }   = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [markingAll,    setMarkingAll]    = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { notifications: rows } = await listMyNotifications(user.id);
    setNotifications(rows);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handlePress(item: AppNotification) {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      await markOneRead(item.id);
    }
  }

  async function handleMarkAll() {
    if (!user || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await markAllRead(user.id);
    setMarkingAll(false);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={handleMarkAll}
          disabled={markingAll || unreadCount === 0}
          style={styles.markAllBtn}
        >
          <Text style={[
            styles.markAllText,
            (markingAll || unreadCount === 0) && styles.markAllTextDisabled,
          ]}>
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Content ────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NotificationRow item={item} onPress={() => handlePress(item)} />
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptyText}>
                You'll see updates about your service requests and account activity here.
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
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    gap: 8,
  },
  backBtn: { width: 60 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  headerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  markAllBtn: { width: 90, alignItems: 'flex-end' },
  markAllText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  markAllTextDisabled: { opacity: 0.4 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingTop: 8 },

  row: {
    flexDirection: 'row',
    alignItems:   'flex-start',
    paddingHorizontal: 16,
    paddingVertical:   14,
    backgroundColor: colors.card,
    gap: 12,
  },
  rowUnread: { backgroundColor: '#EFF6FF' },

  rowIconWrap: { position: 'relative', width: 36, alignItems: 'center', paddingTop: 2 },
  rowIcon: { fontSize: 22 },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: colors.card,
  },

  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowTitleUnread: { fontWeight: '800' },
  rowBodyText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  rowDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  separator: { height: 1, backgroundColor: colors.borderLight, marginLeft: 64 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
});
