import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import { loadSpecials, toggleSpecial } from '@/services/specialsService';
import { formatPrice, type ProductSpecial } from '@/types/products';
import type { SpecialsScreenProps } from '@/types/navigation';

function specialIsLive(special: ProductSpecial): boolean {
  const now = new Date();
  if (special.valid_from && new Date(special.valid_from) > now) return false;
  if (special.valid_until && new Date(special.valid_until) < now) return false;
  return special.status === 'active';
}

function SpecialCard({
  special,
  canManage,
  toggling,
  onToggle,
}: {
  special: ProductSpecial;
  canManage: boolean;
  toggling: boolean;
  onToggle: (isActive: boolean) => void;
}) {
  const live = specialIsLive(special);
  const isActive = special.status === 'active';
  const expired = special.valid_until ? new Date(special.valid_until) < new Date() : special.status === 'expired';
  const scheduled = special.valid_from ? new Date(special.valid_from) > new Date() : false;

  let statusLabel: string = special.status.charAt(0).toUpperCase() + special.status.slice(1);
  let statusColor: string = colors.textMuted;
  if (special.status === 'active') statusColor = colors.success;
  if (special.status === 'paused') statusColor = colors.textMuted;
  if (special.status === 'sold_out') { statusLabel = 'Sold Out'; statusColor = colors.danger; }
  if (special.status === 'expired') statusColor = colors.danger;
  if (special.status === 'scheduled') statusColor = colors.info;
  if (!expired && live) { statusLabel = 'Live'; statusColor = colors.success; }
  if (scheduled && isActive) { statusLabel = 'Scheduled'; statusColor = colors.info; }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <Text style={styles.specialName} numberOfLines={2}>{special.name}</Text>
          {special.description && (
            <Text style={styles.specialDesc} numberOfLines={2}>{special.description}</Text>
          )}
          <View style={styles.priceRow}>
            {special.special_price != null && (
              <Text style={styles.specialPrice}>{formatPrice(special.special_price)}</Text>
            )}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.statusChip, { borderColor: statusColor + '50', backgroundColor: statusColor + '15' }]}>
            <Text style={[styles.statusChipText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {canManage && !expired && ['active', 'paused'].includes(special.status) && (
            toggling ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Switch
                value={isActive}
                onValueChange={onToggle}
                trackColor={{ false: colors.textMuted + '50', true: colors.success + '60' }}
                thumbColor={isActive ? colors.success : colors.textMuted}
              />
            )
          )}
        </View>
      </View>

      {(special.valid_from || special.valid_until) && (
        <View style={styles.dateRow}>
          {special.valid_from && (
            <Text style={styles.dateText}>
              From{' '}
              {new Date(special.valid_from).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              })}
            </Text>
          )}
          {special.valid_until && (
            <Text style={styles.dateText}>
              Until{' '}
              {new Date(special.valid_until).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              })}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function SpecialsScreen({ navigation }: SpecialsScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedStoreId, hasPermission, isOwner } = useBusiness();

  const canManage = isOwner || hasPermission('specials.manage');

  const [specials, setSpecials] = useState<ProductSpecial[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    const { specials: rows, error: err } = await loadSpecials(selectedStoreId);
    setSpecials(rows);
    setError(err);
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleToggle(special: ProductSpecial, isActive: boolean) {
    setTogglingId(special.id);
    const prevStatus = special.status;
    // Optimistic update
    setSpecials((prev) =>
      prev.map((s) => (s.id === special.id ? { ...s, status: isActive ? 'active' : 'paused' } as typeof s : s)),
    );
    const { error: err } = await toggleSpecial(special.id, isActive);
    if (err) {
      // Revert on error
      setSpecials((prev) =>
        prev.map((s) => (s.id === special.id ? { ...s, status: prevStatus } as typeof s : s)),
      );
      Alert.alert('Error', err);
    }
    setTogglingId(null);
  }

  const noStore = !selectedStoreId;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Specials</Text>
        <View style={styles.backBtn} />
      </View>

      {noStore ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyTitle}>No store selected</Text>
          <Text style={styles.emptyText}>Select a store to view its specials.</Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load specials</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={specials}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SpecialCard
              special={item}
              canManage={canManage}
              toggling={togglingId === item.id}
              onToggle={(isActive) => void handleToggle(item, isActive)}
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
          ListHeaderComponent={
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                Create and schedule new specials in the web portal. Enable or disable them here.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>⭐</Text>
              <Text style={styles.emptyTitle}>No specials yet</Text>
              <Text style={styles.emptyText}>
                Create daily specials in the web portal to offer discounts and promotions to your customers.
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  noteCard: {
    backgroundColor: colors.brandSurface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.brand + '30', marginBottom: 4,
  },
  noteText: { fontSize: 13, color: colors.brand, fontWeight: '500', lineHeight: 19 },

  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  cardInfo: { flex: 1, gap: 5 },
  cardRight: { alignItems: 'flex-end', gap: 10 },

  specialName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, lineHeight: 21 },
  specialDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  specialPrice: { fontSize: 16, fontWeight: '900', color: colors.brand },
  originalPrice: {
    fontSize: 13, color: colors.textMuted, fontWeight: '500',
    textDecorationLine: 'line-through',
  },
  discountChip: {
    backgroundColor: colors.danger + '15', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.danger + '40',
  },
  discountText: { fontSize: 11, fontWeight: '800', color: colors.danger },

  statusChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  dateRow: { flexDirection: 'row', gap: 16 },
  dateText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },

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
