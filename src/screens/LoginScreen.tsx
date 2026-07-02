import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginScreenProps } from '@/types/navigation';

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSignIn() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError);
      setSubmitting(false);
    }
    // On success, RootNavigator detects the new session and renders BusinessNavigator.
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <View style={[styles.hero, { paddingTop: insets.top + 44 }]}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoLetter}>X</Text>
          </View>
          <Text style={styles.appName}>XPERTS BUSINESS</Text>
          <Text style={styles.appSub}>Partner Management Portal</Text>
        </View>

        {/* ── Form card ─────────────────────────────────────────────── */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Sign in to your account</Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorIcon}>⚠</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Email address</Text>
          <TextInput
            style={[styles.input, error ? styles.inputErr : null]}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
            editable={!submitting}
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={[styles.input, error ? styles.inputErr : null]}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={(v) => { setPassword(v); if (error) setError(null); }}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
            editable={!submitting}
          />

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSignIn}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => navigation.navigate('ForgotPassword')}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotBtnText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.85}
          >
            <Text style={styles.registerBtnText}>Register your business</Text>
          </TouchableOpacity>

          <View style={styles.footerNote}>
            <Text style={styles.footerNoteText}>
              This app is for Xperts Business partners — restaurant owners, store owners, pharmacies, couriers, and event sellers.{'\n'}
              Drivers and runners:{' '}
              <Text style={styles.footerNoteEmphasis}>use the Xperts Pro app.</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand },
  scroll: { flexGrow: 1 },

  hero: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 52,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  logoLetter: { fontSize: 40, fontWeight: '900', color: colors.brand, letterSpacing: -1 },
  appName: { fontSize: 21, fontWeight: '900', color: '#FFFFFF', letterSpacing: 3, marginBottom: 7 },
  appSub: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.60)', letterSpacing: 0.5 },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 34,
    paddingBottom: 48,
    minHeight: 480,
  },
  formTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 26 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorIcon: { fontSize: 15, color: colors.danger, marginTop: 1 },
  errorText: { flex: 1, color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '500' },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  inputErr: { borderColor: colors.danger, backgroundColor: '#FFF5F5' },

  submitBtn: {
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },

  forgotBtn: { alignItems: 'center', marginTop: 14 },
  forgotBtnText: { color: colors.brand, fontSize: 14, fontWeight: '600' },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 22, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  registerBtn: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.brand,
  },
  registerBtnText: { color: colors.brand, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },

  footerNote: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  footerNoteText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  footerNoteEmphasis: { color: colors.textSecondary, fontWeight: '700' },
});
