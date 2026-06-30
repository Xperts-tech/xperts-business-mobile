import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { supabase } from '@/lib/supabase';
import {
  AT_PICKUP_STATUSES,
  IN_TRANSIT_STATUSES,
  advanceOrderStage,
  confirmCashCollected,
  customerName as getCustomerName,
  customerPhone as getCustomerPhone,
  dropoffAddress as getDropoffAddress,
  fetchActiveOrder,
  getActionButton,
  isOrderDone,
  itemBackup,
  itemDisplayName,
  itemNote,
  itemQty,
  itemVariantFull,
  markStoreOrderPlaced,
  orderNotes,
  orderRef,
  orderTypeLabel,
  pickupAddress as getPickupAddress,
  pickupNavLocation,
  dropoffNavLocation,
  statusGroup,
  statusLabel,
  storeName as getStoreName,
  verifyItem,
} from '@/services/activeOrder';
import type { ActionButton } from '@/services/activeOrder';
import {
  createPurchaseApprovalRequest,
  isPurchaseBasedOrder,
  listOrderReceipts,
  markPurchaseReceiptUploaded,
  pickReceiptImage,
  submitPurchaseTotal,
  uploadDeliveryProof,
  uploadOrderReceipt,
} from '@/services/receiptService';
import { buildGoogleMapsUrl, buildWazeUrl } from '@/utils/navigationLinks';
import {
  customerHasAppAccount,
  getChatDecision,
  getOrCreateOrderConversation,
  isWhatsAppOrder,
} from '@/services/messageService';
import type { ActiveOrder, OrderItem, OrderReceipt } from '@/types/order';
import type { ActiveOrderScreenProps, DriverStackParamList } from '@/types/navigation';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// ── Issue reasons (mirrors web DriverActiveOrderPage ISSUE_REASONS) ────────────
const ISSUE_REASONS = [
  'Traffic delay',
  'Item not ready',
  'Wrong address',
  'Vehicle issue',
  'Customer not responding',
  'Weather',
  'Other',
];

// ── Mission step definitions (mirrors missionStateResolver.js) ────────────────
const STEPS_PARTNER = [
  { key: 'accept',     label: 'Accept' },
  { key: 'go_store',   label: 'Go to store' },
  { key: 'verify',     label: 'Verify' },
  { key: 'deliver',    label: 'Deliver' },
  { key: 'complete',   label: 'Complete' },
];

const STEPS_NON_PARTNER = [
  { key: 'accept',       label: 'Accept' },
  { key: 'go_store',     label: 'Go to store' },
  { key: 'place_order',  label: 'Place order' },
  { key: 'verify',       label: 'Verify' },
  { key: 'deliver',      label: 'Deliver' },
  { key: 'complete',     label: 'Complete' },
];

function missionStepIndex(
  status: string,
  isNonPartner: boolean,
  storeOrderPlaced: boolean,
): number {
  switch (status) {
    case 'assigned':
    case 'accepted':
    case 'accepted_by_driver':
    case 'assigned_to_driver':
    case 'driver_assigned':
    case 'en_route_to_pickup':
    case 'arrived_at_pickup':
    case 'driver_arriving':
      return 1;
    case 'in_progress':
      if (isNonPartner && !storeOrderPlaced) return 2;
      return isNonPartner ? 3 : 2;
    case 'picked_up':
    case 'rider_picked_up':
    case 'en_route_to_dropoff':
    case 'on_the_way':
      return isNonPartner ? 4 : 3;
    case 'delivered':
    case 'completed':
      return isNonPartner ? 5 : 4;
    default:
      return 1;
  }
}

// ── Status theme ──────────────────────────────────────────────────────────────
type Theme = { bg: string; text: string; border: string; icon: string };

const STATUS_THEMES: Record<string, Theme> = {
  pending:  { bg: colors.warningSurface,  text: '#92400E',    border: colors.warningBorder,  icon: '⏳' },
  enroute:  { bg: colors.brandSurface,    text: colors.brand, border: '#C5D5EA',             icon: '🚗' },
  active:   { bg: colors.brandSurface,    text: colors.brand, border: '#C5D5EA',             icon: '📋' },
  nearend:  { bg: colors.successSurface,  text: '#166534',    border: colors.successBorder,  icon: '📦' },
  done:     { bg: colors.successSurface,  text: '#166534',    border: colors.successBorder,  icon: '✅' },
};

// ── Small primitives ──────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={prim.row}>
      <Text style={prim.label}>{label.toUpperCase()}</Text>
      <Text style={prim.value}>{value}</Text>
    </View>
  );
}

const prim = StyleSheet.create({
  row:   { marginBottom: 14 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  value: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, lineHeight: 22 },
});

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }} />;
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[card.wrap, style]}>{children}</View>;
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
});

function CardTitle({ children }: { children: string }) {
  return <Text style={ct.text}>{children}</Text>;
}
const ct = StyleSheet.create({
  text: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: colors.textMuted, marginBottom: 14, textTransform: 'uppercase' },
});

// ── Mission stepper ───────────────────────────────────────────────────────────

