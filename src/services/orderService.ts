import { supabase } from '@/lib/supabase';
import type { Order, OrderItem, OrderCustomer, OrderStatusAction } from '@/types/orders';
import {
  ORDER_ACTION_TO_MERCHANT_STAGE,
  MERCHANT_TO_ORDER_STATUS,
  MERCHANT_NOTIFY_EVENT,
  ALLOWED_ORDER_STATUSES,
} from '@/types/orders';

const PAGE_SIZE = 20;

export type OrderFilter = 'all' | 'needs_action' | 'active' | 'done';

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
      'id, store_id, status, merchant_status, created_at, updated_at, metadata, total_amount, order_number, customer_id, special_instructions',
    )
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (filter === 'needs_action') {
    // Store still owes an action: pending, or actively accepted/preparing.
    // (ready_for_pickup = waiting on the driver, not the store.)
    query = query.or(
      'status.eq.pending,merchant_status.in.(accepted_by_store,preparing)',
    );
  } else if (filter === 'active') {
    // Any non-terminal order (rejected_by_store maps to status='rejected').
    query = query.not('status', 'in', `(${DONE_STATUSES.join(',')})`);
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
        'id, store_id, status, merchant_status, created_at, updated_at, metadata, total_amount, subtotal, delivery_fee, order_number, customer_id, special_instructions',
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
// Mirrors web businessService.updateBusinessOrderStatus: writes the business
// stage to orders.merchant_status, maps it to a constraint-safe orders.status,
// records a timeline event, and fires the correct customer notify event.
// (Writing status='preparing'/'ready' directly violates orders_status_check.)

export async function applyOrderAction(
  orderId: string,
  action: OrderStatusAction,
  notes?: string,
): Promise<{ error: string | null }> {
  const stage = ORDER_ACTION_TO_MERCHANT_STAGE[action];
  const mappedStatus = MERCHANT_TO_ORDER_STATUS[stage];
  const safeStatus = ALLOWED_ORDER_STATUSES.has(mappedStatus) ? mappedStatus : null;

  const updatePayload: Record<string, unknown> = {
    merchant_status: stage,
    updated_at: new Date().toISOString(),
  };
  if (safeStatus) updatePayload.status = safeStatus;
  if (notes) updatePayload.notes = notes;

  const { error } = await supabase.from('orders').update(updatePayload).eq('id', orderId);
  if (error) return { error: error.message };

  // Timeline event — non-fatal (mirrors web audit trail)
  void supabase
    .from('order_timeline_events')
    .insert({
      order_id: orderId,
      event_type: 'merchant_status',
      title: `Store status: ${stage}`,
      description: notes || `Store updated this order to ${stage}.`,
      metadata: { merchant_stage: stage, db_status: safeStatus, source: 'business_mobile' },
    })
    .then(undefined, () => {});

  // Fire-and-forget customer notification (correct event vocabulary)
  const notifyEvent = MERCHANT_NOTIFY_EVENT[stage];
  if (notifyEvent) {
    supabase.functions
      .invoke('order-notify', { body: { order_id: orderId, event: notifyEvent } })
      .catch(() => {});
  }

  return { error: null };
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
