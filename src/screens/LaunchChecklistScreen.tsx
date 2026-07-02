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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/colors';
import { parseBusinessHours } from '@/services/businessStoreService';
import type { Store } from '@/types/business';
import type { BusinessStackParamList, LaunchChecklistScreenProps } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  done: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

async function fetchProductCount(storeId: string): Promise<number> {
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId);
  return count ?? 0;
}

export default function LaunchChecklistScreen({ navigation }: LaunchChecklistScreenProps) {
  const insets = useSafeAreaInsets();
  const parentNav = useNavigation<Nav>();
  const { selectedStore, selectedStoreId, refreshBusinessContext } = useBusiness();

  const [productCount, setProductCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedStoreId) { setLoading(false); return; }
    const count = await fetchProductCount(selectedStoreId);
    setProductCount(count);
    setLoading(false);
  }, [selectedStoreId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refreshBusinessContext(), load()]);
    setRefreshing(false);
  }

  // ── Build checklist ───────────────────────────────────────────────────────

  const store = selectedStore as Store | null;
  const meta = (store?.metadata as Record<string, unknown> | null) ?? {};
  const hours = parseBusinessHours((store?.metadata as Record<string, unknown> | null) ?? null);
  const hoursConfigured = Object.keys(hours).length > 0;
  const submitted = meta.setup_review_requested === true;
  const nonDraft =
    typeof store?.approval_status === 'string' &&
    store.approval_status !== 'draft' &&
    store.approval_status !== '';
  const approved = store?.is_approved === true || store?.approval_status === 'approved';

  const checklist: ChecklistItem[] = [
    {
      key: 'profile',
      title: 'Complete store profile',
      description: 'Add your store name, description, and a cover image.',
      done: Boolean(store?.name && !store.deleted_at),
      actionLabel: 'View profile',
      onAction: () => parentNav.navigate('StoreProfile'),
    },
    {
      key: 'products',
      title: 'Add products to your catalog',
      description: 'Your store needs at least one product before customers can order.',
      done: (productCount ?? 0) > 0,
      actionLabel: (productCount ?? 0) > 0 ? `${productCount} products` : 'View catalog',
      onAction: () => navigation.goBack(),
    },
    {
      key: 'hours',
      title: 'Configure business hours',
      description: 'Set your opening days and times so customers know when you are available.',
      done: hoursConfigured,
      actionLabel: 'Set hours',
      onAction: () => parentNav.navigate('StoreProfile'),
    },
    {
      key: 'review',
      title: 'Submit for Xperts review',
      description: 'Once your profile and catalog are ready, submit to be reviewed by our team.',
      done: submitted || nonDraft,
      actionLabel: submitted ? 'Submitted ✓' : 'Submit via web portal',
    },
    {
      key: 'approved',
      title: 'Get approved and go live',
      description: 'Xperts will review your store. Once approved, customers can place orders.',
      done: approved,
      actionLabel: approved ? 'You are live ✓' : 'Awaiting approval',
    },
  ];

  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);
  const barColor = pct >= 100 ? colors.success : pct >= 60 ? colors.warning : colors.brand;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Launch Checklist</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          }
        >
          {/* ── Progress ─────────────────────────────────────── */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>Setup Progress</Text>
              <Text style={[styles.progressPct, { color: barColor }]}>{pct}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={styles.progressSub}>
              {doneCount} of {checklist.length} steps complete
              {pct >= 100 ? ' — ready for review!' : ''}
            </Text>
          </View>

          {/* ── Steps ────────────────────────────────────────── */}
          {checklist.map((item, index) => (
            <View key={item.key} style={[styles.stepCard, item.done && styles.stepCardDone]}>
              <View style={styles.stepLeft}>
                <View style={[styles.stepCircle, item.done && styles.stepCircleDone]}>
                  {item.done ? (
                    <Text style={styles.stepCheckmark}>✓</Text>
                  ) : (
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                  )}
                </View>
              </View>
              <View style={styles.stepBody}>
                <Text style={[styles.stepTitle, item.done && styles.stepTitleDone]}>
                  {item.title}
                </Text>
                <Text style={styles.stepDesc}>{item.description}</Text>
                {item.actionLabel && item.onAction && !item.done && (
                  <TouchableOpacity style={styles.stepActionBtn} onPress={item.onAction} activeOpacity={0.8}>
                    <Text style={styles.stepActionText}>{item.actionLabel} ›</Text>
                  </TouchableOpacity>
                )}
                {item.done && item.actionLabel && (
                  <Text style={styles.stepDoneLabel}>{item.actionLabel}</Text>
                )}
              </View>
            </View>
          ))}

          <View style={styles.helpCard}>
            <Text style={styles.helpText}>
              Need help getting set up? Contact Xperts support from the More tab.
            </Text>
          </View>
        </ScrollView>
      )}
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  progressCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  progressPct: { fontSize: 24, fontWeight: '900' },
  progressTrack: { height: 8, backgroundColor: colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, minWidth: 8 },
  progressSub: { fontSize: 13, color: colors.textSecondary },

  stepCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    flexDirection: 'row', gap: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  stepCardDone: { borderColor: colors.success + '40', backgroundColor: colors.success + '06' },
  stepLeft: {},
  stepCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border,
  },
  stepCircleDone: { backgroundColor: colors.success + '20', borderColor: colors.success },
  stepNumber: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  stepCheckmark: { fontSize: 16, fontWeight: '800', color: colors.success },
  stepBody: { flex: 1, gap: 6 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  stepTitleDone: { color: colors.success },
  stepDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  stepActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSurface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.brand + '35',
  },
  stepActionText: { fontSize: 13, fontWeight: '700', color: colors.brand },
  stepDoneLabel: { fontSize: 12, color: colors.success, fontWeight: '600' },

  helpCard: {
    backgroundColor: colors.brandSurface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.brand + '30',
  },
  helpText: { fontSize: 13, color: colors.brand, lineHeight: 19 },
});
