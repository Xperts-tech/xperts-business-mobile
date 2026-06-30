import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

type StatusKind =
  | 'no_driver_row'
  | 'info_needed'
  | 'submitted'
  | 'pending'
  | 'rejected'
  | 'suspended';

function resolveStatusKind(
  approvalStatus: string | null | undefined,
  enforcementStatus: string | null | undefined,
  metadata: Record<string, unknown>,
  moreInfoRequestedAt: string | null | undefined,
): StatusKind {
  if ((enforcementStatus ?? '').toLowerCase() === 'suspended') return 'suspended';
  if ((approvalStatus ?? '').toLowerCase() === 'rejected') return 'rejected';
  if (moreInfoRequestedAt) return 'info_needed';
  const hasSubmitted =
    metadata?.onboarding_status === 'submitted' && Boolean(metadata?.onboarding_submitted_at);
  if (hasSubmitted) return 'submitted';
  return 'pending';
}

const STATUS_CONFIG: Record<
  StatusKind,
  { icon: string; iconColor: string; iconBg: string; title: string }
> = {
  no_driver_row: {
    icon: '⏳',
    iconColor: colors.warning,
    iconBg: colors.warningSurface,
    title: 'Setting Up Your Profile',
  },
  pending: {
    icon: '📋',
    iconColor: colors.brand,
    iconBg: colors.brandSurface,
    title: 'Application Received',
  },
  submitted: {
    icon: '🔍',
    iconColor: colors.info,
    iconBg: '#EFF8FF',
    title: 'Application Under Review',
  },
  info_needed: {
    icon: '📎',
    iconColor: colors.warning,
    iconBg: colors.warningSurface,
    title: 'Additional Information Needed',
  },
  rejected: {
    icon: '✕',
    iconColor: colors.danger,
    iconBg: colors.dangerSurface,
    title: 'Application Not Approved',
  },
  suspended: {
    icon: '⚠',
    iconColor: colors.danger,
    iconBg: colors.dangerSurface,
    title: 'Account Suspended',
  },
};

