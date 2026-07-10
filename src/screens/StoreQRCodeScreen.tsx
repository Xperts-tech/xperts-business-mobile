import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { colors } from '@/constants/colors';
import { useBusiness } from '@/contexts/BusinessContext';
import type { StoreQRCodeScreenProps } from '@/types/navigation';

const QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=';

function buildStoreUrl(slug: string): string {
  return `https://xpertsxpress.com/stores/${encodeURIComponent(slug)}`;
}

export default function StoreQRCodeScreen({ navigation }: StoreQRCodeScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusiness } = useBusiness();
  const [copied, setCopied] = useState(false);

  const slug = selectedBusiness?.id ?? 'my-store';
  const storeUrl = buildStoreUrl(slug);
  const qrUrl = `${QR_API}${encodeURIComponent(storeUrl)}`;

  const handleCopyLink = useCallback(async () => {
    await Clipboard.setStringAsync(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [storeUrl]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Order from ${selectedBusiness?.name ?? 'our store'} on Xperts Express!\n\n${storeUrl}`,
        url: storeUrl,
        title: `${selectedBusiness?.name ?? 'Store'} on Xperts Express`,
      });
    } catch {
      Alert.alert('Error', 'Could not open share sheet.');
    }
  }, [storeUrl, selectedBusiness?.name]);

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
        <Text style={s.headerTitle}>Store QR & Link</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* QR code card */}
        <View style={s.qrCard}>
          <View style={s.storeName}>
            <View style={s.storeAvatar}>
              <Text style={s.storeAvatarText}>
                {(selectedBusiness?.name ?? 'S')[0].toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={s.storeNameText} numberOfLines={1}>
                {selectedBusiness?.name ?? 'My Store'}
              </Text>
              <Text style={s.storeSubText}>Xperts Express Partner</Text>
            </View>
          </View>

          <View style={s.qrWrap}>
            <Image
              source={{ uri: qrUrl }}
              style={s.qrImage}
              resizeMode="contain"
            />
          </View>

          <Text style={s.qrHint}>Scan to open your store in the Xperts Express app</Text>
        </View>

        {/* Link card */}
        <View style={s.linkCard}>
          <Text style={s.linkLabel}>Your store link</Text>
          <View style={s.linkRow}>
            <Text style={s.linkText} numberOfLines={1} ellipsizeMode="middle">
              {storeUrl}
            </Text>
            <TouchableOpacity
              onPress={handleCopyLink}
              style={s.copyBtn}
              activeOpacity={0.8}
            >
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={18}
                color={copied ? colors.brand : colors.textMuted}
              />
              <Text style={[s.copyBtnText, copied && { color: colors.brand }]}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-outline" size={20} color={colors.white} />
          <Text style={s.shareBtnText}>Share Store Link</Text>
        </TouchableOpacity>

        {/* Usage tips */}
        <View style={s.tipsCard}>
          <Text style={s.tipsTitle}>How to use your QR code</Text>
          {[
            { icon: 'print-outline' as const, text: 'Print and display at your physical store — let walk-in customers order ahead or follow your menu' },
            { icon: 'logo-whatsapp' as const, text: 'Send your link on WhatsApp to customers and request them to save it in their contacts' },
            { icon: 'camera-outline' as const, text: 'Screenshot the QR and post it to your Instagram stories with a CTA' },
            { icon: 'storefront-outline' as const, text: 'Add it to flyers, receipts, and packaging for repeat-order convenience' },
          ].map((tip, i) => (
            <View key={i} style={s.tipRow}>
              <View style={s.tipIconWrap}>
                <Ionicons name={tip.icon} size={16} color={colors.brand} />
              </View>
              <Text style={s.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>

        <View style={s.noteCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={s.noteText}>
            This link opens directly in the Xperts Express customer app if installed, or in a browser for ordering via web.
          </Text>
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

  scroll: { padding: 16 },

  qrCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  storeName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    alignSelf: 'stretch',
  },
  storeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeAvatarText: { fontSize: 20, fontWeight: '800', color: colors.white },
  storeNameText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  storeSubText: { fontSize: 12, color: colors.textMuted },

  qrWrap: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  qrImage: { width: 200, height: 200 },

  qrHint: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
  },

  linkCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  linkLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  copyBtnText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },

  tipsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
  tipRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  tipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.brandSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, flex: 1 },

  noteCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  noteText: { fontSize: 12, color: colors.textMuted, lineHeight: 17, flex: 1 },
});
