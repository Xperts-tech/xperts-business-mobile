import { supabase } from '@/lib/supabase';

// Per-business analytics — mobile. Mirrors the web businessAnalyticsService: all
// reads go through the can_access_business-gated P5 RPCs, so aggregation stays
// server-side and a business only ever sees its own numbers (no cross-tenant
// leakage, no client-side order scanning).

function range(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from_ts: from.toISOString(), to_ts: to.toISOString() };
}

export interface AnalyticsSummary {
  total_orders: number;
  paid_orders: number;
  revenue: number;
  conversion_rate: number;
  unique_customers: number;
  repeat_customers: number;
  repeat_rate: number;
  total_views: number;
  unique_visitors: number;
  view_to_order_rate: number | null;
}

export interface TopProduct { name: string; qty: number; revenue: number }
export interface TopLocation { location: string; orders: number }

export interface GrowthScore {
  score: number;
  components: Record<string, number>;
  signals: Record<string, unknown>;
}

export async function getAnalyticsSummary(businessId: string, days = 30): Promise<AnalyticsSummary | null> {
  if (!businessId) return null;
  const { from_ts, to_ts } = range(days);
  const { data, error } = await supabase.rpc('business_analytics_summary', { bid: businessId, from_ts, to_ts });
  if (error || !data || (data as { error?: string }).error) return null;
  return data as AnalyticsSummary;
}

export async function getTopProducts(businessId: string, days = 30, lim = 5): Promise<TopProduct[]> {
  if (!businessId) return [];
  const { from_ts, to_ts } = range(days);
  const { data } = await supabase.rpc('business_top_products', { bid: businessId, from_ts, to_ts, lim });
  return ((data as Array<{ name: string; qty: number; revenue: number }>) ?? []).map((r) => ({
    name: r.name, qty: Number(r.qty), revenue: Number(r.revenue),
  }));
}

export async function getTopLocations(businessId: string, days = 30, lim = 5): Promise<TopLocation[]> {
  if (!businessId) return [];
  const { from_ts, to_ts } = range(days);
  const { data } = await supabase.rpc('business_top_locations', { bid: businessId, from_ts, to_ts, lim });
  return ((data as Array<{ location: string; orders: number }>) ?? []).map((r) => ({
    location: r.location, orders: Number(r.orders),
  }));
}

export async function getGrowthScore(businessId: string): Promise<GrowthScore | null> {
  if (!businessId) return null;
  const { data, error } = await supabase.rpc('business_growth_score', { bid: businessId });
  if (error || !data || (data as { error?: string }).error) return null;
  return data as GrowthScore;
}
