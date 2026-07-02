import { supabase } from '@/lib/supabase';

export interface CoinWallet {
  id: string;
  business_id: string;
  balance: number;
  lifetime_earned: number;
  updated_at: string;
}

export interface CoinLedgerEntry {
  id: string;
  business_id: string;
  amount: number;
  reason: string;
  feature_key: string | null;
  related_request_id: string | null;
  related_shop_order_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function getMyCoinWallet(
  businessId: string,
): Promise<{ wallet: CoinWallet | null; error: string | null }> {
  const { data, error } = await supabase
    .from('business_coins')
    .select('id, business_id, balance, lifetime_earned, updated_at')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) return { wallet: null, error: error.message };
  return { wallet: data as CoinWallet | null, error: null };
}

export async function listMyCoinLedger(
  businessId: string,
): Promise<{ entries: CoinLedgerEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from('business_coin_ledger')
    .select('id, business_id, amount, reason, feature_key, related_request_id, related_shop_order_id, metadata, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []) as CoinLedgerEntry[], error: null };
}
