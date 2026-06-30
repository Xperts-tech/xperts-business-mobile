import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  getContractRouteDetail,
  updateContractPackageStatus,
  updateContractRouteStatus,
} from '@/services/contractLogisticsService';
import type {
  ContractPackage,
  ContractRoute,
} from '@/types/contract';
import {
  CONTRACT_PACKAGE_STATUS_LABELS,
  CONTRACT_ROUTE_STATUS_LABELS,
} from '@/types/contract';
import type { ContractRunDetailScreenProps } from '@/types/navigation';
import { buildGoogleMapsUrl, buildWazeUrl } from '@/utils/navigationLinks';

// ── Status badge colours ──────────────────────────────────────────────────────

const PKG_STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  delivered:             { bg: colors.successSurface, text: colors.success },
  failed_attempt:        { bg: colors.warningSurface,  text: colors.warning },
  returned_to_xperts:   { bg: '#FEF2F2',              text: '#DC2626' },
  out_for_delivery:     { bg: colors.brandSurface,     text: colors.brand },
  picked_up_by_driver:  { bg: colors.brandSurface,     text: colors.brand },
  assigned_to_driver:   { bg: '#F1F5F9',               text: '#475569' },
  missing:              { bg: '#FEE2E2',               text: '#991B1B' },
};

const ROUTE_STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  in_progress: { bg: colors.brandSurface, text: colors.brand },
  assigned:    { bg: '#F1F5F9',           text: '#475569' },
  picked_up:   { bg: colors.brandSurface, text: colors.brand },
  completed:   { bg: colors.successSurface, text: colors.success },
};

function pkgBadge(status: string) {
  return PKG_STATUS_BADGE[status] ?? { bg: '#F1F5F9', text: '#475569' };
}

function routeBadge(status: string) {
  return ROUTE_STATUS_BADGE[status] ?? { bg: '#F1F5F9', text: '#475569' };
}

function isActionableStatus(status: string) {
  return [
    'assigned_to_driver',
    'picked_up_by_driver',
    'out_for_delivery',
    'offered_to_driver',
    'ready_for_driver',
  ].includes(status);
}

// ── Package card ──────────────────────────────────────────────────────────────

type PackageCardProps = {
  pkg: ContractPackage;
  onMark: (pkg: ContractPackage, status: 'delivered' | 'failed_attempt' | 'returned_to_xperts') => void;
  busy: boolean;
};

