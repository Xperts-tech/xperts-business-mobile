import { supabase } from '@/lib/supabase';
import type { ProductSpecial } from '@/types/products';

export async function loadSpecials(
  storeId: string,
): Promise<{ specials: ProductSpecial[]; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_specials')
    .select(
      'id, store_id, product_id, name, description, special_price, image_url, valid_from, valid_until, start_time, end_time, quantity_total, quantity_remaining, status, created_at',
    )
    .eq('store_id', storeId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) return { specials: [], error: error.message };
  return { specials: (data ?? []) as ProductSpecial[], error: null };
}

// Sets status to 'active' (isActive=true) or 'paused' (isActive=false).
export async function toggleSpecial(
  specialId: string,
  isActive: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('menu_specials')
    .update({ status: isActive ? 'active' : 'paused', updated_at: new Date().toISOString() })
    .eq('id', specialId);

  return { error: error?.message ?? null };
}
