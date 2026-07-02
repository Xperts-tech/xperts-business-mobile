import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { getBusinessRoleLabel } from '@/constants/permissions';
import { colors } from '@/constants/colors';
import type { StaffRole } from '@/types/permissions';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

// ── Row component ─────────────────────────────────────────────────────────────

function MoreRow({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger, disabled && styles.rowLabelDisabled]}>
        {label}
      </Text>
      {!disabled && <Text style={styles.rowChevron}>›</Text>}
      {disabled && <Text style={styles.rowComingSoon}>Soon</Text>}
    </TouchableOpacity>
  );
}

function MoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { profile, isAdmin, signOut } = useAuth();
  const { selectedBusiness, effectiveRole, isOwner, hasPermission } = useBusiness();

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  const roleLabel = isAdmin ? 'Admin' : getBusinessRoleLabel(effectiveRole as StaffRole);
  const canViewStaff = isOwner || isAdmin || hasPermission('staff.view');
  const canViewPayouts = isOwner || isAdmin || hasPermission('payouts.view');
  const canViewSpecials = isOwner || isAdmin || hasPermission('specials.view');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ─────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {(profile?.full_name ?? 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {profile?.full_name ?? 'Business User'}
            </Text>
            <Text style={styles.profileBiz} numberOfLines={1}>
              {selectedBusiness?.name ?? 'No business'}
            </Text>
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* ── Store ────────────────────────────────────────────────── */}
        <MoreSection title="Store">
          <MoreRow
            icon="🏪"
            label="Store Profile"
            onPress={() => navigation.navigate('StoreProfile')}
          />
          <MoreRow
            icon="🕐"
            label="Availability &amp; Hours"
            onPress={() => navigation.navigate('StoreProfile')}
          />
          {canViewSpecials && (
            <MoreRow
              icon="✨"
              label="Daily Specials"
              onPress={() => navigation.navigate('Specials')}
            />
          )}
        </MoreSection>

        {/* ── Team ─────────────────────────────────────────────────── */}
        {canViewStaff && (
          <MoreSection title="Team">
            <MoreRow
              icon="👥"
              label="Staff"
              onPress={() => navigation.navigate('Staff')}
            />
          </MoreSection>
        )}

        {/* ── Finance ──────────────────────────────────────────────── */}
        {canViewPayouts && (
          <MoreSection title="Finance">
            <MoreRow
              icon="💰"
              label="Payouts"
              onPress={() => navigation.navigate('Payouts')}
            />
          </MoreSection>
        )}

        {/* ── Tools ────────────────────────────────────────────────── */}
        <MoreSection title="Tools">
          <MoreRow
            icon="🪙"
            label="Xperts Coins"
            onPress={() => navigation.navigate('Coins')}
          />
          <MoreRow
            icon="🛒"
            label="Xperts Shop"
            onPress={() => navigation.navigate('Shop')}
          />
          <MoreRow
            icon="🛠️"
            label="Xperts Services"
            onPress={() => navigation.navigate('ServicesPortal')}
          />
          <MoreRow
            icon="📋"
            label="Launch Checklist"
            onPress={() => navigation.navigate('LaunchChecklist')}
          />
          {(isOwner || hasPermission('upload_studio.view')) && (
            <MoreRow
              icon="📷"
              label="Upload Studio"
              onPress={() => navigation.navigate('UploadStudio')}
            />
          )}
        </MoreSection>

        {/* ── Support ──────────────────────────────────────────────── */}
        <MoreSection title="Support &amp; Settings">
          <MoreRow
            icon="🔔"
            label="Notifications"
            onPress={() => navigation.navigate('Notifications')}
          />
          <MoreRow
            icon="💬"
            label="Support"
            onPress={() => navigation.navigate('Support')}
          />
          <MoreRow icon="⚙️" label="Settings" disabled />
          <MoreRow icon="🚪" label="Sign Out" onPress={handleSignOut} danger />
        </MoreSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.brand, paddingHorizontal: 20, paddingVertical: 18 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  profileCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 18, flexDirection: 'row',
    alignItems: 'center', gap: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 20,
  },
  profileAvatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  profileBiz: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  roleChip: {
    alignSelf: 'flex-start', backgroundColor: colors.brandSurface,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  roleChipText: { fontSize: 11, fontWeight: '700', color: colors.brand, letterSpacing: 0.3 },

  section: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2,
  },
  sectionCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  rowDisabled: { opacity: 0.55 },
  rowIcon: { fontSize: 20, marginRight: 14, width: 26, textAlign: 'center' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowLabelDanger: { color: colors.danger },
  rowLabelDisabled: { color: colors.textSecondary },
  rowChevron: { fontSize: 18, color: colors.textMuted, fontWeight: '300' },
  rowComingSoon: {
    fontSize: 10, fontWeight: '700', color: colors.textMuted, backgroundColor: colors.bg,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
});
