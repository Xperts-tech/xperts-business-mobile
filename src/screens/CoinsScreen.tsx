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
import { colors } from '@/constants/colors';
import {
  getMyCoinWallet,
  listMyCoinLedger,
  type CoinWallet,
  type CoinLedgerEntry,
} from '@/services/coinsService';
import { getSubscription, planLabel, type BusinessSubscription } from '@/services/billingService';
import ManageBillingCard from '@/components/ManageBillingCard';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

const SUB_STATUS_LABEL: Record<string, string> = {
  trialing: 'Trial', active: 'Active', past_due: 'Past due',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
}

const EARN_WAYS = [
  { icon: '✅', title: 'Complete your store profile',  desc: 'Earn coins when your store is fully set up and approved.' },
  { icon: '📦', title: 'Hit order milestones',         desc: 'Bonus coins when you reach 10, 50, and 100+ delivered orders.' },
  { icon: '⭐', title: 'Maintain high ratings',        desc: 'Monthly bonus for stores with consistent 4.5+ ratings.' },
  { icon: '🎁', title: 'Xperts rewards & promotions',  desc: 'Watch for special coin drops and partner promotions.' },
] as const;

function LedgerRow({ entry }: { entry: CoinLedgerEntry }) {
  const isCredit = entry.amount > 0;
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });

  return (
    <View style={styles.ledgerRow}>
      <View style={[styles.ledgerIcon, isCredit ? styles.ledgerIconCredit : styles.ledgerIconDebit]}>
        <Text style={styles.ledgerIconText}>{isCredit ? '＋' : '−'}</Text>
      </View>
      <View style={styles.ledgerBody}>
        <Text style={styles.ledgerReason} numberOfLines={2}>{entry.reason}</Text>
        <Text style={styles.ledgerDate}>{date}</Text>
      </View>
      <Text style={[styles.ledgerAmount, isCredit ? styles.ledgerAmountCredit : styles.ledgerAmountDebit]}>
        {isCredit ? '+' : ''}{entry.amount.toLocaleString()}
      </Text>
    </View>
  );
}

