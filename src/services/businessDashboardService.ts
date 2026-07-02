import { supabase } from '@/lib/supabase';
import type { Store } from '@/types/business';

// Statuses that mean an order needs the store to act on it
const NEEDS_ACTION_STATUSES = ['pending', 'accepted', 'preparing', 'ready'];

// All non-terminal statuses (order is still in flight)
const ACTIVE_ORDER_STATUSES = [
  'pending', 'accepted', 'accepted_by_driver', 'preparing', 'ready',
  'assigned', 'assigned_to_driver', 'en_route_to_pickup',
  'arrived_at_pickup', 'in_progress', 'picked_up', 'on_the_way',
  'en_route_to_dropoff', 'delivered',
];

export type HomeDashboardData = {
  todayOrdersCount: number;
  activeOrdersCount: number;
  needsActionCount: number;
  itemIssuesCount: number;
  messageThreadsCount: number;
  productCount: number;
  setupReadiness: number;
};

export async function loadHomeDashboard(
  storeId: string,
  store: Store | null,
): Promise<HomeDashboardData> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // All queries in parallel — each handles its own error gracefully
  const [todayRes, activeRes, productRes] = await Promise.all([
    // Today's orders (head count only)
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .gte('created_at', todayStart.toISOString()),

    // Active orders with metadata (to derive item issues + needs-action)
    supabase
      .from('orders')
      .select('id, status, metadata')
      .eq('store_id', storeId)
      .in('status', ACTIVE_ORDER_STATUSES),

    // Product count
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId),
  ]);

  const activeOrders = (activeRes.data ?? []) as Array<{
    id: string;
    status: string;
    metadata: Record<string, unknown> | null;
  }>;
  const activeOrderIds = activeOrders.map((o) => o.id);

  // Count unresolved item issues from active order metadata
  const itemIssuesCount = activeOrders.filter((o) => {
    const issues = o.metadata?.item_issues as Record<string, unknown> | null;
    return issues?.has_unresolved === true;
  }).length;

  const needsActionCount = activeOrders.filter((o) =>
    NEEDS_ACTION_STATUSES.includes(o.status),
  ).length;

  // Count message threads for active orders
  let messageThreadsCount = 0;
  if (activeOrderIds.length > 0) {
    const { count } = await supabase
      .from('order_message_threads')
      .select('id', { count: 'exact', head: true })
      .in('order_id', activeOrderIds);
    messageThreadsCount = count ?? 0;
  }

  const productCount = productRes.count ?? 0;
  const setupReadiness = computeSetupReadiness(store, productCount);

  return {
    todayOrdersCount: todayRes.count ?? 0,
    activeOrdersCount: activeOrders.length,
    needsActionCount,
    itemIssuesCount,
    messageThreadsCount,
    productCount,
    setupReadiness,
  };
}

// ── Setup readiness (simplified for mobile home screen) ───────────────────────
// 5 items × 20 pts each = 100% when fully ready

function computeSetupReadiness(store: Store | null, productCount: number): number {
  if (!store) return 0;

  const meta = (store.metadata ?? {}) as Record<string, unknown>;
  let score = 0;

  // 1. Store profile exists (name + not deleted)
  if (store.name && !store.deleted_at) score += 20;

  // 2. Has products in catalog
  if (productCount > 0) score += 20;

  // 3. Opening hours configured
  const hours = meta.business_hours;
  if (hours && typeof hours === 'object' && Object.keys(hours as object).length > 0) score += 20;

  // 4. Submitted for Xperts review
  const submitted = meta.setup_review_requested === true;
  const nonDraft =
    typeof store.approval_status === 'string' &&
    store.approval_status !== 'draft' &&
    store.approval_status !== '';
  if (submitted || nonDraft) score += 20;

  // 5. Approved and live
  if (store.is_approved === true || store.approval_status === 'approved') score += 20;

  return Math.min(score, 100);
}
