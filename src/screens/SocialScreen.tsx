import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { useBusiness } from '@/contexts/BusinessContext';
import {
  getConnections,
  startConnect,
  disconnectChannel,
  channelState,
  type SocialConnection,
} from '@/services/socialService';
import type { SocialScreenProps } from '@/types/navigation';

type ChannelKey = 'facebook' | 'instagram';

const CHANNELS: { key: ChannelKey; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'facebook',  label: 'Facebook Page', icon: 'logo-facebook',  color: '#1877F2' },
  { key: 'instagram', label: 'Instagram',     icon: 'logo-instagram', color: '#C13584' },
];

const STATE_META: Record<
  ReturnType<typeof channelState>,
  { label: string; color: string; bg: string; hint: string }
> = {
  connected:     { label: 'Connected',    color: colors.success, bg: colors.successSurface, hint: 'Ready to publish.' },
  reauthorize:   { label: 'Reconnect',    color: colors.warning, bg: colors.warningSurface, hint: 'Publishing permission missing — reconnect to grant it.' },
  expired:       { label: 'Expired',      color: colors.danger,  bg: colors.dangerSurface,  hint: 'The connection expired — reconnect to continue.' },
  not_connected: { label: 'Not connected', color: colors.textSecondary, bg: colors.borderLight, hint: 'Connect to schedule and auto-publish posts.' },
};

const RESULT_MSG: Record<string, string> = {
  connected: 'Connected! Your account is ready.',
  declined: 'Connection cancelled. You can try again anytime.',
  no_page: 'No manageable Facebook Page was found on that account.',
  error: 'Something went wrong connecting. Please try again.',
};

export default function SocialScreen({ navigation, route }: SocialScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusiness } = useBusiness();
  const businessId = selectedBusiness?.id ?? '';
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const shownResultRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    const rows = await getConnections(businessId);
    setConnections(rows);
    setLoading(false);
  }, [businessId]);

  // Refresh whenever the screen regains focus (e.g. returning from the OAuth browser).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Surface the OAuth deep-link result (xperts-business://social?meta=...) once.
  useEffect(() => {
    const meta = route.params?.meta;
    if (meta && shownResultRef.current !== meta) {
      shownResultRef.current = meta;
      Alert.alert(meta === 'connected' ? 'Account connected' : 'Connection', RESULT_MSG[meta] ?? 'Connection updated.');
      load();
    }
  }, [route.params?.meta, load]);

  const connFor = (key: ChannelKey) => connections.find((c) => c.channel === key);

  async function handleConnect() {
    if (!businessId) { Alert.alert('Select a business first.'); return; }
    setConnecting(true);
    const res = await startConnect(businessId);
    setConnecting(false);
    if (!res.ok || !res.url) {
      Alert.alert('Could not start', res.reason === 'ai_unavailable' ? 'Social connect is not available right now.' : (res.reason ?? 'Please try again.'));
      return;
    }
    const canOpen = await Linking.canOpenURL(res.url);
    if (!canOpen) { Alert.alert('Could not open the Facebook login.'); return; }
    await Linking.openURL(res.url);
    // The OAuth flow completes in the browser; connections refresh on focus return.
  }

  function handleDisconnect(conn: SocialConnection) {
    Alert.alert(
      'Disconnect?',
      `Remove the ${conn.channel === 'instagram' ? 'Instagram' : 'Facebook'} connection${conn.account_name ? ` (${conn.account_name})` : ''}? Scheduled auto-publishing to it will stop.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            const ok = await disconnectChannel(conn.id);
            if (!ok) Alert.alert('Could not disconnect. Please try again.');
            load();
          },
        },
      ],
    );
  }

  const anyConnected = connections.some((c) => channelState(c) === 'connected');

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Social Accounts</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
      >
        <View style={s.introCard}>
          <View style={s.introIcon}>
            <Ionicons name="share-social-outline" size={22} color={colors.brand} />
          </View>
          <View style={s.introText}>
            <Text style={s.introTitle}>Connect Facebook & Instagram</Text>
            <Text style={s.introSub}>
              Link your business Page to schedule and auto-publish your posts. Your login stays with Facebook — we never see your password.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={s.loading}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <>
            {CHANNELS.map(({ key, label, icon, color }) => {
              const conn = connFor(key);
              const st = channelState(conn);
              const meta = STATE_META[st];
              return (
                <View key={key} style={s.card}>
                  <View style={s.cardRow}>
                    <View style={[s.channelIcon, { backgroundColor: color + '18' }]}>
                      <Ionicons name={icon} size={22} color={color} />
                    </View>
                    <View style={s.cardBody}>
                      <Text style={s.cardTitle}>{label}</Text>
                      {conn?.account_name ? <Text style={s.cardAccount}>{conn.account_name}</Text> : null}
                      <Text style={s.cardHint}>{meta.hint}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: meta.bg }]}>
                      <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  {conn && st !== 'not_connected' ? (
                    <TouchableOpacity style={s.disconnectBtn} onPress={() => handleDisconnect(conn)} activeOpacity={0.8}>
                      <Text style={s.disconnectText}>Disconnect</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            <TouchableOpacity
              style={[s.connectBtn, connecting && s.connectBtnDisabled]}
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.85}
            >
              {connecting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="logo-facebook" size={18} color={colors.white} />
                  <Text style={s.connectText}>{anyConnected ? 'Reconnect / add account' : 'Connect with Facebook'}</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={s.footnote}>
              Instagram publishing requires an Instagram Business or Creator account linked to your Facebook Page. After connecting in the browser, come back here — your status refreshes automatically.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  scroll: { padding: 16 },
  introCard: {
    flexDirection: 'row', gap: 12, backgroundColor: colors.brandSurface,
    borderRadius: 16, padding: 14, marginBottom: 16,
  },
  introIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  introText: { flex: 1 },
  introTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  introSub: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  loading: { paddingVertical: 40, alignItems: 'center' },
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  channelIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  cardAccount: { marginTop: 1, fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  cardHint: { marginTop: 2, fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  disconnectBtn: {
    marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
  },
  disconnectText: { fontSize: 12.5, fontWeight: '800', color: colors.danger },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1877F2', borderRadius: 14, paddingVertical: 14, marginTop: 4,
  },
  connectBtnDisabled: { opacity: 0.7 },
  connectText: { fontSize: 15, fontWeight: '800', color: colors.white },
  footnote: { marginTop: 14, fontSize: 11.5, lineHeight: 17, color: colors.textSecondary },
});
