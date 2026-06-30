import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { isCorporateEligible, isCorporateSensitiveOrder } from '@/lib/corporateDriver';
import {
  acceptOffer,
  declineOffer,
  expireOffer,
  fetchOfferById,
  getDropoff,
  getOrderFromAttempt,
  getOrderRef,
  getPickup,
  getSecondsRemaining,
  getServiceLabel,
  getStoreName,
} from '@/services/dispatchOffers';
import type { DispatchAttempt } from '@/types/dispatch';
import type { IncomingOfferScreenProps } from '@/types/navigation';
import type { DriverStackParamList, DriverTabParamList } from '@/types/navigation';

// ── Vibration pattern ─────────────────────────────────────────────────────────
// Android: supports a pattern. iOS: single vibrate regardless of pattern arg.
function vibrateAlert() {
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 400, 150, 400, 150, 600]);
  } else {
    Vibration.vibrate();
  }
}

// ── Countdown ring ────────────────────────────────────────────────────────────

type CountdownProps = { secs: number; totalSecs: number };

function CountdownRing({ secs, totalSecs }: CountdownProps) {
  const pct = Math.max(0, Math.min(1, secs / totalSecs));
  const isUrgent = secs <= 15;
  const isWarning = secs > 15 && secs <= 30;
  const ringColor = isUrgent ? colors.danger : isWarning ? colors.warning : colors.success;
  const label = secs <= 0 ? 'Expired' : secs > 60 ? `${Math.ceil(secs / 60)}m` : `${secs}s`;

  return (
    <View style={[ring.wrap, { borderColor: ringColor }]}>
      <Text style={[ring.label, { color: ringColor }]}>{label}</Text>
      <Text style={ring.sub}>{secs > 0 ? 'left' : ''}</Text>
    </View>
  );
}

const ring = StyleSheet.create({
  wrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 18, fontWeight: '900' },
  sub:   { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
});

// ── Detail row ────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={detail.row}>
      <Text style={detail.label}>{label}</Text>
      <Text style={detail.value}>{value}</Text>
    </View>
  );
}

const detail = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  label: { fontSize: 11, fontWeight: '800', color: colors.textMuted, width: 68, letterSpacing: 0.5 },
  value: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
});

// ── Screen states ─────────────────────────────────────────────────────────────

type OfferState = 'loading' | 'active' | 'expired' | 'taken' | 'accepted' | 'declined' | 'not_found';

// ── Main screen ───────────────────────────────────────────────────────────────

