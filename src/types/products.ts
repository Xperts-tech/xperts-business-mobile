export interface Product {
  id: string;
  store_id: string;
  name: string;
  description?: string | null;
  price: number;
  sale_price?: number | null;
  is_available?: boolean | null;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  category?: string | null;
  category_id?: string | null;
  images?: string[] | null;
  image_url?: string | null;
  sort_order?: number | null;
  sold_out_status?: 'available' | 'sold_out_today' | 'sold_out_until' | 'hidden' | null;
  sold_out_until?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
}

export type MenuSpecialStatus = 'scheduled' | 'active' | 'paused' | 'sold_out' | 'expired' | 'archived';

export interface ProductSpecial {
  id: string;
  store_id: string;
  product_id?: string | null;
  name: string;
  description?: string | null;
  special_price?: number | null;
  image_url?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  quantity_total?: number | null;
  quantity_remaining?: number | null;
  status: MenuSpecialStatus;
  created_at: string;
}

export type ProductAvailabilityFilter = 'all' | 'available' | 'sold_out';

export function getProductImageUrl(product: Product): string | null {
  if (Array.isArray(product.images) && product.images.length > 0) {
    return product.images[0];
  }
  return product.image_url ?? null;
}

export function isProductAvailable(product: Product): boolean {
  // null / undefined = available (not explicitly marked sold out)
  return product.is_available !== false;
}

export function formatPrice(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  return `$${Number(amount).toFixed(2)}`;
}
