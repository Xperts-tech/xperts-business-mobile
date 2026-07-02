import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import type { StaffInviteAcceptScreenProps } from '@/types/navigation';

export default function StaffInviteAcceptScreen({ route, navigation }: StaffInviteAcceptScreenProps) {
  const insets = useSafeAreaInsets();
  const token = route.params?.token ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>👥</Text>
        </View>

        <Text style={styles.title}>Staff Invite</Text>
        <Text style={styles.subtitle}>You have been invited to join a business on Xperts.</Text>

        {token ? (
          <View style={styles.tokenCard}>
            <Text style={styles.tokenLabel}>Invite token received</Text>
            <Text style={styles.tokenValue} numberOfLines={1}>
              {token.length > 24 ? `${token.slice(0, 24)}…` : token}
            </Text>
          </View>
        ) : (
          <View style={styles.noTokenCard}>
            <Text style={styles.noTokenText}>No invite token found in this link.</Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Coming soon</Text>
          <Text style={styles.infoText}>
            Staff invite acceptance will be fully connected in a later batch. {'\n\n'}
            For now, your business owner can add you directly through the Xperts Business web portal.{'\n\n'}
            Deep link scheme: <Text style={styles.infoCode}>xperts-business://join?token=…</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <Text style={styles.signInBtnText}>Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  content: { flex: 1, alignItems: 'center', paddingTop: 24 },

  iconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandSurface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  iconText: { fontSize: 32 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  tokenCard: {
    width: '100%', backgroundColor: colors.brandSurface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  tokenLabel: { fontSize: 11, fontWeight: '700', color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 },
  tokenValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },

  noTokenCard: {
    width: '100%', backgroundColor: colors.warningSurface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.warningBorder, marginBottom: 16,
  },
  noTokenText: { fontSize: 14, color: colors.warning, fontWeight: '600', textAlign: 'center' },

  infoCard: {
    width: '100%', backgroundColor: colors.card, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: colors.border, marginBottom: 28,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  infoText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  infoCode: { fontWeight: '700', color: colors.brand },

  signInBtn: {
    width: '100%', backgroundColor: colors.brand, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
  },
  signInBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
