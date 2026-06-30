import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  confirmContractHandoff,
  getAvailableContractRoutes,
  getLeadAssignedBatches,
  getLeadAssignedRentals,
  getMyContractEarnings,
  getMyContractHandoffs,
  getMyContractRoles,
  getMyContractRuns,
  punchInRental,
  punchOutRental,
  requestContractRoute,
} from '@/services/contractLogisticsService';
import type {
  ContractBatch,
  ContractEarnings,
  ContractHandoff,
  ContractRental,
  ContractRoute,
} from '@/types/contract';
import {
  CONTRACT_EARNINGS_STATUS_LABELS,
  CONTRACT_HANDOFF_STATUS_LABELS,
  CONTRACT_ROUTE_STATUS_LABELS,
} from '@/types/contract';
import type { ContractRunsScreenProps, DriverStackParamList } from '@/types/navigation';

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabKey = 'available' | 'my_runs' | 'handoffs' | 'earnings' | 'lead';

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'my_runs',   label: 'My Runs' },
  { key: 'handoffs',  label: 'Handoffs' },
  { key: 'earnings',  label: 'Earnings' },
];

// ── Status colours ────────────────────────────────────────────────────────────

const ROUTE_BADGE: Record<string, { bg: string; text: string }> = {
  available:    { bg: colors.brandSurface,   text: colors.brand },
  assigned:     { bg: '#F1F5F9',             text: '#475569' },
  requested:    { bg: colors.warningSurface, text: colors.warning },
  picked_up:    { bg: colors.brandSurface,   text: colors.brand },
  in_progress:  { bg: colors.brandSurface,   text: colors.brand },
  completed:    { bg: colors.successSurface, text: colors.success },
};

const EARNINGS_BADGE: Record<string, { bg: string; text: string }> = {
  pending:    { bg: '#F1F5F9',             text: '#475569' },
  calculated: { bg: colors.brandSurface,   text: colors.brand },
  approved:   { bg: colors.successSurface, text: colors.success },
  paid:       { bg: colors.successSurface, text: colors.success },
  disputed:   { bg: colors.warningSurface, text: colors.warning },
};

function routeBadge(s: string) { return ROUTE_BADGE[s] ?? { bg: '#F1F5F9', text: '#475569' }; }
function earningsBadge(s: string) { return EARNINGS_BADGE[s] ?? { bg: '#F1F5F9', text: '#475569' }; }
function handoffBadge(s: string) {
  if (s === 'confirmed') return { bg: colors.successSurface, text: colors.success };
  if (s === 'pending')   return { bg: colors.warningSurface, text: colors.warning };
  return { bg: '#F1F5F9', text: '#475569' };
}

// ── Shared empty / error components ──────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <View style={st.emptyWrap}>
      <Text style={st.emptyText}>{text}</Text>
    </View>
  );
}