export default function ApplicationStatusScreen() {
  const { profile, driverRow, signOut, refreshDriverRow } = useAuth();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshDriverRow();
    setRefreshing(false);
  }

  // ── Derive status ───────────────────────────────────────────────────────────

  let kind: StatusKind;
  if (!driverRow) {
    kind = 'no_driver_row';
  } else {
    kind = resolveStatusKind(
      driverRow.approval_status,
      driverRow.enforcement_status,
      driverRow.metadata ?? {},
      driverRow.more_info_requested_at,
    );
  }

  const config = STATUS_CONFIG[kind];

  // ── Body text per status ────────────────────────────────────────────────────

  function renderStatusBody() {
    switch (kind) {
      case 'no_driver_row':
        return (
          <Text style={st.body}>
            Your account has been created. Our team is setting up your driver profile.
            This usually happens within one business day. Check back soon or contact
            Xperts support if you haven't heard back in 48 hours.
          </Text>
        );
      case 'pending':
        return (
          <Text style={st.body}>
            Your application has been received and is awaiting review. Our team will
            assess your profile and documents. This process typically takes 1–3 business
            days. You'll be notified once a decision has been made.
          </Text>
        );
      case 'submitted':
        return (
          <Text style={st.body}>
            Your application is currently being reviewed by our team. We will contact
            you as soon as a decision has been made. Thank you for your patience.
          </Text>
        );
      case 'info_needed':
        return (
          <>
            <Text style={st.body}>
              Our team has requested additional information to complete your application.
            </Text>
            {driverRow?.more_info_notes ? (
              <View style={st.noteCard}>
                <Text style={st.noteCardLabel}>Notes from Xperts:</Text>
                <Text style={st.noteCardText}>{driverRow.more_info_notes}</Text>
              </View>
            ) : null}
            <Text style={st.body}>
              Please contact Xperts support with the requested information to proceed.
            </Text>
          </>
        );
      case 'rejected':
        return (
          <>
            <Text style={st.body}>
              Your driver application was not approved at this time.
            </Text>
            {(driverRow?.rejected_reason || driverRow?.rejection_notes) ? (
              <View style={st.noteCard}>
                <Text style={st.noteCardLabel}>Reason:</Text>
                <Text style={st.noteCardText}>
                  {driverRow?.rejected_reason ?? driverRow?.rejection_notes}
                </Text>
              </View>
            ) : null}
            <Text style={st.body}>
              Please contact Xperts support if you believe this decision was made in
              error or if you would like to reapply.
            </Text>
          </>
        );
      case 'suspended':
        return (
          <>
            <Text style={st.body}>
              Your driver account has been suspended and you cannot access the platform
              at this time.
            </Text>
            {driverRow?.suspension_reason ? (
              <View style={st.noteCard}>
                <Text style={st.noteCardLabel}>Reason:</Text>
                <Text style={st.noteCardText}>{driverRow.suspension_reason}</Text>
              </View>
            ) : null}
            <Text style={st.body}>
              Contact Xperts support to appeal this suspension or to learn more.
            </Text>
          </>
        );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Slim brand bar */}
      <View style={st.topBar}>
        <View style={st.logoMini}>
          <Text style={st.logoMiniText}>X</Text>
        </View>
        <Text style={st.topBarTitle}>XPERTS XPRESS</Text>
      </View>

      <ScrollView
        contentContainerStyle={[st.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status card */}
        <View style={st.card}>
          <View style={[st.iconCircle, { backgroundColor: config.iconBg }]}>
            <Text style={[st.iconText, { color: config.iconColor }]}>{config.icon}</Text>
          </View>

          <Text style={st.cardTitle}>{config.title}</Text>

          {profile?.full_name ? (
            <Text style={st.greeting}>Hi, {profile.full_name.split(' ')[0]}.</Text>
          ) : null}

          <View style={st.bodyWrap}>{renderStatusBody()}</View>
        </View>

        {/* Applicant summary (show for non-rejected/suspended) */}
        {driverRow && kind !== 'rejected' && kind !== 'suspended' ? (
          <View style={st.summaryCard}>
            <Text style={st.summaryTitle}>Your Application Details</Text>
            {[
              { label: 'Service Area', value: driverRow.service_area },
              { label: 'Vehicle Type', value: driverRow.vehicle_type },
              { label: 'License Plate', value: driverRow.vehicle_plate },
            ].map(({ label, value }) =>
              value ? (
                <View key={label} style={st.summaryRow}>
                  <Text style={st.summaryLabel}>{label}</Text>
                  <Text style={st.summaryValue}>{value}</Text>
                </View>
              ) : null,
            )}
            <View style={st.capRow}>
              {[
                { key: 'can_deliver_food' as const, label: 'Food Delivery' },
                { key: 'can_do_errands' as const, label: 'Errands' },
                { key: 'can_do_courier' as const, label: 'Courier' },
              ].map(({ key, label }) =>
                driverRow[key] ? (
                  <View key={key} style={st.capChip}>
                    <Text style={st.capChipText}>{label}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </View>
        ) : null}

        {/* Refresh */}
        {kind !== 'rejected' && kind !== 'suspended' ? (
          <TouchableOpacity
            style={st.refreshBtn}
            onPress={handleRefresh}
            disabled={refreshing}
            activeOpacity={0.8}
          >
            {refreshing ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <Text style={st.refreshBtnText}>Check Application Status</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Sign out */}
        <TouchableOpacity style={st.signOutBtn} onPress={signOut} activeOpacity={0.8}>
          <Text style={st.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={st.footerNote}>
          Need help? Contact Xperts Xpress support to check on your application.
        </Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  logoMini: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMiniText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.brand,
  },
  topBarTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: {
    padding: 20,
    gap: 14,
  },

  // ── Main status card ────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 30,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  greeting: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  bodyWrap: {
    width: '100%',
    gap: 10,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  noteCard: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 14,
    width: '100%',
  },
  noteCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  noteCardText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },

  // ── Summary card ────────────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
    maxWidth: '60%',
    textAlign: 'right',
  },
  capRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  capChip: {
    backgroundColor: colors.brandSurface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  capChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
  },

  // ── Buttons ────────────────────────────────────────────────────────────────
  refreshBtn: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.brand,
    minHeight: 54,
    justifyContent: 'center',
  },
  refreshBtnText: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '800',
  },
  signOutBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  signOutBtnText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footerNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 16,
  },
});
