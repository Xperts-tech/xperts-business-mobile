import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { setDriverOnlineStatus } from '@/services/driverStatus';
import { fetchActiveOrder } from '@/services/activeOrder';
import {
  clearDriverLocation,
  getCurrentLocation,
  pingDriverLocation,
  requestForegroundLocationPermission,
} from '@/services/locationService';
import {
  acceptOffer,
  declineOffer,
  fetchPendingOffers,
  getDropoff,
  getOrderFromAttempt,
  getOrderRef,
  getPickup,
  getSecondsRemaining,
  getServiceLabel,
  getStoreName,
  timeAgoShort,
} from '@/services/dispatchOffers';
import {
  registerForPushNotificationsAsync,
  savePushToken,
} from '@/services/notificationService';
import { supabase } from '@/lib/supabase';
import { type TodaySummary, fetchTodaySummary, formatMoney } from '@/services/earningsService';
import {
  DEFAULT_SERVICE_FLAGS,
  getMyServiceAvailability,
  syncAvailabilityStatus,
  updateMyServiceFlags,
} from '@/services/availabilityService';
import type { DispatchAttempt } from '@/types/dispatch';
import type { DriverAvailabilityRow, ServiceAvailabilityFlags } from '@/types/driver';
import type { DriverHomeScreenProps, DriverStackParamList } from '@/types/navigation';

// Vibrate the device to alert the driver of a new dispatch offer.
// Android supports vibration patterns; iOS does a single pulse.
function triggerOfferAlert() {
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 400, 150, 400, 150, 600]);
  } else {
    Vibration.vibrate();
  }
}

// ── Approval badge ────────────────────────────────────────────────────────────

const APPROVAL_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  approved:  { label: 'Approved',  bg: colors.successSurface, text: '#166534' },
  pending:   { label: 'Pending',   bg: colors.warningSurface,  text: '#92400E' },
  rejected:  { label: 'Rejected',  bg: colors.dangerSurface,  text: '#991B1B' },
  suspended: { label: 'Suspended', bg: '#F3F4F6',              text: '#374151' },
};

