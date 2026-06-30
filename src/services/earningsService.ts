import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Driver wallet row (one per driver) ───────────────────────────────────────
// Driver-safe fields only — admin_notes, enforcement_status, warning_sent_at
// and suspended_at are intentionally excluded from this type.
export type DriverWallet = {
  id: string;
  driver_id: string;
  total_earnings: number | null;
  pending_payout: number | null;
  available_balance: number | null;
  pending_balance: number | null;
  outstanding_balance: number | null;
  overdue_amount: number | null;
  payment_status: string | null;
  wallet_status: string | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  updated_at: string | null;
};

export type WalletCycle = {
  id: string;
  driver_id: string;
  cycle_key?: string | null;
  status: string;
  cycle_start?: string | null;
  cycle_end?: string | null;
  paid_at?: string | null;
  opening_balance?: number | null;
  closing_balance?: number | null;
  total_owed_to_driver?: number | null;
  total_tips?: number | null;
  total_job_earnings?: number | null;
  total_cash_collected?: number | null;
  total_cash_settled?: number | null;
  total_advances?: number | null;
  total_owed_to_xperts?: number | null;
  total_deductions?: number | null;
  total_reimbursements?: number | null;
  discrepancy_flagged?: boolean | null;
  discrepancy_status?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type LedgerEntry = {
  id: string;
  driver_id: string;
  wallet_cycle_id?: string | null;
  order_id?: string | null;
  entry_type: string;
  amount: number;
  direction: 'credit_to_driver' | 'debit_from_driver' | 'info' | string;
  description?: string | null;
  reference?: string | null;
  created_at?: string | null;
};

export type CompletedOrder = {
  id: string;
  order_type?: string | null;
  service_type?: string | null;
  order_number?: string | null;
  status: string;
  payment_method?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

// ── Earnings calculation ───────────────────────────────────────────────────────
// Driver-visible fields only — mirrors calculateOrderFinancials() from the web
// but strips platform_revenue, business_*, xperts_* fields.
// Priority: stored finance record → delivery_fee fallback.

export type OrderEarnings = {
  driverEarnings: number;
  tipAmount: number;
  payoutStatus: string;
  payoutStatusLabel: string;
  paidAt: string | null;
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  not_ready:        'Pending Review',
  needs_review:     'In Review',
  reviewed:         'Reviewed',
  ready_for_payout: 'Ready for Payout',
  paid_manually:    'Paid',
  on_hold:          'On Hold',
  disputed:         'Disputed',
};

export function calcOrderEarnings(order: CompletedOrder): OrderEarnings {
  const meta = order.metadata ?? {};
  const fin  = (meta.finance && typeof meta.finance === 'object')
    ? (meta.finance as Record<string, unknown>)
    : {};

  const tipAmount      = Number(meta.tip_amount ?? 0);
  const driverEarnings = fin.estimated_driver_earning != null
    ? Number(fin.estimated_driver_earning)
    : Number(meta.driver_earnings ?? meta.delivery_fee ?? 0) + tipAmount;

  const payoutStatus = String(meta.payout_review_status ?? 'not_ready');
  const paidAt       = typeof meta.payout_paid_at === 'string' ? meta.payout_paid_at : null;

  return {
    driverEarnings,
    tipAmount,
    payoutStatus,
    payoutStatusLabel: PAYOUT_STATUS_LABELS[payoutStatus] ?? 'Pending Review',
    paidAt,
  };
}

// ── Cycle label (same logic as web getDriverCycleLabel) ───────────────────────

export function getCycleLabel(cycle: WalletCycle): string {
  if (cycle.cycle_key) return cycle.cycle_key;
  try {
    const start = new Date(cycle.cycle_start!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end   = new Date(cycle.cycle_end!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} – ${end}`;
  } catch {
    return cycle.id.slice(0, 8);
  }
}

// ── Ledger entry label (same as web ENTRY_TYPE_CONFIG) ───────────────────────

const ENTRY_TYPE_LABELS: Record<string, string> = {
  job_earning:       'Job Earning',
  contract_earning:  'Contract Earning',
  tip:               'Tip',
  cash_collected:    'Cash Collected',
  cash_settled:      'Cash Settled',
  xperts_advance:    'Xperts Advance',
  reimbursement:     'Reimbursement',
  deduction:         'Deduction',
  adjustment:        'Adjustment',
  payout_paid:       'Payout Paid',
  dispute_hold:      'Dispute Hold',
};

export function entryTypeLabel(entry: LedgerEntry): string {
  return ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type;
}

// ── Supabase queries ───────────────────────────────────────────────────────────

// ── Driver wallet row ─────────────────────────────────────────────────────────
// Fetches the single driver_wallets row for this driver.
// Intentionally omits admin_notes, enforcement_status, warning_sent_at, suspended_at.
export async function fetchDriverWallet(
  driverRowId: string,
): Promise<{ wallet: DriverWallet | null; error: string | null }> {
  const { data, error } = await supabase
    .from('driver_wallets')
    .select('id, driver_id, total_earnings, pending_payout, available_balance, pending_balance, outstanding_balance, overdue_amount, payment_status, wallet_status, last_payment_at, last_payment_amount, updated_at')
    .eq('driver_id', driverRowId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return { wallet: null, error: null };
    return { wallet: null, error: 'Unable to load wallet.' };
  }
  return { wallet: data as DriverWallet | null, error: null };
}

// ── Today's summary (for home screen strip) ───────────────────────────────────
export type TodaySummary = {
  jobsToday: number;
  earningsToday: number;
  cashToReturn: number;
};

export async function fetchTodaySummary(
  driverRowId: string,
): Promise<TodaySummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [ordersResult, cycleResult] = await Promise.all([
    supabase
      .from('orders')
      .select('id, metadata')
      .eq('assigned_driver_id', driverRowId)
      .in('status', ['completed', 'delivered'])
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('driver_wallet_cycles')
      .select('total_owed_to_xperts')
      .eq('driver_id', driverRowId)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle(),
  ]);

  let earningsToday = 0;
  const orders = (ordersResult.data ?? []) as CompletedOrder[];
  for (const o of orders) {
    const { driverEarnings } = calcOrderEarnings(o);
    earningsToday += driverEarnings;
  }

  return {
    jobsToday:    orders.length,
    earningsToday,
    cashToReturn: Number(cycleResult.data?.total_owed_to_xperts ?? 0),
  };
}

// ── Wallet cycles ─────────────────────────────────────────────────────────────
// Belt-and-suspenders WHERE filter on top of RLS to guarantee scope.
export async function fetchWalletCycles(
  driverRowId: string,
  limit = 20,
): Promise<{ cycles: WalletCycle[]; tableExists: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('driver_wallet_cycles')
    .select('id, driver_id, cycle_key, status, cycle_start, cycle_end, paid_at, total_owed_to_driver, total_tips, total_job_earnings, total_cash_collected, total_cash_settled, total_advances, total_owed_to_xperts, total_deductions, total_reimbursements, discrepancy_flagged, discrepancy_status, notes, created_at')
    .eq('driver_id', driverRowId)
    .order('cycle_start', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') return { cycles: [], tableExists: false, error: null };
    return { cycles: [], tableExists: true, error: 'Unable to load pay cycles.' };
  }
  return { cycles: (data ?? []) as WalletCycle[], tableExists: true, error: null };
}

// Ledger entries for a single cycle — driver-safe projection only.
// Filters out admin-internal entries (payout_paid/dispute_hold with direction=info).
export async function fetchWalletEntries(
  driverRowId: string,
  cycleId: string,
  limit = 100,
): Promise<{ entries: LedgerEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from('driver_wallet_ledger_entries')
    .select('id, driver_id, wallet_cycle_id, order_id, entry_type, amount, direction, description, reference, created_at')
    .eq('driver_id', driverRowId)
    .eq('wallet_cycle_id', cycleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') return { entries: [], error: null };
    return { entries: [], error: 'Unable to load entries.' };
  }

  // Strip admin-internal info entries (same filter as web DriverEarningsPage)
  const visible = (data ?? []).filter(
    (e: { entry_type?: string; direction?: string }) =>
      !(e.direction === 'info' && (e.entry_type === 'payout_paid' || e.entry_type === 'dispute_hold')),
  );

  return { entries: visible as LedgerEntry[], error: null };
}

// Completed orders for the driver — mirrors listDriverPayoutHistory() in the web.
export async function fetchCompletedOrders(
  driverRowId: string,
  limit = 60,
): Promise<{ orders: CompletedOrder[]; error: string | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_type, service_type, order_number, status, payment_method, created_at, metadata')
    .eq('assigned_driver_id', driverRowId)
    .in('status', ['completed', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { orders: [], error: 'Unable to load job history.' };
  return { orders: (data ?? []) as CompletedOrder[], error: null };
}

// Aggregate summary from orders (used when wallet cycles are not set up)
export type OrdersTotals = {
  totalEarned: number;
  totalTips: number;
  pendingCount: number;
  paidCount: number;
};

export function calcOrdersTotals(orders: CompletedOrder[]): OrdersTotals {
  let totalEarned = 0;
  let totalTips   = 0;
  let pendingCount = 0;
  let paidCount    = 0;
  for (const order of orders) {
    const { driverEarnings, tipAmount, payoutStatus } = calcOrderEarnings(order);
    totalEarned += driverEarnings;
    totalTips   += tipAmount;
    if (payoutStatus === 'paid_manually') paidCount++;
    else pendingCount++;
  }
  return { totalEarned, totalTips, pendingCount, paidCount };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatMoney(amount: number): string {
  return `JMD ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function orderRef(order: CompletedOrder): string {
  if (order.order_number) return `#${order.order_number}`;
  return `#${order.id.slice(0, 8).toUpperCase()}`;
}

export function orderTypeLabel(order: CompletedOrder): string {
  const type = (order.order_type ?? order.service_type ?? '').toLowerCase();
  const labels: Record<string, string> = {
    ride: 'Ride', food: 'Food', grocery: 'Grocery', package: 'Package',
    send_it: 'Courier', store: 'Store', errand: 'Errand', gas: 'Gas',
    water_refill: 'Water', delivery_food: 'Food', delivery_grocery: 'Grocery',
    delivery_package: 'Package', store_order: 'Store', cooking_gas: 'Gas',
  };
  return labels[type] ?? (type ? type.replace(/_/g, ' ') : 'Job');
}
