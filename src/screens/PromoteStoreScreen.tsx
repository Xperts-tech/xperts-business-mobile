import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  PLACEMENT_CATALOG,
  getCoinBalance,
  listMyPlacements,
  requestPlacement,
  payPlacementWithCoins,
  type PlacementCatalogItem,
  type Placement,
} from '@/services/placementService';
import { openBillingPortal } from '@/services/billingService';
import type { PromoteStoreScreenProps } from '@/types/navigation';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:           { label: 'Draft',           color: colors.textSecondary, bg: colors.borderLight },
  pending_payment: { label: 'Awaiting payment', color: colors.warning, bg: colors.warningSurface },
  scheduled:       { label: 'In review',       color: '#1D4ED8', bg: '#EFF6FF' },
  active:          { label: 'Live',            color: colors.success, bg: colors.successSurface },
  paused:          { label: 'Paused',          color: colors.textSecondary, bg: colors.borderLight },
  completed:       { label: 'Ended',           color: colors.textSecondary, bg: colors.borderLight },
  cancelled:       { label: 'Cancelled',       color: colors.danger, bg: colors.dangerSurface },
};

function reviewLabel(p: Placement): string | null {
  const r = (p.metadata as { review?: string } | null)?.review;
  if (p.status === 'active') return 'Live on the marketplace';
  if (r === 'pending') return 'Paid — awaiting admin approval';
  if (r === 'rejected') return 'Not approved (refunded)';
  if (p.payment_status === 'unpaid') return 'Pay to submit for review';
  return null;
}

