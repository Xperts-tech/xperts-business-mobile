import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  parseBusinessHours,
  toggleBusinessHoursDay,
  WEEK_DAYS,
  type BusinessHours,
  type WeekDay,
} from '@/services/businessStoreService';
import type { StoreProfileScreenProps } from '@/types/navigation';
import type { Store } from '@/types/business';

const DAY_LABELS: Record<WeekDay, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function ApprovalBadge({ status }: { status: string | null | undefined }) {
  let color: string = colors.textMuted;
  let label = 'Draft';
  if (status === 'approved') { color = colors.success; label = 'Approved'; }
  else if (status === 'pending' || status === 'under_review') { color = colors.warning; label = 'Under Review'; }
  else if (status === 'rejected') { color = colors.danger; label = 'Rejected'; }
  return (
    <View style={[styles.approvalBadge, { backgroundColor: color + '18', borderColor: color + '45' }]}>
      <View style={[styles.approvalDot, { backgroundColor: color }]} />
      <Text style={[styles.approvalBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function StoreProfileScreen({ navigation }: StoreProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedStore, selectedStoreId, refreshBusinessContext } = useBusiness();

  const [hours, setHours] = useState<BusinessHours>({});
  const [togglingDay, setTogglingDay] = useState<WeekDay | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Derive hours from selectedStore metadata
  useEffect(() => {
    const meta = (selectedStore?.metadata as Record<string, unknown> | null) ?? null;
    setHours(parseBusinessHours(meta));
  }, [selectedStore]);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshBusinessContext();
    setRefreshing(false);
  }

  async function handleToggleDay(day: WeekDay, isOpen: boolean) {
    if (!selectedStoreId) return;
    setTogglingDay(day);

    // Optimistic
    setHours((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? {}), open: isOpen },
    }));

    const { error } = await toggleBusinessHoursDay(selectedStoreId, day, isOpen);
    if (error) {
      // Revert
      setHours((prev) => ({
        ...prev,
        [day]: { ...(prev[day] ?? {}), open: !isOpen },
      }));
      Alert.alert('Error', error);
    } else {
      await refreshBusinessContext();
    }
    setTogglingDay(null);
  }

  if (!selectedStore) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Store Profile</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No store selected.</Text>
        </View>
      </View>
    );
  }

  const store = selectedStore as Store;
  const coverUrl = store.cover_url ?? null;
  const meta = (store.metadata as Record<string, unknown> | null) ?? {};
  const hoursConfigured = Object.keys(hours).length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Store Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} colors={[colors.brand]} />
        }
      >
        {/* ── Cover image ──────────────────────────────────────── */}
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={styles.coverEmoji}>🏪</Text>
            <Text style={styles.coverNote}>Cover image — set via web portal</Text>
          </View>
        )}

        {/* ── Store identity ───────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.storeHeaderRow}>
            <View style={styles.storeHeaderLeft}>
              <Text style={styles.storeName}>{store.name}</Text>
              {store.slug && (
                <Text style={styles.storeSlug}>/{store.slug}</Text>
              )}
            </View>
            <ApprovalBadge status={store.approval_status} />
          </View>

          {store.description && (
            <Text style={styles.storeDescription}>{store.description}</Text>
          )}

          <View style={styles.metaRows}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Store ID</Text>
              <Text style={styles.metaValue}>{store.id.slice(0, 16)}…</Text>
            </View>
            {store.is_approved && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Live</Text>
                <Text style={[styles.metaValue, { color: colors.success }]}>Yes ✓</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Business hours ───────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Business Hours</Text>
          {!hoursConfigured && (
            <View style={styles.noHoursNote}>
              <Text style={styles.noHoursText}>
                No hours configured yet. Set exact hours in the web portal, then toggle days here.
              </Text>
            </View>
          )}
          {WEEK_DAYS.map((day) => {
            const dayData = hours[day];
            const isOpen = dayData?.open ?? false;
            const fromTime = dayData?.from;
            const toTime = dayData?.to;

            return (
              <View key={day} style={styles.dayRow}>
                <View style={styles.dayLeft}>
                  <Text style={[styles.dayName, !isOpen && styles.dayNameClosed]}>
                    {DAY_LABELS[day]}
                  </Text>
                  {isOpen && fromTime && toTime ? (
                    <Text style={styles.dayTime}>{fromTime} – {toTime}</Text>
                  ) : isOpen && !fromTime ? (
                    <Text style={styles.dayTimeNote}>Hours not set</Text>
                  ) : (
                    <Text style={styles.dayTimeClosed}>Closed</Text>
                  )}
                </View>
                {togglingDay === day ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Switch
                    value={isOpen}
                    onValueChange={(val) => void handleToggleDay(day, val)}
                    trackColor={{ false: colors.danger + '50', true: colors.success + '60' }}
                    thumbColor={isOpen ? colors.success : colors.textMuted}
                    ios_backgroundColor={colors.danger + '30'}
                  />
                )}
              </View>
            );
          })}
          <Text style={styles.hoursNote}>
            To change opening times, use the web portal.
          </Text>
        </View>

        {/* ── Store metadata info ──────────────────────────────── */}
        {!!(meta.contact_phone || meta.contact_email || meta.address) && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Contact Info</Text>
            {!!meta.contact_phone && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Phone</Text>
                <Text style={styles.metaValue}>{String(meta.contact_phone)}</Text>
              </View>
            )}
            {!!meta.contact_email && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Email</Text>
                <Text style={styles.metaValue}>{String(meta.contact_email)}</Text>
              </View>
            )}
            {!!meta.address && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Address</Text>
                <Text style={styles.metaValue}>{String(meta.address)}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
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

  scroll: { flex: 1 },
  scrollContent: { gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, color: colors.textSecondary },

  coverImage: { width: '100%', height: 180, borderRadius: 14 },
  coverPlaceholder: {
    width: '100%', height: 120, borderRadius: 14,
    backgroundColor: colors.borderLight, alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderColor: colors.border,
  },
  coverEmoji: { fontSize: 36 },
  coverNote: { fontSize: 12, color: colors.textMuted },

  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  storeHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  storeHeaderLeft: { flex: 1 },
  storeName: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  storeSlug: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  storeDescription: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  approvalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  approvalDot: { width: 7, height: 7, borderRadius: 4 },
  approvalBadgeText: { fontSize: 11, fontWeight: '700' },

  metaRows: { gap: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  metaValue: { fontSize: 12, color: colors.textSecondary },

  noHoursNote: {
    backgroundColor: colors.borderLight, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  noHoursText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  dayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  dayLeft: { flex: 1, gap: 2 },
  dayName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  dayNameClosed: { color: colors.textMuted },
  dayTime: { fontSize: 12, color: colors.textSecondary },
  dayTimeNote: { fontSize: 12, color: colors.warning },
  dayTimeClosed: { fontSize: 12, color: colors.danger + 'AA' },
  hoursNote: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
});
