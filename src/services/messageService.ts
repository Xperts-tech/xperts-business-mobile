import { supabase } from '@/lib/supabase';
import type { Message, MessageThread } from '@/types/orders';

// ── Thread list for a store (via order IDs) ───────────────────────────────────

export async function loadMessageThreads(
  storeId: string,
): Promise<{ threads: MessageThread[]; error: string | null }> {
  // Get recent non-terminal order IDs for this store
  const { data: orderRows, error: ordersErr } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('store_id', storeId)
    .not('status', 'in', '("cancelled","rejected")')
    .order('created_at', { ascending: false })
    .limit(100);

  if (ordersErr) return { threads: [], error: ordersErr.message };
  const orders = orderRows ?? [];
  if (orders.length === 0) return { threads: [], error: null };

  const orderIds = orders.map((o: { id: string }) => o.id);
  const orderMap = Object.fromEntries(
    orders.map((o: { id: string; order_number?: string | null; status: string }) => [
      o.id,
      { id: o.id, order_number: o.order_number ?? null, status: o.status, store_id: storeId },
    ]),
  );

  const { data: threadRows, error: threadsErr } = await supabase
    .from('order_message_threads')
    .select('id, order_id, created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: false });

  if (threadsErr) return { threads: [], error: threadsErr.message };

  const threads: MessageThread[] = ((threadRows ?? []) as MessageThread[]).map((t) => ({
    ...t,
    order: orderMap[t.order_id] ?? null,
  }));

  return { threads, error: null };
}

// ── Messages for an order ─────────────────────────────────────────────────────
// Queries by order_id (not thread_id) to match the web backend.
// Columns: sender_role + body (web schema), not sender_type + content.

export async function loadThreadMessages(
  orderId: string,
): Promise<{ messages: Message[]; error: string | null }> {
  const { data, error } = await supabase
    .from('order_messages')
    .select('id, order_id, sender_id, sender_role, sender_name, body, created_at, metadata')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return { messages: [], error: error.message };
  return { messages: (data ?? []) as Message[], error: null };
}

// ── Send message via edge function ─────────────────────────────────────────────
// Routes through business-send-order-message (triggers customer notification).

export async function sendMessage(
  orderId: string,
  body: string,
): Promise<{ error: string | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: 'Message cannot be empty' };

  const { data, error } = await supabase.functions.invoke('business-send-order-message', {
    body: { order_id: orderId, body: trimmed },
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
    return { error: data.error || 'Failed to send message' };
  }

  return { error: null };
}
