import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  type CompletedOrder,
  type DriverWallet,
  type LedgerEntry,
  type OrdersTotals,
  type WalletCycle,
  calcOrderEarnings,
  calcOrdersTotals,
  entryTypeLabel,
  fetchCompletedOrders,
  fetchDriverWallet,
  fetchWalletCycles,
  fetchWalletEntries,
  formatMoney,
  formatShortDate,
  getCycleLabel,
  orderRef,
  orderTypeLabel,
} from '@/services/earningsService';
import type { EarningsScreenProps } from '@/types/navigation';

// ── Badge configs ─────────────────────────────────────────────────────────────

const PAYOUT_BADGE: Record<string, { bg: string; text: string }> = {
  not_ready:        { bg: '#F1F5F9', text: '#64748B' },
  needs_review:     { bg: '#FEF3C7', text: '#92400E' },
  reviewed:         { bg: '#DBEAFE', text: '#1E40AF' },
  ready_for_payout: { bg: '#D1FAE5', text: '#065F46' },
  paid_manually:    { bg: '#059669', text: '#FFFFFF' },
  on_hold:          { bg: '#FEE2E2', text: '#991B1B' },
  disputed:         { bg: '#FEE2E2', text: '#7F1D1D' },
};

const CYCLE_BADGE: Record<string, { bg: string; text: string }> = {
  open:         { bg: '#D1FAE5', text: '#065F46' },
  under_review: { bg: '#FEF3C7', text: '#92400E' },
  closed:       { bg: '#F1F5F9', text: '#475569' },
  paid:         { bg: '#059669', text: '#FFFFFF' },
  disputed:     { bg: '#FEE2E2', text: '#991B1B' },
};

const WALLET_STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active:      { bg: '#D1FAE5', text: '#065F46',  label: 'Active' },
  on_hold:     { bg: '#FEE2E2', text: '#991B1B',  label: 'On Hold' },
  suspended:   { bg: '#F1F5F9', text: '#374151',  label: 'Suspended' },
  pending:     { bg: '#FEF3C7', text: '#92400E',  label: 'Pending' },
};

const PAYMENT_STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  current:    { bg: '#D1FAE5', text: '#065F46', label: 'Current' },
  pending:    { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  overdue:    { bg: '#FEE2E2', text: '#991B1B', label: 'Overdue' },
  paid:       { bg: '#059669', text: '#FFFFFF',  label: 'Paid' },
  waived:     { bg: '#DBEAFE', text: '#1E40AF', label: 'Waived' },
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash:     'Cash',
  card:     'Card',
  online:   'Online',
  transfer: 'Transfer',
  credit:   'Credit',
};

// ── Small reusables ───────────────────────────────────────────────────────────

function StatusBadge({ label, style }: { label: string; style: { bg: string; text: string } }) {
  return (
    <View style={[bst.wrap, { backgroundColor: style.bg }]}>
      <Text style={[bst.text, { color: style.text }]}>{label}</Text>
    </View>
  );
}
const bst = StyleSheet.create({
  wrap: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});

