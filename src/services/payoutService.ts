import { supabase } from '@/lib/supabase';

// Business payout / earnings view. Mirrors the web canonical
// (businessService.getBusinessPayoutSummary): derived from completed/delivered
// orders, NOT from order_finance_settlements (that table is per-order settlement
// data keyed by order_id, with no store_id/period/amount columns — the previous
// query here referenced columns that don't exist and always errored).

export interface EarningOrder {
  id: string;
  order_number: string | null;
  status: string;
  created_at: string;
  amount: number; // gross completed order value
}

export interface PayoutSummary {
  orders: EarningOrder[];
  monthLabel: string;
  monthSales: number;
  monthOrderCount: number;
  windowSales: number; // total across the fetched window (recent completed orders)
  error: string | null;
}

const COMPLETED_STATUSES = ['completed', 'delivered'];

function grossOf(o: {
  final_price?: number | null;
  price_estimate?: number | null;
  total_amount?: number | null;
}): number {
  return Number(o.final_price ?? o.price_estimate ?? o.total_amount ?? 0) || 0;
}

export async function loadPayoutSummary(storeId: string): Promise<PayoutSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, created_at, final_price, price_estimate, total_amount')
    .eq('store_id', storeId)
    .in('status', COMPLETED_STATUSES)
    .order('created_at', { ascending: false })
    .limit(90);

  const empty: PayoutSummary = {
    orders: [], monthLabel, monthSales: 0, monthOrderCount: 0, windowSales: 0, error: null,
  };

  if (error) return { ...empty, error: error.message };

  const rows: EarningOrder[] = (data ?? []).map((o) => ({
    id: o.id as string,
    order_number: (o.order_number ?? null) as string | null,
    status: o.status as string,
    created_at: o.created_at as string,
    amount: grossOf(o),
  }));

  const monthRows = rows.filter((r) => new Date(r.created_at) >= monthStart);

  return {
    orders: rows,
    monthLabel,
    monthSales: monthRows.reduce((s, r) => s + r.amount, 0),
    monthOrderCount: monthRows.length,
    windowSales: rows.reduce((s, r) => s + r.amount, 0),
    error: null,
  };
}

export function formatMoney(amount: number): string {
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
