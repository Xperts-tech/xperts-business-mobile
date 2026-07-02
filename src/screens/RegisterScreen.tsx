import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import type { RegisterScreenProps } from '@/types/navigation';

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoLetter}>X</Text>
          </View>
          <Text style={styles.title}>Register your business</Text>
          <Text style={styles.subtitle}>Business registration is handled via the Xperts Xpress web portal.</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>How to register</Text>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
              <Text style={styles.stepText}>Visit xpertsxpress.com on your browser</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
              <Text style={styles.stepText}>Complete the Business Registration wizard</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
              <Text style={styles.stepText}>Submit your store for Xperts review</Text>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
              <Text style={styles.stepText}>Once approved, sign in here with your registered email</Text>
            </View>
          </View>

          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              Already registered?{' '}
              <Text style={styles.noteEmphasis}>Sign in</Text>
              {' '}with your email and password.
            </Text>
          </View>

          <TouchableOpacity style={styles.backToSignIn} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
            <Text style={styles.backToSignInText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 },

  backBtn: { marginBottom: 8 },
  backBtnText: { color: colors.brand, fontSize: 15, fontWeight: '600' },

  content: { alignItems: 'center', paddingTop: 24 },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoLetter: { fontSize: 30, fontWeight: '900', color: '#fff' },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: { fontSize: 13, fontWeight: '800', color: colors.brand },
  stepText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  noteCard: {
    width: '100%',
    backgroundColor: colors.successSurface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.successBorder,
    marginBottom: 24,
  },
  noteText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  noteEmphasis: { color: colors.brand, fontWeight: '700' },

  backToSignIn: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  backToSignInText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