function SectionTitle({ children }: { children: string }) {
  return <Text style={sec.title}>{children}</Text>;
}
const sec = StyleSheet.create({
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 12, marginTop: 6 },
});

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />;
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, accent = 'default',
}: { label: string; value: string; sub?: string; accent?: 'green' | 'amber' | 'rose' | 'red' | 'default' }) {
  const c = {
    green:   { bg: colors.successSurface, border: colors.successBorder,  val: '#166534' },
    amber:   { bg: colors.warningSurface, border: colors.warningBorder,  val: '#92400E' },
    rose:    { bg: '#FFF1F2',             border: '#FECDD3',             val: '#9F1239' },
    red:     { bg: colors.dangerSurface,  border: colors.dangerBorder,   val: '#991B1B' },
    default: { bg: colors.brandSurface,   border: colors.borderLight,    val: colors.textPrimary },
  }[accent];
  return (
    <View style={[sum.card, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={sum.label}>{label}</Text>
      <Text style={[sum.value, { color: c.val }]}>{value}</Text>
      {sub ? <Text style={sum.sub}>{sub}</Text> : null}
    </View>
  );
}
const sum = StyleSheet.create({
  card:  { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1 },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase' },
  value: { fontSize: 20, fontWeight: '900' },
  sub:   { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: '600' },
});

// ── Driver Wallet Card (driver_wallets row) ───────────────────────────────────

function WalletCard({ wallet }: { wallet: DriverWallet }) {
  const pending   = Number(wallet.pending_payout      ?? 0);
  const available = Number(wallet.available_balance   ?? 0);
  const owed      = Number(wallet.outstanding_balance ?? 0);
  const overdue   = Number(wallet.overdue_amount      ?? 0);

  const walletStatus  = wallet.wallet_status  ?? 'active';
  const paymentStatus = wallet.payment_status ?? 'current';
  const wsCfg  = WALLET_STATUS_BADGE[walletStatus]  ?? { bg: '#F1F5F9', text: '#374151', label: walletStatus };
  const psCfg  = PAYMENT_STATUS_BADGE[paymentStatus] ?? { bg: '#FEF3C7', text: '#92400E', label: paymentStatus };

  return (
    <View style={wal.card}>
      <View style={wal.header}>
        <Text style={wal.title}>My Wallet</Text>
        <View style={wal.badges}>
          <StatusBadge label={wsCfg.label}  style={wsCfg}  />
          {paymentStatus !== 'current' ? (
            <StatusBadge label={psCfg.label} style={psCfg} />
          ) : null}
        </View>
      </View>

      <View style={wal.grid}>
        <View style={wal.cell}>
          <Text style={wal.cellLabel}>Owed to Me</Text>
          <Text style={[wal.cellValue, { color: '#166534' }]}>{formatMoney(pending)}</Text>
          <Text style={wal.cellSub}>Pending payout</Text>
        </View>
        <View style={wal.cellDivider} />
        <View style={wal.cell}>
          <Text style={wal.cellLabel}>Available</Text>
          <Text style={wal.cellValue}>{formatMoney(available)}</Text>
          <Text style={wal.cellSub}>Balance</Text>
        </View>
      </View>

      {(owed > 0 || overdue > 0) ? (
        <View style={wal.oweBox}>
          <Text style={wal.oweTitle}>Cash to Return to Xperts</Text>
          <Text style={wal.oweAmount}>{formatMoney(owed)}</Text>
          {overdue > 0 ? (
            <Text style={wal.overdueText}>Overdue: {formatMoney(overdue)}</Text>
          ) : null}
          <Text style={wal.oweNote}>
            Cash collected from customers that belongs to Xperts. Return or deduct from your next payout.
          </Text>
        </View>
      ) : null}

      {wallet.last_payment_at ? (
        <Text style={wal.lastPaid}>
          Last payout: {formatMoney(Number(wallet.last_payment_amount ?? 0))} on {formatShortDate(wallet.last_payment_at)}
        </Text>
      ) : null}
    </View>
  );
}

const wal = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 18, padding: 18,
    marginBottom: 14, borderWidth: 1, borderColor: colors.borderLight,
    shadowColor: '#0D1B2E', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:      { fontSize: 15, fontWeight: '900', color: colors.textPrimary },
  badges:     { flexDirection: 'row', gap: 6 },
  grid:       { flexDirection: 'row', marginBottom: 14 },
  cell:       { flex: 1, alignItems: 'center' },
  cellDivider:{ width: 1, backgroundColor: colors.borderLight, alignSelf: 'stretch', marginHorizontal: 8 },
  cellLabel:  { fontSize: 10, fontWeight: '900', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
  cellValue:  { fontSize: 20, fontWeight: '900', color: colors.textPrimary },
  cellSub:    { fontSize: 10, color: colors.textMuted, marginTop: 3, fontWeight: '600' },
  oweBox:     { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 10 },
  oweTitle:   { fontSize: 10, fontWeight: '900', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  oweAmount:  { fontSize: 20, fontWeight: '900', color: '#92400E', marginBottom: 4 },
  overdueText:{ fontSize: 12, fontWeight: '800', color: colors.danger, marginBottom: 6 },
  oweNote:    { fontSize: 11, color: '#92400E', fontWeight: '600', lineHeight: 16 },
  lastPaid:   { fontSize: 11, color: colors.textMuted, fontWeight: '600', textAlign: 'center', marginTop: 4 },
});

// ── Cycle row (expandable) ────────────────────────────────────────────────────

function CycleRow({ cycle, driverRowId }: { cycle: WalletCycle; driverRowId: string }) {
  const [open,    setOpen]    = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  const toggle = useCallback(async () => {
    if (!open && !loaded) {
      setLoading(true);
      const { entries: e } = await fetchWalletEntries(driverRowId, cycle.id);
      setEntries(e);
      setLoaded(true);
      setLoading(false);
    }
    setOpen((v) => !v);
  }, [open, loaded, driverRowId, cycle.id]);

  const statusKey   = cycle.status ?? 'open';
  const cycleBadge  = CYCLE_BADGE[statusKey] ?? CYCLE_BADGE.closed;
  const cycleLabel  = getCycleLabel(cycle);

  const owed      = Number(cycle.total_owed_to_driver   ?? 0);
  const cashOwed  = Number(cycle.total_owed_to_xperts   ?? 0);
  const tips      = Number(cycle.total_tips              ?? 0);
  const collected = Number(cycle.total_cash_collected    ?? 0);
  const settled   = Number(cycle.total_cash_settled      ?? 0);
  const advances  = Number(cycle.total_advances          ?? 0);

  const isDiscrepancy = Boolean(cycle.discrepancy_flagged);

  return (
    <View style={cyc.wrap}>
      <TouchableOpacity style={cyc.header} onPress={toggle} activeOpacity={0.75}>
        <View style={cyc.headerLeft}>
          <View style={cyc.badgeRow}>
            <StatusBadge
              label={statusKey === 'paid' ? '✓ Paid' : statusKey === 'open' ? 'Open' : cycle.status.replace(/_/g, ' ')}
              style={cycleBadge}
            />
            {isDiscrepancy ? (
              <StatusBadge label="Under Review" style={{ bg: '#FEF3C7', text: '#92400E' }} />
            ) : null}
            <Text style={cyc.cycleKey}>{cycleLabel}</Text>
          </View>
          {cycle.paid_at ? (
            <Text style={cyc.paidAt}>Paid {formatShortDate(cycle.paid_at)}</Text>
          ) : null}
        </View>
        <View style={cyc.headerRight}>
          <Text style={cyc.owed}>{formatMoney(owed)}</Text>
          {tips > 0     ? <Text style={cyc.tips}>+{formatMoney(tips)} tips</Text>    : null}
          {cashOwed > 0 ? <Text style={cyc.cash}>-{formatMoney(cashOwed)} cash</Text> : null}
          <Text style={cyc.chevron}>{open ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {open ? (
        <View style={cyc.body}>
          {/* Earnings breakdown */}
          <View style={cyc.breakdown}>
            <Text style={cyc.breakdownTitle}>Earnings</Text>
            <EarningsLine label="Job earnings"     value={formatMoney(Number(cycle.total_job_earnings ?? 0))} />
            {tips > 0    ? <EarningsLine label="Tips"            value={`+${formatMoney(tips)}`}                                  accent="rose"  /> : null}
            {Number(cycle.total_reimbursements ?? 0) > 0
              ? <EarningsLine label="Reimbursements" value={`+${formatMoney(Number(cycle.total_reimbursements))}`}  accent="green" /> : null}
            {advances > 0 ? <EarningsLine label="Advance (Xperts)"  value={`+${formatMoney(advances)}`}                           accent="green" /> : null}
            {Number(cycle.total_deductions ?? 0) > 0
              ? <EarningsLine label="Deductions"     value={`-${formatMoney(Number(cycle.total_deductions))}`}     accent="red"   /> : null}
            <Divider />
            <EarningsLine label="Owed to you" value={formatMoney(owed)} bold accent="green" />
          </View>

          {/* Cash handling */}
          {collected > 0 ? (
            <View style={cyc.cashBox}>
              <Text style={cyc.cashBoxTitle}>Cash Handling</Text>
              <EarningsLine label="Cash collected from customers" value={formatMoney(collected)} />
              {settled > 0 ? <EarningsLine label="Cash settled with Xperts" value={`-${formatMoney(settled)}`} accent="green" /> : null}
              <Divider />
              <EarningsLine
                label="Cash to return to Xperts"
                value={formatMoney(Math.max(0, collected - settled))}
                bold
                accent={collected - settled > 0 ? 'red' : 'green'}
              />
              <Text style={cyc.cashNote}>
                Return cash to Xperts or it will be deducted from your payout.
              </Text>
            </View>
          ) : cashOwed > 0 ? (
            <View style={cyc.cashWarn}>
              <Text style={cyc.cashWarnTitle}>Cash to Return to Xperts</Text>
              <Text style={cyc.cashWarnAmount}>{formatMoney(cashOwed)}</Text>
              <Text style={cyc.cashWarnNote}>Cash collected from customers that belongs to Xperts.</Text>
            </View>
          ) : null}

          {/* Discrepancy note */}
          {isDiscrepancy && cycle.discrepancy_status ? (
            <View style={cyc.discBox}>
              <Text style={cyc.discTitle}>Review in Progress</Text>
              <Text style={cyc.discNote}>
                Xperts is reviewing this cycle. Status: {cycle.discrepancy_status.replace(/_/g, ' ')}.
                Contact support if you have questions.
              </Text>
            </View>
          ) : null}

          {/* Cycle notes */}
          {cycle.notes ? (
            <View style={cyc.notes}>
              <Text style={cyc.notesText}>{cycle.notes}</Text>
            </View>
          ) : null}

          {/* Ledger entries */}
          {loading ? (
            <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 10 }} />
          ) : entries.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={cyc.entriesTitle}>Transaction Detail</Text>
              {entries.map((e) => (
                <View key={e.id} style={cyc.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={cyc.entryType}>{entryTypeLabel(e)}</Text>
                    {e.description ? <Text style={cyc.entryDesc}>{e.description}</Text> : null}
                  </View>
                  <Text style={[cyc.entryAmount,
                    e.direction === 'credit_to_driver' ? cyc.entryCredit
                    : e.direction === 'debit_from_driver' ? cyc.entryDebit
                    : cyc.entryInfo,
                  ]}>
                    {e.direction === 'credit_to_driver' ? '+' : e.direction === 'debit_from_driver' ? '−' : ''}
                    {formatMoney(Number(e.amount))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function EarningsLine({ label, value, accent = 'default', bold = false }: {
  label: string; value: string; accent?: 'green' | 'rose' | 'red' | 'default'; bold?: boolean;
}) {
  const valColor = { green: '#166534', rose: '#9F1239', red: colors.danger, default: colors.textPrimary }[accent];
  return (
    <View style={el.row}>
      <Text style={[el.label, bold && el.bold]}>{label}</Text>
      <Text style={[el.value, bold && el.bold, { color: valColor }]}>{value}</Text>
    </View>
  );
}
const el = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: '600', flex: 1, paddingRight: 8 },
  value: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  bold:  { fontWeight: '900', fontSize: 13 },
});

const cyc = StyleSheet.create({
  wrap:          { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 10, overflow: 'hidden' },
  header:        { flexDirection: 'row', padding: 14, alignItems: 'flex-start', gap: 10 },
  headerLeft:    { flex: 1 },
  headerRight:   { alignItems: 'flex-end' },
  badgeRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  cycleKey:      { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  paidAt:        { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  owed:          { fontSize: 14, fontWeight: '900', color: '#166534' },
  tips:          { fontSize: 10, fontWeight: '700', color: '#9F1239', marginTop: 2 },
  cash:          { fontSize: 10, fontWeight: '700', color: '#92400E', marginTop: 1 },
  chevron:       { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  body:          { borderTopWidth: 1, borderTopColor: colors.border, padding: 14 },
  breakdown:     { backgroundColor: colors.bg, borderRadius: 10, padding: 12, marginBottom: 10 },
  breakdownTitle:{ fontSize: 10, fontWeight: '900', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  cashBox:       { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 10 },
  cashBoxTitle:  { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: '#92400E', textTransform: 'uppercase', marginBottom: 8 },
  cashNote:      { fontSize: 10, color: '#92400E', fontWeight: '600', lineHeight: 14, marginTop: 4 },
  cashWarn:      { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 10 },
  cashWarnTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: '#92400E', textTransform: 'uppercase', marginBottom: 4 },
  cashWarnAmount:{ fontSize: 16, fontWeight: '900', color: '#92400E', marginBottom: 4 },
  cashWarnNote:  { fontSize: 11, color: '#92400E', fontWeight: '600', lineHeight: 16 },
  discBox:       { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.warningBorder, marginBottom: 10 },
  discTitle:     { fontSize: 10, fontWeight: '900', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  discNote:      { fontSize: 11, color: '#92400E', fontWeight: '600', lineHeight: 16 },
  entriesTitle:  { fontSize: 10, fontWeight: '900', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  entryRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 },
  entryType:     { fontSize: 11, fontWeight: '800', color: colors.textPrimary },
  entryDesc:     { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  entryAmount:   { fontSize: 11, fontWeight: '900', marginLeft: 8 },
  entryCredit:   { color: '#166534' },
  entryDebit:    { color: colors.danger },
  entryInfo:     { color: colors.textMuted },
  notes:         { marginTop: 8, backgroundColor: colors.bg, borderRadius: 8, padding: 10 },
  notesText:     { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
});

// ── Order row ─────────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: CompletedOrder }) {
  const { driverEarnings, tipAmount, payoutStatus, payoutStatusLabel, paidAt } = calcOrderEarnings(order);
  const badgeCfg  = PAYOUT_BADGE[payoutStatus] ?? PAYOUT_BADGE.not_ready;
  const ref       = orderRef(order);
  const typeStr   = orderTypeLabel(order);
  const date      = formatShortDate(order.created_at);
  const pmLabel   = order.payment_method ? (PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method) : null;
  const isCash    = order.payment_method === 'cash';

  return (
    <View style={ord.row}>
      <View style={ord.left}>
        <View style={ord.topLine}>
          <Text style={ord.ref}>{ref}</Text>
          <View style={ord.typePill}>
            <Text style={ord.typeText}>{typeStr}</Text>
          </View>
          {pmLabel ? (
            <View style={[ord.pmPill, isCash && ord.pmPillCash]}>
              <Text style={[ord.pmText, isCash && ord.pmTextCash]}>{pmLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={ord.date}>{date}</Text>
        {paidAt ? <Text style={ord.paidAt}>Paid {formatShortDate(paidAt)}</Text> : null}
      </View>
      <View style={ord.right}>
        {driverEarnings > 0 ? (
          <Text style={ord.amount}>{formatMoney(driverEarnings)}</Text>
        ) : (
          <Text style={ord.amountNone}>—</Text>
        )}
        {tipAmount > 0 ? <Text style={ord.tip}>+{formatMoney(tipAmount)} tip</Text> : null}
        <StatusBadge label={payoutStatusLabel} style={badgeCfg} />
      </View>
    </View>
  );
}

const ord = StyleSheet.create({
  row:      { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'flex-start', gap: 10 },
  left:     { flex: 1 },
  topLine:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  ref:      { fontSize: 13, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  typePill: { backgroundColor: colors.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  typeText: { fontSize: 9, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  pmPill:   { backgroundColor: colors.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  pmText:   { fontSize: 9, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  pmPillCash: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  pmTextCash: { color: '#92400E' },
  date:     { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  paidAt:   { fontSize: 10, color: '#166534', fontWeight: '700', marginTop: 2 },
  right:    { alignItems: 'flex-end', gap: 3 },
  amount:   { fontSize: 14, fontWeight: '900', color: colors.textPrimary },
  amountNone: { fontSize: 14, fontWeight: '900', color: colors.textMuted },
  tip:      { fontSize: 10, fontWeight: '700', color: '#9F1239' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EarningsScreen(_props: EarningsScreenProps) {
  const { driverRow } = useAuth();

  const [wallet,        setWallet]        = useState<DriverWallet | null>(null);
  const [walletError,   setWalletError]   = useState<string | null>(null);
  const [cycles,        setCycles]        = useState<WalletCycle[]>([]);
  const [hasCycles,     setHasCycles]     = useState(false);
  const [orders,        setOrders]        = useState<CompletedOrder[]>([]);
  const [totals,        setTotals]        = useState<OrdersTotals | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const driverRowId = driverRow?.id ?? null;
  const loadedRef   = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!driverRowId) { setLoading(false); return; }
    if (!isRefresh) setLoading(true);
    setError(null);

    const [walletResult, cyclesResult, ordersResult] = await Promise.all([
      fetchDriverWallet(driverRowId),
      fetchWalletCycles(driverRowId),
      fetchCompletedOrders(driverRowId),
    ]);

    // Wallet
    if (walletResult.error) setWalletError(walletResult.error);
    else setWallet(walletResult.wallet);

    // Orders
    if (ordersResult.error) setError(ordersResult.error);
    const fetchedOrders = ordersResult.orders;
    setOrders(fetchedOrders);
    setTotals(calcOrdersTotals(fetchedOrders));

    // Cycles
    if (cyclesResult.tableExists && !cyclesResult.error) {
      setCycles(cyclesResult.cycles);
      setHasCycles(cyclesResult.cycles.length > 0);
    } else {
      setHasCycles(false);
    }

    loadedRef.current = true;
    setLoading(false);
    setRefreshing(false);
  }, [driverRowId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const openCycle  = cycles.find((c) => c.status === 'open') ?? null;
  const paidCycles = cycles.filter((c) => c.status === 'paid').length;

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={st.centerText}>Loading earnings…</Text>
      </View>
    );
  }

  const hasAnyData = hasCycles || orders.length > 0;

  return (
    <ScrollView
      style={st.scroll}
      contentContainerStyle={st.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />}
    >
      <Text style={st.heading}>Earnings</Text>

      {error ? (
        <View style={st.errorBanner}>
          <Text style={st.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ── Wallet card (driver_wallets row) ──── */}
      {wallet ? <WalletCard wallet={wallet} /> : walletError ? (
        <View style={st.errorBanner}>
          <Text style={st.errorText}>{walletError}</Text>
        </View>
      ) : null}

      {/* ── Summary cards ──────────────────────── */}
      {hasCycles && openCycle ? (
        <View style={st.row}>
          <SummaryCard
            label="Owed to You"
            value={formatMoney(Number(openCycle.total_owed_to_driver ?? 0))}
            sub="This pay cycle"
            accent="green"
          />
          <View style={{ width: 10 }} />
          <SummaryCard
            label="Cash to Return"
            value={formatMoney(Number(openCycle.total_owed_to_xperts ?? 0))}
            sub="Cash owed to Xperts"
            accent={Number(openCycle.total_owed_to_xperts ?? 0) > 0 ? 'amber' : 'default'}
          />
        </View>
      ) : totals ? (
        <View style={st.row}>
          <SummaryCard
            label="Total Earned"
            value={formatMoney(totals.totalEarned)}
            sub="All completed jobs"
            accent="green"
          />
          <View style={{ width: 10 }} />
          <SummaryCard
            label="Jobs Done"
            value={String(orders.length)}
            sub={`${totals.pendingCount} pending · ${totals.paidCount} paid`}
          />
        </View>
      ) : null}

      {hasCycles ? (
        <View style={st.row}>
          <SummaryCard
            label="Tips This Cycle"
            value={formatMoney(Number(openCycle?.total_tips ?? 0))}
            sub="Always yours"
            accent="rose"
          />
          <View style={{ width: 10 }} />
          <SummaryCard
            label="Paid Cycles"
            value={String(paidCycles)}
            sub="Completed payouts"
          />
        </View>
      ) : null}

      {/* ── Disclaimer ──────────────────────────── */}
      <View style={st.disclaimer}>
        <Text style={st.disclaimerText}>
          Earnings shown are estimates. Xperts reviews and confirms final amounts. Tips are always yours and separate from platform fees.
        </Text>
      </View>

      {/* ── Pay cycles ──────────────────────────── */}
      {hasCycles ? (
        <View style={{ marginTop: 8 }}>
          <SectionTitle>{`Pay Cycles (${cycles.length})`}</SectionTitle>
          {cycles.map((c) => (
            <CycleRow key={c.id} cycle={c} driverRowId={driverRowId!} />
          ))}
        </View>
      ) : null}

      {/* ── Job history ─────────────────────────── */}
      <View style={{ marginTop: hasCycles ? 16 : 8 }}>
        <SectionTitle>{orders.length > 0 ? `Job History (${orders.length})` : 'Job History'}</SectionTitle>

        {orders.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyIcon}>💼</Text>
            <Text style={st.emptyTitle}>No completed jobs yet.</Text>
            <Text style={st.emptySub}>
              Completed deliveries will appear here with payout amounts.
            </Text>
          </View>
        ) : (
          <View style={st.card}>
            {orders.map((o) => <OrderRow key={o.id} order={o} />)}
          </View>
        )}
      </View>

      {/* ── Footer ──────────────────────────────── */}
      {hasAnyData ? (
        <View style={st.footer}>
          <Text style={st.footerText}>
            Questions about your payout? Contact the Xperts team via WhatsApp.
          </Text>
          <TouchableOpacity
            onPress={() => void Linking.openURL('https://wa.me/18767883666')}
            activeOpacity={0.8}
            style={st.waBtn}
          >
            <Text style={st.waBtnText}>WhatsApp Xperts</Text>
          </TouchableOpacity>
        </View>
      ) : !hasAnyData && !wallet ? (
        <View style={st.empty}>
          <Text style={st.emptyIcon}>💰</Text>
          <Text style={st.emptyTitle}>No earnings yet.</Text>
          <Text style={st.emptySub}>
            Your pay cycles and job earnings will appear here once you complete your first delivery.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: colors.bg },
  container: { padding: 16, paddingBottom: 48 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerText:{ color: colors.textMuted, marginTop: 14, fontSize: 14, fontWeight: '500' },

  heading: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, marginBottom: 18, marginTop: 6 },

  errorBanner: { backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.dangerBorder },
  errorText:   { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  row: { flexDirection: 'row', marginBottom: 12 },

  disclaimer: { backgroundColor: colors.brandSurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 18, borderWidth: 1, borderColor: colors.borderLight },
  disclaimerText: { fontSize: 11, color: colors.brand, fontWeight: '600', lineHeight: 18 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 4,
    shadowColor: '#0D1B2E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  empty:     { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 44, marginBottom: 16 },
  emptyTitle:{ fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
  emptySub:  { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  footer:    { marginTop: 24, backgroundColor: colors.card, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: colors.border },
  footerText:{ fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: 16, fontWeight: '600' },
  waBtn:     { backgroundColor: colors.textPrimary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  waBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