export default function CoinsScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { selectedBusinessId } = useBusiness();

  const [wallet,     setWallet]     = useState<CoinWallet | null>(null);
  const [entries,    setEntries]    = useState<CoinLedgerEntry[]>([]);
  const [sub,        setSub]        = useState<BusinessSubscription | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedBusinessId) { setLoading(false); return; }
    const [wRes, lRes, sRes] = await Promise.all([
      getMyCoinWallet(selectedBusinessId),
      listMyCoinLedger(selectedBusinessId),
      getSubscription(selectedBusinessId),
    ]);
    setWallet(wRes.wallet);
    setEntries(lRes.entries);
    setSub(sRes);
    setLoading(false);
  }, [selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const balance        = wallet?.balance        ?? 0;
  const lifetimeEarned = wallet?.lifetime_earned ?? 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Xperts Coins</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          {/* ── Balance card ───────────────────────────────────── */}
          <View style={styles.balanceCard}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
            <Text style={styles.balanceLabel}>Xperts Coins</Text>
            {lifetimeEarned > 0 && (
              <View style={styles.lifetimePill}>
                <Text style={styles.lifetimePillText}>
                  {lifetimeEarned.toLocaleString()} earned lifetime
                </Text>
              </View>
            )}
          </View>

          {/* ── Current plan (view-only) ───────────────────────── */}
          <Text style={styles.sectionLabel}>Your Plan</Text>
          <View style={styles.planCard}>
            <View style={styles.planRow}>
              <View>
                <Text style={styles.planName}>{planLabel(sub?.plan_key)}</Text>
                {sub?.billing_next_at ? (
                  <Text style={styles.planMeta}>Renews {fmtDate(sub.billing_next_at)}</Text>
                ) : (
                  <Text style={styles.planMeta}>No paid plan — upgrade on the web portal.</Text>
                )}
              </View>
              <View style={[styles.planBadge, sub ? styles.planBadgeActive : styles.planBadgeFree]}>
                <Text style={[styles.planBadgeText, sub ? styles.planBadgeTextActive : styles.planBadgeTextFree]}>
                  {sub ? (SUB_STATUS_LABEL[sub.status] ?? sub.status) : 'Free'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Manage billing (purchases happen on the web portal) ── */}
          <ManageBillingCard />

          {/* ── Ways to earn ───────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Ways to Earn</Text>
          <View style={styles.earnCard}>
            {EARN_WAYS.map((way, idx) => (
              <View
                key={way.title}
                style={[styles.earnRow, idx < EARN_WAYS.length - 1 && styles.earnRowBorder]}
              >
                <Text style={styles.earnIcon}>{way.icon}</Text>
                <View style={styles.earnBody}>
                  <Text style={styles.earnTitle}>{way.title}</Text>
                  <Text style={styles.earnDesc}>{way.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── What coins are used for ────────────────────────── */}
          <Text style={styles.sectionLabel}>What Coins Can Do</Text>
          <View style={styles.usesRow}>
            <View style={styles.useCard}>
              <Text style={styles.useIcon}>🏪</Text>
              <Text style={styles.useTitle}>Shop discounts</Text>
              <Text style={styles.useDesc}>Redeem coins in the Xperts Shop for supplies and kits.</Text>
            </View>
            <View style={styles.useCard}>
              <Text style={styles.useIcon}>🚀</Text>
              <Text style={styles.useTitle}>Boost services</Text>
              <Text style={styles.useDesc}>Use coins to unlock premium growth and marketing services.</Text>
            </View>
          </View>

          {/* ── Transaction history ─────────────────────────────── */}
          <Text style={styles.sectionLabel}>Transaction History</Text>
          {entries.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No transactions yet. Earned coins will appear here.</Text>
            </View>
          ) : (
            <View style={styles.ledgerCard}>
              {entries.map((entry, idx) => (
                <View key={entry.id} style={idx < entries.length - 1 ? styles.ledgerRowBorder : undefined}>
                  <LedgerRow entry={entry} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor:   colors.brand,
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  backBtn:     { width: 64 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#fff' },

  content: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },

  balanceCard: {
    backgroundColor: colors.brand,
    borderRadius:    24,
    paddingVertical: 32,
    alignItems:      'center',
    gap: 6,
  },
  coinEmoji:      { fontSize: 48 },
  balanceAmount:  { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  balanceLabel:   { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },
  lifetimePill: {
    marginTop:         4,
    backgroundColor:   'rgba(255,255,255,0.18)',
    borderRadius:      20,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  lifetimePillText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

  planCard: {
    backgroundColor: colors.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
  },
  planRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName:  { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  planMeta:  { marginTop: 2, fontSize: 12, color: colors.textMuted },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  planBadgeActive: { backgroundColor: colors.successSurface },
  planBadgeFree:   { backgroundColor: colors.borderLight },
  planBadgeText:       { fontSize: 11, fontWeight: '800' },
  planBadgeTextActive: { color: colors.success },
  planBadgeTextFree:   { color: colors.textSecondary },

  sectionLabel: {
    fontSize:      11,
    fontWeight:    '700',
    color:         colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop:     6,
  },

  earnCard: {
    backgroundColor: colors.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     colors.border,
    overflow:        'hidden',
  },
  earnRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    padding:        14,
    gap:            12,
  },
  earnRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  earnIcon:  { fontSize: 22, width: 28, textAlign: 'center', marginTop: 2 },
  earnBody:  { flex: 1, gap: 3 },
  earnTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  earnDesc:  { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  usesRow: { flexDirection: 'row', gap: 10 },
  useCard: {
    flex:            1,
    backgroundColor: colors.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         14,
    gap:             6,
    alignItems:      'center',
  },
  useIcon:  { fontSize: 28 },
  useTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  useDesc:  { fontSize: 11, color: colors.textSecondary, textAlign: 'center', lineHeight: 16 },

  emptyHistory: {
    backgroundColor: colors.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         20,
    alignItems:      'center',
  },
  emptyHistoryText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  ledgerCard: {
    backgroundColor: colors.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     colors.border,
    overflow:        'hidden',
  },
  ledgerRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  ledgerRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       14,
    gap:           12,
  },
  ledgerIcon: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  ledgerIconCredit: { backgroundColor: '#D1FAE5' },
  ledgerIconDebit:  { backgroundColor: '#FEE2E2' },
  ledgerIconText:   { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  ledgerBody:       { flex: 1, gap: 2 },
  ledgerReason:     { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  ledgerDate:       { fontSize: 11, color: colors.textMuted },
  ledgerAmount:     { fontSize: 15, fontWeight: '800' },
  ledgerAmountCredit: { color: colors.success },
  ledgerAmountDebit:  { color: colors.danger },
});