function ErrorRow({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <View style={st.emptyWrap}>
      <Text style={st.errorText}>{msg}</Text>
      <TouchableOpacity style={st.retryBtn} onPress={onRetry}>
        <Text style={st.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Available tab ─────────────────────────────────────────────────────────────

type AvailableTabProps = {
  driverId: string;
  refreshing: boolean;
  onRefresh: () => void;
};

function AvailableTab({ driverId, refreshing, onRefresh }: AvailableTabProps) {
  const [routes, setRoutes] = useState<ContractRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getAvailableContractRoutes();
    if (res.ok) { setRoutes(res.data); setError(null); }
    else setError(res.error);
  }, []);

  useEffect(() => {
    void (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  useEffect(() => {
    if (refreshing) void load();
  }, [refreshing, load]);

  const handleClaim = useCallback(async (route: ContractRoute) => {
    const verb = route.requires_admin_approval ? 'Request' : 'Claim';
    Alert.alert(
      `${verb} drop-off?`,
      route.title + (route.zone ? ` · Zone ${route.zone}` : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          onPress: async () => {
            setBusyId(route.id);
            const res = await requestContractRoute(route.id, driverId);
            if (res.ok) {
              const msg = res.data.claimed
                ? 'You have been assigned to this run.'
                : 'Your request has been submitted. An admin will approve shortly.';
              Alert.alert('Success', msg);
              void load();
            } else {
              Alert.alert('Error', res.error);
            }
            setBusyId(null);
          },
        },
      ]
    );
  }, [driverId, load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;
  if (error) return <ErrorRow msg={error} onRetry={() => void load()} />;

  return (
    <FlatList
      data={routes}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={routes.length === 0 ? st.emptyList : st.list}
      ListEmptyComponent={<Empty text="No drop-offs available right now." />}
      renderItem={({ item }) => {
        const badge = routeBadge(item.status);
        const isBusy = busyId === item.id;
        return (
          <View style={st.card}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>{item.title}</Text>
                {item.batch?.batch_code ? (
                  <Text style={st.cardSub}>{item.batch.batch_code} · {item.batch.title}</Text>
                ) : null}
              </View>
              <View style={[st.badge, { backgroundColor: badge.bg }]}>
                <Text style={[st.badgeText, { color: badge.text }]}>
                  {CONTRACT_ROUTE_STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <View style={st.cardMeta}>
              {item.zone ? <Text style={st.metaText}>Zone: {item.zone}</Text> : null}
              <Text style={st.metaText}>{item.package_count} pkgs</Text>
              {item.estimated_earnings > 0 ? (
                <Text style={st.metaText}>Est. JMD {Number(item.estimated_earnings).toLocaleString()}</Text>
              ) : null}
              {item.requires_admin_approval ? (
                <Text style={[st.metaText, { color: colors.warning }]}>Requires approval</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[st.claimBtn, isBusy && { opacity: 0.6 }]}
              onPress={() => void handleClaim(item)}
              disabled={isBusy}
            >
              {isBusy
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.claimBtnText}>
                    {item.requires_admin_approval ? 'Request Run' : 'Claim Run'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}

// ── My Runs tab ───────────────────────────────────────────────────────────────

type MyRunsTabProps = {
  driverId: string;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenRun: (routeId: string) => void;
};

function MyRunsTab({ driverId, refreshing, onRefresh, onOpenRun }: MyRunsTabProps) {
  const [runs, setRuns] = useState<ContractRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getMyContractRuns(driverId);
    if (res.ok) { setRuns(res.data); setError(null); }
    else setError(res.error);
  }, [driverId]);

  useEffect(() => {
    void (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  useEffect(() => {
    if (refreshing) void load();
  }, [refreshing, load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;
  if (error) return <ErrorRow msg={error} onRetry={() => void load()} />;

  return (
    <FlatList
      data={runs}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={runs.length === 0 ? st.emptyList : st.list}
      ListEmptyComponent={<Empty text="No active runs assigned to you." />}
      renderItem={({ item }) => {
        const badge = routeBadge(item.status);
        return (
          <TouchableOpacity style={st.card} onPress={() => onOpenRun(item.id)} activeOpacity={0.75}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>{item.title}</Text>
                {item.batch?.batch_code ? (
                  <Text style={st.cardSub}>{item.batch.batch_code} · {item.batch.title}</Text>
                ) : null}
              </View>
              <View style={[st.badge, { backgroundColor: badge.bg }]}>
                <Text style={[st.badgeText, { color: badge.text }]}>
                  {CONTRACT_ROUTE_STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <View style={st.cardMeta}>
              {item.zone ? <Text style={st.metaText}>Zone: {item.zone}</Text> : null}
              <Text style={st.metaText}>{item.package_count} pkgs</Text>
              {item.estimated_earnings > 0 ? (
                <Text style={st.metaText}>Est. JMD {Number(item.estimated_earnings).toLocaleString()}</Text>
              ) : null}
            </View>
            <Text style={st.viewDetail}>View packages →</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Handoffs tab ──────────────────────────────────────────────────────────────

type HandoffsTabProps = {
  driverId: string;
  refreshing: boolean;
  onRefresh: () => void;
};

function HandoffsTab({ driverId, refreshing, onRefresh }: HandoffsTabProps) {
  const [handoffs, setHandoffs] = useState<ContractHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getMyContractHandoffs(driverId);
    if (res.ok) { setHandoffs(res.data); setError(null); }
    else setError(res.error);
  }, [driverId]);

  useEffect(() => {
    void (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  useEffect(() => {
    if (refreshing) void load();
  }, [refreshing, load]);

  const handleConfirm = useCallback(async (handoff: ContractHandoff) => {
    Alert.alert(
      'Confirm handoff?',
      `Accept ${handoff.package_count} package${handoff.package_count !== 1 ? 's' : ''} from this driver?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Receipt',
          onPress: async () => {
            setBusyId(handoff.id);
            const res = await confirmContractHandoff(handoff.id, driverId);
            if (res.ok) {
              Alert.alert('Confirmed', 'You now have custody of these packages.');
              void load();
            } else {
              Alert.alert('Error', res.error);
            }
            setBusyId(null);
          },
        },
      ]
    );
  }, [driverId, load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;
  if (error) return <ErrorRow msg={error} onRetry={() => void load()} />;

  return (
    <FlatList
      data={handoffs}
      keyExtractor={(h) => h.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={handoffs.length === 0 ? st.emptyList : st.list}
      ListEmptyComponent={<Empty text="No pending handoffs." />}
      renderItem={({ item }) => {
        const badge = handoffBadge(item.status);
        const isIncoming = item.to_driver_id === driverId;
        const isPending = item.status === 'pending';
        const isBusy = busyId === item.id;

        return (
          <View style={st.card}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>
                  {isIncoming ? 'Incoming handoff' : 'Outgoing handoff'}
                </Text>
                {item.route?.title ? (
                  <Text style={st.cardSub}>{item.route.title}{item.route.zone ? ` · Zone ${item.route.zone}` : ''}</Text>
                ) : null}
                {item.batch?.batch_code ? (
                  <Text style={st.cardSub}>{item.batch.batch_code}</Text>
                ) : null}
              </View>
              <View style={[st.badge, { backgroundColor: badge.bg }]}>
                <Text style={[st.badgeText, { color: badge.text }]}>
                  {CONTRACT_HANDOFF_STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <View style={st.cardMeta}>
              <Text style={st.metaText}>{item.package_count} pkg{item.package_count !== 1 ? 's' : ''}</Text>
              {item.pickup_location ? (
                <Text style={st.metaText}>Pick up at: {item.pickup_location}</Text>
              ) : null}
            </View>
            {isIncoming && isPending && (
              <TouchableOpacity
                style={[st.claimBtn, { backgroundColor: colors.success }, isBusy && { opacity: 0.6 }]}
                onPress={() => void handleConfirm(item)}
                disabled={isBusy}
              >
                {isBusy
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={st.claimBtnText}>Confirm Receipt</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        );
      }}
    />
  );
}

// ── Earnings tab ──────────────────────────────────────────────────────────────

type EarningsTabProps = {
  driverId: string;
  refreshing: boolean;
  onRefresh: () => void;
};

function EarningsTab({ driverId, refreshing, onRefresh }: EarningsTabProps) {
  const [earnings, setEarnings] = useState<ContractEarnings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getMyContractEarnings(driverId);
    if (res.ok) { setEarnings(res.data); setError(null); }
    else setError(res.error);
  }, [driverId]);

  useEffect(() => {
    void (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  useEffect(() => {
    if (refreshing) void load();
  }, [refreshing, load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;
  if (error) return <ErrorRow msg={error} onRetry={() => void load()} />;

  const totalPaid = earnings
    .filter((e) => e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.total_earnings), 0);

  return (
    <FlatList
      data={earnings}
      keyExtractor={(e) => e.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={earnings.length === 0 ? st.emptyList : st.list}
      ListHeaderComponent={
        earnings.length > 0 ? (
          <View style={st.earningsSummary}>
            <Text style={st.earningsSummaryLabel}>Total paid</Text>
            <Text style={st.earningsSummaryValue}>JMD {totalPaid.toLocaleString()}</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={<Empty text="No contract earnings yet." />}
      renderItem={({ item }) => {
        const badge = earningsBadge(item.status);
        const syncStatus = item.wallet_sync_status ?? 'unsynced';
        const isSynced = syncStatus === 'synced';
        const isProcessing = item.status === 'paid' && !isSynced && syncStatus !== 'reversed';

        return (
          <View style={st.card}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>
                  {item.route?.title ?? item.batch?.title ?? 'Earnings record'}
                </Text>
                {item.batch?.batch_code ? (
                  <Text style={st.cardSub}>{item.batch.batch_code}</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isSynced && (
                  <View style={[st.badge, { backgroundColor: colors.successSurface }]}>
                    <Text style={[st.badgeText, { color: colors.success }]}>In Wallet</Text>
                  </View>
                )}
                {isProcessing && (
                  <View style={[st.badge, { backgroundColor: colors.warningSurface }]}>
                    <Text style={[st.badgeText, { color: colors.warning }]}>Processing</Text>
                  </View>
                )}
                <View style={[st.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[st.badgeText, { color: badge.text }]}>
                    {CONTRACT_EARNINGS_STATUS_LABELS[item.status] ?? item.status}
                  </Text>
                </View>
              </View>
            </View>
            <View style={st.cardMeta}>
              <Text style={[st.metaText, { fontWeight: '800', color: colors.textPrimary }]}>
                JMD {Number(item.total_earnings).toLocaleString()}
              </Text>
              <Text style={st.metaText}>{item.packages_delivered} delivered / {item.packages_assigned} assigned</Text>
              {item.bonus_amount > 0 ? (
                <Text style={[st.metaText, { color: colors.success }]}>+{Number(item.bonus_amount).toLocaleString()} bonus</Text>
              ) : null}
              {item.deduction_amount > 0 ? (
                <Text style={[st.metaText, { color: colors.danger }]}>−{Number(item.deduction_amount).toLocaleString()} deduction</Text>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

// ── Punch-in / Punch-out data collection modal ───────────────────────────────
// TODO: pickup_photos / return_photos columns exist on contract_vehicle_rentals but are not yet
// written during punch-in/out. Photo capture requires storage bucket upload and is deferred.

const FUEL_LEVELS = ['Full', '3/4', '1/2', '1/4', 'Empty'] as const;

type PunchData = { odometer: string; fuelLevel: string; notes: string };

function PunchModal({
  visible,
  mode,
  rental,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  mode: 'in' | 'out';
  rental: ContractRental | null;
  busy: boolean;
  onConfirm: (data: PunchData) => void;
  onClose: () => void;
}) {
  const [odometer,  setOdometer]  = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [notes,     setNotes]     = useState('');

  useEffect(() => {
    if (visible) { setOdometer(''); setFuelLevel(''); setNotes(''); }
  }, [visible]);

  if (!rental) return null;
  const isIn        = mode === 'in';
  const vehicleName = rental.plate_number ?? rental.vehicle_type ?? 'Vehicle';
  const canConfirm  = odometer.trim().length > 0 && fuelLevel !== '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={pm.sheet}>
          <Text style={pm.title}>{isIn ? 'Punch In' : 'Punch Out'} — {vehicleName}</Text>

          <Text style={pm.label}>Odometer Reading *</Text>
          <TextInput
            style={pm.input}
            value={odometer}
            onChangeText={setOdometer}
            placeholder="Enter km or miles"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            returnKeyType="next"
            editable={!busy}
          />

          <Text style={pm.label}>Fuel Level *</Text>
          <View style={pm.fuelRow}>
            {FUEL_LEVELS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[pm.fuelBtn, fuelLevel === f && pm.fuelBtnActive]}
                onPress={() => setFuelLevel(fuelLevel === f ? '' : f)}
                disabled={busy}
              >
                <Text style={[pm.fuelText, fuelLevel === f && pm.fuelTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={pm.label}>{isIn ? 'Condition Notes (optional)' : 'Return Notes (optional)'}</Text>
          <TextInput
            style={[pm.input, pm.inputMulti]}
            value={notes}
            onChangeText={setNotes}
            placeholder={isIn
              ? 'Any damage or notes at pickup…'
              : 'Any damage or notes on return…'}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            returnKeyType="done"
            editable={!busy}
          />

          {!canConfirm && !busy ? (
            <Text style={pm.validationHint}>Odometer reading and fuel level are required.</Text>
          ) : null}

          <View style={pm.btnRow}>
            <TouchableOpacity style={pm.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={pm.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                pm.confirmBtn,
                { backgroundColor: isIn ? colors.brand : colors.success },
                (!canConfirm || busy) && { opacity: 0.45 },
              ]}
              onPress={() => { if (canConfirm) onConfirm({ odometer, fuelLevel, notes }); }}
              disabled={!canConfirm || busy}
              activeOpacity={0.85}
            >
              {busy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={pm.confirmText}>{isIn ? 'Punch In' : 'Punch Out'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Lead Tools tab ────────────────────────────────────────────────────────────

type LeadTabProps = {
  driverId: string;
  refreshing: boolean;
  onRefresh: () => void;
};

function LeadTab({ driverId, refreshing, onRefresh }: LeadTabProps) {
  const [batches,     setBatches]     = useState<ContractBatch[]>([]);
  const [rentals,     setRentals]     = useState<ContractRental[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [punchTarget, setPunchTarget] = useState<{ rental: ContractRental; mode: 'in' | 'out' } | null>(null);
  const [punchBusy,   setPunchBusy]   = useState(false);

  const load = useCallback(async () => {
    const [bRes, rRes] = await Promise.all([
      getLeadAssignedBatches(driverId),
      getLeadAssignedRentals(driverId),
    ]);
    if (bRes.ok) setBatches(bRes.data);
    else setError(bRes.error);
    if (rRes.ok) setRentals(rRes.data);
    else setError(rRes.error);
    if (bRes.ok && rRes.ok) setError(null);
  }, [driverId]);

  useEffect(() => {
    void (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  useEffect(() => {
    if (refreshing) void load();
  }, [refreshing, load]);

  const handlePunchIn = useCallback((rental: ContractRental) => {
    setPunchTarget({ rental, mode: 'in' });
  }, []);

  const handlePunchOut = useCallback((rental: ContractRental) => {
    setPunchTarget({ rental, mode: 'out' });
  }, []);

  const handlePunchConfirm = useCallback(async (data: PunchData) => {
    if (!punchTarget) return;
    const { rental, mode } = punchTarget;
    const raw  = parseFloat(data.odometer.trim());
    const odom = isNaN(raw) ? null : raw;
    setPunchBusy(true);
    if (mode === 'in') {
      const res = await punchInRental(rental.id, {
        pickup_mileage:         odom,
        pickup_fuel_level:      data.fuelLevel || null,
        pickup_condition_notes: data.notes.trim() || null,
      });
      setPunchBusy(false);
      if (res.ok) {
        setPunchTarget(null);
        Alert.alert('Punched In', 'Vehicle pickup recorded.');
        void load();
      } else {
        Alert.alert('Error', res.error);
      }
    } else {
      const res = await punchOutRental(rental.id, {
        return_mileage:         odom,
        return_fuel_level:      data.fuelLevel || null,
        return_condition_notes: data.notes.trim() || null,
      });
      setPunchBusy(false);
      if (res.ok) {
        setPunchTarget(null);
        Alert.alert('Punched Out', 'Vehicle return recorded.');
        void load();
      } else {
        Alert.alert('Error', res.error);
      }
    }
  }, [punchTarget, load]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />;
  if (error) return <ErrorRow msg={error} onRetry={() => void load()} />;

  return (
    <>
      <ScrollView
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
      {/* Batches */}
      <Text style={st.sectionHeader}>My Batches ({batches.length})</Text>
      {batches.length === 0
        ? <Text style={st.emptyText}>No active batches assigned to you.</Text>
        : batches.map((b) => (
          <View key={b.id} style={st.card}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>{b.title}</Text>
                {b.batch_code ? <Text style={st.cardSub}>{b.batch_code}</Text> : null}
                {b.partner ? <Text style={st.cardSub}>Client: {b.partner.name}</Text> : null}
              </View>
              <View style={[st.badge, { backgroundColor: colors.brandSurface }]}>
                <Text style={[st.badgeText, { color: colors.brand }]}>{b.status}</Text>
              </View>
            </View>
            <View style={st.cardMeta}>
              <Text style={st.metaText}>{b.delivered_package_count}/{b.expected_package_count} delivered</Text>
              {b.delivery_deadline_at ? (
                <Text style={st.metaText}>Due: {new Date(b.delivery_deadline_at).toLocaleDateString()}</Text>
              ) : null}
            </View>
          </View>
        ))
      }

      {/* Rentals */}
      <Text style={[st.sectionHeader, { marginTop: 20 }]}>Vehicles ({rentals.length})</Text>
      {rentals.length === 0
        ? <Text style={st.emptyText}>No vehicles assigned to you.</Text>
        : rentals.map((r) => {

          const canPunchIn  = r.status === 'booked' || r.status === 'confirmed';
          const canPunchOut = r.status === 'in_use';
          return (
            <View key={r.id} style={st.card}>
              <View style={st.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitle}>
                    {r.plate_number ?? r.vehicle_type ?? 'Vehicle'}
                  </Text>
                  <Text style={st.cardSub}>{r.rental_company_name}</Text>
                  {r.batch?.batch_code ? <Text style={st.cardSub}>{r.batch.batch_code}</Text> : null}
                </View>
                <View style={[st.badge, { backgroundColor: canPunchOut ? colors.brandSurface : '#F1F5F9' }]}>
                  <Text style={[st.badgeText, { color: canPunchOut ? colors.brand : '#475569' }]}>
                    {r.status}
                  </Text>
                </View>
              </View>
              {(canPunchIn || canPunchOut) && (
                <View style={st.rentalActionRow}>
                  {canPunchIn && (
                    <TouchableOpacity
                      style={[st.claimBtn, { flex: 1 }, punchBusy && { opacity: 0.6 }]}
                      onPress={() => handlePunchIn(r)}
                      disabled={punchBusy}
                    >
                      <Text style={st.claimBtnText}>Punch In</Text>
                    </TouchableOpacity>
                  )}
                  {canPunchOut && (
                    <TouchableOpacity
                      style={[st.claimBtn, { flex: 1, backgroundColor: colors.success }, punchBusy && { opacity: 0.6 }]}
                      onPress={() => handlePunchOut(r)}
                      disabled={punchBusy}
                    >
                      <Text style={st.claimBtnText}>Punch Out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      }
      </ScrollView>
      <PunchModal
        visible={!!punchTarget}
        mode={punchTarget?.mode ?? 'in'}
        rental={punchTarget?.rental ?? null}
        busy={punchBusy}
        onConfirm={(data) => void handlePunchConfirm(data)}
        onClose={() => { if (!punchBusy) setPunchTarget(null); }}
      />
    </>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ContractRunsScreen(_props: ContractRunsScreenProps) {
  const { driverRow } = useAuth();
  const driverId = driverRow?.id ?? '';
  const navigation = useNavigation<NativeStackNavigationProp<DriverStackParamList>>();

  const [activeTab, setActiveTab] = useState<TabKey>('available');
  const [isLead, setIsLead] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    void getMyContractRoles(driverId).then((res) => {
      if (res.ok) {
        setIsLead(res.data.some((r) => r.role === 'logistics_lead'));
      }
    });
  }, [driverId]);

  const tabs: { key: TabKey; label: string }[] = isLead
    ? [...BASE_TABS, { key: 'lead', label: 'Lead Tools' }]
    : BASE_TABS;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const openRun = useCallback(
    (routeId: string) => {
      navigation.navigate('ContractRunDetail', { routeId, driverId });
    },
    [navigation, driverId]
  );

  if (!driverId) {
    return (
      <View style={st.center}>
        <Text style={st.emptyText}>Driver profile not found. Please log out and back in.</Text>
      </View>
    );
  }

  return (
    <View style={st.container}>
      {/* Screen header */}
      <View style={st.screenHeader}>
        <Text style={st.screenTitle}>Contract Logistics</Text>
      </View>

      {/* Internal tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.tabBar}
        style={st.tabBarWrap}
      >
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={[st.tabBtn, active && st.tabBtnActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[st.tabBtnText, active && st.tabBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'available' && (
          <AvailableTab driverId={driverId} refreshing={refreshing} onRefresh={onRefresh} />
        )}
        {activeTab === 'my_runs' && (
          <MyRunsTab driverId={driverId} refreshing={refreshing} onRefresh={onRefresh} onOpenRun={openRun} />
        )}
        {activeTab === 'handoffs' && (
          <HandoffsTab driverId={driverId} refreshing={refreshing} onRefresh={onRefresh} />
        )}
        {activeTab === 'earnings' && (
          <EarningsTab driverId={driverId} refreshing={refreshing} onRefresh={onRefresh} />
        )}
        {activeTab === 'lead' && isLead && (
          <LeadTab driverId={driverId} refreshing={refreshing} onRefresh={onRefresh} />
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  screenHeader: {
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  screenTitle: { fontSize: 22, fontWeight: '900', color: colors.textPrimary },

  tabBarWrap: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight: 48,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  tabBtnTextActive: { color: '#fff' },

  list: { padding: 12, gap: 10 },
  emptyList: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 14, color: colors.danger, textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, lineHeight: 20 },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  metaText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  claimBtn: {
    marginTop: 12,
    backgroundColor: colors.brand,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  claimBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  viewDetail: { fontSize: 13, color: colors.brand, fontWeight: '700', marginTop: 10 },

  earningsSummary: {
    backgroundColor: colors.brandSurface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  earningsSummaryLabel: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  earningsSummaryValue: { fontSize: 20, fontWeight: '900', color: colors.brand },

  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
  },

  rentalActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
});

// ── Punch modal styles ────────────────────────────────────────────────────────

const pm = StyleSheet.create({
  overlay: {
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
  },
  title: {
    fontSize: 16,
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
    marginBottom: 7,
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
    minHeight: 72,
    paddingTop: 12,
  },
  fuelRow:       { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  fuelBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    minWidth: 50,
  },
  fuelBtnActive:  { backgroundColor: colors.brandSurface, borderColor: colors.brand },
  fuelText:       { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  fuelTextActive: { color: colors.brand },
  validationHint: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
    marginBottom: 10,
    lineHeight: 17,
  },
  btnRow:      { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:   { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  cancelText:  { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  confirmBtn:  { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