export default function PromoteStoreScreen({ navigation }: PromoteStoreScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusiness, selectedStoreId } = useBusiness();
  const businessId = selectedBusiness?.id ?? '';

  const [coins, setCoins] = useState(0);
  const [mine, setMine] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<PlacementCatalogItem | null>(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    const [c, p] = await Promise.all([getCoinBalance(businessId), listMyPlacements(businessId)]);
    setCoins(c);
    setMine(p);
    setLoading(false);
  }, [businessId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function choose(c: PlacementCatalogItem) {
    setPicked(c); setTitle(''); setTarget('');
  }

  async function handleBuy() {
    if (!picked || !businessId) return;
    if (coins < picked.price) { Alert.alert('Not enough coins', `You need ${picked.price - coins} more coins for ${picked.label}.`); return; }
    setBusy(true);
    const req = await requestPlacement(businessId, {
      type: picked.type,
      title: title.trim() || picked.label,
      storeId: selectedStoreId ?? null,
      targetLocation: picked.needsLocation ? target.trim() || null : null,
      targetCategory: picked.needsCategory ? target.trim() || null : null,
    });
    if (!req.ok || !req.placementId) {
      setBusy(false);
      Alert.alert('Could not create placement', req.reason ?? 'Please try again.');
      return;
    }
    const pay = await payPlacementWithCoins(req.placementId);
    setBusy(false);
    if (pay.ok) {
      setPicked(null); setTitle(''); setTarget('');
      Alert.alert('Placement in review', `Paid ${picked.price} coins — your ${picked.label} is now in review. We'll notify you when it goes live.`);
      load();
    } else if (pay.reason === 'insufficient') {
      Alert.alert('Not enough coins', `Need ${picked.price}, have ${pay.balance ?? coins}.`);
      load();
    } else {
      Alert.alert('Payment failed', 'Payment could not be completed.');
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.rootInner, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Promote My Store</Text>
          <View style={s.backBtn} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        >
          {/* Coin balance */}
          <View style={s.coinCard}>
            <View>
              <Text style={s.coinLabel}>Growth Coins</Text>
              <Text style={s.coinValue}>{coins.toLocaleString()} 🪙</Text>
            </View>
            <TouchableOpacity onPress={openBillingPortal} activeOpacity={0.8}>
              <Text style={s.topUp}>Top up</Text>
            </TouchableOpacity>
          </View>

          {/* Catalog */}
          <Text style={s.sectionLabel}>MARKETPLACE PLACEMENTS</Text>
          {PLACEMENT_CATALOG.map((c) => {
            const active = picked?.type === c.type;
            return (
              <TouchableOpacity key={c.type} style={[s.catCard, active && s.catCardActive]} onPress={() => choose(c)} activeOpacity={0.85}>
                <View style={s.catTop}>
                  <View style={s.catTitleRow}>
                    <Text style={s.catTitle}>{c.label}</Text>
                    {c.premium ? <View style={s.premiumBadge}><Text style={s.premiumText}>Premium</Text></View> : null}
                  </View>
                  <Text style={s.catPrice}>{c.price} 🪙</Text>
                </View>
                <Text style={s.catBlurb}>{c.blurb}</Text>
                <Text style={s.catDays}>{c.days} days</Text>
              </TouchableOpacity>
            );
          })}

          {/* Purchase form */}
          {picked && (
            <View style={s.form}>
              <Text style={s.formTitle}>Set up your {picked.label}</Text>
              <Text style={s.miniLabel}>Headline</Text>
              <TextInput
                style={s.input}
                placeholder={picked.label}
                placeholderTextColor={colors.textSecondary}
                value={title}
                onChangeText={setTitle}
              />
              {(picked.needsLocation || picked.needsCategory) && (
                <>
                  <Text style={s.miniLabel}>{picked.needsLocation ? 'Target area / parish' : 'Target category'}</Text>
                  <TextInput style={s.input} value={target} onChangeText={setTarget} placeholderTextColor={colors.textSecondary} />
                </>
              )}
              <TouchableOpacity
                style={[s.payBtn, (busy || coins < picked.price) && s.payBtnDisabled]}
                onPress={handleBuy}
                disabled={busy || coins < picked.price}
                activeOpacity={0.85}
              >
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={s.payBtnText}>Pay {picked.price} coins</Text>}
              </TouchableOpacity>
              {coins < picked.price && <Text style={s.needMore}>Need {picked.price - coins} more coins</Text>}
              <TouchableOpacity onPress={() => setPicked(null)} style={s.cancelBtn}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
              <Text style={s.reviewNote}>Placements are reviewed by our team before going live (usually within 1 business day).</Text>
            </View>
          )}

          {/* My placements */}
          <Text style={[s.sectionLabel, { marginTop: 20 }]}>YOUR PLACEMENTS</Text>
          {loading ? (
            <View style={s.loading}><ActivityIndicator color={colors.brand} /></View>
          ) : mine.length === 0 ? (
            <Text style={s.empty}>No placements yet.</Text>
          ) : (
            mine.map((p) => {
              const st = STATUS_META[p.status] ?? STATUS_META.draft;
              const rl = reviewLabel(p);
              return (
                <View key={p.id} style={s.mineCard}>
                  <View style={s.mineTop}>
                    <View style={[s.badge, { backgroundColor: st.bg }]}><Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text></View>
                    <Text style={s.mineTitle} numberOfLines={1}>{p.title}</Text>
                    <Text style={s.minePrice}>{p.price_amount} 🪙</Text>
                  </View>
                  {rl ? <Text style={s.mineHint}>{rl}</Text> : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  rootInner: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  scroll: { padding: 16 },
  coinCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.brandSurface, borderRadius: 16, padding: 16, marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brand + '55',
  },
  coinLabel: { fontSize: 12, fontWeight: '700', color: '#047857' },
  coinValue: { fontSize: 24, fontWeight: '900', color: '#065F46', marginTop: 2 },
  topUp: { fontSize: 13, fontWeight: '800', color: colors.brand, textDecorationLine: 'underline' },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.textSecondary, marginBottom: 10 },
  catCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  catCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSurface },
  catTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  catTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  premiumBadge: { backgroundColor: colors.warningSurface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  premiumText: { fontSize: 10, fontWeight: '800', color: colors.warning },
  catPrice: { fontSize: 15, fontWeight: '900', color: '#047857' },
  catBlurb: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  catDays: { marginTop: 4, fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  form: {
    marginTop: 6, backgroundColor: colors.card, borderRadius: 16, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 },
  miniLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary, marginBottom: 12,
  },
  payBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  needMore: { marginTop: 8, fontSize: 12, fontWeight: '700', color: colors.warning, textAlign: 'center' },
  cancelBtn: { marginTop: 10, alignItems: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textDecorationLine: 'underline' },
  reviewNote: { marginTop: 10, fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  loading: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontSize: 13, color: colors.textSecondary, paddingVertical: 8 },
  mineCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 13, marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight,
  },
  mineTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  mineTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
  minePrice: { fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },
  mineHint: { marginTop: 5, fontSize: 12, color: colors.textSecondary },
});