function PackageCard({ pkg, onMark, busy }: PackageCardProps) {
  const badge = pkgBadge(pkg.status);
  const actionable = isActionableStatus(pkg.status);
  const mapsUrl = buildGoogleMapsUrl({ address: pkg.delivery_address });
  const wazeUrl = buildWazeUrl({ address: pkg.delivery_address });

  return (
    <View style={st.pkgCard}>
      <View style={st.pkgHeader}>
        <View style={{ flex: 1 }}>
          <Text style={st.pkgName} numberOfLines={1}>
            {pkg.customer_name ?? 'Customer'}
          </Text>
          {pkg.tracking_number ? (
            <Text style={st.pkgTracking}>{pkg.tracking_number}</Text>
          ) : null}
        </View>
        <View style={[st.badge, { backgroundColor: badge.bg }]}>
          <Text style={[st.badgeText, { color: badge.text }]}>
            {CONTRACT_PACKAGE_STATUS_LABELS[pkg.status] ?? pkg.status}
          </Text>
        </View>
      </View>

      {pkg.delivery_address ? (
        <Text style={st.pkgAddress} numberOfLines={2}>{pkg.delivery_address}</Text>
      ) : null}

      {pkg.zone ? <Text style={st.pkgZone}>Zone: {pkg.zone}</Text> : null}

      {(mapsUrl || wazeUrl) && (
        <View style={st.navRow}>
          {mapsUrl ? (
            <TouchableOpacity
              style={st.navBtn}
              onPress={() => Linking.openURL(mapsUrl)}
              accessibilityLabel="Open in Google Maps"
            >
              <Text style={st.navBtnText}>Maps</Text>
            </TouchableOpacity>
          ) : null}
          {wazeUrl ? (
            <TouchableOpacity
              style={[st.navBtn, { backgroundColor: '#00BFFF11', borderColor: '#00BFFF' }]}
              onPress={() => Linking.openURL(wazeUrl)}
              accessibilityLabel="Open in Waze"
            >
              <Text style={[st.navBtnText, { color: '#006FAD' }]}>Waze</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {actionable && (
        <View style={st.actionRow}>
          <TouchableOpacity
            style={[st.actionBtn, { backgroundColor: colors.successSurface, borderColor: colors.successBorder }]}
            onPress={() => onMark(pkg, 'delivered')}
            disabled={busy}
            accessibilityLabel="Mark Delivered"
          >
            <Text style={[st.actionBtnText, { color: colors.success }]}>Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder }]}
            onPress={() => onMark(pkg, 'failed_attempt')}
            disabled={busy}
            accessibilityLabel="Mark Failed Attempt"
          >
            <Text style={[st.actionBtnText, { color: colors.warning }]}>Failed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder }]}
            onPress={() => onMark(pkg, 'returned_to_xperts')}
            disabled={busy}
            accessibilityLabel="Mark Returned"
          >
            <Text style={[st.actionBtnText, { color: colors.danger }]}>Return</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ContractRunDetailScreen({ route, navigation }: ContractRunDetailScreenProps) {
  const { routeId, driverId } = route.params;
  const { driverRow } = useAuth();

  const [run, setRun] = useState<ContractRoute | null>(null);
  const [packages, setPackages] = useState<ContractPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPkg, setBusyPkg] = useState<string | null>(null);
  const [busyRoute, setBusyRoute] = useState(false);

  const isOwner = driverRow?.id === driverId;

  const load = useCallback(async () => {
    const res = await getContractRouteDetail(routeId);
    if (res.ok) {
      setRun(res.data.route);
      setPackages(res.data.packages);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [routeId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleStartRoute = useCallback(async () => {
    if (!run || !isOwner) return;
    setBusyRoute(true);
    const res = await updateContractRouteStatus(routeId, 'in_progress');
    if (res.ok) {
      setRun(res.data);
    } else {
      Alert.alert('Error', res.error);
    }
    setBusyRoute(false);
  }, [run, isOwner, routeId]);

  const handleCompleteRoute = useCallback(async () => {
    if (!run || !isOwner) return;

    const remaining = packages.filter((p) =>
      isActionableStatus(p.status)
    ).length;

    if (remaining > 0) {
      Alert.alert(
        'Packages outstanding',
        `${remaining} package${remaining === 1 ? '' : 's'} still need a status update. Complete all packages before marking the run complete.`
      );
      return;
    }

    Alert.alert('Complete run?', 'This will mark the run as completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        style: 'default',
        onPress: async () => {
          setBusyRoute(true);
          const res = await updateContractRouteStatus(routeId, 'completed');
          if (res.ok) {
            setRun(res.data);
            navigation.goBack();
          } else {
            Alert.alert('Error', res.error);
          }
          setBusyRoute(false);
        },
      },
    ]);
  }, [run, isOwner, routeId, packages, navigation]);

  const handleMarkPackage = useCallback(
    async (
      pkg: ContractPackage,
      status: 'delivered' | 'failed_attempt' | 'returned_to_xperts'
    ) => {
      if (!isOwner) return;
      setBusyPkg(pkg.id);

      let failureReason: string | undefined;
      if (status === 'failed_attempt') {
        await new Promise<void>((resolve) => {
          Alert.prompt(
            'Failure reason',
            'Briefly describe why delivery failed (optional)',
            (text) => {
              failureReason = text ?? undefined;
              resolve();
            },
            'plain-text',
            '',
            'default'
          );
        });
      }

      const res = await updateContractPackageStatus(pkg.id, {
        status,
        failure_reason: failureReason ?? null,
      });

      if (res.ok) {
        setPackages((prev) =>
          prev.map((p) => (p.id === pkg.id ? (res.data as ContractPackage) : p))
        );
      } else {
        Alert.alert('Error', res.error);
      }
      setBusyPkg(null);
    },
    [isOwner]
  );

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (error || !run) {
    return (
      <View style={st.center}>
        <Text style={st.errorText}>{error ?? 'Run not found.'}</Text>
        <TouchableOpacity onPress={() => void load()} style={st.retryBtn}>
          <Text style={st.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badge = routeBadge(run.status);
  const canStart = isOwner && run.status === 'assigned';
  const canComplete = isOwner && run.status === 'in_progress';

  const delivered = packages.filter((p) => p.status === 'delivered').length;
  const failed = packages.filter((p) => p.status === 'failed_attempt').length;
  const pending = packages.filter((p) => isActionableStatus(p.status)).length;

  return (
    <View style={st.container}>
      {/* Route header */}
      <View style={st.routeCard}>
        <View style={st.routeHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.routeTitle}>{run.title}</Text>
            {run.batch?.batch_code ? (
              <Text style={st.batchRef}>{run.batch.batch_code} · {run.batch?.title}</Text>
            ) : null}
          </View>
          <View style={[st.badge, { backgroundColor: badge.bg }]}>
            <Text style={[st.badgeText, { color: badge.text }]}>
              {CONTRACT_ROUTE_STATUS_LABELS[run.status] ?? run.status}
            </Text>
          </View>
        </View>

        <View style={st.statsRow}>
          {run.zone ? <Text style={st.stat}>Zone: {run.zone}</Text> : null}
          <Text style={st.stat}>{run.package_count} pkg{run.package_count !== 1 ? 's' : ''}</Text>
          {run.estimated_earnings > 0 ? (
            <Text style={st.stat}>Est. JMD {Number(run.estimated_earnings).toLocaleString()}</Text>
          ) : null}
        </View>

        <View style={st.progressRow}>
          <Text style={[st.progressBit, { color: colors.success }]}>{delivered} delivered</Text>
          <Text style={[st.progressBit, { color: colors.warning }]}>{failed} failed</Text>
          <Text style={[st.progressBit, { color: colors.textSecondary }]}>{pending} pending</Text>
        </View>

        {(canStart || canComplete) && (
          <View style={st.routeActionRow}>
            {canStart && (
              <TouchableOpacity
                style={[st.routeActionBtn, { backgroundColor: colors.brand }]}
                onPress={() => void handleStartRoute()}
                disabled={busyRoute}
              >
                {busyRoute ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={st.routeActionBtnText}>Start Run</Text>
                )}
              </TouchableOpacity>
            )}
            {canComplete && (
              <TouchableOpacity
                style={[st.routeActionBtn, { backgroundColor: colors.success }]}
                onPress={() => void handleCompleteRoute()}
                disabled={busyRoute}
              >
                {busyRoute ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={st.routeActionBtnText}>Complete Run</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Package list */}
      <FlatList
        data={packages}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand} />}
        contentContainerStyle={packages.length === 0 ? st.emptyContainer : { padding: 12, gap: 10 }}
        ListHeaderComponent={
          <Text style={st.sectionLabel}>
            Packages ({packages.length})
          </Text>
        }
        ListEmptyComponent={
          <Text style={st.emptyText}>No packages found for this run.</Text>
        }
        renderItem={({ item }) => (
          <PackageCard
            pkg={item}
            onMark={(pkg, status) => void handleMarkPackage(pkg, status)}
            busy={busyPkg === item.id}
          />
        )}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  routeCard: {
    backgroundColor: colors.card,
    margin: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  routeHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  routeTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, lineHeight: 22 },
  batchRef: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  stat: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  progressRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  progressBit: { fontSize: 13, fontWeight: '700' },
  routeActionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  routeActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  routeActionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },

  pkgCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pkgHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  pkgName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  pkgTracking: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  pkgAddress: { fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  pkgZone: { fontSize: 12, color: colors.textMuted, marginTop: 3 },

  navRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: `${colors.brand}11`,
    borderWidth: 1,
    borderColor: `${colors.brand}44`,
  },
  navBtnText: { fontSize: 13, fontWeight: '700', color: colors.brand },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: '800' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  errorText: { fontSize: 15, color: colors.danger, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
