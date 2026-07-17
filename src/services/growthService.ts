import { supabase } from '@/lib/supabase';
import type { Store } from '@/types/business';

// Data-driven Growth Studio recommendations, computed from the store's real
// catalogue + recent orders. No fabricated metrics — every recommendation maps
// to a concrete fact (missing photos, sold-out items, no orders, repeat customers…).

export type RecoScreen =
  | 'UploadStudio'
  | 'Products'
  | 'StoreProfile'
  | 'PromoRequests'
  | 'StoreQRCode';

export interface GrowthRecommendation {
  id: string;
  icon: string; // Ionicons name; screen casts to glyph type
  title: string;
  body: string;
  screen?: RecoScreen;
  tone: 'action' | 'positive';
}

export interface GrowthInsights {
  recommendations: GrowthRecommendation[];
  productCount: number;
  missingPhotos: number;
  soldOut: number;
  ordersLast30: number;
  repeatCustomers: number;
  error: string | null;
}

export async function loadGrowthInsights(params: {
  storeId: string;
  businessId: string;
  store: Store | null;
}): Promise<GrowthInsights> {
  const { storeId, businessId, store } = params;
  const empty: GrowthInsights = {
    recommendations: [], productCount: 0, missingPhotos: 0, soldOut: 0,
    ordersLast30: 0, repeatCustomers: 0, error: null,
  };

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [productsRes, ordersRes] = await Promise.all([
    supabase.from('products').select('id, image_url, photo_url, is_available').eq('store_id', storeId),
    supabase.from('orders').select('customer_id, created_at').eq('business_id', businessId).gte('created_at', since30.toISOString()),
  ]);

  if (productsRes.error) return { ...empty, error: productsRes.error.message };

  const products = (productsRes.data ?? []) as Array<{
    image_url: string | null; photo_url: string | null; is_available: boolean | null;
  }>;
  const productCount = products.length;
  const missingPhotos = products.filter((p) => !p.image_url && !p.photo_url).length;
  const soldOut = products.filter((p) => p.is_available === false).length;

  const orders = (ordersRes.data ?? []) as Array<{ customer_id: string | null }>;
  const ordersLast30 = orders.length;
  const counts: Record<string, number> = {};
  for (const o of orders) {
    if (o.customer_id) counts[o.customer_id] = (counts[o.customer_id] ?? 0) + 1;
  }
  const repeatCustomers = Object.values(counts).filter((n) => n >= 2).length;

  const recs: GrowthRecommendation[] = [];

  if (missingPhotos > 0) {
    recs.push({
      id: 'photos', icon: 'image-outline', tone: 'action', screen: 'UploadStudio',
      title: `Add photos to ${missingPhotos} product${missingPhotos > 1 ? 's' : ''}`,
      body: 'Products with photos get noticeably more orders. Upload Studio makes it quick.',
    });
  }
  if (productCount < 5) {
    recs.push({
      id: 'catalog', icon: 'add-circle-outline', tone: 'action', screen: 'UploadStudio',
      title: 'Add more products',
      body: `You have ${productCount} product${productCount === 1 ? '' : 's'}. A fuller menu converts better.`,
    });
  }
  if (soldOut > 0) {
    recs.push({
      id: 'restock', icon: 'refresh-outline', tone: 'action', screen: 'Products',
      title: `${soldOut} item${soldOut > 1 ? 's' : ''} marked sold out`,
      body: 'Restock or re-enable them so customers can order again.',
    });
  }
  if (store && !store.description) {
    recs.push({
      id: 'desc', icon: 'document-text-outline', tone: 'action', screen: 'StoreProfile',
      title: 'Add a store description',
      body: 'Tell customers what makes your store special.',
    });
  }
  if (store && !store.cover_url) {
    recs.push({
      id: 'cover', icon: 'image-outline', tone: 'action', screen: 'StoreProfile',
      title: 'Add a cover photo',
      body: 'A cover photo helps your store stand out in the app.',
    });
  }
  if (ordersLast30 === 0) {
    recs.push({
      id: 'firstorders', icon: 'qr-code-outline', tone: 'action', screen: 'StoreQRCode',
      title: 'Share your store QR code',
      body: 'Put your QR on receipts, flyers and WhatsApp to bring in your first orders.',
    });
  }
  if (repeatCustomers > 0) {
    recs.push({
      id: 'loyal', icon: 'heart-outline', tone: 'positive', screen: 'PromoRequests',
      title: `Reward your ${repeatCustomers} repeat customer${repeatCustomers > 1 ? 's' : ''}`,
      body: 'Run a loyalty promo to keep them coming back.',
    });
  }
  if (ordersLast30 >= 5 && missingPhotos === 0) {
    recs.push({
      id: 'promote', icon: 'megaphone-outline', tone: 'positive', screen: 'PromoRequests',
      title: 'Promote your store',
      body: 'Business is moving — a featured listing or campaign can push it further.',
    });
  }

  return { recommendations: recs, productCount, missingPhotos, soldOut, ordersLast30, repeatCustomers, error: null };
}
