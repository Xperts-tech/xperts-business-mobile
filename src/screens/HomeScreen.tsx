import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { useBusiness } from '@/contexts/BusinessContext';
import { getBusinessRoleLabel } from '@/constants/permissions';
import { colors } from '@/constants/colors';
import {
  loadHomeDashboard,
  type HomeDashboardData,
} from '@/services/businessDashboardService';
import {
  getStoreOpenStatus,
  setStoreOpenStatus,
  type StoreOpenStatus,
} from '@/services/businessStoreService';
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime';
import type { StaffRole } from '@/types/permissions';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BusinessStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<BusinessStackParamList>;

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  urgent,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  urgent?: boolean;
}) {
  const accentColor = accent ?? colors.border;
  return (
    <View
      style={[
        styles.statCard,
        urgent && styles.statCardUrgent,
        { borderLeftColor: accentColor, borderLeftWidth: 3 },
      ]}
    >
      <Text style={styles.statIcon}>{icon}</Text>
      <View style={styles.statBody}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statValue, urgent && styles.statValueUrgent]}>
          {value}
        </Text>
        {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function ReadinessBar({ pct }: { pct: number }) {
  const barColor =
    pct >= 100 ? colors.success : pct >= 60 ? colors.warning : colors.danger;

  const label =
    pct >= 100
      ? 'Ready for review'
      : pct >= 80
        ? 'Almost ready'
        : pct >= 40
          ? 'Making progress'
          : 'Getting started';

  return (
    <View style={styles.readinessCard}>
      <View style={styles.readinessHeader}>
        <Text style={styles.readinessTitle}>Launch Readiness</Text>
        <Text style={[styles.readinessPct, { color: barColor }]}>{pct}%</Text>
      </View>
      <View style={styles.readinessTrack}>
        <View style={[styles.readinessFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.readinessLabel}>{label}</Text>
    </View>
  );
}

function StoreStatusCard({
  status,
  storeName,
  toggling,
  canToggle,
  onToggle,
}: {
  status: StoreOpenStatus;
  storeName: string;
  toggling: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  const isOpen = status !== 'paused';
  const statusColor = isOpen ? colors.success : colors.warning;
  const statusLabel = isOpen ? 'Open' : 'Paused';

  return (
    <View style={[styles.storeStatusCard, { borderLeftColor: statusColor, borderLeftWidth: 3 }]}>
      <View style={styles.storeStatusLeft}>
        <View style={[styles.storeStatusDot, { backgroundColor: statusColor }]} />
        <View>
          <Text style={styles.storeStatusName} numberOfLines={1}>{storeName}</Text>
          <Text style={[styles.storeStatusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      {canToggle && (
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            isOpen ? styles.toggleBtnPause : styles.toggleBtnOpen,
            toggling && styles.toggleBtnDisabled,
          ]}
          onPress={onToggle}
          disabled={toggling}
          activeOpacity={0.8}
        >
          {toggling ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.toggleBtnText}>
              {isOpen ? 'Pause store' : 'Open store'}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { profile, isAdmin } = useAuth();
  const {
    selectedBusiness,
    selectedStore,
    selectedStoreId,
    businesses,
    loading: bizLoading,
    effectiveRole,
    isOwner,
    refreshBusinessContext,
  } = useBusiness();

  const [dashData, setDashData] = useState<HomeDashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const greeting = profile?.full_name
    ? `Hi, ${profile.full_name.split(' ')[0]}`
    : 'Welcome back';

  const roleLabel = isAdmin
    ? 'Admin'
    : getBusinessRoleLabel(effectiveRole as StaffRole);

  const hasMultipleBusinesses = businesses.length > 1;

  // ── Data load ─────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    if (!selectedBusiness?.id && !selectedStoreId) return;
    setDashLoading(true);
    try {
      const data = await loadHomeDashboard(
        { businessId: selectedBusiness?.id ?? null, storeId: selectedStoreId },
        selectedStore,
      );
      setDashData(data);
    } catch {
      // non-fatal — dashboard shows last good data or zeros
    } finally {
      setDashLoading(false);
    }
  }, [selectedBusiness?.id, selectedStoreId, selectedStore]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Live updates — new/changed orders refresh the home dashboard counts.
  useOrdersRealtime({ businessId: selectedBusiness?.id ?? null, storeId: selectedStoreId }, () => {
    void loadDashboard();
  });

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refreshBusinessContext(), loadDashboard()]);
    setRefreshing(false);
  }

  // ── Store status toggle ──────────────────────────────────────────────────

  const storeOpenStatus = getStoreOpenStatus(
    (selectedStore?.metadata as Record<string, unknown> | null) ?? null,
  );

  async function handleToggleStatus() {
    if (!selectedStoreId) return;
    const next = storeOpenStatus === 'paused' ? 'open' : 'paused';
    setToggling(true);
    setToggleError(null);
    const { error } = await setStoreOpenStatus(selectedStoreId, next);
    if (error) {
      setToggleError(error);
    } else {
      await refreshBusinessContext();
    }
    setToggling(false);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const noStore = !bizLoading && !selectedStoreId;
  const showDash = Boolean(selectedStoreId);

  const d = dashData ?? {
    todayOrdersCount: 0,
    activeOrdersCount: 0,
    needsActionCount: 0,
    itemIssuesCount: 0,
    messageThreadsCount: 0,
    productCount: 0,
    setupReadiness: 0,
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={hasMultipleBusinesses ? () => navigation.navigate('BusinessSelector') : undefined}
          activeOpacity={hasMultipleBusinesses ? 0.7 : 1}
          disabled={!hasMultipleBusinesses}
        >
          <Text style={styles.headerGreeting}>{greeting}</Text>
          <View style={styles.headerBizRow}>
            <Text style={styles.headerBiz} numberOfLines={1}>
              {bizLoading ? 'Loading…' : (selectedBusiness?.name ?? 'No business')}
            </Text>
            {hasMultipleBusinesses && (
              <Text style={styles.headerChevron}> ›</Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.roleChip}>
          <Text style={styles.roleChipText}>{roleLabel}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        {/* ── No store state ──────────────────────────────────────── */}
        {noStore && (
          <View style={styles.noStoreCard}>
            <Text style={styles.noStoreIcon}>🏪</Text>
            <Text style={styles.noStoreTitle}>No store set up yet</Text>
            <Text style={styles.noStoreText}>
              Complete your store setup in the web portal to unlock your dashboard.
            </Text>
          </View>
        )}

        {/* ── Store status card ───────────────────────────────────── */}
        {showDash && selectedStore && (
          <StoreStatusCard
            status={storeOpenStatus}
            storeName={selectedStore.name}
            toggling={toggling}
            canToggle={isOwner || isAdmin}
            onToggle={handleToggleStatus}
          />
        )}

        {toggleError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠ {toggleError}</Text>
          </View>
        )}

        {/* ── Dashboard loading ────────────────────────────────────── */}
        {showDash && dashLoading && !dashData && (
          <View style={styles.dashLoading}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.dashLoadingText}>Loading dashboard…</Text>
          </View>
        )}

        {/* ── Today's activity ────────────────────────────────────── */}
        {showDash && (
          <>
            <Text style={styles.sectionLabel}>Today</Text>

            <View style={styles.statsRow}>
              <View style={styles.statsRowHalf}>
                <StatCard
                  icon="📦"
                  label="Orders"
                  value={d.todayOrdersCount}
                  sub="today"
                  accent={colors.brand}
                />
              </View>
              <View style={styles.statsRowHalf}>
                <StatCard
                  icon="⚡"
                  label="Active"
                  value={d.activeOrdersCount}
                  sub="in progress"
                  accent={d.activeOrdersCount > 0 ? colors.info : colors.border}
                />
              </View>
            </View>

            {/* ── Needs attention ─────────────────────────────────── */}
            {d.needsActionCount > 0 && (
              <StatCard
                icon="🔔"
                label="Needs your attention"
                value={`${d.needsActionCount} order${d.needsActionCount === 1 ? '' : 's'}`}
                sub="Pending or waiting for action"
                accent={colors.warning}
                urgent
              />
            )}

            {d.itemIssuesCount > 0 && (
              <StatCard
                icon="⚠️"
                label="Item issues"
                value={`${d.itemIssuesCount} order${d.itemIssuesCount === 1 ? '' : 's'}`}
                sub="Customer waiting for resolution"
                accent={colors.danger}
                urgent
              />
            )}

            {/* ── Messages ────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Messages</Text>
            <StatCard
              icon="💬"
              label="Active conversations"
              value={d.messageThreadsCount > 0 ? d.messageThreadsCount : 'None'}
              sub={d.messageThreadsCount > 0 ? 'Order message threads open' : 'No active message threads'}
              accent={d.messageThreadsCount > 0 ? colors.info : colors.border}
            />

            {/* ── Catalog ─────────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Catalog</Text>
            <StatCard
              icon="🛍️"
              label="Products"
              value={d.productCount}
              sub={d.productCount === 0 ? 'Add products to go live' : 'Products in your catalog'}
              accent={d.productCount > 0 ? colors.success : colors.warning}
              urgent={d.productCount === 0}
            />

            {/* ── Launch readiness ─────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Setup</Text>
            <ReadinessBar pct={d.setupReadiness} />

            {/* ── Quick actions ────────────────────────────────────── */}
            <Text style={styles.sectionLabel}>Quick actions</Text>
            <View style={styles.quickActionsGrid}>
              {(isOwner || isAdmin) && (
                <TouchableOpacity
                  style={styles.quickAction}
                  onPress={handleToggleStatus}
                  disabled={toggling}
                  activeOpacity={0.75}
                >
                  <Text style={styles.quickActionIcon}>
                    {storeOpenStatus === 'paused' ? '▶' : '⏸'}
                  </Text>
                  <Text style={styles.quickActionLabel}>
                    {storeOpenStatus === 'paused' ? 'Open store' : 'Pause store'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.quickAction} activeOpacity={0.75} disabled>
                <Text style={styles.quickActionIcon}>➕</Text>
                <Text style={styles.quickActionLabel}>Add product</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAction}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('Support')}
              >
                <Text style={styles.quickActionIcon}>💬</Text>
                <Text style={styles.quickActionLabel}>Support</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // ── Header
  header: {
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: { flex: 1, marginRight: 12 },
  headerGreeting: { fontSize: 12, color: 'rgba(255,255,255,0.60)', fontWeight: '500', marginBottom: 3 },
  headerBizRow: { flexDirection: 'row', alignItems: 'center' },
  headerBiz: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', flexShrink: 1 },
  headerChevron: { fontSize: 18, color: 'rgba(255,255,255,0.70)', fontWeight: '300' },
  roleChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  roleChipText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  // ── Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // ── Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
  },

  // ── Store status card
  storeStatusCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  storeStatusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  storeStatusDot: { width: 10, height: 10, borderRadius: 5 },
  storeStatusName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, maxWidth: 160 },
  storeStatusLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  toggleBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minWidth: 100, alignItems: 'center' },
  toggleBtnPause: { backgroundColor: colors.warning },
  toggleBtnOpen: { backgroundColor: colors.success },
  toggleBtnDisabled: { opacity: 0.6 },
  toggleBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Error banner
  errorBanner: {
    backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: colors.dangerBorder, marginBottom: 8,
  },
  errorBannerText: { color: colors.danger, fontSize: 13, fontWeight: '500' },

  // ── Dashboard loading
  dashLoading: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  dashLoadingText: { color: colors.textMuted, fontSize: 13 },

  // ── Stats row (2-column grid)
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statsRowHalf: { flex: 1 },

  // ── Stat card
  statCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 0,
  },
  statCardUrgent: { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
  statIcon: { fontSize: 24 },
  statBody: { flex: 1 },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 2 },
  statValueUrgent: { color: colors.warning },
  statSub: { fontSize: 11, color: colors.textSecondary },

  // ── Readiness card
  readinessCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  readinessHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  readinessTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  readinessPct: { fontSize: 20, fontWeight: '900' },
  readinessTrack: {
    height: 8, backgroundColor: colors.borderLight, borderRadius: 4, overflow: 'hidden', marginBottom: 8,
  },
  readinessFill: { height: 8, borderRadius: 4, minWidth: 8 },
  readinessLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },

  // ── Quick actions
  quickActionsGrid: { flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: { fontSize: 22 },
  quickActionLabel: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },

  // ── No store
  noStoreCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 28,
    alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border,
  },
  noStoreIcon: { fontSize: 48 },
  noStoreTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  noStoreText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
});