function MissionStepper({
  steps,
  currentIndex,
}: {
  steps: { key: string; label: string }[];
  currentIndex: number;
}) {
  return (
    <View style={stepSt.wrap}>
      {steps.map((step, i) => {
        const done   = i < currentIndex;
        const active = i === currentIndex;
        return (
          <View key={step.key} style={stepSt.stepGroup}>
            <View style={[stepSt.circle, done && stepSt.circleDone, active && stepSt.circleActive]}>
              <Text style={[stepSt.circleText, done && stepSt.circleTextDone, active && stepSt.circleTextActive]}>
                {done ? '✓' : String(i + 1)}
              </Text>
            </View>
            <Text
              style={[stepSt.label, active && stepSt.labelActive, done && stepSt.labelDone]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
            {i < steps.length - 1 ? (
              <View style={[stepSt.connector, done && stepSt.connectorDone]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const stepSt = StyleSheet.create({
  wrap:              { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  stepGroup:         { alignItems: 'center', flex: 1, position: 'relative' },
  circle:            { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  circleDone:        { backgroundColor: colors.brand, borderColor: colors.brand },
  circleActive:      { backgroundColor: '#E8FFF6', borderColor: colors.brand, borderWidth: 2 },
  circleText:        { fontSize: 11, fontWeight: '900', color: '#94A3B8' },
  circleTextDone:    { color: '#fff' },
  circleTextActive:  { color: colors.brand },
  label:             { fontSize: 9, fontWeight: '700', color: '#94A3B8', textAlign: 'center', lineHeight: 12 },
  labelActive:       { color: colors.brand, fontWeight: '900' },
  labelDone:         { color: colors.brand },
  connector:         { position: 'absolute', top: 15, left: '55%', right: '-55%', height: 2, backgroundColor: '#E2E8F0', zIndex: -1 },
  connectorDone:     { backgroundColor: colors.brand },
});

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, index }: { item: OrderItem; index: number }) {
  const name    = itemDisplayName(item);
  const qty     = itemQty(item);
  const variant = itemVariantFull(item);
  const note    = itemNote(item);
  const backup  = itemBackup(item);

  return (
    <View style={itemSt.row}>
      <View style={itemSt.qtyBadge}>
        <Text style={itemSt.qtyText}>{qty ?? index + 1}</Text>
      </View>
      <View style={itemSt.details}>
        <Text style={itemSt.name}>{name}</Text>
        {variant ? <Text style={itemSt.sub}>{variant}</Text> : null}
        {note    ? <Text style={itemSt.note}>{note}</Text>   : null}
        {backup  ? (
          <View style={itemSt.backupRow}>
            <Text style={itemSt.backupLabel}>BACKUP </Text>
            <Text style={itemSt.backupValue}>{backup}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const itemSt = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  qtyBadge:   { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0, marginTop: 1 },
  qtyText:    { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  details:    { flex: 1 },
  name:       { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  sub:        { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  note:       { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  backupRow:  { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  backupLabel:{ fontSize: 9, fontWeight: '900', letterSpacing: 0.6, color: '#92400E', backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  backupValue:{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginLeft: 6 },
});

// ── Phone row ─────────────────────────────────────────────────────────────────

function PhoneRow({ phone }: { phone: string }) {
  const dialPhone = () => {
    const digits     = phone.replace(/\D/g, '');
    const normalized = digits.length === 7 ? `+1876${digits}` : digits.length === 10 ? `+1${digits}` : `+${digits}`;
    void Linking.openURL(`tel:${normalized}`);
  };

  return (
    <TouchableOpacity style={phoneSt.row} onPress={dialPhone} activeOpacity={0.7}>
      <View style={phoneSt.details}>
        <Text style={prim.label}>PHONE</Text>
        <Text style={phoneSt.number}>{phone}</Text>
      </View>
      <View style={phoneSt.callBtn}>
        <Text style={phoneSt.callIcon}>📞</Text>
      </View>
    </TouchableOpacity>
  );
}

const phoneSt = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  details: { flex: 1 },
  number:  { fontSize: 15, fontWeight: '700', color: colors.brand },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center', justifyContent: 'center' },
  callIcon:{ fontSize: 16 },
});

// ── Navigation buttons ────────────────────────────────────────────────────────

async function openNav(url: string) {
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    Alert.alert('App not available', 'Could not open the maps app. Make sure Google Maps or Waze is installed.');
    return;
  }
  await Linking.openURL(url);
}

function NavButtons({ gmUrl, wazeUrl }: { gmUrl: string | null; wazeUrl: string | null }) {
  if (!gmUrl && !wazeUrl) return null;
  return (
    <View style={navSt.row}>
      {gmUrl ? (
        <TouchableOpacity style={navSt.btn} onPress={() => void openNav(gmUrl)} activeOpacity={0.75}>
          <Text style={navSt.icon}>🗺️</Text>
          <Text style={navSt.label}>Google Maps</Text>
        </TouchableOpacity>
      ) : null}
      {wazeUrl ? (
        <TouchableOpacity style={navSt.btn} onPress={() => void openNav(wazeUrl)} activeOpacity={0.75}>
          <Text style={navSt.icon}>🔵</Text>
          <Text style={navSt.label}>Waze</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const navSt = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' },
  icon:  { fontSize: 15 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ActiveOrderScreen({ navigation }: ActiveOrderScreenProps) {
  const { user, driverRow } = useAuth();

  const [order, setOrder]             = useState<ActiveOrder | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [advancing, setAdvancing]     = useState(false);
  const [actionMsg, setActionMsg]     = useState<{ text: string; isError: boolean } | null>(null);
  const clearMsgRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Item verification state
  const [itemVerifications, setItemVerifications] = useState<Record<string, string>>({});
  const [seededOrderId, setSeededOrderId]         = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId]       = useState<string | null>(null);
  const [noteInput, setNoteInput]                 = useState('');
  const [savingItemId, setSavingItemId]           = useState<string | null>(null);
  const [itemSaveError, setItemSaveError]         = useState<string | null>(null);
  const [noItemsConfirmed, setNoItemsConfirmed]   = useState(false);

  // Purchase cost + receipt state
  const [actualTotalInput, setActualTotalInput]   = useState('');
  const [savingTotal, setSavingTotal]             = useState(false);
  const [totalError, setTotalError]               = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading]   = useState(false);
  const [uploadedReceipts, setUploadedReceipts]   = useState<OrderReceipt[]>([]);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [approvalLink, setApprovalLink]           = useState<string | null>(null);
  const [approvalMessage, setApprovalMessage]     = useState<string | null>(null);
  const [purchaseMsg, setPurchaseMsg]             = useState<{ text: string; isError: boolean } | null>(null);
  const purchaseMsgRef                            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Proof of delivery state
  const [proofUrl, setProofUrl]           = useState<string>('');
  const [proofUploading, setProofUploading] = useState(false);
  const [proofMsg, setProofMsg]           = useState<{ text: string; isError: boolean } | null>(null);
  const proofMsgRef                       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Non-partner: mark order placed
  const [storeOrderPlacing, setStoreOrderPlacing] = useState(false);

  // Cash collection
  const [cashConfirming, setCashConfirming] = useState(false);
  const [cashConfirmDone, setCashConfirmDone] = useState(false);

  // Issue report
  const [issueOpen, setIssueOpen]     = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [issueNote, setIssueNote]     = useState('');
  const [issueBusy, setIssueBusy]     = useState(false);
  const [issueMsg, setIssueMsg]       = useState<{ text: string; isError: boolean } | null>(null);

  // Communication: open in-app chat
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError]     = useState<string | null>(null);

  const driverRowId = driverRow?.id ?? null;

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchOrder = useCallback(async (isRefresh = false) => {
    if (!driverRowId) {
      setOrder(null);
      setLoading(false);
      return;
    }
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const { order: fetched, error: fetchErr } = await fetchActiveOrder(driverRowId);
    if (fetchErr) {
      setError(fetchErr);
    } else {
      setOrder(fetched);
      if (fetched?.metadata?.proof_url) {
        setProofUrl(fetched.metadata.proof_url as string);
      }
      if (fetched?.id && isPurchaseBasedOrder(fetched)) {
        const { receipts } = await listOrderReceipts(fetched.id);
        setUploadedReceipts(receipts);
      }
      if (fetched?.purchase_record?.actual_store_total != null) {
        setActualTotalInput(String(fetched.purchase_record.actual_store_total));
      }
    }

    if (!isRefresh) setLoading(false);
    else setRefreshing(false);
  }, [driverRowId]);

  useEffect(() => { void fetchOrder(); }, [fetchOrder]);

  const handleRefresh = useCallback(() => { void fetchOrder(true); }, [fetchOrder]);

  // ── Seed item verification state from server on first load ────────────────
  useEffect(() => {
    if (!order?.id || !Array.isArray(order.items) || seededOrderId === order.id) return;
    const initial: Record<string, string> = {};
    for (const item of order.items) {
      if (item.id && item.driver_verification_status && item.driver_verification_status !== 'pending') {
        initial[item.id] = item.driver_verification_status;
      }
    }
    setItemVerifications(initial);
    setSeededOrderId(order.id);
  }, [order?.id, order?.items, seededOrderId]);

  // ── Item verification handlers (preserved from MVP) ───────────────────────
  const handleVerifyItem = useCallback(async (item: OrderItem) => {
    if (!item.id || !order?.id) return;
    setItemVerifications((prev) => ({ ...prev, [item.id!]: 'verified' }));
    setSavingItemId(item.id);
    setItemSaveError(null);
    const { error: saveErr } = await verifyItem({
      orderId: order.id,
      itemId: item.id,
      status: 'verified',
      resolutionType: 'verified',
    });
    setSavingItemId(null);
    if (saveErr) {
      setItemVerifications((prev) => { const n = { ...prev }; delete n[item.id!]; return n; });
      setItemSaveError(saveErr);
    }
  }, [order?.id]);

  const handleUnavailableExpand = useCallback((item: OrderItem) => {
    setExpandedItemId(item.id ?? null);
    setNoteInput('');
  }, []);

  const handleUnavailableSave = useCallback(async (item: OrderItem) => {
    if (!item.id || !order?.id) return;
    setItemVerifications((prev) => ({ ...prev, [item.id!]: 'admin_reported' }));
    setExpandedItemId(null);
    setSavingItemId(item.id);
    setItemSaveError(null);
    const { error: saveErr } = await verifyItem({
      orderId: order.id,
      itemId: item.id,
      status: 'admin_reported',
      resolutionType: 'report_admin',
      payload: { note: noteInput.trim() || null },
    });
    setSavingItemId(null);
    setNoteInput('');
    if (saveErr) {
      setItemVerifications((prev) => { const n = { ...prev }; delete n[item.id!]; return n; });
      setItemSaveError(saveErr);
    }
  }, [order?.id, noteInput]);

  const handleVerificationChange = useCallback((item: OrderItem) => {
    if (!item.id) return;
    const current = itemVerifications[item.id];
    if (current === 'verified') {
      setItemVerifications((prev) => { const n = { ...prev }; delete n[item.id!]; return n; });
    } else {
      setExpandedItemId(item.id);
      setNoteInput('');
    }
  }, [itemVerifications]);

  // ── Action message helpers ─────────────────────────────────────────────────
  function showActionMsg(text: string, isError: boolean) {
    if (clearMsgRef.current) clearTimeout(clearMsgRef.current);
    setActionMsg({ text, isError });
    clearMsgRef.current = setTimeout(() => setActionMsg(null), 5000);
  }

  function showPurchaseMsg(text: string, isError: boolean) {
    if (purchaseMsgRef.current) clearTimeout(purchaseMsgRef.current);
    setPurchaseMsg({ text, isError });
    purchaseMsgRef.current = setTimeout(() => setPurchaseMsg(null), 5000);
  }

  // ── Purchase total handler (preserved) ────────────────────────────────────
  const handleSaveTotal = useCallback(async () => {
    if (!order?.id || savingTotal) return;
    const parsed = parseFloat(String(actualTotalInput).replace(/,/g, ''));
    if (!actualTotalInput || Number.isNaN(parsed) || parsed <= 0) {
      setTotalError('Enter a valid amount greater than 0.');
      return;
    }
    setTotalError(null);
    setSavingTotal(true);
    const { error: totalErr } = await submitPurchaseTotal(order.id, parsed);
    setSavingTotal(false);
    if (totalErr) {
      setTotalError(totalErr);
      return;
    }
    showPurchaseMsg('Store total saved.', false);
    void fetchOrder(true);
  }, [order?.id, actualTotalInput, savingTotal, fetchOrder]);

  // ── Receipt upload handler (preserved) ────────────────────────────────────
  const handlePickAndUpload = useCallback(async () => {
    if (!order?.id || !user?.id || receiptUploading) return;
    setReceiptUploading(true);
    const picked = await pickReceiptImage();
    if (!picked) { setReceiptUploading(false); return; }
    const { error: uploadErr } = await uploadOrderReceipt({
      orderId:  order.id,
      userId:   user.id,
      driverId: driverRowId,
      uri:      picked.uri,
      mimeType: picked.mimeType,
      fileName: picked.fileName,
    });
    if (uploadErr) {
      showPurchaseMsg(uploadErr, true);
    } else {
      await markPurchaseReceiptUploaded(order.id);
      showPurchaseMsg('Receipt uploaded.', false);
      void fetchOrder(true);
    }
    setReceiptUploading(false);
  }, [order?.id, user?.id, driverRowId, receiptUploading, fetchOrder]);

  // ── Purchase approval handler (preserved) ─────────────────────────────────
  const handleRequestApproval = useCallback(async () => {
    if (!order?.id || requestingApproval) return;
    setRequestingApproval(true);
    const { data: approvalData, error: approvalErr } = await createPurchaseApprovalRequest(order.id);
    setRequestingApproval(false);
    if (approvalErr) {
      showPurchaseMsg(approvalErr, true);
      return;
    }
    setApprovalLink(approvalData?.link ?? null);
    setApprovalMessage(approvalData?.message ?? null);
    void fetchOrder(true);
  }, [order?.id, requestingApproval, fetchOrder]);

  // ── Proof of delivery (preserved) ─────────────────────────────────────────
  function showProofMsg(text: string, isError: boolean) {
    if (proofMsgRef.current) clearTimeout(proofMsgRef.current);
    setProofMsg({ text, isError });
    proofMsgRef.current = setTimeout(() => setProofMsg(null), 5000);
  }

  const handlePickAndUploadProof = useCallback(async () => {
    if (!order?.id || proofUploading) return;
    setProofUploading(true);
    const picked = await pickReceiptImage();
    if (!picked) { setProofUploading(false); return; }
    const { publicUrl, error: proofErr } = await uploadDeliveryProof({
      orderId:         order.id,
      driverId:        driverRowId ?? 'driver',
      currentMetadata: order.metadata ?? null,
      uri:             picked.uri,
      mimeType:        picked.mimeType,
    });
    setProofUploading(false);
    if (proofErr) {
      showProofMsg(proofErr, true);
      return;
    }
    setProofUrl(publicUrl ?? '');
    showProofMsg('Proof uploaded. You can now confirm delivery.', false);
    void fetchOrder(true);
  }, [order?.id, order?.metadata, driverRowId, proofUploading, fetchOrder]);

  // ── Non-partner: mark store order placed ──────────────────────────────────
  const handleMarkStoreOrderPlaced = useCallback(async () => {
    if (!order?.id || storeOrderPlacing) return;
    setStoreOrderPlacing(true);
    setActionMsg(null);
    const { error: placeErr } = await markStoreOrderPlaced(order.id);
    setStoreOrderPlacing(false);
    if (placeErr) {
      showActionMsg(placeErr, true);
      return;
    }
    showActionMsg('Order confirmed at counter.', false);
    void fetchOrder(true);
  }, [order?.id, storeOrderPlacing, fetchOrder]);

  // ── Cash collection ────────────────────────────────────────────────────────
  const handleConfirmCash = useCallback(async () => {
    if (!order?.id || cashConfirming) return;
    setCashConfirming(true);
    const driverId = driverRowId ?? user?.id ?? null;
    const expectedAmount = (order.metadata?.payment as Record<string, unknown> | null)?.cash_expected_amount as number ?? 0;
    const { error: cashErr } = await confirmCashCollected(order.id, driverId, expectedAmount);
    if (cashErr) {
      showActionMsg(cashErr, true);
    } else {
      setCashConfirmDone(true);
      setOrder((prev) => prev ? {
        ...prev,
        payment_status: 'cash_collected_pending_admin',
        metadata: {
          ...(prev.metadata ?? {}),
          payment: {
            ...((prev.metadata?.payment as Record<string, unknown>) ?? {}),
            status: 'cash_collected_pending_admin',
            cash_collection_status: 'driver_confirmed',
          },
        },
      } : prev);
    }
    setCashConfirming(false);
  }, [order, driverRowId, user?.id, cashConfirming]);

  // ── Issue report ──────────────────────────────────────────────────────────
  const handleIssueSubmit = useCallback(async () => {
    if (!issueReason || !order?.id || issueBusy) return;
    setIssueBusy(true);
    const description = issueNote.trim() ? `${issueReason}: ${issueNote.trim()}` : issueReason;
    const { error: issueErr } = await supabase.from('order_timeline_events').insert({
      order_id:   order.id,
      actor_id:   driverRowId,
      event_type: 'issue_reported',
      title:      `Issue reported: ${issueReason}`,
      description,
      metadata:   { reason: issueReason, note: issueNote.trim() || '', driver_id: driverRowId, source: 'driver_active_order' },
    });
    setIssueBusy(false);
    if (issueErr) {
      setIssueMsg({ text: issueErr.message || 'Unable to report issue.', isError: true });
    } else {
      setIssueReason('');
      setIssueNote('');
      setIssueOpen(false);
      setIssueMsg({ text: 'Issue reported. Xperts has been notified.', isError: false });
      setTimeout(() => setIssueMsg(null), 4000);
    }
  }, [issueReason, issueNote, order?.id, driverRowId, issueBusy]);

  // ── In-app chat ───────────────────────────────────────────────────────────
  const handleOpenChat = useCallback(async () => {
    if (!order?.id || !driverRow?.id || chatLoading) return;
    setChatLoading(true);
    setChatError(null);
    const { conversation, error: chatErr } = await getOrCreateOrderConversation(
      order.id,
      driverRow.id,
      order.customer_id ?? null,
    );
    setChatLoading(false);
    if (chatErr || !conversation) {
      setChatError(chatErr ?? 'Could not open conversation.');
      return;
    }
    const stackNav = navigation.getParent<NativeStackNavigationProp<DriverStackParamList>>();
    stackNav?.navigate('OrderChat', {
      orderId: order.id,
      conversationId: conversation.id,
      customerName: getCustomerName(order) ?? null,
      orderRef: orderRef(order),
      customerId: order.customer_id ?? null,
    });
  }, [order, driverRow?.id, chatLoading, navigation]);

  // ── Primary order advancement (preserved with gates) ──────────────────────
  const handleAdvance = useCallback(async (button: ActionButton) => {
    if (!order || advancing || !user?.id) return;

    // Gate: "Mark Picked Up" — items + purchase requirements
    if (button.nextStatus === 'picked_up') {
      const orderItems = order.items ?? [];
      const allDecided = orderItems.length === 0
        ? noItemsConfirmed
        : orderItems.every((it) => it.id && itemVerifications[it.id] !== undefined);
      if (!allDecided) {
        const pending = orderItems.filter((it) => !it.id || !itemVerifications[it.id]).length;
        showActionMsg(`Verify all items first — ${pending} item${pending !== 1 ? 's' : ''} remaining.`, true);
        return;
      }

      const purchaseRequired = Boolean(
        order.purchase_required || order.order_mode === 'non_partner' || order.place_order_required,
      );
      const pr = order.purchase_record;
      if (purchaseRequired) {
        if (pr?.actual_store_total == null) {
          showActionMsg('Enter the actual store total before confirming pickup.', true);
          return;
        }
        if (pr.status === 'receipt_required') {
          showActionMsg('Upload a receipt before confirming pickup.', true);
          return;
        }
        if (pr.status === 'over_limit_pending_approval') {
          showActionMsg('Waiting for customer or admin approval of the over-limit total.', true);
          return;
        }
        if (pr.status === 'rejected') {
          showActionMsg('Purchase total was rejected — contact admin before proceeding.', true);
          return;
        }
      }
    }

    // Gate: "Mark Delivered" — proof of delivery required
    if (button.nextStatus === 'delivered') {
      const isProofReady = Boolean(proofUrl) || order.metadata?.driver_stage === 'proof_uploaded';
      if (!isProofReady) {
        showActionMsg('Upload proof of delivery before confirming delivery.', true);
        return;
      }
    }

    setAdvancing(true);
    setActionMsg(null);

    const { error: advErr } = await advanceOrderStage({
      orderId:         order.id,
      userId:          user.id,
      currentMetadata: order.metadata ?? null,
      currentStatus:   order.status,
      nextStatus:      button.nextStatus,
      nextDriverStage: button.nextDriverStage,
      description:     button.description,
    });

    if (advErr) {
      showActionMsg(advErr, true);
      setAdvancing(false);
      return;
    }

    setOrder((prev) => prev ? { ...prev, status: button.nextStatus } : prev);
    showActionMsg(`Status updated: ${button.nextStatus.replace(/_/g, ' ')}`, false);
    setAdvancing(false);
    void fetchOrder(true);
  }, [order, advancing, user?.id, fetchOrder, noItemsConfirmed, itemVerifications, proofUrl]);

  // ── Realtime — orders filtered to this driver ─────────────────────────────
  useEffect(() => {
    if (!driverRowId) return;

    const channel = supabase
      .channel(`active-order-${driverRowId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `assigned_driver_id=eq.${driverRowId}` }, () => {
        void fetchOrder(true);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [driverRowId, fetchOrder]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.centerText}>Loading active order…</Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.center}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
      >
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchOrder()} activeOpacity={0.8}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!order) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
      >
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyTitle}>No active order right now.</Text>
        <Text style={styles.emptySubtitle}>
          Once you accept a delivery request, your order details will appear here.
        </Text>
      </ScrollView>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const group         = statusGroup(order.status);
  const theme         = STATUS_THEMES[group];
  const ref           = orderRef(order);
  const typeLabel     = orderTypeLabel(order);
  const statusLbl     = statusLabel(order.status);
  const pickup        = getPickupAddress(order);
  const dropoff       = getDropoffAddress(order);
  const pickupNav     = pickupNavLocation(order);
  const dropoffNav    = dropoffNavLocation(order);
  const pickupGmUrl   = buildGoogleMapsUrl(pickupNav);
  const pickupWazeUrl = buildWazeUrl(pickupNav);
  const dropoffGmUrl  = buildGoogleMapsUrl(dropoffNav);
  const dropoffWazeUrl = buildWazeUrl(dropoffNav);
  const cName         = getCustomerName(order);
  const cPhone        = getCustomerPhone(order);
  const store         = getStoreName(order);
  const notes         = orderNotes(order);
  const orderItems    = order.items ?? [];
  const isDone        = isOrderDone(order.status);

  // Non-partner flow
  const isNonPartner    = order.order_mode === 'non_partner' || Boolean(order.place_order_required);
  const storeOrderPlaced = Boolean(order.store_order_placed_at);
  const awaitingPlacement = isNonPartner && order.status === 'in_progress' && !storeOrderPlaced;

  // Mission stepper
  const missionSteps = isNonPartner ? STEPS_NON_PARTNER : STEPS_PARTNER;
  const missionIndex = missionStepIndex(order.status, isNonPartner, storeOrderPlaced);

  // Item verification
  const showVerification = AT_PICKUP_STATUSES.has(order.status) && !awaitingPlacement;
  const pendingCount     = orderItems.filter((it) => !it.id || !itemVerifications[it.id]).length;
  const allItemsDecided  = orderItems.length === 0 ? noItemsConfirmed : pendingCount === 0;

  // CTA button — non-partner override or standard action button
  let ctaLabel: string | null = null;
  let ctaHandler: (() => void) | null = null;
  let ctaDisabled = false;
  let ctaReason: string | null = null;
  let ctaBusy = advancing;

  if (!isDone) {
    if (awaitingPlacement) {
      ctaLabel   = storeOrderPlacing ? 'Confirming…' : 'Order placed at counter';
      ctaHandler = () => void handleMarkStoreOrderPlaced();
      ctaBusy    = storeOrderPlacing;
    } else {
      const actionButton = getActionButton(order.status);
      if (actionButton) {
        ctaLabel   = actionButton.label;
        ctaHandler = () => void handleAdvance(actionButton);

        // Compute disabled reason (mirrors missionStateResolver.js gates)
        if (actionButton.nextStatus === 'picked_up') {
          if (!allItemsDecided && orderItems.length > 0) {
            ctaDisabled = true;
            ctaReason   = `Verify all ${pendingCount} item${pendingCount !== 1 ? 's' : ''} first`;
          }
          const pr = order.purchase_record;
          const purchaseRequired = Boolean(order.purchase_required || isNonPartner || order.place_order_required);
          if (!ctaDisabled && purchaseRequired && pr?.actual_store_total == null) {
            ctaDisabled = true;
            ctaReason   = 'Enter actual store total to continue';
          }
          if (!ctaDisabled && pr?.status === 'receipt_required') {
            ctaDisabled = true;
            ctaReason   = 'Upload receipt to continue';
          }
          if (!ctaDisabled && pr?.status === 'over_limit_pending_approval') {
            ctaDisabled = true;
            ctaReason   = 'Waiting for approval';
          }
          if (!ctaDisabled && pr?.status === 'rejected') {
            ctaDisabled = true;
            ctaReason   = 'Resolve purchase issue to continue';
          }
        }
        if (actionButton.nextStatus === 'delivered') {
          const proofReady = Boolean(proofUrl) || order.metadata?.driver_stage === 'proof_uploaded';
          if (!proofReady) {
            ctaDisabled = true;
            ctaReason   = 'Upload proof of delivery first';
          }
        }
      }
    }
  }

  // Payment & receipt card visibility
  const purchaseRequired = Boolean(order.purchase_required || isNonPartner || order.place_order_required);
  const showPaymentCard  = purchaseRequired && AT_PICKUP_STATUSES.has(order.status) && !awaitingPlacement;
  const pr               = order.purchase_record;
  const approvalRequest  = order.purchase_approval_request;
  const spendingLimit    = order.spending_limit_amount ?? pr?.spending_limit_amount ?? null;
  const actualStoreTotal = pr?.actual_store_total ?? null;
  const purchaseStatus   = pr?.status ?? null;
  const approvalStatus   = approvalRequest?.status ?? null;
  const isOverLimit      = purchaseStatus === 'over_limit_pending_approval';
  const hasReceipts      = uploadedReceipts.length > 0;
  const difference       =
    typeof actualStoreTotal === 'number' && typeof spendingLimit === 'number'
      ? actualStoreTotal - spendingLimit
      : null;

  // Proof of delivery section
  const showProofSection = IN_TRANSIT_STATUSES.has(order.status);
  const proofReady       = Boolean(proofUrl) || order.metadata?.driver_stage === 'proof_uploaded';

  // Section D: Payment & Cost
  const meta              = order.metadata ?? {};
  const rawPayMethod      = (meta.payment_method as string | null) ?? (meta.payment as Record<string, unknown> | null)?.method as string | null ?? order.payment_method ?? null;
  const metaPayStatus     = order.payment_status ?? (meta.payment as Record<string, unknown> | null)?.status as string | null ?? null;
  const cashExpectedAmt   = (meta.payment as Record<string, unknown> | null)?.cash_expected_amount as number | null ?? null;
  const orderValue        = order.final_price ?? order.price_estimate ?? order.total_amount ?? order.delivery_fee ?? null;

  // Section E: Delivery Instructions
  const safetyPin    = (meta.safety_pin as string | null) ?? (meta.delivery_pin as string | null) ?? null;
  const proofRequired = Boolean(meta.proof_of_delivery_required ?? meta.requires_signature);
  const cd            = (meta.errand_details as Record<string, unknown>) ?? {};
  const isCare        =
    meta.service_type === 'senior_care' ||
    (cd as Record<string, unknown>).service_family === 'xperts_care' ||
    Boolean((cd as Record<string, unknown>).is_sensitive_care_request) ||
    (cd as Record<string, unknown>).errand_subtype === 'senior_care';

  // Completed state
  const showCompleted = order.status === 'completed';

  // Communication channel decision
  const chatDecision = getChatDecision(order);
  const waPhone      = cPhone ? cPhone.replace(/[^\d+]/g, '') : null;
  const waPhoneFull  = waPhone && !waPhone.startsWith('+') && waPhone.length <= 7
    ? `18767${waPhone}` : waPhone;
  const waUrl        = waPhoneFull ? `https://wa.me/${waPhoneFull}` : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.outer}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, !isDone && ctaLabel ? { paddingBottom: 110 } : undefined]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
      >
        {/* Mission stepper — always visible while order is active */}
        {!isDone ? <MissionStepper steps={missionSteps} currentIndex={missionIndex} /> : null}

        {/* Completed celebration */}
        {showCompleted ? (
          <View style={styles.completedBanner}>
            <Text style={styles.completedIcon}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.completedTitle}>Delivery complete!</Text>
              <Text style={styles.completedSub}>Great work. Check your earnings tab.</Text>
            </View>
          </View>
        ) : null}

        {/* Status banner */}
        {!showCompleted ? (
          <View style={[styles.statusBanner, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={styles.statusBannerIcon}>{theme.icon}</Text>
            <View style={styles.statusBannerText}>
              <Text style={[styles.statusBannerLabel, { color: theme.text }]}>{statusLbl}</Text>
              <Text style={[styles.statusBannerSub, { color: theme.text }]}>Pull down to refresh</Text>
            </View>
          </View>
        ) : null}

        {/* Action message feedback */}
        {actionMsg ? (
          <View style={[styles.feedbackBanner, actionMsg.isError ? styles.feedbackError : styles.feedbackSuccess]}>
            <Text style={[styles.feedbackText, { color: actionMsg.isError ? colors.danger : colors.success }]}>
              {actionMsg.text}
            </Text>
          </View>
        ) : null}

        {/* Non-partner awaiting placement guidance */}
        {awaitingPlacement ? (
          <Card style={styles.placementCard}>
            <Text style={styles.placementIcon}>🛒</Text>
            <Text style={styles.placementTitle}>Place order at counter</Text>
            <Text style={styles.placementBody}>
              Place the customer's order with the cashier, then tap "Order placed at counter" below to continue.
            </Text>
          </Card>
        ) : null}

        {/* Item verification — shown while driver is at store (not awaiting placement) */}
        {showVerification ? (
          <Card>
            <CardTitle>{`Item Verification${orderItems.length > 0 ? ` (${orderItems.length - pendingCount}/${orderItems.length})` : ''}`}</CardTitle>
            <Text style={vstyle.hint}>Check each item with the store before confirming pickup.</Text>

            {itemSaveError ? (
              <View style={vstyle.saveErr}>
                <Text style={vstyle.saveErrText}>{itemSaveError}</Text>
              </View>
            ) : null}

            {orderItems.length > 0 ? (
              orderItems.map((item, i) => {
                const vStatus   = item.id ? itemVerifications[item.id] : undefined;
                const isVerified  = vStatus === 'verified';
                const isUnavail   = vStatus !== undefined && vStatus !== 'verified';
                const isPending   = vStatus === undefined;
                const isSaving    = savingItemId === item.id;
                const isExpanded  = expandedItemId === item.id;
                const name        = itemDisplayName(item);
                const qty         = itemQty(item);
                const variant     = itemVariantFull(item);
                const note        = itemNote(item);

                return (
                  <View key={item.id ?? i} style={[vstyle.itemRow, i > 0 && vstyle.itemRowBorder]}>
                    <View style={vstyle.itemInfo}>
                      <View style={vstyle.itemNameRow}>
                        <Text style={vstyle.itemName}>{name}</Text>
                        {isVerified ? (
                          <View style={vstyle.verifiedBadge}><Text style={vstyle.verifiedBadgeText}>✓ Verified</Text></View>
                        ) : isUnavail ? (
                          <View style={vstyle.unavailBadge}><Text style={vstyle.unavailBadgeText}>Unavailable</Text></View>
                        ) : null}
                      </View>
                      {qty     ? <Text style={vstyle.itemMeta}>Qty: {qty}</Text> : null}
                      {variant ? <Text style={vstyle.itemMeta}>{variant}</Text>  : null}
                      {note    ? <Text style={vstyle.itemNote}>Note: {note}</Text> : null}
                    </View>

                    {isSaving ? (
                      <View style={vstyle.savingRow}>
                        <ActivityIndicator size="small" color={colors.brand} />
                        <Text style={vstyle.savingText}>Saving…</Text>
                      </View>
                    ) : isPending ? (
                      <View style={vstyle.btnRow}>
                        <TouchableOpacity style={vstyle.verifyBtn} onPress={() => void handleVerifyItem(item)} activeOpacity={0.8}>
                          <Text style={vstyle.verifyBtnText}>✓ Available</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={vstyle.unavailBtn} onPress={() => handleUnavailableExpand(item)} activeOpacity={0.8}>
                          <Text style={vstyle.unavailBtnText}>✕ Unavailable</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={vstyle.changeLink} onPress={() => handleVerificationChange(item)} activeOpacity={0.7}>
                        <Text style={vstyle.changeLinkText}>Change</Text>
                      </TouchableOpacity>
                    )}

                    {isExpanded ? (
                      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={vstyle.noteSection}>
                        <Text style={vstyle.noteLabel}>Driver note (optional)</Text>
                        <TextInput
                          style={vstyle.noteInput}
                          value={noteInput}
                          onChangeText={setNoteInput}
                          placeholder="e.g. Out of stock, wrong size…"
                          placeholderTextColor={colors.textMuted}
                          multiline
                          maxLength={200}
                          autoFocus
                        />
                        <View style={vstyle.noteBtns}>
                          <TouchableOpacity style={vstyle.noteCancelBtn} onPress={() => { setExpandedItemId(null); setNoteInput(''); }} activeOpacity={0.8}>
                            <Text style={vstyle.noteCancelText}>Back</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={vstyle.noteConfirmBtn} onPress={() => void handleUnavailableSave(item)} activeOpacity={0.8}>
                            <Text style={vstyle.noteConfirmText}>Confirm Unavailable</Text>
                          </TouchableOpacity>
                        </View>
                      </KeyboardAvoidingView>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <View>
                <View style={vstyle.noItemsWarning}>
                  <Text style={vstyle.noItemsText}>
                    No item list available. Verify all items at the counter before confirming pickup.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[vstyle.confirmRow, noItemsConfirmed && vstyle.confirmRowChecked]}
                  onPress={() => setNoItemsConfirmed((v) => !v)}
                  activeOpacity={0.8}
                >
                  <View style={[vstyle.checkbox, noItemsConfirmed && vstyle.checkboxChecked]}>
                    {noItemsConfirmed ? <Text style={vstyle.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={vstyle.confirmText}>All items verified and order is complete</Text>
                </TouchableOpacity>
              </View>
            )}

            {!allItemsDecided && orderItems.length > 0 ? (
              <View style={vstyle.gateHint}>
                <Text style={vstyle.gateHintText}>{pendingCount} item{pendingCount !== 1 ? 's' : ''} still need verification before pickup.</Text>
              </View>
            ) : allItemsDecided && orderItems.length > 0 ? (
              <View style={vstyle.allDoneHint}>
                <Text style={vstyle.allDoneText}>All items verified — ready to confirm pickup.</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Payment & Receipt card — purchase_required / non_partner orders at pickup */}
        {showPaymentCard ? (
          <Card>
            <CardTitle>Payment & Receipt</CardTitle>

            {purchaseMsg ? (
              <View style={[pstyle.msg, purchaseMsg.isError ? pstyle.msgError : pstyle.msgSuccess]}>
                <Text style={[pstyle.msgText, { color: purchaseMsg.isError ? colors.danger : colors.success }]}>
                  {purchaseMsg.text}
                </Text>
              </View>
            ) : null}

            {spendingLimit != null ? (
              <View style={pstyle.limitRow}>
                <Text style={pstyle.limitLabel}>APPROVED SPENDING LIMIT</Text>
                <Text style={pstyle.limitValue}>JMD {spendingLimit.toLocaleString()}</Text>
              </View>
            ) : null}

            <Text style={pstyle.fieldLabel}>ACTUAL STORE TOTAL</Text>
            <View style={pstyle.totalRow}>
              <TextInput
                style={pstyle.totalInput}
                value={actualTotalInput}
                onChangeText={(v) => { setActualTotalInput(v); setTotalError(null); }}
                placeholder="Enter total from receipt"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                editable={!savingTotal}
              />
              <TouchableOpacity style={[pstyle.saveBtn, savingTotal && pstyle.saveBtnDisabled]} onPress={handleSaveTotal} disabled={savingTotal} activeOpacity={0.8}>
                {savingTotal ? <ActivityIndicator size="small" color="#fff" /> : <Text style={pstyle.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
            {totalError ? <Text style={pstyle.fieldError}>{totalError}</Text> : null}

            {purchaseStatus === 'within_limit' || purchaseStatus === 'receipt_submitted' ? (
              <View style={pstyle.statusOk}>
                <Text style={pstyle.statusOkText}>✓ Store total is within the approved limit.</Text>
              </View>
            ) : isOverLimit ? (
              <View style={pstyle.statusWarn}>
                <Text style={pstyle.statusWarnTitle}>⚠ Over approved limit</Text>
                <Text style={pstyle.statusWarnBody}>
                  Store total is higher than the approved limit.{difference != null ? `  Difference: JMD ${difference.toLocaleString()}` : ''}
                </Text>
                {approvalStatus === 'pending' ? (
                  <View style={pstyle.statusInfo}>
                    <Text style={pstyle.statusInfoText}>Waiting for customer approval.</Text>
                    {approvalLink ? (
                      <TouchableOpacity
                        style={pstyle.whatsappBtn}
                        onPress={() => void Linking.openURL(
                          `https://wa.me/${String(cPhone ?? '').replace(/[^\d+]/g, '')}?text=${encodeURIComponent(approvalMessage ?? approvalLink)}`
                        )}
                        activeOpacity={0.85}
                      >
                        <Text style={pstyle.whatsappBtnText}>Send WhatsApp to Customer</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : approvalStatus === 'needs_help' ? (
                  <View style={pstyle.statusInfo}>
                    <Text style={pstyle.statusInfoText}>Customer needs help with this purchase.</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[pstyle.approvalBtn, requestingApproval && pstyle.saveBtnDisabled]}
                    onPress={handleRequestApproval}
                    disabled={requestingApproval}
                    activeOpacity={0.85}
                  >
                    {requestingApproval ? <ActivityIndicator size="small" color="#fff" /> : <Text style={pstyle.approvalBtnText}>Request Customer Approval</Text>}
                  </TouchableOpacity>
                )}
              </View>
            ) : purchaseStatus === 'approved' && approvalStatus === 'approved' ? (
              <View style={pstyle.statusOk}>
                <Text style={pstyle.statusOkText}>✓ Customer approved the higher total.</Text>
              </View>
            ) : purchaseStatus === 'rejected' ? (
              <View style={pstyle.statusDanger}>
                <Text style={pstyle.statusDangerText}>
                  {approvalStatus === 'rejected' ? 'Customer did not approve the higher total.' : 'Purchase total was rejected — contact admin.'}
                </Text>
              </View>
            ) : null}

            {/* Receipt upload */}
            <View style={pstyle.receiptSection}>
              <Text style={pstyle.fieldLabel}>RECEIPT</Text>
              {uploadedReceipts.map((r) => (
                <View key={r.id} style={pstyle.receiptRow}>
                  {r.signedUrl ? (
                    <Image source={{ uri: r.signedUrl }} style={pstyle.receiptThumb} resizeMode="cover" />
                  ) : (
                    <View style={[pstyle.receiptThumb, pstyle.receiptThumbPlaceholder]}>
                      <Text style={pstyle.receiptThumbIcon}>🧾</Text>
                    </View>
                  )}
                  <View style={pstyle.receiptInfo}>
                    <Text style={pstyle.receiptTitle}>Receipt uploaded</Text>
                    {r.total_amount != null ? <Text style={pstyle.receiptMeta}>JMD {Number(r.total_amount).toLocaleString()}</Text> : null}
                    {r.created_at ? <Text style={pstyle.receiptMeta}>{new Date(r.created_at).toLocaleDateString()}</Text> : null}
                  </View>
                </View>
              ))}
              <TouchableOpacity style={[pstyle.uploadBtn, receiptUploading && pstyle.saveBtnDisabled]} onPress={handlePickAndUpload} disabled={receiptUploading} activeOpacity={0.85}>
                {receiptUploading ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={pstyle.uploadBtnText}>{hasReceipts ? '+ Upload Another Receipt' : '📷 Upload Receipt Photo'}</Text>}
              </TouchableOpacity>
              <Text style={pstyle.receiptHint}>Upload the store receipt for admin review and customer records.</Text>
            </View>
          </Card>
        ) : null}

        {/* Proof of delivery card */}
        {showProofSection ? (
          <Card style={proofReady ? prostyle.cardDone : prostyle.cardPending}>
            <View style={prostyle.header}>
              <Text style={prostyle.headerIcon}>{proofReady ? '✅' : '📷'}</Text>
              <View style={prostyle.headerText}>
                <Text style={[prostyle.headerTitle, { color: proofReady ? colors.success : '#92400E' }]}>
                  {proofReady ? 'Proof uploaded' : 'Proof required'}
                </Text>
                <Text style={prostyle.headerSub}>
                  {proofReady ? 'Delivery photo is on file. You can confirm delivery.' : 'Take a photo as proof of delivery before confirming.'}
                </Text>
              </View>
            </View>
            {proofMsg ? (
              <View style={[prostyle.msg, proofMsg.isError ? prostyle.msgError : prostyle.msgSuccess]}>
                <Text style={[prostyle.msgText, { color: proofMsg.isError ? colors.danger : colors.success }]}>{proofMsg.text}</Text>
              </View>
            ) : null}
            {proofUrl ? <Image source={{ uri: proofUrl }} style={prostyle.preview} resizeMode="cover" /> : null}
            <TouchableOpacity style={[prostyle.uploadBtn, proofUploading && prostyle.uploadBtnDisabled]} onPress={handlePickAndUploadProof} disabled={proofUploading} activeOpacity={0.85}>
              {proofUploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={prostyle.uploadBtnText}>{proofUrl ? '🔄 Replace Photo' : '📷 Take / Upload Photo'}</Text>}
            </TouchableOpacity>
            {!proofReady ? <Text style={prostyle.requiredHint}>A photo is required before you can confirm delivery.</Text> : null}
          </Card>
        ) : null}

        {/* ── Section A: Order header ───────────────────────────────────── */}
        <Card>
          <View style={oSt.headerRow}>
            <View style={{ flex: 1 }}>
              {ref ? <Text style={oSt.orderRef}>{ref}</Text> : null}
              <Text style={oSt.orderType}>{typeLabel}</Text>
              {order.created_at ? <Text style={oSt.orderDate}>{new Date(order.created_at).toLocaleDateString()}</Text> : null}
            </View>
            <View style={[oSt.statusBadge, { backgroundColor: '#D1FAE5' }]}>
              <Text style={[oSt.statusBadgeText, { color: '#065F46' }]}>{statusLbl}</Text>
            </View>
          </View>
        </Card>

        {/* ── Section B: Pickup & Customer ─────────────────────────────── */}
        <Card>
          <CardTitle>Pickup & Customer</CardTitle>
          {store   ? <DetailRow label="Store / Business" value={store} /> : null}
          {pickup  ? <DetailRow label="Pickup Address" value={pickup} /> : <Text style={styles.missingText}>Pickup address not provided</Text>}
          <NavButtons gmUrl={pickupGmUrl} wazeUrl={pickupWazeUrl} />
          {cName || cPhone ? <Divider /> : null}
          {cName  ? <DetailRow label="Customer" value={cName} /> : null}
          {cPhone ? <PhoneRow phone={cPhone} /> : null}
          {dropoff ? <DetailRow label="Drop-off Address" value={dropoff} /> : <Text style={styles.missingText}>Drop-off address not provided</Text>}
          <NavButtons gmUrl={dropoffGmUrl} wazeUrl={dropoffWazeUrl} />
        </Card>

        {/* ── Section C: Order Items ────────────────────────────────────── */}
        {!showVerification ? (
          <Card>
            <CardTitle>{orderItems.length > 0 ? `Order Items (${orderItems.length})` : 'Order Items'}</CardTitle>
            {orderItems.length > 0 ? (
              orderItems.map((item, i) => (
                <View key={item.id ?? i}>
                  {i > 0 ? <Divider /> : null}
                  <ItemRow item={item} index={i} />
                </View>
              ))
            ) : (
              <Text style={styles.missingText}>No item list available for this order.</Text>
            )}
          </Card>
        ) : null}

        {/* ── Section D: Payment & Cost ─────────────────────────────────── */}
        {(orderValue != null || rawPayMethod || metaPayStatus || (rawPayMethod === 'cash' && metaPayStatus === 'cash_expected' && !cashConfirmDone) || cashConfirmDone) ? (
          <Card>
            <CardTitle>Payment & Cost</CardTitle>
            {orderValue != null ? (
              <View style={oSt.orderValueRow}>
                <Text style={oSt.orderValueLabel}>ORDER VALUE</Text>
                <Text style={oSt.orderValueAmount}>JMD {Number(orderValue).toLocaleString()}</Text>
              </View>
            ) : null}
            <View style={oSt.payChips}>
              {rawPayMethod ? (
                <View style={oSt.payChip}>
                  <Text style={oSt.payChipText}>{rawPayMethod.replace(/_/g, ' ')}</Text>
                </View>
              ) : null}
              {metaPayStatus ? (
                <View style={oSt.payChip}>
                  <Text style={oSt.payChipText}>{metaPayStatus.replace(/_/g, ' ')}</Text>
                </View>
              ) : null}
            </View>

            {/* Cash collection confirmation */}
            {rawPayMethod === 'cash' && metaPayStatus === 'cash_expected' && !cashConfirmDone ? (
              <View style={oSt.cashCard}>
                <Text style={oSt.cashLabel}>CASH COLLECTION</Text>
                {cashExpectedAmt != null ? (
                  <Text style={oSt.cashAmount}>Expected: JMD {Number(cashExpectedAmt).toLocaleString()}</Text>
                ) : null}
                <Text style={oSt.cashHint}>Collect only the amount shown. Confirm once received.</Text>
                <TouchableOpacity
                  style={[oSt.cashBtn, cashConfirming && { opacity: 0.6 }]}
                  onPress={() => void handleConfirmCash()}
                  disabled={cashConfirming}
                  activeOpacity={0.8}
                >
                  {cashConfirming
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={oSt.cashBtnText}>Confirm Cash Collected</Text>}
                </TouchableOpacity>
              </View>
            ) : cashConfirmDone ? (
              <View style={oSt.cashDone}>
                <Text style={oSt.cashDoneText}>✓ Cash collection confirmed. Admin will settle.</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ── Section E: Delivery Instructions ─────────────────────────── */}
        {(notes || isCare || proofRequired || safetyPin) ? (
          <Card>
            <CardTitle>Delivery Instructions</CardTitle>

            {/* Senior / Xperts Care warning */}
            {isCare ? (
              <View style={oSt.careCard}>
                <Text style={oSt.careLabel}>XPERTS CARE — FAMILY & SENIOR SUPPORT</Text>
                <Text style={oSt.careBody}>Care support request. Be patient, professional, and confirm details carefully.</Text>
                {cd.senior_name ? <Text style={oSt.careDetail}>Care recipient: {String(cd.senior_name)}</Text> : null}
                {cd.mobility_notes ? <Text style={oSt.careDetail}>Mobility: {String(cd.mobility_notes)}</Text> : null}
                {cd.special_instructions ? <Text style={oSt.careDetail}>Instructions: {String(cd.special_instructions)}</Text> : null}
                {cd.contact_person_name ? (
                  <Text style={oSt.careContact}>
                    Family contact: {String(cd.contact_person_name)}{cd.contact_person_phone ? ` · ${String(cd.contact_person_phone)}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {notes ? <DetailRow label="Drop-off notes" value={notes} /> : null}

            {proofRequired ? (
              <View style={oSt.proofRequiredCard}>
                <Text style={oSt.proofRequiredLabel}>PROOF OF DELIVERY REQUIRED</Text>
                <Text style={oSt.proofRequiredBody}>Take a photo upon drop-off and upload through the app.</Text>
              </View>
            ) : null}

            {safetyPin ? (
              <View style={oSt.pinCard}>
                <Text style={oSt.pinLabel}>SAFETY PIN</Text>
                <Text style={oSt.pinCode}>{safetyPin}</Text>
                <Text style={oSt.pinHint}>Ask the customer to confirm this PIN before handing over the order.</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* ── Section F: Communication ──────────────────────────── */}
        {!isDone ? (
          <Card>
            <CardTitle>Communication</CardTitle>

            {chatError ? (
              <View style={comSt.errBox}>
                <Text style={comSt.errText}>{chatError}</Text>
              </View>
            ) : null}

            {/* Message Customer in App — primary for app orders with customer account */}
            {chatDecision.showInAppChat ? (
              <TouchableOpacity
                style={[comSt.btn, comSt.btnPrimary, chatLoading && { opacity: 0.6 }]}
                onPress={() => void handleOpenChat()}
                disabled={chatLoading}
                activeOpacity={0.85}
              >
                {chatLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={comSt.btnTextWhite}>💬  Message Customer</Text>}
              </TouchableOpacity>
            ) : null}

            {/* Call Customer — shown if phone number exists */}
            {cPhone ? (
              <TouchableOpacity
                style={[comSt.btn, comSt.btnOutline, { marginTop: chatDecision.showInAppChat ? 8 : 0 }]}
                onPress={() => { const tel = cPhone.replace(/\s/g, ''); void Linking.openURL(`tel:${tel}`); }}
                activeOpacity={0.85}
              >
                <Text style={comSt.btnTextDark}>📞  Call Customer</Text>
              </TouchableOpacity>
            ) : null}

            {/* WhatsApp — primary for WA/no-account orders; fallback label for app orders */}
            {waUrl ? (
              <TouchableOpacity
                style={[comSt.btn, chatDecision.waIsPrimary ? comSt.btnWa : comSt.btnWaFallback, { marginTop: 8 }]}
                onPress={() => void Linking.openURL(waUrl)}
                activeOpacity={0.85}
              >
                <Text style={chatDecision.waIsPrimary ? comSt.btnTextWhite : comSt.btnTextWa}>
                  {chatDecision.waIsPrimary ? '📱  WhatsApp Customer' : '📱  WhatsApp (Fallback)'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* No contact available */}
            {!chatDecision.showInAppChat && !cPhone && !waUrl ? (
              <Text style={comSt.noContact}>
                No contact method available. Contact dispatch if you need to reach the customer.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Issue report form */}
        <Card>
          <View style={issSt.headerRow}>
            <View>
              <Text style={issSt.issueCategoryLabel}>ISSUE OR DELAY</Text>
              <Text style={issSt.issueTitle}>Report a problem</Text>
            </View>
            <TouchableOpacity style={issSt.reportToggle} onPress={() => setIssueOpen((v) => !v)} activeOpacity={0.8}>
              <Text style={issSt.reportToggleText}>{issueOpen ? 'Cancel' : 'Report'}</Text>
            </TouchableOpacity>
          </View>

          {issueMsg ? (
            <View style={[issSt.issueMsg, issueMsg.isError ? issSt.issueMsgError : issSt.issueMsgSuccess]}>
              <Text style={[issSt.issueMsgText, { color: issueMsg.isError ? colors.danger : colors.success }]}>{issueMsg.text}</Text>
            </View>
          ) : null}

          {issueOpen ? (
            <View style={issSt.form}>
              <View style={issSt.pickerWrap}>
                {ISSUE_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[issSt.reasonBtn, issueReason === r && issSt.reasonBtnActive]}
                    onPress={() => setIssueReason(r)}
                    activeOpacity={0.7}
                  >
                    <Text style={[issSt.reasonBtnText, issueReason === r && issSt.reasonBtnTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={issSt.noteInput}
                value={issueNote}
                onChangeText={(v) => setIssueNote(v.slice(0, 200))}
                placeholder="Add details (optional, 200 chars max)"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[issSt.submitBtn, (!issueReason || issueBusy) && issSt.submitBtnDisabled]}
                onPress={() => void handleIssueSubmit()}
                disabled={!issueReason || issueBusy}
                activeOpacity={0.85}
              >
                {issueBusy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={issSt.submitBtnText}>Submit report</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* ── Sticky CTA bar ───────────────────────────────────────────────── */}
      {!isDone && ctaLabel ? (
        <View style={ctaSt.bar}>
          <TouchableOpacity
            style={[ctaSt.btn, (ctaDisabled || ctaBusy) && ctaSt.btnDisabled]}
            onPress={ctaHandler ?? undefined}
            disabled={ctaDisabled || ctaBusy}
            activeOpacity={0.85}
          >
            {ctaBusy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={ctaSt.btnText}>{ctaLabel}</Text>}
          </TouchableOpacity>
          {ctaReason ? (
            <Text style={ctaSt.reasonText}>{ctaReason}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outer:    { flex: 1, backgroundColor: colors.bg },
  scroll:   { flex: 1, backgroundColor: colors.bg },
  container:{ padding: 16, paddingBottom: 48 },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerText: { color: colors.textMuted, marginTop: 14, fontSize: 14, fontWeight: '500' },
  errorIcon:  { fontSize: 38, marginBottom: 14 },
  errorText:  { fontSize: 14, color: colors.danger, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  retryBtn:   { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:      { fontSize: 52, marginBottom: 18 },
  emptyTitle:     { fontSize: 19, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 10 },
  emptySubtitle:  { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  statusBanner:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1.5 },
  statusBannerIcon:  { fontSize: 24, marginRight: 12 },
  statusBannerText:  { flex: 1 },
  statusBannerLabel: { fontSize: 15, fontWeight: '900' },
  statusBannerSub:   { fontSize: 11, marginTop: 2, opacity: 0.70, fontWeight: '500' },

  feedbackBanner:  { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1 },
  feedbackError:   { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder },
  feedbackSuccess: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  feedbackText:    { fontSize: 13, fontWeight: '600', lineHeight: 19 },

  completedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.successSurface, borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1.5, borderColor: colors.successBorder },
  completedIcon:   { fontSize: 30, marginRight: 14 },
  completedTitle:  { fontSize: 17, fontWeight: '900', color: colors.success },
  completedSub:    { fontSize: 13, color: colors.success, marginTop: 3, fontWeight: '500' },

  placementCard: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1.5, alignItems: 'center' },
  placementIcon: { fontSize: 28, marginBottom: 8 },
  placementTitle:{ fontSize: 15, fontWeight: '900', color: '#1E40AF', marginBottom: 6, textAlign: 'center' },
  placementBody: { fontSize: 13, color: '#1E3A8A', lineHeight: 20, textAlign: 'center' },

  missingText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  notesText:   { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
});

// ── Order section styles ───────────────────────────────────────────────────────
const oSt = StyleSheet.create({
  headerRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  orderRef:       { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: colors.brand, textTransform: 'uppercase', marginBottom: 2 },
  orderType:      { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  orderDate:      { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  statusBadgeText:{ fontSize: 11, fontWeight: '800' },

  orderValueRow:  { marginBottom: 10 },
  orderValueLabel:{ fontSize: 10, fontWeight: '900', letterSpacing: 0.9, color: colors.textMuted, marginBottom: 2, textTransform: 'uppercase' },
  orderValueAmount:{ fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  payChips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  payChip:        { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  payChipText:    { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  cashCard:       { marginTop: 10, backgroundColor: '#FFF7ED', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#FED7AA' },
  cashLabel:      { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: '#C2410C', marginBottom: 4, textTransform: 'uppercase' },
  cashAmount:     { fontSize: 15, fontWeight: '900', color: '#7C2D12', marginBottom: 4 },
  cashHint:       { fontSize: 12, color: '#9A3412', marginBottom: 12, lineHeight: 18 },
  cashBtn:        { backgroundColor: '#EA580C', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  cashBtnText:    { color: '#fff', fontWeight: '800', fontSize: 14 },
  cashDone:       { marginTop: 10, backgroundColor: colors.successSurface, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: colors.successBorder },
  cashDoneText:   { fontSize: 13, fontWeight: '700', color: '#166534' },

  careCard:       { backgroundColor: '#FDF2F8', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#FBCFE8' },
  careLabel:      { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: '#BE185D', marginBottom: 4, textTransform: 'uppercase' },
  careBody:       { fontSize: 12, fontWeight: '600', color: '#9D174D', lineHeight: 18, marginBottom: 4 },
  careDetail:     { fontSize: 12, color: '#9D174D', marginTop: 2, lineHeight: 17 },
  careContact:    { fontSize: 12, fontWeight: '700', color: '#831843', marginTop: 6 },

  proofRequiredCard: { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#DDD6FE' },
  proofRequiredLabel:{ fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: '#6D28D9', marginBottom: 4, textTransform: 'uppercase' },
  proofRequiredBody: { fontSize: 12, color: '#5B21B6', lineHeight: 18 },

  pinCard:        { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: colors.border },
  pinLabel:       { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  pinCode:        { fontSize: 28, fontWeight: '900', letterSpacing: 6, color: colors.textPrimary, marginBottom: 4 },
  pinHint:        { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
});

// ── Sticky CTA styles ─────────────────────────────────────────────────────────
const ctaSt = StyleSheet.create({
  bar:         {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: '#fff',
    borderTopWidth:  1,
    borderTopColor:  colors.borderLight,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  btn:         { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0 },
  btnText:     { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },
  reasonText:  { textAlign: 'center', fontSize: 12, color: colors.textMuted, marginTop: 7, fontWeight: '600' },
});

// ── Payment & receipt styles ──────────────────────────────────────────────────
const pstyle = StyleSheet.create({
  msg:       { borderRadius: 12, padding: 13, marginBottom: 14, borderWidth: 1 },
  msgSuccess:{ backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  msgError:  { backgroundColor: colors.dangerSurface,  borderColor: colors.dangerBorder },
  msgText:   { fontSize: 13, fontWeight: '600', lineHeight: 19 },

  limitRow:  { backgroundColor: colors.brandSurface, borderRadius: 12, padding: 14, marginBottom: 14 },
  limitLabel:{ fontSize: 10, fontWeight: '900', letterSpacing: 0.9, color: colors.brand, marginBottom: 4, textTransform: 'uppercase' },
  limitValue:{ fontSize: 16, fontWeight: '900', color: colors.brand },

  fieldLabel:{ fontSize: 10, fontWeight: '900', letterSpacing: 0.9, color: colors.textMuted, marginBottom: 7, textTransform: 'uppercase' },
  fieldError:{ fontSize: 12, fontWeight: '600', color: colors.danger, marginTop: 5 },

  totalRow:    { flexDirection: 'row', gap: 8, marginBottom: 4 },
  totalInput:  { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '700', color: colors.textPrimary, backgroundColor: colors.bg },
  saveBtn:         { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { color: '#fff', fontWeight: '800', fontSize: 13 },

  statusOk:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.successSurface, borderRadius: 12, padding: 13, marginTop: 12, borderWidth: 1, borderColor: colors.successBorder },
  statusOkText:    { fontSize: 13, fontWeight: '700', color: '#166534', flex: 1 },
  statusWarn:      { backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 13, marginTop: 12, borderWidth: 1, borderColor: colors.dangerBorder },
  statusWarnTitle: { fontSize: 11, fontWeight: '900', color: colors.danger, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
  statusWarnBody:  { fontSize: 13, fontWeight: '600', color: '#7F1D1D', lineHeight: 19 },
  statusInfo:      { marginTop: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  statusInfoText:  { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  statusDanger:    { backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 13, marginTop: 12, borderWidth: 1, borderColor: colors.dangerBorder },
  statusDangerText:{ fontSize: 13, fontWeight: '700', color: colors.danger },

  approvalBtn:     { marginTop: 12, backgroundColor: colors.textPrimary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  approvalBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  whatsappBtn:     { marginTop: 8, backgroundColor: '#25D366', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  whatsappBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  receiptSection:         { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 16 },
  receiptRow:             { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: colors.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  receiptThumb:           { width: 54, height: 54, borderRadius: 10, marginRight: 12 },
  receiptThumbPlaceholder:{ backgroundColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  receiptThumbIcon:       { fontSize: 22 },
  receiptInfo:            { flex: 1 },
  receiptTitle:           { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  receiptMeta:            { fontSize: 12, color: colors.textSecondary },

  uploadBtn:     { borderWidth: 1.5, borderColor: colors.brand, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
  uploadBtnText: { fontSize: 13, fontWeight: '800', color: colors.brand },
  receiptHint:   { fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
});

// ── Proof of delivery styles ──────────────────────────────────────────────────
const prostyle = StyleSheet.create({
  cardDone:    { borderColor: colors.successBorder, borderWidth: 1.5 },
  cardPending: { borderColor: colors.warningBorder, borderWidth: 1.5 },

  header:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  headerIcon: { fontSize: 24, marginTop: 1 },
  headerText: { flex: 1 },
  headerTitle:{ fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 },
  headerSub:  { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 19 },

  msg:        { borderRadius: 12, padding: 13, marginBottom: 14, borderWidth: 1 },
  msgSuccess: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  msgError:   { backgroundColor: colors.dangerSurface,  borderColor: colors.dangerBorder },
  msgText:    { fontSize: 13, fontWeight: '600', lineHeight: 19 },

  preview:    { width: '100%', height: 190, borderRadius: 14, marginBottom: 14, backgroundColor: colors.bg },

  uploadBtn:         { backgroundColor: colors.textPrimary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  uploadBtnDisabled: { opacity: 0.5 },
  uploadBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },

  requiredHint: { fontSize: 12, fontWeight: '700', color: '#92400E', marginTop: 12, textAlign: 'center' },
});

// ── Item verification styles ──────────────────────────────────────────────────
const vstyle = StyleSheet.create({
  hint:      { fontSize: 12, color: colors.textMuted, marginBottom: 14, lineHeight: 18 },
  saveErr:   { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA' },
  saveErrText: { color: colors.danger, fontSize: 12, fontWeight: '600' },

  itemRow:       { paddingVertical: 14 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  itemInfo:      { marginBottom: 10 },
  itemNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 },
  itemName:      { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  itemMeta:      { fontSize: 12, color: colors.textSecondary, marginBottom: 1 },
  itemNote:      { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },

  verifiedBadge:     { backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedBadgeText: { fontSize: 11, fontWeight: '800', color: '#166534' },
  unavailBadge:      { backgroundColor: '#FEF3C7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  unavailBadgeText:  { fontSize: 11, fontWeight: '800', color: '#92400E' },

  btnRow:         { flexDirection: 'row', gap: 8 },
  verifyBtn:      { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.success, alignItems: 'center' },
  verifyBtnText:  { color: '#fff', fontWeight: '800', fontSize: 13 },
  unavailBtn:     { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.danger, alignItems: 'center' },
  unavailBtnText: { color: colors.danger, fontWeight: '800', fontSize: 13 },

  changeLink:     { alignSelf: 'flex-start' },
  changeLinkText: { fontSize: 12, fontWeight: '700', color: colors.brand, textDecorationLine: 'underline' },

  savingRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savingText: { fontSize: 12, color: colors.textMuted },

  noteSection:    { marginTop: 10, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  noteLabel:      { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  noteInput:      { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: 13, color: colors.textPrimary, backgroundColor: '#fff', minHeight: 60, textAlignVertical: 'top' },
  noteBtns:       { flexDirection: 'row', gap: 8, marginTop: 10 },
  noteCancelBtn:  { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  noteCancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  noteConfirmBtn: { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: '#92400E', alignItems: 'center' },
  noteConfirmText:{ color: '#fff', fontWeight: '800', fontSize: 13 },

  noItemsWarning:   { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#FDE68A' },
  noItemsText:      { fontSize: 13, color: '#92400E', lineHeight: 19 },
  confirmRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  confirmRowChecked:{ borderColor: colors.success, backgroundColor: '#F0FDF4' },
  checkbox:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked:  { borderColor: colors.success, backgroundColor: colors.success },
  checkmark:        { color: '#fff', fontSize: 13, fontWeight: '900' },
  confirmText:      { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  gateHint:     { marginTop: 12, backgroundColor: '#FEF9C3', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#FDE68A' },
  gateHintText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  allDoneHint:  { marginTop: 12, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#BBF7D0' },
  allDoneText:  { fontSize: 12, color: colors.success, fontWeight: '600' },
});

// ── Issue report styles ───────────────────────────────────────────────────────
const issSt = StyleSheet.create({
  headerRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  issueCategoryLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.9, color: '#B45309', textTransform: 'uppercase', marginBottom: 2 },
  issueTitle:         { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  reportToggle:       { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  reportToggleText:   { fontSize: 13, fontWeight: '800', color: colors.textPrimary },

  issueMsg:        { borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1 },
  issueMsgSuccess: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  issueMsgError:   { backgroundColor: colors.dangerSurface,  borderColor: colors.dangerBorder },
  issueMsgText:    { fontSize: 13, fontWeight: '600' },

  form:         { marginTop: 14 },
  pickerWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  reasonBtn:      { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#F8FAFC' },
  reasonBtnActive:{ borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  reasonBtnText:      { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  reasonBtnTextActive:{ color: '#92400E', fontWeight: '800' },

  noteInput:    { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 13, fontSize: 14, color: colors.textPrimary, backgroundColor: '#fff', minHeight: 80, textAlignVertical: 'top', marginBottom: 12 },
  submitBtn:         { backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText:     { color: '#fff', fontWeight: '900', fontSize: 14 },
});

// ── Communication section styles ──────────────────────────────────────────────
const comSt = StyleSheet.create({
  errBox:  { backgroundColor: colors.dangerSurface, borderRadius: 10, padding: 11, marginBottom: 12, borderWidth: 1, borderColor: colors.dangerBorder },
  errText: { fontSize: 13, fontWeight: '600', color: colors.danger },

  btn:     { borderRadius: 13, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },

  btnPrimary:   { backgroundColor: colors.brand },
  btnOutline:   { borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  btnWa:        { backgroundColor: '#25D366' },
  btnWaFallback:{ borderWidth: 1.5, borderColor: '#25D366', backgroundColor: '#F0FFF4' },

  btnTextWhite: { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnTextDark:  { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  btnTextWa:    { fontSize: 15, fontWeight: '800', color: '#128C7E' },

  noContact: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginTop: 4 },
});
