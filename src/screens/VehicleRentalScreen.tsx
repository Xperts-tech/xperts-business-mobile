import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  checkEligibility,
  listMyRentalRequests,
  submitRentalRequest,
  type RentalProgramRequest,
} from '@/services/vehicleRentalService';
import type { VehicleRentalScreenProps } from '@/types/navigation';

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  requested:                  'Submitted',
  awaiting_eligibility:       'Eligibility Check',
  awaiting_provider_approval: 'Awaiting Approval',
  approved:                   'Approved',
  declined:                   'Declined',
  confirmed:                  'Confirmed',
  active:                     'Active',
  completed:                  'Completed',
  cancelled:                  'Cancelled',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  requested:                  { bg: colors.brandSurface,   text: colors.brand },
  awaiting_eligibility:       { bg: colors.warningSurface, text: '#92400E' },
  awaiting_provider_approval: { bg: colors.warningSurface, text: '#92400E' },
  approved:                   { bg: colors.successSurface, text: '#166534' },
  declined:                   { bg: colors.dangerSurface,  text: '#991B1B' },
  confirmed:                  { bg: colors.successSurface, text: '#166534' },
  active:                     { bg: colors.brandSurface,   text: colors.brand },
  completed:                  { bg: colors.successSurface, text: '#166534' },
  cancelled:                  { bg: '#F1F5F9',             text: '#64748B' },
};

// ── Request form modal ────────────────────────────────────────────────────────

type FormState = {
  vehicleType:    string;
  useCase:        string;
  startDate:      string;
  estimatedDays:  string;
  pickupLocation: string;
};

const EMPTY_FORM: FormState = {
  vehicleType:    '',
  useCase:        '',
  startDate:      '',
  estimatedDays:  '1',
  pickupLocation: '',
};