export default function IncomingOfferScreen({ route, navigation }: IncomingOfferScreenProps) {
  const { attemptId } = route.params;
  const insets = useSafeAreaInsets();
  const { driverRow } = useAuth();

  const [offerState, setOfferState] = useState<OfferState>('loading');
  const [offer, setOffer]           = useState<DispatchAttempt | null>(null);
  const [processing, setProcessing] = useState<'accept' | 'decline' | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [nowMs, setNowMs]           = useState(Date.now());

  const expiredCalledRef = useRef(false);

  // ── Load offer on mount ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchOfferById(attemptId);
      if (cancelled) return;
      if (!data) {
        setOfferState('not_found');
        return;
      }
      setOffer(data);
      if (data.status === 'accepted') setOfferState('taken');
      else if (data.status === 'expired') setOfferState('expired');
      else if (data.status === 'offered') setOfferState('active');
      else setOfferState('not_found');
    })();
    return () => { cancelled = true; };
  }, [attemptId]);

  // ── Vibrate once when offer is active ────────────────────────────────────
  useEffect(() => {
    if (offerState === 'active') {
      vibrateAlert();
    }
    return () => {
      Vibration.cancel();
    };
  }, [offerState]);

  // ── Countdown clock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (offerState !== 'active') return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [offerState]);

  // ── Expire when countdown hits 0 ────────────────────────────────────────
  const secs      = offer?.expires_at ? getSecondsRemaining(offer.expires_at, nowMs) : Infinity;
  const totalSecs = 90; // matches OFFER_SECONDS in dispatch.ts

  useEffect(() => {
    if (offerState !== 'active') return;
    if (secs <= 0 && !expiredCalledRef.current) {
      expiredCalledRef.current = true;
      Vibration.cancel();
      setOfferState('expired');
      void expireOffer(attemptId);
    }
  }, [secs, offerState, attemptId]);

  // ── Realtime: detect external status change (taken by another mechanism) ─
  useEffect(() => {
    if (offerState !== 'active') return;
    const channel = supabase
      .channel(`offer-status-${attemptId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dispatch_attempts', filter: `id=eq.${attemptId}` },
        (payload) => {
          const newStatus = (payload.new as { status?: string }).status;
          if (newStatus === 'expired') { Vibration.cancel(); setOfferState('expired'); }
          else if (newStatus === 'accepted') { Vibration.cancel(); setOfferState('taken'); }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [attemptId, offerState]);

  // ── Accept ───────────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    if (processing) return;

    // ── Corporate soft gate (defense-in-depth) ───────────────────────────
    // Backend also enforces this in accept_dispatch_attempt RPC
    // (migration 20260703010000_corporate_gate_accept_dispatch.sql).
    if (isCorporateSensitiveOrder(order) && !isCorporateEligible(driverRow)) {
      Alert.alert(
        'Corporate Screening Required',
        'This order requires corporate driver screening. Complete your corporate application in your Profile to accept this type of order.',
      );
      return;
    }

    setProcessing('accept');
    setErrorMsg(null);
    Vibration.cancel();
    const { result, error } = await acceptOffer(attemptId);
    if (error) {
      setErrorMsg(error);
      setProcessing(null);
      return;
    }
    if (result?.status && result.status !== 'accepted') {
      if (result.status === 'already_taken') {
        setOfferState('taken');
      } else {
        setErrorMsg(result.message ?? 'This offer is no longer available.');
        setOfferState('expired');
      }
      setProcessing(null);
      return;
    }
    setOfferState('accepted');
    setProcessing(null);
    // Navigate to DriverTabs → ActiveOrder after a brief success beat
    setTimeout(() => {
      navigation.navigate('DriverTabs', { screen: 'ActiveOrder' });
    }, 600);
  }, [processing, attemptId, navigation]);

  // ── Decline ──────────────────────────────────────────────────────────────
  const handleDecline = useCallback(async () => {
    if (processing) return;
    setProcessing('decline');
    setErrorMsg(null);
    Vibration.cancel();
    const { error } = await declineOffer(attemptId);
    if (error) {
      // Non-fatal — still close the screen
      console.warn('[IncomingOffer] decline error:', error);
    }
    setOfferState('declined');
    setProcessing(null);
    navigation.goBack();
  }, [processing, attemptId, navigation]);

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderTerminalState(icon: string, title: string, body: string) {
    return (
      <View style={styles.terminalWrap}>
        <Text style={styles.terminalIcon}>{icon}</Text>
        <Text style={styles.terminalTitle}>{title}</Text>
        <Text style={styles.terminalBody}>{body}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived order data ────────────────────────────────────────────────────

  const order       = getOrderFromAttempt(offer);
  const serviceLabel = getServiceLabel(order);
  const storeName    = getStoreName(order);
  const pickup       = getPickup(order);
  const dropoff      = getDropoff(order);
  const orderRef     = getOrderRef(order);
  const notes        = (order?.metadata as Record<string, unknown> | null | undefined)?.notes as string | undefined
    ?? (order?.metadata as Record<string, unknown> | null | undefined)?.customer_notes as string | undefined;
  const estimatedFee = (offer?.metadata as Record<string, unknown> | null | undefined)?.estimated_fee as number | undefined;
  const distanceKm   = (offer?.metadata as Record<string, unknown> | null | undefined)?.distance_km_to_pickup as number | undefined;
  const itemCount    = ((order as Record<string, unknown> | null | undefined)?.items as unknown[] | undefined)?.length
    ?? (order?.metadata as Record<string, unknown> | null | undefined)?.item_count as number | undefined;
  const paymentMethod = (order?.metadata as Record<string, unknown> | null | undefined)?.payment_method as string | undefined;
  const isSeniorCare      = order?.service_type === 'senior_care';
  const isCorporateSensitive = isCorporateSensitiveOrder(order);
  const corpBlocked       = isCorporateSensitive && !isCorporateEligible(driverRow);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => {
        // Tapping backdrop = dismiss (same as decline if still active)
        if (offerState === 'active') void handleDecline();
        else navigation.goBack();
      }} />

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
        <View style={styles.handle} />

        {/* ── Loading ── */}
        {offerState === 'loading' && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.loadingText}>Loading offer…</Text>
          </View>
        )}

        {/* ── Not found ── */}
        {offerState === 'not_found' &&
          renderTerminalState('🔍', 'Offer not found', 'This offer may have been cancelled or expired before it reached you.')}

        {/* ── Expired ── */}
        {offerState === 'expired' &&
          renderTerminalState('⏰', 'Offer expired', 'The 90-second window has closed. A new order may be dispatched shortly.')}

        {/* ── Taken ── */}
        {offerState === 'taken' &&
          renderTerminalState('✅', 'Already accepted', 'Another driver accepted this order before you.')}

        {/* ── Accepted ── */}
        {offerState === 'accepted' && (
          <View style={styles.terminalWrap}>
            <Text style={styles.terminalIcon}>🎉</Text>
            <Text style={[styles.terminalTitle, { color: colors.success }]}>Order accepted!</Text>
            <Text style={styles.terminalBody}>Opening your active order…</Text>
            <ActivityIndicator size="small" color={colors.success} style={{ marginTop: 12 }} />
          </View>
        )}

        {/* ── Active offer ── */}
        {offerState === 'active' && offer && (
          <>
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.serviceChip}>
                  <Text style={styles.serviceChipText}>{serviceLabel.toUpperCase()}</Text>
                </View>
                {isSeniorCare && (
                  <View style={[styles.serviceChip, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.serviceChipText, { color: '#92400E' }]}>CARE</Text>
                  </View>
                )}
                {isCorporateSensitive && !isSeniorCare && (
                  <View style={[styles.serviceChip, { backgroundColor: '#E0F2FE' }]}>
                    <Text style={[styles.serviceChipText, { color: '#0284C7' }]}>CORPORATE</Text>
                  </View>
                )}
              </View>
              {offer.expires_at && (
                <CountdownRing secs={secs === Infinity ? totalSecs : secs} totalSecs={totalSecs} />
              )}
            </View>

            <Text style={styles.sheetTitle}>New Delivery Request</Text>
            {orderRef && <Text style={styles.refText}>{orderRef}</Text>}

            {/* Details card */}
            <View style={styles.detailCard}>
              <Row label="PICKUP"   value={storeName ?? pickup} />
              {storeName && pickup && storeName !== pickup && (
                <Row label="ADDRESS" value={pickup} />
              )}
              <Row label="DROP-OFF" value={dropoff} />
              {distanceKm != null && (
                <Row label="DISTANCE" value={`~${distanceKm.toFixed(1)} km to pickup`} />
              )}
              {itemCount != null && (
                <Row label="ITEMS" value={`${itemCount} item${itemCount !== 1 ? 's' : ''}`} />
              )}
              {paymentMethod && (
                <Row label="PAYMENT" value={paymentMethod.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
              )}
              {estimatedFee != null && (
                <Row label="EST. EARN" value={`JMD ${estimatedFee.toLocaleString()}`} />
              )}
              {notes && (
                <Row label="NOTES" value={notes} />
              )}
              {isSeniorCare && (
                <View style={styles.careWarn}>
                  <Text style={styles.careWarnText}>⚠️ Senior care order — handle with extra care.</Text>
                </View>
              )}
              {corpBlocked && (
                <View style={styles.corpBlockWarn}>
                  <Text style={styles.corpBlockWarnText}>
                    Corporate screening required. Complete your corporate application in Profile to accept this order.
                  </Text>
                </View>
              )}
            </View>

            {/* Error */}
            {errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            {/* Accept / Decline */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.declineBtn, processing === 'decline' && styles.btnDisabled]}
                onPress={handleDecline}
                disabled={!!processing}
                activeOpacity={0.8}
              >
                {processing === 'decline'
                  ? <ActivityIndicator size="small" color={colors.danger} />
                  : <Text style={styles.declineBtnText}>Decline</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptBtn, (processing === 'accept' || corpBlocked) && styles.btnDisabled]}
                onPress={handleAccept}
                disabled={!!processing || corpBlocked}
                activeOpacity={0.85}
              >
                {processing === 'accept'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.acceptBtnText}>Accept</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,20,40,0.55)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: { flexDirection: 'row', gap: 8, flex: 1, flexWrap: 'wrap' },
  serviceChip: {
    backgroundColor: colors.brand,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  serviceChipText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },

  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  refText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 14,
  },

  // ── Detail card ──────────────────────────────────────────────────────────
  detailCard: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  careWarn: {
    marginTop: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  careWarnText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  corpBlockWarn: {
    marginTop: 8,
    backgroundColor: colors.dangerSurface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  corpBlockWarnText: { fontSize: 12, color: colors.danger, fontWeight: '600' },

  // ── Error ────────────────────────────────────────────────────────────────
  errorBox: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },

  // ── Buttons ──────────────────────────────────────────────────────────────
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  declineBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: '#fff',
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  btnDisabled:    { opacity: 0.5 },
  declineBtnText: { color: colors.danger, fontWeight: '800', fontSize: 15 },
  acceptBtnText:  { color: '#fff', fontWeight: '900', fontSize: 16 },

  // ── Loading ──────────────────────────────────────────────────────────────
  loadingWrap: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.textMuted, fontWeight: '600' },

  // ── Terminal states ───────────────────────────────────────────────────────
  terminalWrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 8 },
  terminalIcon:  { fontSize: 44, marginBottom: 12 },
  terminalTitle: { fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginBottom: 6 },
  terminalBody:  { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  closeBtn: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
});
