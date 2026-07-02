import { supabase } from '@/lib/supabase';

export interface Payout {
  id: string;
  store_id?: string | null;
  business_id?: string | null;
  amount: number;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  period_start?: string | null;
  period_end?: string | null;
  paid_at?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export type PayoutSummary = {
  payouts: Payout[];
  totalPaid: number;
  totalPending: number;
  error: string | null;
};

export async function loadPayouts(storeId: string): Promise<PayoutSummary> {
  const { data, error } = await supabase
    .from('order_finance_settlements')
    .select(
      'id, store_id, business_id, amount, status, period_start, period_end, paid_at, created_at, metadata',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { payouts: [], totalPaid: 0, totalPending: 0, error: error.message };

  const payouts = (data ?? []) as Payout[];
  const totalPaid = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = payouts
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return { payouts, totalPaid, totalPending, error: null };
}

export function getPayoutStatusColor(status: Payout['status']): string {
  switch (status) {
    case 'paid': return '#16A34A';
    case 'processing': return '#0284C7';
    case 'pending': return '#D97706';
    case 'failed': return '#DC2626';
    default: return '#8FA3BA';
  }
}

export function getPayoutStatusLabel(status: Payout['status']): string {
  switch (status) {
    case 'paid': return 'Paid';
    case 'processing': return 'Processing';
    case 'pending': return 'Pending';
    case 'failed': return 'Failed';
    default: return status;
  }
}
