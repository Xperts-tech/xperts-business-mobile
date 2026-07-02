import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

export default function AccessDeniedScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>🚫</Text>
        </View>

        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.subtitle}>
          This app is for Xperts Business partners only.{'\n\n'}
          Your account ({profile?.role ?? 'unknown role'}) does not have access to the Xperts Business portal.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Wrong app?</Text>
          <Text style={styles.cardText}>
            • <Text style={styles.bold}>Drivers &amp; runners:</Text> use the Xperts Pro app{'\n'}
            • <Text style={styles.bold}>Customers:</Text> use the Xperts Xpress website{'\n'}
            • <Text style={styles.bold}>Business owners:</Text> contact Xperts to link your account
          </Text>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.85}>
          <Text style={styles.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  iconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.dangerSurface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  iconText: { fontSize: 36 },

  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 23, marginBottom: 28 },

  card: {
    width: '100%', backgroundColor: colors.card, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: colors.border, marginBottom: 28,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  cardText: { fontSize: 13, color: colors.textSecondary, lineHeight: 22 },
  bold: { fontWeight: '700', color: colors.textPrimary },

  signOutBtn: {
    width: '100%', backgroundColor: colors.danger, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
  },
  signOutBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
