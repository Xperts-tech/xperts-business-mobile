import { supabase } from '@/lib/supabase';
import type { ActiveOrder } from '@/types/order';
import type { ChatDecision, ChatMessage, Conversation } from '@/types/messaging';

// ── Order / channel detection ─────────────────────────────────────────────────

/** True when the order was created through the WhatsApp ordering channel. */
export function isWhatsAppOrder(order: ActiveOrder | null | undefined): boolean {
  const meta = order?.metadata ?? {};
  return (
    meta.source === 'whatsapp' ||
    meta.channel === 'whatsapp' ||
    meta.order_source === 'whatsapp'
  );
}

/**
 * True when the customer has a verified app account linked to this order.
 * Best available V1 signal: orders.customer_id is set.
 */
export function customerHasAppAccount(order: ActiveOrder | null | undefined): boolean {
  return Boolean(order?.customer_id);
}

/**
 * Decides which communication channel is primary for this order.
 * This is the single source of truth — called by both ActiveOrderScreen
 * and (future) Batch E escalation helpers.
 */
export function getChatDecision(order: ActiveOrder | null | undefined): ChatDecision {
  if (isWhatsAppOrder(order)) {
    return {
      showInAppChat: false,
      showWhatsApp: true,
      waIsPrimary: true,
      reason: 'WhatsApp order — customer prefers WhatsApp',
    };
  }
  if (!customerHasAppAccount(order)) {
    return {
      showInAppChat: false,
      showWhatsApp: true,
      waIsPrimary: true,
      reason: 'No customer app account — use WhatsApp or call',
    };
  }
  return {
    showInAppChat: true,
    showWhatsApp: true,   // always available as fallback if phone exists
    waIsPrimary: false,
    reason: 'App order with customer account — in-app chat is primary',
  };
}

// ── Conversation helpers ──────────────────────────────────────────────────────

/**
 * Finds an existing conversation for this order (RLS filters to ones where the
 * authenticated driver is a participant), or creates a new one.
 *
 * conversations.driver_id = drivers.id = driverRowId  (NOT auth.uid())
 * conversations.customer_id = orders.customer_id      (auth.uid() of the customer)
 */
export async function getOrCreateOrderConversation(
  orderId: string,
  driverRowId: string,
  customerId: string | null,
): Promise<{ conversation: Conversation | null; error: string | null }> {
  // Try to find an accessible existing conversation for this order.
  // RLS limits the result to conversations where the driver is a participant.
  const { data: existing, error: selectErr } = await supabase
    .from('conversations')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectErr) return { conversation: null, error: 'Unable to load conversation.' };
  if (existing) return { conversation: existing as Conversation, error: null };

  // Create new driver-initiated order conversation.
  const { data: created, error: insertErr } = await supabase
    .from('conversations')
    .insert({
      order_id: orderId,
      conversation_type: 'order',
      driver_id: driverRowId,
      customer_id: customerId,
      subject: 'Order conversation',
      status: 'open',
      last_message_at: new Date().toISOString(),
      metadata: { source: 'driver_mobile' },
    })
    .select('*')
    .single();

  if (insertErr) return { conversation: null, error: 'Unable to open conversation.' };
  return { conversation: created as Conversation, error: null };
}

// ── Message operations ────────────────────────────────────────────────────────

/** Fetches all messages for a conversation, oldest first. */
export async function getMessages(
  conversationId: string,
): Promise<{ messages: ChatMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return { messages: [], error: 'Unable to load messages.' };
  return { messages: (data ?? []) as ChatMessage[], error: null };
}

/**
 * Sends a message and optionally inserts a notification for the customer.
 *
 * messages.message is NOT NULL — we write the same text to both `message`
 * and `body` to satisfy the constraint and maintain parity with the web service.
 * messages.sender_id = auth.uid() = user.id (NOT driverRow.id)
 */
export async function sendMessage({
  conversationId,
  body,
  senderId,
  orderId,
  customerId,
}: {
  conversationId: string;
  body: string;
  senderId: string;
  orderId?: string | null;
  customerId?: string | null;
}): Promise<{ message: ChatMessage | null; error: string | null }> {
  const text = body.trim();
  if (!text) return { message: null, error: 'Message cannot be empty.' };

  const { data, error: insertErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      order_id: orderId ?? null,
      sender_id: senderId,
      message: text,   // NOT NULL column
      body: text,      // nullable column — kept in sync for web compatibility
      metadata: { source: 'driver_mobile' },
    })
    .select('*')
    .single();

  if (insertErr) {
    const m = insertErr.message.toLowerCase();
    if (m.includes('permission') || m.includes('policy'))
      return { message: null, error: 'Permission denied. You may not be part of this conversation.' };
    if (m.includes('network') || m.includes('fetch'))
      return { message: null, error: 'No connection. Message not sent.' };
    return { message: null, error: 'Could not send message. Try again.' };
  }

  // Update conversation's last_message_at (non-blocking)
  void supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Notify customer if they have an app account (non-blocking, best-effort)
  if (customerId && orderId) {
    void supabase.from('notifications').insert({
      user_id: customerId,
      recipient_user_id: customerId,
      title: 'Message from your driver',
      body: text.length > 100 ? `${text.slice(0, 97)}…` : text,
      notification_type: 'driver_message',
      related_conversation_id: conversationId,
      order_id: orderId,
      metadata: { source: 'driver_mobile', conversation_id: conversationId },
    });
  }

  return { message: data as ChatMessage, error: null };
}

/** Marks all unread messages in a conversation as read. */
export async function markMessagesRead(conversationId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .eq('is_read', false);
}

/** Returns unread message count for a conversation (driver's incoming messages). */
export async function getUnreadCount(
  conversationId: string,
  myUserId: string,
): Promise<number> {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('is_read', false)
    .neq('sender_id', myUserId);
  return count ?? 0;
}

// ── Realtime subscription ─────────────────────────────────────────────────────

/**
 * Subscribes to new messages in a conversation via Supabase Realtime.
 * conversations and messages must be in the supabase_realtime publication
 * (applied in migration 20260702010000_realtime_conversations_messages.sql).
 *
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(
  conversationId: string,
  onMessage: (msg: ChatMessage) => void,
): { unsubscribe: () => Promise<void> } {
  const channel = supabase
    .channel(`chat-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onMessage(payload.new as ChatMessage);
      },
    )
    .subscribe();

  return {
    unsubscribe: async () => { await supabase.removeChannel(channel); },
  };
}

// ── Message body helpers (for Batch E item/purchase templates) ────────────────

/** Builds a driver→customer replacement request message body. */
export function buildReplacementRequestBody(itemName: string): string {
  return `Hi! "${itemName}" is unavailable. Do you have a preferred replacement, or should I skip it?`;
}

/** Builds a driver→customer purchase over-limit message body. */
export function buildPurchaseApprovalBody(actualTotal: number, approvedLimit: number): string {
  const diff = (actualTotal - approvedLimit).toLocaleString();
  return `Hi! The store total is JMD ${actualTotal.toLocaleString()} — JMD ${diff} over your approved limit of JMD ${approvedLimit.toLocaleString()}. Do you approve the higher amount?`;
}
