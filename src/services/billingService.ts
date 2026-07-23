import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';

// Mobile is a billing-data CONSUMER only. It reads the current subscription +
// coin wallet (see coinsService) and can spend coins, but ALL purchases and
// upgrades happen on the web billing portal — the single source of truth. This
// keeps the app compliant with Apple App Store policy (no in-app digital
// purchase) while wallet/subscription state stays synced through Supabase.

// Web billing portal (env-overridable; defaults to the prod domain / plan page).
export const BILLING_PORTAL_URL =
  process.env.EXPO_PUBLIC_BILLING_URL ?? 'https://xpertsxpress.com/business/plan';

export async function openBillingPortal(): Promise<void> {
  try { await Linking.openURL(BILLING_PORTAL_URL); } catch { /* no-op */ }
}

// Display labels for the plan keys (mirror of web config/growthPlans.js).
export const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  growth_pro: 'Growth Pro',
  growth_premium: 'Growth Premium',
};

export function planLabel(planKey: string | null | undefined): string {
  if (!planKey) return 'Free';
  return PLAN_LABELS[planKey] ?? planKey.replace(/_/g, ' ');
}

export interface BusinessSubscription {
  id: string;
  plan_key: string;
  status: string;
  provider: string | null;
  billing_next_at: string | null;
}

/** Read the business's active subscription (view-only). Null → on the Free plan. */
export async function getSubscription(businessId: string): Promise<BusinessSubscription | null> {
  if (!businessId) return null;
  const { data } = await supabase
    .from('business_subscriptions')
    .select('id, plan_key, status, provider, billing_next_at')
    .eq('business_id', businessId)
    .in('status', ['trialing', 'active', 'past_due'])
    .maybeSingle();
  return (data as BusinessSubscription | null) ?? null;
}
