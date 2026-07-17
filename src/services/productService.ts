import { supabase } from '@/lib/supabase';
import type { Product, ProductAvailabilityFilter } from '@/types/products';

const PAGE_SIZE = 30;

// ── List ──────────────────────────────────────────────────────────────────────

export async function loadProducts(
  storeId: string,
  filter: ProductAvailabilityFilter = 'all',
  page = 0,
): Promise<{ products: Product[]; hasMore: boolean; error: string | null }> {
  let query = supabase
    .from('products')
    .select(
      'id, store_id, name, description, price, is_available, category, image_url, photo_url, sort_order, metadata, created_at, updated_at',
    )
    .eq('store_id', storeId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (filter === 'available') {
    // available = is_available IS NULL OR is_available = true
    query = query.not('is_available', 'eq', false);
  } else if (filter === 'sold_out') {
    query = query.eq('is_available', false);
  }

  const { data, error } = await query;
  if (error) return { products: [], hasMore: false, error: error.message };

  const rows = (data ?? []) as Product[];
  return {
    products: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
    error: null,
  };
}

// ── Toggle sold-out ───────────────────────────────────────────────────────────

export async function toggleProductAvailability(
  productId: string,
  isAvailable: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('products')
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('id', productId);

  return { error: error?.message ?? null };
}

// ── Bulk availability (whole store) ───────────────────────────────────────────
// One update for the entire store catalogue — used for "open/close" style actions
// (e.g. mark everything sold out at end of day, or all available at store open).

export async function bulkSetStoreAvailability(
  storeId: string,
  isAvailable: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('products')
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq('store_id', storeId);

  return { error: error?.message ?? null };
}

// ── Quick edit ────────────────────────────────────────────────────────────────

export type QuickEditFields = {
  name?: string;
  description?: string;
  price?: number;
};

export async function quickEditProduct(
  productId: string,
  fields: QuickEditFields,
): Promise<{ error: string | null }> {
  if (Object.keys(fields).length === 0) return { error: null };

  const { error } = await supabase
    .from('products')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', productId);

  return { error: error?.message ?? null };
}

export { PAGE_SIZE as PRODUCTS_PAGE_SIZE };