function RequestModal({
  visible,
  submitting,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  submitting: boolean;
  onSubmit: (form: FormState) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (visible) setForm(EMPTY_FORM);
  }, [visible]);

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSubmit =
    form.vehicleType.trim().length > 0 &&
    form.useCase.trim().length > 0 &&
    form.startDate.trim().length > 0 &&
    parseInt(form.estimatedDays, 10) >= 1 &&
    form.pickupLocation.trim().length > 0 &&
    !submitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={fs.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={fs.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={fs.title}>Request a Vehicle</Text>

            <Text style={fs.label}>Vehicle Type *</Text>
            <TextInput
              style={fs.input}
              value={form.vehicleType}
              onChangeText={(v) => set('vehicleType', v)}
              placeholder="e.g. motorcycle, car, van, truck"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
              editable={!submitting}
            />

            <Text style={fs.label}>Start Date * (YYYY-MM-DD)</Text>
            <TextInput
              style={fs.input}
              value={form.startDate}
              onChangeText={(v) => set('startDate', v)}
              placeholder="e.g. 2026-07-15"
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
              editable={!submitting}
            />

            <Text style={fs.label}>Days Needed *</Text>
            <TextInput
              style={fs.input}
              value={form.estimatedDays}
              onChangeText={(v) => set('estimatedDays', v.replace(/[^0-9]/g, '') || '1')}
              placeholder="1"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="next"
              editable={!submitting}
            />

            <Text style={fs.label}>Purpose / Use Case *</Text>
            <TextInput
              style={[fs.input, fs.inputMulti]}
              value={form.useCase}
              onChangeText={(v) => set('useCase', v)}
              placeholder="Describe how you will use the vehicle"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="next"
              editable={!submitting}
            />

            <Text style={fs.label}>Pickup Location *</Text>
            <TextInput
              style={fs.input}
              value={form.pickupLocation}
              onChangeText={(v) => set('pickupLocation', v)}
              placeholder="Where should the vehicle be picked up?"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              editable={!submitting}
            />

            <View style={fs.btnRow}>
              <TouchableOpacity style={fs.cancelBtn} onPress={onClose} disabled={submitting}>
                <Text style={fs.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[fs.submitBtn, !canSubmit && { opacity: 0.45 }]}
                onPress={() => { if (canSubmit) onSubmit(form); }}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={fs.submitText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function VehicleRentalScreen(_props: VehicleRentalScreenProps) {
  const { driverRow, user } = useAuth();

  const [requests,   setRequests]   = useState<RentalProgramRequest[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const eligibility = driverRow
    ? checkEligibility(driverRow.approval_status, driverRow.enforcement_status)
    : { eligible: false, reason: 'Driver profile not loaded.' };

  const loadRequests = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const { requests: reqs, error: err } = await listMyRentalRequests(user.id);
    setError(err);
    setRequests(reqs);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadRequests().finally(() => setRefreshing(false));
  }, [loadRequests]);

  const handleSubmit = useCallback(
    async (form: FormState) => {
      if (!user?.id || !driverRow?.id) return;
      setSubmitting(true);
      const days = Math.max(1, parseInt(form.estimatedDays, 10) || 1);
      const { error: err } = await submitRentalRequest(user.id, driverRow.id, {
        requestedVehicleType: form.vehicleType,
        useCase:              form.useCase,
        requestedStartAt:     form.startDate,
        estimatedDays:        days,
        pickupLocation:       form.pickupLocation || undefined,
      });
      setSubmitting(false);
      if (err) { Alert.alert('Error', err); return; }
      setShowForm(false);
      Alert.alert(
        'Request Submitted',
        'Your vehicle rental request has been submitted. Xperts will review it shortly.',
      );
      void loadRequests();
    },
    [user?.id, driverRow?.id, loadRequests],
  );

  return (
    <View style={vs.container}>
      <FlatList
        data={requests}
        keyExtractor={(r) => r.id}
        contentContainerStyle={vs.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />
        }
        ListHeaderComponent={(
          <>
            {/* Eligibility card */}
            <View style={[
              vs.eligCard,
              { borderColor: eligibility.eligible ? colors.successBorder : colors.dangerBorder },
            ]}>
              <Text style={vs.eligHeading}>Eligibility Status</Text>
              <View style={[
                vs.eligBadge,
                { backgroundColor: eligibility.eligible ? colors.successSurface : colors.dangerSurface },
              ]}>
                <Text style={[
                  vs.eligBadgeText,
                  { color: eligibility.eligible ? '#166534' : '#991B1B' },
                ]}>
                  {eligibility.eligible ? 'Eligible' : 'Not Eligible'}
                </Text>
              </View>
              {!eligibility.eligible && eligibility.reason ? (
                <Text style={vs.eligReason}>{eligibility.reason}</Text>
              ) : null}
              {eligibility.eligible ? (
                <TouchableOpacity
                  style={vs.requestBtn}
                  onPress={() => setShowForm(true)}
                  activeOpacity={0.85}
                >
                  <Text style={vs.requestBtnText}>+ Submit a Request</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={vs.sectionTitle}>My Requests</Text>
            {loading ? <ActivityIndicator style={{ marginVertical: 24 }} color={colors.brand} /> : null}
            {error && !loading ? (
              <View style={vs.errorBox}>
                <Text style={vs.errorText}>{error}</Text>
                <TouchableOpacity style={vs.retryBtn} onPress={() => void loadRequests()}>
                  <Text style={vs.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={vs.emptyText}>No rental requests yet.{'\n'}Submit one above if you are eligible.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const statusLabel = STATUS_LABELS[item.status] ?? item.status;
          const statusColor = STATUS_COLORS[item.status] ?? { bg: '#F1F5F9', text: '#475569' };
          return (
            <View style={vs.card}>
              <View style={vs.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={vs.cardTitle}>
                    {item.requested_vehicle_type ?? 'Vehicle Request'}
                  </Text>
                  {item.use_case ? (
                    <Text style={vs.cardSub} numberOfLines={2}>{item.use_case}</Text>
                  ) : null}
                </View>
                <View style={[vs.statusBadge, { backgroundColor: statusColor.bg }]}>
                  <Text style={[vs.statusBadgeText, { color: statusColor.text }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
              <View style={vs.cardMeta}>
                {item.requested_start_at ? (
                  <Text style={vs.metaText}>
                    Start: {new Date(item.requested_start_at).toLocaleDateString()}
                  </Text>
                ) : null}
                <Text style={vs.metaText}>
                  {item.estimated_days} day{item.estimated_days !== 1 ? 's' : ''}
                </Text>
                {item.pickup_location ? (
                  <Text style={vs.metaText}>Pickup: {item.pickup_location}</Text>
                ) : null}
              </View>
              {item.rejection_reason ? (
                <Text style={vs.rejectionNote}>{item.rejection_reason}</Text>
              ) : null}
              {item.provider_notes ? (
                <Text style={vs.providerNote}>{item.provider_notes}</Text>
              ) : null}
              <Text style={vs.dateText}>
                Submitted {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          );
        }}
      />

      <RequestModal
        visible={showForm}
        submitting={submitting}
        onSubmit={(form) => void handleSubmit(form)}
        onClose={() => { if (!submitting) setShowForm(false); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const vs = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list:      { padding: 16, gap: 10 },

  // Eligibility card
  eligCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 4,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  eligHeading:      { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },
  eligBadge:        { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 8 },
  eligBadgeText:    { fontSize: 13, fontWeight: '800' },
  eligReason:       { fontSize: 13, color: colors.textSecondary, fontWeight: '500', lineHeight: 19 },
  requestBtn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  requestBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 8,
  },

  // Error state
  errorBox:  { backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 14, marginBottom: 4 },
  errorText: { fontSize: 13, color: colors.danger, fontWeight: '600', marginBottom: 10 },
  retryBtn:  { backgroundColor: colors.dangerBorder, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' },
  retryText: { fontSize: 12, fontWeight: '800', color: colors.danger },

  // Empty
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, paddingVertical: 8 },

  // Request cards
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  cardSub:        { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  cardMeta:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  metaText:       { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText:{ fontSize: 11, fontWeight: '700' },
  rejectionNote:  { fontSize: 12, color: colors.danger, fontWeight: '600', marginTop: 8, lineHeight: 17 },
  providerNote:   { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginTop: 6, lineHeight: 17 },
  dateText:       { fontSize: 11, color: colors.textMuted, fontWeight: '500', marginTop: 8 },
});

// ── Request form modal styles ──────────────────────────────────────────────────

const fs = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(13,27,46,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    maxHeight: '90%',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    marginBottom: 16,
  },
  inputMulti: {
    minHeight: 80,
    paddingTop: 12,
  },
  btnRow:    { flexDirection: 'row', gap: 12, marginTop: 6 },
  cancelBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  cancelText:{ fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  submitBtn: { flex: 1, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  submitText:{ fontSize: 14, fontWeight: '800', color: '#fff' },
});
