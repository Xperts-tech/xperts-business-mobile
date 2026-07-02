import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusiness } from '@/contexts/BusinessContext';
import { colors } from '@/constants/colors';
import { getBusinessRoleLabel } from '@/constants/permissions';
import {
  loadStaff,
  getStaffStatusColor,
  getStaffStatusLabel,
  type StaffMember,
} from '@/services/staffService';
import type { StaffRole } from '@/types/permissions';
import type { StaffScreenProps } from '@/types/navigation';

function StaffCard({ member }: { member: StaffMember }) {
  const statusColor = getStaffStatusColor(member.status);
  const statusLabel = getStaffStatusLabel(member.status);
  const roleLabel = getBusinessRoleLabel(member.role as StaffRole);
  const initials = (member.full_name ?? member.email)
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const joinedAt = member.accepted_at
    ? new Date(member.accepted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const inviteExpires = member.invite_expires_at && member.status === 'invited'
    ? new Date(member.invite_expires_at)
    : null;
  const inviteExpired = inviteExpires ? inviteExpires < new Date() : false;

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: colors.brand + '20' }]}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.memberName} numberOfLines={1}>
            {member.full_name ?? member.email}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '45' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {member.full_name && (
          <Text style={styles.memberEmail} numberOfLines={1}>{member.email}</Text>
        )}

        <View style={styles.cardBottomRow}>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{roleLabel}</Text>
          </View>
          {member.store_id && (
            <Text style={styles.storeScopedLabel}>Store-scoped</Text>
          )}
        </View>

        {joinedAt && (
          <Text style={styles.joinedText}>Joined {joinedAt}</Text>
        )}
        {inviteExpired && (
          <Text style={styles.expiredText}>Invite expired</Text>
        )}
        {inviteExpires && !inviteExpired && (
          <Text style={styles.expiresText}>
            Invite expires {inviteExpires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function StaffScreen({ navigation }: StaffScreenProps) {
  const insets = useSafeAreaInsets();
  const { selectedBusinessId, isOwner } = useBusiness();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedBusinessId) return;
    setLoading(true);
    const { staff: rows, error: err } = await loadStaff(selectedBusinessId);
    setStaff(rows);
    setError(err);
    setLoading(false);
  }, [selectedBusinessId]);

  useEffect(() => { void load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const activeCount = staff.filter((s) => s.status === 'active').length;
  const pendingCount = staff.filter((s) => s.status === 'invited' || s.status === 'pending').length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not load staff</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <StaffCard member={item} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          }
          ListHeaderComponent={
            staff.length > 0 ? (
              <View style={styles.summaryRow}>
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryChipText}>{activeCount} active</Text>
                </View>
                {pendingCount > 0 && (
                  <View style={[styles.summaryChip, styles.summaryChipPending]}>
                    <Text style={[styles.summaryChipText, styles.summaryChipTextPending]}>
                      {pendingCount} pending
                    </Text>
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No team members yet</Text>
              <Text style={styles.emptyText}>
                Invite staff and assign roles from the web portal. They will appear here once invited.
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.footerNote}>
          To invite, suspend, or remove staff, use the web portal.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { width: 70 },
  backBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', flex: 1, textAlign: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  summaryChip: {
    backgroundColor: colors.success + '15', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.success + '40',
  },
  summaryChipPending: { backgroundColor: colors.warning + '15', borderColor: colors.warning + '40' },
  summaryChipText: { fontSize: 12, fontWeight: '700', color: colors.success },
  summaryChipTextPending: { color: colors.warning },

  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    flexDirection: 'row', gap: 14, borderWidth: 1, borderColor: colors.border,
  },
  cardLeft: {},
  cardBody: { flex: 1, gap: 6 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  avatar: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: colors.brand },

  memberName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  memberEmail: { fontSize: 12, color: colors.textSecondary },

  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  roleChip: {
    backgroundColor: colors.brandSurface, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.brand + '30',
  },
  roleChipText: { fontSize: 11, fontWeight: '700', color: colors.brand },

  storeScopedLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  joinedText: { fontSize: 11, color: colors.textMuted },
  expiredText: { fontSize: 11, color: colors.danger, fontWeight: '600' },
  expiresText: { fontSize: 11, color: colors.warning, fontWeight: '600' },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 60, gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    marginTop: 8, backgroundColor: colors.brand, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  footer: {
    backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  footerNote: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
