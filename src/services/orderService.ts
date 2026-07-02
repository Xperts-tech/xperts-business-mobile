import { supabase } from '@/lib/supabase';
import type { Order, OrderItem, OrderCustomer, OrderStatusAction, ORDER_ACTION_TO_STATUS } from '@/types/orders';
import { ORDER_ACTION_TO_STATUS as ACTION_MAP } from '@/types/orders';

const PAGE_SIZE = 20;

export type OrderFilter = 'all' | 'needs_action' | 'active' | 'done';

const NEEDS_ACTION_STATUSES = ['pending', 'accepted', 'preparing', 'ready'];

const ACTIVE_STATUSES = [
  'pending', 'accepted', 'accepted_by_driver', 'preparing', 'ready',
  'assigned', 'assigned_to_driver', 'en_route_to_pickup', 'arrived_at_pickup',
  'in_progress', 'picked_up', 'on_the_way', 'en_route_to_dropoff',
];

const DONE_STATUSES = ['delivered', 'completed', 'cancelled', 'rejected'];

// ── List ──────────────────────────────────────────────────────────────────────

export async function loadOrders(
  storeId: string,
  filter: OrderFilter = 'all',
  page = 0,
): Promise<{ orders: Order[]; hasMore: boolean; error: string | null }> {
  let query = supabase
    .from('orders')
    .select(
      'id, store_id, status, created_at, updated_at, metadata, total_amount, order_number, customer_id, special_instructions',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (filter === 'needs_action') {
    query = query.in('status', NEEDS_ACTION_STATUSES);
  } else if (filter === 'active') {
    query = query.in('status', ACTIVE_STATUSES);
  } else if (filter === 'done') {
    query = query.in('status', DONE_STATUSES);
  }

  const { data, error } = await query;
  if (error) return { orders: [], hasMore: false, error: error.message };

  const rows = (data ?? []) as Order[];
  return {
    orders: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
    error: null,
  };
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function loadOrderDetail(
  orderId: string,
): Promise<{ order: Order | null; error: string | null }> {
  const [orderRes, itemsRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, store_id, status, created_at, updated_at, metadata, total_amount, subtotal, delivery_fee, order_number, customer_id, special_instructions',
      )
      .eq('id', orderId)
      .maybeSingle(),

    supabase
      .from('order_items')
      .select('id, order_id, product_id, name, item_name, quantity, unit_price, line_total, notes, metadata')
      .eq('order_id', orderId),
  ]);

  if (orderRes.error) return { order: null, error: orderRes.error.message };
  if (!orderRes.data) return { order: null, error: 'Order not found' };

  const order = orderRes.data as Order;
  order.items = (itemsRes.data ?? []) as OrderItem[];

  // Load customer profile if available
  if (order.customer_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, phone, email')
      .eq('id', order.customer_id)
      .maybeSingle();
    if (profile) order.customer = profile as OrderCustomer;
  }

  return { order, error: null };
}

// ── Status action ─────────────────────────────────────────────────────────────

const NOTIFY_EVENT: Record<string, string> = {
  accepted:   'order_accepted',
  rejected:   'order_rejected',
  preparing:  'order_preparing',
  ready:      'order_ready',
  // web backend statuses
  accepted_by_store: 'order_accepted',
  rejected_by_store: 'order_rejected',
  ready_for_pickup:  'order_ready',
};

export async function applyOrderAction(
  orderId: string,
  action: OrderStatusAction,
  notes?: string,
): Promise<{ error: string | null }> {
  const newStatus = ACTION_MAP[action];
  const { error } = await supabase
    .from('orders')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(notes ? { metadata: await buildActionMetadata(orderId, action, notes) } : {}),
    })
    .eq('id', orderId);

  if (error) return { error: error.message };

  // Fire-and-forget customer notification (matches web backend pattern)
  const notifyEvent = NOTIFY_EVENT[newStatus];
  if (notifyEvent) {
    supabase.functions
      .invoke('order-notify', { body: { order_id: orderId, event: notifyEvent } })
      .catch(() => {});
  }

  return { error: null };
}

async function buildActionMetadata(
  orderId: string,
  action: OrderStatusAction,
  notes: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('orders')
    .select('metadata')
    .eq('id', orderId)
    .maybeSingle();

  const existing = (data?.metadata as Record<string, unknown>) ?? {};
  return {
    ...existing,
    business_action_notes: { action, notes, at: new Date().toISOString() },
  };
}

// ── Item issue resolve ────────────────────────────────────────────────────────
// Routes through business-flag-order-item edge function (matches web backend).
// orderItemId is the order_items.id (not a product_id).

export async function resolveItemIssue(
  orderId: string,
  orderItemId: string,
  _resolution: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('business-flag-order-item', {
    body: { action: 'clear_issue', order_id: orderId, order_item_id: orderItemId },
  });

  if (error) {
    let detail = error.message;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = typeof (error as any).context?.json === 'function'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (error as any).context.json()
        : null;
      if (b?.error) detail = b.error;
    } catch { /* ignore */ }
    return { error: detail };
  }

  if (data && data.success === false) {
    return { error: data.error || 'Failed to clear item issue' };
  }

  return { error: null };
}

// ── Thread lookup for an order ────────────────────────────────────────────────

export async function loadOrderThread(
  orderId: string,
): Promise<{ threadId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('order_message_threads')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) return { threadId: null, error: error.message };
  return { threadId: data?.id ?? null, error: null };
}

export { PAGE_SIZE };
