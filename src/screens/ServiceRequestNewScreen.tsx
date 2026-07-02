import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import {
  getCategoryMeta,
  submitServiceRequest,
} from '@/services/businessServicesService';
import type { BusinessStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<BusinessStackParamList, 'ServiceRequestNew'>;

export default function ServiceRequestNewScreen({ route, navigation }: Props) {
  const { requestType } = route.params;
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { selectedBusinessId, selectedStoreId } = useBusiness();

  const category = getCategoryMeta(requestType);

  const [description, setDescription] = useState('');
  const [businessNotes, setBusinessNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const desc = description.trim();
    if (!desc) {
      Alert.alert('Description required', 'Please describe what you need before submitting.');
      return;
    }
    if (!selectedBusinessId || !user) return;

    setSubmitting(true);
    const { requestId, error } = await submitServiceRequest({
      businessId:    selectedBusinessId,
      storeId:       selectedStoreId ?? null,
      submittedBy:   user.id,
      requestType,
      title:         `${category.label} request`,
      description:   desc,
      businessNotes: businessNotes.trim() || null,
    });

    if (error) {
      setSubmitting(false);
      Alert.alert('Submission failed', error);
      return;
    }

    setSubmitting(false);
    if (requestId) {
      navigation.replace('ServiceRequestDetail', { requestId });
    } else {
      navigation.goBack();
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Request</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Category banner ────────────────────────────────────── */}
        <View style={styles.categoryBanner}>
          <Text style={styles.categoryBannerIcon}>{category.icon}</Text>
          <View style={styles.categoryBannerText}>
            <Text style={styles.categoryBannerLabel}>{category.label}</Text>
            <Text style={styles.categoryBannerDesc}>{category.description}</Text>
          </View>
        </View>

        {/* ── Description ────────────────────────────────────────── */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Description <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe what you need in detail…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={5}
            maxLength={2000}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{description.length}/2000</Text>
        </View>

        {/* ── Additional notes ───────────────────────────────────── */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Additional Notes</Text>
          <TextInput
            style={[styles.textArea, styles.textAreaSm]}
            value={businessNotes}
            onChangeText={setBusinessNotes}
            placeholder="Any extra context, budget, deadline, etc. (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={1000}
            textAlignVertical="top"
          />
        </View>

        {/* ── Info card ──────────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Our team typically reviews new requests within 1–2 business days. You'll receive a message here once your request is under review.
          </Text>
        </View>

        {/* ── Submit ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, gap: 20 },

  categoryBanner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  categoryBannerIcon: { fontSize: 36 },
  categoryBannerText: { flex: 1, gap: 4 },
  categoryBannerLabel: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  categoryBannerDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  field: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, paddingLeft: 2 },
  required: { color: colors.danger },
  textArea: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 120,
    lineHeight: 22,
  },
  textAreaSm: { minHeight: 80 },
  charCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right', paddingRight: 4 },

  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 14,
  },
  infoText: { fontSize: 13, color: '#1D4ED8', lineHeight: 19 },

  submitBtn: {
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
