import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  applyOrderAction,
  loadOrderDetail,
  loadOrderThread,
  resolveItemIssue,
} from '@/services/orderService';
import {
  AVAILABLE_ACTIONS,
  ORDER_ACTION_LABELS,
  effectiveStage,
  formatOrderNumber,
  getOrderStatusColor,
  getOrderStatusLabel,
  type ItemIssue,
  type Order,
  type OrderStatusAction,
} from '@/types/orders';
import type { OrderDetailScreenProps } from '@/types/navigation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = getOrderStatusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: color + '1A', borderColor: color + '40' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{getOrderStatusLabel(status)}</Text>
    </View>
  );
}

function ActionButton({
  action,
  onPress,
  loading,
}: {
  action: OrderStatusAction;
  onPress: () => void;
  loading: boolean;
}) {
  const isDestructive = action === 'reject';
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        isDestructive ? styles.actionBtnDestructive : styles.actionBtnPrimary,
        loading && styles.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.actionBtnText}>{ORDER_ACTION_LABELS[action]}</Text>
      )}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function OrderDetailScreen({ route, navigation }: OrderDetailScreenProps) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const { isAdmin, profile } = useAuth();
  const { hasPermission } = useBusiness();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<OrderStatusAction | null>(null);
  const [resolvingItemId, setResolvingItemId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [detailRes, threadRes] = await Promise.all([
      loadOrderDetail(orderId),
      loadOrderThread(orderId),
    ]);
    if (detailRes.error) setError(detailRes.error);
    else setOrder(detailRes.order);
    setThreadId(threadRes.threadId);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  // ── Available actions filtered by permission ──────────────────────────────

  const availableActions: OrderStatusAction[] = order
    ? (AVAILABLE_ACTIONS[effectiveStage(order)] ?? []).filter((a) => {
        if (isAdmin) return true;
        if (a === 'accept' || a === 'reject') return hasPermission('orders.accept');
        if (a === 'mark_preparing' || a === 'mark_ready') return hasPermission('orders.mark_ready');
        return false;
      })
    : [];

  async function handleAction(action: OrderStatusAction) {
    if (!order) return;

    const isDestructive = action === 'reject';
    if (isDestructive) {
      Alert.alert(
        'Reject Order',
        `Reject ${formatOrderNumber(order)}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: () => void executeAction(action),
          },
        ],
      );
      return;
    }
    void executeAction(action);
  }

  async function executeAction(action: OrderStatusAction) {
    if (!order) return;
    setActionLoading(action);
    const { error: err } = await applyOrderAction(order.id, action);
    if (err) {
      Alert.alert('Action failed', err);
    } else {
      await load();
    }
    setActionLoading(null);
  }

  async function handleResolveIssue(issue: ItemIssue) {
    if (!order) return;
    Alert.alert(
      'Resolve Item Issue',
      `Mark "${issue.name}" issue as resolved?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Resolved',
          onPress: async () => {
            setResolvingItemId(issue.item_id);
            const { error: err } = await resolveItemIssue(
              order.id,
              issue.item_id,
              'Acknowledged by store',
            );
            if (err) Alert.alert('Error', err);
            else await load();
            setResolvingItemId(null);
          },
        },
      ],
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Order not found'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const itemIssues = (
    (order.metadata?.item_issues as Record<string, unknown> | null)?.items ?? []
  ) as ItemIssue[];

  const unresolvedIssues = itemIssues.filter((i) => i.status !== 'resolved');
  const canResolveIssues = isAdmin || hasPermission('orders.item_review');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{formatOrderNumber(order)}</Text>
        {threadId ? (
          <TouchableOpacity
            style={styles.msgBtn}
            onPress={() =>
              navigation.navigate('MessageThread', {
                orderId: order.id,
                threadId,
                orderNumber: order.order_number ?? undefined,
              })
            }
          >
            <Text style={styles.msgBtnText}>💬</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status + time ────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <StatusBadge status={effectiveStage(order)} />
            <Text style={styles.orderTime}>
              {new Date(order.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          </View>

          {order.customer && (
            <View style={styles.customerRow}>
              <Text style={styles.customerLabel}>Customer</Text>
              <Text style={styles.customerName}>
                {order.customer.full_name ?? 'Anonymous'}
              </Text>
              {order.customer.phone && (
                <Text style={styles.customerPhone}>{order.customer.phone}</Text>
              )}
            </View>
          )}

          {order.special_instructions && (
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsLabel}>Special instructions</Text>
              <Text style={styles.instructionsText}>{order.special_instructions}</Text>
            </View>
          )}
        </View>

        {/* ── Action buttons ───────────────────────────────────── */}
        {availableActions.length > 0 && (
          <View style={styles.actionsCard}>
            <Text style={styles.sectionLabel}>Actions</Text>
            <View style={styles.actionsRow}>
              {availableActions.map((a) => (
                <ActionButton
                  key={a}
                  action={a}
                  loading={actionLoading === a}
                  onPress={() => void handleAction(a)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Item issues ──────────────────────────────────────── */}
        {unresolvedIssues.length > 0 && (
          <View style={styles.issuesCard}>
            <Text style={styles.sectionLabel}>Item Issues</Text>
            {unresolvedIssues.map((issue) => (
              <View key={issue.item_id} style={styles.issueRow}>
                <View style={styles.issueInfo}>
                  <Text style={styles.issueName}>{issue.name}</Text>
                  {issue.customer_message && (
                    <Text style={styles.issueMsg}>"{issue.customer_message}"</Text>
                  )}
                </View>
                {canResolveIssues && (
                  <TouchableOpacity
                    style={[
                      styles.resolveBtn,
                      resolvingItemId === issue.item_id && styles.resolveBtnDisabled,
                    ]}
                    onPress={() => void handleResolveIssue(issue)}
                    disabled={resolvingItemId === issue.item_id}
                  >
                    {resolvingItemId === issue.item_id ? (
                      <ActivityIndicator size="small" color={colors.brand} />
                    ) : (
                      <Text style={styles.resolveBtnText}>Resolve</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Items ───────────────────────────────────────────── */}
        {(order.items ?? []).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Items</Text>
            {(order.items ?? []).map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <Text style={styles.itemQty}>{item.quantity}×</Text>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.item_name ?? item.name}</Text>
                    {item.notes && (
                      <Text style={styles.itemNote}>{item.notes}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.itemPrice}>
                  {item.line_total != null ? `$${Number(item.line_total).toFixed(2)}` : ''}
                </Text>
              </View>
            ))}

            <View style={styles.divider} />

            {order.subtotal != null && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>${Number(order.subtotal).toFixed(2)}</Text>
              </View>
            )}
            {order.delivery_fee != null && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Delivery fee</Text>
                <Text style={styles.totalValue}>${Number(order.delivery_fee).toFixed(2)}</Text>
              </View>
            )}
            {order.total_amount != null && (
              <View style={[styles.totalRow, styles.totalRowFinal]}>
                <Text style={styles.totalLabelFinal}>Total</Text>
                <Text style={styles.totalValueFinal}>
                  ${Number(order.total_amount).toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Messages link ────────────────────────────────────── */}
        {threadId && (isAdmin || hasPermission('messages.view')) && (
          <TouchableOpacity
            style={styles.messagesLink}
            onPress={() =>
              navigation.navigate('MessageThread', {
                orderId: order.id,
                threadId,
                orderNumber: order.order_number ?? undefined,
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.messagesLinkIcon}>💬</Text>
            <Text style={styles.messagesLinkText}>View order messages</Text>
            <Text style={styles.messagesLinkChevron}>›</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },
  msgBtn: { width: 70, alignItems: 'flex-end' },
  msgBtnText: { fontSize: 22 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderTime: { fontSize: 12, color: colors.textMuted },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  customerRow: { gap: 3 },
  customerLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  customerName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  customerPhone: { fontSize: 13, color: colors.textSecondary },

  instructionsBox: {
    backgroundColor: colors.bg, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  instructionsLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  instructionsText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  actionsCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: { flex: 1, minWidth: 120, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: colors.brand },
  actionBtnDestructive: { backgroundColor: colors.danger },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  issuesCard: {
    backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#FECACA', gap: 12,
  },
  issueRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12,
  },
  issueInfo: { flex: 1, gap: 3 },
  issueName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  issueMsg: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 17 },
  resolveBtn: {
    backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border, minWidth: 72, alignItems: 'center',
  },
  resolveBtnDisabled: { opacity: 0.6 },
  resolveBtnText: { fontSize: 13, fontWeight: '700', color: colors.brand },

  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
  },
  itemLeft: { flexDirection: 'row', flex: 1, gap: 10, alignItems: 'flex-start' },
  itemQty: { fontSize: 14, fontWeight: '700', color: colors.textMuted, minWidth: 28 },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
  itemNote: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  itemPrice: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  totalRowFinal: { paddingTop: 6 },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  totalLabelFinal: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  totalValueFinal: { fontSize: 17, fontWeight: '900', color: colors.brand },

  messagesLink: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  messagesLinkIcon: { fontSize: 20 },
  messagesLinkText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.brand },
  messagesLinkChevron: { fontSize: 20, color: colors.textMuted, fontWeight: '300' },
});
