import { supabase } from '@/lib/supabase';

export const SHOP_CATEGORIES = [
  { key: 'packaging_supply', label: 'Packaging Supplies', icon: '📦' },
  { key: 'office_supply',    label: 'Office Supplies',    icon: '📋' },
  { key: 'branded_supply',   label: 'Branded Supplies',   icon: '🎨' },
  { key: 'promo_kit',        label: 'Promo Kits',         icon: '🎁' },
  { key: 'free_giveaway',    label: 'Free Giveaways',     icon: '🎉' },
  { key: 'starter_kit',      label: 'Starter Kits',       icon: '🚀' },
] as const;

export type ShopCategoryKey = typeof SHOP_CATEGORIES[number]['key'];

export interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  category: ShopCategoryKey;
  price_jmd: number;
  coin_price: number | null;
  image_url: string | null;
  in_stock: boolean;
  is_free: boolean;
  requires_approval: boolean;
  max_per_order: number | null;
  sort_order: number;
}

export interface ShopOrderItem {
  product_id: string;
  name: string;
  price_jmd: number;
  quantity: number;
  is_free: boolean;
}

export interface ShopOrder {
  id: string;
  business_id: string;
  submitted_by: string;
  items: ShopOrderItem[];
  total_jmd: number;
  total_coins: number;
  status: string;
  payment_status: string;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PRODUCT_SELECT =
  'id, name, description, category, price_jmd, coin_price, image_url, in_stock, is_free, requires_approval, max_per_order, sort_order';

const ORDER_SELECT =
  'id, business_id, submitted_by, items, total_jmd, total_coins, status, payment_status, delivery_address, notes, created_at, updated_at';

export async function listShopProducts(): Promise<{ products: ShopProduct[]; error: string | null }> {
  const { data, error } = await supabase
    .from('xperts_shop_products')
    .select(PRODUCT_SELECT)
    .eq('in_stock', true)
    .order('sort_order', { ascending: true });
  if (error) return { products: [], error: error.message };
  return { products: (data ?? []) as ShopProduct[], error: null };
}

export async function listMyShopOrders(
  businessId: string,
): Promise<{ orders: ShopOrder[]; error: string | null }> {
  const { data, error } = await supabase
    .from('xperts_shop_orders')
    .select(ORDER_SELECT)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return { orders: [], error: error.message };
  return { orders: (data ?? []) as ShopOrder[], error: null };
}

export async function getShopOrderDetail(
  orderId: string,
): Promise<{ order: ShopOrder | null; error: string | null }> {
  const { data, error } = await supabase
    .from('xperts_shop_orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single();
  if (error) return { order: null, error: error.message };
  return { order: data as ShopOrder, error: null };
}

export async function placeShopOrder(params: {
  businessId: string;
  storeId: string | null;
  submittedBy: string;
  items: ShopOrderItem[];
  totalJmd: number;
  deliveryAddress: string;
  notes: string;
}): Promise<{ order: ShopOrder | null; error: string | null }> {
  const { data, error } = await supabase
    .from('xperts_shop_orders')
    .insert({
      business_id:      params.businessId,
      store_id:         params.storeId,
      submitted_by:     params.submittedBy,
      items:            params.items,
      total_jmd:        params.totalJmd,
      total_coins:      0,
      delivery_address: params.deliveryAddress.trim() || null,
      notes:            params.notes.trim() || null,
    })
    .select(ORDER_SELECT)
    .single();
  if (error) return { order: null, error: error.message };
  return { order: data as ShopOrder, error: null };
}

export function getOrderStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending:    '#0284C7',
    confirmed:  '#16A34A',
    processing: '#D97706',
    shipped:    '#7C3AED',
    delivered:  '#16A34A',
    cancelled:  '#DC2626',
  };
  return map[status] ?? '#64748B';
}

export function getOrderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending:    'Pending',
    confirmed:  'Confirmed',
    processing: 'Processing',
    shipped:    'Shipped',
    delivered:  'Delivered',
    cancelled:  'Cancelled',
  };
  return map[status] ?? status;
}

export function formatJmd(amount: number): string {
  return `JMD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
