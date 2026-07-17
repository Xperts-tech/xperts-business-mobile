import { supabase } from '@/lib/supabase';
import type { Store } from '@/types/business';
import { buildOrderScopeOr, type OrderScope } from '@/lib/orderScope';

// Effective business stages (merchant_status ?? status) that still need the
// store to act. ready_for_pickup = waiting on the driver, not the store.
const NEEDS_ACTION_STAGES = ['pending', 'accepted_by_store', 'preparing'];

// Constraint-valid non-terminal statuses (order is still in flight). Merchant
// stages (preparing/ready_for_pickup) collapse to status='accepted' in the DB.
const ACTIVE_ORDER_STATUSES = [
  'pending', 'accepted', 'assigned', 'in_progress', 'picked_up', 'on_the_way',
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
  scope: OrderScope,
  store: Store | null,
): Promise<HomeDashboardData> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const scopeOr = buildOrderScopeOr(scope);
  const emptyDash: HomeDashboardData = {
    todayOrdersCount: 0, activeOrdersCount: 0, needsActionCount: 0,
    itemIssuesCount: 0, messageThreadsCount: 0, productCount: 0, setupReadiness: 0,
  };
  if (!scopeOr) return emptyDash;

  // All queries in parallel — each handles its own error gracefully.
  // Orders are scoped by business OR store (matches web); products are always
  // store-scoped (products belong to a store).
  const [todayRes, activeRes, productRes] = await Promise.all([
    // Today's orders (head count only)
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .or(scopeOr)
      .gte('created_at', todayStart.toISOString()),

    // Active orders with metadata (to derive item issues + needs-action)
    supabase
      .from('orders')
      .select('id, status, merchant_status, metadata')
      .or(scopeOr)
      .in('status', ACTIVE_ORDER_STATUSES),

    // Product count (store-scoped)
    scope.storeId
      ? supabase.from('products').select('id', { count: 'exact', head: true }).eq('store_id', scope.storeId)
      : Promise.resolve({ count: 0 } as { count: number }),
  ]);

  const activeOrders = (activeRes.data ?? []) as Array<{
    id: string;
    status: string;
    merchant_status: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  const activeOrderIds = activeOrders.map((o) => o.id);

  // Count unresolved item issues from active order metadata
  const itemIssuesCount = activeOrders.filter((o) => {
    const issues = o.metadata?.item_issues as Record<string, unknown> | null;
    return issues?.has_unresolved === true;
  }).length;

  const needsActionCount = activeOrders.filter((o) =>
    NEEDS_ACTION_STAGES.includes(o.merchant_status || o.status),
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