function ApprovalBadge({ status }: { status: string }) {
  const cfg = APPROVAL_CONFIG[status] ?? { label: status, bg: '#F3F4F6', text: '#374151' };
  return (
    <View style={[badge.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={[badge.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: '800' },
});

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function firstNameFrom(fullName: string | null | undefined): string {
  if (!fullName) return 'Driver';
  return fullName.trim().split(' ')[0] ?? 'Driver';
}

// ── Offer card ────────────────────────────────────────────────────────────────

type OfferCardProps = {
  attempt: DispatchAttempt;
  nowMs: number;
  isProcessing: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

function OfferCard({ attempt, nowMs, isProcessing, onAccept, onDecline }: OfferCardProps) {
  const order        = getOrderFromAttempt(attempt);
  const serviceLabel = getServiceLabel(order);
  const storeName    = getStoreName(order);
  const pickup       = getPickup(order);
  const dropoff      = getDropoff(order);
  const orderRef     = getOrderRef(order);
  const secs         = getSecondsRemaining(attempt.expires_at, nowMs);
  const hasExpiry    = Boolean(attempt.expires_at);
  const isUrgent     = hasExpiry && secs <= 15;
  const isWarning    = hasExpiry && secs > 15 && secs <= 60;

  const timerLabel =
    secs === Infinity ? null
    : secs > 60       ? `${Math.ceil(secs / 60)}m left`
    : `${secs}s left`;

  const accentColor = isUrgent ? colors.danger : isWarning ? colors.warning : colors.success;

  const timerStyle = isUrgent
    ? { bg: colors.dangerSurface,  text: colors.danger,  border: colors.dangerBorder }
    : isWarning
    ? { bg: colors.warningSurface, text: colors.warning, border: colors.warningBorder }
    : { bg: colors.brandSurface,   text: colors.brand,   border: colors.borderLight };

  return (
    <View style={[offerSt.card, { borderLeftColor: accentColor }]}>
      {/* Header row: service type + timer */}
      <View style={offerSt.cardHeader}>
        <View style={offerSt.labelRow}>
          <View style={offerSt.serviceChip}>
            <Text style={offerSt.serviceChipText}>{serviceLabel.toUpperCase()}</Text>
          </View>
          {storeName ? (
            <View style={offerSt.storeChip}>
              <Text style={offerSt.storeChipText} numberOfLines={1}>{storeName}</Text>
            </View>
          ) : null}
        </View>
        {timerLabel ? (
          <View style={[offerSt.timer, { backgroundColor: timerStyle.bg, borderColor: timerStyle.border }]}>
            <Text style={[offerSt.timerIcon, { color: timerStyle.text }]}>⏱</Text>
            <Text style={[offerSt.timerText, { color: timerStyle.text }]}>{timerLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* Ref + created time */}
      <View style={offerSt.metaRow}>
        {orderRef ? <Text style={offerSt.ref}>Ref {orderRef}</Text> : null}
        <Text style={offerSt.age}>{timeAgoShort(attempt.created_at)}</Text>
      </View>

      {/* Pickup */}
      <View style={offerSt.locationRow}>
        <View style={[offerSt.locationDot, { backgroundColor: colors.success }]} />
        <View style={offerSt.locationText}>
          <Text style={offerSt.locationLabel}>PICKUP</Text>
          <Text style={offerSt.locationValue} numberOfLines={2}>
            {pickup ?? 'Details shown after acceptance'}
          </Text>
        </View>
      </View>

      {/* Dropoff */}
      <View style={[offerSt.locationRow, { marginBottom: 16 }]}>
        <View style={[offerSt.locationDot, { backgroundColor: colors.brand }]} />
        <View style={offerSt.locationText}>
          <Text style={offerSt.locationLabel}>DROP-OFF</Text>
          <Text style={offerSt.locationValue} numberOfLines={2}>
            {dropoff ?? 'Details shown after acceptance'}
          </Text>
        </View>
      </View>

      {/* Accept / Decline */}
      <View style={offerSt.actions}>
        <TouchableOpacity
          style={[offerSt.declineBtn, isProcessing && offerSt.btnDisabled]}
          onPress={onDecline}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={offerSt.declineBtnText}>Decline</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[offerSt.acceptBtn, isProcessing && offerSt.btnDisabled]}
          onPress={onAccept}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={offerSt.acceptBtnText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const offerSt = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, marginRight: 8 },
  serviceChip: {
    backgroundColor: colors.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  serviceChipText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  storeChip: {
    backgroundColor: colors.brandSurface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 140,
  },
  storeChipText: { color: colors.brand, fontSize: 11, fontWeight: '700' },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  timerIcon: { fontSize: 11 },
  timerText:  { fontSize: 12, fontWeight: '800' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ref:  { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  age:  { fontSize: 11, color: colors.textMuted },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  locationText:  { flex: 1 },
  locationLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, color: colors.textMuted, marginBottom: 2 },
  locationValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 18 },

  actions:       { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  btnDisabled:    { opacity: 0.5 },
  declineBtnText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  acceptBtnText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
});

// ── Availability card ─────────────────────────────────────────────────────────

type ServiceToggleDef = {
  flag:    keyof ServiceAvailabilityFlags;
  label:   string;
  visible: boolean;
  enabled: boolean;
};

type AvailabilityCardProps = {
  driverRow:     { can_deliver_food?: boolean | null; can_do_errands?: boolean | null; can_do_courier?: boolean | null; can_do_rides?: boolean | null; approval_status?: string; enforcement_status?: string; online_status?: string } | null;
  availability:  DriverAvailabilityRow | null;
  updatingFlag:  keyof ServiceAvailabilityFlags | null;
  onToggle:      (flag: keyof ServiceAvailabilityFlags, value: boolean) => void;
};

function AvailabilityCard({ driverRow, availability, updatingFlag, onToggle }: AvailabilityCardProps) {
  const flags: ServiceAvailabilityFlags = availability
    ? {
        accepts_delivery: availability.accepts_delivery,
        accepts_rides:    availability.accepts_rides,
        accepts_courier:  availability.accepts_courier,
        accepts_gas:      availability.accepts_gas,
      }
    : DEFAULT_SERVICE_FLAGS;

  const isApproved  = driverRow?.approval_status === 'approved';
  const isSuspended = driverRow?.enforcement_status === 'suspended';
  const isOnline    = driverRow?.online_status === 'online';
  const canEdit     = isApproved && !isSuspended;

  const services: ServiceToggleDef[] = [
    {
      flag:    'accepts_delivery',
      label:   'Deliveries & Errands',
      visible: Boolean(driverRow?.can_deliver_food ?? true) || Boolean(driverRow?.can_do_errands ?? true),
      enabled: flags.accepts_delivery,
    },
    {
      flag:    'accepts_courier',
      label:   'Courier / Packages',
      visible: Boolean(driverRow?.can_do_courier ?? true),
      enabled: flags.accepts_courier,
    },
    {
      flag:    'accepts_rides',
      label:   'Ride Services',
      visible: Boolean(driverRow?.can_do_rides),
      enabled: flags.accepts_rides,
    },
    {
      flag:    'accepts_gas',
      label:   'Gas & Fuel',
      visible: isApproved,
      enabled: flags.accepts_gas,
    },
  ];

  const visible = services.filter((s) => s.visible);
  if (visible.length === 0) return null;

  return (
    <View style={avSt.card}>
      <View style={avSt.header}>
        <Text style={avSt.title}>Available Services</Text>
        {!isOnline ? (
          <Text style={avSt.offlineNote}>Applies when online</Text>
        ) : null}
      </View>

      {!canEdit ? (
        <View style={avSt.gateRow}>
          <Text style={avSt.gateText}>
            {isSuspended
              ? 'Service toggles are disabled while your account is suspended.'
              : 'Your account must be approved before you can set service availability.'}
          </Text>
        </View>
      ) : null}

      {visible.map((svc, i) => {
        const isUpdating = updatingFlag === svc.flag;
        return (
          <View key={svc.flag}>
            {i > 0 ? <View style={avSt.divider} /> : null}
            <View style={avSt.row}>
              <View style={avSt.rowLeft}>
                <Text style={[avSt.rowLabel, !canEdit && avSt.rowLabelDim]}>{svc.label}</Text>
                {svc.flag === 'accepts_rides' ? (
                  <Text style={avSt.rowSub}>Admin-approved only</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[avSt.toggle, svc.enabled && canEdit ? avSt.toggleOn : avSt.toggleOff, (!canEdit || isUpdating) && avSt.toggleDisabled]}
                onPress={() => canEdit && !isUpdating ? onToggle(svc.flag, !svc.enabled) : undefined}
                activeOpacity={canEdit ? 0.75 : 1}
                disabled={!canEdit || isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={[avSt.knob, svc.enabled && canEdit ? avSt.knobOn : avSt.knobOff]} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <Text style={avSt.footNote}>
        Approved services are set by Xperts admin. Toggle these to control which job types you accept while online.
      </Text>
    </View>
  );
}

const avSt = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title:       { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  offlineNote: { fontSize: 11, fontWeight: '700', color: colors.textMuted, backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  gateRow:     { backgroundColor: colors.warningSurface, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: colors.warningBorder },
  gateText:    { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 17 },
  divider:     { height: 1, backgroundColor: colors.borderLight, marginVertical: 2 },
  row:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  rowLeft:     { flex: 1, marginRight: 12 },
  rowLabel:    { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rowLabelDim: { color: colors.textMuted },
  rowSub:      { fontSize: 11, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 3,
    flexShrink: 0,
  },
  toggleOn:       { backgroundColor: colors.success },
  toggleOff:      { backgroundColor: '#CBD5E1' },
  toggleDisabled: { opacity: 0.45 },
  knob:       { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  knobOn:     { alignSelf: 'flex-end' },
  knobOff:    { alignSelf: 'flex-start' },
  footNote:   { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: 12, fontWeight: '500' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type StatusMessage = { text: string; isError: boolean } | null;

export default function DriverHomeScreen({ navigation }: DriverHomeScreenProps) {
  const { user, profile, driverRow, profilePhotoUrl, refreshDriverRow } = useAuth();
  const insets = useSafeAreaInsets();

  // Toggle state
  const [toggling, setToggling]         = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const messageClearRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Location pinging
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Offers
  const [offers, setOffers]           = useState<DispatchAttempt[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerError, setOfferError]   = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [nowMs, setNowMs]             = useState(Date.now());

  // Notification permission health
  const [notifPermStatus, setNotifPermStatus] = useState<string | null>(null);

  // Stale busy: online_status='busy' but no active order exists
  const [staleBusy, setStaleBusy] = useState(false);

  // Active delivery banner: driver has an order currently in flight
  const [hasActiveOrder, setHasActiveOrder] = useState(false);

  // Today's summary strip (loads in background, non-blocking)
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);

  // Service availability
  const [availability, setAvailability] = useState<DriverAvailabilityRow | null>(null);
  const [updatingFlag, setUpdatingFlag] = useState<keyof ServiceAvailabilityFlags | null>(null);

  // Derived
  const firstName      = firstNameFrom(profile?.full_name);
  const email          = user?.email ?? '';
  const approvalStatus = driverRow?.approval_status ?? 'pending';
  const enforcementStatus = driverRow?.enforcement_status ?? 'active';
  const onlineStatus: string = driverRow?.online_status ?? 'offline';
  const avatarLetter   = firstName.charAt(0).toUpperCase();

  const isApproved = approvalStatus === 'approved';
  const isSuspended = enforcementStatus === 'suspended';
  const isOnline   = onlineStatus === 'online';
  const canToggle  = isApproved && !isSuspended && !toggling;

  const profileId = user?.id ?? null;

  // ── Active offers ──────────────────────────────────────────────────────────
  const activeOffers = offers.filter((a) => {
    if (a.status !== 'offered') return false;
    return getSecondsRemaining(a.expires_at, nowMs) > 0;
  });

  // ── Fetch offers ───────────────────────────────────────────────────────────
  const fetchOffers = useCallback(async () => {
    if (!profileId) return;
    setOffersLoading(true);
    setOfferError(null);
    const results = await fetchPendingOffers(profileId);
    setOffers(results);
    setOffersLoading(false);
  }, [profileId]);

  useEffect(() => { fetchOffers(); }, [fetchOffers]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Check notification permission on mount
  useEffect(() => {
    void Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifPermStatus(status);
    });
  }, []);

  // Active order check: feeds both hasActiveOrder banner and staleBusy warning
  useEffect(() => {
    if (!driverRow?.id) { setHasActiveOrder(false); setStaleBusy(false); return; }
    let cancelled = false;
    void (async () => {
      const { order } = await fetchActiveOrder(driverRow.id);
      if (!cancelled) {
        setHasActiveOrder(order !== null);
        if (onlineStatus === 'busy') setStaleBusy(order === null);
      }
    })();
    return () => { cancelled = true; };
  }, [driverRow?.id, onlineStatus]);

  // Today summary — loads silently in background; only shown when jobsToday > 0
  useEffect(() => {
    if (!driverRow?.id) return;
    fetchTodaySummary(driverRow.id).then(setTodaySummary).catch(() => {});
  }, [driverRow?.id]);

  // Service availability — load on mount and after online/offline toggle
  useEffect(() => {
    if (!profileId) return;
    void getMyServiceAvailability(profileId).then(({ data }) => {
      setAvailability(data);
    });
  }, [profileId, onlineStatus]);

  // Realtime — fetch offers on any change; auto-navigate to IncomingOffer on INSERT
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`driver-dispatch-${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatch_attempts', filter: `driver_id=eq.${profileId}` },
        (payload) => {
          void fetchOffers();
          // Auto-navigate to IncomingOfferScreen when a new offer arrives
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as { id?: string; status?: string };
            if (newRow.id && newRow.status === 'offered') {
              triggerOfferAlert();
              const stackNav = navigation.getParent<NativeStackNavigationProp<DriverStackParamList>>();
              stackNav?.navigate('IncomingOffer', { attemptId: newRow.id });
            }
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profileId, fetchOffers, navigation]);

  // ── Location pinging ───────────────────────────────────────────────────────
  useEffect(() => {
    const driverId = driverRow?.id;
    if (!isOnline || !driverId) {
      if (locationIntervalRef.current) { clearInterval(locationIntervalRef.current); locationIntervalRef.current = null; }
      if (driverId) void clearDriverLocation(driverId);
      return;
    }

    let active = true;
    void (async () => {
      const granted = await requestForegroundLocationPermission();
      if (!granted) {
        setStatusMessage({ text: 'Location permission is needed so Xperts can assign nearby orders.', isError: true });
        return;
      }
      const doPing = async () => {
        const loc = await getCurrentLocation();
        if (loc) await pingDriverLocation(driverId, null, loc);
      };
      if (!active) return;
      void doPing();
      locationIntervalRef.current = setInterval(() => void doPing(), 30_000);
    })();

    return () => {
      active = false;
      if (locationIntervalRef.current) { clearInterval(locationIntervalRef.current); locationIntervalRef.current = null; }
    };
  }, [isOnline, driverRow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Online/offline toggle ──────────────────────────────────────────────────
  function showMessage(text: string, isError: boolean) {
    if (messageClearRef.current) clearTimeout(messageClearRef.current);
    setStatusMessage({ text, isError });
    messageClearRef.current = setTimeout(() => setStatusMessage(null), 4000);
  }

  useEffect(() => () => { if (messageClearRef.current) clearTimeout(messageClearRef.current); }, []);

  // Notification tap — route by notification data type
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastNotificationResponse) return;
    const data = (lastNotificationResponse.notification.request.content.data ?? {}) as Record<string, unknown>;
    const type      = data.type      as string | undefined;
    const attemptId = data.attemptId as string | undefined;
    const orderId   = data.orderId   as string | undefined;

    if (type === 'dispatch_offer' && attemptId) {
      // Open the specific offer screen
      const stackNav = navigation.getParent<NativeStackNavigationProp<DriverStackParamList>>();
      stackNav?.navigate('IncomingOffer', { attemptId });
    } else if (orderId) {
      // Go to active order tab for order-related notifications
      navigation.navigate('ActiveOrder');
    } else {
      navigation.navigate('Home');
    }
  }, [lastNotificationResponse, navigation]);

  // Stale busy reset — set driver back to online safely
  const handleStaleBusyReset = useCallback(async () => {
    if (!driverRow?.id) return;
    const { error } = await setDriverOnlineStatus(driverRow.id, 'online');
    if (!error) {
      await refreshDriverRow();
      setStaleBusy(false);
    }
  }, [driverRow?.id, refreshDriverRow]);

  // Notification permission retry
  const handleRetryPermission = useCallback(async () => {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'denied') {
      // Cannot prompt again — send driver to device settings
      void Linking.openSettings();
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifPermStatus(status);
    if (status === 'granted') {
      const token = await registerForPushNotificationsAsync();
      const uid   = user?.id;
      if (token && uid) await savePushToken(uid, token);
    }
  }, [user?.id]);

  const handleToggle = useCallback(async () => {
    if (!canToggle || !driverRow?.id) return;
    const nextStatus: 'online' | 'offline' = isOnline ? 'offline' : 'online';
    setToggling(true);
    setStatusMessage(null);
    // Primary: update drivers.online_status
    const { data: updated, error } = await setDriverOnlineStatus(driverRow.id, nextStatus);
    if (error || !updated) {
      showMessage(error ?? 'Could not update status. Please try again.', true);
      setToggling(false);
      return;
    }
    // Non-fatal sync: keep driver_availability.status + availability_status in step
    void syncAvailabilityStatus(nextStatus, availability);
    await refreshDriverRow();
    showMessage(
      nextStatus === 'online' ? 'You are now online. Ready for delivery requests.' : 'You are now offline.',
      false,
    );
    setToggling(false);
  }, [canToggle, driverRow?.id, isOnline, availability, refreshDriverRow]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleServiceToggle = useCallback(async (
    flag: keyof ServiceAvailabilityFlags,
    value: boolean
  ) => {
    if (!isApproved || isSuspended || updatingFlag) return;
    const current: ServiceAvailabilityFlags = availability
      ? {
          accepts_delivery: availability.accepts_delivery,
          accepts_rides:    availability.accepts_rides,
          accepts_courier:  availability.accepts_courier,
          accepts_gas:      availability.accepts_gas,
        }
      : { ...DEFAULT_SERVICE_FLAGS };
    setUpdatingFlag(flag);
    const { data, error } = await updateMyServiceFlags(onlineStatus, { ...current, [flag]: value });
    if (error) {
      showMessage(error, true);
    } else if (data) {
      setAvailability(data);
    }
    setUpdatingFlag(null);
  }, [isApproved, isSuspended, updatingFlag, availability, onlineStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  function disabledReason(): string | null {
    if (isSuspended) return 'Your account is suspended. Contact Xperts support.';
    if (!isApproved) return 'Your account must be approved before you can go online.';
    return null;
  }
  const gateMessage = disabledReason();

  // ── Accept / Decline ───────────────────────────────────────────────────────
  const handleAccept = useCallback(async (attemptId: string) => {
    if (processingId) return;
    setProcessingId(attemptId);
    setOfferError(null);
    const { result, error } = await acceptOffer(attemptId);
    if (error) { setOfferError(error); setProcessingId(null); return; }
    if (result?.status && result.status !== 'accepted') {
      const msg = result.status === 'already_taken'
        ? 'Already accepted by another driver.'
        : result.message ?? 'This offer is no longer active.';
      setOfferError(msg);
      setOffers((prev) => prev.filter((a) => a.id !== attemptId));
      setProcessingId(null);
      return;
    }
    setOffers((prev) => prev.filter((a) => a.id !== attemptId));
    setProcessingId(null);
    void fetchOffers();
  }, [processingId, fetchOffers]);

  const handleDecline = useCallback(async (attemptId: string) => {
    if (processingId) return;
    setProcessingId(attemptId);
    setOfferError(null);
    const { error } = await declineOffer(attemptId);
    if (error) { setOfferError(error); setProcessingId(null); return; }
    setOffers((prev) => prev.filter((a) => a.id !== attemptId));
    setProcessingId(null);
  }, [processingId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Compact header ──────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {profilePhotoUrl ? (
            <Image source={{ uri: profilePhotoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{avatarLetter}</Text>
            </View>
          )}
          <View style={styles.headerMeta}>
            <Text style={styles.greeting}>{getGreeting()}, {firstName}</Text>
            {email ? <Text style={styles.emailSub} numberOfLines={1}>{email}</Text> : null}
          </View>
        </View>
        <ApprovalBadge status={approvalStatus} />
      </View>

      {/* ── Notification permission warning ─────────────────────── */}
      {notifPermStatus !== null && notifPermStatus !== 'granted' && (
        <View style={styles.alertCard}>
          <View style={styles.alertCardIcon}><Text style={styles.alertIcon}>🔔</Text></View>
          <View style={styles.alertCardBody}>
            <Text style={styles.alertCardTitle}>Turn on notifications</Text>
            <Text style={styles.alertCardText}>
              Enable notifications so you don't miss delivery requests.
            </Text>
            <TouchableOpacity style={styles.alertCardBtn} onPress={handleRetryPermission}>
              <Text style={styles.alertCardBtnText}>Enable Notifications</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Stale busy warning ──────────────────────────────────── */}
      {staleBusy && (
        <View style={[styles.alertCard, styles.alertCardWarn]}>
          <View style={styles.alertCardIcon}><Text style={styles.alertIcon}>⚠️</Text></View>
          <View style={styles.alertCardBody}>
            <Text style={styles.alertCardTitle}>Driver status looks stuck</Text>
            <Text style={styles.alertCardText}>
              Your status is "Busy" but you have no active orders. You may miss incoming requests.
            </Text>
            <View style={styles.alertCardActions}>
              <TouchableOpacity style={styles.alertCardBtn} onPress={handleStaleBusyReset}>
                <Text style={styles.alertCardBtnText}>Reset to Online</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.alertCardBtnOutline} onPress={refreshDriverRow}>
                <Text style={styles.alertCardBtnOutlineText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Active delivery banner ──────────────────────────────── */}
      {hasActiveOrder && (
        <TouchableOpacity
          style={styles.activeBanner}
          onPress={() => navigation.navigate('ActiveOrder')}
          activeOpacity={0.8}
        >
          <Text style={styles.activeBannerIcon}>🚗</Text>
          <View style={styles.activeBannerBody}>
            <Text style={styles.activeBannerTitle}>Active delivery in progress</Text>
            <Text style={styles.activeBannerSub}>Tap to resume your current order</Text>
          </View>
          <Text style={styles.activeBannerChevron}>›</Text>
        </TouchableOpacity>
      )}

      {/* ── Today at a glance (shown only when jobs > 0 today) ─── */}
      {todaySummary && todaySummary.jobsToday > 0 ? (
        <View style={styles.todayStrip}>
          <View style={styles.todayCell}>
            <Text style={styles.todayCellVal}>{todaySummary.jobsToday}</Text>
            <Text style={styles.todayCellLabel}>Today's Jobs</Text>
          </View>
          <View style={styles.todayCellDivider} />
          <View style={styles.todayCell}>
            <Text style={[styles.todayCellVal, { color: '#166534' }]}>
              {formatMoney(todaySummary.earningsToday)}
            </Text>
            <Text style={styles.todayCellLabel}>Earned Today</Text>
          </View>
          {todaySummary.cashToReturn > 0 ? (
            <>
              <View style={styles.todayCellDivider} />
              <View style={styles.todayCell}>
                <Text style={[styles.todayCellVal, { color: '#92400E' }]}>
                  {formatMoney(todaySummary.cashToReturn)}
                </Text>
                <Text style={styles.todayCellLabel}>Cash to Return</Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {/* ── Hero status card ────────────────────────────────────── */}
      <View style={[styles.statusCard, isOnline ? styles.statusCardOnline : styles.statusCardOffline]}>
        {/* Status indicator row */}
        <View style={styles.statusIndicatorRow}>
          <View style={[styles.statusOrb, { backgroundColor: isOnline ? colors.online : colors.offline }]} />
          <View style={styles.statusTextGroup}>
            <Text style={[styles.statusHeadline, { color: isOnline ? colors.online : colors.textPrimary }]}>
              {isOnline ? "You're Online" : "You're Offline"}
            </Text>
            <Text style={styles.statusSub}>
              {isOnline ? 'Ready for delivery requests' : 'Go online to receive orders'}
            </Text>
          </View>
          {toggling ? <ActivityIndicator size="small" color={isOnline ? colors.online : colors.brand} /> : null}
        </View>

        {/* Gate message */}
        {gateMessage ? (
          <View style={styles.gateBox}>
            <Text style={styles.gateText}>{gateMessage}</Text>
          </View>
        ) : null}

        {/* Big toggle button */}
        <TouchableOpacity
          style={[styles.toggleBtn, isOnline ? styles.goOfflineBtn : styles.goOnlineBtn, !canToggle && styles.btnDisabled]}
          onPress={handleToggle}
          disabled={!canToggle}
          activeOpacity={0.85}
        >
          {toggling ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.toggleBtnText}>{isOnline ? 'Go Offline' : 'Go Online'}</Text>
          )}
        </TouchableOpacity>

        {/* Status feedback message */}
        {statusMessage ? (
          <View style={[styles.msgBox, statusMessage.isError ? styles.msgError : styles.msgSuccess]}>
            <Text style={[styles.msgText, { color: statusMessage.isError ? colors.danger : colors.success }]}>
              {statusMessage.text}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Available services ──────────────────────────────────── */}
      <AvailabilityCard
        driverRow={driverRow}
        availability={availability}
        updatingFlag={updatingFlag}
        onToggle={handleServiceToggle}
      />

      {/* ── Incoming offers ─────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Incoming Requests</Text>
          {offersLoading ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : activeOffers.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeOffers.length}</Text>
            </View>
          ) : null}
        </View>

        {offerError ? (
          <View style={styles.offerErrorBox}>
            <Text style={styles.offerErrorText}>{offerError}</Text>
          </View>
        ) : null}

        {activeOffers.length > 0 ? (
          activeOffers.map((attempt) => (
            <OfferCard
              key={attempt.id}
              attempt={attempt}
              nowMs={nowMs}
              isProcessing={processingId === attempt.id}
              onAccept={() => handleAccept(attempt.id)}
              onDecline={() => handleDecline(attempt.id)}
            />
          ))
        ) : !offersLoading ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>{isOnline ? '📡' : '○'}</Text>
            <Text style={styles.emptyTitle}>
              {isOnline ? 'Listening for requests…' : 'You are offline'}
            </Text>
            <Text style={styles.emptyBody}>
              {isOnline
                ? 'New delivery requests will appear here as they come in.'
                : 'Tap "Go Online" above to start receiving delivery requests.'}
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 18, paddingBottom: 40 },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 10 },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    flexShrink: 0,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLetter: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerMeta:   { flex: 1 },
  greeting:     { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  emailSub:     { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  // ── Today strip ──────────────────────────────────────────────────────────
  todayStrip: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  todayCell:        { flex: 1, alignItems: 'center' },
  todayCellDivider: { width: 1, backgroundColor: colors.borderLight, alignSelf: 'stretch', marginHorizontal: 4 },
  todayCellVal:     { fontSize: 15, fontWeight: '900', color: colors.textPrimary, marginBottom: 2 },
  todayCellLabel:   { fontSize: 9, fontWeight: '900', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Active delivery banner ────────────────────────────────────────────────
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.brand,
    gap: 12,
  },
  activeBannerIcon:    { fontSize: 22 },
  activeBannerBody:    { flex: 1 },
  activeBannerTitle:   { fontSize: 14, fontWeight: '800', color: colors.brand, marginBottom: 2 },
  activeBannerSub:     { fontSize: 12, color: colors.brand, opacity: 0.75, fontWeight: '500' },
  activeBannerChevron: { fontSize: 24, color: colors.brand, fontWeight: '300', marginLeft: 4 },

  // ── Status hero card ──────────────────────────────────────────────────────
  statusCard: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 20,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1.5,
  },
  statusCardOnline: {
    borderColor: colors.successBorder,
    backgroundColor: '#FAFFFE',
  },
  statusCardOffline: {
    borderColor: colors.border,
    backgroundColor: colors.card,
  },

  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  statusOrb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    flexShrink: 0,
  },
  statusTextGroup: { flex: 1 },
  statusHeadline:  { fontSize: 22, fontWeight: '900' },
  statusSub:       { fontSize: 13, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },

  gateBox: {
    backgroundColor: colors.warningSurface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  gateText: { fontSize: 13, color: '#92400E', lineHeight: 19, fontWeight: '500' },

  toggleBtn: {
    borderRadius: 14,
    paddingVertical: 19,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  goOnlineBtn: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
  },
  goOfflineBtn: {
    backgroundColor: '#5C6B7A',
    shadowColor: '#5C6B7A',
  },
  btnDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  toggleBtnText: { color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 0.3 },

  msgBox:     { marginTop: 14, borderRadius: 12, padding: 13, borderWidth: 1 },
  msgSuccess: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  msgError:   { backgroundColor: colors.dangerSurface,  borderColor: colors.dangerBorder },
  msgText:    { fontSize: 13, fontWeight: '600', lineHeight: 19 },

  // ── Alert cards (permission warning + stale busy) ────────────────────────
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.dangerSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  alertCardWarn: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  alertCardIcon: { paddingTop: 2 },
  alertIcon:     { fontSize: 20 },
  alertCardBody: { flex: 1 },
  alertCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  alertCardText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  alertCardActions: { flexDirection: 'row', gap: 8 },
  alertCardBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  alertCardBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  alertCardBtnOutline: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  alertCardBtnOutlineText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },

  // ── Offers section ────────────────────────────────────────────────────────
  section:       {},
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:  { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  offerErrorBox:  { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 12, padding: 13, marginBottom: 12 },
  offerErrorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  emptyBox: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyIcon:  { fontSize: 32, marginBottom: 12, color: colors.textMuted },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  emptyBody:  { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20, fontWeight: '500' },
});
