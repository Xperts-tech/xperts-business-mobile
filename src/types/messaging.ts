export type Conversation = {
  id: string;
  order_id: string | null;
  conversation_type: string | null;
  customer_id: string | null;
  driver_id: string | null;
  business_id: string | null;
  provider_id: string | null;
  admin_id: string | null;
  subject: string | null;
  status: string | null;
  last_message_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string | null;
  order_id: string | null;
  sender_id: string | null;
  receiver_id: string | null;
  // messages.message is NOT NULL; messages.body is nullable but holds the same text.
  message: string;
  body: string | null;
  is_read: boolean | null;
  attachment_urls: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

// Which communication channel the driver should use for this order
export type ChatDecision = {
  showInAppChat: boolean;  // customer has an app account and this is not a WhatsApp-created order
  showWhatsApp: boolean;   // WA fallback is appropriate (WA order, no app account, or WA-only contact)
  waIsPrimary: boolean;    // WA is the *first* option rather than fallback
  reason: string;
};
