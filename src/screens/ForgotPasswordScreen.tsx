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
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/colors';
import type { ForgotPasswordScreenProps } from '@/types/navigation';

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: 'xperts-business://reset-password',
    });

    setLoading(false);
    if (resetErr) {
      setError(resetErr.message || 'Failed to send reset email. Please try again.');
    } else {
      setSent(true);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            Enter your registered email address and we will send you a password reset link.
          </Text>

          {sent ? (
            <View style={styles.successCard}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Email sent</Text>
              <Text style={styles.successText}>
                Check your inbox for a reset link. It may take a minute to arrive.
              </Text>
              <TouchableOpacity style={styles.backToSignInBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
                <Text style={styles.backToSignInText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formCard}>
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
                returnKeyType="done"
                onSubmitEditing={handleReset}
                editable={!loading}
              />

              <TouchableOpacity
                style={[styles.submitBtn, (!email.trim() || loading) && styles.submitBtnDisabled]}
                onPress={handleReset}
                disabled={!email.trim() || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  content: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 },
  subtitle: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28 },

  formCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder,
    borderRadius: 12, padding: 14, marginBottom: 20,
  },
  errorIcon: { fontSize: 15, color: colors.danger, marginTop: 1 },
  errorText: { flex: 1, color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.7,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16,
    color: colors.textPrimary, marginBottom: 20,
  },
  inputErr: { borderColor: colors.danger, backgroundColor: '#FFF5F5' },
  submitBtn: {
    backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 18, alignItems: 'center',
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  submitBtnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  successCard: {
    backgroundColor: colors.successSurface, borderRadius: 16, padding: 28, borderWidth: 1,
    borderColor: colors.successBorder, alignItems: 'center', gap: 12,
  },
  successIcon: { fontSize: 32, color: colors.success },
  successTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  successText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  backToSignInBtn: {
    backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 32, alignItems: 'center', marginTop: 8,
  },
  backToSignInText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
