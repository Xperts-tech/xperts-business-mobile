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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useBusiness } from '@/contexts/BusinessContext';
import { supabase } from '@/lib/supabase';
import type { GrowthStudioScreenProps } from '@/types/navigation';

type HubTile = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  screen: 'CreativeStudio' | 'PromoRequests' | 'StoreQRCode' | 'Analytics' | 'Coins';
  tier: 'free' | 'coins' | 'sub';
};

const HUB_TILES: HubTile[] = [
  {
    key: 'creative',
    title: 'Creative Studio',
    description: 'Generate captions, posts, and content for Instagram, Facebook & WhatsApp',
    icon: 'color-palette-outline',
    bg: '#6D28D9',
    screen: 'CreativeStudio',
    tier: 'free',
  },
  {
    key: 'promo',
    title: 'Promote My Store',
    description: 'Request featured listings, boosted ads, and Xperts campaign support',
    icon: 'megaphone-outline',
    bg: colors.brand,
    screen: 'PromoRequests',
    tier: 'coins',
  },
  {
    key: 'qr',
    title: 'Store QR & Link',
    description: 'Share your store QR code and get a direct link to send customers',
    icon: 'qr-code-outline',
    bg: '#0284C7',
    screen: 'StoreQRCode',
    tier: 'free',
  },
  {
    key: 'analytics',
    title: 'Performance Stats',
    description: 'See your revenue, orders, and top products over time',
    icon: 'bar-chart-outline',
    bg: '#059669',
    screen: 'Analytics',
    tier: 'free',
  },
  {
    key: 'coins',
    title: 'Xperts Coins',
    description: 'Top up coins to unlock premium promo features and design help',
    icon: 'ellipse-outline',
    bg: '#D97706',
    screen: 'Coins',
    tier: 'coins',
  },
];

const TIER_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  free:  { label: 'Free',    color: colors.brand,   bg: colors.brandSurface },
  coins: { label: 'Coins',   color: '#D97706',       bg: '#FFFBEB' },
  sub:   { label: 'Pro',     color: '#7C3AED',       bg: '#F5F3FF' },
};

export default function GrowthStudioScreen({ navigation }: GrowthStudioScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusiness } = useBusiness();
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [loadingCoins, setLoadingCoins] = useState(true);

  const loadCoins = useCallback(async () => {
    if (!selectedBusiness?.id) { setLoadingCoins(false); return; }
    const { data } = await supabase
      .from('business_coins')
      .select('balance')
      .eq('business_id', selectedBusiness.id)
      .maybeSingle();
    setCoinBalance((data as { balance: number } | null)?.balance ?? 0);
    setLoadingCoins(false);
  }, [selectedBusiness?.id]);

  useEffect(() => { loadCoins(); }, [loadCoins]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Growth Studio</Text>
        <TouchableOpacity
          style={s.coinChip}
          onPress={() => navigation.navigate('Coins')}
          activeOpacity={0.8}
        >
          {loadingCoins ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <>
              <Ionicons name="ellipse" size={14} color="#D97706" />
              <Text style={s.coinText}>{coinBalance ?? 0}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* Intro card */}
        <View style={s.introCard}>
          <View style={s.introIcon}>
            <Ionicons name="rocket-outline" size={24} color={colors.brand} />
          </View>
          <View style={s.introText}>
            <Text style={s.introTitle}>Grow {selectedBusiness?.name ?? 'your store'}</Text>
            <Text style={s.introSub}>
              Marketing tools that help you attract more customers — and grow Xperts together.
            </Text>
          </View>
        </View>

        {/* Feature tiles */}
        <Text style={s.sectionLabel}>Tools</Text>
        {HUB_TILES.map((tile) => {
          const badge = TIER_BADGE[tile.tier];
          return (
            <TouchableOpacity
              key={tile.key}
              style={s.tile}
              onPress={() => navigation.navigate(tile.screen)}
              activeOpacity={0.85}
            >
              <View style={[s.tileIconWrap, { backgroundColor: tile.bg }]}>
                <Ionicons name={tile.icon} size={22} color="#FFFFFF" />
              </View>
              <View style={s.tileBody}>
                <View style={s.tileTitleRow}>
                  <Text style={s.tileTitle}>{tile.title}</Text>
                  <View style={[s.tierBadge, { backgroundColor: badge.bg }]}>
                    <Text style={[s.tierBadgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>
                <Text style={s.tileDesc} numberOfLines={2}>{tile.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.tabInactive} />
            </TouchableOpacity>
          );
        })}

        {/* Access model info */}
        <View style={s.accessCard}>
          <Text style={s.accessTitle}>Access Tiers</Text>
          {[
            { label: 'Free', desc: 'Basic templates, store link, QR code, basic captions', color: colors.brand },
            { label: 'Coins', desc: 'Premium templates, featured placement requests, Xperts design help', color: '#D97706' },
            { label: 'Pro (Coming soon)', desc: 'Monthly promo calendar, campaign reports, priority growth support', color: '#7C3AED' },
          ].map((tier) => (
            <View key={tier.label} style={s.accessRow}>
              <View style={[s.accessDot, { backgroundColor: tier.color }]} />
              <View style={s.accessRowText}>
                <Text style={s.accessRowLabel}>{tier.label}</Text>
                <Text style={s.accessRowDesc}>{tier.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  coinText: { fontSize: 14, fontWeight: '700', color: '#D97706' },

  scroll: { padding: 16 },

  introCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.brandSurface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.brand + '30',
    alignItems: 'flex-start',
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  introText: { flex: 1 },
  introTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  introSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tileIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileBody: { flex: 1 },
  tileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  tileTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  tileDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  tierBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tierBadgeText: { fontSize: 10, fontWeight: '700' },

  accessCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accessTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  accessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  accessDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  accessRowText: { flex: 1 },
  accessRowLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 1 },
  accessRowDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
