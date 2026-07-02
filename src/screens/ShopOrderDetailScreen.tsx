import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '@/constants/colors';
import {
  getShopOrderDetail,
  getOrderStatusColor,
  getOrderStatusLabel,
  formatJmd,
  type ShopOrder,
  type ShopOrderItem,
} from '@/services/shopService';
import type { BusinessStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<BusinessStackParamList, 'ShopOrderDetail'>;

const PAYMENT_LABELS: Record<string, string> = {
  unpaid:    'Awaiting payment',
  pending:   'Payment pending',
  paid:      'Paid',
  waived:    'Waived',
  coin_paid: 'Paid with coins',
};

const STATUS_STEPS = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

function StatusTimeline({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    return (
      <View style={styles.cancelledBanner}>
        <Text style={styles.cancelledText}>This order was cancelled.</Text>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      {STATUS_STEPS.map((step, idx) => {
        const done    = idx <= currentIdx;
        const current = idx === currentIdx;
        return (
          <View key={step} style={styles.timelineStep}>
            <View style={[
              styles.timelineDot,
              done    && styles.timelineDotDone,
              current && styles.timelineDotCurrent,
            ]}>
              {done && <Text style={styles.timelineDotCheck}>{current ? '●' : '✓'}</Text>}
            </View>
            <Text style={[styles.timelineLabel, done && styles.timelineLabelDone]}>
              {getOrderStatusLabel(step)}
            </Text>
            {idx < STATUS_STEPS.length - 1 && (
              <View style={[styles.timelineLine, done && idx < currentIdx && styles.timelineLineDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function ShopOrderDetailScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();

  const [order,   setOrder]   = useState<ShopOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const { order: o, error: e } = await getShopOrderDetail(orderId);
    setOrder(o);
    setError(e);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const statusColor = order ? getOrderStatusColor(order.status) : colors.brand;
  const items       = (order?.items ?? []) as ShopOrderItem[];
  const createdDate = order
    ? new Date(order.created_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop Order</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error || !order ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Order not found.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Order meta ─────────────────────────────────────── */}
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '40' }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                  {getOrderStatusLabel(order.status)}
                </Text>
              </View>
              <Text style={styles.metaDate}>Placed {createdDate}</Text>
            </View>
            <Text style={styles.metaId}>Order #{orderId.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.metaPayment}>
              {PAYMENT_LABELS[order.payment_status] ?? order.payment_status}
            </Text>
          </View>

          {/* ── Status timeline ────────────────────────────────── */}
          <StatusTimeline status={order.status} />

          {/* ── Items ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Items Ordered</Text>
          <View style={styles.itemsCard}>
            {items.map((item, idx) => (
              <View
                key={`${item.product_id}-${idx}`}
                style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}
              >
                <View style={styles.itemLeft}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                </View>
                <Text style={styles.itemPrice}>
                  {item.is_free ? 'Free' : formatJmd(item.price_jmd * item.quantity)}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatJmd(order.total_jmd)}</Text>
            </View>
          </View>

          {/* ── Delivery info ───────────────────────────────────── */}
          {(order.delivery_address || order.notes) && (
            <>
              <Text style={styles.sectionLabel}>Delivery Details</Text>
              <View style={styles.detailsCard}>
                {order.delivery_address && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Address</Text>
                    <Text style={styles.detailValue}>{order.delivery_address}</Text>
                  </View>
                )}
                {order.notes && (
                  <View style={[styles.detailRow, order.delivery_address && styles.detailRowBorder]}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailValue}>{order.notes}</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 14, color: colors.danger, textAlign: 'center' },

  header: {
    backgroundColor: colors.brand, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 64 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#fff' },

  content: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  metaCard: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16, gap: 8,
  },
  metaRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusBadge:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  metaDate:        { fontSize: 11, color: colors.textMuted },
  metaId:          { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  metaPayment:     { fontSize: 12, color: colors.textSecondary },

  timeline: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  timelineStep: { alignItems: 'center', flex: 1, position: 'relative' },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  timelineDotDone:    { backgroundColor: colors.success },
  timelineDotCurrent: { backgroundColor: colors.brand },
  timelineDotCheck:   { fontSize: 12, color: '#fff', fontWeight: '800' },
  timelineLabel:      { fontSize: 9, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
  timelineLabelDone:  { color: colors.textPrimary, fontWeight: '700' },
  timelineLine: {
    position: 'absolute', top: 11, left: '55%', right: '-50%',
    height: 2, backgroundColor: colors.border,
  },
  timelineLineDone: { backgroundColor: colors.success },

  cancelledBanner: {
    backgroundColor: '#FEF2F2', borderRadius: 14, borderWidth: 1,
    borderColor: '#FECACA', padding: 14, alignItems: 'center',
  },
  cancelledText: { fontSize: 13, color: colors.danger, fontWeight: '700' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4,
  },

  itemsCard: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden',
  },
  itemRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  itemLeft:      { flex: 1, gap: 2 },
  itemName:      { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  itemQty:       { fontSize: 12, color: colors.textSecondary },
  itemPrice:     { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, backgroundColor: '#F8FAFC',
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },

  detailsCard: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden',
  },
  detailRow:       { padding: 14, gap: 4 },
  detailRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderLight },
  detailLabel:     { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue:     { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
});
