import { supabase } from '@/lib/supabase';

// Business self-serve marketplace placements — mobile. Mirrors the web
// placementPurchaseService against the same SECURITY DEFINER RPCs (server sets
// the authoritative price + drives the state machine). Reads use the business
// SELECT RLS policy on paid_placements. Payment is atomic, server-side (coins).

export interface PlacementCatalogItem {
  type: string;
  label: string;
  price: number; // Growth Coins
  days: number;
  blurb: string;
  premium?: boolean;
  needsLocation?: boolean;
  needsCategory?: boolean;
  needsProduct?: boolean;
}

// Keep in sync with the web config/placementCatalog.js — the server re-validates
// the price in request_paid_placement, so this is display + convenience only.
export const PLACEMENT_CATALOG: PlacementCatalogItem[] = [
  { type: 'featured_store', label: 'Featured Store', price: 25, days: 7, blurb: 'Your store appears in the Featured strip on the marketplace home & store list.' },
  { type: 'featured_product', label: 'Featured Product', price: 20, days: 7, blurb: 'Spotlight one product in the featured carousel.', needsProduct: true },
  { type: 'sponsored_category', label: 'Category Boost', price: 30, days: 7, blurb: 'Rank at the top of a category customers are browsing.', needsCategory: true },
  { type: 'deal_banner', label: 'Deal Banner', price: 40, days: 5, blurb: 'A promotional banner for a limited-time deal.' },
  { type: 'local_area_promotion', label: 'Local Area Promotion', price: 35, days: 7, blurb: 'Reach customers in a specific parish or area.', needsLocation: true },
  { type: 'homepage_banner', label: 'Homepage Banner', price: 60, days: 5, premium: true, blurb: 'Premium top-of-homepage banner placement.' },
];

export function getPlacement(type: string): PlacementCatalogItem | null {
  return PLACEMENT_CATALOG.find((p) => p.type === type) ?? null;
}

export interface Placement {
  id: string;
  placement_type: string;
  title: string;
  status: string;
  payment_status: string;
  price_amount: number;
  start_at: string | null;
  end_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getCoinBalance(businessId: string): Promise<number> {
  if (!businessId) return 0;
  const { data } = await supabase
    .from('business_coins')
    .select('balance')
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as { balance?: number } | null)?.balance ?? 0;
}

export async function listMyPlacements(businessId: string): Promise<Placement[]> {
  if (!businessId) return [];
  const { data } = await supabase
    .from('paid_placements')
    .select('id, placement_type, title, status, payment_status, price_amount, start_at, end_at, metadata, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as Placement[]) ?? [];
}

export interface PlacementRequestInput {
  type: string;
  title?: string;
  storeId?: string | null;
  targetLocation?: string | null;
  targetCategory?: string | null;
}

/** Create a placement request (server sets the price from the catalog type). */
export async function requestPlacement(
  businessId: string,
  input: PlacementRequestInput,
): Promise<{ ok: boolean; placementId?: string; reason?: string }> {
  const cat = getPlacement(input.type);
  if (!businessId || !cat) return { ok: false, reason: 'invalid_type' };
  const { data, error } = await supabase.rpc('request_paid_placement', {
    bid: businessId,
    p_type: input.type,
    p_title: input.title?.trim() || cat.label,
    p_description: null,
    p_store_id: input.storeId ?? null,
    p_product_id: null,
    p_target_location: cat.needsLocation ? (input.targetLocation ?? null) : null,
    p_target_category: cat.needsCategory ? (input.targetCategory ?? null) : null,
    p_creative_image_url: null,
    p_call_to_action: null,
    p_destination_url: null,
    p_price: cat.price,
    p_days: cat.days,
  });
  if (error) return { ok: false, reason: error.message };
  if (!(data as { ok?: boolean })?.ok) return { ok: false, reason: (data as { reason?: string })?.reason ?? 'request_failed' };
  return { ok: true, placementId: (data as { placement_id?: string }).placement_id };
}

/** Pay for a placement with Growth Coins (atomic, server-side). */
export async function payPlacementWithCoins(
  placementId: string,
): Promise<{ ok: boolean; reason?: string; balance?: number }> {
  const { data, error } = await supabase.rpc('pay_placement_with_coins', { placement_id: placementId });
  if (error) return { ok: false, reason: error.message };
  const res = data as { ok?: boolean; reason?: string; balance?: number };
  if (!res?.ok) return { ok: false, reason: res?.reason ?? 'pay_failed', balance: res?.balance };
  return { ok: true, balance: res.balance };
}
